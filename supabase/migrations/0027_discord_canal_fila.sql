-- A fila no Discord passa para um canal só dela.
--
-- Antes, o canal de ping tinha o botão "Chamar para a fila" e, por baixo, quantas pessoas estavam
-- na fila. Agora são dois canais:
--   * canal de ping: só o botão "Chamar para a fila" (sem a contagem);
--   * canal da fila: uma mensagem com "n/10 na fila", o botão "Entrar na fila" (abre o site e
--     entra na fila sem mais cliques) e o botão "Abrir o site".
--
-- A mensagem da fila tem o seu próprio id, em config (discord_fila_message), à semelhança da do
-- ping. Quando alguém entra ou sai da fila, a função discord-partida atualiza a mensagem da fila
-- (só se ela já tiver sido publicada em Staff › Discord).
--
-- Corre depois de 0001 a 0026. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists discord_fila_message text;

/** Alguém entrou ou saiu da fila: pede à função que atualize o texto (só se a mensagem da fila já existir). */
create or replace function public._tg_discord_fila() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from config where id and discord_fila_message is not null) then
    perform _discord('fila', null);
  end if;
  return null;
end $$;

revoke all on function public._tg_discord_fila() from public, anon, authenticated;
grant execute on function public._tg_discord_fila() to service_role;
