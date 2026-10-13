// Chamada pelo site quando a fila exige o servidor de Discord: pergunta ao bot se
// quem fez o pedido é membro do servidor do Rangify e guarda a resposta no perfil
// (profiles.discord_member e discord_checked_at), que entrar_fila confirma.
import { admin, cors, erro, resposta, utilizador } from '../_shared/comum.ts'

const API = 'https://discord.com/api/v10'

/** O ID do Discord vem do login com o Discord (identities do utilizador). */
function idDiscord(u: NonNullable<Awaited<ReturnType<typeof utilizador>>>): string | null {
  const ident = u.identities?.find((i) => i.provider === 'discord')
  const d = (ident?.identity_data ?? {}) as Record<string, unknown>
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const id = d.provider_id ?? d.sub ?? ident?.id ?? meta.provider_id ?? meta.sub
  return typeof id === 'string' && /^\d{15,22}$/.test(id) ? id : null
}

/** 200: está no servidor. 404: não está. Outra coisa: o Discord não respondeu. */
async function membro(guild: string, id: string, tentativa = 0): Promise<boolean> {
  const r = await fetch(`${API}/guilds/${guild}/members/${id}`, {
    headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}` },
  })
  if (r.status === 429 && tentativa < 2) {
    const j = await r.json().catch(() => ({ retry_after: 1 }))
    await new Promise((res) => setTimeout(res, Math.ceil((j.retry_after ?? 1) * 1000)))
    return membro(guild, id, tentativa + 1)
  }
  if (r.ok) return true
  if (r.status === 404) return false
  throw new Error(`Discord ${r.status}: ${await r.text()}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const guild = Deno.env.get('DISCORD_GUILD_ID')
    if (!guild || !Deno.env.get('DISCORD_BOT_TOKEN')) return erro('O bot do Discord ainda não está configurado. Fala com a staff.', 503)

    const db = admin()
    const id = idDiscord(u)
    // Sem conta de Discord ligada não há como confirmar: conta como fora do servidor.
    const esta = id ? await membro(guild, id) : false
    const { error } = await db.from('profiles')
      .update({ discord_member: esta, discord_checked_at: new Date().toISOString() })
      .eq('auth_id', u.id)
    if (error) throw error
    return resposta({ membro: esta, semDiscord: !id })
  } catch (e) {
    console.error(e)
    return erro('Não foi possível confirmar no Discord. Tenta outra vez daqui a pouco.', 502)
  }
})
