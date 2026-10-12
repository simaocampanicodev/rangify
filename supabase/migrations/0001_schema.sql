-- =============================================================================
-- Rangify: esquema, regras de acesso e máquina de estados das partidas.
--
-- Tudo o que muda dados passa por funções "security definer": os clientes só
-- leem tabelas (com RLS) e chamam RPCs. As funções com "_" no início são
-- internas e não podem ser chamadas pelo browser.
--
-- Pontos: toda a gente começa com 1000. Vitória +20, derrota -20, mais
-- 3 x (média das divisões oficiais do adversário - a tua divisão), entre -8 e
-- +10. Divisão = tier da Henrik - 2 (Ferro 1 = 1 ... Radiante = 25); sem rank
-- conta como 9 (Prata 3).
-- =============================================================================

-- ---------------------------------------------------------------- tipos

create type public.user_role as enum ('owner', 'dev', 'mod', 'verified', 'user');
create type public.match_state as enum (
  'READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'IN_PROGRESS',
  'RESULT_SUBMISSION', 'DISPUTE', 'PROCESSING_API', 'COMPLETED', 'CANCELLED'
);
create type public.team as enum ('A', 'B');

-- ---------------------------------------------------------------- tabelas

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  -- null nos bots das ferramentas de teste
  auth_id uuid unique references auth.users (id) on delete cascade,
  username text not null unique,
  avatar_url text,
  riot_id text,
  riot_puuid text,
  region text not null default 'eu' check (region in ('eu', 'na', 'ap', 'kr', 'latam', 'br')),
  official_tier int not null default 0 check (official_tier between 0 and 27),
  official_rr int,
  rank_synced_at timestamptz,
  points int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  role public.user_role not null default 'user',
  game_role text check (game_role in ('Duelista', 'Controlador', 'Iniciador', 'Sentinela')),
  is_bot boolean not null default false,
  cooldown_until timestamptz,
  tour_seen_at timestamptz,
  has_password boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_riot_id_unico on public.profiles (lower(riot_id));
create index profiles_ranking on public.profiles (points desc, wins desc, username) where not is_bot and riot_id is not null;

create table public.queue_entries (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  region text not null,
  joined_at timestamptz not null default now()
);
create index queue_entries_regiao on public.queue_entries (region, joined_at);

create sequence public.match_code_seq start 1000;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  state public.match_state not null default 'READY_CHECK',
  region text not null,
  map text,
  captain_a uuid references public.profiles (id),
  captain_b uuid references public.profiles (id),
  score_a int,
  score_b int,
  winner public.team,
  simulated boolean not null default false,
  automatic boolean not null default false,
  forced_captain uuid references public.profiles (id),
  ready_deadline timestamptz,
  phase_started_at timestamptz,
  phase_deadline timestamptz,
  bot_move_at timestamptz,
  auto_score_a int,
  auto_score_b int,
  started_at timestamptz,
  finished_at timestamptz,
  has_stats boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_ativas on public.matches (state) where state not in ('COMPLETED', 'CANCELLED');
create index matches_terminadas on public.matches (finished_at desc) where state = 'COMPLETED';

-- O código do grupo só é visível aos 10 jogadores (e à staff), por isso vive à parte.
create table public.match_secrets (
  match_id uuid primary key references public.matches (id) on delete cascade,
  party_code text not null check (party_code ~ '^[A-Z0-9]{6}$')
);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tier_snapshot int not null default 0,
  queued_since timestamptz,
  team public.team,
  is_captain boolean not null default false,
  accepted boolean not null default false,
  accept_at timestamptz,
  pick_order int,
  kills int,
  deaths int,
  assists int,
  acs int,
  first_bloods int,
  mvp boolean not null default false,
  points_delta int,
  points_after int,
  primary key (match_id, profile_id)
);
create index match_players_perfil on public.match_players (profile_id);

create table public.match_bans (
  match_id uuid not null references public.matches (id) on delete cascade,
  ban_order int not null,
  map text not null,
  team public.team not null,
  primary key (match_id, ban_order),
  unique (match_id, map)
);

create table public.match_results (
  match_id uuid not null references public.matches (id) on delete cascade,
  captain_id uuid not null references public.profiles (id),
  score_a int not null,
  score_b int not null,
  submitted_at timestamptz not null default now(),
  primary key (match_id, captain_id)
);

create table public.friends (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
create index friends_destino on public.friends (addressee);

create table public.quests (
  id text primary key,
  title text not null,
  description text not null,
  kind text not null check (kind in ('jogos', 'vitorias', 'vitorias_acima', 'first_bloods', 'mvp', 'sequencia', 'acs', 'pontos')),
  target int not null,
  scope text not null check (scope in ('weekly', 'season')),
  sort int not null default 0,
  active boolean not null default true
);

insert into public.quests (id, title, description, kind, target, scope, sort) values
  ('m-jogos', 'Rotina de competição', 'Joga 10 partidas esta semana.', 'jogos', 10, 'weekly', 1),
  ('m-vitorias', 'Cinco vitórias', 'Ganha 5 partidas esta semana.', 'vitorias', 5, 'weekly', 2),
  ('m-acima', 'Contra os favoritos', 'Ganha 2 partidas contra uma equipa com rank oficial médio acima do teu.', 'vitorias_acima', 2, 'weekly', 3),
  ('m-fb', 'Primeiro sangue', 'Faz 15 first bloods esta semana.', 'first_bloods', 15, 'weekly', 4),
  ('m-mvp', 'Jogador da partida', 'Sê MVP em 2 partidas esta semana.', 'mvp', 2, 'weekly', 5),
  ('m-seq', 'Em série', 'Ganha 4 partidas seguidas nesta temporada.', 'sequencia', 4, 'season', 6),
  ('m-acs', 'Noite inspirada', 'Acaba uma partida com 300 de ACS ou mais.', 'acs', 300, 'season', 7),
  ('m-pontos', 'Rumo aos 1200', 'Chega aos 1200 pontos nesta temporada.', 'pontos', 1200, 'season', 8);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 6 and 80),
  description text not null check (char_length(description) between 10 and 500),
  category text not null,
  status text not null default 'received' check (status in ('received', 'review', 'planned', 'done')),
  created_at timestamptz not null default now()
);

create table public.suggestion_votes (
  suggestion_id uuid not null references public.suggestions (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (suggestion_id, profile_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  details text not null check (char_length(details) between 10 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'archived')),
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz
);

-- ---------------------------------------------------------------- utilidades

create function public.eu() returns uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where auth_id = auth.uid()
$$;

create function public._eu() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where auth_id = auth.uid();
  if not found then raise exception 'Tens de entrar na tua conta.'; end if;
  return p;
end $$;

create function public.e_staff(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('owner', 'dev', 'mod') from profiles where id = p_perfil), false)
$$;

create function public._exigir_staff() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  p := _eu();
  if p.role not in ('owner', 'dev', 'mod') then raise exception 'Esta área é só para a equipa do Rangify.'; end if;
  return p;
end $$;

create function public._exigir_dev() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  p := _eu();
  if p.role not in ('owner', 'dev') then raise exception 'Só Owner e Dev podem usar as ferramentas de teste.'; end if;
  return p;
end $$;

create function public._divisao(p_tier int) returns int
language sql immutable as $$
  select case when p_tier >= 3 then least(25, p_tier - 2) else 9 end
$$;

create function public._tier_de_divisao(p_div numeric) returns int
language sql immutable as $$
  select greatest(3, least(27, round(p_div)::int + 2))
$$;

create function public._pontos(p_tier int, p_adversarios int[], p_venceu boolean) returns int
language sql immutable as $$
  select (case when p_venceu then 20 else -20 end)
    + greatest(-8, least(10, 3 * (
        round((select avg(public._divisao(t)) from unnest(p_adversarios) t))::int - public._divisao(p_tier)
      )))
$$;

create function public._mapas() returns text[]
language sql immutable as $$
  select array['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Summit', 'Sunset']
$$;

create function public._nome(p public.profiles) returns text
language sql immutable as $$
  select coalesce(split_part(p.riot_id, '#', 1), p.username)
$$;

create function public._inicio_temporada() returns timestamptz
language sql immutable as $$
  select timestamptz '2026-09-01 00:00:00+00'
$$;

create function public._resultado_invalido(p_a int, p_b int) returns text
language sql immutable as $$
  select case
    when p_a is null or p_b is null or p_a < 0 or p_b < 0 then 'As rondas são números inteiros.'
    when p_a = p_b then 'Empates não existem.'
    when greatest(p_a, p_b) < 13 then 'A equipa vencedora tem de ganhar 13 rondas.'
    when greatest(p_a, p_b) = 13 and least(p_a, p_b) <= 11 then null
    when greatest(p_a, p_b) = 13 and least(p_a, p_b) = 12 then 'Com 12-12 há prolongamento: ganha quem fizer 2 de vantagem.'
    when least(p_a, p_b) >= 12 and abs(p_a - p_b) = 2 then null
    when least(p_a, p_b) < 12 then 'Acima de 13 rondas só acontece no prolongamento, depois de 12-12.'
    else 'No prolongamento o resultado final tem 2 rondas de diferença.'
  end
$$;

create function public._atraso(p_auto boolean) returns interval
language sql volatile as $$
  select case when p_auto then (0.45 + random() * 0.45) else (1.6 + random() * 1.8) end * interval '1 second'
$$;

create function public._auto(p_match public.matches, p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_match.automatic or coalesce((select is_bot from profiles where id = p_perfil), false)
$$;

create function public._partida_ativa(p_perfil uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.id from matches m join match_players mp on mp.match_id = m.id
  where mp.profile_id = p_perfil and m.state not in ('COMPLETED', 'CANCELLED')
  order by m.created_at desc limit 1
$$;

-- ---------------------------------------------------------------- JSON para o site

create function public._perfil_json(p public.profiles) returns jsonb
language sql stable as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'utilizador', p.username, 'avatarUrl', p.avatar_url, 'riotId', p.riot_id, 'regiao', p.region,
    'tier', p.official_tier, 'rr', p.official_rr, 'rankAtualizadoEm', p.rank_synced_at, 'pontos', p.points,
    'vitorias', p.wins, 'derrotas', p.losses, 'funcao', p.role, 'funcaoJogo', p.game_role, 'bot', p.is_bot,
    'cooldownAte', p.cooldown_until, 'tourVistoEm', p.tour_seen_at, 'temPassword', p.has_password, 'criadoEm', p.created_at
  ) end
$$;

create function public._perfil_json_id(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select _perfil_json(p) from profiles p where p.id = p_id
$$;

create function public._partida_json(p_match uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'estado', m.state, 'regiao', m.region, 'mapa', m.map,
    'capitaoA', m.captain_a, 'capitaoB', m.captain_b,
    'codigoGrupo', case
      when p_viewer is not null and (exists (select 1 from match_players x where x.match_id = m.id and x.profile_id = p_viewer) or e_staff(p_viewer))
      then (select s.party_code from match_secrets s where s.match_id = m.id) end,
    'resultadoA', m.score_a, 'resultadoB', m.score_b, 'vencedor', m.winner, 'simulada', m.simulated, 'automatica', m.automatic,
    'prazoConfirmacao', m.ready_deadline, 'inicioFase', m.phase_started_at, 'prazoFase', m.phase_deadline,
    'comecouEm', m.started_at, 'terminouEm', m.finished_at, 'estatisticas', m.has_stats,
    'criadaEm', m.created_at, 'atualizadaEm', m.updated_at,
    'jogadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', p.id, 'utilizador', p.username, 'riotId', p.riot_id, 'avatarUrl', p.avatar_url,
        'tier', mp.tier_snapshot, 'pontos', p.points, 'funcaoJogo', p.game_role, 'bot', p.is_bot,
        'equipa', mp.team, 'capitao', mp.is_captain, 'aceitou', mp.accepted, 'ordemEscolha', mp.pick_order,
        'kills', mp.kills, 'deaths', mp.deaths, 'assists', mp.assists, 'acs', mp.acs,
        'firstBloods', mp.first_bloods, 'mvp', mp.mvp, 'deltaPontos', mp.points_delta
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
    ), '[]'::jsonb)
  )
  from matches m where m.id = p_match
$$;

create function public._resumo_json(p_match uuid, p_ref uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select * from matches where id = p_match),
  meu as (select * from match_players where match_id = p_match and profile_id = p_ref and team is not null)
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'mapa', m.map, 'estado', m.state, 'resultadoA', m.score_a, 'resultadoB', m.score_b,
    'vencedor', m.winner, 'terminouEm', m.finished_at, 'simulada', m.simulated,
    'capitaoA', (select _nome(p) from profiles p where p.id = m.captain_a),
    'capitaoB', (select _nome(p) from profiles p where p.id = m.captain_b),
    'tierMedioA', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'A')),
    'tierMedioB', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'B')),
    'duracaoMin', case when m.started_at is not null and m.finished_at is not null then round(extract(epoch from m.finished_at - m.started_at) / 60)::int end,
    'mvp', (select _nome(p) from match_players mp join profiles p on p.id = mp.profile_id where mp.match_id = m.id and mp.mvp limit 1),
    'minha', (select jsonb_build_object(
        'equipa', meu.team, 'venceu', meu.team = m.winner, 'deltaPontos', meu.points_delta, 'kills', meu.kills,
        'deaths', meu.deaths, 'assists', meu.assists, 'acs', meu.acs, 'mvp', meu.mvp,
        'tierAdversario', _tier_de_divisao((select avg(_divisao(o.tier_snapshot)) from match_players o where o.match_id = m.id and o.team is not null and o.team <> meu.team))
      ) from meu)
  ) from m
$$;

-- ---------------------------------------------------------------- o motor da partida

create function public._criar_partida(p_ids uuid[], p_region text, p_simulada boolean, p_automatica boolean, p_forcar uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into matches (code, state, region, simulated, automatic, forced_captain, ready_deadline, phase_started_at, phase_deadline)
  values ('RG-' || nextval('match_code_seq'), 'READY_CHECK', p_region, p_simulada, p_automatica, p_forcar,
          now() + interval '20 seconds', now(), now() + interval '20 seconds')
  returning id into v_id;

  -- Os bots (e toda a gente numa simulação automática) aceitam sozinhos daqui a pouco.
  insert into match_players (match_id, profile_id, tier_snapshot, queued_since, accept_at)
  select v_id, p.id, p.official_tier, q.joined_at,
    case when p.is_bot or p_automatica
      then now() + (case when p_automatica then 0.3 + random() * 1.1 else 1 + random() * 7 end) * interval '1 second' end
  from profiles p left join queue_entries q on q.profile_id = p.id
  where p.id = any (p_ids);

  delete from queue_entries where profile_id = any (p_ids);
  return v_id;
end $$;

create function public._emparelhar(p_region text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || p_region));
  select array_agg(profile_id) into v_ids from (
    select profile_id from queue_entries where region = p_region order by joined_at limit 10
  ) q;
  if coalesce(array_length(v_ids, 1), 0) < 10 then return null; end if;
  return _criar_partida(v_ids, p_region, false, false, null);
end $$;

create function public._bots_livres(p_n int, p_region text) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v uuid[];
  v_novo uuid;
  k int;
begin
  select array_agg(id) into v from (
    select p.id from profiles p
    where p.is_bot and _partida_ativa(p.id) is null
    order by random() limit p_n
  ) b;
  k := coalesce(array_length(v, 1), 0);
  while k < p_n loop
    insert into profiles (username, riot_id, region, official_tier, is_bot, game_role, tour_seen_at)
    values (
      'bot_' || substr(md5(random()::text), 1, 8),
      'Bot' || upper(substr(md5(random()::text), 1, 4)) || '#BOT',
      p_region,
      6 + floor(random() * 18)::int,
      true,
      (array['Duelista', 'Controlador', 'Iniciador', 'Sentinela'])[1 + floor(random() * 4)::int],
      now()
    ) returning id into v_novo;
    v := coalesce(v, '{}') || v_novo;
    k := k + 1;
  end loop;
  return v;
end $$;

create function public._iniciar_draft(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  a uuid;
  b uuid;
begin
  select * into m from matches where id = p_match;
  if m.forced_captain is not null and exists (select 1 from match_players where match_id = p_match and profile_id = m.forced_captain) then
    a := m.forced_captain;
  else
    select mp.profile_id into a from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match order by mp.tier_snapshot desc, p.points desc, p.id limit 1;
  end if;
  select mp.profile_id into b from match_players mp join profiles p on p.id = mp.profile_id
  where mp.match_id = p_match and mp.profile_id <> a order by mp.tier_snapshot desc, p.points desc, p.id limit 1;

  update match_players set is_captain = true, team = 'A' where match_id = p_match and profile_id = a;
  update match_players set is_captain = true, team = 'B' where match_id = p_match and profile_id = b;
  update matches set state = 'DRAFT_PHASE', captain_a = a, captain_b = b, phase_started_at = now(),
    phase_deadline = now() + interval '30 seconds', bot_move_at = now() + _atraso(m.automatic), updated_at = now()
  where id = p_match;
end $$;

create function public._falhou_confirmacao(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  update profiles set cooldown_until = now() + interval '5 minutes'
  where not is_bot and id in (select profile_id from match_players where match_id = p_match and not accepted);
  -- Quem aceitou volta à fila com o lugar que tinha (as simulações não voltam).
  if not m.simulated then
    insert into queue_entries (profile_id, region, joined_at)
    select mp.profile_id, m.region, coalesce(mp.queued_since, now())
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.accepted and not p.is_bot
    on conflict do nothing;
  end if;
  update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
  if not m.simulated then perform _emparelhar(m.region); end if;
end $$;

create function public._escolher(p_match uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
begin
  select * into m from matches where id = p_match;
  select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
  update match_players set team = (case when n % 2 = 0 then 'A' else 'B' end)::team, pick_order = n + 1
  where match_id = p_match and profile_id = p_perfil and team is null;
  if not found then raise exception 'Esse jogador já foi escolhido.'; end if;
  if n + 1 >= 8 then
    update matches set state = 'MAP_BAN', phase_started_at = now(), phase_deadline = now() + interval '20 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '30 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  end if;
end $$;

create function public._banir(p_match uuid, p_mapa text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_mapa text;
begin
  select * into m from matches where id = p_match;
  if not (p_mapa = any (_mapas())) or exists (select 1 from match_bans where match_id = p_match and map = p_mapa) then
    raise exception 'Esse mapa já não está disponível.';
  end if;
  select count(*) into n from match_bans where match_id = p_match;
  insert into match_bans (match_id, ban_order, map, team) values (p_match, n + 1, p_mapa, (case when n % 2 = 0 then 'A' else 'B' end)::team);
  -- Bans até sobrar um mapa: com 13 na pool são 12 bans.
  if n + 1 >= array_length(_mapas(), 1) - 1 then
    select x into v_mapa from unnest(_mapas()) x
    where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x) limit 1;
    update matches set state = 'LOBBY_CREATION', map = v_mapa, phase_started_at = now(), phase_deadline = now() + interval '10 minutes',
      bot_move_at = now() + case when m.automatic then interval '0.8 seconds' else (3.5 + random() * 2) * interval '1 second' end,
      updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '20 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  end if;
end $$;

create function public._comecar(p_match uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  insert into match_secrets (match_id, party_code) values (p_match, p_codigo)
  on conflict (match_id) do update set party_code = excluded.party_code;
  update matches set state = 'IN_PROGRESS', started_at = now(), phase_started_at = now(),
    phase_deadline = now() + case when m.automatic then interval '1.5 seconds' else interval '15 minutes' end,
    bot_move_at = null, updated_at = now() where id = p_match;
end $$;

create function public._abrir_resultado(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  update matches set state = 'RESULT_SUBMISSION', phase_started_at = now(), phase_deadline = now() + interval '60 minutes',
    bot_move_at = now() + case when m.automatic then interval '0.7 seconds' else (5 + random() * 4) * interval '1 second' end,
    updated_at = now() where id = p_match;
end $$;

create function public._submeter(p_match uuid, p_capitao uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_diferentes int;
begin
  select * into m from matches where id = p_match;
  insert into match_results (match_id, captain_id, score_a, score_b) values (p_match, p_capitao, p_a, p_b);
  update matches set updated_at = now() where id = p_match;
  select count(*), count(distinct score_a::text || '-' || score_b::text) into n, v_diferentes from match_results where match_id = p_match;
  if n < 2 then return; end if;
  if v_diferentes = 1 then
    -- Batem certo: segue para a Henrik Dev API (nas simulações, estatísticas inventadas daqui a pouco).
    update matches set state = 'PROCESSING_API', score_a = p_a, score_b = p_b, phase_started_at = now(),
      phase_deadline = now() + case when m.automatic then interval '1.2 seconds' when m.simulated then interval '3.5 seconds' else interval '15 minutes' end,
      bot_move_at = null, updated_at = now() where id = p_match;
  else
    update matches set state = 'DISPUTE', phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
  end if;
end $$;

create function public._resultado_aleatorio(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dif numeric;
  v_ganha_a boolean;
  v_ven int := 13;
  v_per int;
begin
  select coalesce(avg(_divisao(tier_snapshot)) filter (where team = 'A'), 9) - coalesce(avg(_divisao(tier_snapshot)) filter (where team = 'B'), 9)
  into v_dif from match_players where match_id = p_match;
  v_ganha_a := random() < 1 / (1 + exp(-v_dif * 0.32));
  if random() < 0.14 then
    v_ven := 14; v_per := 12;
  else
    v_per := (array[3, 5, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11])[1 + floor(random() * 14)::int];
  end if;
  update matches set auto_score_a = case when v_ganha_a then v_ven else v_per end,
    auto_score_b = case when v_ganha_a then v_per else v_ven end where id = p_match;
end $$;

-- Estatísticas inventadas para as partidas simuladas, com a mesma forma que as da API.
create function public._estatisticas_simuladas(p_match uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m matches;
  v_rondas int;
  v_win team;
  v jsonb;
begin
  select * into m from matches where id = p_match;
  v_rondas := coalesce(m.score_a, 13) + coalesce(m.score_b, 0);
  v_win := case when coalesce(m.score_a, 13) > coalesce(m.score_b, 0) then 'A' else 'B' end;
  with base as (
    select mp.profile_id, mp.team = v_win as ganhou, p.game_role,
      greatest(90, round(150 + random() * 120 + (_divisao(mp.tier_snapshot) - 14) * 3
        + case when mp.team = v_win then 22 else -18 end + case when p.game_role = 'Duelista' then 18 else 0 end))::int as acs
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.team is not null
  )
  select jsonb_agg(jsonb_build_object(
    'perfilId', profile_id, 'acs', acs,
    'kills', greatest(1, round(v_rondas * (acs / 265.0) * (0.68 + random() * 0.18)))::int,
    'deaths', greatest(2, round(v_rondas * case when ganhou then 0.5 + random() * 0.24 else 0.62 + random() * 0.24 end))::int,
    'assists', round(v_rondas * (case when game_role in ('Iniciador', 'Controlador') then 0.22 else 0.1 end + random() * 0.2))::int,
    'firstBloods', round(v_rondas * random() * case when game_role = 'Duelista' then 0.2 else 0.09 end)::int
  )) into v from base;
  return v;
end $$;

-- Fecha a partida: estatísticas, vencedor, pontos de cada um e vitórias/derrotas.
create function public._fechar(p_match uuid, p_a int, p_b int, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_win team := (case when p_a > p_b then 'A' else 'B' end)::team;
  v_delta int;
begin
  select * into m from matches where id = p_match for update;
  if m.state in ('COMPLETED', 'CANCELLED') then return; end if;

  if p_stats is not null then
    update match_players mp set
      kills = (s ->> 'kills')::int, deaths = (s ->> 'deaths')::int, assists = (s ->> 'assists')::int,
      acs = (s ->> 'acs')::int, first_bloods = (s ->> 'firstBloods')::int
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    update match_players set mvp = false where match_id = p_match;
    update match_players set mvp = true where match_id = p_match and profile_id = (
      select profile_id from match_players where match_id = p_match and acs is not null order by acs desc limit 1
    );
  end if;

  for r in select profile_id, team, tier_snapshot from match_players where match_id = p_match and team is not null loop
    v_delta := _pontos(
      r.tier_snapshot,
      array(select tier_snapshot from match_players where match_id = p_match and team is not null and team <> r.team),
      r.team = v_win
    );
    -- As partidas simuladas mostram o cálculo, mas não mexem nos pontos reais.
    if not m.simulated then
      update profiles set points = points + v_delta,
        wins = wins + case when r.team = v_win then 1 else 0 end,
        losses = losses + case when r.team = v_win then 0 else 1 end
      where id = r.profile_id;
    end if;
    update match_players set points_delta = v_delta, points_after = (select points from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

-- Um passo da máquina de estados: prazos esgotados e jogadas dos bots. Devolve true se mudou de fase.
create function public._passo(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_cap uuid;
  v_alvo uuid;
  v_mapa text;
  v_humano uuid;
  v_outro uuid;
  s match_results;
begin
  select * into m from matches where id = p_match for update;
  if not found then return false; end if;

  case m.state
  when 'READY_CHECK' then
    update match_players set accepted = true
    where match_id = p_match and not accepted and accept_at is not null and accept_at <= now();
    if not exists (select 1 from match_players where match_id = p_match and not accepted) then
      perform _iniciar_draft(p_match);
      return true;
    elsif now() >= m.ready_deadline then
      perform _falhou_confirmacao(p_match);
      return true;
    end if;

  when 'DRAFT_PHASE' then
    select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
    v_cap := case when n % 2 = 0 then m.captain_a else m.captain_b end;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      select mp.profile_id into v_alvo from match_players mp join profiles p on p.id = mp.profile_id
      where mp.match_id = p_match and mp.team is null order by mp.tier_snapshot desc, p.points desc limit 1;
      perform _escolher(p_match, v_alvo);
      return true;
    end if;

  when 'MAP_BAN' then
    select count(*) into n from match_bans where match_id = p_match;
    v_cap := case when n % 2 = 0 then m.captain_a else m.captain_b end;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      select x into v_mapa from unnest(_mapas()) x
      where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x)
      order by random() limit 1;
      perform _banir(p_match, v_mapa);
      return true;
    end if;

  when 'LOBBY_CREATION' then
    if _auto(m, m.captain_a) and m.bot_move_at <= now() then
      perform _comecar(p_match, upper(substr(md5(random()::text), 1, 6)));
      return true;
    elsif now() >= m.phase_deadline then
      update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
      return true;
    end if;

  when 'IN_PROGRESS' then
    if now() >= m.phase_deadline then
      perform _abrir_resultado(p_match);
      return true;
    end if;

  when 'RESULT_SUBMISSION' then
    if m.bot_move_at is not null and m.bot_move_at <= now() then
      if _auto(m, m.captain_a) and _auto(m, m.captain_b) then
        -- Dois capitães automáticos: inventam um resultado e submetem os dois.
        if m.auto_score_a is null then
          perform _resultado_aleatorio(p_match);
          select * into m from matches where id = p_match;
        end if;
        v_cap := case
          when not exists (select 1 from match_results where match_id = p_match and captain_id = m.captain_a) then m.captain_a
          when not exists (select 1 from match_results where match_id = p_match and captain_id = m.captain_b) then m.captain_b
        end;
        if v_cap is not null then
          update matches set bot_move_at = now() + case when m.automatic then interval '0.4 seconds' else interval '1.6 seconds' end where id = p_match;
          perform _submeter(p_match, v_cap, m.auto_score_a, m.auto_score_b);
          return true;
        end if;
      else
        -- Um capitão humano e um bot: o bot confirma o que o humano submeteu.
        v_humano := case when _auto(m, m.captain_a) then m.captain_b else m.captain_a end;
        v_outro := case when v_humano = m.captain_a then m.captain_b else m.captain_a end;
        select * into s from match_results where match_id = p_match and captain_id = v_humano;
        if found and _auto(m, v_outro) and not exists (select 1 from match_results where match_id = p_match and captain_id = v_outro) then
          perform _submeter(p_match, v_outro, s.score_a, s.score_b);
          return true;
        end if;
      end if;
    end if;
    if now() >= m.phase_deadline then
      -- Prazo esgotado: vale a única submissão; sem nenhuma, vai para a staff.
      select count(*) into n from match_results where match_id = p_match;
      if n = 1 then
        select * into s from match_results where match_id = p_match;
        update matches set state = 'PROCESSING_API', score_a = s.score_a, score_b = s.score_b, phase_started_at = now(),
          phase_deadline = now() + case when m.simulated then interval '3.5 seconds' else interval '15 minutes' end, updated_at = now()
        where id = p_match;
      else
        update matches set state = 'DISPUTE', phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
      end if;
      return true;
    end if;

  when 'PROCESSING_API' then
    if now() >= m.phase_deadline then
      -- Simulação: estatísticas inventadas. Partida real sem resposta da API: fecha sem estatísticas.
      perform _fechar(p_match, m.score_a, m.score_b, case when m.simulated then _estatisticas_simuladas(p_match) end);
      return true;
    end if;

  else
    return false;
  end case;
  return false;
end $$;

-- ---------------------------------------------------------------- RPCs: conta

create function public.meu_perfil() returns jsonb
language sql stable security definer set search_path = public as $$
  select _perfil_json(p) from profiles p where p.auth_id = auth.uid()
$$;

create function public.perfil_por_riot(p_riot text) returns jsonb
language sql stable security definer set search_path = public as $$
  select _perfil_json(p) from profiles p where lower(p.riot_id) = lower(p_riot) and not p.is_bot
$$;

create function public.atualizar_perfil(p_regiao text default null, p_funcao_jogo text default null, p_mudar_funcao_jogo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _eu();
  update profiles set
    region = coalesce(p_regiao, region),
    game_role = case when p_mudar_funcao_jogo then p_funcao_jogo else game_role end
  where id = me.id returning * into me;
  return _perfil_json(me);
end $$;

create function public.marcar_tour(p_visto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set tour_seen_at = case when p_visto then now() end where id = (_eu()).id;
end $$;

create function public.marcar_password() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set has_password = true where id = (_eu()).id;
end $$;

-- ---------------------------------------------------------------- RPCs: fila e partida

create function public.estado_fila() returns jsonb
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
    'cooldownAte', case when me.cooldown_until > now() then me.cooldown_until end
  );
end $$;

create function public.entrar_fila() returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _eu();
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if me.cooldown_until > now() then raise exception 'Ainda estás de castigo por não aceitares uma partida.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  insert into queue_entries (profile_id, region) values (me.id, me.region) on conflict do nothing;
  perform _emparelhar(me.region);
end $$;

create function public.sair_fila() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from queue_entries where profile_id = (_eu()).id;
end $$;

create function public.partida_ativa() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  v uuid;
begin
  if me is null then return null; end if;
  v := _partida_ativa(me);
  return case when v is null then null else _partida_json(v, me) end;
end $$;

create function public.partida_detalhe(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select _partida_json(p_match, eu())
$$;

create function public.avancar_partida(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i int := 0;
begin
  perform _eu();
  loop
    i := i + 1;
    exit when i > 15 or not _passo(p_match);
  end loop;
  return _partida_json(p_match, eu());
end $$;

create function public.responder_confirmacao(p_match uuid, p_aceita boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'READY_CHECK' or not exists (select 1 from match_players where match_id = p_match and profile_id = me.id) then
    raise exception 'Esta confirmação já terminou.';
  end if;
  if p_aceita then
    update match_players set accepted = true where match_id = p_match and profile_id = me.id;
    if not exists (select 1 from match_players where match_id = p_match and not accepted) then perform _iniciar_draft(p_match); end if;
  else
    update match_players set accepted = false, accept_at = null where match_id = p_match and profile_id = me.id;
    perform _falhou_confirmacao(p_match);
  end if;
end $$;

create function public.escolher_jogador(p_match uuid, p_jogador uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
  n int;
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'DRAFT_PHASE' then raise exception 'O draft já terminou.'; end if;
  select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
  if m.automatic or (case when n % 2 = 0 then m.captain_a else m.captain_b end) is distinct from me.id then
    raise exception 'Ainda não é a tua vez de escolher.';
  end if;
  perform _escolher(p_match, p_jogador);
end $$;

create function public.banir_mapa(p_match uuid, p_mapa text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
  n int;
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'MAP_BAN' then raise exception 'Os bans já terminaram.'; end if;
  select count(*) into n from match_bans where match_id = p_match;
  if m.automatic or (case when n % 2 = 0 then m.captain_a else m.captain_b end) is distinct from me.id then
    raise exception 'Ainda não é a tua vez de banir.';
  end if;
  perform _banir(p_match, p_mapa);
end $$;

create function public.definir_codigo(p_match uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
  v text := upper(trim(p_codigo));
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'LOBBY_CREATION' then raise exception 'O código já foi partilhado.'; end if;
  if m.captain_a is distinct from me.id or m.automatic then raise exception 'Só o capitão da Equipa A cria o grupo.'; end if;
  if v !~ '^[A-Z0-9]{6}$' then raise exception 'O código tem 6 letras ou números.'; end if;
  perform _comecar(p_match, v);
end $$;

create function public.submeter_resultado(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
  v_erro text;
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if me.id is distinct from m.captain_a and me.id is distinct from m.captain_b then raise exception 'Só os capitães submetem o resultado.'; end if;
  if m.state = 'IN_PROGRESS' then raise exception 'O resultado só abre 15 minutos depois de partilhado o código.'; end if;
  if m.state <> 'RESULT_SUBMISSION' then raise exception 'Esta partida já não aceita resultados.'; end if;
  if exists (select 1 from match_results where match_id = p_match and captain_id = me.id) then raise exception 'Já submeteste o resultado.'; end if;
  v_erro := _resultado_invalido(p_a, p_b);
  if v_erro is not null then raise exception '%', v_erro; end if;
  perform _submeter(p_match, me.id, p_a, p_b);
  -- Se o outro capitão for um bot, confirma daqui a uns segundos.
  update matches set bot_move_at = now() + (1.8 + random() * 1.4) * interval '1 second'
  where id = p_match and state = 'RESULT_SUBMISSION';
end $$;

-- ---------------------------------------------------------------- RPCs: ferramentas de teste (Owner e Dev)

create function public.dev_encher_fila(p_ser_capitao boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_dev();
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  delete from queue_entries where profile_id = me.id;
  -- Uma partida à parte com 9 bots: nunca mistura jogadores reais numa simulação.
  perform _criar_partida(array[me.id] || _bots_livres(9, me.region), me.region, true, false, case when p_ser_capitao then me.id end);
end $$;

create function public.dev_simular_partida() returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_dev();
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  delete from queue_entries where profile_id = me.id;
  perform _criar_partida(array[me.id] || _bots_livres(9, me.region), me.region, true, true, null);
end $$;

create function public.dev_saltar_bloqueio(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform _exigir_dev();
  select * into m from matches where id = p_match for update;
  if not found or not m.simulated then raise exception 'Só dá para saltar o bloqueio em partidas simuladas.'; end if;
  if m.state <> 'IN_PROGRESS' then raise exception 'A partida não está em jogo.'; end if;
  perform _abrir_resultado(p_match);
end $$;

create function public.dev_acelerar(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform _exigir_dev();
  select * into m from matches where id = p_match for update;
  if not found or not m.simulated then raise exception 'Só dá para acelerar partidas simuladas.'; end if;
  update match_players set accept_at = now() where match_id = p_match and accept_at is not null and not accepted;
  update matches set bot_move_at = now(),
    phase_deadline = case when state in ('IN_PROGRESS', 'PROCESSING_API') then now() else phase_deadline end
  where id = p_match;
  perform avancar_partida(p_match);
end $$;

-- ---------------------------------------------------------------- RPCs: Henrik Dev API (só service role)

-- Chamado pela Edge Function processar-partida com as estatísticas tiradas da API.
create function public.aplicar_resultado(p_match uuid, p_a int, p_b int, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'PROCESSING_API' then raise exception 'A partida não está à espera da API.'; end if;
  perform _fechar(p_match, coalesce(p_a, m.score_a), coalesce(p_b, m.score_b), p_stats);
end $$;

-- ---------------------------------------------------------------- RPCs: ranking, perfis e histórico

create function public._forma_curta(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r order by fin), '[]'::jsonb) from (
    select case when mp.team = m.winner then 'V' else 'D' end as r, m.finished_at as fin
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and not m.simulated and mp.team is not null
    order by m.finished_at desc limit 5
  ) x
$$;

create function public.ranking(p_offset int default 0, p_limite int default 50, p_so_amigos boolean default false, p_pesquisa text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  v_q text := replace(replace(lower(coalesce(trim(p_pesquisa), '')), '%', '\%'), '_', '\_');
begin
  return (
    with base as (
      select p.id, row_number() over (order by p.points desc, p.wins desc, p.username) as pos
      from profiles p where not p.is_bot and p.riot_id is not null
    ),
    filtrado as (
      select b.* from base b join profiles p on p.id = b.id
      where (not p_so_amigos or b.id = me or exists (
          select 1 from friends f where f.status = 'accepted'
            and ((f.requester = me and f.addressee = b.id) or (f.addressee = me and f.requester = b.id))))
        and (v_q = '' or lower(p.riot_id) like '%' || v_q || '%' or p.username like '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from filtrado),
      'linhas', coalesce((
        select jsonb_agg(jsonb_build_object('posicao', f.pos, 'perfil', _perfil_json_id(f.id), 'forma', _forma_curta(f.id)) order by f.pos)
        from (select * from filtrado order by pos offset greatest(0, p_offset) limit least(100, greatest(1, p_limite))) f
      ), '[]'::jsonb)
    )
  );
end $$;

create function public.posicao(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pos::int from (
      select id, row_number() over (order by points desc, wins desc, username) as pos
      from profiles where not is_bot and riot_id is not null
    ) x where id = p_perfil
  ), 0)
$$;

create function public.estatisticas_perfil(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and not m.simulated and mp.team is not null
  )
  select jsonb_build_object(
    'partidas', (select count(*) from minhas),
    'vitorias', (select count(*) from minhas where team = winner),
    'kda', (select (sum(kills) + sum(assists))::numeric / greatest(1, sum(deaths)) from minhas where acs is not null),
    'acs', (select avg(acs) from minhas where acs is not null),
    'mvps', (select count(*) from minhas where mvp),
    'firstBloods', (select coalesce(sum(first_bloods), 0) from minhas),
    'posicao', posicao(p_perfil),
    'totalJogadores', (select count(*) from profiles where not is_bot and riot_id is not null)
  )
$$;

create function public.forma_perfil(p_perfil uuid, p_n int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.fin), '[]'::jsonb) from (
    select m.finished_at as fin, jsonb_build_object(
      'partidaId', m.id, 'data', m.finished_at, 'mapa', m.map,
      'adversario', 'Equipa ' || (select _nome(p) from profiles p where p.id = case when mp.team = 'A' then m.captain_b else m.captain_a end),
      'venceu', mp.team = m.winner,
      'resultado', case when mp.team = 'A' then m.score_a || '-' || m.score_b else m.score_b || '-' || m.score_a end,
      'pontos', mp.points_after, 'delta', mp.points_delta,
      'kda', case when mp.kills is not null then (mp.kills + mp.assists)::numeric / greatest(1, mp.deaths) end,
      'mvp', mp.mvp
    ) as j
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and not m.simulated and mp.team is not null
    order by m.finished_at desc limit least(50, greatest(1, p_n))
  ) x
$$;

create function public.historico(p_perfil uuid default null, p_minhas boolean default true, p_mapa text default null, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ref uuid := coalesce(p_perfil, case when p_minhas then eu() end);
  v_linhas jsonb;
  v_n int;
begin
  -- As simuladas só aparecem no histórico de quem as jogou.
  with lista as (
    select m.id, m.finished_at from matches m
    where m.state = 'COMPLETED'
      and (v_ref is null or exists (select 1 from match_players mp where mp.match_id = m.id and mp.profile_id = v_ref and mp.team is not null))
      and (not m.simulated or (p_minhas and p_perfil is null))
      and (p_mapa is null or m.map = p_mapa)
    order by m.finished_at desc
    offset greatest(0, p_offset) limit 21
  )
  select coalesce(jsonb_agg(_resumo_json(l.id, v_ref) order by l.finished_at desc) filter (where l.rn <= 20), '[]'::jsonb), count(*)
  into v_linhas, v_n
  from (select lista.*, row_number() over (order by finished_at desc) rn from lista) l;
  return jsonb_build_object('linhas', v_linhas, 'cursor', case when v_n > 20 then (greatest(0, p_offset) + 20)::text end);
end $$;

-- ---------------------------------------------------------------- RPCs: missões

create function public._progresso_missao(p_perfil uuid, p_tipo text, p_desde timestamptz) returns int
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.finished_at,
      (select round(avg(_divisao(o.tier_snapshot))) from match_players o where o.match_id = m.id and o.team is not null and o.team <> mp.team) as div_adv
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and not m.simulated and mp.team is not null and m.finished_at >= p_desde
  )
  select (case p_tipo
    when 'jogos' then (select count(*) from minhas)
    when 'vitorias' then (select count(*) from minhas where team = winner)
    when 'vitorias_acima' then (select count(*) from minhas where team = winner and div_adv > _divisao(tier_snapshot))
    when 'first_bloods' then (select coalesce(sum(first_bloods), 0) from minhas)
    when 'mvp' then (select count(*) from minhas where mvp)
    when 'acs' then (select coalesce(max(acs), 0) from minhas)
    when 'pontos' then (select points from profiles where id = p_perfil)
    when 'sequencia' then (
      select coalesce(max(c), 0) from (
        select count(*) as c from (
          select team = winner as ganhou, sum(case when team = winner then 0 else 1 end) over (order by finished_at) as grupo from minhas
        ) s where ganhou group by grupo
      ) t)
    else 0 end)::int
$$;

create function public.missoes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := (_eu()).id;
  v_semana timestamptz := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'titulo', q.title, 'descricao', q.description, 'tipo', q.kind, 'alvo', q.target,
      'ambito', case q.scope when 'weekly' then 'semanal' else 'temporada' end,
      'progresso', least(q.target, x.v), 'concluida', x.v >= q.target
    ) order by q.sort), '[]'::jsonb)
    from quests q
    cross join lateral (select _progresso_missao(me, q.kind, case when q.scope = 'weekly' then v_semana else _inicio_temporada() end) as v) x
    where q.active
  );
end $$;

-- ---------------------------------------------------------------- RPCs: amigos

create function public.amigos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'perfil', _perfil_json(p),
      'estado', case f.status when 'accepted' then 'aceite' else 'pendente' end,
      'direcao', case when f.status = 'pending' then case when f.requester = me then 'enviado' else 'recebido' end end,
      'atividade', case when exists (select 1 from matches m join match_players mp on mp.match_id = m.id where mp.profile_id = p.id and m.state not in ('COMPLETED', 'CANCELLED', 'DISPUTE') and m.updated_at > now() - interval '2 hours') then 'jogo' when exists (select 1 from queue_entries q where q.profile_id = p.id) then 'fila' end,
      'ultimaPartida', (select max(m.finished_at) from matches m join match_players mp on mp.match_id = m.id where mp.profile_id = p.id and m.state = 'COMPLETED'),
      'desde', f.created_at
    )), '[]'::jsonb)
    from friends f join profiles p on p.id = case when f.requester = me then f.addressee else f.requester end
    where me in (f.requester, f.addressee)
  );
end $$;

create function public.pedir_amizade(p_alvo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (_eu()).id;
  v_alvo uuid;
  f friends;
begin
  select id into v_alvo from profiles
  where not is_bot and (lower(riot_id) = lower(trim(p_alvo)) or username = lower(trim(p_alvo))) limit 1;
  if v_alvo is null then raise exception 'Não encontrámos ninguém com esse Riot ID ou utilizador.'; end if;
  if v_alvo = me then raise exception 'Não te podes adicionar a ti próprio.'; end if;
  select * into f from friends where (requester = me and addressee = v_alvo) or (requester = v_alvo and addressee = me);
  if found then
    if f.status = 'accepted' then raise exception 'Já são amigos.'; end if;
    if f.requester = me then raise exception 'Já enviaste um pedido a este jogador.'; end if;
    update friends set status = 'accepted', created_at = now() where requester = v_alvo and addressee = me;
    return;
  end if;
  insert into friends (requester, addressee) values (me, v_alvo);
end $$;

create function public.responder_amizade(p_perfil uuid, p_aceitar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  if p_aceitar then
    update friends set status = 'accepted', created_at = now() where requester = p_perfil and addressee = me and status = 'pending';
  else
    delete from friends where requester = p_perfil and addressee = me and status = 'pending';
  end if;
  if not found then raise exception 'Este pedido já não existe.'; end if;
end $$;

create function public.remover_amigo(p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  delete from friends where (requester = me and addressee = p_perfil) or (requester = p_perfil and addressee = me);
end $$;

-- ---------------------------------------------------------------- RPCs: sugestões e denúncias

create function public.sugestoes(p_ordem text default 'votos') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := eu();
begin
  return (
    select coalesce(jsonb_agg(j order by case when p_ordem = 'votos' then votos end desc nulls last, criada desc), '[]'::jsonb) from (
      select s.created_at as criada, (select count(*) from suggestion_votes v where v.suggestion_id = s.id) as votos,
        jsonb_build_object(
          'id', s.id, 'titulo', s.title, 'descricao', s.description, 'categoria', s.category,
          'estado', case s.status when 'received' then 'recebida' when 'review' then 'analise' when 'planned' then 'planeada' else 'feita' end,
          'autor', coalesce((select _nome(p) from profiles p where p.id = s.author_id), 'Jogador'),
          'criadaEm', s.created_at,
          'votos', (select count(*) from suggestion_votes v where v.suggestion_id = s.id),
          'votei', exists (select 1 from suggestion_votes v where v.suggestion_id = s.id and v.profile_id = me)
        ) as j
      from suggestions s
    ) x
  );
end $$;

create function public.criar_sugestao(p_titulo text, p_categoria text, p_descricao text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (_eu()).id;
  v_id uuid;
begin
  if char_length(trim(p_titulo)) < 6 then raise exception 'Dá um título com pelo menos 6 caracteres.'; end if;
  if char_length(trim(p_descricao)) < 10 then raise exception 'Explica a ideia em pelo menos 10 caracteres.'; end if;
  if (select count(*) from suggestions where author_id = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Já fizeste 5 sugestões hoje. Volta amanhã.';
  end if;
  insert into suggestions (author_id, title, description, category)
  values (me, left(trim(p_titulo), 80), left(trim(p_descricao), 500), left(p_categoria, 30)) returning id into v_id;
  insert into suggestion_votes (suggestion_id, profile_id) values (v_id, me);
end $$;

create function public.votar(p_sugestao uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  delete from suggestion_votes where suggestion_id = p_sugestao and profile_id = me;
  if not found then insert into suggestion_votes (suggestion_id, profile_id) values (p_sugestao, me); end if;
end $$;

create function public.denunciar(p_alvo uuid, p_motivo text, p_detalhes text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  if p_alvo = me then raise exception 'Não te podes denunciar a ti próprio.'; end if;
  if char_length(trim(p_detalhes)) < 10 then raise exception 'Conta o que aconteceu em pelo menos 10 caracteres.'; end if;
  if (select count(*) from reports where reporter_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Já fizeste muitas denúncias hoje.';
  end if;
  insert into reports (reporter_id, target_id, reason, details) values (me, p_alvo, left(p_motivo, 40), left(trim(p_detalhes), 1000));
end $$;

-- ---------------------------------------------------------------- RPCs: staff

create function public.disputas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_staff();
  return (select coalesce(jsonb_agg(_partida_json(id, me.id) order by updated_at), '[]'::jsonb) from matches where state = 'DISPUTE');
end $$;

create function public.resolver_disputa(p_match uuid, p_a int default null, p_b int default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  v_erro text;
begin
  perform _exigir_staff();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'DISPUTE' then raise exception 'Esta disputa já foi resolvida.'; end if;
  if p_a is null then
    update matches set state = 'CANCELLED', finished_at = now(), updated_at = now() where id = p_match;
    return;
  end if;
  v_erro := _resultado_invalido(p_a, p_b);
  if v_erro is not null then raise exception '%', v_erro; end if;
  perform _fechar(p_match, p_a, p_b, case when m.simulated then _estatisticas_simuladas(p_match) end);
end $$;

create function public.partidas_encravadas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_staff();
  return (
    select coalesce(jsonb_agg(_partida_json(id, me.id) order by updated_at), '[]'::jsonb) from matches
    where (state in ('READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'PROCESSING_API') and updated_at < now() - interval '10 minutes')
       or (state in ('IN_PROGRESS', 'RESULT_SUBMISSION') and updated_at < now() - interval '3 hours')
  );
end $$;

create function public.cancelar_partida(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_staff();
  update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match and state not in ('COMPLETED', 'CANCELLED');
  if not found then raise exception 'Esta partida já terminou.'; end if;
end $$;

create function public.denuncias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir_staff();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'denunciante', coalesce((select _nome(p) from profiles p where p.id = r.reporter_id), '?'),
      'alvo', _perfil_json_id(r.target_id),
      'motivo', r.reason, 'detalhes', r.details,
      'estado', case r.status when 'open' then 'aberta' when 'resolved' then 'resolvida' else 'arquivada' end,
      'criadaEm', r.created_at
    ) order by (r.status <> 'open'), r.created_at desc), '[]'::jsonb)
    from reports r
  );
end $$;

create function public.tratar_denuncia(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_staff();
  update reports set status = case p_estado when 'resolvida' then 'resolved' else 'archived' end, handled_by = me.id, handled_at = now()
  where id = p_id;
end $$;

create function public.pesquisar_jogadores(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := replace(replace(lower(coalesce(trim(p_q), '')), '%', '\%'), '_', '\_');
begin
  perform _exigir_staff();
  return (
    select coalesce(jsonb_agg(_perfil_json(p) order by p.username), '[]'::jsonb) from (
      select * from profiles where not is_bot and (v_q = '' or username like '%' || v_q || '%' or lower(riot_id) like '%' || v_q || '%')
      order by username limit 25
    ) p
  );
end $$;

create function public.definir_funcao(p_perfil uuid, p_funcao public.user_role) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  alvo profiles;
begin
  me := _exigir_staff();
  select * into alvo from profiles where id = p_perfil;
  if not found then raise exception 'Jogador não encontrado.'; end if;
  if alvo.id = me.id then raise exception 'Não podes mudar a tua própria função.'; end if;
  if me.role = 'mod' then raise exception 'Só Owner e Dev mudam funções.'; end if;
  if (p_funcao in ('owner', 'dev') or alvo.role = 'owner') and me.role <> 'owner' then
    raise exception 'Só o Owner atribui ou retira as funções Owner e Dev.';
  end if;
  update profiles set role = p_funcao where id = p_perfil;
end $$;

-- ---------------------------------------------------------------- contas novas (Discord)

create function public._novo_utilizador() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_nome text;
  k int := 0;
begin
  v_base := lower(regexp_replace(coalesce(
    new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'jogador'), '#0$', ''));
  v_base := left(regexp_replace(v_base, '[^a-z0-9_.]', '', 'g'), 24);
  if char_length(v_base) < 2 then v_base := 'jogador'; end if;
  v_nome := v_base;
  while exists (select 1 from profiles where username = v_nome) loop
    k := k + 1;
    v_nome := v_base || k;
  end loop;
  insert into profiles (auth_id, username, avatar_url) values (new.id, v_nome, new.raw_user_meta_data ->> 'avatar_url');
  return new;
end $$;

create trigger ao_criar_utilizador after insert on auth.users
for each row execute function public._novo_utilizador();

-- ---------------------------------------------------------------- acessos

alter table public.profiles enable row level security;
alter table public.queue_entries enable row level security;
alter table public.matches enable row level security;
alter table public.match_secrets enable row level security;
alter table public.match_players enable row level security;
alter table public.match_bans enable row level security;
alter table public.match_results enable row level security;
alter table public.friends enable row level security;
alter table public.quests enable row level security;
alter table public.suggestions enable row level security;
alter table public.suggestion_votes enable row level security;
alter table public.reports enable row level security;

-- Leitura: o hub é público para quem tem conta; escrita só pelos RPCs.
create policy "ler perfis" on public.profiles for select to authenticated using (true);
create policy "ler fila" on public.queue_entries for select to authenticated using (true);
create policy "ler partidas" on public.matches for select to authenticated using (true);
create policy "ler jogadores" on public.match_players for select to authenticated using (true);
create policy "ler bans" on public.match_bans for select to authenticated using (true);
create policy "ler resultados" on public.match_results for select to authenticated using (true);
create policy "ler código do grupo" on public.match_secrets for select to authenticated
  using (exists (select 1 from public.match_players mp where mp.match_id = match_secrets.match_id and mp.profile_id = public.eu()) or public.e_staff(public.eu()));
create policy "ler as minhas amizades" on public.friends for select to authenticated using (public.eu() in (requester, addressee));
create policy "ler missões" on public.quests for select to authenticated using (true);
create policy "ler sugestões" on public.suggestions for select to authenticated using (true);
create policy "ler votos" on public.suggestion_votes for select to authenticated using (true);
create policy "staff lê denúncias" on public.reports for select to authenticated using (public.e_staff(public.eu()));

-- As funções internas não se chamam do browser; aplicar_resultado é só da Edge Function.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like '\_%' or p.proname = 'aplicar_resultado')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
end $$;

-- O trigger corre como dono da função, por isso não precisa de permissões do cliente.
revoke execute on function public.eu() from anon;
