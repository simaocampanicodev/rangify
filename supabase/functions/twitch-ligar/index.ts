// Liga a conta da Twitch ao perfil do Rangify (OAuth), para o site mostrar "AO VIVO" e o botão da live.
//
//   POST (com a sessão do site) { accao: 'url', retorno }  ->  { url } da Twitch, para onde o site manda a pessoa.
//   GET  (a Twitch devolve a pessoa aqui, sem sessão)       ->  grava a ligação e volta ao site em /divulgar.
//
// Não pede nenhuma permissão à Twitch (scope vazio): só precisa de saber qual é o canal. O token que a Twitch
// dá é revogado logo a seguir. Tem de estar com verify_jwt desligado (o GET vem do browser, sem token).
import { admin, cors, erro, resposta, SITE, utilizador } from '../_shared/comum.ts'
import { clienteId, criarEstado, HELIX, ID, lerEstado, segredoTwitch, sincronizarLives, twitchConfigurada } from '../_shared/twitch.ts'

const redirectUri = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/twitch-ligar`

/** Só se volta ao site do Rangify (SITE_URL), nunca a um endereço qualquer. */
function origemSegura(retorno: unknown): string | null {
  try {
    const u = new URL(String(retorno))
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (SITE && u.origin !== new URL(SITE).origin) return null
    return u.origin
  } catch {
    return null
  }
}

const voltar = (origem: string, params: Record<string, string>) =>
  new Response(null, { status: 302, headers: { Location: `${origem}/divulgar?${new URLSearchParams(params)}` } })

/** A Twitch devolveu a pessoa: troca o código pelo canal e grava. */
async function retorno(url: URL): Promise<Response> {
  const estado = await lerEstado(url.searchParams.get('state') ?? '')
  if (!estado) return new Response('A ligação expirou ou é inválida. Volta ao Rangify e tenta outra vez.', { status: 400 })
  const origem = origemSegura(estado.r)
  if (!origem) return new Response('Endereço de retorno inválido.', { status: 400 })
  if (url.searchParams.get('error')) return voltar(origem, { twitch: 'erro', msg: 'Cancelaste a ligação à Twitch.' })
  const codigo = url.searchParams.get('code')
  if (!codigo) return voltar(origem, { twitch: 'erro', msg: 'A Twitch não devolveu o código. Tenta outra vez.' })
  try {
    const t = await fetch(`${ID}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clienteId(), client_secret: segredoTwitch(), code: codigo, grant_type: 'authorization_code', redirect_uri: redirectUri() }),
    })
    if (!t.ok) throw new Error(`Twitch (token) ${t.status}: ${await t.text()}`)
    const { access_token: token } = await t.json()
    const u = await fetch(`${HELIX}/users`, { headers: { Authorization: `Bearer ${token}`, 'Client-Id': clienteId() } })
    if (!u.ok) throw new Error(`Twitch (users) ${u.status}: ${await u.text()}`)
    const canal = (await u.json()).data?.[0] as { id: string; login: string; display_name: string } | undefined
    // O token já não faz falta: só queríamos saber qual é o canal.
    fetch(`${ID}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clienteId(), token }) }).catch(() => {})
    if (!canal) throw new Error('A Twitch não devolveu o canal.')

    const db = admin()
    const { data: pode } = await db.rpc('streamers_pode', { p_perfil: estado.p })
    if (!pode) return voltar(origem, { twitch: 'erro', msg: 'Esta área ainda não está aberta.' })
    const { error } = await db.from('twitch_contas').upsert({
      profile_id: estado.p, twitch_id: canal.id, login: canal.login, nome: canal.display_name,
      ligada_em: new Date().toISOString(), ao_vivo: false, live_titulo: null, live_jogo: null, live_espetadores: null, live_desde: null, verificada_em: null,
    }, { onConflict: 'profile_id' })
    if (error) {
      if (error.code === '23505') return voltar(origem, { twitch: 'erro', msg: 'Esta conta da Twitch já está ligada a outro jogador.' })
      throw error
    }
    // Não espera pelo próximo minuto para saber se já está em direto.
    await sincronizarLives(db, [estado.p]).catch((e) => console.error(e))
    return voltar(origem, { twitch: 'ok' })
  } catch (e) {
    console.error(e)
    return voltar(origem, { twitch: 'erro', msg: 'Não foi possível ligar a Twitch. Tenta outra vez daqui a pouco.' })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method === 'GET') return retorno(new URL(req.url))
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    if (!twitchConfigurada()) return erro('A Twitch ainda não está configurada. Fala com a staff.', 503)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('id').eq('auth_id', u.id).maybeSingle()
    if (!perfil) return erro('Tens de entrar na tua conta.', 401)
    const { data: pode } = await db.rpc('streamers_pode', { p_perfil: perfil.id })
    if (!pode) return erro('Esta área ainda não está aberta.', 403)
    const corpo = await req.json().catch(() => ({})) as { accao?: string; retorno?: string }
    if (corpo.accao !== 'url') return erro('Pedido inválido.')
    const origem = origemSegura(corpo.retorno)
    if (!origem) return erro('Endereço de retorno inválido.')
    const params = new URLSearchParams({
      client_id: clienteId(), redirect_uri: redirectUri(), response_type: 'code', scope: '', force_verify: 'true',
      state: await criarEstado({ p: perfil.id, r: origem }),
    })
    return resposta({ url: `${ID}/authorize?${params}` })
  } catch (e) {
    console.error(e)
    return erro('Não foi possível iniciar a ligação à Twitch.', 502)
  }
})
