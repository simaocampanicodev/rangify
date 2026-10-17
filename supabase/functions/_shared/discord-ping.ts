// Os dois canais da fila no Discord e as mensagens do bot em cada um:
//   * canal de ping: o botão "Chamar para a fila" (pinga o cargo de ping);
//   * canal da fila: quantas pessoas estão na fila, "Entrar na fila" e "Abrir o site".
// Os IDs não são segredos (qualquer pessoa no servidor os vê); os secrets DISCORD_PING_CANAL,
// DISCORD_PING_CARGO e DISCORD_FILA_CANAL servem só para os trocar sem mexer no código.
import { SITE, admin } from './comum.ts'

export const CANAL_PING = Deno.env.get('DISCORD_PING_CANAL') ?? '1559654941952577688'
export const CARGO_PING = Deno.env.get('DISCORD_PING_CARGO') ?? '1559654502137602178'
export const CANAL_FILA = Deno.env.get('DISCORD_FILA_CANAL') ?? '1561038822274367599'
export const BOTAO_PING = 'rangify:ping-fila'

/**
 * Link do botão "Entrar na fila": abre o site e, com sessão, o site entra na fila sozinho
 * (o Discord não corre código num botão de link, por isso é o site que faz o pedido).
 */
export const LINK_ENTRAR_NA_FILA = SITE ? `${SITE}/jogar?fila=1` : ''
// Uma chamada para o servidor todo, no máximo, de 5 em 5 minutos.
export const SEGUNDOS_ENTRE_PINGS = 300

const EMOJI = '<:rangify:1559320107606614087>'
const ICONE = 'https://cdn.discordapp.com/emojis/1559320107606614087.png'
const BANNER = 'https://www.image2url.com/r2/default/images/1791842536598-ab980e12-da20-4f8d-a374-086da30e7a7e.png'
const LARANJA = 0xff5b1f
const LUGARES = 10

/** Quantas pessoas há na fila: a região com mais gente (as filas são por região). */
export interface FilaAtual { n: number; regiao: string | null }

export async function filaAtual(db: ReturnType<typeof admin>): Promise<FilaAtual> {
  const { data } = await db.from('queue_entries').select('region, profiles(is_bot)')
  const por = new Map<string, number>()
  for (const l of (data ?? []) as unknown as { region: string; profiles: { is_bot: boolean } | null }[]) {
    if (l.profiles?.is_bot) continue
    por.set(l.region, (por.get(l.region) ?? 0) + 1)
  }
  let melhor: FilaAtual = { n: 0, regiao: null }
  for (const [regiao, n] of por) if (n > melhor.n) melhor = { n, regiao }
  return melhor
}

/** Os dez lugares da sala, cheios até onde há gente: ▰▰▰▱▱▱▱▱▱▱ */
function barra(n: number) {
  const cheios = Math.max(0, Math.min(LUGARES, n))
  return '▰'.repeat(cheios) + '▱'.repeat(LUGARES - cheios)
}

/** A frase sobre a fila: quantas pessoas há e quantas faltam. */
function textoFila(f: FilaAtual) {
  const n = Math.min(f.n, LUGARES)
  const falta = LUGARES - n
  let texto: string
  if (n <= 0) texto = '👥 **Fila vazia**: sê o primeiro a entrar.'
  else if (falta === 1) texto = `🔥 **${n}/${LUGARES} na fila**: falta só 1 para começar!`
  else if (falta <= 0) texto = `✅ **${LUGARES}/${LUGARES}**: a partida está a ser criada.`
  else texto = `👥 **${n}/${LUGARES} na fila**: faltam ${falta}.`
  return `${texto}${f.regiao ? ` · ${f.regiao.toUpperCase()}` : ''}`
}

/** A mensagem fixa do canal de ping: o embed com o texto e o banner, e os botões. Sem a contagem da fila (essa vive no canal da fila). */
export function mensagemPing() {
  return {
    embeds: [
      {
        title: 'Chamar para a fila',
        description: [
          `${EMOJI} Falta gente para a próxima partida? Carrega no botão e o bot avisa toda a gente que tem o cargo <@&${CARGO_PING}>, as pessoas que escolheram receber estes avisos ao entrar no servidor.`,
          '',
          '**Antes de chamares**',
          '• Entra primeiro na fila no site, para quem chega te encontrar lá.',
          '• Chama só quando estiveres mesmo para jogar.',
          '',
          '**Sem spam**',
          '• Só pode haver uma chamada de 5 em 5 minutos, para o servidor todo.',
          '• Cada chamada nova apaga a anterior, para este canal não encher.',
          '• Quem abusar do botão perde o acesso a este canal.',
          '',
          'Já não queres receber estes pings? Muda as tuas respostas em **Canais e cargos**.',
        ].join('\n'),
        color: LARANJA,
        author: { name: 'Rangify Hub', icon_url: ICONE },
        image: { url: BANNER },
        footer: { text: 'Rangify · Boas partidas!', icon_url: ICONE },
      },
    ],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: BOTAO_PING, label: 'Chamar para a fila', emoji: { name: '🔔' } },
        ...(SITE ? [{ type: 2, style: 5, label: 'Abrir o Rangify', url: `${SITE}/jogar` }] : []),
      ],
    }],
    allowed_mentions: { parse: [] },
  }
}

/**
 * A mensagem fixa do canal da fila: quantas pessoas estão na fila, "Entrar na fila" (o site abre e
 * entra na fila sozinho) e "Abrir o site" (só abre). O Discord mostra a hora da edição no rodapé.
 */
export function mensagemFila(fila: FilaAtual) {
  const n = Math.min(fila.n, LUGARES)
  return {
    embeds: [{
      author: { name: 'Rangify Hub', icon_url: ICONE },
      title: n <= 0 ? 'Fila vazia' : `${n}/${LUGARES} na fila`,
      description: `\`${barra(n)}\`\n${textoFila(fila)}\n\nCarrega em **Entrar na fila**: o site abre e entras na fila sem mais cliques. Com ${LUGARES} jogadores, aceitas a partida e segues para o draft.`,
      color: LARANJA,
      thumbnail: { url: ICONE },
      footer: { text: 'Rangify · atualizado', icon_url: ICONE },
      timestamp: new Date().toISOString(),
    }],
    components: SITE ? [{
      type: 1,
      components: [
        { type: 2, style: 5, label: 'Entrar na fila', emoji: { name: '⚡' }, url: LINK_ENTRAR_NA_FILA },
        { type: 2, style: 5, label: 'Abrir o site', url: `${SITE}/jogar` },
      ],
    }] : [],
    allowed_mentions: { parse: [] },
  }
}

const API = 'https://discord.com/api/v10'

/** Edita a mensagem do canal da fila com a contagem de agora. Devolve editada false se ainda não foi publicada (Staff › Discord). */
export async function atualizarMensagemFila(db: ReturnType<typeof admin>): Promise<{ n: number; editada: boolean }> {
  const { data: config } = await db.from('config').select('discord_fila_message').eq('id', true).maybeSingle()
  const id: string | null = config?.discord_fila_message ?? null
  const fila = await filaAtual(db)
  if (!id) return { n: fila.n, editada: false }
  const r = await fetch(`${API}/channels/${CANAL_FILA}/messages/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagemFila(fila)),
  })
  if (!r.ok) console.error('Discord', r.status, await r.text())
  return { n: fila.n, editada: r.ok }
}
