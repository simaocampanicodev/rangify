-- Histórico de partidas com o tamanho da página à escolha.
--
-- O site passa a pedir 10 partidas de cada vez (com "Ver mais"), em vez de 20: menos dados
-- por pedido e menos linhas a desenhar. O padrão continua a ser 20 para o resto do site.
--
-- Corre depois de 0001 a 0021. Pode correr outra vez sem estragar nada.

drop function if exists public.historico(uuid, boolean, text, int);

create or replace function public.historico(p_perfil uuid default null, p_minhas boolean default true, p_mapa text default null, p_offset int default 0, p_limite int default 20)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ref uuid := coalesce(p_perfil, case when p_minhas then eu() end);
  v_lim int := least(50, greatest(1, coalesce(p_limite, 20)));
  v_linhas jsonb;
  v_n int;
begin
  -- Pede-se mais uma do que a página: se ela vier, há mais para mostrar.
  with lista as (
    select m.id, m.finished_at from matches m
    where m.state = 'COMPLETED'
      and (v_ref is null or exists (select 1 from match_players mp where mp.match_id = m.id and mp.profile_id = v_ref and mp.team is not null))
      and (p_mapa is null or m.map = p_mapa)
    order by m.finished_at desc
    offset greatest(0, p_offset) limit v_lim + 1
  )
  select coalesce(jsonb_agg(_resumo_json(l.id, v_ref) order by l.finished_at desc) filter (where l.rn <= v_lim), '[]'::jsonb), count(*)
  into v_linhas, v_n
  from (select lista.*, row_number() over (order by finished_at desc) rn from lista) l;
  return jsonb_build_object('linhas', v_linhas, 'cursor', case when v_n > v_lim then (greatest(0, p_offset) + v_lim)::text end);
end $$;

grant execute on function public.historico(uuid, boolean, text, int, int) to authenticated;
