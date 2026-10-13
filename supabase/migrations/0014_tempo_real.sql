-- =============================================================================
-- Rangify: amizades, fila e partidas em tempo real.
--
-- Estas tabelas passam a enviar as mudanças pelo Supabase Realtime, e o site
-- sabe logo quando:
--   * friends: alguém te manda um pedido, o aceita ou remove a amizade
--     (o número ao lado de "Amigos" aparece sem esperar);
--   * queue_entries: alguém entra ou sai da fila;
--   * match_players: a sala encheu e entraste numa partida;
--   * matches: a tua partida avançou (escolhas, bans, código, resultado).
-- Assim o site deixa de perguntar ao servidor a cada poucos segundos fora das
-- partidas. Quem recebe cada mudança continua a ser decidido pelas políticas
-- de leitura de cada tabela.
--
-- Corre depois de 0001 a 0013. Pode correr outra vez sem estragar nada.
-- =============================================================================

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['friends', 'queue_entries', 'match_players', 'matches'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
