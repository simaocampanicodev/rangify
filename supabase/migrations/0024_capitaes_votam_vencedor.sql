-- Os capitães só confirmam quem ganhou.
--
-- Até agora cada capitão escrevia o resultado em rondas e, se os dois não batessem certo, a
-- partida ia para disputa e a staff resolvia à mão. Agora cada capitão só escolhe a equipa
-- vencedora (A ou B): é a confirmação de que o jogo acabou. Quando os dois votam, ou 3 minutos
-- depois de um deles votar, a Henrik Dev API entra em ação e define o resultado e quem ganhou.
-- Se um capitão votou mal, a API corrige-o sozinha, sem ninguém ter de resolver nada.
--
-- Só se vai para a staff quando a API não encontra a partida em 30 minutos (aí a staff decide
-- o resultado em Staff › Disputas, a ver o que os capitães votaram).
--
-- O site tem de ser publicado com esta migração: o botão de votar passou a enviar a equipa
-- (submeter_resultado(p_match, p_vencedor)) em vez das rondas.
--
-- Corre depois de 0001 a 0023. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- o voto

alter table public.match_results add column if not exists vencedor public.team;
alter table public.match_results alter column score_a drop not null;
alter table public.match_results alter column score_b drop not null;
-- As submissões antigas ficam com a equipa que tinham dado como vencedora.
update public.match_results set vencedor = (case when score_a > score_b then 'A' else 'B' end)::public.team
where vencedor is null and score_a is not null;

-- ---------------------------------------------------------------- resultados inventados (simulações)

drop function if exists public._resultado_aleatorio(uuid);

/** Inventa o resultado de uma simulação. Com p_ganha_a, a equipa vencedora é a que os capitães votaram. */
create or replace function public._resultado_aleatorio(p_match uuid, p_ganha_a boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dif numeric;
  v_ganha_a boolean := p_ganha_a;
  v_ven int := 13;
  v_per int;
begin
  if v_ganha_a is null then
    select coalesce(avg(_divisao(tier_snapshot)) filter (where team = 'A'), 9) - coalesce(avg(_divisao(tier_snapshot)) filter (where team = 'B'), 9)
    into v_dif from match_players where match_id = p_match;
    v_ganha_a := random() < 1 / (1 + exp(-v_dif * 0.32));
  end if;
  if random() < 0.14 then
    v_ven := 14; v_per := 12;
  else
    v_per := (array[3, 5, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 11])[1 + floor(random() * 14)::int];
  end if;
  update matches set auto_score_a = case when v_ganha_a then v_ven else v_per end,
    auto_score_b = case when v_ganha_a then v_per else v_ven end where id = p_match;
end $$;

-- ---------------------------------------------------------------- seguir para a API

/**
 * Os capitães confirmaram (ou o tempo acabou): a partida segue para a API, que diz o resultado.
 * Nas simulações não há API: o resultado é inventado, a favor da equipa que os capitães votaram.
 */
create or replace function public._seguir_para_api(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  v_a int;
  v_b int;
  v_ganha_a boolean;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'RESULT_SUBMISSION' then return; end if;
  if m.simulated then
    select count(*) filter (where vencedor = 'A'), count(*) filter (where vencedor = 'B') into v_a, v_b from match_results where match_id = p_match;
    v_ganha_a := case when v_a > v_b then true when v_b > v_a then false end;
    if m.auto_score_a is null or (v_ganha_a is not null and (m.auto_score_a > m.auto_score_b) <> v_ganha_a) then
      perform _resultado_aleatorio(p_match, v_ganha_a);
      select * into m from matches where id = p_match;
    end if;
  end if;
  update matches set state = 'PROCESSING_API',
    score_a = case when m.simulated then m.auto_score_a end, score_b = case when m.simulated then m.auto_score_b end,
    phase_started_at = now(),
    phase_deadline = now() + case when m.automatic then interval '1.2 seconds' when m.simulated then interval '3.5 seconds' else interval '15 minutes' end,
    bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

-- ---------------------------------------------------------------- votar

drop function if exists public._submeter(uuid, uuid, int, int);

create or replace function public._submeter(p_match uuid, p_capitao uuid, p_vencedor public.team) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into match_results (match_id, captain_id, vencedor) values (p_match, p_capitao, p_vencedor);
  update matches set updated_at = now() where id = p_match;
  select count(*) into n from match_results where match_id = p_match;
  if n >= 2 then
    perform _seguir_para_api(p_match);
    return;
  end if;
  -- Só um capitão votou: se o outro não votar, a API entra em ação 3 minutos depois.
  update matches set phase_deadline = least(phase_deadline, now() + interval '3 minutes') where id = p_match and state = 'RESULT_SUBMISSION';
end $$;

drop function if exists public.submeter_resultado(uuid, int, int);

create or replace function public.submeter_resultado(p_match uuid, p_vencedor text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if me.id is distinct from m.captain_a and me.id is distinct from m.captain_b then raise exception 'Só os capitães confirmam quem ganhou.'; end if;
  if m.state = 'IN_PROGRESS' then raise exception 'O resultado só abre 15 minutos depois de partilhado o código.'; end if;
  if m.state <> 'RESULT_SUBMISSION' then raise exception 'Esta partida já não aceita votos.'; end if;
  if exists (select 1 from match_results where match_id = p_match and captain_id = me.id) then raise exception 'Já votaste.'; end if;
  if p_vencedor is null or p_vencedor not in ('A', 'B') then raise exception 'Escolhe a equipa que ganhou: A ou B.'; end if;
  perform _submeter(p_match, me.id, p_vencedor::team);
  -- Se o outro capitão for um bot, vota o mesmo daqui a uns segundos.
  update matches set bot_move_at = now() + (1.8 + random() * 1.4) * interval '1 second'
  where id = p_match and state = 'RESULT_SUBMISSION';
end $$;

drop function if exists public.staff_submeter_resultado(uuid, int, int);

/** A staff vota em nome de cada capitão que ainda não votou. A API decide o resultado na mesma. */
create or replace function public.staff_submeter_resultado(p_match uuid, p_vencedor text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  v_cap uuid;
begin
  perform _exigir_staff();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('IN_PROGRESS', 'RESULT_SUBMISSION') then raise exception 'Esta partida já não está à espera do resultado.'; end if;
  if p_vencedor is null or p_vencedor not in ('A', 'B') then raise exception 'Escolhe a equipa que ganhou: A ou B.'; end if;
  if m.state = 'IN_PROGRESS' then perform _abrir_resultado(p_match); end if;
  foreach v_cap in array array[m.captain_a, m.captain_b] loop
    if (select state from matches where id = p_match) <> 'RESULT_SUBMISSION' then exit; end if;
    if not exists (select 1 from match_results where match_id = p_match and captain_id = v_cap) then
      perform _submeter(p_match, v_cap, p_vencedor::team);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- as fases e o JSON da partida

create or replace function public._passo(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_cap uuid;
  v_alvo uuid;
  v_mapa text;
  v_humano uuid;
  v_outro uuid;
  v_vez jsonb;
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
    v_vez := _vez_mapas(p_match);
    v_cap := (v_vez->>'capitao')::uuid;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      -- Sem decisão a tempo (ou capitão bot): vale a sugestão mais votada da equipa, senão ao calhas.
      v_mapa := _sugestao_top(p_match, (v_vez->>'equipa')::team, (v_vez->>'passo')::int);
      if (v_vez->>'passo')::int = 100 then
        perform _escolher_lado(p_match, coalesce(v_mapa, (array['ataque', 'defesa'])[1 + floor(random() * 2)::int]));
      else
        if v_mapa is null then
          select x into v_mapa from unnest(m.map_pool) x
          where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x)
          order by random() limit 1;
        end if;
        perform _banir(p_match, v_mapa);
      end if;
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
        -- Dois capitães automáticos: inventam um resultado e votam os dois na equipa que ganhou.
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
          perform _submeter(p_match, v_cap, (case when m.auto_score_a > m.auto_score_b then 'A' else 'B' end)::team);
          return true;
        end if;
      else
        -- Um capitão humano e um bot: o bot vota o mesmo que o humano.
        v_humano := case when _auto(m, m.captain_a) then m.captain_b else m.captain_a end;
        v_outro := case when v_humano = m.captain_a then m.captain_b else m.captain_a end;
        select * into s from match_results where match_id = p_match and captain_id = v_humano;
        if found and _auto(m, v_outro) and not exists (select 1 from match_results where match_id = p_match and captain_id = v_outro) then
          perform _submeter(p_match, v_outro, s.vencedor);
          return true;
        end if;
      end if;
    end if;
    if now() >= m.phase_deadline then
      -- 3 minutos depois do primeiro voto (ou 60 minutos sem votos): a API decide o resultado.
      perform _seguir_para_api(p_match);
      return true;
    end if;

  when 'PROCESSING_API' then
    if now() >= m.phase_deadline then
      if m.simulated or m.score_a is not null then
        -- Simulação: estatísticas inventadas. Partida antiga que já tinha resultado: fecha sem estatísticas.
        perform _fechar(p_match, m.score_a, m.score_b, case when m.simulated then _estatisticas_simuladas(p_match) end);
      else
        -- A API não encontrou a partida: a staff decide (com o que os capitães votaram à vista).
        update matches set state = 'DISPUTE', phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
      end if;
      return true;
    end if;

  else
    return false;
  end case;
  return false;
end $$;

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

revoke all on function public._resultado_aleatorio(uuid, boolean), public._seguir_para_api(uuid), public._submeter(uuid, uuid, public.team)
  from public, anon, authenticated;
grant execute on function public._resultado_aleatorio(uuid, boolean), public._seguir_para_api(uuid), public._submeter(uuid, uuid, public.team) to service_role;
grant execute on function public.submeter_resultado(uuid, text), public.staff_submeter_resultado(uuid, text) to authenticated;
