# Publicar o Rangify

Passo a passo para pôr o site no ar com contas a sério: Supabase (base de dados e login), Discord (botão de entrar), Henrik Dev API (rank oficial e estatísticas) e Render (o site). No fim, como guardar o projeto no GitHub sem expor segredos.

Ordem recomendada: **GitHub → Supabase → Discord → Henrik → Edge Functions → Render → URLs finais**.

---

## 0. O que é segredo e o que não é

| Valor | Onde fica | Pode ir para o GitHub? |
| --- | --- | --- |
| URL do projeto Supabase (`https://xxxx.supabase.co`) | `.env` local e Render | Não faz mal, mas fica no `.env` |
| Chave **publishable** (ou **anon**, nos projetos antigos) | `.env` local e Render | Vai parar ao browser de qualquer forma; a segurança está nas regras RLS da base de dados. Mesmo assim, fica no `.env` |
| Chave **secret** (ou **service_role**) | Só dentro do Supabase | **Nunca.** Contorna todas as regras |
| Client Secret do Discord | Só no painel do Supabase | **Nunca** |
| Chave da Henrik Dev API | Só nos segredos das Edge Functions | **Nunca** |
| Palavra-passe da base de dados | Gestor de palavras-passe | **Nunca** |

O site só precisa das duas primeiras. Tudo o resto vive no Supabase.

---

## 1. GitHub (primeiro, para o Render ir buscar o código)

1. Instala o Git (https://git-scm.com) e cria uma conta no GitHub.
2. Na pasta `rangify`, confirma que o `.gitignore` tem `.env` (já tem) e corre:
   ```bash
   git init
   git add .
   git status
   ```
3. **Lê a lista do `git status` antes de continuar.** Não pode aparecer `.env`, nem `node_modules`, nem `dist`. Se aparecer um `.env`, para e confirma o `.gitignore`.
4. Primeiro commit:
   ```bash
   git commit -m "Rangify: primeira versão"
   ```
5. No GitHub: **New repository**, nome `rangify`, de preferência **Private**, sem README (já tens um). Depois:
   ```bash
   git remote add origin https://github.com/<o-teu-utilizador>/rangify.git
   git branch -M main
   git push -u origin main
   ```
6. No repositório, em **Settings > Code security**, liga **Secret scanning** e **Push protection**. O GitHub passa a bloquear um push que leve uma chave por engano.

Se algum dia fizeres commit de um segredo: apagar o ficheiro não chega, porque fica no histórico. Gera uma chave nova no sítio de onde veio (Supabase, Discord ou Henrik) e só depois limpa o repositório.

---

## 2. Supabase

1. Em https://supabase.com, **New project**. Escolhe a região mais perto dos jogadores (por exemplo, Frankfurt ou Paris para a Europa) e guarda a palavra-passe da base de dados num gestor de palavras-passe.
2. Quando o projeto estiver pronto, abre **SQL Editor > New query**, cola o conteúdo de `supabase/migrations/0001_schema.sql` e carrega em **Run**.
3. Repete com `supabase/migrations/0002_perfil.sql` (cria o bucket das fotos de perfil, que só aceita PNG, JPG e WebP) depois com `0003_estatisticas.sql` (Trades, HS% e KAST, remover partidas e acertar pontos) depois com `0004_fila_amigos.sql` (testar a fila com amigos e bots), com `0005_perfil_estatisticas.sql` (estatísticas completas no perfil), com `0006_rotacao_testes.sql` (rotação de mapas editável na Staff e partidas de teste que contam), com `0007_experiencia.sql` (Rangify Experience: XP, níveis, missões diárias e rotação de missões), com `0008_novidades_api.sql` (novidades publicadas na Staff e afinações da Henrik Dev API), com `0009_situacao.sql` (fila e partida numa só chamada, para o site responder mais depressa), com `0010_sugestoes_staff.sql` (a staff muda o estado das sugestões e apaga-as) com `0011_discord.sql` (canais de Discord por partida; ver DISCORD.md) com `0012_rangify_score.sql` (Rangify Score nos pontos, agentes no perfil e Discord obrigatório para a fila) com `0013_recarregar_partida.sql` (recarregar na Staff os dados de uma partida já jogada e a tabela do Rangify Score) com `0014_tempo_real.sql` (pedidos de amizade em tempo real) com `0015_loja.sql` (loja de Rangify Coins, fechada ao público até a abrires em Staff › Loja) com `0016_discord_ping.sql` (botão "Chamar para a fila" no canal de ping; ver DISCORD.md) com `0017_lados_sugestoes.sql` (capitães ao calhas, escolha do lado, sugestões nos bans e resultados submetidos pela staff) com `0018_moedas_diarias.sql` (as missões diárias também dão coins) com `0019_pontos_sem_rank.sql` (os pontos deixam de depender do rank oficial) com `0020_margem_cancelar_fila.sql` (margem de rondas nos pontos, votação para cancelar a partida e a fila no Discord) com `0021_partidas_ao_vivo.sql` (Staff › Ao vivo: as partidas a decorrer e quem as joga) com `0022_historico_paginas.sql` (histórico de partidas de 10 em 10) com `0023_fila_presenca.sql` (fechar o separador tira a pessoa da fila) com `0024_capitaes_votam_vencedor.sql` (os capitães só votam na equipa vencedora e a API define o resultado) com `0025_ordem_draft.sql` (ordem das escolhas do draft A, B, B, A, A, B, B, A), com `0026_avisos_bans.sql` (a staff avisa e bane da fila, com mensagem e duração) com `0027_discord_canal_fila.sql` (a fila do Discord num canal só dela) com `0028_codigo_dois_capitaes_cancelar_7.sql` (os dois capitães partilham o código e são precisos 7 votos para cancelar) e por fim com `0029_streamers_convites.sql` (overlay do OBS, Twitch e convites, fechados até a staff abrir: ver `STREAMERS.md`). Para acertar os pontos das partidas já jogadas, recarrega-as em Staff › API › Recarregar todas.
4. Em **Project Settings > API Keys** (ou **Settings > API**), copia:
   - o **Project URL**;
   - a chave **publishable** (`sb_publishable_...`) ou, se o projeto mostrar as chaves antigas, a **anon public**.
5. Cria o ficheiro `.env` na pasta `rangify` (a partir do `.env.example`):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   Com estas duas linhas, `npm run dev` deixa o modo demo e passa a usar o Supabase.

---

## 3. Discord (o botão "Continuar com o Discord")

1. Em https://discord.com/developers/applications, **New Application**, nome `Rangify`, aceita os termos e **Create**.
2. No menu da esquerda, **OAuth2**.
3. Em **Redirects**, **Add Redirect** e cola:
   ```
   https://xxxx.supabase.co/auth/v1/callback
   ```
   (o `xxxx` é o do teu Project URL; o Supabase mostra este endereço já pronto no passo seguinte). **Save Changes**.
4. Ainda em **OAuth2**, na secção **Client information**:
   - **Client ID**: copia.
   - **Client Secret**: carrega em **Reset Secret** e copia logo (só aparece uma vez).
5. No Supabase: **Authentication > Sign In / Providers > Discord**, liga **Discord Enabled**, cola o Client ID e o Client Secret e **Save**.

---

## 4. Henrik Dev API (rank oficial e estatísticas)

1. Entra no Discord da HenrikDev (o link está em https://docs.henrikdev.xyz), verifica-te e, no canal **#get-a-key**, escolhe **VALORANT (Basic Key)**. A chave aparece logo (30 pedidos por minuto). Se o hub crescer, pede a **Advanced Key** (90 por minuto, com aprovação).
2. Guarda-a só como segredo das Edge Functions (passo seguinte). Nunca no `.env` do site: o que está no `.env` com `VITE_` vai para o browser.

---

## 5. Edge Functions (o código que fala com a Henrik e faz o login por utilizador)

Precisas do Supabase CLI. No Windows, a forma mais simples é usá-lo com `npx`:

```bash
npx supabase login
npx supabase link --project-ref xxxx
npx supabase secrets set HENRIK_API_KEY=a-tua-chave
npx supabase functions deploy sincronizar-rank
npx supabase functions deploy processar-partida
npx supabase functions deploy entrar
npx supabase functions deploy testar-api
npx supabase functions deploy discord-partida --no-verify-jwt
npx supabase functions deploy verificar-discord
npx supabase functions deploy recarregar-partida
npx supabase functions deploy puxar-call
npx supabase functions deploy discord-interacoes --no-verify-jwt
npx supabase functions deploy discord-ping
npx supabase functions deploy twitch-ligar twitch-sincronizar --no-verify-jwt
```

- `xxxx` é o mesmo do Project URL.
- As funções leem sozinhas o URL e as chaves do projeto; só a da Henrik é preciso pôr à mão.
- O `supabase/config.toml` já deixa a função `entrar` ser chamada sem sessão (é o login).

---

## 6. Render (o site)

1. Em https://render.com, entra com o GitHub.
2. **New > Blueprint**, escolhe o repositório `rangify`. O Render lê o `render.yaml` e cria o site estático (build `npm ci && npm run build`, pasta `dist`, e a regra que faz `/perfil/Nyx-4521` abrir a página certa).
3. Vai pedir as duas variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, com os mesmos valores do `.env`.
4. **Apply**. No fim tens um endereço como `https://rangify.onrender.com`.

(Alternativa sem Blueprint: **New > Static Site**, build command `npm ci && npm run build`, publish directory `dist`, as duas variáveis em **Environment**, e em **Redirects/Rewrites** uma regra `/*` → `/index.html` do tipo **Rewrite**.)

Sempre que fizeres `git push` para `main`, o Render volta a publicar sozinho.

---

## 7. Ligar tudo (URLs finais)

1. No Supabase, **Authentication > URL Configuration**:
   - **Site URL**: `https://rangify.onrender.com`
   - **Redirect URLs**: junta `https://rangify.onrender.com/**` e, para testares em casa, `http://localhost:5175/**`.
2. Abre o site, entra com o Discord, define a palavra-passe (opcional) e liga o teu Riot ID.
3. Torna-te Owner, no **SQL Editor**:
   ```sql
   update profiles set role = 'owner' where username = 'o_teu_utilizador_do_discord';
   ```
4. Recarrega o site: aparecem a área de Staff e as ferramentas de teste (simular fila cheia e simular partida).

Se tiveres um domínio próprio, junta-o no Render (**Settings > Custom Domains**) e repete o passo 1 com o domínio novo.

---

## Problemas comuns

- **O site continua em modo demo:** as variáveis `VITE_` só entram no build. No Render, depois de as mudares, faz **Manual Deploy > Clear build cache & deploy**.
- **O Discord volta para a página de entrar sem sessão:** falta o endereço do site nas **Redirect URLs** do Supabase.
- **"redirect_uri inválido" no Discord:** o redirect no Discord tem de ser exatamente `https://xxxx.supabase.co/auth/v1/callback`.
- **Ligar o Riot ID dá erro da API:** confirma o segredo `HENRIK_API_KEY` com `npx supabase secrets list` e se a função `sincronizar-rank` foi publicada.

## Loja de Rangify Coins

Depois de correr `0015_loja.sql`, a loja fica **fechada**: só Owner e Dev a veem no menu, e as decorações compradas só aparecem a Owner e Dev.

- **Testar** (em `/loja`, no painel "Modo de teste"): dar ou tirar coins de teste a ti próprio, sortear a loja de hoje outra vez, comprar qualquer item do catálogo completo (mesmo fora da loja de hoje) e devolver um item ou todos, com as coins de volta.
- **Abrir a toda a gente**: Staff › Loja › segura em "Abrir a loja a toda a gente". O mesmo sítio volta a fechá-la.
- **Coins** (migração `0018_moedas_diarias.sql`): 15 por missão diária, 40 por missão semanal, 120 por nível do Experience, mais 400 em cada 5.º nível, e 25 por MVP (as partidas automáticas não contam). São sempre calculadas, por isso descem se uma partida for removida.
- **Rotação**: muda à meia-noite de Lisboa. 8 diários (um de cada categoria), 2 semanais épicos (mudam à segunda) e 1 destaque lendário (de 3 em 3 dias). Um item que sai não volta durante 14 dias.
- **Mudar o catálogo**: edita `src/lib/loja.ts` (o desenho de cada item está em `src/cosmeticos.css`), corre `node scripts/gerar-loja-sql.mjs` e volta a correr a `0015_loja.sql` no SQL Editor.

## Extensão do browser

A extensão (Chrome, Edge e Brave) mostra a roda da fila e toca o aviso de partida mesmo com outro separador à frente. Para os jogadores a instalarem sem comandos, publica-a uma vez nas lojas: `npm run extensao -- https://o-teu-site --zip` e o passo a passo em [extensao/PUBLICAR.md](extensao/PUBLICAR.md). Depois, no Render, define `VITE_EXTENSAO_URL` com o link da loja: a página Jogar passa a convidar a instalá-la. Para a usares só tu, vê [extensao/LEIA-ME.md](extensao/LEIA-ME.md).
