-- Rangify, migração 0043: os bots deixam de colidir no Riot ID.
--
-- Os bots (das filas de teste e dos torneios de teste) recebem um Riot ID "Bot" + 4 caracteres hexadecimais + "#BOT":
-- 65 536 valores contra o índice único profiles_riot_id_unico. Uma taça de 16 equipas pede cerca de 80 bots, por isso
-- há uns 5 a 7% de probabilidade de duas colidirem e o INSERT falhar com "duplicate key". Em vez de copiar para aqui os
-- corpos das funções que criam bots, um gatilho vê o Riot ID antes de gravar e, se for dum bot e já existir, troca-o
-- por um de 8 caracteres (4,3 mil milhões de valores). Os Riot IDs de bots que já existem não mudam.
--
-- Corre uma vez no SQL Editor. É seguro correr outra vez.

create or replace function public._bot_riot_id_unico() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.riot_id ~ '^Bot[0-9A-F]{4}#BOT$' then
    while exists (select 1 from profiles p where lower(p.riot_id) = lower(new.riot_id)) loop
      new.riot_id := 'Bot' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) || '#BOT';
    end loop;
  end if;
  return new;
end $$;

revoke all on function public._bot_riot_id_unico() from public, anon, authenticated;

drop trigger if exists bot_riot_id_unico on public.profiles;
create trigger bot_riot_id_unico
  before insert on public.profiles
  for each row execute function public._bot_riot_id_unico();
