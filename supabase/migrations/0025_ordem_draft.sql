-- Ordem das escolhas do draft: A, B, B, A, A, B, B, A.
--
-- Depois dos dois capitães já colocados, as 8 escolhas de jogadores seguem a ordem
-- A1 B2 B3 A4 A5 B6 B7 A8 (antes alternavam A, B, A, B...). O site já usa esta ordem; sem
-- esta migração o servidor ainda achava que era a vez de quem alternava, e os capitães
-- viam "Ainda não é a tua vez de escolher" a meio do draft.
--
-- Os bans de mapa continuam a alternar: A, B, A, B...
--
-- Corre depois de 0001 a 0024. Pode correr outra vez sem estragar nada.

/** A equipa que faz a escolha número n (0 a 7, sem contar os capitães). */
create or replace function public._equipa_da_escolha(n int) returns public.team
language sql immutable as $$
  select (substr('ABBAABBA', (n % 8) + 1, 1))::public.team
$$;

create or replace function public._escolher(p_match uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
begin
  select * into m from matches where id = p_match;
  select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
  update match_players set team = _equipa_da_escolha(n), pick_order = n + 1
  where match_id = p_match and profile_id = p_perfil and team is null;
  if not found then raise exception 'Esse jogador já foi escolhido.'; end if;
  if n + 1 >= 8 then
    update matches set state = 'MAP_BAN', phase_started_at = now(), phase_deadline = now() + interval '60 seconds',
      bot_move_at = now() + _atraso_mapas(p_match, 'A'), updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '30 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  end if;
end $$;

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
    v_cap := case when _equipa_da_escolha(n) = 'A' then m.captain_a else m.captain_b end;
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

/** O capitão da vez escolhe um jogador. */
create or replace function public.escolher_jogador(p_match uuid, p_jogador uuid) returns void
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
  if m.automatic or (case when _equipa_da_escolha(n) = 'A' then m.captain_a else m.captain_b end) is distinct from me.id then
    raise exception 'Ainda não é a tua vez de escolher.';
  end if;
  perform _escolher(p_match, p_jogador);
end $$;

revoke all on function public._equipa_da_escolha(int) from public, anon, authenticated;
grant execute on function public._equipa_da_escolha(int) to service_role;
