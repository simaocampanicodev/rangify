# Rangify: staff, fila Discord, extensão, ranks e telemóvel

## Intent

O Rangify já tem fila, draft, Discord e um painel de staff. Este trabalho alinha o produto com o uso real: o draft deixa de ser A-B-A-B; a staff avisa e bane da fila em vez de gerir disputas; o Discord separa “chamar gente” de “entrar na fila”; o rank oficial deixa de depender de o jogador ir sincronizar; quem espera no YouTube ouve a partida pela extensão; o telemóvel deixa de partir o fluxo de jogar.

## Goals

- Draft de jogadores na ordem **A, B, B, A, A, B, B, A** (oito escolhas depois dos dois capitães).
- Staff consegue **avisar** e **banir da fila** um jogador, com texto livre e duração do ban à escolha; o jogador vê Discord na hora e popup no site (na visita seguinte se não estiver online).
- Painel de staff mais curto: **sem Disputas**; cartão **Jogadores** com o total de contas no site; **denúncias e sugestões no mesmo sítio**; **teste da API em Resultados**.
- Canal Discord `1561038822274367599` só da fila (contagem, entrar, abrir o site). Canal antigo de ping **continua**, só com chamar.
- Categoria e canais de partida: `✦ RG-1101`, `💬╺╸RG-1101`, `🔊╺╸Team A`, `🔊╺╸Team B`.
- Extensão de browser com a roda da fila e entrar/sair; se estiver instalada, **o som de partida encontrada toca na extensão, não no site**; ao achar partida: som, a extensão abre, botão Confirmar vai a `/jogar`.
- Sempre que a API fecha um jogo, **atualiza o rank oficial de cada jogador humano** no site, mesmo que tenha descido.
- Percurso de jogar no telemóvel usável (layout, toque, overflow), verificado no browser.

## Non-goals

- Não remover o estado `DISPUTE` do motor de partidas (a API ainda pode falhar); só some da navegação de staff. Se existir alguma partida nessa situação, aparece em Resultados.
- Não mudar o algoritmo de pontos Rangify, o cooldown de 5 minutos por recusar ready-check, nem o bloqueio de 15 minutos do código.
- Não criar um sistema de “três warnings = ban automático”.
- Não publicar a extensão na Chrome Web Store neste trabalho; fica no repositório para carregar unpacked.
- Não fazer app nativa; a extensão é Chromium (Chrome / Edge / Brave).
- Não sincronizar ranks em background fora do fecho de uma partida pela API e do botão já existente no perfil.

## Anti-goals

- Ban da fila que apague a conta, os pontos ou o histórico.
- Som a tocar **duas vezes** (site e extensão) quando a extensão está presente.
- Botão Discord “Entrar na fila” que só abre o site e deixa a pessoa a ter de clicar outra vez em Entrar.
- Forçar o jogador a sincronizar no perfil para o rank descer depois de um reset de ato.

## Constraints

- Stack actual: React + Vite, Supabase (Postgres, RPC, Edge Functions), Discord bot via Edge Functions, Henrik Dev API (`rankOficial` em `supabase/functions/_shared/comum.ts`).
- Textos do site em PT/EN via `l()` / `tx()`, como o resto do projecto.
- IDs Discord do canal de fila: **`1561038822274367599`**. Canal de ping continua o `CANAL_PING` já usado (`DISCORD_PING_CANAL` / default actual).
- Discord **não executa JavaScript** num botão de link. “Abrir o site e já entrar na fila” faz-se com um URL do Rangify que, com sessão, chama `entrar_fila` ao carregar `/jogar` (query explícita). Sem sessão: login e depois o mesmo join.
- `entrar_fila()` já recusa cooldown, partida activa, Riot ID em falta e Discord em falta. O ban da fila entra **nessa mesma porta**.
- Rank no perfil: `official_tier` / `official_rr`. Sync manual tem cache de 6 horas; o update pós-jogo **ignora essa cache**. Falha da Henrik num jogador **não** impede o fecho da partida.
- Som actual: `src/lib/som.ts` + `Confirmar.tsx`. A extensão reproduz o **mesmo acorde**; o site só silencia se a extensão confirmar que está viva.

## How (decided)

### Draft

`equipaDaEscolha(n)` em `src/lib/regras.ts` deixa de ser `n % 2`. Índice 0-based das escolhas (não conta os capitães já colocados):

`A, B, B, A, A, B, B, A`

Ajuda e qualquer texto que diga “A, B, A, B” no draft de jogadores actualiza-se. Bans de mapas **não** mudam.

### Warning e ban (staff)

No separador **Jogadores** (já é a lista de contas), cada jogador tem acções de staff (Mod+):

- **Aviso:** campo de texto obrigatório + enviar.
- **Ban da fila:** campo de texto obrigatório + duração. Durações à escolha: **1 hora, 24 horas, 7 dias, 30 dias, permanente**, e um campo de **horas livres** se nenhuma das pré-escolhas chegar. Ban **tira da fila imediatamente** e bloqueia `entrar_fila` até `queue_banned_until` (null = permanente, tratado como data muito à frente ou flag `queue_banned`).

Persistência ( Postgres ):

- Tabela de avisos (warning ou ban), com autor staff, alvo, mensagem, tipo, `lido_em` no site, `ban_ate`.
- Popup no site: o aviso **mais recente não lido**; o jogador tem de confirmar (botão) para marcar lido. Ban pendente mostra a mensagem e até quando não pode entrar na fila.
- Discord: DM do bot para o Discord da conta (o mesmo ID já usado para cargos da partida). Se a DM falhar (DMs fechadas), o aviso no site continua a valer; a staff não fica bloqueada.

Copy do popup e da DM inclui a mensagem escrita pela staff. Ban também diz a duração em linguagem humana.

Quem está banido: o botão Entrar da fila (site e extensão) mostra o estado de ban, não o de cooldown de 5 min, se os dois existirem o ban ganha.

### Painel de staff

- Cartões do topo: **Jogadores** (contagem de perfis humanos no site, não “online agora”), **À espera do resultado**, **Partidas ao vivo**, **Denúncias abertas**. Sem cartão Disputas.
- Separadores: Resultados (default), Ao vivo, **Inbox** (denúncias + sugestões, dois blocos ou um segmento interno), Mapas, Novidades, Jogadores, e para Owner/Dev: Discord, Loja. **API deixa o menu isolado** e o bloco `TesteApiStaff` + `RecarregarStaff` passa para a página Resultados, por baixo das partidas pendentes.
- Código e RPC de `resolverDisputa` podem ficar; UI da aba Disputas sai. Partidas `DISPUTE` listam-se em Resultados.

### Discord

**Canal de ping (antigo):** `mensagemPing` **sem** o embed da contagem da fila. Mantém o texto de chamar, o botão “Chamar para a fila”, e pode manter “Abrir o Rangify”. A mensagem de chamada (role ping) **deixa o botão “Entrar na fila”** — esse deixa de ser um atalho a `/jogar` sem join.

**Canal de fila `1561038822274367599`:** mensagem persistente (id em `config`, à semelhança de `discord_ping_message`):

- Texto/embed com **n/10 na fila** (mesma lógica `filaAtual`: região com mais gente, sem bots).
- Botão **Entrar na fila** → URL `${SITE}/jogar?fila=1` (link button). A página, se a sessão existir, chama `entrarFila()` uma vez (o query some da URL). Se já estiver na fila, só mostra a fila. Se estiver banido/castigo/sem Discord, mostra o mesmo erro que o botão do site.
- Botão **Abrir o site** → `${SITE}/jogar` **sem** auto-join.

`atualizarMensagemFila` passa a actualizar **este** canal, não o de ping. Publicar a mensagem da fila: Staff › Discord, ao lado da publicação do ping, ou na primeira actualização se ainda não houver id.

### Nomes Discord da partida

Em `supabase/functions/discord-partida/index.ts`, para o código `RG-1101`:

- Categoria: `✦ RG-1101` (o código da partida em maiúsculas, como hoje no cargo).
- Texto: `💬╺╸RG-1101`
- Voz: `🔊╺╸Team A` e `🔊╺╸Team B`

Cargos de equipa podem ficar como estão (`RG-1101 · Team A`).

### Extensão (`extensao/`)

Chrome Manifest V3.

- Popup: roda (mesmo significado visual que `AnelFila`) + contagem + botão Entrar/Sair com os mesmos bloqueios (Discord, cooldown, ban, partida activa, sem Riot ID).
- Sem sessão: CTA que abre `/entrar` no browser.
- Sessão: handshake com o site (content script no origin do Rangify) a copiar o JWT Supabase para `chrome.storage`; o service worker fala com o mesmo backend.
- Presença: a extensão envia os batimentos de fila que o site já envia, para a pessoa não ser kickada por ter só a extensão.
- Som: offscreen document (MV3) com o acorde de `som.ts`. Quando há READY_CHECK para o utilizador, o SW toca o som, abre uma janela da extensão (não só o popup de 1 clique) com **Confirmar** → `https://<site>/jogar`.
- Site: ao montar `Confirmar`, pergunta à extensão (content script / `externally_connectable`). Se responder ok, **não** chama `tocarPartidaEncontrada` no separador.

### Ranks pós-jogo

Em `processar-partida`, **depois** de `aplicar_resultado` com sucesso, para cada jogador humano com Riot ID, `rankOficial(região, nome, tag)` e update de `official_tier`, `official_rr`, `rank_synced_at`. Erros individuais: log, continua os outros. Não espera pelo botão do perfil. Recarregar partida (`recarregar-partida`) faz o mesmo se voltar a fechar dados oficiais.

### Telemóvel

Auditoria no viewport ~390×844 das rotas `/`, `/jogar` (fila, ready, draft, bans, código), sidebar, perfil, ranking, staff. Corrigir overflow horizontal, botões cortados, hover-only nos bans de mapa (hoje “para o rato num mapa”), tabelas que partem a página, menu a tapar conteúdo. Não é um redesign; é o mesmo visual a caber e a ser tocável.

## Builder calls (fechados no check)

- Ban **não** cancela uma partida a decorrer; só tira da fila e impede voltar a entrar.
- Staff tem **levantar ban** no mesmo cartão do jogador.
- Vários avisos não lidos: popup **um a um**, do mais antigo para o mais recente, cada um com confirmar.
- Depois do login, se a pessoa veio de `?fila=1`, o join corre na primeira visita a `/jogar` com sessão (o `state.de` do login guarda o query).
- Permanente = `queue_banned_until` nulo com flag `queue_banned`; duração finita só usa a data.

## Left to the builder

- Schema exacto (nomes de RPC, índices).
- Layout interno da Inbox (tabs vs página contínua).
- Pormenor visual da janela da extensão (tamanho, se reusa CSS do site ou um subset).
- Como agrupar os 10 pedidos Henrik de rank para não rebentar o rate limit (sequencial com pequeno atraso é aceitável).
- Lista concreta de CSS a mexer no telemóvel, depois de testar.

## Out of scope unless it blocks a goal

- App Firefox-only.
- Painel para o jogador ver histórico antigo de warnings (o popup do não-lido chega; a staff vê o histórico no cartão do jogador).
- Traduzir as mensagens Discord do canal de fila (hoje o ping já é PT).

## Notas de implementação (onde a construção se afastou do que estava decidido)

- **Extensão: sessão própria, sem copiar o JWT do site.** O desenho previa um handshake que copiava o token Supabase do site para a extensão. Dois sítios a renovar a mesma sessão deitam-na abaixo (o refresh token só serve uma vez, e o Supabase revoga a sessão ao detetar reutilização). A extensão entra por si (Discord via `chrome.identity` ou utilizador e palavra-passe pela função `entrar`) e só o service worker renova o token. O script de ponte no site só troca duas coisas: "a extensão está viva nesta conta?" e "a partida foi encontrada". Custo: juntar `https://<id>.chromiumapp.org/` às Redirect URLs do Supabase, uma vez (o `npm run extensao` mostra o URL; o ID é fixo por causa da `key` do manifesto).
- **Sinal de vida da fila**: com a extensão viva, fechar o separador do site já não tira ninguém da fila (o `pagehide` não chama `sair_fila`); é a extensão que dá o `fila_batimento`.
- **Botão da mensagem de chamada (canal de ping)**: em vez de sair, o "Entrar na fila" passa a apontar para `/jogar?fila=1`, por isso também entra na fila sozinho.
- **Ranks pós-jogo**: a atualização corre em segundo plano (`EdgeRuntime.waitUntil`, uns 20 s a 2,1 s por jogador) e um rank 0 devolvido pela API não apaga um rank que a pessoa já tinha. O `recarregar-partida` não a faz (o "Recarregar todas" da staff rebentava o limite de pedidos).
- **Publicar a mensagem da fila** é sempre pela Staff › Discord (sem publicação automática na primeira atualização), à semelhança do ping.
- **Disputas**: as partidas `DISPUTE` aparecem no topo de Staff › Resultados só quando existem; o cartão e o separador Disputas saíram.
