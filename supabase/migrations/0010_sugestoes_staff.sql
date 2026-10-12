-- Sugestões geridas pela staff: mudar o estado (Recebida, Em análise, Planeada,
-- Feita) e apagar. Owner, Dev e Mod.
--
-- Corre depois de 0001 a 0009. Pode correr outra vez sem estragar nada.

create or replace function public.definir_estado_sugestao(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text := case p_estado when 'recebida' then 'received' when 'analise' then 'review' when 'planeada' then 'planned' when 'feita' then 'done' end;
begin
  perform _exigir_staff();
  if v_status is null then raise exception 'Estado de sugestão desconhecido.'; end if;
  update suggestions set status = v_status where id = p_id;
  if not found then raise exception 'Esta sugestão já não existe.'; end if;
end $$;

-- Os votos saem com ela (on delete cascade).
create or replace function public.apagar_sugestao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_staff();
  delete from suggestions where id = p_id;
  if not found then raise exception 'Esta sugestão já não existe.'; end if;
end $$;

grant execute on function public.definir_estado_sugestao(uuid, text), public.apagar_sugestao(uuid) to authenticated;
