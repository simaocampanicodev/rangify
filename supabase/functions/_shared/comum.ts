// Peças partilhadas pelas Edge Functions do Rangify (Deno).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function resposta(corpo: unknown, estado = 200) {
  return new Response(JSON.stringify(corpo), { status: estado, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** Os erros vão sempre como { erro } em português, que o site mostra tal e qual. */
export function erro(mensagem: string, estado = 400) {
  return resposta({ erro: mensagem }, estado)
}

/** Lê a chave nova (dicionário JSON, entrada "default") ou, em projetos antigos, a chave legada. */
function chave(nova: string, legada: string): string {
  const json = Deno.env.get(nova)
  if (json) {
    try { const d = JSON.parse(json); if (d.default) return d.default } catch { /* não é JSON */ }
  }
  return Deno.env.get(legada) ?? ''
}

export const chaveSecreta = () => chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
export const chavePublica = () => chave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, chaveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** O utilizador que fez o pedido, a partir do token que o supabase-js envia. */
export async function utilizador(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await admin().auth.getUser(token)
  return data.user ?? null
}

/** O ID do Discord vem do login com o Discord (identities do utilizador). */
export function idDiscord(u: User): string | null {
  const ident = u.identities?.find((i) => i.provider === 'discord')
  const d = (ident?.identity_data ?? {}) as Record<string, unknown>
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const id = d.provider_id ?? d.sub ?? ident?.id ?? meta.provider_id ?? meta.sub
  return typeof id === 'string' && /^\d{15,22}$/.test(id) ? id : null
}

// ------------------------------------------------------------ Henrik Dev API

const BASE = 'https://api.henrikdev.xyz'

export class ErroHenrik extends Error {
  constructor(public estado: number, mensagem: string) { super(mensagem) }
}

export async function henrik<T>(caminho: string): Promise<T> {
  const r = await fetch(BASE + caminho, { headers: { Authorization: Deno.env.get('HENRIK_API_KEY') ?? '' } })
  if (r.status === 404) throw new ErroHenrik(404, 'Não encontrámos esse Riot ID. Confirma o nome e a tag.')
  if (r.status === 429) throw new ErroHenrik(429, 'A API da Riot está ocupada. Tenta daqui a um minuto.')
  if (!r.ok) throw new ErroHenrik(r.status, 'A API da Riot não respondeu. Tenta outra vez mais tarde.')
  const j = await r.json()
  return j.data as T
}

export function partirRiotId(riotId: string) {
  const i = riotId.lastIndexOf('#')
  return { nome: riotId.slice(0, i).trim(), tag: riotId.slice(i + 1).trim() }
}

export const enc = encodeURIComponent

/** Rank oficial atual: currenttier (0 a 27) e RR. */
export async function rankOficial(regiao: string, nome: string, tag: string) {
  const d = await henrik<{ current_data?: { currenttier?: number; ranking_in_tier?: number } }>(
    `/valorant/v2/mmr/${enc(regiao)}/${enc(nome)}/${enc(tag)}`,
  )
  return { tier: d?.current_data?.currenttier ?? 0, rr: d?.current_data?.ranking_in_tier ?? null }
}

/**
 * O endereço do site, sem barras no fim: com SITE_URL=https://rangify.onrender.com/
 * os links ficavam "https://rangify.onrender.com//jogar" e não abriam.
 * Usa assim: `${SITE}/jogar`. Vazio se o secret não existir.
 */
export const SITE = (Deno.env.get('SITE_URL') ?? '').trim().replace(/\/+$/, '')
