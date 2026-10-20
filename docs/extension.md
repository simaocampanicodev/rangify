# Extensão do Rangify (Chrome, Edge e Brave)

A roda da fila no teu browser, com o botão de entrar e sair, e o aviso de partida encontrada a tocar **na extensão** (por isso ouves-o mesmo com o YouTube à frente).

- **Popup**: a roda com os jogadores na fila, **Entrar na fila** / **Sair da fila** com os mesmos bloqueios do site (ban, castigo, partida a decorrer, Riot ID em falta e Discord obrigatório) e o som.
- **Partida encontrada**: toca o som, mostra uma notificação e abre uma janela com a contagem de 20 s e o botão **Abrir o Rangify e aceitar** (leva-te a `/jogar`, onde se aceita).
- **Sem som duplicado**: com a extensão instalada e com sessão na mesma conta, o site cala-se. Se a extensão não estiver viva (ou for outra conta), o site toca como sempre.
- **Fechar o site não te tira da fila** se a extensão estiver viva: é ela que dá o sinal de vida da fila. Para sair, usa o popup (ou o site).

## Para toda a gente: publicar uma vez

Quem joga no Rangify **não** corre comandos. A extensão publica-se uma vez na Chrome Web Store (e no Edge Add-ons) e os jogadores carregam em **Adicionar**; as atualizações chegam sozinhas. O endereço do Supabase e do site vão dentro do pacote. Passo a passo, textos da ficha e política de privacidade em [extension-publishing.md](extension-publishing.md):

```bash
npm install
npm run extension -- https://o-teu-site.onrender.com --zip   # gera extension/rangify-extensao-<versão>.zip
```

## Para ti (testar, ou enquanto não está publicada)

Precisas do Supabase ligado (o modo demo vive só no browser do site).

```bash
npm run extension -- https://o-teu-site.onrender.com   # ou --dev para o site em http://localhost:5175
```

O comando lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do `.env`, junta o supabase-js ao service worker, escreve a configuração e as permissões em `extension/dist` e mostra o que falta. Corre-o outra vez depois de cada `git pull` (a pasta `dist` é gerada, não vem no repositório).

1. Abre `chrome://extensions` (ou `edge://extensions`), liga o **Modo de programador** e carrega a pasta `extension/dist` em **Carregar sem compactação**.
2. No Supabase, em **Authentication > URL Configuration > Redirect URLs**, junta (uma vez) os endereços que o comando mostra, `https://<id>.chromiumapp.org/` e `https://<id>.chromiumapp.org/**`. É para o **Entrar com o Discord** da extensão.
3. Fixa a extensão na barra do browser (o ícone do puzzle) e abre o popup.

## Como entra na tua conta

A extensão tem **a sua própria sessão**: **Entrar com o Discord** (numa janela do browser) ou utilizador e palavra-passe do Rangify. Não copia a sessão do site: dois sítios a renovar a mesma sessão deitavam-na abaixo. O site só fala com a extensão por duas coisas (no `content/ponte.js`): "estás viva nesta conta?" e "a partida foi encontrada". Nenhum token nem dado da conta passa por aí.

## Como funciona por dentro (e porque não "lagga")

A extensão **não pergunta de segundo a segundo**. Fica à espera de avisos do servidor, como o site:

- **Fora da fila**: nenhuma ligação; só pergunta uma vez por minuto (um alarme) e quando abres o popup. Quando entras ou sais da fila no site, o site avisa-a logo.
- **Na fila** (ou com um ready check por responder): abre uma ligação **Realtime** ao Supabase. Quando alguém entra ou sai da fila, atualiza só a contagem (uma chamada pequena; vários avisos seguidos juntam-se numa). Quando a tua partida é encontrada, atualiza tudo e mostra o aviso. Por reserva, confirma de 20 em 20 s (de 5 em 5 s se o Realtime não ligar). Quando sais da fila e do ready check, a ligação fecha.
- O storage só é escrito quando algo mudou, e o popup e a janela de alerta só mexem no que mudou (a roda e as animações não reiniciam).

Ficheiros:

- `service-worker.js`: o motor (estado, sinal de vida da fila `fila_batimento`, partida encontrada).
- `lib/tempo-real.js`: o canal Realtime (`queue_entries`, `match_players` da tua conta e `matches` da partida a decidir-se), empacotado com o supabase-js.
- `offscreen/`: documento escondido que toca o acorde (um service worker não toca som), o mesmo de `src/lib/som.ts`.
- `popup/` e `alerta/`: as duas vistas. Só leem o que o service worker guardou e mandam-lhe pedidos.

## Limites

- Só Chromium (Chrome, Edge, Brave). Não está na Chrome Web Store: carrega-se da pasta.
- Se o browser estiver fechado, a extensão não corre: sem sinal de vida, o servidor tira-te da fila ao fim de 3 minutos.
