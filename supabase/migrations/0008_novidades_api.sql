-- Novidades editáveis na Staff e afinações da confirmação pela Henrik Dev API.
--
-- * news: as novidades do Dashboard. Owner e Dev criam e apagam na Staff.
-- * matches.api_checked_at: a Edge Function processar-partida só consulta a API
--   uma vez por minuto por partida, venha o pedido de quem vier.
-- * Uma partida real à espera da API passa a ter 30 minutos (eram 15) antes de
--   fechar sem estatísticas: os jogos personalizados podem demorar a aparecer.
--
-- Corre depois de 0001 a 0007. Pode correr outra vez sem estragar nada.

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  shown_on date not null default current_date,
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 500),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.news enable row level security;

insert into public.news (shown_on, title, body)
select '2026-09-01', 'A Temporada 1 arrancou. Toda a gente começa com 1000 pontos.', 'Ganhar a equipas acima do teu rank oficial vale mais. Perder contra elas custa menos.'
where not exists (select 1 from public.news);

create or replace function public.novidades(p_limite int default 5) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'data', n.shown_on, 'titulo', n.title, 'texto', n.body, 'criadaEm', n.created_at
  ) order by n.shown_on desc, n.created_at desc), '[]'::jsonb)
  from (select * from news order by shown_on desc, created_at desc limit least(50, greatest(1, p_limite))) n
$$;

create or replace function public.criar_novidade(p_data date, p_titulo text, p_texto text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  v_titulo text := trim(coalesce(p_titulo, ''));
  v_texto text := trim(coalesce(p_texto, ''));
begin
  if p_data is null then raise exception 'Escolhe a data da novidade.'; end if;
  if char_length(v_titulo) not between 3 and 120 then raise exception 'O título tem entre 3 e 120 caracteres.'; end if;
  if char_length(v_texto) not between 3 and 500 then raise exception 'A descrição tem entre 3 e 500 caracteres.'; end if;
  insert into news (shown_on, title, body, author_id) values (p_data, v_titulo, v_texto, me.id);
  return novidades(50);
end $$;

create or replace function public.apagar_novidade(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_owner_dev();
  delete from news where id = p_id;
  if not found then raise exception 'Esta novidade já não existe.'; end if;
  return novidades(50);
end $$;

grant execute on function public.novidades(int), public.criar_novidade(date, text, text), public.apagar_novidade(uuid) to authenticated;

-- ---------------------------------------------------------------- Henrik Dev API

alter table public.matches add column if not exists api_checked_at timestamptz;

create or replace function public._tg_prazo_api() returns trigger
language plpgsql as $$
begin
  if new.state = 'PROCESSING_API' and old.state is distinct from 'PROCESSING_API' and not new.simulated then
    new.phase_deadline := now() + interval '30 minutes';
  end if;
  return new;
end $$;

drop trigger if exists prazo_api on public.matches;
create trigger prazo_api before update of state on public.matches
for each row execute function public._tg_prazo_api();
