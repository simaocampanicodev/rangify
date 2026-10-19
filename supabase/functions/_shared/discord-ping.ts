// Os canais da fila no Discord e as mensagens do bot em cada um:
//   * canal de ping: o botão "Chamar para a fila" (pinga o cargo de ping);
//   * canal da fila aberta: quantas pessoas estão na fila aberta, "Entrar na fila aberta" e "Abrir o site";
//   * canal da fila ranked: o mesmo para a ranked. Só quem tem o cargo Ranked (Ascendente 1 ou mais) o vê.
// Os IDs não são segredos (qualquer pessoa no servidor os vê); os secrets DISCORD_PING_CANAL,
// DISCORD_PING_CARGO, DISCORD_FILA_CANAL, DISCORD_FILA_RANKED_CANAL e DISCORD_CARGO_RANKED servem só para os trocar
// sem mexer no código.
import { SITE, admin } from './comum.ts'

export const CANAL_PING = Deno.env.get('DISCORD_PING_CANAL') ?? '1559654941952577688'
export const CARGO_PING = Deno.env.get('DISCORD_PING_CARGO') ?? '1559654502137602178'
export const CANAL_FILA = Deno.env.get('DISCORD_FILA_CANAL') ?? '1561038822274367599'
export const CANAL_FILA_RANKED = Deno.env.get('DISCORD_FILA_RANKED_CANAL') ?? '1561799500660740246'
export const CARGO_RANKED = Deno.env.get('DISCORD_CARGO_RANKED') ?? '1561799128508276906'
export const BOTAO_PING = 'rangify:ping-fila'

export type TipoFila = 'aberta' | 'ranked'

/**
 * Links dos botões "Entrar na fila aberta" e "Entrar na fila ranked": abrem o site e, com sessão, o site entra na
 * fila sozinho (o Discord não corre código num botão de link, por isso é o site que faz o pedido).
 */
export const LINK_ENTRAR_NA_FILA = SITE ? `${SITE}/jogar?fila=aberta` : ''
export const LINK_ENTRAR_NA_RANKED = SITE ? `${SITE}/jogar?fila=ranked` : ''
// Uma chamada para o servidor todo, no máximo, de 5 em 5 minutos.
export const SEGUNDOS_ENTRE_PINGS = 300

const EMOJI = '<:rangify:1559320107606614087>'
const ICONE = 'https://cdn.discordapp.com/emojis/1559320107606614087.png'
const BANNER = 'https://www.image2url.com/r2/default/images/1791842536598-ab980e12-da20-4f8d-a374-086da30e7a7e.png'
const LARANJA = 0xff5b1f
const LUGARES = 10

/** Quantas pessoas há numa fila: a região com mais gente (as filas são por região). */
export interface FilaAtual { n: number; regiao: string | null }

export async function filaAtual(db: ReturnType<typeof admin>, fila: TipoFila = 'aberta'): Promise<FilaAtual> {
  const { data } = await db.from('queue_entries').select('region, profiles(is_bot)').eq('fila', fila)
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
 * A mensagem fixa do canal de uma fila: quantas pessoas estão nela, "Entrar na fila aberta" / "Entrar na fila ranked"
 * (o site abre e entra na fila sozinho) e "Abrir o site" (só abre). O Discord mostra a hora da edição no rodapé.
 */
export function mensagemFila(fila: FilaAtual, tipo: TipoFila = 'aberta') {
  const n = Math.min(fila.n, LUGARES)
  const ranked = tipo === 'ranked'
  const quem = ranked
    ? 'Só para **Ascendente 1 ou mais**. Carrega em **Entrar na fila ranked**: o site abre e entras na fila sem mais cliques.'
    : 'Para toda a gente, de qualquer rank. Carrega em **Entrar na fila aberta**: o site abre e entras na fila sem mais cliques.'
  return {
    embeds: [{
      author: { name: 'Rangify Hub', icon_url: ICONE },
      title: `${ranked ? 'Fila ranked' : 'Fila aberta'}${n <= 0 ? ' · vazia' : ` · ${n}/${LUGARES}`}`,
      description: `\`${barra(n)}\`\n${textoFila(fila)}\n\n${quem} Com ${LUGARES} jogadores, aceitas a partida e segues para o draft.`,
      color: LARANJA,
      thumbnail: { url: ICONE },
      footer: { text: `Rangify · fila ${ranked ? 'ranked' : 'aberta'} · atualizado`, icon_url: ICONE },
      timestamp: new Date().toISOString(),
    }],
    components: SITE ? [{
      type: 1,
      components: [
        { type: 2, style: 5, label: ranked ? 'Entrar na fila ranked' : 'Entrar na fila aberta', emoji: { name: '⚡' }, url: ranked ? LINK_ENTRAR_NA_RANKED : LINK_ENTRAR_NA_FILA },
        { type: 2, style: 5, label: 'Abrir o site', url: `${SITE}/jogar` },
      ],
    }] : [],
    allowed_mentions: { parse: [] },
  }
}

const API = 'https://discord.com/api/v10'

const CANAIS: Record<TipoFila, { canal: string; coluna: string }> = {
  aberta: { canal: CANAL_FILA, coluna: 'discord_fila_message' },
  ranked: { canal: CANAL_FILA_RANKED, coluna: 'discord_fila_ranked_message' },
}

/** Edita a mensagem de uma fila com a contagem de agora. editada é false se a mensagem ainda não foi publicada (Staff › Discord). */
async function atualizarUma(db: ReturnType<typeof admin>, tipo: TipoFila, id: string | null): Promise<{ n: number; editada: boolean }> {
  const fila = await filaAtual(db, tipo)
  if (!id) return { n: fila.n, editada: false }
  const r = await fetch(`${API}/channels/${CANAIS[tipo].canal}/messages/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagemFila(fila, tipo)),
  })
  if (!r.ok) console.error('Discord', tipo, r.status, await r.text())
  return { n: fila.n, editada: r.ok }
}

/** Atualiza as mensagens das duas filas (cada uma só se já foi publicada). */
export async function atualizarMensagemFila(db: ReturnType<typeof admin>): Promise<{ aberta: { n: number; editada: boolean }; ranked: { n: number; editada: boolean } }> {
  const { data: config } = await db.from('config').select('discord_fila_message, discord_fila_ranked_message').eq('id', true).maybeSingle()
  const [aberta, ranked] = await Promise.all([
    atualizarUma(db, 'aberta', config?.discord_fila_message ?? null),
    atualizarUma(db, 'ranked', config?.discord_fila_ranked_message ?? null),
  ])
  return { aberta, ranked }
}
