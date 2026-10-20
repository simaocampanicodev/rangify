# Publicar a extensão para toda a gente

Hoje a extensão carrega-se à mão (`extension/dist`, modo de programador). Para os teus jogadores é a pior forma: cada um teria de correr comandos e, no Chrome, as extensões carregadas assim mostram um aviso de "modo de programador" sempre que o browser abre.

A forma certa é **publicar uma vez** na Chrome Web Store (e no Edge Add-ons). Os jogadores carregam em **Adicionar** e pronto, sem comandos, e as atualizações chegam sozinhas. Os endereços do teu Supabase e do teu site vão **dentro do pacote** que publicas, por isso quem instala não configura nada.

## 1. Gerar o pacote

```bash
npm install
npm run extension -- https://o-teu-site.onrender.com --zip
```

Fica em `extension/rangify-extensao-<versão>.zip`: o mesmo código de `extension/dist`, mas sem a `key` do manifesto (a loja é que atribui o ID). Tem de ser o endereço do site a sério (não o `localhost`).

Cada vez que publicares uma versão nova, sobe o `version` em `extension/manifest.json` (a loja recusa uma versão igual à anterior).

## 2. Chrome Web Store

1. Cria uma conta de programador em <https://chrome.google.com/webstore/devconsole> (taxa única de 5 USD).
2. **Novo item** › carrega o `.zip`.
3. Preenche a ficha com os textos de baixo, junta pelo menos **uma captura de ecrã** (1280×800, por exemplo o popup com a roda e a janela de "Partida encontrada") e o ícone de 128 px (já vai no pacote).
4. Em **Visibilidade** escolhe **Pública** ou **Não listada** (só quem tem o link instala; chega, porque o link vai no teu site).
5. Em **Práticas de privacidade** usa as respostas de baixo e o URL da tua política de privacidade (modelo mais abaixo).
6. **Enviar para revisão**. Costuma demorar de umas horas a alguns dias.

### Depois do primeiro envio: o ID da loja

A loja atribui um ID à extensão (aparece no painel do item). **Junta-o ao Supabase**, em **Authentication › URL Configuration › Redirect URLs**:

```
https://<ID-DA-LOJA>.chromiumapp.org/
https://<ID-DA-LOJA>.chromiumapp.org/**
```

Sem isto, o **Entrar com o Discord** da extensão falha (entrar com utilizador e palavra-passe funciona). Se quiseres que o ID seja o mesmo nos teus testes locais, copia a chave pública do separador **Pacote** do painel para o campo `key` de `extension/manifest.json`.

## 3. Edge Add-ons (opcional, grátis)

Em <https://partner.microsoft.com/dashboard/microsoftedge> cria um novo item e carrega o **mesmo `.zip`**. O Edge atribui outro ID: junta também `https://<ID-DO-EDGE>.chromiumapp.org/` e `/**` às Redirect URLs do Supabase. O Brave instala da Chrome Web Store.

## 4. Pôr o link no site

No Render (**Environment**), define `VITE_EXTENSAO_URL` com o link da loja e volta a publicar o site. O Rangify passa a mostrar, na página **Jogar**, um convite para instalar a extensão a quem ainda não a tem (desaparece sozinho quando ela está instalada).

---

## Textos da ficha

**Nome:** Rangify: fila e aviso de partida

**Resumo (até 132 caracteres):** A roda da fila do Rangify no browser, com entrar e sair e o aviso de partida encontrada mesmo noutro separador.

**Descrição:**

> O Rangify é o hub de Valorant 5v5 com fila por região, draft de capitães e ranking próprio. Esta extensão põe a fila no teu browser:
>
> • a roda com quantos jogadores estão na fila;
> • entrar e sair da fila com um clique, com os mesmos avisos do site (ban, castigo, partida a decorrer, Riot ID ou Discord em falta);
> • quando a partida é encontrada, toca o aviso, mostra uma notificação e abre uma janela com a contagem para aceitares no Rangify, mesmo que estejas no YouTube ou noutro separador;
> • com a extensão instalada, fechar o separador do Rangify não te tira da fila.
>
> Precisas de uma conta no Rangify. A extensão não é feita nem apoiada pela Riot Games.

**Categoria:** Jogos (ou Social e comunicação). **Idioma:** Português (Portugal).

## Justificação das permissões (a loja pede uma por uma)

| Permissão | Para quê |
| --- | --- |
| `storage` | Guardar a sessão da conta e as definições do som neste browser. |
| `alarms` | Confirmar o estado da fila uma vez por minuto quando a pessoa não está na fila. |
| `offscreen` | Tocar o aviso sonoro de partida encontrada (um service worker não toca som). |
| `identity` | "Entrar com o Discord" numa janela do próprio browser (`launchWebAuthFlow`). |
| `notifications` | Mostrar "Partida encontrada" mesmo com o browser noutro separador. |
| Acesso ao site do Supabase do Rangify | Falar com o servidor do Rangify (estado da fila, entrar e sair, login). |
| Acesso ao site do Rangify (script de conteúdo) | Dizer ao site que a extensão está instalada (para o site não tocar o som duas vezes) e avisá-la quando a pessoa entra ou sai da fila. Não lê nem envia mais nada da página. |

**Finalidade única:** mostrar e controlar a fila do Rangify e avisar quando a partida é encontrada.

## Privacidade (declaração de dados)

- **Dados tratados:** informação de autenticação (a sessão da conta do Rangify) e a atividade na fila (se a pessoa está na fila, desde quando). Nada de histórico de navegação, conteúdo das páginas, localização ou palavras-passe guardadas.
- **Para onde vão:** só para o servidor do Rangify (Supabase). Não há anúncios, estatísticas nem terceiros.
- **Não se vende nem se usa** para nada fora do funcionamento da extensão.
- Marca na loja que **não** vendes dados, **não** os usas para outros fins e **não** os usas para avaliar crédito.

### Modelo de política de privacidade (publica-o num URL público: uma página do site, do Notion, do GitHub Pages...)

> **Política de privacidade da extensão Rangify**
>
> A extensão Rangify mostra e controla a tua fila no Rangify. Para isso guarda neste browser a sessão da tua conta do Rangify e as tuas definições de som. Envia ao servidor do Rangify (Supabase) apenas os pedidos necessários para funcionar: ver o estado da fila, entrar e sair, e iniciar sessão.
>
> Não recolhemos histórico de navegação, o conteúdo das páginas que visitas, a tua localização nem palavras-passe guardadas no browser. Não partilhamos dados com terceiros, não vendemos dados e não os usamos para publicidade. Podes apagar os dados da extensão terminando a sessão no popup ou removendo a extensão. Para apagar a tua conta do Rangify ou pedir os teus dados, contacta [o teu contacto].
