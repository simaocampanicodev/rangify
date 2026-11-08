# Estado do site

Uma página na área de Staff (**Staff > Estado**, só Owner e Dev) que diz quando o site está lento, sobrecarregado ou em baixo e **porquê**. Foi pensada ao jeito do [Uptime Kuma](https://github.com/louislam/uptime-kuma): verificações de minuto a minuto, uma barra de batimentos por serviço, confirmação antes de dar o alarme e um histórico de incidentes. A diferença é que o Rangify também lê o que a própria base de dados e o servidor sabem de si, que é o que explica uma sobrecarga.

## O que mostra

- **O estado agora**, numa frase: *Tudo a funcionar*, *O site está lento*, *O site está sobrecarregado* ou *O site está em baixo*.
- **Porquê**: um cartão por motivo, com o valor, os limites, uma explicação e uma pista do que fazer.
- **Leituras de agora**: CPU, memória e disco do servidor, ligações à base de dados, consultas a correr (e a mais longa), consultas à espera de bloqueios, fila e partidas, e o tempo de resposta até ao teu browser.
- **Verificações**: o site, a API e a base de dados, o login e as Edge Functions, cada um com a barra das últimas 60 verificações (verde, amarelo se lento, vermelho se falhou), o tempo de agora, a média de 24 horas e a disponibilidade de 24 horas e 7 dias.
- **Gráficos** de 1 hora, 24 horas, 7 dias ou 30 dias, com os picos de CPU e memória, de ligações e de tempo de resposta. As faixas coloridas mostram onde o site não estava bem.
- **Incidentes**: quando começou, quanto durou e quais foram os motivos (o pior valor de cada um).
- Um **ponto** ao lado de *Staff* no menu e do separador *Estado* quando o estado não é ok.
- Um **aviso no Discord** (opcional) quando o estado piora ou recupera.

## Os estados e os limites

Do melhor para o pior: `ok`, `lento`, `sobrecarga`, `em_baixo`. Cada motivo é "aviso" (lento) a partir de um valor e "crítico" (sobrecarga) a partir de outro. Os limites estão todos numa função SQL, `_saude_registar` (migração `0045`):

| Motivo | Aviso | Crítico | Quando acontece |
| --- | --- | --- | --- |
| CPU do servidor | 70% | 90% | Muita gente ao mesmo tempo ou uma consulta pesada |
| Memória | 85% | 95% | O servidor começa a usar o disco |
| Disco | 80% | 92% | A base de dados deixa de aceitar escritas |
| Carga por núcleo | 1 | 2 | Mais trabalho à espera do que o servidor faz |
| Pedidos à espera no pool da API | 1 | 5 | Sem ligações livres à base de dados |
| Ligações à base de dados | 60% | 85% | Do máximo do plano |
| Consulta mais longa | 5 s | 30 s | Pode estar a travar as outras |
| Consultas à espera de bloqueios | 3 | 10 | Uma consulta presa bloqueia as outras |
| Partidas paradas | 3 | 10 | Mais de 10 minutos nas fases de preparação, 3 horas em jogo |
| Pedidos da base de dados às funções que falham | 25% | 60% | Só conta com 8 ou mais pedidos nos últimos 15 minutos |
| Tarefas agendadas (cron) que falharam | 1 | 5 | Nos últimos 15 minutos |
| Tempo de resposta do site e das Edge Functions | 1,5 s | 4,5 s | |
| Tempo de resposta da API e do login | 0,8 s | 2,4 s | |
| Uma verificação falha (não responde, erro) | | | `em_baixo` |
| As verificações deixaram de chegar | | | `sobrecarga` (a função `saude-sondar` não responde) |

**Confirmar antes de avisar.** Como o Uptime Kuma com as tentativas, uma amostra má sozinha fica "a confirmar" e o estado não muda. Duas seguidas confirmam, abrem um incidente e (se houver canal) avisam no Discord. Para dar o incidente por fechado são precisas três amostras boas seguidas. O início do incidente é a primeira amostra má, não a que o confirmou.

## Pôr a funcionar

1. **Migração.** No SQL Editor, corre `supabase/migrations/0045_estado_do_site.sql` (depois da `0044`). Cria as tabelas, as funções e a tarefa de minuto a minuto `rangify-saude` (pg_cron). Pode correr outra vez sem estragar nada.
2. **Função.** Publica a Edge Function que faz as verificações. Tem de ser sem verificação de JWT, porque quem a chama é a base de dados com o segredo do Discord:
   ```bash
   npx supabase functions deploy saude-sondar --no-verify-jwt
   ```
   Usa o `SITE_URL` e o `DISCORD_SEGREDO` que já existem, e o `discord_config` (ver [discord.md](discord.md)), como a sincronização da Twitch.
3. **Aviso no Discord (opcional).** Cria um canal só para a staff, copia o ID dele e guarda-o:
   ```bash
   npx supabase secrets set DISCORD_CANAL_ESTADO=o_id_do_canal
   ```
   O bot tem de poder escrever nesse canal. Sem este segredo não há aviso no Discord; a página e o ponto no menu funcionam na mesma.
4. Abre **Staff > Estado**. Passado um minuto aparecem as primeiras verificações.

Enquanto a função não estiver publicada, a página avisa que as verificações ainda não começaram e mostra só o que a base de dados sabe de si (ligações, consultas, partidas), porque a tarefa de minuto a minuto regista essas amostras sozinha.

## De onde vem cada número

- **Sondas (a Edge Function `saude-sondar`):** pede a página inicial do site, faz uma consulta mínima à API, pede o estado do login e responde a um pedido de reconhecimento a outra Edge Function. Mede o tempo de cada uma. Nada disto chega a gastar a Henrik Dev API.
- **CPU, memória, disco e carga:** a **Metrics API** do Supabase (`/customer/v1/privileged/metrics`, com a chave secreta do projeto). A função lê os contadores e a base de dados calcula a CPU a partir da diferença entre duas leituras. Se a API não responder (por exemplo, `HTTP 401`), a página avisa e esses números ficam vazios; o resto continua.
- **Base de dados:** `pg_stat_activity` (só contagens, nunca o texto das consultas), `max_connections`, as partidas e a fila.
- **Cron e pedidos às funções:** `cron.job_run_details` e `net._http_response`, quando existem.

## O que não vê

- Uma avaria do Supabase inteiro: se a base de dados está em baixo, nada regista, e a página só mostra "o registo parou" quando voltar. Para isso serve um serviço externo (o próprio Uptime Kuma, num sítio à parte, a apontar para o site).
- O Realtime e o armazenamento de imagens, que não têm verificação própria.
- A API da Riot (Henrik Dev). O que se vê é o efeito: partidas paradas.
- A rede de cada jogador. O "tempo de resposta até ti" é só do teu browser.

## Retenção e custo

Uma amostra por minuto (guardada 30 dias), uma sonda por serviço por minuto (7 dias) e os incidentes (sem prazo). Fica abaixo de 30 MB no total (cerca de 11 MB de amostras e 5 MB de sondas, com os índices), já com a limpeza. A função conta duas invocações por minuto (a dela e o pedido de reconhecimento que faz à função `entrar`), cerca de 86 mil por mês.

## Referências

- [Uptime Kuma](https://github.com/louislam/uptime-kuma): os tipos de verificação, as tentativas antes de dar o alarme, a barra de batimentos e os incidentes que serviram de modelo.
- [A Metrics API do Supabase](https://supabase.com/docs/guides/telemetry/metrics): o endereço e a autenticação (beta, sem versão para instalações próprias).
- [supabase-grafana, metrics.md](https://github.com/supabase/supabase-grafana/blob/main/metrics.md): os nomes das métricas de CPU, memória, disco, carga e ligações.

## Ver todos os ecrãs sem servidor

No modo demo não há nada a medir, por isso o ecrã inventa os números e mostra em baixo uns botões (*Normal*, *Lento*, *Sobrecarga*, *Em baixo*) para ver cada cenário. Nunca aparecem no Supabase.

## Onde está o código

| Parte | Ficheiro |
| --- | --- |
| Tabelas, limites, estado confirmado, incidentes | `supabase/migrations/0045_estado_do_site.sql` |
| Verificações e aviso no Discord | `supabase/functions/saude-sondar/index.ts` |
| Leitura das métricas e texto do aviso | `supabase/functions/_shared/metricas.ts` |
| Textos de cada motivo (PT e EN) | `src/lib/saude.ts` |
| Ecrã | `src/components/staff/EstadoDoSite.tsx` e `GraficoSaude.tsx` |
| Demo | `src/lib/data/local-saude.ts` |
| Testes | `scripts/testes/testar-saude.mjs` e `testar-metricas.mjs` |

Para acrescentar um motivo novo: junta-o à lista em `_saude_registar` (migração nova, nunca a `0045` já aplicada), o texto em `src/lib/saude.ts` e a frase do Discord em `_shared/metricas.ts`. Um código que o site ainda não conhece aparece tal e qual, sem estragar nada.
