# Inspiração: EasyUI

Estudei os 131 componentes de [easyui.site/components](https://easyui.site/components) (React, Tailwind e Framer Motion, monocromáticos, com movimento de mola). Não copiei código: o Rangify não usa Framer Motion nem outras bibliotecas de animação, por isso cada ideia foi refeita à mão com CSS e um pouco de React, nas cores e no tom do site (fundo quase preto, laranja como única cor de destaque, rótulos mono em maiúsculas). Tudo respeita "reduzir animações".

## Implementados

| Componente do EasyUI | O que ficou no Rangify | Onde |
| --- | --- | --- |
| [Animated Tabs](https://easyui.site/components/animated-tabs) e [Pill Navigation](https://easyui.site/components/pill-navigation) | A pílula laranja desliza de uma opção para a outra em todos os filtros (Tabela, Perfil, Staff, gráfico de forma...) | `Segmentado` em `ui.tsx` |
| [Animated Number Morph](https://easyui.site/components/animated-number) e [Badge](https://easyui.site/components/badge) | Algarismos que rolam até ao valor: pontos do Painel e do Perfil, contagem da fila, aceites, contador do menu | `ui/NumeroRolante.tsx` |
| [Stat Card](https://easyui.site/components/stat-card) | Os números do Perfil (agora dentro do painel de atividade) e os pontos do Painel contam até ao valor e mantêm a etiqueta de variação | `Perfil.tsx`, `Dashboard.tsx` |
| [Sidebar](https://easyui.site/components/sidebar) | O menu lateral ganhou a pílula que desliza para a página atual e a que segue o rato, Ctrl/Cmd + B para recolher, e aperta-se em ecrãs baixos para nunca ter barra de scroll | `NavMenu` em `Sidebar.tsx` |
| [Stepper](https://easyui.site/components/stepper) | As fases da partida: o fio enche-se, o visto desenha-se e a fase atual pulsa | `Progresso` em `Jogar.tsx` |
| [Neon Edge Button](https://easyui.site/components/neon-edge-button) | Um filete de luz dá a volta ao botão principal da fila e ao botão Aceitar | `.btn-neon` |
| [Undo Toast](https://easyui.site/components/undo-toast) e [Velocity Toast](https://easyui.site/components/velocity-toast) | Os avisos têm uma barra com o tempo que falta, que pára com o rato por cima e é ela que fecha o aviso | `contexts/Avisos.tsx` |
| [Settle Modal](https://easyui.site/components/settle-modal) | As janelas assentam (um pouco maiores e depois no tamanho certo): janelas, "Partida encontrada", paleta e avisos | `.assenta` |
| [Command Menu](https://easyui.site/components/command-menu) e [Spotlight Search](https://easyui.site/components/spotlight-search) | Paleta de comandos com Ctrl/Cmd + K: ir a uma página, entrar ou sair da fila e procurar jogadores pelo Riot ID | `Paleta.tsx`, `PaletaJanela.tsx` |
| [Activity Heatmap](https://easyui.site/components/activity-heatmap) | "Quando joga" no Perfil: calendário das últimas 20 semanas, do cinzento ao laranja | `ui/MapaAtividade.tsx` |
| [Donut Chart](https://easyui.site/components/donut-chart) | Anel de vitórias e derrotas no Perfil, com o centro a mudar ao passar o rato | `ui/Donut.tsx` |
| [Stretch Switch](https://easyui.site/components/stretch-switch) | O interruptor estica ao carregar e assenta com mola (Definições e Staff) | `ui/Interruptor.tsx` |
| [Press Button](https://easyui.site/components/press-button) | Todos os botões encolhem ao carregar e voltam com um pequeno excesso | `.btn:active` |
| [Unfold Accordion](https://easyui.site/components/unfold-accordion) | As secções da Staff abrem a desenrolar | `Colapsavel` em `Mais.tsx` |
| [Expandable Search](https://easyui.site/components/expandable-search) | A pesquisa da Tabela alarga quando lhe pegas | `.campo-expande` |
| [Glitch Text](https://easyui.site/components/glitch-text) e [Not Found](https://easyui.site/components/not-found) | O 404 falha de vez em quando, só em laranja e branco | `NaoEncontrado.tsx` |

## Só inspiração (já tínhamos algo parecido)

| Componente do EasyUI | O que já existia e como mudou |
| --- | --- |
| [Interactive Area Chart](https://easyui.site/components/interactive-area-chart) | O gráfico de forma do Perfil já tinha curva suave, área e detalhe ao passar o rato; ficou como estava |
| [Drag to Confirm](https://easyui.site/components/drag-to-confirm) | O Rangify já pede para segurar o botão nas ações destrutivas (cancelar partida, fechar fila); mantive o gesto |
| [Skeleton](https://easyui.site/components/skeleton) | Os esqueletos com varrimento de luz já existiam |
| [Breadcrumb](https://easyui.site/components/breadcrumb) | As migalhas dos cabeçalhos já existem |
| [Product Tour](https://easyui.site/components/product-tour) | O tour de boas-vindas já tem destaque e passos |

## Vistos e deixados de fora

[Spotlight Card](https://easyui.site/components/spotlight-card) (a luz do rato nos cartões) foi experimentado e retirado: no Rangify distraía nos cartões da fila e do perfil.

Fundos de partículas e shaders ([Dot Field](https://easyui.site/components/dot-field), [Meteors](https://easyui.site/components/meteors), [Speed Warp](https://easyui.site/components/speed-warp)...) competiriam com as linhas de luz do fundo do Rangify. Os componentes de pagamentos, carteiras, IA, chat e login ([Money Card](https://easyui.site/components/money-card), [AI Response](https://easyui.site/components/ai-response), [Chat](https://easyui.site/components/chat)...) não têm sítio no hub. Os que pesam muito em dispositivos fracos ([Particle Delete](https://easyui.site/components/particle-delete), [Depth Corridor](https://easyui.site/components/depth-corridor)) ficaram de fora de propósito, pelo mesmo motivo do [desempenho](performance.md).
