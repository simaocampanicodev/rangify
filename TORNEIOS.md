# Torneios

Torneios com equipas, fase de grupos, playoffs de eliminação simples, **picks e bans de mapas** e resultados lidos da API da Riot (como as partidas normais do hub, por isso ninguém escreve resultados). Feito para o **T7 x LGW Cup**, mas serve qualquer torneio do mesmo género.

Tudo nasce **fechado**: só Owner e Dev criam e gerem torneios. Os outros jogadores só veem um torneio depois de ele sair de rascunho **e** estar aberto a todos, ou se a staff os convidou a testar, ou se estão numa equipa dele.

## O formato

- **Equipas**: 5 jogadores + 1 coach + 2 suplentes. O capitão (quem cria a equipa) entra como jogador ou como coach. Cada pessoa só está numa equipa por torneio.
- **Inscrição**: o capitão cria a equipa e convida **pelo nome** (Riot ID `Nome#TAG`, utilizador ou o nome antes do `#`). O convidado tem de **aceitar** (aparece um número no menu e um aviso na página Torneios). Até ao fim das inscrições a equipa muda tudo (renomear, convidar, tirar gente, mudar funções, sair). Os convites pendentes contam para os lugares.
- **Fase de grupos**: grupos de 4 (configurável, 3 a 6), todos contra todos (3 jogos por equipa num grupo de 4). Desempate: vitórias, confronto direto (entre dois), diferença de rondas, rondas ganhas e ordem do sorteio.
- **Playoffs**: passam os 2 primeiros de cada grupo (configurável, 1 a 3). Eliminação simples: quem perde está fora. Com 2 a passar e um número de grupos potência de 2, o 1.º de um grupo apanha o 2.º do grupo vizinho (as equipas do mesmo grupo só se cruzam na final). Nos outros casos usa-se a ordem da fase de grupos e há folgas para os primeiros (por exemplo 12 equipas: 3 grupos, 6 passam, chave de 8 com 2 folgas).
- **Final presencial** (opção): a final do T7 x LGW Cup joga-se na LGW. Não se abre no hub: a staff põe o resultado.
- **Datas**: a staff faz o sorteio e marca a data e a hora de cada jogo (também com "preencher horas": primeiro jogo, intervalo e quantos jogos à mesma hora).

## Como se joga um jogo

1. **30 minutos antes da hora marcada** um dos capitães começa os **picks e bans** (nos torneios de teste, a qualquer hora).
2. Os capitães das duas equipas vetam à vez (a equipa A, a que aparece à esquerda, começa). Cada vez tem **90 segundos**; passado o tempo joga-se ao calhas por quem não jogou (é o cron, de minuto a minuto, e também qualquer pessoa com a página aberta). Capitães bots jogam logo.
   - **Só bans** (por defeito, como no hub): banem até sobrar um mapa; quem **não** baniu por último escolhe o lado (ataque ou defesa).
   - **Bans e escolha**: banem à vez até sobrarem 3; a equipa da vez **escolhe o mapa** e a outra escolhe o lado.
   - Os mapas em jogo são os que a staff escolher para o torneio (3 a 13) ou, se não escolher nenhum, a **rotação do hub** na altura.
   - Em qualquer jogo a staff pode **fixar o mapa à mão** no calendário (então não há picks e bans nesse jogo), despachar o que falta ao calhas ou reiniciar os vetos.
3. Com o mapa e o lado decididos, o capitão cria o jogo personalizado no Valorant, cola o código do grupo no site e abre o jogo. As duas equipas veem o código.
4. O resultado é lido da **Henrik Dev API**: procura-se uma partida **nesse mapa**, depois da hora de abertura (com 15 minutos de margem), com jogadores das duas equipas (o mínimo configurável, 8 por defeito) e que ainda não seja de outro jogo do torneio. Não há consultas a mais: no máximo uma por minuto por jogo. Se passar 1 hora sem resultado, a staff é avisada e põe-no à mão (Staff › Torneios › Resultados).
5. O vencedor sobe sozinho na chave. Falta de comparência: **W.O.** (13-0) na Staff. Enganos: **Desfazer** (só se o jogo seguinte ainda não começou).

Os torneios **não mexem** nos pontos, no rank nem nas estatísticas do hub.

## Staff › Torneios

| | |
|---|---|
| **Novo** | Nome, descrição, inscrições até, grupos, final presencial, picks e bans (formato e mapas), jogadores mínimos na API, torneio de teste. Há um botão com o **modelo do T7 x LGW Cup** (grupos de 4, passam 2, final presencial). |
| **Publicar** | Rascunho → inscrições abertas. Pode voltar a rascunho se ainda não houver equipas. Cancelar e apagar pedem para **segurar** o botão. Um torneio a sério já publicado não se apaga: cancela-se. |
| **Quem vê** | "Aberto a todos" liga e desliga. Fechado, só a staff, quem convidares a testar (pelo nome) e as pessoas das equipas inscritas veem o torneio. |
| **Sorteio** | Segura para sortear: fecha as inscrições e cria os grupos (só equipas com 5 jogadores aceites) e o calendário. Dá para repetir enquanto nenhum jogo tiver começado; a seed fica guardada e podes pôr uma à mão. |
| **Calendário** | Data, hora, mapa fixo (ou picks e bans) e "presencial" de cada jogo, com "Guardar tudo". Mostra o estado dos picks e bans de cada jogo, com "Despachar ao calhas" e "Reiniciar". |
| **Resultados** | Põe o resultado à mão (final presencial, falha da API), W.O. e desfazer. Os jogos sem resultado há mais de 1 hora aparecem primeiro. |
| **Testes com bots** | Só em torneios de teste (ver abaixo). |

## Testar sem estragar nada

Cria o torneio com **Torneio de teste** ligado. Nesses torneios (e só nesses):

- os jogos abrem e os picks e bans começam a **qualquer hora**, e a API só precisa de **2 jogadores** em comum (por defeito) em vez de 8;
- **Juntar equipas de bots**: equipas completas (5 bots cada), já inscritas;
- **Encher uma equipa com bots**: a tua equipa, só com os teus amigos reais e bots a preencher o resto (opcionalmente coach e 2 suplentes);
- os bots **vetam sozinhos** nos picks e bans (basta tu jogares na tua vez);
- **Simular os grupos** / **Simular tudo**: resultados e estatísticas de mentira até ao campeão (os jogos simulados também têm mapa e picks e bans);
- **Reiniciar**: volta às inscrições, apaga grupos, jogos e resultados e mantém as equipas.

Para testar com **amigos de verdade**: dá-lhes acesso em Staff › Torneios › Quem vê › Convidar a testar (ou liga "Aberto a todos"). Eles criam a equipa e convidam-se uns aos outros pelo nome; se faltar gente, enches o resto com bots. Para os resultados serem lidos de verdade, joga-se um jogo personalizado no Valorant com o código do grupo (num torneio de teste bastam 2 jogadores da API).

No **modo demo** (sem Supabase) não há API da Riot: um jogo aberto fecha-se sozinho passados 15 segundos com um resultado simulado, e os bots da comunidade aceitam os convites, para se ver o fluxo todo.

## Pôr no ar (uma vez)

1. **Base de dados.** No SQL Editor, corre `supabase/migrations/0031_torneios.sql` (pode correr outra vez sem estragar nada). Cria as tabelas, as funções e dois jobs de `pg_cron`: `rangify-torneios` (pede à Edge Function que veja os jogos a decorrer) e `rangify-torneios-veto` (joga ao calhas as vezes dos picks e bans que passaram do prazo).
2. **Edge Function.**
   ```
   npx supabase functions deploy processar-torneio --no-verify-jwt
   ```
   Usa os segredos que já existem (`HENRIK_API_KEY`, `DISCORD_SEGREDO`). A verificação de JWT fica desligada porque o cron chama-a com o segredo no cabeçalho `x-rangify-segredo`; quando chamada por um jogador valida a sessão por dentro.
3. **Cron.** Os dois jobs usam o endereço e o segredo guardados em `discord_config`, por isso o Discord tem de estar configurado (ver `DISCORD.md`). Sem `pg_cron`, os jogos só são verificados quando alguém abre a página do jogo e os vetos só avançam por tempo com a página aberta.
4. **Site.** Faz deploy no Render (as rotas `/torneios` e `/torneios/:id` e o separador Staff › Torneios vão no build).

## Para quem mexe no código

- `supabase/migrations/0031_torneios.sql`: tabelas (`torneios`, `torneio_equipas`, `torneio_membros`, `torneio_acessos`, `torneio_jogos`, `torneio_jogo_vetos`, `torneio_jogo_jogadores`, `torneio_jogo_segredos`), RPCs `torneio_*` (as que o site chama) e funções internas `_torneio_*` (só `service_role`). As tabelas têm RLS ligado sem políticas: o site só lê por RPC.
- `supabase/functions/processar-torneio` + `_shared/henrik-partida.ts`: deteção do resultado.
- `src/lib/dados/local-torneios.ts`: o mesmo motor para o modo demo, com as mesmas regras e mensagens.
- `src/pages/Torneios.tsx`, `src/pages/Torneio.tsx`, `src/components/torneios/*`: o hub; `StaffTorneios.tsx`: a Staff.
- Testes (`npm run testar-sql`): `scripts/testar-torneios.mjs` (SQL num Postgres local), `scripts/testar-deteccao.mjs` (deteção na API) e `scripts/testar-torneios-demo.mjs` (motor do demo).
