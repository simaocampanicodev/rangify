-- Staff: as partidas ao vivo.
--
-- Todas as partidas que ainda não acabaram (confirmação, draft, mapas, código, em jogo,
-- resultado, API e disputa), com os jogadores de cada uma. Substitui o ecrã das
-- "partidas encravadas": as que estão paradas continuam a ver-se, mas no meio das outras.
--
-- Corre depois de 0001 a 0020. Pode correr outra vez sem estragar nada.

create or replace function public.partidas_ao_vivo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _exigir_staff();
begin
  return (
    select coalesce(jsonb_agg(_partida_json(id, me.id) order by created_at), '[]'::jsonb)
    from matches where state not in ('COMPLETED', 'CANCELLED')
  );
end $$;

grant execute on function public.partidas_ao_vivo() to authenticated;
