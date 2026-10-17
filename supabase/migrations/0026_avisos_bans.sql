-- Avisos e bans da fila, dados pela staff.
--
-- A staff (Owner, Dev e Mod) escreve um aviso a um jogador, ou bane-o da fila durante 1 hora,
-- 24 horas, 7 dias, 30 dias, um número de horas à escolha ou para sempre, sempre com uma mensagem.
--   * o ban tira a pessoa da fila já e impede-a de voltar a entrar (entrar_fila) até acabar;
--   * não cancela uma partida a decorrer, não apaga a conta, os pontos nem o histórico;
--   * o jogador recebe uma mensagem privada do bot no Discord (função discord-partida, tipo "aviso")
--     e, no site, um popup que tem de confirmar (um de cada vez, do mais antigo para o mais recente);
--   * cada pessoa só pune quem tem uma função abaixo da sua (Mod pune Verificado e Jogador, Dev pune
--     também Mod, Owner pune todos menos Owner).
--
-- Um ban sem data (ban_until nulo com queue_banned ligado) é para sempre. A staff pode levantar um ban.
-- Para a staff, o total de contas do site vem de contar_jogadores().
--
-- Corre depois de 0001 a 0025. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- tabelas

alter table public.profiles add column if not exists queue_banned boolean not null default false;
alter table public.profiles add column if not exists queue_banned_until timestamptz;

create table if not exists public.staff_avisos (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('warning', 'ban')),
  message text not null check (char_length(message) between 3 and 500),
  -- Só nos bans: quando acaba. Nulo = para sempre.
  ban_until timestamptz,
  created_at timestamptz not null default now(),
  -- Quando o jogador confirmou o popup do site.
  read_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  -- Como correu a mensagem privada no Discord (preenchido pela função discord-partida).
  dm text check (dm in ('enviada', 'falhou', 'sem_discord'))
);
create index if not exists staff_avisos_alvo on public.staff_avisos (target_id, created_at desc);
create index if not exists staff_avisos_por_ler on public.staff_avisos (target_id, created_at) where read_at is null;

alter table public.staff_avisos enable row level security;
-- Cada um lê só os seus (é o que o Realtime usa para avisar o site); a staff lê tudo pelos RPCs.
drop policy if exists "ler os meus avisos" on public.staff_avisos;
create policy "ler os meus avisos" on public.staff_avisos for select to authenticated using (target_id = public.eu());

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_avisos') then
    alter publication supabase_realtime add table public.staff_avisos;
  end if;
end $$;

-- ---------------------------------------------------------------- utilidades

/** O ban está a valer agora? (Um ban com data já passada deixa de contar sem ninguém o levantar.) */
create or replace function public._ban_ativo(p public.profiles) returns boolean
language sql stable as $$
  select p.queue_banned and (p.queue_banned_until is null or p.queue_banned_until > now())
$$;

/** O ban de agora para o site: { ate, permanente, mensagem }, ou nulo se não há. */
create or replace function public._ban_json(p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public._ban_ativo(p) then null else jsonb_build_object(
    'ate', p.queue_banned_until,
    'permanente', p.queue_banned_until is null,
    'mensagem', (select a.message from staff_avisos a where a.target_id = p.id and a.kind = 'ban' and a.revoked_at is null order by a.created_at desc limit 1)
  ) end
$$;

create or replace function public._nivel_funcao(p_funcao public.user_role) returns int
language sql immutable as $$
  select case p_funcao when 'owner' then 4 when 'dev' then 3 when 'mod' then 2 when 'verified' then 1 else 0 end
$$;

/** Só pune quem tem uma função acima da do alvo (e ninguém se pune a si próprio). */
create or replace function public._exigir_pode_punir(me public.profiles, alvo public.profiles) returns void
language plpgsql stable as $$
begin
  if alvo.id = me.id then raise exception 'Não podes aplicar isto a ti próprio.'; end if;
  if _nivel_funcao(alvo.role) >= _nivel_funcao(me.role) then
    raise exception 'Só podes avisar ou banir jogadores com uma função abaixo da tua.';
  end if;
end $$;

create or replace function public._aviso_json(a public.staff_avisos) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'tipo', case a.kind when 'ban' then 'ban' else 'aviso' end, 'mensagem', a.message,
    'banAte', a.ban_until, 'permanente', a.kind = 'ban' and a.ban_until is null,
    'criadoEm', a.created_at, 'lidoEm', a.read_at, 'levantadoEm', a.revoked_at,
    'dm', a.dm,
    'autor', (select _nome(p) from profiles p where p.id = a.author_id)
  )
$$;

/** Avisa o bot (pg_net) para mandar a mensagem privada. Nunca deixa um erro travar a staff. */
create or replace function public._discord_aviso(p_aviso uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c discord_config;
begin
  select * into c from discord_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object('tipo', 'aviso', 'avisoId', p_aviso),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rangify-segredo', c.segredo),
    timeout_milliseconds := 20000
  );
exception when others then
  raise warning 'Discord: não foi possível pedir o aviso %: %', p_aviso, sqlerrm;
end $$;

create or replace function public._tg_discord_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform _discord_aviso(new.id);
  return null;
end $$;

drop trigger if exists discord_aviso on public.staff_avisos;
create trigger discord_aviso after insert on public.staff_avisos
for each row execute function public._tg_discord_aviso();

-- ---------------------------------------------------------------- RPCs: staff

create or replace function public.avisar_jogador(p_perfil uuid, p_mensagem text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  alvo profiles;
  v_msg text := trim(coalesce(p_mensagem, ''));
  a staff_avisos;
begin
  me := _exigir_staff();
  select * into alvo from profiles where id = p_perfil and not is_bot;
  if not found then raise exception 'Jogador não encontrado.'; end if;
  perform _exigir_pode_punir(me, alvo);
  if char_length(v_msg) < 3 then raise exception 'Escreve o aviso (pelo menos 3 caracteres).'; end if;
  if char_length(v_msg) > 500 then raise exception 'O aviso pode ter no máximo 500 caracteres.'; end if;
  insert into staff_avisos (target_id, author_id, kind, message) values (alvo.id, me.id, 'warning', v_msg) returning * into a;
  return _aviso_json(a);
end $$;

/** Bane da fila: p_horas nulo é para sempre. Tira a pessoa da fila já; uma partida a decorrer não é afetada. */
create or replace function public.banir_da_fila(p_perfil uuid, p_mensagem text, p_horas int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  alvo profiles;
  v_msg text := trim(coalesce(p_mensagem, ''));
  v_ate timestamptz;
  a staff_avisos;
begin
  me := _exigir_staff();
  select * into alvo from profiles where id = p_perfil and not is_bot;
  if not found then raise exception 'Jogador não encontrado.'; end if;
  perform _exigir_pode_punir(me, alvo);
  if char_length(v_msg) < 3 then raise exception 'Escreve o motivo do ban (pelo menos 3 caracteres).'; end if;
  if char_length(v_msg) > 500 then raise exception 'O motivo pode ter no máximo 500 caracteres.'; end if;
  if p_horas is not null then
    if p_horas < 1 or p_horas > 24 * 365 then raise exception 'A duração do ban é de 1 hora até 1 ano (ou para sempre).'; end if;
    v_ate := now() + make_interval(hours => p_horas);
  end if;
  update profiles set queue_banned = true, queue_banned_until = v_ate where id = alvo.id;
  delete from queue_entries where profile_id = alvo.id;
  insert into staff_avisos (target_id, author_id, kind, message, ban_until) values (alvo.id, me.id, 'ban', v_msg, v_ate) returning * into a;
  return _aviso_json(a);
end $$;

create or replace function public.levantar_ban(p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  alvo profiles;
begin
  me := _exigir_staff();
  select * into alvo from profiles where id = p_perfil and not is_bot;
  if not found then raise exception 'Jogador não encontrado.'; end if;
  perform _exigir_pode_punir(me, alvo);
  if not _ban_ativo(alvo) then raise exception 'Este jogador não está banido da fila.'; end if;
  update profiles set queue_banned = false, queue_banned_until = null where id = alvo.id;
  -- Um ban levantado antes de o jogador o ler já não precisa de popup.
  update staff_avisos set revoked_at = now(), revoked_by = me.id, read_at = coalesce(read_at, now())
  where target_id = alvo.id and kind = 'ban' and revoked_at is null;
end $$;

/** O histórico de avisos e bans de um jogador, para o cartão dele na staff (os 30 mais recentes). */
create or replace function public.avisos_do_jogador(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir_staff();
  return (
    select coalesce(jsonb_agg(_aviso_json(a) order by a.created_at desc), '[]'::jsonb)
    from (select * from staff_avisos where target_id = p_perfil order by created_at desc limit 30) a
  );
end $$;

/** Quantas contas humanas há no site (o cartão "Jogadores" da staff). */
create or replace function public.contar_jogadores() returns int
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir_staff();
  return (select count(*)::int from profiles where not is_bot);
end $$;

-- A lista de jogadores da staff mostra também o ban de cada um.
create or replace function public.pesquisar_jogadores(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := replace(replace(lower(coalesce(trim(p_q), '')), '%', '\%'), '_', '\_');
begin
  perform _exigir_staff();
  return (
    select coalesce(jsonb_agg(_perfil_json(p) || jsonb_build_object('ban', _ban_json(p)) order by p.username), '[]'::jsonb) from (
      select * from profiles where not is_bot and (v_q = '' or username like '%' || v_q || '%' or lower(riot_id) like '%' || v_q || '%')
      order by username limit 25
    ) p
  );
end $$;

-- ---------------------------------------------------------------- RPCs: o jogador

/** O aviso mais antigo que ainda não confirmaste (um de cada vez), ou nulo. */
create or replace function public.aviso_pendente() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  a staff_avisos;
begin
  if me is null then return null; end if;
  select * into a from staff_avisos where target_id = me and read_at is null and revoked_at is null order by created_at limit 1;
  if not found then return null; end if;
  -- O jogador não vê quem foi da staff nem como correu a mensagem privada.
  return _aviso_json(a) - 'autor' - 'dm';
end $$;

create or replace function public.confirmar_aviso(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update staff_avisos set read_at = now() where id = p_id and target_id = (_eu()).id and read_at is null;
end $$;

-- ---------------------------------------------------------------- entrar na fila

/** O ban de agora vai junto com o estado da fila (o botão do site e o da extensão mostram-no). */
create or replace function public.estado_fila() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
begin
  me := _eu();
  select * into q from queue_entries where profile_id = me.id;
  return jsonb_build_object(
    'naFila', q.profile_id is not null,
    'desde', q.joined_at,
    'contagem', (select count(*) from queue_entries where region = me.region),
    'regiao', me.region,
    'cooldownAte', case when me.cooldown_until > now() then me.cooldown_until end,
    'agora', now(),
    'ban', _ban_json(me)
  );
end $$;

-- O ban fica à frente do castigo dos 5 minutos: se os dois existirem, é o ban que se vê.
create or replace function public.entrar_fila() returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _eu();
  if _ban_ativo(me) then
    raise exception 'Estás banido da fila %. Motivo: %',
      case when me.queue_banned_until is null then 'para sempre'
           else 'até ' || to_char(me.queue_banned_until at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') end,
      coalesce((select a.message from staff_avisos a where a.target_id = me.id and a.kind = 'ban' and a.revoked_at is null order by a.created_at desc limit 1), '—');
  end if;
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if me.cooldown_until > now() then raise exception 'Ainda estás de castigo por não aceitares uma partida.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  if coalesce((select discord_required from config where id), false)
     and not (coalesce(me.discord_member, false) and me.discord_checked_at > now() - interval '30 minutes') then
    raise exception 'Entra no servidor de Discord do Rangify para poderes entrar na fila.';
  end if;
  insert into queue_entries (profile_id, region) values (me.id, me.region) on conflict do nothing;
  perform _emparelhar(me.region);
end $$;

-- ---------------------------------------------------------------- acessos

revoke all on function
  public._ban_ativo(public.profiles), public._ban_json(public.profiles), public._nivel_funcao(public.user_role),
  public._exigir_pode_punir(public.profiles, public.profiles), public._aviso_json(public.staff_avisos),
  public._discord_aviso(uuid), public._tg_discord_aviso()
  from public, anon, authenticated;
grant execute on function
  public._ban_ativo(public.profiles), public._ban_json(public.profiles), public._nivel_funcao(public.user_role),
  public._exigir_pode_punir(public.profiles, public.profiles), public._aviso_json(public.staff_avisos),
  public._discord_aviso(uuid), public._tg_discord_aviso()
  to service_role;
grant execute on function
  public.avisar_jogador(uuid, text), public.banir_da_fila(uuid, text, int), public.levantar_ban(uuid),
  public.avisos_do_jogador(uuid), public.contar_jogadores(), public.aviso_pendente(), public.confirmar_aviso(uuid)
  to authenticated;
