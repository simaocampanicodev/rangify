# Migrações

O esquema, as regras e a máquina de estados do Rangify vivem em `supabase/migrations/`. Aplicam-se **por ordem**, uma vez cada, no **SQL Editor** do Supabase (ou com `supabase db push`). Cada ficheiro pode voltar a correr sem estragar nada.

- Para mudar a base de dados, cria sempre uma **migração nova**; nunca edites uma antiga.
- Cada migração tem o seu teste em `scripts/` (ver [arquitetura](architecture.md#testes)).
- Este índice gera-se com `node scripts/gerar-indice-migracoes.mjs`.

| Migração | O que faz |
| --- | --- |
| [`0001_schema.sql`](../supabase/migrations/0001_schema.sql) | Esquema, regras de acesso e máquina de estados das partidas. |
| [`0002_perfil.sql`](../supabase/migrations/0002_perfil.sql) | Fotos de perfil. |
| [`0003_estatisticas.sql`](../supabase/migrations/0003_estatisticas.sql) | Mais estatísticas por jogador (Trades, HS% e KAST%), remover partidas do histórico e acertar pontos à mão. |
| [`0004_fila_amigos.sql`](../supabase/migrations/0004_fila_amigos.sql) | Testar a fila com amigos. |
| [`0005_perfil_estatisticas.sql`](../supabase/migrations/0005_perfil_estatisticas.sql) | Perfil mais completo. |
| [`0006_rotacao_testes.sql`](../supabase/migrations/0006_rotacao_testes.sql) | Rotação de mapas editável e partidas de teste que contam. |
| [`0007_experiencia.sql`](../supabase/migrations/0007_experiencia.sql) | Rangify Experience: missões diárias, rotação de missões e XP com níveis. |
| [`0008_novidades_api.sql`](../supabase/migrations/0008_novidades_api.sql) | Novidades editáveis na Staff e afinações da confirmação pela Henrik Dev API. |
| [`0009_situacao.sql`](../supabase/migrations/0009_situacao.sql) | Menos esperas no site: uma só chamada devolve o estado da fila e a partida já avançada. |
| [`0010_sugestoes_staff.sql`](../supabase/migrations/0010_sugestoes_staff.sql) | Sugestões geridas pela staff: mudar o estado (Recebida, Em análise, Planeada, Feita) e apagar. |
| [`0011_discord.sql`](../supabase/migrations/0011_discord.sql) | Canais de Discord por partida. |
| [`0012_rangify_score.sql`](../supabase/migrations/0012_rangify_score.sql) | Rangify Score, agentes e Discord obrigatório para a fila. |
| [`0013_recarregar_partida.sql`](../supabase/migrations/0013_recarregar_partida.sql) | Recarregar os dados de uma partida já jogada (Owner e Dev). |
| [`0014_tempo_real.sql`](../supabase/migrations/0014_tempo_real.sql) | Amizades, fila e partidas em tempo real. |
| [`0015_loja.sql`](../supabase/migrations/0015_loja.sql) | Loja de Rangify Coins. |
| [`0016_discord_ping.sql`](../supabase/migrations/0016_discord_ping.sql) | Botão "Chamar para a fila" no canal de ping do Discord. |
| [`0017_lados_sugestoes.sql`](../supabase/migrations/0017_lados_sugestoes.sql) | Capitães ao calhas, escolha do lado, sugestões da equipa e resultados pela staff. |
| [`0018_moedas_diarias.sql`](../supabase/migrations/0018_moedas_diarias.sql) | As missões diárias também dão Rangify Coins, e os outros valores acertam-se: diária +15 (até 4 por dia), semanal +40, nível +120, cada 5.º nível +400, MVP +25. |
| [`0019_pontos_sem_rank.sql`](../supabase/migrations/0019_pontos_sem_rank.sql) | Os pontos deixam de depender do rank oficial: só se avalia o que se joga. |
| [`0020_margem_cancelar_fila.sql`](../supabase/migrations/0020_margem_cancelar_fila.sql) | Margem de rondas nos pontos, votação para cancelar a partida e a fila no Discord. |
| [`0021_partidas_ao_vivo.sql`](../supabase/migrations/0021_partidas_ao_vivo.sql) | Staff: as partidas ao vivo. |
| [`0022_historico_paginas.sql`](../supabase/migrations/0022_historico_paginas.sql) | Histórico de partidas com o tamanho da página à escolha. |
| [`0023_fila_presenca.sql`](../supabase/migrations/0023_fila_presenca.sql) | Fechar o separador ou o browser tira a pessoa da fila. |
| [`0024_capitaes_votam_vencedor.sql`](../supabase/migrations/0024_capitaes_votam_vencedor.sql) | Os capitães só confirmam quem ganhou. |
| [`0025_ordem_draft.sql`](../supabase/migrations/0025_ordem_draft.sql) | Ordem das escolhas do draft: A, B, B, A, A, B, B, A. |
| [`0026_avisos_bans.sql`](../supabase/migrations/0026_avisos_bans.sql) | Avisos e bans da fila, dados pela staff. |
| [`0027_discord_canal_fila.sql`](../supabase/migrations/0027_discord_canal_fila.sql) | A fila no Discord passa para um canal só dela. |
| [`0028_codigo_dois_capitaes_cancelar_7.sql`](../supabase/migrations/0028_codigo_dois_capitaes_cancelar_7.sql) | Os dois capitães partilham o código, e o cancelamento pede 7 votos. |
| [`0029_streamers_convites.sql`](../supabase/migrations/0029_streamers_convites.sql) | Streamers e convites: overlay do OBS, Twitch ligada ao perfil e convites com recompensa. |
| [`0030_tabelas_so_quem_jogou_agentes.sql`](../supabase/migrations/0030_tabelas_so_quem_jogou_agentes.sql) | As tabelas só mostram quem já jogou, e há uma tabela do melhor jogador de cada agente. |
| [`0031_torneios.sql`](../supabase/migrations/0031_torneios.sql) | Torneios: equipas de 5 + coach + 2 suplentes, fase de grupos, playoffs de eliminação simples e resultados detetados pela API da Riot (como as partidas normais do hub). |
| [`0032_filas_ranked.sql`](../supabase/migrations/0032_filas_ranked.sql) | Duas filas: a aberta (qualquer rank) e a ranked (só Ascendente 1 ou mais). |
| [`0033_historico_fila.sql`](../supabase/migrations/0033_historico_fila.sql) | Filtrar as partidas por fila: abertas ou ranked. |
| [`0034_discord_anuncios.sql`](../supabase/migrations/0034_discord_anuncios.sql) | Avisos no Discord: um canal onde o bot publica as mensagens que a staff escreve em Staff › Discord. |
| [`0035_sem_loja.sql`](../supabase/migrations/0035_sem_loja.sql) | Fora a loja e todos os cosméticos. |
| [`0036_loja_de_volta.sql`](../supabase/migrations/0036_loja_de_volta.sql) | A loja de Rangify Coins e os cosméticos voltam. |
| [`0037_ranked_volta_a_ranked.sql`](../supabase/migrations/0037_ranked_volta_a_ranked.sql) | Quem aceita uma partida ranked que cai volta à fila ranked (e não à aberta). |
| [`0038_perfil_por_fila.sql`](../supabase/migrations/0038_perfil_por_fila.sql) | As estatísticas e a forma do perfil, por fila. |
| [`0039_menos_carga.sql`](../supabase/migrations/0039_menos_carga.sql) | Menos trabalho para a base de dados: o site pergunta o estado da partida a toda a hora (de 1 em 1 segundo, por jogador) e cada pergunta bloqueava a linha da partida e montava o JSON inteiro. |
