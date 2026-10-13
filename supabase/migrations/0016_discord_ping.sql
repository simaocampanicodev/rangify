-- Botão "Chamar para a fila" no canal de ping do Discord.
--
-- Quem carrega no botão pinga o cargo de ping, e depois tem de esperar 3 minutos
-- para voltar a carregar. O clique chega à Edge Function discord-interacoes, que
-- usa _discord_ping para saber se a pessoa já pode chamar outra vez.
-- A mensagem com o botão é publicada (ou atualizada) pela Staff, com a função
-- discord-ping; o id dela fica em config, para não haver duas.
--
-- Corre depois de 0001 a 0015. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists discord_ping_message text;

create table if not exists public.discord_ping (
  user_id text primary key,
  last_at timestamptz not null default now()
);
alter table public.discord_ping enable row level security;

/**
 * Regista um ping de quem carregou no botão, se já passaram p_segundos desde o último.
 * { ok: true } ou { ok: false, livreEm } com a hora a partir da qual pode chamar outra vez.
 * Numa só instrução, para dois cliques ao mesmo tempo não pingarem duas vezes.
 */
create or replace function public._discord_ping(p_user text, p_segundos int default 180) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v timestamptz;
begin
  if p_user !~ '^\d{15,22}$' then raise exception 'ID do Discord inválido.'; end if;
  insert into discord_ping (user_id, last_at) values (p_user, now())
  on conflict (user_id) do update set last_at = now()
    where discord_ping.last_at <= now() - make_interval(secs => p_segundos)
  returning last_at into v;
  if v is not null then return jsonb_build_object('ok', true); end if;
  select last_at + make_interval(secs => p_segundos) into v from discord_ping where user_id = p_user;
  return jsonb_build_object('ok', false, 'livreEm', v);
end $$;

revoke all on function public._discord_ping(text, int) from public, anon, authenticated;
grant execute on function public._discord_ping(text, int) to service_role;
