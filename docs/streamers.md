# Streamers, overlay do OBS, Twitch e convites

Tudo isto nasce **fechado**: só Owner e Dev veem a página **Divulgar** no menu e só eles usam a área, para testarem à vontade. Quando estiver tudo testado, abre-se a toda a gente em **Staff › Divulgação › Abrir a toda a gente** (segura o botão; pode voltar a fechar-se).

## O que há

| | O que faz |
|---|---|
| **Overlay do OBS** | Uma ligação por jogador (com uma chave secreta) que mostra o emblema do rank com a barra de RR, os pontos, o dia (quadrados de vitórias e derrotas, e os pontos), a fila (10 segmentos e o tempo) ou a partida (fase, mapa com a arte por trás e o cronómetro) e a última partida. Quando uma partida acaba com o overlay aberto, aparece durante 9 segundos uma faixa de **VITÓRIA** ou **DERROTA** com o resultado e os pontos. Atualiza sozinha de 5 em 5 segundos, com fundo transparente. Formato cartão ou barra, cor, tamanho e campos à escolha. Diz em que fila contam os pontos (**RANKED · #6** cheio ou **ABERTA · #31** só com contorno, com o lugar na tabela dessa fila) e na fila ou na partida lê-se também `NA FILA · RANKED`; o aviso de fim de partida leva a fila. Sem mais nada, mostra a fila em que a pessoa está ou em que jogou por último; com `?fila=aberta` ou `?fila=ranked` no link fica preso a uma (a página **Divulgar** tem o seletor **Fila**). |
| **Marca animada** | Um cartão para a tua live com três mensagens que se trocam de 2,4 em 2,4 segundos: o Rangify, o endereço do site e o bónus de convite (ou "5v5 com capitães"). São duas páginas para o OBS, com fundo transparente: `/marca` só com o endereço do site e `/overlay/<chave>/marca`, que mostra o **link de convite inteiro** e o bónus de 100 coins. Não são GIFs: correm à velocidade da própria live. O endereço nunca passa do cartão: a letra encolhe se for comprido. |
| **Twitch** | O jogador liga o canal. Quando está em direto, aparece **AO VIVO** com o botão da live ao lado do nome na tabela, no perfil e nas equipas da partida, e numa faixa "Em direto agora" na página Jogar. |
| **Convites** | Cada jogador tem um código e um link (`/?convite=CODIGO`). Quem se regista por ele e **joga a primeira partida a sério** dá coins aos dois. |

## Pôr no ar (uma vez)

1. **Base de dados.** No SQL Editor, corre `supabase/migrations/0029_streamers_convites.sql`.
2. **Twitch.** Em <https://dev.twitch.tv/console/apps> escolhe **Register Your Application**:
   - *OAuth Redirect URLs*: `https://<o-teu-projeto>.supabase.co/functions/v1/twitch-ligar`
   - *Category*: Website Integration · *Client Type*: Confidential.
   - Copia o **Client ID** e gera o **Client Secret**.
3. **Segredos e funções.** No terminal, na pasta do projeto:
   ```
   npx supabase secrets set TWITCH_CLIENT_ID=... TWITCH_CLIENT_SECRET=...
   npx supabase functions deploy twitch-ligar twitch-sincronizar --no-verify-jwt
   ```
   O `SITE_URL` e o `DISCORD_SEGREDO` já existem (são os mesmos do Discord). A sincronização das lives corre a cada minuto por `pg_cron` e usa o endereço e o segredo guardados em `discord_config`, por isso o Discord tem de estar configurado (ver `discord.md`).
4. **Site.** Faz deploy do site no Render (a rota `/divulgar` e o overlay vão no build).

Sem os passos 2 e 3, o botão "Ligar a Twitch" responde "A Twitch ainda não está configurada" e o resto funciona na mesma.

## No OBS

1. Em **Divulgar**, escolhe o formato, a cor e o que mostrar e carrega em **Copiar**.
2. No OBS: **Fontes › + › Navegador**, cola o link em **URL** e põe a largura e a altura que a página indica. O fundo já é transparente.
3. O tamanho que a página indica (por exemplo 360 × 370 para o cartão) já leva uma folga por cima para o aviso de fim de partida; se desligares "Aviso de fim de partida", é menor. A chave na ligação é só tua. Se alguém a vir, carrega em **Renovar a chave** (a antiga deixa de funcionar) e atualiza o link no OBS.
4. A marca: outra fonte **Navegador**, com um dos dois links da marca (460 de largura por 140 de altura): o do endereço do site ou o que leva o teu link de convite.

O overlay mostra o **mapa e o cronómetro** da partida em curso, mas não o placar ronda a ronda: o Rangify só recebe os dados da partida quando ela acaba (a Riot não os dá em direto). O resultado aparece no fim.

## Convites

- O convidado tem de criar a conta pelo link, não ter jogado nenhuma partida e usar o código nos primeiros 7 dias da conta.
- A recompensa paga-se quando ele **acaba a primeira partida a sério** (nem simulada, nem automática): quem convida ganha **150 coins** e o convidado **100**. A cada 5 convidados pagos há **+300** de bónus. O limite são **20 convites pagos por mês** por jogador.
- O Riot ID é único por conta, por isso não se repete a recompensa com a mesma pessoa.
- Os números estão em `_convite_valores()` (migração 0029) e em `src/lib/convites.ts`: se mudares um, muda o outro.
- A loja foi retirada: as coins dos convites ficam guardadas na conta, sem onde gastar por agora.
- Na Staff › Divulgação vês quantos foram convidados e pagos, as coins dadas e quem mais convida.

## O endereço do site na marca

A marca usa sempre o endereço do próprio site, por isso não precisas de mexer em nada se ele mudar. Para mostrar outro endereço (por exemplo um domínio próprio), junta `?host=o-teu-endereco.com` ao link da marca.
