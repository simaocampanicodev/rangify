-- As missões diárias também dão Rangify Coins, e os outros valores acertam-se:
--   diária +15 (até 4 por dia), semanal +40, nível +120, cada 5.º nível +400, MVP +25.
-- As diárias também dão XP (e por isso níveis), por isso o nível dá um pouco menos.
-- Os mesmos números estão em src/lib/loja.ts (COINS_POR_...).
--
-- As coins são sempre calculadas, por isso isto muda o saldo de toda a gente logo.
-- Corre depois de 0001 a 0017. Pode correr outra vez sem estragar nada.

create or replace function public._moedas_ganhas(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel int := ((_nivel(_xp(p_perfil)))->>'nivel')::int;
  v_diarias int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'daily');
  v_semanais int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'weekly');
  v_mvps int := (select count(*) from match_players mp join matches m on m.id = mp.match_id
                  where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic);
begin
  return jsonb_build_object(
    'nivel', v_nivel,
    'porNivel', 120 * greatest(0, v_nivel - 1),
    'porMarcos', 400 * (v_nivel / 5),
    'porDiarias', 15 * v_diarias,
    'porSemanais', 40 * v_semanais,
    'porMvp', 25 * v_mvps
  );
end $$;

create or replace function public._moedas(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select (g->>'porNivel')::int + (g->>'porMarcos')::int + (g->>'porDiarias')::int + (g->>'porSemanais')::int + (g->>'porMvp')::int
    + coalesce((select sum(delta) from coin_ledger where profile_id = p_perfil), 0)::int
  from (select _moedas_ganhas(p_perfil) as g) x
$$;

revoke all on function public._moedas_ganhas(uuid), public._moedas(uuid) from public, anon, authenticated;
