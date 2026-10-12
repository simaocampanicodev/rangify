-- Menos esperas no site: uma só chamada devolve o estado da fila e a partida
-- já avançada. Antes eram duas idas ao servidor seguidas a cada segundo
-- (estado_fila e partida_ativa, depois avancar_partida), e cada clique esperava
-- por elas.
--
-- Corre depois de 0001 a 0008. Pode correr outra vez sem estragar nada. O site
-- continua a funcionar sem ela (usa o caminho antigo, mais lento).

/**
 * O que o site precisa a cada segundo: a fila e a partida de quem pede.
 * Avança primeiro a partida ativa; se não houver, a que o site ainda está a
 * mostrar (p_partida), para o resumo de uma partida que acabou de terminar.
 */
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
      exit when i > 15 or not _passo(v);
    end loop;
  end if;
  return jsonb_build_object(
    'fila', estado_fila(),
    'partida', case when v is null then null else _partida_json(v, me) end
  );
end $$;

grant execute on function public.situacao(uuid) to authenticated;
