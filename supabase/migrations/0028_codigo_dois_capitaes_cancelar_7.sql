-- Os dois capitães partilham o código, e o cancelamento pede 7 votos.
--
--   * Código do grupo: antes só o Capitão A o podia partilhar, e se se esquecesse a partida caía
--     quando o tempo acabava. Agora qualquer um dos dois capitães (A ou B) o partilha; o primeiro a
--     guardar vale e o outro vê logo o código.
--   * Votação para cancelar: em vez da maioria simples (6 de 10), são precisos 7 de 10. Num teste
--     com bots só contam as pessoas, na mesma proporção (70%, arredondado para cima, mínimo 1).
--
-- Corre depois de 0001 a 0027. Pode correr outra vez sem estragar nada.

create or replace function public.definir_codigo(p_match uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  m matches;
  v text := upper(trim(p_codigo));
begin
  me := _eu();
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'LOBBY_CREATION' then raise exception 'O código já foi partilhado.'; end if;
  if (me.id is distinct from m.captain_a and me.id is distinct from m.captain_b) or m.automatic then
    raise exception 'Só os capitães criam o grupo.';
  end if;
  if v !~ '^[A-Z0-9]{6}$' then raise exception 'O código tem 6 letras ou números.'; end if;
  perform _comecar(p_match, v);
end $$;

/** 70% das pessoas da partida (os bots não votam), arredondado para cima: 7 de 10; num teste com 1 pessoa, 1. */
create or replace function public._votos_necessarios(p_match uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, ceil(count(*) * 7 / 10.0))::int
  from match_players mp join profiles p on p.id = mp.profile_id
  where mp.match_id = p_match and mp.team is not null and not p.is_bot
$$;
