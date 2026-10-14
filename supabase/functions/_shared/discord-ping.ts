// O canal e o cargo do ping para a fila, e a mensagem com o botão.
// Os IDs não são segredos (qualquer pessoa no servidor os vê); os secrets
// DISCORD_PING_CANAL e DISCORD_PING_CARGO servem só para os trocar sem mexer no código.
import { SITE, admin } from './comum.ts'

export const CANAL_PING = Deno.env.get('DISCORD_PING_CANAL') ?? '1559654941952577688'
export const CARGO_PING = Deno.env.get('DISCORD_PING_CARGO') ?? '1559654502137602178'
export const BOTAO_PING = 'rangify:ping-fila'
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

/** O texto pequeno por baixo do embed: quantas pessoas estão na fila. O Discord atualiza o "há X minutos" sozinho. */
function linhaFila(f: FilaAtual) {
  const falta = LUGARES - f.n
  const quando = `<t:${Math.floor(Date.now() / 1000)}:R>`
  let texto: string
  if (f.n <= 0) texto = '👥 **Fila vazia**: sê o primeiro a entrar.'
  else if (falta === 1) texto = `🔥 **${f.n}/${LUGARES} na fila**: falta só 1 para começar!`
  else if (falta <= 0) texto = `✅ **${LUGARES}/${LUGARES}**: a partida está a ser criada.`
  else texto = `👥 **${f.n}/${LUGARES} na fila**: faltam ${falta}.`
  return `${texto}${f.regiao ? ` · ${f.regiao.toUpperCase()}` : ''}\nAtualizado ${quando}`
}

/** A mensagem fixa do canal: o embed com o texto e o banner, a fila e os botões. */
export function mensagemPing(fila?: FilaAtual) {
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
      // Por baixo do embed e por cima dos botões: o Discord mostra os embeds antes dos botões.
      ...(fila ? [{ description: linhaFila(fila), color: LARANJA }] : []),
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

const API = 'https://discord.com/api/v10'

/** Edita a mensagem do canal com a fila de agora. Devolve false se ainda não foi publicada (Staff › Discord). */
export async function atualizarMensagemFila(db: ReturnType<typeof admin>): Promise<{ n: number; editada: boolean }> {
  const { data: config } = await db.from('config').select('discord_ping_message').eq('id', true).maybeSingle()
  const id: string | null = config?.discord_ping_message ?? null
  const fila = await filaAtual(db)
  if (!id) return { n: fila.n, editada: false }
  const r = await fetch(`${API}/channels/${CANAL_PING}/messages/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mensagemPing(fila)),
  })
  if (!r.ok) console.error('Discord', r.status, await r.text())
  return { n: fila.n, editada: r.ok }
}
