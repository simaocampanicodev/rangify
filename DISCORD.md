# Canais de Discord por partida

Quando as equipas de uma partida ficam fechadas (a partida entra nos bans de mapas), o Rangify cria no servidor de Discord:

- **3 cargos**: `RG-1234`, `RG-1234 · Team A` e `RG-1234 · Team B`, dados aos jogadores da partida;
- **uma categoria `RG-1234`** com:
  - `「💬」rg-1234`, um chat que só os 10 jogadores veem;
  - `「🔊」Team A` e `「🔊」Team B`, duas calls: toda a partida as vê, mas só a própria equipa entra em cada uma.

Quando a partida termina, é cancelada ou removida, o Rangify apaga os canais e os cargos (apagar um cargo tira-o a toda a gente). No site, durante a partida, aparecem os botões **Chat da partida** e **Call da equipa** na barra das fases.

Não há nenhum bot a correr 24 horas: a base de dados chama a Edge Function `discord-partida`, que usa o token do bot para falar com a API do Discord. As simulações automáticas ("Simular partida completa") não criam canais.

---

## Passo a passo

### 1. Criar a aplicação e o bot

1. Abre o [Discord Developer Portal](https://discord.com/developers/applications) e carrega em **New Application**. Dá-lhe o nome `Rangify`.
2. Em **Bot**, carrega em **Reset Token** e copia o token. Guarda-o num sítio seguro: é a palavra-passe do bot. **Nunca o metas no código nem no GitHub.**
3. Em **Installation**, muda **Install Link** para **None** e guarda (em **Installation Contexts** podes deixar só **Guild Install**). Sem isto, o passo seguinte dá o erro "Aplicativos privados não podem ter um link de autorização padrão".
4. Volta a **Bot** e desliga **Public Bot** (assim só tu o podes adicionar a servidores). É opcional: mesmo público, o bot só mexe no servidor de `DISCORD_GUILD_ID`.
5. Em **General Information**, copia o **Application ID**.

### 2. Adicionar o bot ao servidor

Abre este link no browser, trocando `APPLICATION_ID` pelo ID do passo anterior:

```
https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&scope=bot&permissions=288427024
```

Escolhe o servidor do Rangify e autoriza. As permissões pedidas são só as necessárias: **Gerir cargos**, **Gerir canais**, **Ver canais**, **Enviar mensagens**, **Ler o histórico**, **Ligar**, **Falar** e **Mover membros**.

Se o bot já estava no servidor, não é preciso convidá-lo outra vez: em **Definições do servidor › Cargos › Rangify**, liga **Mover membros**.

Depois, em **Definições do servidor › Cargos**, confirma que o cargo do bot (`Rangify`) está **acima** dos cargos normais dos membros. Os cargos das partidas são criados por baixo do cargo do bot, por isso ele consegue dá-los e apagá-los.

### 3. Copiar o ID do servidor

1. No Discord: **Definições de utilizador › Avançado › Modo de programador** (liga).
2. Clica com o botão direito no nome do servidor e escolhe **Copiar ID do servidor**.

### 4. Correr a migração

No Supabase, em **SQL Editor**, corre `supabase/migrations/0011_discord.sql`.

### 5. Guardar os segredos da Edge Function

Inventa um segredo comprido (por exemplo, gera um com `openssl rand -hex 32` ou escreve 40 letras e números ao acaso). Depois, na pasta do projeto:

```bash
npx supabase secrets set DISCORD_BOT_TOKEN=o_token_do_bot DISCORD_GUILD_ID=o_id_do_servidor DISCORD_SEGREDO=o_teu_segredo SITE_URL=https://o-teu-site.onrender.com
```

(Também podes pô-los no Supabase em **Edge Functions › Secrets**.)

### 6. Publicar a Edge Function

```bash
npx supabase functions deploy discord-partida --no-verify-jwt
```

O `--no-verify-jwt` é preciso porque quem chama a função é a base de dados, não um utilizador com sessão. A função recusa qualquer pedido que não traga o segredo do passo 5.

### 7. Ligar a base de dados à função

No **SQL Editor**, com o **mesmo segredo** do passo 5:

```sql
insert into public.discord_config (url, segredo)
values ('https://ftswhbbazdzvwedpqqam.supabase.co/functions/v1/discord-partida', 'o_teu_segredo')
on conflict (id) do update set url = excluded.url, segredo = excluded.segredo;
```

Para desligar os canais de Discord a qualquer momento: `delete from public.discord_config;`

### 8. Testar

1. Entra no site com a tua conta (Owner) e confirma que estás no servidor de Discord.
2. Em **Jogar › Ferramentas de teste**, marca **Ser o Capitão A** e carrega em **Simular fila cheia**. Aceita a partida e faz o draft.
3. Quando a partida chegar aos **bans de mapas**, em poucos segundos aparece no Discord a categoria `RG-…` com o chat e as duas calls, e recebes os cargos `RG-…` e `RG-… · Team A`. No site aparecem os botões **Chat da partida** e **Call da equipa**.
4. Acaba a partida (ou cancela-a na Staff, ou remove-a): a categoria, os canais e os cargos desaparecem.

---

## Discord obrigatório para a fila

Com isto ligado, só entra na fila quem estiver no servidor de Discord do Rangify (com a conta de Discord com que entrou no site). Quem não estiver vê os botões **Entrar no Discord** e **Já entrei** no lugar do botão da fila.

1. Corre `supabase/migrations/0012_rangify_score.sql` no **SQL Editor**.
2. Publica a função que pergunta ao bot (usa os mesmos segredos `DISCORD_BOT_TOKEN` e `DISCORD_GUILD_ID` do passo 5):

   ```bash
   npx supabase functions deploy verificar-discord
   ```

3. No Discord, cria um convite que não expire: botão direito no canal de entrada › **Convidar pessoas** › **Editar link de convite** › **Expira depois de: Nunca**. Copia o link `https://discord.gg/...`.
4. No site, em **Staff › Discord**, cola o convite, escolhe **Obrigatório** e carrega em **Guardar**. Depois carrega em **Verificar a minha conta** para confirmar que o bot te encontra.

Como funciona: ao abrir o Painel ou o Jogar, o site pede à função `verificar-discord` que confirme com o bot (`GET /guilds/{servidor}/members/{id}`). A resposta fica no perfil durante 30 minutos e a base de dados recusa `entrar_fila` sem uma confirmação recente. Os jogadores não conseguem marcar-se a si próprios como membros. Não é preciso ligar nenhuma intenção privilegiada no portal do Discord para isto.

### Entrar na call sem cliques

O Discord não deixa nenhum site (nem bot) ligar alguém a uma call do zero: a pessoa tem de já estar ligada a uma call. Por isso:

- Quando as equipas fecham, o bot muda logo para a call da equipa quem já estiver numa call do servidor. Vale a pena ter um canal de voz **Sala de espera** para a fila.
- No site, o botão **Call da equipa** pede o mesmo ao bot (função `puxar-call`). Se a pessoa não estiver em nenhuma call, abre a aplicação no canal e falta um clique em **Entrar na voz**.

```bash
npx supabase functions deploy puxar-call
npx supabase functions deploy discord-partida --no-verify-jwt
```

O link `discord://` abre a versão do Discord que o Windows tem associada (a última instalada: normal, PTB ou Canary). Se abrir a PTB e quiseres a normal, desinstala a PTB ou reinstala o Discord normal.

---

## Se não aparecer nada

- **Logs da função**: Supabase › **Edge Functions › discord-partida › Logs**. Os erros do Discord aparecem lá com o código (por exemplo `403 Missing Permissions`).
- **O pedido da base de dados**: no SQL Editor, `select status_code, content, created from net._http_response order by created desc limit 5;` mostra as últimas respostas da função.
- **401 Sem autorização**: o segredo em `discord_config` não é igual ao `DISCORD_SEGREDO`.
- **403 Missing Permissions**: falta uma permissão ao bot, ou o cargo do bot está abaixo de algum cargo que ele tem de gerir.
- **Um jogador não recebeu o cargo**: só recebe quem está no servidor de Discord. A primeira mensagem do chat da partida diz quem ficou de fora.

## O banner

Em `discord/` estão:

- `rangify-banner.png` (1920x1080): o logótipo, a frase e o fundo do site;
- `rangify-banner-fundo.png` (1920x1080): só o fundo, para usares por trás de texto (por exemplo, como fundo do cartão de boas-vindas de um bot como o MEE6 ou o Carl-bot);
- `banner.html`: a fonte, para mudares o texto e voltares a gerar a imagem.

Onde o usar: o **banner do servidor** (Definições do servidor › Perfil do servidor) precisa do nível 2 de boosts. Sem isso, publica `rangify-banner.png` como imagem na mensagem de boas-vindas do `「🚪」door`, ou usa `rangify-banner-fundo.png` como fundo do cartão de boas-vindas do teu bot.
