-- Margem de rondas nos pontos, votação para cancelar a partida e a fila no Discord.
--
-- * Margem de rondas: 13-11 e 13-1 já não valem o mesmo. Os pontos do resultado passam a ser
--     +-(20 + margem)   com   margem = arredondar((diferença de rondas - 6) / 2), entre -3 e +4
--   Por exemplo: 13-11 (diferença 2) = 18, 13-9 = 19, 13-5 = 21, 13-0 = 24 (a derrota é simétrica).
--   O desempenho (Rangify Score) soma-se a isto, de -6 a +6. O rank oficial continua a não contar.
-- * Cancelar: quem está numa partida pode votar para a cancelar enquanto o grupo está a ser criado
--   (e nos primeiros 10 minutos de jogo), se alguém não puder jogar ou tiver caído. Com a maioria
--   dos jogadores (6 de 10) a partida é cancelada, sem pontos nem castigos. Num teste com bots,
--   conta a maioria das pessoas.
-- * Fila no Discord: quando alguém entra ou sai da fila, a base de dados pede à função
--   discord-partida (tipo "fila") que atualize o texto da fila na mensagem do canal de ping.
--
-- Para acertar as partidas já jogadas com a margem: Staff › API › Recarregar todas.
--
-- Corre depois de 0001 a 0019. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- margem de rondas

/** Pontos pela margem: um por cada 2 rondas de diferença acima de 6 (entre -3 e +4). */
create or replace function public._margem(p_a int, p_b int) returns int
language sql immutable as $$
  select greatest(-3, least(4, (sign(x) * round(abs(x)))::int))
  from (select (abs(coalesce(p_a, 0) - coalesce(p_b, 0)) - 6) / 2.0 as x) t
$$;

/** Os pontos do resultado: vitória +20 ou derrota -20, com a margem de rondas (sem o desempenho). */
create or replace function public._pontos_partida(p_venceu boolean, p_a int, p_b int) returns int
language sql immutable as $$
  select case when p_venceu then 20 + _margem(p_a, p_b) else -(20 + _margem(p_a, p_b)) end
$$;

-- ---------------------------------------------------------------- votação para cancelar

create table if not exists public.match_cancel_votes (
  match_id uuid not null references public.matches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, profile_id)
);
alter table public.match_cancel_votes enable row level security;

/** A maioria das pessoas da partida (os bots não votam): 6 de 10; num teste com 1 pessoa, 1. */
create or replace function public._votos_necessarios(p_match uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, (count(*) / 2) + 1)::int
  from match_players mp join profiles p on p.id = mp.profile_id
  where mp.match_id = p_match and mp.team is not null and not p.is_bot
$$;

create or replace function public.votar_cancelar(p_match uuid, p_voto boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _eu();
  m matches;
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.automatic then raise exception 'Numa simulação automática não há nada para cancelar.'; end if;
  if not exists (select 1 from match_players where match_id = p_match and profile_id = me.id and team is not null) then
    raise exception 'Só quem está na partida pode votar.';
  end if;
  if not (m.state = 'LOBBY_CREATION' or (m.state = 'IN_PROGRESS' and m.started_at > now() - interval '10 minutes')) then
    raise exception 'Já não dá para votar o cancelamento: só enquanto o grupo é criado e nos primeiros 10 minutos de jogo.';
  end if;
  if coalesce(p_voto, true) then
    insert into match_cancel_votes (match_id, profile_id) values (p_match, me.id) on conflict do nothing;
  else
    delete from match_cancel_votes where match_id = p_match and profile_id = me.id;
  end if;
  -- Para os outros jogadores verem logo (o Realtime ouve a tabela das partidas).
  update matches set updated_at = now() where id = p_match;
  if (select count(*) from match_cancel_votes v join profiles p on p.id = v.profile_id where v.match_id = p_match and not p.is_bot) >= _votos_necessarios(p_match) then
    update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
  end if;
end $$;

-- ---------------------------------------------------------------- a fila no Discord

alter table public.discord_ping_estado add column if not exists fila_pendente boolean not null default false;
alter table public.discord_ping_estado add column if not exists fila_pendente_desde timestamptz;

/** Só um pedido espera de cada vez; os outros deixam a contagem para ele. Um pendente há mais de 30 s considera-se perdido. */
create or replace function public._discord_fila_reservar() returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v boolean;
begin
  update discord_ping_estado set fila_pendente = true, fila_pendente_desde = now()
  where id and (not fila_pendente or fila_pendente_desde < now() - interval '30 seconds')
  returning true into v;
  return coalesce(v, false);
end $$;

create or replace function public._discord_fila_libertar() returns void
language sql volatile security definer set search_path = public as $$
  update discord_ping_estado set fila_pendente = false where id
$$;

/** Alguém entrou ou saiu da fila: pede à função que atualize o texto (só se a mensagem do ping já existir). */
create or replace function public._tg_discord_fila() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from config where id and discord_ping_message is not null) then
    perform _discord('fila', null);
  end if;
  return null;
end $$;

drop trigger if exists discord_fila on public.queue_entries;
create trigger discord_fila after insert or delete on public.queue_entries
for each statement execute function public._tg_discord_fila();

-- ---------------------------------------------------------------- as funções que mudam

create or replace function public._fechar(p_match uuid, p_a int, p_b int, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_win team := (case when p_a > p_b then 'A' else 'B' end)::team;
  v_delta int;
  v_perf int;
begin
  select * into m from matches where id = p_match for update;
  if m.state in ('COMPLETED', 'CANCELLED') then return; end if;

  if p_stats is not null then
    update match_players mp set
      kills = (s ->> 'kills')::int, deaths = (s ->> 'deaths')::int, assists = (s ->> 'assists')::int,
      acs = (s ->> 'acs')::int, first_bloods = (s ->> 'firstBloods')::int,
      trades = (s ->> 'trades')::int, hs_pct = (s ->> 'hsPct')::int, kast_pct = (s ->> 'kastPct')::int,
      agent = nullif(s ->> 'agente', '')
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    perform _rangify_scores(p_match, p_a + p_b);
    update match_players set mvp = false where match_id = p_match;
    update match_players set mvp = true where match_id = p_match and profile_id = (
      select profile_id from match_players where match_id = p_match and rangify_score is not null
      order by rangify_score desc, acs desc limit 1
    );
  end if;

  for r in select profile_id, team, tier_snapshot, rangify_score from match_players where match_id = p_match and team is not null loop
    v_perf := _bonus_desempenho(r.rangify_score);
    v_delta := _pontos_partida(r.team = v_win, p_a, p_b) + v_perf;
    -- Todas as partidas contam, também as de teste: remover a partida devolve tudo.
    update profiles set points = points + v_delta,
      wins = wins + case when r.team = v_win then 1 else 0 end,
      losses = losses + case when r.team = v_win then 0 else 1 end
    where id = r.profile_id;
    update match_players set points_delta = v_delta,
      points_perf = case when r.rangify_score is not null then v_perf end,
      points_after = (select points from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, points_applied = true, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

-- ------------------------------------------------------------ Agentes nas simulações

/** Um agente da função do jogador; p_n diferente dá agentes diferentes. */
create or replace function public._agente_simulado(p_funcao text, p_n int) returns text
language sql immutable as $$
  select a[1 + (p_n % array_length(a, 1))] from (select case p_funcao
    when 'Duelista' then array['Jett', 'Raze', 'Reyna', 'Phoenix', 'Neon', 'Yoru', 'Iso', 'Waylay']
    when 'Iniciador' then array['Sova', 'Skye', 'Fade', 'Breach', 'KAY/O', 'Gekko', 'Tejo']
    when 'Controlador' then array['Omen', 'Brimstone', 'Viper', 'Astra', 'Harbor', 'Clove', 'Miks']
    when 'Sentinela' then array['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto']
    else array['Jett', 'Sova', 'Omen', 'Killjoy', 'Raze', 'Skye', 'Viper', 'Cypher']
  end as a) x
$$;

create or replace function public._recalcular(p_match uuid, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_delta int;
  v_perf int;
  v_dif int;
  v_off int := floor(random() * 8)::int;
  v_lista jsonb := '[]'::jsonb;
begin
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state <> 'COMPLETED' then raise exception 'Só se recarregam partidas terminadas.'; end if;

  if p_stats is not null then
    update match_players mp set
      kills = coalesce((s ->> 'kills')::int, mp.kills), deaths = coalesce((s ->> 'deaths')::int, mp.deaths),
      assists = coalesce((s ->> 'assists')::int, mp.assists), acs = coalesce((s ->> 'acs')::int, mp.acs),
      first_bloods = coalesce((s ->> 'firstBloods')::int, mp.first_bloods), trades = coalesce((s ->> 'trades')::int, mp.trades),
      hs_pct = coalesce((s ->> 'hsPct')::int, mp.hs_pct), kast_pct = coalesce((s ->> 'kastPct')::int, mp.kast_pct),
      agent = coalesce(nullif(s ->> 'agente', ''), mp.agent)
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    update matches set has_stats = true where id = p_match;
  end if;

  -- As partidas de teste não têm API: quem não tem agente recebe um da sua função.
  if m.simulated then
    update match_players mp set agent = x.agente
    from (
      select o.profile_id,
        _agente_simulado(p.game_role, v_off + (row_number() over (partition by o.team, p.game_role order by random()))::int) as agente
      from match_players o join profiles p on p.id = o.profile_id
      where o.match_id = p_match and o.team is not null and o.agent is null
    ) x
    where mp.match_id = p_match and mp.profile_id = x.profile_id;
  end if;

  perform _rangify_scores(p_match, coalesce(m.score_a, 0) + coalesce(m.score_b, 0));
  update match_players set mvp = false where match_id = p_match;
  update match_players set mvp = true where match_id = p_match and profile_id = (
    select profile_id from match_players where match_id = p_match and rangify_score is not null
    order by rangify_score desc, acs desc limit 1
  );

  for r in
    select mp.profile_id, mp.team, mp.tier_snapshot, mp.rangify_score, mp.points_delta, mp.agent, _nome(p) as nome
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.team is not null
  loop
    v_perf := _bonus_desempenho(r.rangify_score);
    v_delta := _pontos_partida(r.team = m.winner, m.score_a, m.score_b) + v_perf;
    v_dif := v_delta - coalesce(r.points_delta, 0);
    -- Só mexe no perfil se esta partida já lhe tinha dado pontos.
    if m.points_applied and v_dif <> 0 then
      update profiles set points = points + v_dif where id = r.profile_id;
    end if;
    update match_players set points_delta = v_delta,
      points_perf = case when r.rangify_score is not null then v_perf end,
      points_after = case when points_after is not null then points_after + v_dif end
    where match_id = p_match and profile_id = r.profile_id;
    v_lista := v_lista || jsonb_build_object('nome', r.nome, 'antes', r.points_delta, 'depois', v_delta,
      'rangifyScore', r.rangify_score, 'agente', (select agent from match_players where match_id = p_match and profile_id = r.profile_id));
    perform _atualizar_missoes(r.profile_id, true);
  end loop;

  update matches set updated_at = now() where id = p_match;
  return jsonb_build_object('codigo', m.code, 'jogadores', v_lista);
end $$;

/** Owner e Dev: refaz o RS, o MVP e os pontos de uma partida de teste com o que ela já tem. */
create or replace function public.recalcular_partida(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if not m.simulated then raise exception 'Numa partida real, os dados vêm outra vez da Henrik Dev API: usa Recarregar dados.'; end if;
  return _recalcular(p_match, null);
end $$;

revoke all on function public._recalcular(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._recalcular(uuid, jsonb) to service_role;
grant execute on function public.recalcular_partida(uuid) to authenticated;

-- ------------------------------------------------------------ Tabela do Rangify Score
-- Ordenada pela média de RS. Entra quem tem pelo menos p_minimo partidas com RS (por
-- defeito, uma). "eu" traz o próprio
-- jogador mesmo que ainda não tenha partidas suficientes.
create or replace function public.ranking_rs(p_limite int default 50, p_minimo int default 1) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, avg(mp.rangify_score) as media, max(mp.rangify_score) as melhor, count(*) as n
    from match_players mp
    join matches m on m.id = mp.match_id
    join profiles p on p.id = mp.profile_id
    where m.state = 'COMPLETED' and mp.team is not null and mp.rangify_score is not null
      and not p.is_bot and p.riot_id is not null
    group by p.id
  ),
  ord as (
    select b.*, row_number() over (order by b.media desc, b.n desc, p.points desc, p.username) as pos
    from base b join profiles p on p.id = b.id
    where b.n >= greatest(1, p_minimo)
  )
  select jsonb_build_object(
    'minimo', greatest(1, p_minimo),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object('posicao', o.pos, 'perfil', _perfil_json(p), 'media', round(o.media, 1), 'melhor', o.melhor, 'partidas', o.n) order by o.pos)
      from ord o join profiles p on p.id = o.id
      where o.pos <= least(100, greatest(1, p_limite))
    ), '[]'::jsonb),
    'eu', (
      select jsonb_build_object('posicao', (select o.pos from ord o where o.id = b.id), 'media', round(b.media, 1), 'melhor', b.melhor, 'partidas', b.n)
      from base b where b.id = eu()
    )
  )
$$;

create or replace function public._partida_json(p_match uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'estado', m.state, 'regiao', m.region, 'mapa', m.map,
    'capitaoA', m.captain_a, 'capitaoB', m.captain_b,
    'codigoGrupo', case
      when p_viewer is not null and (exists (select 1 from match_players x where x.match_id = m.id and x.profile_id = p_viewer) or e_staff(p_viewer))
      then (select s.party_code from match_secrets s where s.match_id = m.id) end,
    'pool', to_jsonb(m.map_pool), 'resultadoA', m.score_a, 'resultadoB', m.score_b, 'vencedor', m.winner, 'simulada', m.simulated, 'automatica', m.automatic,
    'prazoConfirmacao', m.ready_deadline, 'inicioFase', m.phase_started_at, 'prazoFase', m.phase_deadline,
    'comecouEm', m.started_at, 'terminouEm', m.finished_at, 'estatisticas', m.has_stats,
    'criadaEm', m.created_at, 'atualizadaEm', m.updated_at,
    'lado', case when m.side_team is not null then jsonb_build_object('equipa', m.side_team, 'escolha', m.side_pick) end,
    'jogadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', p.id, 'utilizador', p.username, 'riotId', p.riot_id, 'avatarUrl', p.avatar_url,
        'tier', mp.tier_snapshot, 'pontos', p.points, 'funcaoJogo', p.game_role, 'bot', p.is_bot,
        'equipa', mp.team, 'capitao', mp.is_captain, 'aceitou', mp.accepted, 'ordemEscolha', mp.pick_order,
        'kills', mp.kills, 'deaths', mp.deaths, 'assists', mp.assists, 'acs', mp.acs,
        'firstBloods', mp.first_bloods, 'mvp', mp.mvp, 'deltaPontos', mp.points_delta,
        'trades', mp.trades, 'hsPct', mp.hs_pct, 'kastPct', mp.kast_pct,
        'rangifyScore', mp.rangify_score, 'deltaDesempenho', mp.points_perf, 'agente', mp.agent
      ) order by mp.team nulls last, mp.is_captain desc, mp.pick_order nulls first, mp.tier_snapshot desc)
      from match_players mp join profiles p on p.id = mp.profile_id where mp.match_id = m.id
    ), '[]'::jsonb),
    'bans', coalesce((
      select jsonb_agg(jsonb_build_object('mapa', b.map, 'equipa', b.team, 'ordem', b.ban_order) order by b.ban_order)
      from match_bans b where b.match_id = m.id
    ), '[]'::jsonb),
    'submissoes', coalesce((
      select jsonb_agg(jsonb_build_object('capitaoId', r.captain_id, 'a', r.score_a, 'b', r.score_b, 'em', r.submitted_at) order by r.submitted_at)
      from match_results r where r.match_id = m.id
    ), '[]'::jsonb),
    -- Só a equipa que está a decidir vê as sugestões dela (a outra equipa não espreita).
    'sugestoes', coalesce((
      select jsonb_agg(jsonb_build_object('perfilId', s.profile_id, 'valor', s.value) order by s.created_at)
      from match_suggestions s
      join match_players eu on eu.match_id = m.id and eu.profile_id = p_viewer
      where s.match_id = m.id and m.state = 'MAP_BAN'
        and s.step = (_vez_mapas(m.id)->>'passo')::int and eu.team::text = _vez_mapas(m.id)->>'equipa'
    ), '[]'::jsonb),
    -- A votação para cancelar: só enquanto o grupo está a ser criado e nos primeiros 10 minutos de jogo.
    'cancelamento', case when m.state in ('LOBBY_CREATION', 'IN_PROGRESS') then jsonb_build_object(
      'votos', (select count(*) from match_cancel_votes v where v.match_id = m.id),
      'necessarios', _votos_necessarios(m.id),
      'euVotei', exists (select 1 from match_cancel_votes v where v.match_id = m.id and v.profile_id = p_viewer),
      'aberto', m.state = 'LOBBY_CREATION' or m.started_at > now() - interval '10 minutes'
    ) end
  )
  from matches m where m.id = p_match
$$;

revoke all on function public._margem(int, int), public._pontos_partida(boolean, int, int), public._votos_necessarios(uuid),
  public._discord_fila_reservar(), public._discord_fila_libertar(), public._tg_discord_fila() from public, anon, authenticated;
grant execute on function public._discord_fila_reservar(), public._discord_fila_libertar() to service_role;
grant execute on function public.votar_cancelar(uuid, boolean) to authenticated;
