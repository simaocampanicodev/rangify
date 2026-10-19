// O cargo "Ranked" do Discord: quem tem Ascendente 1 ou mais (rank oficial) recebe-o e vê o canal da fila ranked;
// quem desce abaixo de Ascendente 1 perde-o. O bot precisa da permissão "Gerir cargos" e do cargo dele acima do Ranked.
// Quem manda entrar ou não na fila ranked é a base de dados (entrar_fila): o cargo só serve para ver o canal.
import { admin, idDiscord } from './comum.ts'
import { CARGO_RANKED } from './discord-ping.ts'

const API = 'https://discord.com/api/v10'

/** Ascendente 1 (currenttier 21): o mesmo número de _tier_minimo_ranked() na base de dados. */
export const TIER_RANKED = 21

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function pedir(metodo: string, caminho: string, tentativa = 0): Promise<Response> {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`, 'X-Audit-Log-Reason': 'Rangify: cargo Ranked' },
  })
  if (r.status === 429 && tentativa < 3) {
    const j = await r.json().catch(() => ({ retry_after: 1 }))
    await dormir(Math.ceil((j.retry_after ?? 1) * 1000) + 100)
    return pedir(metodo, caminho, tentativa + 1)
  }
  return r
}

export type ResultadoCargo = 'dado' | 'tirado' | 'fora' | 'semDiscord'

/** Dá o cargo Ranked a quem tem Ascendente 1 ou mais e tira-o a quem não tem. */
export async function ajustarCargoRanked(discordId: string | null, tier: number): Promise<ResultadoCargo> {
  const guild = Deno.env.get('DISCORD_GUILD_ID')
  if (!guild || !Deno.env.get('DISCORD_BOT_TOKEN')) throw new Error('O bot do Discord ainda não está configurado.')
  if (!discordId) return 'semDiscord'
  const dar = tier >= TIER_RANKED
  const r = await pedir(dar ? 'PUT' : 'DELETE', `/guilds/${guild}/members/${discordId}/roles/${CARGO_RANKED}`)
  if (r.status === 404) return 'fora'   // não está no servidor (ou o cargo não existe)
  if (r.status === 403) throw new Error('O bot não pode gerir o cargo Ranked: dá-lhe "Gerir cargos" e põe o cargo dele acima do Ranked.')
  if (!r.ok) throw new Error(`Discord ${r.status}: ${await r.text()}`)
  return dar ? 'dado' : 'tirado'
}

export interface ResumoCargos { total: number; feitos: number; dados: number; tirados: number; foraDoServidor: number; semDiscord: number; falhas: number; incompleto: boolean }

/**
 * Acerta o cargo Ranked de vários jogadores (ou de todos, sem a lista) pelo rank oficial que está guardado.
 * Um jogador com erro não pára os outros, e há um limite de tempo para a função não ser cortada a meio.
 */
export async function sincronizarCargoRanked(db: ReturnType<typeof admin>, perfilIds?: string[], limiteMs = 100_000): Promise<ResumoCargos> {
  let q = db.from('profiles').select('id, auth_id, official_tier').eq('is_bot', false).not('auth_id', 'is', null).not('riot_id', 'is', null)
  if (perfilIds) q = q.in('id', perfilIds)
  const { data } = await q
  const lista = (data ?? []) as { id: string; auth_id: string; official_tier: number }[]
  const r: ResumoCargos = { total: lista.length, feitos: 0, dados: 0, tirados: 0, foraDoServidor: 0, semDiscord: 0, falhas: 0, incompleto: false }
  const inicio = Date.now()
  let erroFinal: Error | null = null
  for (const p of lista) {
    if (Date.now() - inicio > limiteMs) { r.incompleto = true; break }
    try {
      const { data: u } = await db.auth.admin.getUserById(p.auth_id)
      const res = await ajustarCargoRanked(u?.user ? idDiscord(u.user) : null, p.official_tier)
      if (res === 'dado') r.dados++
      else if (res === 'tirado') r.tirados++
      else if (res === 'fora') r.foraDoServidor++
      else r.semDiscord++
    } catch (e) {
      r.falhas++
      erroFinal = e instanceof Error ? e : new Error(String(e))
      console.error('cargo ranked', p.id, erroFinal.message)
      // Sem permissões ou sem bot não vale a pena insistir com os outros.
      if (/não pode gerir|ainda não está configurado/.test(erroFinal.message)) { r.incompleto = true; break }
    }
    r.feitos++
    await dormir(150)
  }
  if (erroFinal && r.dados + r.tirados === 0 && r.falhas === r.feitos) throw erroFinal
  return r
}
