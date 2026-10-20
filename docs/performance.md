# Desempenho

O que se mediu no Rangify, o que mudou por causa disso e o que ficou de fora de propósito.

## Como se mediu

- **Fluidez**: Chromium sem placa gráfica (renderização por software), que é o pior caso e mostra bem o que pesa. Seis segundos de `requestAnimationFrame` em quatro páginas (Painel, Tabela de pontos, Tabela de agentes e Perfil), contando os fotogramas por segundo e os que demoram mais de 50 ms. Com o fundo em `completo` e em `leve`.
- **Memória e fugas**: 5 voltas por 15 páginas (sem recarregar), com o coletor de lixo forçado no fim de cada volta, a ver o heap de JavaScript, os nós do DOM e os ouvintes de eventos.
- **Peso do JavaScript**: `vite build` com e sem as variáveis do Supabase (o Render usa-as), olhando para o tamanho de cada ficheiro e o que está dentro dele.
- **Aspeto**: capturas do mesmo fotograma antes e depois, comparadas pixel a pixel.

## O que pesava

| | Antes | Depois |
|---|---|---|
| Fotogramas por segundo (fundo `completo`) | 22 a 29, com 7 a 21 fotogramas lentos em 6 s | 59 a 60, nenhum lento |
| JavaScript que o browser descarrega em produção (gzip) | `dados` 93 KB + `index` 107 KB | `dados` 69 KB + `index` 102 KB (menos 29 KB) |

A causa da fluidez era uma combinação: as linhas do fundo mexem sempre, e cada cartão (`.painel`), a barra lateral, o rodapé e as janelas tinham `backdrop-filter`. Por cada fotograma do fundo, a placa gráfica tinha de refazer o desfoque de todos eles. Cada coisa isolada era barata (fundo parado com desfoque: 60 fps; fundo a mexer sem desfoque: 56 a 58 fps), a soma é que partia a fluidez. O raio do desfoque não mudava nada (6 px ou 16 px dava o mesmo).

## O que mudou

- **Sem `backdrop-filter`** nos cartões, na barra lateral, no rodapé e nas janelas (incluindo a de "partida encontrada", que é a que mais precisa de fluidez). Os fundos ficaram um pouco mais opacos para compensar. Diferença visível medida: menos de 1% dos pixels mudam mais do que um tom quase impercetível.
- **Fundo pausa com a janela sem foco**: com o jogo à frente e o site num segundo ecrã, as linhas deixam de gastar placa gráfica. Só no site com menu, nunca no overlay do OBS (que nunca tem foco).
- **O modo demo já não vai para produção**: `dados/index.ts` escolhe o adaptador com uma condição que o Vite resolve ao compilar, por isso o código do demo (e a semente de dados) fica de fora quando há Supabase.
- **Ícones dos agentes** pedem a versão pequena (128 px, o maior sítio onde aparecem tem 46 px) e voltam à grande se ela faltar. Não consegui medir os tamanhos reais: a rede do ambiente de testes não chega à CDN da valorant-api.com.
- **Cache de um ano para `/assets/*`** no `render.yaml`. Os nomes dos ficheiros têm o conteúdo no nome, por isso é seguro, e as visitas seguintes deixam de perguntar ao servidor por cada ficheiro.
- **Fontes pedidas logo no HTML** (`<link rel="preload">` para o latim de Geist, JetBrains Mono e Instrument Serif). O texto só existe depois de o React desenhar, por isso antes as fontes só começavam a descarregar depois do JavaScript todo.
- **A memória do `useCarregar` tem teto** (80 respostas): cada perfil ou pesquisa visitada era uma chave nova que nunca saía.
- **Relógio do overlay**: acerta-se pela hora do servidor que cada resposta traz, e o overlay pergunta de 3 em 3 s em vez de 5. Antes, com o relógio do computador atrasado, o tempo da fila e da partida ficava em `00:00` até o relógio local "apanhar" o servidor.

## O que está bem e não se mexeu

- Sem fugas: nós do DOM (1166) e ouvintes (239) iguais depois de 5 voltas; o heap cresce cerca de 0,3 MB por volta, que é o que a cache guarda.
- Páginas por rota (`lazy`), `react-window` na lista de amigos, perguntas só com o separador à frente, uma só ida ao servidor por ciclo da fila e Realtime nas mudanças: já estavam bem.
- Base de dados: os caminhos quentes (ranking, partidas ativas, fila, histórico) já têm índice. Sem dados reais não há como ver planos de execução, por isso não se mexeu.
- Imagens dos mapas: já em WebP, com miniaturas e cache de uma semana.

## Candidatos que ficaram de fora

Não se fizeram por mexerem no aspeto ou por o ganho ser pequeno para o risco:

- 11 das 34 animações de `cosmeticos.css` mexem em propriedades que obrigam a repintar (`box-shadow`, `filter`, `background-position`). Só pesam com muitos jogadores com esses itens no ecrã ao mesmo tempo.
- O esqueleto de carregamento (`.esqueleto`) anima `background-position`, que repinta. Dura uns 300 a 450 ms por página.
- O fundo tem `opacity-90` num contentor com filhos animados: o browser compõe-no à parte em cada fotograma.
- O `@supabase/supabase-js` (autenticação, base de dados, Realtime e fotos) é a maior parte dos 69 KB do ficheiro `dados` e é preciso em todas as páginas.

## Medir outra vez

Com `npm run dev` a correr: abrir o site com `localStorage['rangify:fundo'] = 'completo'` e contar fotogramas durante alguns segundos (por exemplo com um `requestAnimationFrame` em ciclo na consola). Para o peso, `npm run build` (modo demo) e, com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` definidos, o mesmo para ver o que o Render serve.
