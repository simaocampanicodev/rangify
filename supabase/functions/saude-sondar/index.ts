// Chamada pela base de dados (pg_cron + pg_net) a cada minuto: mede o tempo de resposta do site, da API, do login e das
// Edge Functions, lê o uso de CPU, memória e disco do servidor (a Metrics API do Supabase) e entrega tudo a
// _saude_registar (migração 0045), que decide o estado. Se o estado mudar para pior (ou recuperar) avisa o canal de staff
// no Discord. A página Staff > Estado lê o resultado.
// Autenticada pelo mesmo segredo partilhado do Discord (DISCORD_SEGREDO), não por um utilizador.
//
// Segredos opcionais:
//   SITE_URL             o endereço do site (já existe); sem ele o site não é medido.
//   DISCORD_CANAL_ESTADO o ID do canal de Discord onde o bot avisa quando o estado muda. Sem ele não há aviso no Discord
//                        (a página Estado e o ponto no menu da Staff continuam a funcionar).
import { admin, chavePublica, chaveSecreta, erro, resposta, SITE } from '../_shared/comum.ts'
import { API, autorizacaoBot } from '../_shared/discord.ts'
import { lerMetricas, mensagemAlerta, type MotivoSaude } from '../_shared/metricas.ts'

/** Uma sonda que passe disto conta como falhada (o limite de "lento" está na base de dados). */
const TEMPO_MAXIMO_MS = 8000

interface Sonda { monitor: string; ok: boolean; ms: number | null; detalhe?: string; extra?: unknown }

/** Mede quanto demora `f`. Uma exceção (rede, tempo esgotado) é uma sonda falhada, não um erro da função. */
async function medir(monitor: string, f: (sinal: AbortSignal) => Promise<{ ok: boolean; detalhe?: string; extra?: unknown }>): Promise<Sonda> {
  const inicio = performance.now()
  try {
    const r = await f(AbortSignal.timeout(TEMPO_MAXIMO_MS))
    return { monitor, ms: Math.round(performance.now() - inicio), ...r }
  } catch (e) {
    const esgotou = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return { monitor, ok: false, ms: null, detalhe: esgotou ? `sem resposta em ${TEMPO_MAXIMO_MS / 1000} s` : (e instanceof Error ? e.message : 'erro').slice(0, 120) }
  }
}

const http = (r: Response) => ({ ok: r.ok, detalhe: r.ok ? undefined : `HTTP ${r.status}` })

async function sondas(): Promise<Sonda[]> {
  const base = Deno.env.get('SUPABASE_URL')!
  const cabecalho = { 'User-Agent': 'Rangify-Estado/1' }
  const lista: Promise<Sonda>[] = [
    medir('api', async (sinal) => {
      const { error } = await admin().rpc('_saude_ping').abortSignal(sinal)
      return { ok: !error, detalhe: error?.message.slice(0, 120) }
    }),
    medir('auth', async (sinal) => http(await fetch(`${base}/auth/v1/health`, { headers: { ...cabecalho, apikey: chavePublica() }, signal: sinal }))),
    // O pedido de reconhecimento (OPTIONS) da função de login: passa pelo mesmo caminho das outras, sem fazer nada.
    medir('funcoes', async (sinal) => {
      const r = await fetch(`${base}/functions/v1/entrar`, { method: 'OPTIONS', headers: cabecalho, signal: sinal })
      return { ok: r.status < 500, detalhe: r.status < 500 ? undefined : `HTTP ${r.status}` }
    }),
    medir('servidor', async (sinal) => {
      const r = await fetch(`${base}/customer/v1/privileged/metrics`, {
        headers: { ...cabecalho, Authorization: `Basic ${btoa(`service_role:${chaveSecreta()}`)}` },
        signal: sinal,
      })
      if (!r.ok) return { ok: false, detalhe: `HTTP ${r.status}` }
      const m = lerMetricas(await r.text())
      return m ? { ok: true, extra: m } : { ok: false, detalhe: 'resposta sem métricas de CPU' }
    }),
  ]
  if (SITE) {
    lista.push(medir('site', async (sinal) => {
      const r = await fetch(SITE + '/', { headers: cabecalho, signal: sinal })
      await r.arrayBuffer()
      return http(r)
    }))
  }
  return Promise.all(lista)
}

async function avisarDiscord(texto: string) {
  const canal = Deno.env.get('DISCORD_CANAL_ESTADO')
  if (!canal || !Deno.env.get('DISCORD_BOT_TOKEN')) return
  try {
    const r = await fetch(`${API}/channels/${encodeURIComponent(canal)}/messages`, {
      method: 'POST',
      headers: { Authorization: autorizacaoBot(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: texto.slice(0, 1900), allowed_mentions: { parse: [] } }),
    })
    if (!r.ok) console.error('Discord (estado):', r.status, await r.text())
  } catch (e) {
    console.error('Discord (estado):', e)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('Só POST.', 405)
  const segredo = Deno.env.get('DISCORD_SEGREDO')
  if (!segredo || req.headers.get('x-rangify-segredo') !== segredo) return erro('Sem autorização.', 401)
  try {
    const medidas = await sondas()
    const { data, error } = await admin().rpc('_saude_registar', { p_sondas: medidas })
    if (error) throw error
    const r = data as { estado: string; mudou: string | null; motivos: MotivoSaude[] }
    const mensagem = mensagemAlerta(r, SITE ? `${SITE}/admin?aba=estado` : '')
    if (mensagem) await avisarDiscord(mensagem)
    return resposta({ estado: r.estado, mudou: r.mudou, sondas: medidas.map((s) => ({ monitor: s.monitor, ok: s.ok, ms: s.ms })) })
  } catch (e) {
    console.error(e)
    return erro('Não foi possível registar o estado.', 502)
  }
})
