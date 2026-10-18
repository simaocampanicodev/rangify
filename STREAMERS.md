# Streamers, overlay do OBS, Twitch e convites

Tudo isto nasce **fechado**: só Owner e Dev veem a página **Divulgar** no menu e só eles usam a área, para testarem à vontade. Quando estiver tudo testado, abre-se a toda a gente em **Staff › Divulgação › Abrir a toda a gente** (segura o botão; pode voltar a fechar-se).

## O que há

| | O que faz |
|---|---|
| **Overlay do OBS** | Uma ligação por jogador (com uma chave secreta) que mostra o emblema do rank com a barra de RR, os pontos, o dia (quadrados de vitórias e derrotas, e os pontos), a fila (10 segmentos e o tempo) ou a partida (fase, mapa com a arte por trás e o cronómetro) e a última partida. Quando uma partida acaba com o overlay aberto, aparece durante 9 segundos uma faixa de **VITÓRIA** ou **DERROTA** com o resultado e os pontos. Atualiza sozinha de 5 em 5 segundos, com fundo transparente. Formato cartão ou barra, cor, tamanho e campos à escolha. |
| **Marca animada** | Um cartão para um cantinho da live com três mensagens que se trocam de 2,4 em 2,4 segundos: o Rangify, o endereço do site e um convite (ou "5v5 com capitães"). O GIF `public/divulgar/rangify-canto.gif` (fundo transparente, ciclo de 7,2 s) e uma versão para o OBS (`/overlay/<chave>/marca`) que mostra o **link de convite inteiro** e o bónus de 100 coins. O endereço nunca passa do cartão: a letra encolhe se for comprido. |
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
   O `SITE_URL` e o `DISCORD_SEGREDO` já existem (são os mesmos do Discord). A sincronização das lives corre a cada minuto por `pg_cron` e usa o endereço e o segredo guardados em `discord_config`, por isso o Discord tem de estar configurado (ver `DISCORD.md`).
4. **Site.** Faz deploy do site no Render (a rota `/divulgar`, o overlay e o GIF vão no build).

Sem os passos 2 e 3, o botão "Ligar a Twitch" responde "A Twitch ainda não está configurada" e o resto funciona na mesma.

## No OBS

1. Em **Divulgar**, escolhe o formato, a cor e o que mostrar e carrega em **Copiar**.
2. No OBS: **Fontes › + › Navegador**, cola o link em **URL** e põe a largura e a altura que a página indica. O fundo já é transparente.
3. O tamanho que a página indica (por exemplo 360 × 370 para o cartão) já leva uma folga por cima para o aviso de fim de partida; se desligares "Aviso de fim de partida", é menor. A chave na ligação é só tua. Se alguém a vir, carrega em **Renovar a chave** (a antiga deixa de funcionar) e atualiza o link no OBS.
4. A marca: ou **Fontes › + › Imagem** com o GIF, ou outra fonte **Navegador** com o link da marca (essa leva o teu link de convite).

O overlay mostra o **mapa e o cronómetro** da partida em curso, mas não o placar ronda a ronda: o Rangify só recebe os dados da partida quando ela acaba (a Riot não os dá em direto). O resultado aparece no fim.

## Convites

- O convidado tem de criar a conta pelo link, não ter jogado nenhuma partida e usar o código nos primeiros 7 dias da conta.
- A recompensa paga-se quando ele **acaba a primeira partida a sério** (nem simulada, nem automática): quem convida ganha **150 coins** e o convidado **100**. A cada 5 convidados pagos há **+300** de bónus. O limite são **20 convites pagos por mês** por jogador.
- O Riot ID é único por conta, por isso não se repete a recompensa com a mesma pessoa.
- Os números estão em `_convite_valores()` (migração 0029) e em `src/lib/convites.ts`: se mudares um, muda o outro.
- Enquanto a loja não for pública, as coins ficam guardadas na conta e só se gastam quando ela abrir.
- Na Staff › Divulgação vês quantos foram convidados e pagos, as coins dadas e quem mais convida.

## Trocar o endereço do GIF

O GIF tem o endereço do site desenhado. Se o endereço mudar, gera-o outra vez (precisa do Playwright, do Python com o Pillow e do site a correr em `npm run dev`):

```
npm run gif-marca -- o-teu-endereco.com
```

A versão para o OBS (`/overlay/<chave>/marca`) usa sempre o endereço do próprio site, não precisa de nada.
