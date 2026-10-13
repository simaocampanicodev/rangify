-- Botão "Chamar para a fila" no canal de ping do Discord.
--
-- Só pode haver uma chamada de 5 em 5 minutos para o servidor todo (não por pessoa:
-- com muita gente, cada um a chamar de 3 em 3 minutos continuava a ser spam). Quem
-- carrega antes disso vê, só para si, quando fica livre outra vez. Cada chamada nova
-- apaga a anterior, para o canal ficar só com a mensagem do botão e a última chamada.
--
-- O clique chega à Edge Function discord-interacoes, que usa estas funções.
-- A mensagem com o botão é publicada (ou atualizada) pela Staff, com a função
-- discord-ping; o id dela fica em config, para não haver duas.
--
-- Corre depois de 0001 a 0015. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists discord_ping_message text;

-- A versão anterior contava por pessoa; agora há uma só linha para o servidor todo.
drop table if exists public.discord_ping;

create table if not exists public.discord_ping_estado (
  id boolean primary key default true check (id),
  last_at timestamptz not null default '-infinity',
  last_user text,
  last_message text
);
insert into public.discord_ping_estado (id) values (true) on conflict do nothing;
alter table public.discord_ping_estado enable row level security;

/**
 * Tenta reservar a chamada. Com a linha trancada, dois cliques ao mesmo tempo não
 * passam os dois. { ok: true, anterior, mensagemAnterior } ou
 * { ok: false, livreEm, quem } (quem fez a última chamada e quando fica livre).
 */
create or replace function public._discord_ping(p_user text, p_segundos int default 300) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare e discord_ping_estado;
begin
  if p_user !~ '^\d{15,22}$' then raise exception 'ID do Discord inválido.'; end if;
  select * into e from discord_ping_estado where id for update;
  if e.last_at > now() - make_interval(secs => p_segundos) then
    return jsonb_build_object('ok', false, 'livreEm', e.last_at + make_interval(secs => p_segundos), 'quem', e.last_user);
  end if;
  update discord_ping_estado set last_at = now(), last_user = p_user where id;
  return jsonb_build_object('ok', true, 'anterior', e.last_at::text, 'mensagemAnterior', e.last_message);
end $$;

/** Guarda o id da chamada que acabou de ser publicada (é a que a próxima apaga). */
create or replace function public._discord_ping_mensagem(p_mensagem text) returns void
language sql volatile security definer set search_path = public as $$
  update discord_ping_estado set last_message = p_mensagem where id
$$;

/** Se o Discord recusar a chamada, a reserva é desfeita para outra pessoa poder chamar. */
create or replace function public._discord_ping_desfazer(p_user text, p_anterior timestamptz) returns void
language sql volatile security definer set search_path = public as $$
  update discord_ping_estado set last_at = p_anterior where id and last_user = p_user
$$;

revoke all on function public._discord_ping(text, int), public._discord_ping_mensagem(text), public._discord_ping_desfazer(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public._discord_ping(text, int), public._discord_ping_mensagem(text), public._discord_ping_desfazer(text, timestamptz)
  to service_role;
