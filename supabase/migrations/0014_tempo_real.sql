-- =============================================================================
-- Rangify: amizades em tempo real.
--
-- A tabela friends passa a enviar as mudanças pelo Supabase Realtime: quando
-- alguém te manda um pedido, o aceita ou remove a amizade, o site sabe logo
-- (o número ao lado de "Amigos" aparece sem esperar). Quem recebe cada mudança
-- continua a ser decidido pela política "ler as minhas amizades".
--
-- Corre depois de 0001 a 0013. Pode correr outra vez sem estragar nada.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friends') then
    alter publication supabase_realtime add table public.friends;
  end if;
end $$;
