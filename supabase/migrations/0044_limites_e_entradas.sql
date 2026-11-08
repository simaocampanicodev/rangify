-- Rangify, migração 0044: limite de pedidos, texto limpo e nada de funções abertas a quem não entrou.
--
-- 1. Limite de pedidos. O Supabase não limita as funções SQL (RPC) que o site chama: quem tem uma conta pode chamá-las
--    em ciclo. A tabela limites_uso conta pedidos por chave e janela, e _limitar() recusa o pedido depois do máximo
--    ("Fizeste demasiados pedidos..."). As Edge Functions usam _limitar_chave() (ver supabase/functions/_shared/limite.ts).
-- 2. Texto limpo. _texto() tira os caracteres de controlo, os de largura zero e os que invertem o sentido do texto
--    (usados para disfarçar nomes e mensagens), aplica NFC, tira espaços nas pontas e recusa o que passa do tamanho.
-- 3. Cada função exposta que escreve ou pesquisa é substituída por um embrulho com o MESMO nome, argumentos e valor por
--    omissão (o contrato com o site, a extensão e as funções de borda não muda): o embrulho limita, limpa o texto e
--    chama a original, que passa a chamar-se _<nome>_base e deixa de ser chamável de fora.
-- Limitação: um pedido que acaba em erro (a função original recusa, ou este limite) é desfeito pelo PostgREST com
--    tudo o resto, contador incluído. O limite das funções SQL conta por isso os pedidos CONCLUÍDOS, que são os que
--    escrevem (spam de sugestões, pedidos de amizade, trocas de fila). Nas Edge Functions o contador corre num pedido
--    à parte e conta todas as tentativas, também as que falham (é onde está o login por palavra-passe).
-- 4. As funções que exigem sessão deixam de ser executáveis pelo papel anon (pedidos sem login). Só o overlay do OBS
--    (overlay_dados, que se abre sem conta) fica aberto, e ganha o seu limite por chave (só as que existem).
--
-- Corre uma vez no SQL Editor. É seguro correr outra vez. Se algum dia voltares a correr uma migração antiga que
-- recrie uma destas funções (por exemplo a 0042, que recria entrar_fila), corre esta outra vez para a reembrulhar.
-- Uma função nova que só deve ser chamada por quem entrou precisa do seu "revoke ... from public, anon".

-- ------------------------------------------------------------ contadores
create table if not exists public.limites_uso (
  chave text not null,
  janela bigint not null,
  n int not null default 0,
  expira timestamptz not null,
  primary key (chave, janela)
);
create index if not exists limites_uso_expira on public.limites_uso (expira);
alter table public.limites_uso enable row level security;
revoke all on public.limites_uso from public, anon, authenticated;

-- true se o pedido ainda cabe no limite. Não lança erro: as funções de borda decidem a resposta.
create or replace function public._limitar_chave(p_chave text, p_max int, p_segundos int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w bigint := floor(extract(epoch from clock_timestamp()) / p_segundos);
  c int;
begin
  insert into limites_uso (chave, janela, n, expira)
    values (p_chave, w, 1, to_timestamp((w + 2) * p_segundos))
    on conflict (chave, janela) do update set n = limites_uso.n + 1
    returning n into c;
  -- Limpeza ao acaso, para a tabela não crescer sem fim.
  if random() < 0.02 then
    delete from limites_uso where expira < clock_timestamp();
  end if;
  return c <= p_max;
end $$;

-- Para as funções SQL: recusa o pedido com a mensagem que o site mostra tal e qual.
create or replace function public._limitar_ou_recusar(p_chave text, p_max int, p_segundos int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._limitar_chave(p_chave, p_max, p_segundos) then
    raise exception 'Fizeste demasiados pedidos. Espera um momento e tenta outra vez.';
  end if;
end $$;

-- Por utilizador. Sem sessão (chamadas da própria base de dados ou das funções de borda com a chave de serviço) não limita.
create or replace function public._limitar(p_acao text, p_max int, p_segundos int) returns void
language plpgsql security definer set search_path = public as $$
declare quem uuid := auth.uid();
begin
  if quem is null then return; end if;
  perform public._limitar_ou_recusar(p_acao || ':' || quem::text, p_max, p_segundos);
end $$;

revoke all on function public._limitar_chave(text, int, int) from public, anon, authenticated;
revoke all on function public._limitar_ou_recusar(text, int, int) from public, anon, authenticated;
revoke all on function public._limitar(text, int, int) from public, anon, authenticated;
grant execute on function public._limitar_chave(text, int, int) to service_role;

-- ------------------------------------------------------------ texto limpo
create or replace function public._texto(p text, p_max int default 2000) returns text
language plpgsql immutable set search_path = public as $$
declare t text;
begin
  if p is null then return null; end if;
  t := normalize(p, nfc);
  -- Controlo (menos tabulação e mudanças de linha), largura zero, marcas de direção e separadores invisíveis.
  t := regexp_replace(t, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0\uFFF9-\uFFFB\U000E0000-\U000E007F]', '', 'g');
  t := regexp_replace(t, '^[[:space:]\u00A0\u3000]+|[[:space:]\u00A0\u3000]+$', '', 'g');
  if char_length(t) > p_max then
    raise exception 'O texto é demasiado longo (máximo % caracteres).', p_max;
  end if;
  return t;
end $$;

revoke all on function public._texto(text, int) from public, anon, authenticated;

-- ------------------------------------------------------------ embrulhar
-- Põe de lado a função original (renomeada para _<nome>_base) para o embrulho a poder substituir. Se já estiver
-- embrulhada (o corpo do embrulho chama a _<nome>_base) não faz nada; se uma migração antiga a recriou (e o embrulho se perdeu), a base antiga é trocada pela nova.
create or replace function public._embrulhar(p_assinatura text, p_base text) returns void
language plpgsql set search_path = public as $$
declare
  v regprocedure := to_regprocedure(p_assinatura);
  corpo text;
  tipos text;
begin
  if v is null then raise exception 'A função % não existe.', p_assinatura; end if;
  select p.prosrc, oidvectortypes(p.proargtypes) into corpo, tipos from pg_proc p where p.oid = v;
  if position(p_base in corpo) > 0 then return; end if;
  execute format('drop function if exists public.%I(%s)', p_base, tipos);
  execute format('alter function %s rename to %I', v, p_base);
end $$;
revoke all on function public._embrulhar(text, text) from public, anon, authenticated;

-- criar_sugestao: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.criar_sugestao(text, text, text)', '_criar_sugestao_base');
create or replace function public.criar_sugestao(p_titulo text, p_categoria text, p_descricao text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('criar_sugestao', 10, 3600);
  perform public._criar_sugestao_base(public._texto(p_titulo, 200), public._texto(p_categoria, 40), public._texto(p_descricao, 4000));
end $$;
revoke all on function public._criar_sugestao_base(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.criar_sugestao(text, text, text) from public, anon;
grant execute on function public.criar_sugestao(text, text, text) to authenticated, service_role;

-- votar: 60 pedidos por 60 s por utilizador
select public._embrulhar('public.votar(uuid)', '_votar_base');
create or replace function public.votar(p_sugestao uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('votar', 60, 60);
  perform public._votar_base(p_sugestao);
end $$;
revoke all on function public._votar_base(uuid) from public, anon, authenticated, service_role;
revoke all on function public.votar(uuid) from public, anon;
grant execute on function public.votar(uuid) to authenticated, service_role;

-- denunciar: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.denunciar(uuid, text, text)', '_denunciar_base');
create or replace function public.denunciar(p_alvo uuid, p_motivo text, p_detalhes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('denunciar', 10, 3600);
  perform public._denunciar_base(p_alvo, public._texto(p_motivo, 100), public._texto(p_detalhes, 2000));
end $$;
revoke all on function public._denunciar_base(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.denunciar(uuid, text, text) from public, anon;
grant execute on function public.denunciar(uuid, text, text) to authenticated, service_role;

-- pedir_amizade: 30 pedidos por 1 h por utilizador
select public._embrulhar('public.pedir_amizade(text)', '_pedir_amizade_base');
create or replace function public.pedir_amizade(p_alvo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('pedir_amizade', 30, 3600);
  perform public._pedir_amizade_base(public._texto(p_alvo, 100));
end $$;
revoke all on function public._pedir_amizade_base(text) from public, anon, authenticated, service_role;
revoke all on function public.pedir_amizade(text) from public, anon;
grant execute on function public.pedir_amizade(text) to authenticated, service_role;

-- usar_convite: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.usar_convite(text)', '_usar_convite_base');
create or replace function public.usar_convite(p_codigo text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('usar_convite', 10, 3600);
  return public._usar_convite_base(public._texto(p_codigo, 32));
end $$;
revoke all on function public._usar_convite_base(text) from public, anon, authenticated, service_role;
revoke all on function public.usar_convite(text) from public, anon;
grant execute on function public.usar_convite(text) to authenticated, service_role;

-- pesquisar_jogadores: 120 pedidos por 60 s por utilizador
select public._embrulhar('public.pesquisar_jogadores(text)', '_pesquisar_jogadores_base');
create or replace function public.pesquisar_jogadores(p_q text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('pesquisar_jogadores', 120, 60);
  return public._pesquisar_jogadores_base(public._texto(p_q, 100));
end $$;
revoke all on function public._pesquisar_jogadores_base(text) from public, anon, authenticated, service_role;
revoke all on function public.pesquisar_jogadores(text) from public, anon;
grant execute on function public.pesquisar_jogadores(text) to authenticated, service_role;

-- torneio_procurar_jogadores: 120 pedidos por 60 s por utilizador
select public._embrulhar('public.torneio_procurar_jogadores(text)', '_torneio_procurar_jogadores_base');
create or replace function public.torneio_procurar_jogadores(p_q text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('torneio_procurar_jogadores', 120, 60);
  return public._torneio_procurar_jogadores_base(public._texto(p_q, 100));
end $$;
revoke all on function public._torneio_procurar_jogadores_base(text) from public, anon, authenticated, service_role;
revoke all on function public.torneio_procurar_jogadores(text) from public, anon;
grant execute on function public.torneio_procurar_jogadores(text) to authenticated, service_role;

-- perfil_por_riot: 120 pedidos por 60 s por utilizador
select public._embrulhar('public.perfil_por_riot(text)', '_perfil_por_riot_base');
create or replace function public.perfil_por_riot(p_riot text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('perfil_por_riot', 120, 60);
  return public._perfil_por_riot_base(public._texto(p_riot, 100));
end $$;
revoke all on function public._perfil_por_riot_base(text) from public, anon, authenticated, service_role;
revoke all on function public.perfil_por_riot(text) from public, anon;
grant execute on function public.perfil_por_riot(text) to authenticated, service_role;

-- torneio_convidar: 30 pedidos por 1 h por utilizador
select public._embrulhar('public.torneio_convidar(uuid, text, text)', '_torneio_convidar_base');
create or replace function public.torneio_convidar(p_equipa uuid, p_nome text, p_funcao text default 'jogador') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('torneio_convidar', 30, 3600);
  return public._torneio_convidar_base(p_equipa, public._texto(p_nome, 100), public._texto(p_funcao, 30));
end $$;
revoke all on function public._torneio_convidar_base(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.torneio_convidar(uuid, text, text) from public, anon;
grant execute on function public.torneio_convidar(uuid, text, text) to authenticated, service_role;

-- torneio_criar_equipa: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.torneio_criar_equipa(uuid, text, text)', '_torneio_criar_equipa_base');
create or replace function public.torneio_criar_equipa(p_torneio uuid, p_nome text, p_funcao text default 'jogador') returns uuid
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('torneio_criar_equipa', 10, 3600);
  return public._torneio_criar_equipa_base(p_torneio, public._texto(p_nome, 100), public._texto(p_funcao, 30));
end $$;
revoke all on function public._torneio_criar_equipa_base(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.torneio_criar_equipa(uuid, text, text) from public, anon;
grant execute on function public.torneio_criar_equipa(uuid, text, text) to authenticated, service_role;

-- torneio_renomear_equipa: 30 pedidos por 1 h por utilizador
select public._embrulhar('public.torneio_renomear_equipa(uuid, text)', '_torneio_renomear_equipa_base');
create or replace function public.torneio_renomear_equipa(p_equipa uuid, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('torneio_renomear_equipa', 30, 3600);
  perform public._torneio_renomear_equipa_base(p_equipa, public._texto(p_nome, 100));
end $$;
revoke all on function public._torneio_renomear_equipa_base(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.torneio_renomear_equipa(uuid, text) from public, anon;
grant execute on function public.torneio_renomear_equipa(uuid, text) to authenticated, service_role;

-- torneio_acesso
select public._embrulhar('public.torneio_acesso(uuid, text, boolean)', '_torneio_acesso_base');
create or replace function public.torneio_acesso(p_torneio uuid, p_nome text, p_dar boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._torneio_acesso_base(p_torneio, public._texto(p_nome, 100), p_dar);
end $$;
revoke all on function public._torneio_acesso_base(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.torneio_acesso(uuid, text, boolean) from public, anon;
grant execute on function public.torneio_acesso(uuid, text, boolean) to authenticated, service_role;

-- torneio_staff_adicionar
select public._embrulhar('public.torneio_staff_adicionar(uuid, text, text)', '_torneio_staff_adicionar_base');
create or replace function public.torneio_staff_adicionar(p_equipa uuid, p_nome text, p_funcao text default 'jogador') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._torneio_staff_adicionar_base(p_equipa, public._texto(p_nome, 100), public._texto(p_funcao, 30));
end $$;
revoke all on function public._torneio_staff_adicionar_base(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.torneio_staff_adicionar(uuid, text, text) from public, anon;
grant execute on function public.torneio_staff_adicionar(uuid, text, text) to authenticated, service_role;

-- entrar_fila: 30 pedidos por 60 s por utilizador
select public._embrulhar('public.entrar_fila(text)', '_entrar_fila_base');
create or replace function public.entrar_fila(p_fila text default 'aberta') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('entrar_fila', 30, 60);
  perform public._entrar_fila_base(public._texto(p_fila, 30));
end $$;
revoke all on function public._entrar_fila_base(text) from public, anon, authenticated, service_role;
revoke all on function public.entrar_fila(text) from public, anon;
grant execute on function public.entrar_fila(text) to authenticated, service_role;

-- definir_codigo: 20 pedidos por 60 s por utilizador
select public._embrulhar('public.definir_codigo(uuid, text)', '_definir_codigo_base');
create or replace function public.definir_codigo(p_match uuid, p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('definir_codigo', 20, 60);
  perform public._definir_codigo_base(p_match, public._texto(p_codigo, 32));
end $$;
revoke all on function public._definir_codigo_base(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.definir_codigo(uuid, text) from public, anon;
grant execute on function public.definir_codigo(uuid, text) to authenticated, service_role;

-- definir_avatar: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.definir_avatar(text)', '_definir_avatar_base');
create or replace function public.definir_avatar(p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('definir_avatar', 10, 3600);
  return public._definir_avatar_base(public._texto(p_url, 500));
end $$;
revoke all on function public._definir_avatar_base(text) from public, anon, authenticated, service_role;
revoke all on function public.definir_avatar(text) from public, anon;
grant execute on function public.definir_avatar(text) to authenticated, service_role;

-- definir_avatar_gif: 10 pedidos por 1 h por utilizador
select public._embrulhar('public.definir_avatar_gif(text)', '_definir_avatar_gif_base');
create or replace function public.definir_avatar_gif(p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('definir_avatar_gif', 10, 3600);
  return public._definir_avatar_gif_base(public._texto(p_url, 500));
end $$;
revoke all on function public._definir_avatar_gif_base(text) from public, anon, authenticated, service_role;
revoke all on function public.definir_avatar_gif(text) from public, anon;
grant execute on function public.definir_avatar_gif(text) to authenticated, service_role;

-- comprar_item: 30 pedidos por 60 s por utilizador
select public._embrulhar('public.comprar_item(text)', '_comprar_item_base');
create or replace function public.comprar_item(p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('comprar_item', 30, 60);
  return public._comprar_item_base(public._texto(p_item, 64));
end $$;
revoke all on function public._comprar_item_base(text) from public, anon, authenticated, service_role;
revoke all on function public.comprar_item(text) from public, anon;
grant execute on function public.comprar_item(text) to authenticated, service_role;

-- atualizar_perfil: 30 pedidos por 60 s por utilizador
select public._embrulhar('public.atualizar_perfil(text, text, boolean)', '_atualizar_perfil_base');
create or replace function public.atualizar_perfil(p_regiao text default null, p_funcao_jogo text default null, p_mudar_funcao_jogo boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('atualizar_perfil', 30, 60);
  return public._atualizar_perfil_base(public._texto(p_regiao, 30), public._texto(p_funcao_jogo, 30), p_mudar_funcao_jogo);
end $$;
revoke all on function public._atualizar_perfil_base(text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.atualizar_perfil(text, text, boolean) from public, anon;
grant execute on function public.atualizar_perfil(text, text, boolean) to authenticated, service_role;

-- ranking: 240 pedidos por 60 s por utilizador
select public._embrulhar('public.ranking(integer, integer, boolean, text, text)', '_ranking_base');
create or replace function public.ranking(p_offset integer default 0, p_limite integer default 50, p_so_amigos boolean default false, p_pesquisa text default '', p_fila text default 'aberta') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public._limitar('ranking', 240, 60);
  return public._ranking_base(p_offset, p_limite, p_so_amigos, public._texto(p_pesquisa, 100), public._texto(p_fila, 30));
end $$;
revoke all on function public._ranking_base(integer, integer, boolean, text, text) from public, anon, authenticated, service_role;
revoke all on function public.ranking(integer, integer, boolean, text, text) from public, anon;
grant execute on function public.ranking(integer, integer, boolean, text, text) to authenticated, service_role;

-- criar_novidade
select public._embrulhar('public.criar_novidade(date, text, text)', '_criar_novidade_base');
create or replace function public.criar_novidade(p_data date, p_titulo text, p_texto text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._criar_novidade_base(p_data, public._texto(p_titulo, 200), public._texto(p_texto, 2000));
end $$;
revoke all on function public._criar_novidade_base(date, text, text) from public, anon, authenticated, service_role;
revoke all on function public.criar_novidade(date, text, text) from public, anon;
grant execute on function public.criar_novidade(date, text, text) to authenticated, service_role;

-- avisar_jogador
select public._embrulhar('public.avisar_jogador(uuid, text)', '_avisar_jogador_base');
create or replace function public.avisar_jogador(p_perfil uuid, p_mensagem text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._avisar_jogador_base(p_perfil, public._texto(p_mensagem, 1000));
end $$;
revoke all on function public._avisar_jogador_base(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.avisar_jogador(uuid, text) from public, anon;
grant execute on function public.avisar_jogador(uuid, text) to authenticated, service_role;

-- banir_da_fila
select public._embrulhar('public.banir_da_fila(uuid, text, integer)', '_banir_da_fila_base');
create or replace function public.banir_da_fila(p_perfil uuid, p_mensagem text, p_horas integer default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._banir_da_fila_base(p_perfil, public._texto(p_mensagem, 1000), p_horas);
end $$;
revoke all on function public._banir_da_fila_base(uuid, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.banir_da_fila(uuid, text, integer) from public, anon;
grant execute on function public.banir_da_fila(uuid, text, integer) to authenticated, service_role;

-- definir_fila_fechada
select public._embrulhar('public.definir_fila_fechada(text, boolean, text)', '_definir_fila_fechada_base');
create or replace function public.definir_fila_fechada(p_fila text, p_fechada boolean, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._definir_fila_fechada_base(public._texto(p_fila, 30), p_fechada, public._texto(p_motivo, 500));
end $$;
revoke all on function public._definir_fila_fechada_base(text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.definir_fila_fechada(text, boolean, text) from public, anon;
grant execute on function public.definir_fila_fechada(text, boolean, text) to authenticated, service_role;

-- definir_discord_fila
select public._embrulhar('public.definir_discord_fila(boolean, text)', '_definir_discord_fila_base');
create or replace function public.definir_discord_fila(p_obrigatorio boolean, p_convite text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public._definir_discord_fila_base(p_obrigatorio, public._texto(p_convite, 200));
end $$;
revoke all on function public._definir_discord_fila_base(boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.definir_discord_fila(boolean, text) from public, anon;
grant execute on function public.definir_discord_fila(boolean, text) to authenticated, service_role;

-- overlay_dados: aberta a quem não entrou (o OBS não tem conta), com um limite por chave (300 por minuto: cada separador pergunta 20).
select public._embrulhar('public.overlay_dados(text, text)', '_overlay_dados_base');
create or replace function public.overlay_dados(p_chave text, p_fila text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_chave text := public._texto(p_chave, 128);
begin
  -- Só as chaves que existem têm contador (quem inventa chaves não enche a tabela) e a chave conta já limpa.
  if v_chave is not null and exists (select 1 from overlay_chaves k where k.chave = v_chave) then
    perform public._limitar_ou_recusar('overlay:' || v_chave, 300, 60);
  end if;
  return public._overlay_dados_base(v_chave, public._texto(p_fila, 30));
end $$;
revoke all on function public._overlay_dados_base(text, text) from public, anon, authenticated, service_role;
revoke all on function public.overlay_dados(text, text) from public;
grant execute on function public.overlay_dados(text, text) to anon, authenticated, service_role;

drop function public._embrulhar(text, text);

-- ------------------------------------------------------------ nada de funções abertas a quem não entrou
-- Fica só o overlay. Quem já podia executar mantém o acesso (authenticated e service_role); o que se tira é o acesso
-- anónimo, dado por omissão a todas as funções novas. As funções que uma política de segurança aberta a anon (ou a todos)
-- usa não se mexem: essa política é avaliada para anon e precisa de as poder chamar. Hoje não há nenhuma.
do $$
declare
  f record;
  com_sessao boolean;
  com_servico boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname <> 'overlay_dados'
      and has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1 from pg_policy pol
        where (0 = any (pol.polroles) or (select r.oid from pg_roles r where r.rolname = 'anon') = any (pol.polroles))
          and coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ ('\m' || p.proname || '\M')
      )
  loop
    com_sessao := has_function_privilege('authenticated', f.oid, 'execute');
    com_servico := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke all on function %s from public, anon', f.assinatura);
    if com_sessao then execute format('grant execute on function %s to authenticated', f.assinatura); end if;
    if com_servico then execute format('grant execute on function %s to service_role', f.assinatura); end if;
  end loop;
end $$;
