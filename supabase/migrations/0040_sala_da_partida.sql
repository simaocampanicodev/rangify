-- A sala da partida: só os jogadores dela entram no canal do Realtime onde o líder reenvia o estado.
--
-- Numa partida, só um jogador (o líder) pergunta o estado à base de dados e reenvia-o aos outros nove pelo Realtime
-- (Broadcast e Presence), que não tocam na base de dados. O canal chama-se "partida:<ID da partida>" e é privado: estas
-- regras só deixam entrar, ouvir e escrever quem é jogador dessa partida.
--
-- Se o Realtime do projeto não tiver a tabela realtime.messages (ou se isto não correr), nada parte: o site não consegue
-- abrir o canal e cada jogador volta a perguntar por conta própria, como antes.
--
-- Corre depois de 0001 a 0039. Pode correr outra vez sem estragar nada.

/** É jogador da partida do tópico "partida:<ID>"? (a base das regras do Realtime abaixo) */
create or replace function public._pode_sala(p_topico text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from match_players mp
    where mp.match_id::text = split_part(p_topico, ':', 2) and mp.profile_id = eu()
  )
$$;

revoke all on function public._pode_sala(text) from public, anon;
grant execute on function public._pode_sala(text) to authenticated, service_role;

do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'realtime.messages não existe: a sala da partida fica desligada e cada jogador pergunta sozinho.';
    return;
  end if;
  execute 'drop policy if exists "sala da partida: ouvir" on realtime.messages';
  execute 'drop policy if exists "sala da partida: escrever" on realtime.messages';
  execute $p$
    create policy "sala da partida: ouvir" on realtime.messages for select to authenticated
    using (realtime.messages.extension in ('broadcast', 'presence') and public._pode_sala((select realtime.topic())))
  $p$;
  execute $p$
    create policy "sala da partida: escrever" on realtime.messages for insert to authenticated
    with check (realtime.messages.extension in ('broadcast', 'presence') and public._pode_sala((select realtime.topic())))
  $p$;
exception when others then
  raise notice 'Não foi possível criar as regras do Realtime (%): a sala da partida fica desligada e cada jogador pergunta sozinho.', sqlerrm;
end $$;
