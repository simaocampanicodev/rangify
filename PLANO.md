# Rangify: plano de construção

Estado (12 Out 2026): site completo em modo demo e em modo Supabase. `npm run build` passa e `npm run testar-sql` passa (65/65). Falta só ligar a um projeto Supabase real (ver README).

## Pedidos do utilizador a cumprir
1. Tour de boas-vindas para contas novas: explica cada aba, ancorado à sidebar (`data-tour`), Anterior, Seguinte e Saltar, fica marcado no perfil (`tour_seen_at`) e pode ser revisto nas Definições.
2. Botões "Como funciona…" em cada secção (fila, draft, mapas, código, jogo, resultado e disputas, ranking e pontos, rank oficial, missões, amigos, sugestões, funções), num modal de ajuda partilhado.
3. Aviso "Rangify é um projeto independente…" sempre no fundo do ecrã, a toda a largura da área principal, em todas as páginas (layout em coluna, `min-height: 100vh`, rodapé com `margin-top: auto`).
4. "Simular fila cheia" e "simular partida" só para Owner e Dev, num painel "Ferramentas de teste". O modo demo tem um seletor de função nas Definições.

## Arquitetura
- `src/lib/dados/{tipos,index,local,supabase,semente}.ts`: a mesma interface `Dados` para o modo demo (motor da máquina de estados no browser, com bots) e para o Supabase (RPCs).
- `src/lib/{ranks,pontos,mapas,regras,tempo,supabase}.ts`.
  - Pontos: 1000 iniciais, ±20 de base, mais `clamp(3 × (média de divisões do adversário − a tua divisão), −8, +10)`.
  - Divisão = tier Henrik − 2. Quem não tem rank conta como 9.
  - Regras do resultado: 13 com 11 ou menos do outro lado, ou prolongamento com 2 de diferença.
- `contexts/{Sessao,Tour}`, `components/{Layout,Sidebar,Fundo,Rodape,Marca,Ajuda,Tour,FerramentasDev,GraficoForma,ui/*,partida/*}`.
- `pages/`: Entrar, Dashboard, Jogar (com as fases), Ranking, Partidas, Perfil (`/perfil/Nome-TAG`), Missoes, Amigos, Sugestoes, Admin e Definicoes.
- O visual segue o protótipo aprovado (canvas https://claude.ai/artifact/16gooa3YxauqurTaJWNuzb, sobretudo a página "Fluxo da partida").

## Supabase
- `supabase/migrations/0001_schema.sql`, com as tabelas:
  - `profiles`, com `auth_id` nullable para os bots, `points`, `official_tier` e `role`
  - `queue_entries`, `matches`, `match_players`, `match_bans`, `match_results`
  - `friends`, `quests`, `user_quests`, `suggestions`, `suggestion_votes`, `reports`
- Na mesma migração: RLS, colunas protegidas e RPCs `security definer` com `FOR UPDATE`. Os RPCs são:
  - fila e partida: `entrar_fila`, `sair_fila`, `responder_confirmacao`, `avancar_partida` (prazos e jogadas dos bots), `escolher_jogador`, `banir_mapa`, `definir_codigo`, `submeter_resultado`
  - staff: `resolver_disputa`, `aplicar_resultado` (só service role), `definir_funcao`
  - testes: `dev_encher_fila`, `dev_simular_partida`, `dev_saltar_bloqueio`
- As partidas simuladas não mexem nos pontos reais.
- Edge Functions:
  - `sincronizar-rank`: Henrik, com intervalo mínimo de 6 h
  - `processar-partida`: estado 8, que extrai KDA, ACS e First Bloods e atualiza missões e ranks
  - `entrar`: login com utilizador e password, sem expor emails
- Testar o SQL com `@electric-sql/pglite` (`scripts/testar-sql.mjs`), com stubs de `auth.uid()` e de roles.
