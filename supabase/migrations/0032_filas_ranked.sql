-- Duas filas: a aberta (qualquer rank) e a ranked (só Ascendente 1 ou mais).
--
--   * Cada pessoa está numa fila de cada vez (queue_entries.fila) e cada partida fica marcada com a fila
--     onde nasceu (matches.fila). As partidas formam-se dentro de cada fila, por região.
--   * Entrar na ranked exige o rank oficial Ascendente 1 ou mais (profiles.official_tier >= 21): é a base
--     de dados que decide, não o site. O cargo "Ranked" do Discord é só para ver o canal.
--   * Os pontos são separados: profiles.points/wins/losses continuam a ser os da fila aberta (é onde todas as
--     partidas até hoje foram jogadas) e a ranked tem os seus (ranked_points, ranked_wins, ranked_losses).
--     O nível (XP), as missões e o Rangify Score continuam a contar as partidas das duas filas.
--   * A tabela de pontos, a posição e o overlay do OBS passam a ter a fila de que falam.
--
-- Corre depois de 0001 a 0031. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- esquema

alter table public.queue_entries add column if not exists fila text not null default 'aberta' check (fila in ('aberta', 'ranked'));
create index if not exists queue_entries_fila on public.queue_entries (region, fila, joined_at);

alter table public.matches add column if not exists fila text not null default 'aberta' check (fila in ('aberta', 'ranked'));
create index if not exists matches_fila_terminadas on public.matches (fila, finished_at desc) where state = 'COMPLETED';

alter table public.profiles
  add column if not exists ranked_points int not null default 1000,
  add column if not exists ranked_wins int not null default 0,
  add column if not exists ranked_losses int not null default 0;
create index if not exists profiles_ranking_ranked on public.profiles (ranked_points desc, ranked_wins desc, username)
  where not is_bot and riot_id is not null and ranked_wins + ranked_losses > 0;

alter table public.config add column if not exists discord_fila_ranked_message text;

-- ---------------------------------------------------------------- regras

/** O rank oficial mínimo da fila ranked: Ascendente 1 (currenttier 21). */
create or replace function public._tier_minimo_ranked() returns int
language sql immutable as $$ select 21 $$;

create or replace function public._pode_ranked(p public.profiles) returns boolean
language sql stable as $$ select p.official_tier >= _tier_minimo_ranked() $$;

create or replace function public._fila_valida(p_fila text) returns void
language plpgsql immutable as $$
begin
  if p_fila is null or p_fila not in ('aberta', 'ranked') then raise exception 'Escolhe a fila aberta ou a ranked.'; end if;
end $$;

-- ---------------------------------------------------------------- estado da fila

/** O estado da fila: a em que estás, quantos há em cada uma (na tua região) e se podes entrar na ranked. */
create or replace function public.estado_fila() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
  v_fila text;
begin
  me := _eu();
  select * into q from queue_entries where profile_id = me.id;
  v_fila := coalesce(q.fila, 'aberta');
  return jsonb_build_object(
    'naFila', q.profile_id is not null,
    'fila', case when q.profile_id is not null then q.fila end,
    'desde', q.joined_at,
    'contagem', (select count(*) from queue_entries where region = me.region and fila = v_fila),
    'contagemAberta', (select count(*) from queue_entries where region = me.region and fila = 'aberta'),
    'contagemRanked', (select count(*) from queue_entries where region = me.region and fila = 'ranked'),
    'rankedPermitido', _pode_ranked(me),
    'regiao', me.region,
    'cooldownAte', case when me.cooldown_until > now() then me.cooldown_until end,
    'agora', now(),
    'ban', _ban_json(me)
  );
end $$;

-- Entrar na fila ganha o argumento da fila; a versão sem argumentos desaparece (ficavam duas lado a lado).
drop function if exists public.entrar_fila();

create or replace function public.entrar_fila(p_fila text default 'aberta') returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
begin
  me := _eu();
  perform _fila_valida(p_fila);
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
  if p_fila = 'ranked' and not _pode_ranked(me) then
    raise exception 'A fila ranked é só para Ascendente 1 ou mais.';
  end if;
  -- Uma fila de cada vez: quem já está noutra tem de sair primeiro.
  select * into q from queue_entries where profile_id = me.id;
  if found then
    if q.fila = p_fila then perform _emparelhar(me.region, p_fila); return; end if;
    raise exception 'Já estás na fila %. Sai dela para entrares na outra.', case when q.fila = 'ranked' then 'ranked' else 'aberta' end;
  end if;
  insert into queue_entries (profile_id, region, fila) values (me.id, me.region, p_fila) on conflict do nothing;
  perform _emparelhar(me.region, p_fila);
end $$;

-- ---------------------------------------------------------------- partidas

-- Forma partidas dentro de cada fila (a região e a fila são o que junta os dez).
drop function if exists public._emparelhar(text);

create or replace function public._emparelhar(p_region text, p_fila text default 'aberta') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || p_region || ':' || p_fila));
  perform _limpar_fila();
  select array_agg(profile_id) into v_ids from (
    select profile_id from queue_entries where region = p_region and fila = p_fila order by joined_at limit 10
  ) q;
  if coalesce(array_length(v_ids, 1), 0) < 10 then return null; end if;
  return _criar_partida(v_ids, p_region, false, false, null, p_fila);
end $$;

drop function if exists public._criar_partida(uuid[], text, boolean, boolean, uuid);

create or replace function public._criar_partida(p_ids uuid[], p_region text, p_simulada boolean, p_automatica boolean, p_forcar uuid, p_fila text default 'aberta')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- Cada partida guarda a pool de mapas do momento em que nasce: mudar a rotação não estraga as que já decorrem.
  insert into matches (code, state, region, fila, simulated, automatic, forced_captain, map_pool, ready_deadline, phase_started_at, phase_deadline)
  values ('RG-' || nextval('match_code_seq'), 'READY_CHECK', p_region, coalesce(p_fila, 'aberta'), p_simulada, p_automatica, p_forcar, _pool_ativa(),
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

-- ---------------------------------------------------------------- pontos de cada fila

/** Quando a partida fecha, os pontos, as vitórias e as derrotas vão para a tabela da fila onde ela foi jogada. */
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
    if m.fila = 'ranked' then
      update profiles set ranked_points = ranked_points + v_delta,
        ranked_wins = ranked_wins + case when r.team = v_win then 1 else 0 end,
        ranked_losses = ranked_losses + case when r.team = v_win then 0 else 1 end
      where id = r.profile_id;
    else
      update profiles set points = points + v_delta,
        wins = wins + case when r.team = v_win then 1 else 0 end,
        losses = losses + case when r.team = v_win then 0 else 1 end
      where id = r.profile_id;
    end if;
    update match_players set points_delta = v_delta,
      points_perf = case when r.rangify_score is not null then v_perf end,
      points_after = (select case when m.fila = 'ranked' then ranked_points else points end from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, points_applied = true, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

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
    -- Só mexe no perfil se esta partida já lhe tinha dado pontos (na tabela da fila onde foi jogada).
    if m.points_applied and v_dif <> 0 then
      if m.fila = 'ranked' then
        update profiles set ranked_points = ranked_points + v_dif where id = r.profile_id;
      else
        update profiles set points = points + v_dif where id = r.profile_id;
      end if;
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

-- Remover uma partida devolve os pontos à tabela da fila onde ela foi jogada.
create or replace function public.remover_partida(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_jogadores uuid[];
  v_id uuid;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('COMPLETED', 'CANCELLED') then raise exception 'Cancela a partida antes de a remover.'; end if;
  v_jogadores := array(select profile_id from match_players where match_id = p_match and team is not null);
  if m.state = 'COMPLETED' and m.points_applied then
    for r in select profile_id, team, points_delta from match_players where match_id = p_match and team is not null and points_delta is not null loop
      if m.fila = 'ranked' then
        update profiles set
          ranked_points = ranked_points - r.points_delta,
          ranked_wins = greatest(0, ranked_wins - case when r.team = m.winner then 1 else 0 end),
          ranked_losses = greatest(0, ranked_losses - case when r.team = m.winner then 0 else 1 end)
        where id = r.profile_id;
      else
        update profiles set
          points = points - r.points_delta,
          wins = greatest(0, wins - case when r.team = m.winner then 1 else 0 end),
          losses = greatest(0, losses - case when r.team = m.winner then 0 else 1 end)
        where id = r.profile_id;
      end if;
    end loop;
  end if;
  delete from matches where id = p_match;
  foreach v_id in array v_jogadores loop
    perform _atualizar_missoes(v_id, true);
  end loop;
end $$;

-- A staff acerta os pontos à mão numa das duas tabelas.
drop function if exists public.definir_pontos(uuid, int);

create or replace function public.definir_pontos(p_perfil uuid, p_pontos int, p_fila text default 'aberta') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_owner_dev();
  perform _fila_valida(p_fila);
  if p_pontos is null or p_pontos < 0 or p_pontos > 10000 then raise exception 'Os pontos têm de estar entre 0 e 10000.'; end if;
  if p_fila = 'ranked' then
    update profiles set ranked_points = p_pontos where id = p_perfil and not is_bot;
  else
    update profiles set points = p_pontos where id = p_perfil and not is_bot;
  end if;
  if not found then raise exception 'Jogador não encontrado.'; end if;
end $$;

-- ---------------------------------------------------------------- JSON para o site

/** O perfil já com os números de cada fila (pontos, vitórias e derrotas da aberta e da ranked). */
create or replace function public._perfil_json(p public.profiles) returns jsonb
language sql stable as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'utilizador', p.username, 'avatarUrl', p.avatar_url, 'riotId', p.riot_id, 'regiao', p.region,
    'tier', p.official_tier, 'rr', p.official_rr, 'rankAtualizadoEm', p.rank_synced_at, 'pontos', p.points,
    'vitorias', p.wins, 'derrotas', p.losses,
    'pontosRanked', p.ranked_points, 'vitoriasRanked', p.ranked_wins, 'derrotasRanked', p.ranked_losses,
    'funcao', p.role, 'funcaoJogo', p.game_role, 'bot', p.is_bot,
    'cooldownAte', p.cooldown_until, 'tourVistoEm', p.tour_seen_at, 'temPassword', p.has_password, 'criadoEm', p.created_at
  ) end
$$;

/** O perfil com "pontos", "vitorias" e "derrotas" da fila pedida (é o que as tabelas mostram). */
create or replace function public._perfil_json_fila(p_id uuid, p_fila text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_fila = 'ranked'
    then _perfil_json(p) || jsonb_build_object('pontos', p.ranked_points, 'vitorias', p.ranked_wins, 'derrotas', p.ranked_losses)
    else _perfil_json(p) end
  from profiles p where p.id = p_id
$$;

/** As últimas 5 partidas (V ou D), todas ou só de uma fila. */
create or replace function public._forma_curta(p_perfil uuid, p_fila text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r order by fin), '[]'::jsonb) from (
    select case when mp.team = m.winner then 'V' else 'D' end as r, m.finished_at as fin
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null and (p_fila is null or m.fila = p_fila)
    order by m.finished_at desc limit 5
  ) x
$$;

create or replace function public._forma_curta(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select _forma_curta(p_perfil, null)
$$;

/** A forma recente de um jogador (de 0012) com a fila de cada partida, para o painel mostrar só a da fila escolhida. */
create or replace function public.forma_perfil(p_perfil uuid, p_n int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.fin), '[]'::jsonb) from (
    select m.finished_at as fin, jsonb_build_object(
      'partidaId', m.id, 'data', m.finished_at, 'mapa', m.map, 'fila', m.fila,
      'adversario', 'Equipa ' || (select _nome(p) from profiles p where p.id = case when mp.team = 'A' then m.captain_b else m.captain_a end),
      'venceu', mp.team = m.winner,
      'resultado', case when mp.team = 'A' then m.score_a || '-' || m.score_b else m.score_b || '-' || m.score_a end,
      'pontos', mp.points_after, 'delta', mp.points_delta,
      'kda', case when mp.kills is not null then (mp.kills + mp.assists)::numeric / greatest(1, mp.deaths) end,
      'acs', mp.acs,
      'rs', mp.rangify_score,
      'mvp', mp.mvp
    ) as j
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
    order by m.finished_at desc limit least(50, greatest(1, p_n))
  ) x
$$;

/** O resumo de uma partida no histórico (de 0012) com a fila em que foi jogada. */
create or replace function public._resumo_json(p_match uuid, p_ref uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select * from matches where id = p_match),
  meu as (select * from match_players where match_id = p_match and profile_id = p_ref and team is not null)
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'mapa', m.map, 'estado', m.state, 'resultadoA', m.score_a, 'resultadoB', m.score_b,
    'vencedor', m.winner, 'terminouEm', m.finished_at, 'simulada', m.simulated, 'fila', m.fila,
    'capitaoA', (select _nome(p) from profiles p where p.id = m.captain_a),
    'capitaoB', (select _nome(p) from profiles p where p.id = m.captain_b),
    'tierMedioA', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'A')),
    'tierMedioB', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'B')),
    'duracaoMin', case when m.started_at is not null and m.finished_at is not null then round(extract(epoch from m.finished_at - m.started_at) / 60)::int end,
    'mvp', (select _nome(p) from match_players mp join profiles p on p.id = mp.profile_id where mp.match_id = m.id and mp.mvp limit 1),
    'minha', (select jsonb_build_object(
        'equipa', meu.team, 'venceu', meu.team = m.winner, 'deltaPontos', meu.points_delta, 'kills', meu.kills,
        'deaths', meu.deaths, 'assists', meu.assists, 'acs', meu.acs, 'mvp', meu.mvp,
        'rangifyScore', meu.rangify_score, 'agente', meu.agent,
        'tierAdversario', _tier_de_divisao((select avg(_divisao(o.tier_snapshot)) from match_players o where o.match_id = m.id and o.team is not null and o.team <> meu.team))
      ) from meu)
  ) from m
$$;

/** Já jogou pelo menos uma partida, em qualquer das filas: é o que põe alguém nas tabelas de nível, Rangify Score e agentes. */
create or replace function public._na_tabela(p public.profiles) returns boolean
language sql stable as $$
  select not p.is_bot and p.riot_id is not null and p.wins + p.losses + p.ranked_wins + p.ranked_losses > 0
$$;

/** Já jogou pelo menos uma partida aberta: é o que põe alguém na tabela de pontos da aberta. */
create or replace function public._na_tabela_aberta(p public.profiles) returns boolean
language sql stable as $$
  select not p.is_bot and p.riot_id is not null and p.wins + p.losses > 0
$$;

/** Já jogou pelo menos uma partida ranked: é o que põe alguém na tabela ranked. Bots e contas sem Riot ID nunca entram. */
create or replace function public._na_tabela_ranked(p public.profiles) returns boolean
language sql stable as $$
  select not p.is_bot and p.riot_id is not null and p.ranked_wins + p.ranked_losses > 0
$$;

drop function if exists public.ranking(int, int, boolean, text);

create or replace function public.ranking(p_offset int default 0, p_limite int default 50, p_so_amigos boolean default false, p_pesquisa text default '', p_fila text default 'aberta')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  v_q text := replace(replace(lower(coalesce(trim(p_pesquisa), '')), '%', '\%'), '_', '\_');
  v_ranked boolean := p_fila = 'ranked';
begin
  perform _fila_valida(p_fila);
  return (
    with base as (
      select p.id, row_number() over (
        order by case when v_ranked then p.ranked_points else p.points end desc,
                 case when v_ranked then p.ranked_wins else p.wins end desc, p.username) as pos
      from profiles p where case when v_ranked then _na_tabela_ranked(p) else _na_tabela_aberta(p) end
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
        select jsonb_agg(jsonb_build_object('posicao', f.pos, 'perfil', _perfil_json_fila(f.id, p_fila), 'forma', _forma_curta(f.id, p_fila)) order by f.pos)
        from (select * from filtrado order by pos offset greatest(0, p_offset) limit least(100, greatest(1, p_limite))) f
      ), '[]'::jsonb)
    )
  );
end $$;

/** A posição na tabela de pontos de uma fila; 0 enquanto o jogador não tiver jogado nela. */
drop function if exists public.posicao(uuid);

create or replace function public.posicao(p_perfil uuid, p_fila text default 'aberta') returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pos::int from (
      select p.id, row_number() over (
        order by case when p_fila = 'ranked' then p.ranked_points else p.points end desc,
                 case when p_fila = 'ranked' then p.ranked_wins else p.wins end desc, p.username) as pos
      from profiles p where case when p_fila = 'ranked' then _na_tabela_ranked(p) else _na_tabela_aberta(p) end
    ) x where id = p_perfil
  ), 0)
$$;

/** Quantos jogadores há na tabela de uma fila. */
create or replace function public.total_tabela(p_fila text default 'aberta') returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from profiles p where case when p_fila = 'ranked' then _na_tabela_ranked(p) else _na_tabela_aberta(p) end
$$;

/** As estatísticas do perfil, com a posição nas duas tabelas (aberta e ranked). */
create or replace function public.estatisticas_perfil(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.map, m.finished_at, mp.team = m.winner as ganhou
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
  ),
  com as (select * from minhas where acs is not null),
  grupos as (
    select ganhou, sum(case when ganhou then 0 else 1 end) over (order by finished_at) as grupo from minhas
  ),
  ultima as (select ganhou from minhas order by finished_at desc limit 1)
  select jsonb_build_object(
    'partidas', (select count(*) from minhas),
    'vitorias', (select count(*) from minhas where ganhou),
    'kda', (select (sum(kills) + sum(assists))::numeric / greatest(1, sum(deaths)) from com),
    'kd', (select sum(kills)::numeric / greatest(1, sum(deaths)) from com),
    'acs', (select avg(acs) from com),
    'rangifyScore', (select avg(rangify_score) from minhas where rangify_score is not null),
    'melhorRs', (select max(rangify_score) from minhas),
    'killsMedia', (select avg(kills) from com),
    'mortesMedia', (select avg(deaths) from com),
    'assistMedia', (select avg(assists) from com),
    'hsPct', (select avg(hs_pct) from minhas where hs_pct is not null),
    'kastPct', (select avg(kast_pct) from minhas where kast_pct is not null),
    'tradesMedia', (select avg(trades) from minhas where trades is not null),
    'fbMedia', (select avg(first_bloods) from com),
    'mvps', (select count(*) from minhas where mvp),
    'firstBloods', (select coalesce(sum(first_bloods), 0) from minhas),
    'melhorAcs', (select max(acs) from com),
    'maisKills', (select max(kills) from com),
    'melhorSequencia', (select coalesce(max(c), 0) from (select count(*) as c from grupos where ganhou group by grupo) t),
    -- Positivo: vitórias seguidas desde a última derrota; negativo: derrotas desde a última vitória.
    'sequenciaAtual', coalesce((
      select case when u.ganhou
        then (select count(*) from minhas where ganhou and finished_at > coalesce((select max(finished_at) from minhas where not ganhou), '-infinity'))
        else -(select count(*) from minhas where not ganhou and finished_at > coalesce((select max(finished_at) from minhas where ganhou), '-infinity'))
      end from ultima u), 0),
    'capitao', jsonb_build_object(
      'partidas', (select count(*) from minhas where is_captain),
      'vitorias', (select count(*) from minhas where is_captain and ganhou)
    ),
    'porMapa', coalesce((
      select jsonb_agg(jsonb_build_object('mapa', map, 'partidas', n, 'vitorias', v, 'acs', a, 'rs', rs) order by n desc, map)
      from (select map, count(*) as n, count(*) filter (where ganhou) as v, avg(acs) as a, avg(rangify_score) as rs from minhas group by map) x
    ), '[]'::jsonb),
    'porAgente', coalesce((
      select jsonb_agg(jsonb_build_object('agente', agent, 'partidas', n, 'vitorias', v, 'acs', a, 'rs', rs) order by n desc, agent)
      from (select agent, count(*) as n, count(*) filter (where ganhou) as v, avg(acs) as a, avg(rangify_score) as rs
            from minhas where agent is not null group by agent) x
    ), '[]'::jsonb),
    'posicao', posicao(p_perfil),
    'totalJogadores', total_tabela('aberta'),
    'posicaoRanked', posicao(p_perfil, 'ranked'),
    'totalRanked', total_tabela('ranked')
  )
$$;

/** A partida, com a fila onde foi jogada e, nos jogadores, os pontos dessa fila. */
create or replace function public._partida_json(p_match uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'estado', m.state, 'regiao', m.region, 'fila', m.fila, 'mapa', m.map,
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
        'tier', mp.tier_snapshot, 'pontos', case when m.fila = 'ranked' then p.ranked_points else p.points end,
        'funcaoJogo', p.game_role, 'bot', p.is_bot,
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
      select jsonb_agg(jsonb_build_object('capitaoId', r.captain_id, 'vencedor', r.vencedor, 'em', r.submitted_at) order by r.submitted_at)
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

-- ---------------------------------------------------------------- overlay do OBS

-- O overlay mostra a fila em que a pessoa está a jogar (ou a que jogou por último), com os pontos e a posição dessa tabela.
-- O endereço pode fixar a fila (?fila=ranked ou ?fila=aberta); sem isso, o overlay escolhe sozinho.
drop function if exists public.overlay_dados(text);

create or replace function public.overlay_dados(p_chave text, p_fila text default null) returns jsonb
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
  v_tipo text;
begin
  select pr.* into p from overlay_chaves k join profiles pr on pr.id = k.profile_id where k.chave = p_chave;
  if not found or not _streamers_visivel(p) then return null; end if;

  -- Em partida ou na fila: a fila de agora. Senão: a fila da última partida (ou a aberta, se ainda não jogou).
  select m.fila into v_tipo
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and not m.automatic
    and m.state in ('READY_CHECK', 'DRAFT_PHASE', 'MAP_BAN', 'LOBBY_CREATION', 'IN_PROGRESS', 'RESULT_SUBMISSION', 'PROCESSING_API')
  order by m.created_at desc limit 1;
  if v_tipo is null then select q.fila into v_tipo from queue_entries q where q.profile_id = p.id; end if;
  if v_tipo is null then
    select m.fila into v_tipo
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p.id and mp.team is not null and m.state = 'COMPLETED' and not m.automatic
    order by m.finished_at desc nulls last limit 1;
  end if;
  if p_fila in ('aberta', 'ranked') then v_tipo := p_fila; end if;
  v_tipo := coalesce(v_tipo, 'aberta');

  select jsonb_build_object(
    'vitorias', count(*) filter (where mp.team = m.winner),
    'derrotas', count(*) filter (where mp.team <> m.winner),
    'delta', coalesce(sum(mp.points_delta), 0)
  ) into v_hoje
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and mp.team is not null and m.state = 'COMPLETED' and not m.automatic and m.finished_at >= v_inicio
    and m.fila = v_tipo;

  select jsonb_build_object(
    'estado', m.state, 'codigo', m.code, 'mapa', m.map, 'equipa', mp.team, 'comecouEm', m.started_at, 'fila', m.fila
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
        'contagem', (select count(*) from queue_entries where region = v_fila.region and fila = v_fila.fila),
        'desde', v_fila.joined_at
      );
    end if;
  end if;

  select jsonb_build_object(
    'codigo', m.code, 'mapa', m.map, 'venceu', mp.team = m.winner,
    'rondasFeitas', case when mp.team = 'A' then m.score_a else m.score_b end,
    'rondasSofridas', case when mp.team = 'A' then m.score_b else m.score_a end,
    'delta', mp.points_delta, 'terminouEm', m.finished_at, 'fila', m.fila
  ) into v_ultima
  from match_players mp join matches m on m.id = mp.match_id
  where mp.profile_id = p.id and mp.team is not null and m.state = 'COMPLETED' and not m.automatic and m.fila = v_tipo
  order by m.finished_at desc nulls last limit 1;

  return jsonb_build_object(
    'nome', _nome(p), 'riotId', p.riot_id, 'avatarUrl', p.avatar_url,
    'tier', p.official_tier, 'rr', p.official_rr,
    'filaTipo', v_tipo,
    'pontos', case when v_tipo = 'ranked' then p.ranked_points else p.points end,
    'vitorias', case when v_tipo = 'ranked' then p.ranked_wins else p.wins end,
    'derrotas', case when v_tipo = 'ranked' then p.ranked_losses else p.losses end,
    'posicao', posicao(p.id, v_tipo),
    'hoje', coalesce(v_hoje, jsonb_build_object('vitorias', 0, 'derrotas', 0, 'delta', 0)),
    'estado', v_estado, 'fila', v_fila_json, 'partida', v_partida, 'ultima', v_ultima,
    'twitch', (select t.login from twitch_contas t where t.profile_id = p.id),
    'codigoConvite', (select c.codigo from convite_codigos c where c.profile_id = p.id),
    'agora', now()
  );
end $$;

-- ---------------------------------------------------------------- Discord

/** Alguém entrou ou saiu de uma fila: pede à função que atualize os textos (das filas cuja mensagem já existe). */
create or replace function public._tg_discord_fila() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from config where id and (discord_fila_message is not null or discord_fila_ranked_message is not null)) then
    perform _discord('fila', null);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------- ferramentas de teste (Owner e Dev)

drop function if exists public.dev_encher_fila(boolean);

create or replace function public.dev_encher_fila(p_ser_capitao boolean, p_fila text default 'aberta') returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _exigir_dev();
  perform _fila_valida(p_fila);
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  delete from queue_entries where profile_id = me.id;
  -- Uma partida à parte com 9 bots: nunca mistura jogadores reais numa simulação.
  perform _criar_partida(array[me.id] || _bots_livres(9, me.region), me.region, true, false, case when p_ser_capitao then me.id end, p_fila);
end $$;

/** Tu e os teus amigos que estão na tua fila (a aberta, se não estás em nenhuma) e bots para o resto. */
create or replace function public.dev_completar_fila(p_ser_capitao boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  v_ids uuid[];
  v_faltam int;
  v_fila text;
begin
  me := _exigir_dev();
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  v_fila := coalesce((select q.fila from queue_entries q where q.profile_id = me.id), 'aberta');
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || me.region || ':' || v_fila));

  -- Tu e, por ordem de chegada, os teus amigos que estão na mesma fila e região (no máximo 9).
  select array_agg(id order by ordem) into v_ids from (
    select me.id as id, 0 as ordem
    union all
    select * from (
      select q.profile_id, row_number() over (order by q.joined_at)
      from queue_entries q
      join friends f on f.status = 'accepted'
        and ((f.requester = me.id and f.addressee = q.profile_id) or (f.addressee = me.id and f.requester = q.profile_id))
      join profiles p on p.id = q.profile_id
      where q.region = me.region and q.fila = v_fila and q.profile_id <> me.id and not p.is_bot and _partida_ativa(q.profile_id) is null
      order by q.joined_at
      limit 9
    ) amigos
  ) t;

  v_faltam := 10 - coalesce(array_length(v_ids, 1), 0);
  if v_faltam > 0 then v_ids := v_ids || _bots_livres(v_faltam, me.region); end if;

  perform _criar_partida(v_ids, me.region, true, false, case when p_ser_capitao then me.id end, v_fila);
end $$;

-- ---------------------------------------------------------------- acessos

revoke all on function
  public._tier_minimo_ranked(), public._pode_ranked(public.profiles), public._fila_valida(text),
  public._emparelhar(text, text), public._criar_partida(uuid[], text, boolean, boolean, uuid, text),
  public._perfil_json_fila(uuid, text), public._forma_curta(uuid, text), public._na_tabela_aberta(public.profiles),
  public._na_tabela_ranked(public.profiles)
  from public, anon, authenticated;
grant execute on function
  public._tier_minimo_ranked(), public._pode_ranked(public.profiles), public._fila_valida(text),
  public._emparelhar(text, text), public._criar_partida(uuid[], text, boolean, boolean, uuid, text),
  public._perfil_json_fila(uuid, text), public._forma_curta(uuid, text), public._na_tabela_aberta(public.profiles),
  public._na_tabela_ranked(public.profiles)
  to service_role;
-- As que já existiam voltam a ter o acesso de antes (a "create or replace" não lhes mexe, mas as novas assinaturas sim).
revoke all on function public._perfil_json(public.profiles), public._forma_curta(uuid),
  public._fechar(uuid, int, int, jsonb), public._recalcular(uuid, jsonb), public._partida_json(uuid, uuid), public._tg_discord_fila()
  from public, anon, authenticated;
grant execute on function public._perfil_json(public.profiles), public._forma_curta(uuid),
  public._fechar(uuid, int, int, jsonb), public._recalcular(uuid, jsonb), public._partida_json(uuid, uuid), public._tg_discord_fila()
  to service_role;

revoke execute on function public.entrar_fila(text), public.dev_encher_fila(boolean, text), public.definir_pontos(uuid, int, text),
  public.ranking(int, int, boolean, text, text), public.posicao(uuid, text), public.total_tabela(text) from public, anon;
grant execute on function public.entrar_fila(text), public.dev_encher_fila(boolean, text), public.definir_pontos(uuid, int, text),
  public.ranking(int, int, boolean, text, text), public.posicao(uuid, text), public.total_tabela(text) to authenticated;
revoke all on function public.overlay_dados(text, text) from public;
grant execute on function public.overlay_dados(text, text) to anon, authenticated;
