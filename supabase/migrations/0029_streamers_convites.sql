-- Streamers e convites: overlay do OBS, Twitch ligada ao perfil e convites com recompensa.
--
-- Tudo isto nasce fechado: só Owner e Dev veem e usam (como a loja), até um deles carregar em
-- "Abrir a toda a gente" em Staff › Divulgação (config.streamers_public).
--
--   * Overlay do OBS: cada jogador tem uma chave secreta na ligação do overlay. A página pública
--     lê overlay_dados(chave) (sem login) e mostra rank, o dia (vitórias, derrotas, pontos), se está
--     na fila ou em partida e a última partida. Nunca devolve o código do grupo.
--   * Twitch: o jogador liga o canal (OAuth, na Edge Function twitch-ligar). A Edge Function
--     twitch-sincronizar corre a cada minuto (pg_cron) e guarda quem está em direto; o site
--     mostra "AO VIVO" com um botão para abrir a live ao lado do jogador.
--   * Convites: cada jogador tem um código. Quem se regista pelo link e completa a primeira partida
--     a sério (nem simulada, nem automática) dá moedas aos dois; há bónus a cada 5 convidados
--     premiados e um limite de 20 recompensas por mês para o mesmo jogador que convida.
--
-- Corre depois de 0001 a 0028. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists streamers_public boolean not null default false;

/** Aberto a todos, ou só para Owner e Dev. */
create or replace function public._streamers_visivel(p public.profiles) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select streamers_public from config where id), false) or coalesce(p.role in ('owner', 'dev'), false)
$$;

create or replace function public.streamers_visivel() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select _streamers_visivel(p) from profiles p where p.auth_id = auth.uid()), false)
$$;

/** Para as Edge Functions (que usam a chave de serviço): este perfil pode usar a Twitch e o overlay? */
create or replace function public.streamers_pode(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select _streamers_visivel(p) from profiles p where p.id = p_perfil and not p.is_bot), false)
$$;

-- ---------------------------------------------------------------- overlay

create table if not exists public.overlay_chaves (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  chave text not null unique,
  criada_em timestamptz not null default now()
);
alter table public.overlay_chaves enable row level security;

create or replace function public._nova_chave() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
$$;

/** A ligação do overlay do próprio jogador: cria a chave na primeira vez. */
create or replace function public.meu_overlay() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v_chave text;
begin
  if not _streamers_visivel(me) then raise exception 'Esta área ainda não está aberta.'; end if;
  select chave into v_chave from overlay_chaves where profile_id = me.id;
  if v_chave is null then
    insert into overlay_chaves (profile_id, chave) values (me.id, _nova_chave()) on conflict (profile_id) do nothing;
    select chave into v_chave from overlay_chaves where profile_id = me.id;
  end if;
  return jsonb_build_object('chave', v_chave);
end $$;

/** Troca a chave: a ligação antiga deixa de funcionar (para quando alguém a partilhou sem querer). */
create or replace function public.renovar_overlay() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v_chave text := _nova_chave();
begin
  if not _streamers_visivel(me) then raise exception 'Esta área ainda não está aberta.'; end if;
  insert into overlay_chaves (profile_id, chave) values (me.id, v_chave)
  on conflict (profile_id) do update set chave = excluded.chave, criada_em = now();
  return jsonb_build_object('chave', v_chave);
end $$;

/**
 * O que o overlay mostra. Pública (sem login): quem tem a chave vê só isto, que já é público no
 * site (rank, pontos, resultados), mais se o jogador está na fila ou numa partida. Chave
 * inválida, ou dono sem acesso à área, devolve null e o overlay fica vazio.
 */
create or replace function public.overlay_dados(p_chave text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p profiles;
  v_inicio timestamptz := date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon';
  v_fila queue_entries;
  v_partida jsonb;
  v_ultima jsonb;
  v_hoje jsonb;
  v_estado text := 'livre';
  v_fila_json jsonb;
begin
  select pr.* into p from overlay_chaves k join profiles pr on pr.id = k.profile_id where k.chave = p_chave;
  if not found or not _streamers_visivel(p) then return null; end if;

  select jsonb_build_object(
    'vitorias', count(*) filter (where mp.team = m.winner),
    'derrotas', count(*) filter (where mp.team <> m.winner),
    'delta', coalesce(sum(mp.points_delta), 0)
  ) into v_hoje
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and mp.team is not null and m.state = 'COMPLETED' and not m.automatic and m.finished_at >= v_inicio;

  select jsonb_build_object(
    'estado', m.state, 'codigo', m.code, 'mapa', m.map, 'equipa', mp.team, 'comecouEm', m.started_at
  ) into v_partida
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and not m.automatic
    and m.state in ('READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'IN_PROGRESS', 'RESULT_SUBMISSION', 'PROCESSING_API')
  order by m.created_at desc limit 1;

  if v_partida is not null then
    v_estado := 'partida';
  else
    select * into v_fila from queue_entries where profile_id = p.id;
    if found then
      v_estado := 'fila';
      v_fila_json := jsonb_build_object(
        'contagem', (select count(*) from queue_entries where region = v_fila.region),
        'desde', v_fila.joined_at
      );
    end if;
  end if;

  select jsonb_build_object(
    'codigo', m.code, 'mapa', m.map, 'venceu', mp.team = m.winner,
    'rondasFeitas', case when mp.team = 'A' then m.score_a else m.score_b end,
    'rondasSofridas', case when mp.team = 'A' then m.score_b else m.score_a end,
    'delta', mp.points_delta, 'terminouEm', m.finished_at
  ) into v_ultima
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and mp.team is not null and m.state = 'COMPLETED' and not m.automatic
  order by m.finished_at desc nulls last limit 1;

  return jsonb_build_object(
    'nome', _nome(p), 'riotId', p.riot_id, 'avatarUrl', p.avatar_url,
    'tier', p.official_tier, 'rr', p.official_rr, 'pontos', p.points, 'vitorias', p.wins, 'derrotas', p.losses,
    'hoje', coalesce(v_hoje, jsonb_build_object('vitorias', 0, 'derrotas', 0, 'delta', 0)),
    'estado', v_estado, 'fila', v_fila_json, 'partida', v_partida, 'ultima', v_ultima,
    'twitch', (select t.login from twitch_contas t where t.profile_id = p.id),
    'codigoConvite', (select c.codigo from convite_codigos c where c.profile_id = p.id),
    'agora', now()
  );
end $$;

-- ---------------------------------------------------------------- Twitch

create table if not exists public.twitch_contas (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  twitch_id text not null unique,
  login text not null,
  nome text not null,
  ligada_em timestamptz not null default now(),
  ao_vivo boolean not null default false,
  live_titulo text,
  live_jogo text,
  live_espetadores int,
  live_desde timestamptz,
  verificada_em timestamptz
);
alter table public.twitch_contas enable row level security;

create or replace function public._twitch_json(t public.twitch_contas) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'login', t.login, 'nome', t.nome, 'ligadaEm', t.ligada_em,
    'aoVivo', t.ao_vivo and t.verificada_em > now() - interval '5 minutes',
    'titulo', t.live_titulo, 'jogo', t.live_jogo, 'espetadores', t.live_espetadores
  )
$$;

create or replace function public.minha_twitch() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := _eu();
  t twitch_contas;
begin
  if not _streamers_visivel(me) then return null; end if;
  select * into t from twitch_contas where profile_id = me.id;
  if not found then return null; end if;
  return _twitch_json(t);
end $$;

create or replace function public.desligar_twitch() returns void
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _eu();
begin
  delete from twitch_contas where profile_id = me.id;
end $$;

/** Quem está em direto agora (e com acesso à área): as lives que o site mostra ao lado dos jogadores. */
create or replace function public.streamers_ao_vivo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where auth_id = auth.uid();
  if not found or not _streamers_visivel(me) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'perfilId', p.id, 'utilizador', _nome(p), 'canal', t.login, 'nome', t.nome,
      'titulo', t.live_titulo, 'jogo', t.live_jogo, 'espetadores', t.live_espetadores, 'desde', t.live_desde
    ) order by t.live_espetadores desc nulls last, t.nome)
    from twitch_contas t join profiles p on p.id = t.profile_id
    where t.ao_vivo and t.verificada_em > now() - interval '5 minutes' and _streamers_visivel(p)
  ), '[]'::jsonb);
end $$;

/** Pede à Edge Function que veja na Twitch quem está em direto (só se houver contas ligadas). */
create or replace function public._twitch_sincronizar_pedir() returns void
language plpgsql volatile security definer set search_path = public as $$
declare c discord_config;
begin
  if not exists (select 1 from twitch_contas) then return; end if;
  select * into c from discord_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url := regexp_replace(c.url, '/[^/]*$', '/twitch-sincronizar'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rangify-segredo', c.segredo),
    timeout_milliseconds := 20000
  );
exception when others then
  raise warning 'Twitch: não foi possível pedir a sincronização: %', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rangify-twitch', '* * * * *', 'select public._twitch_sincronizar_pedir()');
exception when others then
  raise notice 'pg_cron indisponível: as lives da Twitch só atualizam quando a Edge Function twitch-sincronizar for chamada.';
end $$;

-- ---------------------------------------------------------------- convites

create table if not exists public.convite_codigos (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  codigo text not null unique,
  criado_em timestamptz not null default now()
);
alter table public.convite_codigos enable row level security;

create table if not exists public.convidados (
  convidado_id uuid primary key references public.profiles (id) on delete cascade,
  convidador_id uuid not null references public.profiles (id) on delete cascade,
  criado_em timestamptz not null default now(),
  premiado_em timestamptz,
  estado text not null default 'pendente' check (estado in ('pendente', 'premiado', 'limite')),
  moedas_convidador int not null default 0,
  moedas_convidado int not null default 0,
  check (convidado_id <> convidador_id)
);
create index if not exists convidados_convidador on public.convidados (convidador_id);
alter table public.convidados enable row level security;

-- As recompensas são movimentos de coins, como as compras.
alter table public.coin_ledger drop constraint if exists coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check check (reason in ('compra', 'devolucao', 'teste', 'convite'));

/** Os mesmos números estão em src/lib/convites.ts. */
create or replace function public._convite_valores() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'convidador', 150, 'convidado', 100, 'marcoACada', 5, 'bonusMarco', 300, 'limiteMes', 20, 'diasParaUsar', 7
  )
$$;

create or replace function public._convite_codigo(p_perfil uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v text;
  i int := 0;
begin
  select codigo into v from convite_codigos where profile_id = p_perfil;
  if v is not null then return v; end if;
  loop
    i := i + 1;
    v := upper(substr(md5(random()::text || clock_timestamp()::text || p_perfil::text), 1, 8));
    insert into convite_codigos (profile_id, codigo) values (p_perfil, v) on conflict do nothing;
    select codigo into v from convite_codigos where profile_id = p_perfil;
    if v is not null or i >= 10 then exit; end if;
  end loop;
  return v;
end $$;

create or replace function public.meu_convite() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v_codigo text;
begin
  if not _streamers_visivel(me) then raise exception 'Esta área ainda não está aberta.'; end if;
  v_codigo := _convite_codigo(me.id);
  return jsonb_build_object(
    'codigo', v_codigo,
    'valores', _convite_valores(),
    'convidados', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', p.id, 'utilizador', _nome(p), 'avatarUrl', p.avatar_url, 'estado', c.estado,
        'desde', c.criado_em, 'premiadoEm', c.premiado_em, 'moedas', c.moedas_convidador
      ) order by c.criado_em desc)
      from convidados c join profiles p on p.id = c.convidado_id where c.convidador_id = me.id
    ), '[]'::jsonb),
    'premiados', (select count(*) from convidados where convidador_id = me.id and estado = 'premiado'),
    'moedas', coalesce((select sum(moedas_convidador) from convidados where convidador_id = me.id), 0),
    'conviteDe', (select jsonb_build_object('utilizador', _nome(p), 'estado', c.estado, 'moedas', c.moedas_convidado)
                  from convidados c join profiles p on p.id = c.convidador_id where c.convidado_id = me.id)
  );
end $$;

/**
 * Quem acabou de criar a conta e veio por um link usa o código de quem o convidou. Só vale para contas
 * novas e sem partidas, e uma só vez. A recompensa vem quando joga a primeira partida a sério.
 */
create or replace function public.usar_convite(p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_convidador profiles;
  v jsonb := _convite_valores();
begin
  if exists (select 1 from convidados where convidado_id = me.id) then raise exception 'Já usaste um convite.'; end if;
  select p.* into v_convidador from convite_codigos c join profiles p on p.id = c.profile_id where c.codigo = v_codigo and not p.is_bot;
  if not found then raise exception 'Esse convite não existe.'; end if;
  if v_convidador.id = me.id then raise exception 'Não podes usar o teu próprio convite.'; end if;
  if me.created_at < now() - make_interval(days => (v->>'diasParaUsar')::int) or exists (select 1 from match_players where profile_id = me.id) then
    raise exception 'Os convites só valem para quem acabou de criar a conta e ainda não jogou.';
  end if;
  insert into convidados (convidado_id, convidador_id) values (me.id, v_convidador.id);
  return jsonb_build_object('convidador', _nome(v_convidador), 'moedas', (v->>'convidado')::int);
end $$;

/** Paga a recompensa de um convite pendente (os dois ganham coins). Respeita o limite mensal de quem convida. */
create or replace function public._premiar_convite(p_convidado uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  c convidados;
  v jsonb := _convite_valores();
  v_mes int;
  v_total int;
  v_premiados int;
begin
  select * into c from convidados where convidado_id = p_convidado and estado = 'pendente' for update;
  if not found then return; end if;
  select count(*) into v_mes from convidados
  where convidador_id = c.convidador_id and estado = 'premiado' and premiado_em > now() - interval '30 days';
  if v_mes >= (v->>'limiteMes')::int then
    update convidados set estado = 'limite', premiado_em = now() where convidado_id = p_convidado;
    return;
  end if;
  select count(*) + 1 into v_premiados from convidados where convidador_id = c.convidador_id and estado = 'premiado';
  v_total := (v->>'convidador')::int + case when v_premiados % (v->>'marcoACada')::int = 0 then (v->>'bonusMarco')::int else 0 end;
  insert into coin_ledger (profile_id, delta, reason) values (c.convidado_id, (v->>'convidado')::int, 'convite');
  insert into coin_ledger (profile_id, delta, reason) values (c.convidador_id, v_total, 'convite');
  update convidados set estado = 'premiado', premiado_em = now(), moedas_convidador = v_total, moedas_convidado = (v->>'convidado')::int
  where convidado_id = p_convidado;
end $$;

/** Uma partida a sério terminou: quem foi convidado e ainda não tinha dado a recompensa dá-a agora. */
create or replace function public._tg_convite_premiar() returns trigger
language plpgsql volatile security definer set search_path = public as $$
declare r record;
begin
  if new.simulated or new.automatic then return null; end if;
  for r in
    select c.convidado_id from convidados c
    join match_players mp on mp.profile_id = c.convidado_id and mp.match_id = new.id and mp.team is not null
    where c.estado = 'pendente'
  loop
    perform _premiar_convite(r.convidado_id);
  end loop;
  return null;
end $$;

drop trigger if exists convite_premiar on public.matches;
create trigger convite_premiar after update of state on public.matches
for each row when (new.state = 'COMPLETED' and old.state is distinct from 'COMPLETED')
execute function public._tg_convite_premiar();

/** As coins dos convites aparecem na conta das coins (a soma total já as conta pelo registo). */
create or replace function public._moedas_ganhas(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel int := ((_nivel(_xp(p_perfil)))->>'nivel')::int;
  v_diarias int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'daily');
  v_semanais int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'weekly');
  v_mvps int := (select count(*) from match_players mp join matches m on m.id = mp.match_id
                  where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic);
begin
  return jsonb_build_object(
    'nivel', v_nivel,
    'porNivel', 120 * greatest(0, v_nivel - 1),
    'porMarcos', 400 * (v_nivel / 5),
    'porDiarias', 15 * v_diarias,
    'porSemanais', 40 * v_semanais,
    'porMvp', 25 * v_mvps,
    -- Já está dentro da soma do registo de coins (_moedas); isto é só para o mostrar à parte.
    'porConvites', coalesce((select sum(delta) from coin_ledger where profile_id = p_perfil and reason = 'convite'), 0)
  );
end $$;

-- ---------------------------------------------------------------- staff

create or replace function public._divulgacao_estado() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'publico', coalesce((select streamers_public from config where id), false),
    'twitchLigadas', (select count(*) from twitch_contas),
    'aoVivo', (select count(*) from twitch_contas where ao_vivo and verificada_em > now() - interval '5 minutes'),
    'overlays', (select count(*) from overlay_chaves),
    'convidados', (select count(*) from convidados),
    'premiados', (select count(*) from convidados where estado = 'premiado'),
    'moedasDadas', coalesce((select sum(moedas_convidador + moedas_convidado) from convidados), 0),
    'top', coalesce((
      select jsonb_agg(x order by (x->>'premiados')::int desc, (x->>'convidados')::int desc)
      from (
        select jsonb_build_object('perfilId', p.id, 'utilizador', coalesce(split_part(p.riot_id, '#', 1), p.username), 'convidados', count(*), 'premiados', count(*) filter (where c.estado = 'premiado')) as x
        from convidados c join profiles p on p.id = c.convidador_id
        group by p.id, p.username, p.riot_id
        order by count(*) filter (where c.estado = 'premiado') desc, count(*) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  )
$$;

create or replace function public.divulgacao_estado() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir_staff();
  return _divulgacao_estado();
end $$;

create or replace function public.definir_streamers_publico(p_publico boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  update config set streamers_public = coalesce(p_publico, false), updated_at = now(), updated_by = me.id where id;
  return _divulgacao_estado();
end $$;

-- ---------------------------------------------------------------- permissões

revoke all on function
  public._streamers_visivel(profiles), public._nova_chave(), public._twitch_json(twitch_contas), public._twitch_sincronizar_pedir(),
  public._convite_valores(), public._convite_codigo(uuid), public._premiar_convite(uuid), public._tg_convite_premiar(),
  public._divulgacao_estado()
  from public, anon, authenticated;
revoke all on function public.streamers_pode(uuid) from public, anon, authenticated;
grant execute on function public.streamers_pode(uuid), public._twitch_sincronizar_pedir() to service_role;

revoke all on function
  public.streamers_visivel(), public.meu_overlay(), public.renovar_overlay(), public.minha_twitch(), public.desligar_twitch(),
  public.streamers_ao_vivo(), public.meu_convite(), public.usar_convite(text), public.divulgacao_estado(), public.definir_streamers_publico(boolean)
  from public, anon;
grant execute on function
  public.streamers_visivel(), public.meu_overlay(), public.renovar_overlay(), public.minha_twitch(), public.desligar_twitch(),
  public.streamers_ao_vivo(), public.meu_convite(), public.usar_convite(text), public.divulgacao_estado(), public.definir_streamers_publico(boolean)
  to authenticated;

revoke all on function public.overlay_dados(text) from public;
grant execute on function public.overlay_dados(text) to anon, authenticated;
