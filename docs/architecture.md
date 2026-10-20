# Arquitetura

Como o Rangify está montado: o que vive no browser, o que vive na base de dados e como as duas partes falam. Para pôr tudo a funcionar, ver [Instalar e configurar](setup.md) e [Deploy](deploy.md).

## Visão geral

```text
 Browser (React)  ──►  Supabase
 ├─ modo demo            ├─ Postgres: tabelas, RLS e funções SQL (a máquina de estados)
 └─ modo Supabase        ├─ Auth: login com o Discord e com utilizador e palavra-passe
                         ├─ Realtime: amizades, fila e partidas
                         └─ Edge Functions (Deno): Henrik Dev API, bot do Discord, Twitch
```

- **A lógica do jogo vive na base de dados.** Os clientes só leem; tudo o que muda dados passa por funções SQL `security definer` (com `for update`) que fazem de máquina de estados. As regras de acesso (RLS) e as colunas protegidas garantem que ninguém contorna isso.
- **Segredos nunca chegam ao browser.** O que precisa de chaves (Henrik Dev API, token do bot do Discord, Twitch) passa pelas Edge Functions.
- **O código do grupo** de uma partida só é visível aos 10 jogadores dela.

## Estrutura do código

```text
src/
├── pages/                 Uma página por rota: Dashboard, Jogar, Ranking, Partidas, Perfil, Missoes, Amigos, Admin...
├── components/
│   ├── match/             As fases da partida: Confirmar, Draft, Mapas, Codigo e Resultado
│   ├── tournaments/       O hub e a staff dos torneios
│   ├── Fila.tsx           Os cartões e o anel da fila aberta e da ranked
│   ├── StaffExtras.tsx    Os painéis da Staff (Discord, divulgação, API...)
│   └── ui.tsx             Os blocos visuais partilhados
├── contexts/              Sessão, partida em curso (polling inteligente) e avisos
├── hooks/                 useCarregar (cache e avisos de mudança), useIntervalo, useVisivel...
└── lib/
    ├── data/              A interface Dados e as duas implementações
    ├── pontos.ts          A fórmula dos pontos (a mesma que a SQL)
    ├── ranks.ts · regras.ts · mapas.ts · regioes.ts
    └── discordMarkdown.tsx  A pré-visualização dos avisos do Discord
```

### A camada de dados

`src/lib/data/` define a interface `Dados` e tem duas implementações:

| Ficheiro | Para quê |
| --- | --- |
| `supabase.ts` | O modo real: chama as funções SQL (RPC) e as Edge Functions. Devolve já o JSON com os nomes que as páginas usam |
| `local.ts` | O **modo demo**: o motor da partida corre no browser (`localStorage`), com bots que aceitam, escolhem, banem e confirmam |
| `semente.ts` | Os 64 jogadores de exemplo e cerca de 120 partidas já jogadas |
| `tipos.ts` · `eventos.ts` | Os tipos partilhados e os avisos de mudança (`avisarMudanca`) que fazem as páginas recarregar |

O modo demo espelha as regras da SQL, por isso o que se vê na demo é o que corre a sério. Há testes que comparam os dois.

## Os pontos

Toda a gente começa a temporada com **1000 pontos**. O rank oficial da Riot nunca ordena nada nem entra nas contas: é só informativo (perfil e média das equipas).

- **Resultado**: vitória `+(20 + margem)`, derrota `-(20 + margem)`, com `margem = arredondar((diferença de rondas - 6) / 2)`, entre -3 e +4. Um 13-11 vale 18 e um 13-0 vale 24.
- **Desempenho** (Rangify Score): de -6 a +6, um ponto por cada 6 de RS acima ou abaixo de 100.
- Exemplo: ganhas por 13-5 com um RS de 124. O resultado dá +21, o desempenho soma +4, ficas com +25.
- **Rangify Score**: ACS, KDA, KAST e trades de cada jogador comparados com a média da partida (100 é a média).
- Cada fila (aberta e ranked) tem os seus pontos, vitórias, derrotas e tabela.

A fórmula está em `src/lib/pontos.ts` e em `_pontos_partida` na SQL.

## A máquina de estados

1. `READY_CHECK`: 20 s para aceitar. Quem recusa fica 5 min de castigo e os outros voltam à fila com o mesmo lugar.
2. `DRAFT_PHASE`: os dois capitães saem ao acaso. As 8 escolhas seguem a ordem **A, B, B, A, A, B, B, A**, 30 s por escolha.
3. `MAP_BAN`: os 13 mapas do Valorant; os bans alternam (60 s cada, com sugestões da equipa) e o mapa que sobra é o da partida. A equipa que não baniu por último escolhe o lado.
4. `LOBBY_CREATION`: um dos dois capitães (A ou B) partilha o código do grupo (6 letras ou números); o primeiro a guardar vale. Aqui e nos primeiros 10 minutos de jogo, 7 jogadores de 10 podem votar para cancelar a partida (sem pontos nem castigos).
5. `IN_PROGRESS`: bloqueio de 15 minutos antes de se poder confirmar o resultado.
6. `RESULT_SUBMISSION`: cada capitão só escolhe a equipa que ganhou (A ou B), para confirmar que o jogo acabou. Quando os dois votam, ou 3 minutos depois do primeiro voto, a partida segue para a API.
7. `PROCESSING_API`: a Edge Function procura o jogo na Henrik Dev API e fecha a partida com o resultado e o vencedor que a API diz (corrige quem votou mal). Sem resposta em 30 min, vai para disputa.
8. `COMPLETED`, `DISPUTE` (a API não achou o jogo: a staff decide) ou `CANCELLED`.

Os prazos e as jogadas dos bots avançam em `avancar_partida`, que o site chama enquanto há uma partida a decorrer.

## Tempo real e polling

- O **Realtime** do Supabase avisa quando a fila muda, quando entras numa partida e quando ela avança. Perguntar ao servidor fica como reserva.
- O **polling** (`situacao`) é inteligente: pergunta mais vezes durante uma partida, menos na fila, e pára com o separador escondido.
- Quem fecha o separador sai da fila (pedido `keepalive`), e quem fica sem dar sinal de vida é tirado ao fim de 3 minutos.

### Menos carga na base de dados

- `_passo_pendente` diz, sem bloquear nada, se a partida tem algum prazo ou jogada de bot por cumprir. `situacao` e `avancar_partida` só correm a máquina de estados (que bloqueia a linha da partida) quando há. Com o Realtime a avisar das mudanças, o site pergunta de 2,5 em 2,5 segundos durante uma partida no Supabase (1 s no demo, onde não há Realtime).
- Nenhuma pergunta espera pelo bloqueio da partida: `situacao` e `avancar_partida` tentam-no com `for update skip locked` e, se outro já está a fazer andar a partida, devolvem o estado que lá está. E `_passo_pendente` só conta uma jogada de bot quando o capitão da vez é mesmo um bot (o `bot_move_at` fica marcado depois de cada escolha ou ban, mesmo numa partida só de pessoas). Antes, os dez jogadores entravam em fila no mesmo bloqueio a cada pick e ban, ocupavam as ligações do PostgREST e deixavam o resto do site e o Auth sem resposta (migração `0041`).
- O supabase-js repete o `SIGNED_IN` sempre que o separador volta ao ecrã. Isso recarregava o perfil e apagava as decorações de toda a gente (centenas de pedidos por hora): agora só conta quando a conta muda. Escolher, banir, sugerir e votar para cancelar já não avisam o site todo (recarregavam o perfil a cada clique), e quem está numa partida só ouve o Realtime da própria partida, não o da fila.
- O draft pede as estatísticas de todos os jogadores numa só chamada (`estatisticas_resumo`: partidas, vitórias, KDA e ACS) em vez de calcular o perfil inteiro de cada um.
- As decorações dos jogadores ficam em memória 10 minutos e só se apagam quando a loja muda.
- Na Staff, as listas (partidas ao vivo, resultados, jogadores, denúncias, jogos de um torneio) desenham-se por partes, os jogadores de cada partida só quando se pedem, e as secções pesadas (Discord, torneios) abrem uma de cada vez.

### Fechar as filas

Owner e Dev têm, no topo da área de Staff, um painel para fechar e abrir a fila aberta e a ranked (`StaffFilas.tsx`, `definir_fila_fechada`, migração `0042`). É o interruptor de emergência para quando há problemas. Segura-se o botão para fechar, e dá para escrever um motivo (até 140 caracteres) que os jogadores veem.

- Fechada, ninguém entra (`entrar_fila` recusa com o motivo), quem esperava nessa fila sai, e não se formam partidas novas nela. Quem aceitou uma partida que caiu não volta a uma fila fechada.
- As partidas já formadas continuam e acabam normalmente. As ferramentas de teste (partidas com bots) continuam a funcionar.
- O estado vem em `estado_fila().filasFechadas` (`{ aberta, ranked, motivo }`), por isso os cartões da fila mostram "Fila fechada" e o motivo, o mais tardar à pergunta seguinte (30 s fora da fila). Sem a `0042`, o site não mostra nada e tudo funciona como antes.

### Endereço da partida

Uma partida em curso vive em `/partida/<ID>` (`PaginaPartida` em `pages/Jogar.tsx`, `caminhoPartida` em `lib/rotas.ts`). Com uma partida por fechar, `/jogar` redireciona para ela; sem partida (ou com o ID de outra), `/partida/<ID>` volta a `/jogar`. Atualizar a página, abrir noutro separador e o botão de voltar do browser levam à mesma partida. O endereço não dá acesso a nada: o servidor só devolve a partida de quem joga nela. Os links antigos para `/jogar` (Discord, extensão) continuam a funcionar.

### Um líder por partida

Numa partida (confirmação, bans, draft), dez jogadores a perguntar à base de dados ao mesmo tempo, e cada um a ouvir as mudanças das tabelas, era o que mais pesava. Agora só um jogador, o **líder**, pergunta o estado e reenvia-o aos outros nove (`src/lib/lider.ts`, `Partida.tsx`).

- Cada partida tem um canal do Realtime privado, `partida:<ID>`, onde só entram os seus jogadores (migração `0040`, regras em `realtime.messages`). Usa Presence e Broadcast, que não tocam na base de dados.
- O líder é quem tem o separador à frente e está na sala há mais tempo (`eleger`). Se sair ou esconder o separador, passa para outro. Reenvia o estado quando muda e de 4 em 4 segundos.
- Quem recebe não ouve as tabelas e só confirma o estado com a base de dados de 15 em 15 segundos (5 s nos bans, onde há sugestões só da equipa). Mudou a fase, ou a partida acabou: pergunta logo.
- O que é pessoal nunca viaja no canal: o código do grupo, as sugestões da equipa e o voto de cada um para cancelar ficam por jogador (`publica` e `fundir`).
- Tudo o que muda (aceitar, banir, escolher) continua a passar pelas funções da base de dados, que validam tudo. O líder só poupa perguntas repetidas.
- Se o canal não abrir (por exemplo, sem a `0040`), ou o líder se calar durante 8 segundos, cada jogador volta a perguntar por conta própria, como antes. No demo não há sala.
- Limite: um jogador malicioso da partida poderia enviar um estado falso, mas só até à confirmação seguinte com a base de dados, e só os dez da partida podem escrever no canal.

## Edge Functions

Em `supabase/functions/`. As que o bot ou outros serviços chamam sem sessão publicam-se com `--no-verify-jwt`.

| Função | O que faz |
| --- | --- |
| `entrar` | Login por utilizador e palavra-passe, sem expor emails |
| `sincronizar-rank` | Liga o Riot ID e lê o rank oficial (no máximo de 6 em 6 horas) |
| `processar-partida` | Procura a partida personalizada na Henrik Dev API (no máximo uma consulta por minuto por partida) e tira o resultado, o vencedor e as estatísticas; volta a ler o rank dos dez jogadores |
| `recarregar-partida` | Owner e Dev: volta a ler uma partida terminada e refaz o RS, o MVP e os pontos |
| `testar-api` | Owner e Dev: mostra o que seria gravado do último jogo da própria conta |
| `verificar-discord` | Pergunta ao bot se o jogador está no servidor |
| `discord-partida` | Chamada pela base de dados: cria e apaga os canais e cargos de cada partida, atualiza a contagem das filas e envia as mensagens privadas dos avisos |
| `discord-ping` · `discord-interacoes` | O botão de chamar para a fila, as mensagens das filas e o cargo Ranked |
| `discord-anuncio` | Publica os avisos escritos em Staff › Discord |
| `puxar-call` | Muda-te para a call da tua equipa, se já estiveres numa call |
| `twitch-ligar` · `twitch-sincronizar` | A Twitch ligada ao perfil e o estado "AO VIVO" |
| `processar-torneio` | Lê da API os resultados dos jogos dos torneios |

O Discord está em [discord.md](discord.md), as Twitch e os convites em [streamers.md](streamers.md) e os torneios em [tournaments.md](tournaments.md).

## Testes

```bash
npm run build         # tsc + vite build
npm run testar-sql    # todas as suites abaixo, uma a seguir à outra
```

| Suite | O que cobre |
| --- | --- |
| `scripts/testar-sql.mjs` | As migrações num Postgres local (PGlite): a fila, a confirmação, o draft, os bans, o código, o resultado, os pontos, a segurança (RLS e funções internas), a Staff e o Discord |
| `scripts/testar-filas.mjs` | As duas filas: quem pode entrar na ranked, pontos e tabelas separados, o histórico e o overlay do OBS |
| `scripts/testar-filas-demo.mjs` | O mesmo, no modo demo (o motor do browser) |
| `scripts/testar-torneios.mjs` · `testar-torneios-demo.mjs` · `testar-migracao-torneios.mjs` | Os torneios, na SQL, na demo e na migração de uma versão anterior |
| `scripts/testar-deteccao.mjs` | A deteção do jogo na API da Riot |
| `scripts/testar-anuncio.mjs` | A mensagem dos avisos do Discord |

Outras ferramentas em `scripts/`:

- `montar-extensao.mjs`: prepara a extensão do browser (ver [extension.md](extension.md)).
- `otimizar-mapas.mjs`: converte a arte original dos mapas (`assets/maps-source`) em WebP (`public/maps`).
- `capturar-ecras.mjs`: gera o banner e as capturas de ecrã do README (`assets/readme`), a partir do modo demo.
- `gerar-indice-migracoes.mjs`: gera [migrations.md](migrations.md).
