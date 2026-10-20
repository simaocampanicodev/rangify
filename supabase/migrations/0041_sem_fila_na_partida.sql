-- Acabar com a fila de espera à volta da linha da partida (o que punha o PostgREST e o Auth "unhealthy" nos picks e bans).
--
-- O que acontecia: depois de cada escolha do draft ou ban de mapa, a partida ficava com "uma jogada de bot por cumprir"
-- (bot_move_at no passado), mesmo quando o capitão da vez era uma pessoa. A _passo_pendente (0039) achava que havia
-- trabalho, e os 10 jogadores, a perguntar de 2,5 em 2,5 segundos, entravam todos em fila no mesmo bloqueio da linha da
-- partida (select ... for update). Cada pergunta ficava presa até 5 ou 8 segundos, a ocupar uma ligação do PostgREST;
-- com as ligações todas ocupadas, até o login e o resto do site (cosmeticos, meu_perfil...) esgotavam o tempo.
--
--   * _passo_pendente passa a só contar uma jogada de bot quando o capitão da vez é mesmo um bot (ou a partida é
--     automática). Numa partida só de pessoas, as perguntas deixam de tocar na linha da partida até o prazo acabar.
--   * situacao e avancar_partida nunca esperam: se outro já está a fazer andar a partida (linha bloqueada), saltam essa
--     parte e devolvem o estado que lá está (for update skip locked). Quem fez a jogada vê-a logo, e os outros vêem-na
--     na pergunta seguinte, uns milissegundos depois.
--
-- Corre depois de 0001 a 0040. Pode correr outra vez sem estragar nada.

/**
 * Há alguma coisa por cumprir na partida? Pré-verificação sem bloqueio: se der falso, a máquina de estados não teria nada
 * para fazer. Espelha o _passo: prazo da fase, prazo e aceitações de bots da confirmação, e jogadas de bot só quando o
 * capitão da vez é um bot. Se o _passo ganhar outro gatilho, ele tem de entrar aqui também.
 */
create or replace function public._passo_pendente(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.state not in ('COMPLETED', 'CANCELLED', 'DISPUTE') and (
      case m.state
        when 'READY_CHECK' then
          (m.ready_deadline is not null and m.ready_deadline <= now())
          or exists (select 1 from match_players x where x.match_id = m.id and not x.accepted and x.accept_at is not null and x.accept_at <= now())
        when 'DRAFT_PHASE' then
          (m.phase_deadline is not null and m.phase_deadline <= now())
          or (m.bot_move_at is not null and m.bot_move_at <= now() and _auto(m,
            case when _equipa_da_escolha((select count(*)::int from match_players x where x.match_id = m.id and x.team is not null and not x.is_captain)) = 'A'
              then m.captain_a else m.captain_b end))
        when 'MAP_BAN' then
          (m.phase_deadline is not null and m.phase_deadline <= now())
          or (m.bot_move_at is not null and m.bot_move_at <= now() and _auto(m, (_vez_mapas(m.id)->>'capitao')::uuid))
        when 'LOBBY_CREATION' then
          (m.phase_deadline is not null and m.phase_deadline <= now())
          or (m.bot_move_at is not null and m.bot_move_at <= now() and _auto(m, m.captain_a))
        when 'RESULT_SUBMISSION' then
          (m.phase_deadline is not null and m.phase_deadline <= now())
          or (m.bot_move_at is not null and m.bot_move_at <= now() and (_auto(m, m.captain_a) or _auto(m, m.captain_b)))
        else
          m.phase_deadline is not null and m.phase_deadline <= now()
      end
    )
    from matches m where m.id = p_match
  ), false)
$$;

create or replace function public.situacao(p_partida uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := eu();
  v uuid;
  i int := 0;
begin
  if me is null then return null; end if;
  v := coalesce(_partida_ativa(me), p_partida);
  if v is not null then
    loop
      i := i + 1;
      exit when i > 15 or not _passo_pendente(v);
      -- Se outro já está a fazer andar a partida, não espero na fila: devolvo o estado que lá está.
      perform 1 from matches where id = v for update skip locked;
      exit when not found;
      exit when not _passo(v);
    end loop;
  end if;
  return jsonb_build_object(
    'fila', estado_fila(),
    'partida', case when v is null then null else _partida_json(v, me) end
  );
end $$;

create or replace function public.avancar_partida(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i int := 0;
begin
  perform _eu();
  loop
    i := i + 1;
    exit when i > 15 or not _passo_pendente(p_match);
    perform 1 from matches where id = p_match for update skip locked;
    exit when not found;
    exit when not _passo(p_match);
  end loop;
  return _partida_json(p_match, eu());
end $$;

revoke all on function public._passo_pendente(uuid) from public, anon, authenticated;
grant execute on function public._passo_pendente(uuid) to service_role;
grant execute on function public.situacao(uuid), public.avancar_partida(uuid) to authenticated;
