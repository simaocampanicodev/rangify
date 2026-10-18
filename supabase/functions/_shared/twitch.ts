// Peças da Twitch partilhadas pelas funções twitch-ligar e twitch-sincronizar (Deno).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const ID = 'https://id.twitch.tv/oauth2'
export const HELIX = 'https://api.twitch.tv/helix'

export const clienteId = () => (Deno.env.get('TWITCH_CLIENT_ID') ?? '').trim()
const clienteSegredo = () => (Deno.env.get('TWITCH_CLIENT_SECRET') ?? '').trim()
export const twitchConfigurada = () => !!clienteId() && !!clienteSegredo()
export const segredoTwitch = clienteSegredo

// ------------------------------------------------------------ token da aplicação

let tokenApp: { valor: string; expira: number } | null = null

/** Token da própria aplicação (sem utilizador): chega para ver quem está em direto. Guardado até quase expirar. */
export async function tokenDaApp(forcar = false): Promise<string> {
  if (!forcar && tokenApp && tokenApp.expira > Date.now() + 60_000) return tokenApp.valor
  const r = await fetch(`${ID}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clienteId(), client_secret: clienteSegredo(), grant_type: 'client_credentials' }),
  })
  if (!r.ok) throw new Error(`Twitch (token) ${r.status}: ${await r.text()}`)
  const j = await r.json()
  tokenApp = { valor: j.access_token as string, expira: Date.now() + (Number(j.expires_in) || 3600) * 1000 }
  return tokenApp.valor
}

// ------------------------------------------------------------ quem está em direto

interface Stream { user_id: string; title: string; game_name: string; viewer_count: number; started_at: string; type: string }

async function streamsDe(ids: string[], tentativa = 0): Promise<Stream[]> {
  const q = new URLSearchParams()
  for (const id of ids) q.append('user_id', id)
  q.set('first', '100')
  const r = await fetch(`${HELIX}/streams?${q}`, { headers: { Authorization: `Bearer ${await tokenDaApp()}`, 'Client-Id': clienteId() } })
  if (r.status === 401 && tentativa === 0) { await tokenDaApp(true); return streamsDe(ids, 1) }
  if (!r.ok) throw new Error(`Twitch (streams) ${r.status}: ${await r.text()}`)
  return ((await r.json()).data ?? []) as Stream[]
}

/**
 * Vê na Twitch quem das contas ligadas está em direto e guarda o resultado (twitch_contas).
 * Sem lista, vê todas; com lista, só esses perfis. Pedidos em lotes de 100 (o limite da Twitch).
 */
export async function sincronizarLives(db: SupabaseClient, perfis?: string[]) {
  let consulta = db.from('twitch_contas').select('profile_id, twitch_id')
  if (perfis) consulta = consulta.in('profile_id', perfis)
  const { data: contas, error } = await consulta
  if (error) throw error
  const lista = (contas ?? []) as { profile_id: string; twitch_id: string }[]
  let aoVivo = 0
  for (let i = 0; i < lista.length; i += 100) {
    const lote = lista.slice(i, i + 100)
    const emDirecto = new Map((await streamsDe(lote.map((c) => c.twitch_id))).filter((s) => s.type === 'live').map((s) => [s.user_id, s]))
    const agora = new Date().toISOString()
    await Promise.all(lote.map(async (c) => {
      const s = emDirecto.get(c.twitch_id)
      if (s) aoVivo++
      const { error: e } = await db.from('twitch_contas').update({
        ao_vivo: !!s,
        live_titulo: s?.title ?? null,
        live_jogo: s?.game_name ?? null,
        live_espetadores: s?.viewer_count ?? null,
        live_desde: s?.started_at ?? null,
        verificada_em: agora,
      }).eq('profile_id', c.profile_id)
      if (e) throw e
    }))
  }
  return { verificadas: lista.length, aoVivo }
}

// ------------------------------------------------------------ estado assinado do OAuth

const enc = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function chaveHmac() {
  return crypto.subtle.importKey('raw', enc.encode(`rangify-twitch:${clienteSegredo()}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** Quem pediu a ligação e para onde voltar, assinado e válido 10 minutos (o "state" do OAuth). */
export async function criarEstado(dados: { p: string; r: string }): Promise<string> {
  const corpo = b64(enc.encode(JSON.stringify({ ...dados, e: Date.now() + 10 * 60_000 })))
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', await chaveHmac(), enc.encode(corpo)))
  return `${corpo}.${b64(assinatura)}`
}

export async function lerEstado(estado: string): Promise<{ p: string; r: string } | null> {
  const [corpo, assinatura] = estado.split('.')
  if (!corpo || !assinatura) return null
  try {
    const ok = await crypto.subtle.verify('HMAC', await chaveHmac(), deB64(assinatura), enc.encode(corpo))
    if (!ok) return null
    const d = JSON.parse(new TextDecoder().decode(deB64(corpo)))
    if (typeof d.p !== 'string' || typeof d.r !== 'string' || typeof d.e !== 'number' || d.e < Date.now()) return null
    return { p: d.p, r: d.r }
  } catch {
    return null
  }
}
