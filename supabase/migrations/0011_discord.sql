-- Canais de Discord por partida.
--
-- Quando as equipas ficam fechadas (a partida entra nos bans), a base de dados
-- pede à Edge Function discord-partida que crie no servidor do Rangify:
--   * 3 cargos: "RG-1234", "RG-1234 · Team A" e "RG-1234 · Team B";
--   * uma categoria "RG-1234" com um chat só para os 10 jogadores e duas calls,
--     uma por equipa (cada equipa só entra na sua).
-- Quando a partida termina, é cancelada ou removida, pede que apague tudo:
-- canais e cargos (apagar um cargo tira-o a toda a gente).
--
-- As partidas simuladas automáticas ("Simular partida completa") não criam nada.
-- Sem a linha em discord_config (ver DISCORD.md), nada é chamado e o jogo segue igual.
--
-- Corre depois de 0001 a 0010. Pode correr outra vez sem estragar nada.

-- O pg_net faz pedidos HTTP a partir da base de dados (vem com o Supabase).
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net indisponível: os canais de Discord ficam desligados.';
end $$;

-- Para onde ligar e o segredo partilhado com a Edge Function. Só a base de dados lê.
create table if not exists public.discord_config (
  id int primary key default 1 check (id = 1),
  url text not null,
  segredo text not null
);
alter table public.discord_config enable row level security;

-- O que foi criado no Discord para cada partida (sem chave estrangeira: tem de
-- sobreviver à partida ser apagada, para a limpeza saber o que apagar).
create table if not exists public.match_discord (
  match_id uuid primary key,
  estado text not null default 'a_criar' check (estado in ('a_criar', 'criado')),
  guild_id text,
  categoria_id text,
  texto_id text,
  voz_a_id text,
  voz_b_id text,
  cargo_id text,
  cargo_a_id text,
  cargo_b_id text,
  criado_em timestamptz not null default now()
);
alter table public.match_discord enable row level security;

/** Pede à Edge Function que crie ou limpe. Nunca deixa um erro travar a partida. */
create or replace function public._discord(p_tipo text, p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c discord_config;
begin
  select * into c from discord_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url := c.url,
    body := jsonb_build_object('tipo', p_tipo, 'matchId', p_match),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rangify-segredo', c.segredo),
    timeout_milliseconds := 20000
  );
exception when others then
  raise warning 'Discord: não foi possível pedir "%" para a partida %: %', p_tipo, p_match, sqlerrm;
end $$;

create or replace function public._tg_discord_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.automatic then return null; end if;
  if new.state = 'MAP_BAN' and old.state is distinct from 'MAP_BAN' then
    perform _discord('criar', new.id);
  elsif new.state in ('COMPLETED', 'CANCELLED') and old.state not in ('COMPLETED', 'CANCELLED') then
    -- Só se chegou a ter canais (ou a criação ainda vai a meio: a função limpa no fim).
    if exists (select 1 from match_discord where match_id = new.id) then perform _discord('limpar', new.id); end if;
  end if;
  return null;
end $$;

create or replace function public._tg_discord_apagada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from match_discord where match_id = old.id) then perform _discord('limpar', old.id); end if;
  return null;
end $$;

drop trigger if exists discord_estado on public.matches;
create trigger discord_estado after update of state on public.matches
for each row execute function public._tg_discord_estado();

drop trigger if exists discord_apagada on public.matches;
create trigger discord_apagada after delete on public.matches
for each row execute function public._tg_discord_apagada();

/** Os links do Discord da partida, só para quem a joga: o chat e a call da sua equipa. */
create or replace function public.discord_partida(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  v_equipa team;
  d match_discord;
begin
  select mp.team into v_equipa from match_players mp where mp.match_id = p_match and mp.profile_id = me;
  if v_equipa is null then return null; end if;
  select * into d from match_discord where match_id = p_match and estado = 'criado';
  if not found then return null; end if;
  return jsonb_build_object(
    'servidor', d.guild_id,
    'chat', d.texto_id,
    'call', case when v_equipa = 'A' then d.voz_a_id else d.voz_b_id end
  );
end $$;

revoke all on function public._discord(text, uuid), public._tg_discord_estado(), public._tg_discord_apagada() from public, anon, authenticated;
grant execute on function public.discord_partida(uuid) to authenticated;
