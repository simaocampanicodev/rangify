# Documentação do Rangify

Todos os guias do projeto estão aqui. O ponto de partida é o [README](../README.md) da raiz.

## Para começar

| Guia | O que tem |
| --- | --- |
| [Instalar e configurar](setup.md) | Correr em local (modo demo), variáveis de ambiente, segredos e ligar ao Supabase |
| [Arquitetura](architecture.md) | O que vive no browser e na base de dados, os pontos, a máquina de estados, as Edge Functions e os testes |
| [Migrações](migrations.md) | O índice das 35 migrações da base de dados |
| [Deploy](deploy.md) | GitHub, Supabase, Discord, Henrik Dev API e Render, passo a passo |

## Funcionalidades

| Guia | O que tem |
| --- | --- |
| [Discord](discord.md) | O bot, os canais por partida, o canal de ping, os canais das filas, o cargo Ranked e os avisos |
| [Torneios](tournaments.md) | Equipas, fase de grupos, playoffs e picks e bans de mapas |
| [Streamers](streamers.md) | O overlay do OBS, a Twitch ligada ao perfil e os convites |
| [Extensão do browser](extension.md) | Instalar a extensão (Chrome, Edge e Brave) |
| [Publicar a extensão](extension-publishing.md) | Chrome Web Store e Edge Add-ons |

## Qualidade

| Guia | O que tem |
| --- | --- |
| [Desempenho](performance.md) | O que se mediu, o que mudou e o que ficou de fora de propósito |
| [Inspiração: EasyUI](inspiracao-easyui.md) | Os componentes de easyui.site que serviram de ideia e como ficaram no Rangify |

## Decisões de desenho

| Documento | O que tem |
| --- | --- |
| [Staff, fila no Discord, extensão, ranks e telemóvel](design/2026-10-17-staff-fila-extensao.md) | O desenho do trabalho de 17 de outubro de 2026 |

## Onde fica o resto

```text
assets/     Marca, banners do Discord, mapas originais e as imagens do README
extension/  O código da extensão do browser
scripts/    Testes e ferramentas
supabase/   Migrações e Edge Functions
```
