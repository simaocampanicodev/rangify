# Instalar e configurar

## Correr em local (modo demo)

```bash
npm install
npm run dev
```

Abre em http://localhost:5175. Precisas de Node 20.19 ou mais recente.

Sem variáveis de ambiente, o site arranca em **modo demo**:

- tudo fica no browser (`localStorage`);
- há 64 jogadores de exemplo e cerca de 120 partidas já jogadas;
- os outros 9 jogadores de cada partida são bots que aceitam, escolhem, banem e confirmam o resultado.

No modo demo:

- **Entrar como Nyx#4521** abre a conta de exemplo (Owner, com histórico).
- **Continuar com o Discord** cria uma conta nova, para veres o primeiro acesso e o guia de boas-vindas.
- **Definições > Modo demo** muda a função da conta, para testares o que cada uma vê, e repõe os dados.
- Em **Jogar**, as **Ferramentas de teste** (só Owner e Dev) têm **Simular fila cheia** e **Simular partida completa**. As partidas simuladas não mexem nos pontos reais.

## Variáveis de ambiente

Cria um ficheiro `.env` na raiz do projeto (nunca o metas no GitHub: já está no `.gitignore`).

| Variável | Para quê |
| --- | --- |
| `VITE_SUPABASE_URL` | O endereço do projeto Supabase (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | A chave **publishable** (ou **anon**, nos projetos antigos). Vai para o browser de qualquer forma: a segurança está nas regras RLS |
| `VITE_EXTENSAO_URL` | Opcional: o link da extensão do browser (Chrome Web Store ou Edge Add-ons). Com ele, a página Jogar convida a instalá-la |

```bash
# .env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

**Sem as duas primeiras variáveis o site abre em modo demo; com elas, usa o Supabase.**

Os segredos das Edge Functions (token do bot do Discord, chave da Henrik Dev API, Twitch...) **não** vão para o `.env`: guardam-se no Supabase com `supabase secrets set`. A lista está em [Segredos das Edge Functions](#segredos-das-edge-functions).

## Ligar ao Supabase

O guia completo, com o Discord, a Henrik Dev API, o Render e o GitHub, está em [deploy.md](deploy.md). Em resumo:

1. Cria um projeto no Supabase e corre **todas as migrações** de `supabase/migrations/` por ordem, no **SQL Editor** (índice em [migrations.md](migrations.md)).
2. Em **Authentication > Providers** ativa o **Discord**: cola o Client ID e o Secret da aplicação do Discord e, no Discord, põe o redirect `https://<projeto>.supabase.co/auth/v1/callback`. Em **Authentication > URL Configuration**, junta o URL do site às Redirect URLs.
3. Pede uma chave em https://docs.henrikdev.xyz e guarda-a como segredo das funções:
   ```bash
   supabase secrets set HENRIK_API_KEY=...
   ```
4. Publica as Edge Functions:
   ```bash
   supabase functions deploy sincronizar-rank processar-partida entrar testar-api verificar-discord recarregar-partida discord-ping discord-anuncio puxar-call
   supabase functions deploy discord-partida discord-interacoes --no-verify-jwt   # canais de Discord, ver discord.md
   supabase functions deploy twitch-ligar twitch-sincronizar --no-verify-jwt       # Twitch ligada ao perfil, ver streamers.md
   supabase functions deploy processar-torneio --no-verify-jwt                      # resultados dos torneios, ver tournaments.md
   ```
5. Cria o `.env` com as duas variáveis `VITE_`.
6. Entra uma vez com o Discord e torna-te Owner:
   ```sql
   update profiles set role = 'owner' where username = 'o_teu_utilizador';
   ```

No Render, o `render.yaml` cria o site estático. As duas variáveis `VITE_` pedem-se ao criar o serviço.

## Segredos das Edge Functions

Definem-se com `supabase secrets set NOME=valor` (ou no painel, em **Edge Functions > Secrets**).

| Segredo | Para quê |
| --- | --- |
| `HENRIK_API_KEY` | A chave da Henrik Dev API (rank oficial e estatísticas) |
| `DISCORD_BOT_TOKEN` | O token do bot do Discord. **Nunca** vai para o código nem para o GitHub |
| `DISCORD_GUILD_ID` | O ID do servidor de Discord |
| `DISCORD_SEGREDO` | Um segredo comprido que a base de dados manda ao chamar `discord-partida` (o mesmo que fica em `discord_config`) |
| `DISCORD_PUBLIC_KEY` | A Public Key da aplicação do Discord, para validar os cliques nos botões |
| `SITE_URL` | O endereço do site (para os links dos botões do bot) |
| `TWITCH_CLIENT_ID` · `TWITCH_CLIENT_SECRET` | A aplicação da Twitch (Twitch ligada ao perfil) |

Opcionais, para trocar sem mexer no código: `DISCORD_PING_CANAL`, `DISCORD_PING_CARGO`, `DISCORD_FILA_CANAL`, `DISCORD_FILA_RANKED_CANAL`, `DISCORD_CARGO_RANKED`, `DISCORD_CARGO_MEMBER` e `DISCORD_ANUNCIOS_CANAL`. O que cada um faz está em [discord.md](discord.md).

## Testes

```bash
npm run build
npm run testar-sql
```

Ver [architecture.md](architecture.md#testes).
