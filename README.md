# Rangify

Hub competitivo de Valorant 5v5: fila por região, confirmação, draft de capitães, ban de mapas, código do grupo, resultado confirmado pela Henrik Dev API e um ranking próprio.

**O ranking:** toda a gente começa a temporada com 1000 pontos e a tabela é ordenada por esses pontos. O rank oficial da Riot nunca ordena nada. Só serve para escolher os capitães e para comparar o teu rank com a média oficial da equipa adversária:

- vitória +20, derrota -20;
- cada divisão de diferença vale 3 pontos, entre -8 e +10;
- exemplo: és Diamante 2 e o adversário tem média Ascendente 1, duas divisões acima. Ganhar dá +26 e perder tira 14.

Rangify é um projeto independente e não é desenvolvido nem apoiado pela Riot Games.

## Correr em local

```bash
npm install
npm run dev
```

Abre em http://localhost:5175. Sem variáveis de ambiente, o site arranca em **modo demo**:

- tudo fica no browser (localStorage);
- há 64 jogadores de exemplo e cerca de 120 partidas já jogadas;
- os outros 9 jogadores de cada partida são bots que aceitam, escolhem, banem e confirmam o resultado.

No modo demo:

- **"Entrar como Nyx#4521"** abre a conta de exemplo (Owner, com histórico).
- **"Continuar com o Discord"** cria uma conta nova, para veres o primeiro acesso e o guia de boas-vindas.
- **Definições > Modo demo** muda a função da conta, para testar o que cada uma vê, e repõe os dados.

## Ligar ao Supabase

O guia completo, com o Discord, a Henrik Dev API, o Render e o GitHub, está em [DEPLOY.md](DEPLOY.md). Em resumo:


1. Cria um projeto no Supabase e corre `supabase/migrations/0001_schema.sql` e depois `0002_perfil.sql` no SQL Editor (ou `supabase db push`).
2. Em **Authentication > Providers** ativa o **Discord**:
   - cola o Client ID e o Secret da aplicação do Discord;
   - no Discord, o redirect é `https://<projeto>.supabase.co/auth/v1/callback`;
   - em **Authentication > URL Configuration**, junta o URL do site (por exemplo, o do Render) às Redirect URLs.
3. Pede uma chave em https://docs.henrikdev.xyz e guarda-a como segredo das funções:
   ```bash
   supabase secrets set HENRIK_API_KEY=...
   ```
4. Publica as Edge Functions:
   ```bash
   supabase functions deploy sincronizar-rank processar-partida entrar
   ```
5. Cria o `.env` a partir do `.env.example` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
6. Entra uma vez com o Discord e torna-te Owner:
   ```sql
   update profiles set role = 'owner' where username = 'o_teu_utilizador';
   ```

No Render, o `render.yaml` cria o site estático. As duas variáveis `VITE_` pedem-se ao criar o serviço.

## Como está organizado

- `src/lib/dados/`: a interface `Dados`, com duas implementações.
  - `local.ts`: o modo demo, com o motor da partida no browser.
  - `supabase.ts`: chama os RPCs, que devolvem o JSON já com os nomes do site.
- `src/lib/{pontos,ranks,regras,mapas}.ts`: a fórmula dos pontos, os ranks, as regras do resultado e a pool de mapas.
- `src/components/partida/`: as fases da partida (confirmação, draft, mapas, código e resultado).
- `src/components/Tour.tsx`: o guia de boas-vindas para contas novas, que se pode rever nas Definições.
- `src/components/Ajuda.tsx`: os "Como funciona" de cada secção (fila, draft, mapas, código, resultado, ranking, rank oficial, missões, amigos, sugestões e funções).
- `src/components/FerramentasDev.tsx`: "Simular fila cheia" e "Simular partida completa", visíveis só para Owner e Dev. As partidas simuladas não mexem nos pontos reais.
- `supabase/migrations/0001_schema.sql`: tabelas, RLS e a máquina de estados.
  - Os clientes só leem; tudo o que muda dados passa por RPCs `security definer`.
  - O código do grupo só é visível aos 10 jogadores da partida.
- `supabase/functions/`: as Edge Functions.
  - `sincronizar-rank`: liga o Riot ID e lê o rank oficial, no máximo de 6 em 6 horas.
  - `processar-partida`: procura a partida personalizada na Henrik Dev API e tira KDA, ACS e first bloods.
  - `entrar`: login por utilizador e palavra-passe, sem expor emails.

### A máquina de estados

1. `READY_CHECK`: 20 s para aceitar. Quem recusa fica 5 min de castigo e os outros voltam à fila com o mesmo lugar.
2. `DRAFT_PHASE`: os dois ranks oficiais mais altos são capitães. Escolhem à vez (A, B, A, B), 30 s por escolha.
3. `MAP_BAN`: os 13 mapas do Valorant; 12 bans alternados de 20 s e o mapa que sobra é o da partida.
4. `LOBBY_CREATION`: o Capitão A partilha o código do grupo (6 letras ou números).
5. `IN_PROGRESS`: bloqueio de 15 minutos antes de se poder submeter o resultado.
6. `RESULT_SUBMISSION`: os dois capitães submetem. Se baterem certo, a partida segue para processamento; se não, vai para disputa.
7. `PROCESSING_API`: a Edge Function confirma com a Henrik Dev API e fecha a partida. Sem resposta em 15 min, fecha sem estatísticas.
8. `COMPLETED`, `DISPUTE` (a staff decide) ou `CANCELLED`.

Os prazos e as jogadas dos bots avançam em `avancar_partida`, que o site chama a cada segundo enquanto há uma partida a decorrer.

## Testes

```bash
npm run build
npm run testar-sql
```

`testar-sql` aplica a migração num Postgres local (PGlite) e joga partidas inteiras pelos RPCs. Cobre:

- a fila, a confirmação, o draft, os bans, o código, o bloqueio e o resultado;
- os pontos, comparados com a fórmula do site;
- as disputas e as simulações;
- a segurança: RLS, funções internas e o código do grupo.
