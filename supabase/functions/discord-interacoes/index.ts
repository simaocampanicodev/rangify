// O "Interactions Endpoint URL" da aplicação do Discord: é para aqui que o Discord
// manda os cliques nos botões (não há nenhum bot ligado 24 horas).
//
// Botão "Chamar para a fila": pinga o cargo de ping e obriga quem carregou a esperar
// 3 minutos até poder carregar outra vez (_discord_ping, na 0016).
//
// O Discord assina cada pedido; sem a assinatura certa (chave pública da aplicação,
// secret DISCORD_PUBLIC_KEY) a resposta é 401, como o Discord exige.
import nacl from 'npm:tweetnacl@1.0.3'
import { admin } from '../_shared/comum.ts'
import { BOTAO_PING, CARGO_PING, SEGUNDOS_ENTRE_PINGS } from '../_shared/discord-ping.ts'

const PING = 1
const COMPONENTE = 3
const RESPONDER = 4
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Só POST.', { status: 405 })
  const corpo = await req.text()
  if (!assinaturaValida(req, corpo)) return new Response('Assinatura inválida.', { status: 401 })
  const i = JSON.parse(corpo)

  if (i.type === PING) return json({ type: PING })

  if (i.type === COMPONENTE && i.data?.custom_id === BOTAO_PING) {
    const quem: string | undefined = i.member?.user?.id ?? i.user?.id
    if (!quem) return soParaTi('Este botão só funciona dentro do servidor.')
    const { data, error } = await admin().rpc('_discord_ping', { p_user: quem, p_segundos: SEGUNDOS_ENTRE_PINGS })
    if (error) {
      console.error(error)
      return soParaTi('Não deu para chamar agora. Tenta outra vez daqui a pouco.')
    }
    const r = data as { ok: boolean; livreEm?: string }
    if (!r.ok) {
      const quando = Math.ceil(Date.parse(r.livreEm ?? '') / 1000)
      return soParaTi(`Já chamaste há pouco. Podes voltar a chamar <t:${quando}:R>.`)
    }
    const site = Deno.env.get('SITE_URL')
    return json({
      type: RESPONDER,
      data: {
        content: `<@&${CARGO_PING}> <@${quem}> está a chamar para a fila! Entra no hub e bora jogar.`,
        // Só o cargo é pingado; quem chamou aparece, mas não recebe notificação.
        allowed_mentions: { roles: [CARGO_PING] },
        components: site ? [{ type: 1, components: [{ type: 2, style: 5, label: 'Entrar na fila', url: `${site}/jogar` }] }] : [],
      },
    })
  }

  return soParaTi('Este botão já não faz nada.')
})
