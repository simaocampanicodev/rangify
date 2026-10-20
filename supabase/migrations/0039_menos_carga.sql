-- Menos trabalho para a base de dados: o site pergunta o estado da partida a toda a hora (de 1 em 1 segundo, por
-- jogador) e cada pergunta bloqueava a linha da partida e montava o JSON inteiro. Com 10 jogadores e várias partidas,
-- isto pesava muito.
--
--   * _passo_pendente: diz, sem bloquear nada, se a partida tem algum prazo ou jogada de bot por cumprir. Só nesse caso
--     é que situacao e avancar_partida correm a máquina de estados (que bloqueia a linha da partida). Quase sempre não há
--     nada por fazer, e as perguntas deixam de se pôr em fila umas atrás das outras.
--   * estatisticas_resumo: as estatísticas de vários jogadores numa só chamada e só com o que o draft mostra (partidas,
--     vitórias, KDA e ACS). Antes eram 8 a 10 chamadas a estatisticas_perfil, cada uma a calcular o perfil inteiro.
--
-- Corre depois de 0001 a 0038. Pode correr outra vez sem estragar nada.

/**
 * Há alguma coisa por cumprir na partida? É uma pré-verificação sem bloqueio: se der falso, a máquina de estados não
 * teria nada para fazer. Cobre todos os casos de _passo (prazo da fase, prazo de confirmação, aceitações dos bots e
 * jogadas de bots); se algum dia a máquina ganhar outro gatilho, ele tem de entrar aqui também.
 */
create or replace function public._passo_pendente(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select m.state not in ('COMPLETED', 'CANCELLED', 'DISPUTE') and (
      (m.phase_deadline is not null and m.phase_deadline <= now())
      or (m.bot_move_at is not null and m.bot_move_at <= now())
      or (m.state = 'READY_CHECK' and (
        (m.ready_deadline is not null and m.ready_deadline <= now())
        or exists (select 1 from match_players x where x.match_id = m.id and not x.accepted and x.accept_at is not null and x.accept_at <= now())
      ))
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
      exit when i > 15 or not _passo_pendente(v) or not _passo(v);
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
    exit when i > 15 or not _passo_pendente(p_match) or not _passo(p_match);
  end loop;
  return _partida_json(p_match, eu());
end $$;

/** As estatísticas do draft: partidas, vitórias, KDA e ACS de até 20 jogadores, numa só chamada. */
create or replace function public.estatisticas_resumo(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.id::text, jsonb_build_object('partidas', x.partidas, 'vitorias', x.vitorias, 'kda', x.kda, 'acs', x.acs)), '{}'::jsonb)
  from (
    select mp.profile_id as id,
      count(*)::int as partidas,
      (count(*) filter (where mp.team = m.winner))::int as vitorias,
      case when count(mp.acs) > 0 then (sum(mp.kills) filter (where mp.acs is not null) + sum(mp.assists) filter (where mp.acs is not null))::numeric
        / greatest(1, sum(mp.deaths) filter (where mp.acs is not null)) end as kda,
      avg(mp.acs) as acs
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = any (p_ids[1:20]) and m.state = 'COMPLETED' and mp.team is not null
    group by mp.profile_id
  ) x
$$;

revoke all on function public._passo_pendente(uuid) from public, anon, authenticated;
grant execute on function public._passo_pendente(uuid) to service_role;
grant execute on function public.situacao(uuid), public.avancar_partida(uuid), public.estatisticas_resumo(uuid[]) to authenticated;
