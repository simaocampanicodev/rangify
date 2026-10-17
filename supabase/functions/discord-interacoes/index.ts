// O "Interactions Endpoint URL" da aplicação do Discord: é para aqui que o Discord
// manda os cliques nos botões (não há nenhum bot ligado 24 horas).
//
// Botão "Chamar para a fila": no máximo uma chamada de 5 em 5 minutos para o servidor
// todo (_discord_ping, na 0016). O próprio bot publica a chamada, para saber o id dela,
// e apaga a anterior: no canal fica só a mensagem do botão e a última chamada.
//
// O Discord assina cada pedido; sem a assinatura certa (chave pública da aplicação,
// secret DISCORD_PUBLIC_KEY) a resposta é 401, como o Discord exige.
import nacl from 'npm:tweetnacl@1.0.3'
import { admin } from '../_shared/comum.ts'
import { BOTAO_PING, CANAL_PING, CARGO_PING, LINK_ENTRAR_NA_FILA, SEGUNDOS_ENTRE_PINGS } from '../_shared/discord-ping.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

const API = 'https://discord.com/api/v10'
const PING = 1
const COMPONENTE = 3
const RESPONDER = 4
// Confirma o clique sem escrever nada (a chamada é a mensagem que o bot publica).
const SO_CONFIRMAR = 6
const SO_PARA_TI = 64

function bytes(hex: string) {
  const r = new Uint8Array(hex.length / 2)
  for (let i = 0; i < r.length; i++) r[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return r
}

function assinaturaValida(req: Request, corpo: string) {
  const assinatura = req.headers.get('x-signature-ed25519')
  const quando = req.headers.get('x-signature-timestamp')
  const chave = Deno.env.get('DISCORD_PUBLIC_KEY')
  if (!assinatura || !quando || !chave || !/^[0-9a-f]+$/i.test(assinatura + chave)) return false
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(quando + corpo), bytes(assinatura), bytes(chave))
  } catch {
    return false
  }
}

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json' } })
const soParaTi = (texto: string) => json({ type: RESPONDER, data: { content: texto, flags: SO_PARA_TI, allowed_mentions: { parse: [] } } })

const bot = (metodo: string, caminho: string, corpo?: unknown) => fetch(API + caminho, {
  method: metodo,
  headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`, 'Content-Type': 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo),
})

/** Corre depois de responder ao Discord (que só espera 3 segundos pela resposta). */
function depois(p: Promise<unknown>) {
  const seguro = p.catch((e) => console.error(e))
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(seguro)
}

async function chamar(quem: string) {
  const db = admin()
  const { data, error } = await db.rpc('_discord_ping', { p_user: quem, p_segundos: SEGUNDOS_ENTRE_PINGS })
  if (error) {
    console.error(error)
    return soParaTi('Não deu para chamar agora. Tenta outra vez daqui a pouco.')
  }
  const r = data as { ok: boolean; livreEm?: string; quem?: string | null; anterior?: string; mensagemAnterior?: string | null }
  if (!r.ok) {
    const quando = Math.ceil(Date.parse(r.livreEm ?? '') / 1000)
    const por = r.quem ? (r.quem === quem ? ' (foste tu)' : ` (por <@${r.quem}>)`) : ''
    return soParaTi(`Já houve uma chamada há pouco${por}. Só pode haver uma de 5 em 5 minutos: a próxima fica livre <t:${quando}:R>.`)
  }

  const publicada = await bot('POST', `/channels/${CANAL_PING}/messages`, {
    content: `<@&${CARGO_PING}> <@${quem}> está a chamar para a fila! Entra no hub e bora jogar.`,
    // Só o cargo é pingado; quem chamou aparece, mas não recebe notificação.
    allowed_mentions: { roles: [CARGO_PING] },
    // O botão abre o site e entra na fila sozinho (o site trata do ?fila=1).
    components: LINK_ENTRAR_NA_FILA ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Entrar na fila', emoji: { name: '⚡' }, url: LINK_ENTRAR_NA_FILA }] }] : [],
  })
  if (!publicada.ok) {
    console.error('Discord', publicada.status, await publicada.text())
    await db.rpc('_discord_ping_desfazer', { p_user: quem, p_anterior: r.anterior })
    return soParaTi('O bot não conseguiu publicar a chamada. Avisa a staff.')
  }
  const { id } = (await publicada.json()) as { id: string }
  await db.rpc('_discord_ping_mensagem', { p_mensagem: id })
  // A chamada anterior sai, para o canal não crescer e o botão ficar sempre à vista.
  if (r.mensagemAnterior) depois(bot('DELETE', `/channels/${CANAL_PING}/messages/${r.mensagemAnterior}`))
  return json({ type: SO_CONFIRMAR })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Só POST.', { status: 405 })
  const corpo = await req.text()
  if (!assinaturaValida(req, corpo)) return new Response('Assinatura inválida.', { status: 401 })
  const i = JSON.parse(corpo)

  if (i.type === PING) return json({ type: PING })

  if (i.type === COMPONENTE && i.data?.custom_id === BOTAO_PING) {
    const quem: string | undefined = i.member?.user?.id ?? i.user?.id
    if (!quem) return soParaTi('Este botão só funciona dentro do servidor.')
    try {
      return await chamar(quem)
    } catch (e) {
      console.error(e)
      return soParaTi('Não deu para chamar agora. Tenta outra vez daqui a pouco.')
    }
  }

  return soParaTi('Este botão já não faz nada.')
})
