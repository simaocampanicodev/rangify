# Extensão do Rangify (Chrome, Edge e Brave)

A roda da fila no teu browser, com o botão de entrar e sair, e o aviso de partida encontrada a tocar **na extensão** (por isso ouves-o mesmo com o YouTube à frente).

- **Popup**: a roda com os jogadores na fila, **Entrar na fila** / **Sair da fila** com os mesmos bloqueios do site (ban, castigo, partida a decorrer, Riot ID em falta e Discord obrigatório) e o som.
- **Partida encontrada**: toca o som, mostra uma notificação e abre uma janela com a contagem de 20 s e o botão **Abrir o Rangify e aceitar** (leva-te a `/jogar`, onde se aceita).
- **Sem som duplicado**: com a extensão instalada e com sessão na mesma conta, o site cala-se. Se a extensão não estiver viva (ou for outra conta), o site toca como sempre.
- **Fechar o site não te tira da fila** se a extensão estiver viva: é ela que dá o sinal de vida da fila. Para sair, usa o popup (ou o site).

## Instalar

Precisas do Supabase ligado (o modo demo vive só no browser do site).

```bash
npm run extensao -- https://o-teu-site.onrender.com   # ou --dev para o site em http://localhost:5175
```

O comando lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do `.env`, escreve a configuração e as permissões em `extensao/dist` e mostra o que falta.

1. Abre `chrome://extensions` (ou `edge://extensions`), liga o **Modo de programador** e carrega a pasta `extensao/dist` em **Carregar sem compactação**.
2. No Supabase, em **Authentication > URL Configuration > Redirect URLs**, junta (uma vez) os dois endereços que o comando mostra, `https://<id>.chromiumapp.org/` e `https://<id>.chromiumapp.org/**`. O `<id>` é sempre o mesmo, porque o manifesto leva uma chave. É para o **Entrar com o Discord** da extensão.
3. Fixa a extensão na barra do browser (o ícone do puzzle) e abre o popup.

## Como entra na tua conta

A extensão tem **a sua própria sessão**: **Entrar com o Discord** (numa janela do browser) ou utilizador e palavra-passe do Rangify. Não copia a sessão do site: dois sítios a renovar a mesma sessão deitavam-na abaixo. O site só fala com a extensão por duas coisas (no `content/ponte.js`): "estás viva nesta conta?" e "a partida foi encontrada". Nenhum token nem dado da conta passa por aí.

## Como funciona por dentro

- `service-worker.js`: enquanto estás na fila (ou com um ready check por responder) pergunta ao Rangify a cada 3 s (`situacao`), dá o sinal de vida da fila (`fila_batimento`, de 25 em 25 s) e avisa quando a partida é encontrada. Fora disso pergunta de 30 em 30 s (um alarme).
- `offscreen/`: documento escondido que toca o acorde (um service worker não toca som). O acorde é o mesmo de `src/lib/som.ts`.
- `popup/` e `alerta/`: as duas vistas. Só leem o que o service worker guardou e mandam-lhe pedidos.

## Limites

- Só Chromium (Chrome, Edge, Brave). Não está na Chrome Web Store: carrega-se da pasta.
- Se o browser estiver fechado, a extensão não corre: sem sinal de vida, o servidor tira-te da fila ao fim de 3 minutos.
