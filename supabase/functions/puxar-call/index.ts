// Chamada pelo site no botão "Call da equipa": se quem carrega já está ligado a uma
// call qualquer do servidor do Rangify, o bot muda-o logo para a call da sua equipa.
// O Discord não deixa ninguém (nem um bot) ligar uma pessoa à voz do zero: ela tem de
// já estar numa call. Se não estiver, o site abre o canal e a pessoa entra com um clique.
import { admin, cors, erro, resposta, utilizador } from '../_shared/comum.ts'

const API = 'https://discord.com/api/v10'
// "Target user is not connected to voice."
const FORA_DA_VOZ = 40032

function idDiscord(u: NonNullable<Awaited<ReturnType<typeof utilizador>>>): string | null {
  const ident = u.identities?.find((i) => i.provider === 'discord')
  const d = (ident?.identity_data ?? {}) as Record<string, unknown>
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const id = d.provider_id ?? d.sub ?? ident?.id ?? meta.provider_id ?? meta.sub
  return typeof id === 'string' && /^\d{15,22}$/.test(id) ? id : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const { matchId } = await req.json().catch(() => ({})) as { matchId?: string }
    if (!matchId) return erro('Pedido inválido.')
    const id = idDiscord(u)
    if (!id) return resposta({ movido: false, semDiscord: true })

    const db = admin()
    const { data: perfil } = await db.from('profiles').select('id').eq('auth_id', u.id).maybeSingle()
    if (!perfil) return erro('Perfil não encontrado.', 404)
    const { data: jogador } = await db.from('match_players').select('team').eq('match_id', matchId).eq('profile_id', perfil.id).maybeSingle()
    if (!jogador?.team) return erro('Não estás nesta partida.', 403)
    const { data: d } = await db.from('match_discord').select('guild_id, voz_a_id, voz_b_id, estado').eq('match_id', matchId).maybeSingle()
    const voz = jogador.team === 'A' ? d?.voz_a_id : d?.voz_b_id
    if (!d || d.estado !== 'criado' || !voz) return erro('A call da equipa ainda não está pronta.', 409)

    const r = await fetch(`${API}/guilds/${d.guild_id}/members/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': 'Rangify: entrar na call da equipa',
      },
      body: JSON.stringify({ channel_id: voz }),
    })
    if (r.ok) return resposta({ movido: true })
    const j = await r.json().catch(() => ({})) as { code?: number }
    if (j.code === FORA_DA_VOZ) return resposta({ movido: false, foraDaVoz: true })
    console.error('Discord', r.status, JSON.stringify(j))
    return resposta({ movido: false })
  } catch (e) {
    console.error(e)
    return resposta({ movido: false })
  }
})
