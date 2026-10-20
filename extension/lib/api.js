// Fala com o Supabase do Rangify (RPCs, Edge Functions e login). Só o service worker usa isto: o popup e a janela
// de alerta pedem tudo ao service worker. Assim há uma única parte a renovar o token de sessão (o refresh token
// só serve uma vez, duas partes a renová-lo ao mesmo tempo deitavam a sessão abaixo).
import { CONFIG } from '../config.js'

export class ErroApi extends Error {
  constructor(mensagem, estado = 0) {
    super(mensagem)
    this.estado = estado
  }
}

export const configurado = () => !!CONFIG.supabaseUrl && !!CONFIG.supabaseKey
export const ler = (...chaves) => chrome.storage.local.get(chaves)

function payload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  } catch {
    return {}
  }
}

async function guardarSessao({ access_token: accessToken, refresh_token: refreshToken }) {
  if (!accessToken || !refreshToken) throw new ErroApi('O Rangify não devolveu uma sessão válida.')
  await chrome.storage.local.set({ sessao: { accessToken, refreshToken, expiraEm: (payload(accessToken).exp ?? 0) * 1000 } })
}

let aRenovar = null

/** Troca o refresh token por uma sessão nova. Uma renovação de cada vez. */
function renovar() {
  aRenovar ??= (async () => {
    const { sessao } = await ler('sessao')
    if (!sessao?.refreshToken) throw new ErroApi('Entra na tua conta.', 401)
    let r
    try {
      r = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: sessao.refreshToken }),
      })
    } catch {
      throw new ErroApi('Sem ligação ao Rangify.', 0)
    }
    if (!r.ok) {
      // Só apaga a sessão se o servidor a recusou; uma falha de rede não deve deitar ninguém fora.
      if (r.status === 400 || r.status === 401) await chrome.storage.local.remove('sessao')
      throw new ErroApi('A tua sessão expirou. Entra outra vez.', 401)
    }
    const nova = await r.json()
    await guardarSessao(nova)
    return nova.access_token
  })().finally(() => { aRenovar = null })
  return aRenovar
}

async function tokenValido() {
  const { sessao } = await ler('sessao')
  if (!sessao) throw new ErroApi('Entra na tua conta.', 401)
  return sessao.expiraEm - Date.now() < 90_000 ? renovar() : sessao.accessToken
}

async function mensagemDeErro(r) {
  try {
    const j = await r.json()
    // As Edge Functions respondem { erro }, o PostgREST { message } com o texto que a base de dados levantou.
    return j.erro ?? j.message ?? j.error_description ?? j.msg
  } catch {
    return null
  }
}

async function pedir(caminho, corpo, comSessao = true, tentativa = 0) {
  const token = comSessao ? await tokenValido() : CONFIG.supabaseKey
  let r
  try {
    r = await fetch(CONFIG.supabaseUrl + caminho, {
      method: 'POST',
      headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo ?? {}),
    })
  } catch {
    throw new ErroApi('Sem ligação ao Rangify.', 0)
  }
  if (r.status === 401 && comSessao && tentativa === 0) {
    await renovar()
    return pedir(caminho, corpo, comSessao, 1)
  }
  if (!r.ok) throw new ErroApi((await mensagemDeErro(r)) ?? 'O servidor não respondeu. Tenta outra vez.', r.status)
  // As funções "void" respondem sem corpo (204) ou com um corpo vazio.
  const texto = r.status === 204 ? '' : await r.text()
  return texto ? JSON.parse(texto) : null
}

export const rpc = (nome, args) => pedir(`/rest/v1/rpc/${nome}`, args)
export const funcao = (nome, corpo, comSessao = true) => pedir(`/functions/v1/${nome}`, corpo, comSessao)

/** Entra com o Discord numa janela do browser. A extensão fica com a sua própria sessão. */
export async function entrarComDiscord() {
  const redirect = chrome.identity.getRedirectURL()
  const url = `${CONFIG.supabaseUrl}/auth/v1/authorize?provider=discord&redirect_to=${encodeURIComponent(redirect)}`
  let fim
  try {
    fim = await chrome.identity.launchWebAuthFlow({ url, interactive: true })
  } catch (e) {
    if (/did not approve|cancel/i.test(String(e?.message))) throw new ErroApi('Entrada cancelada.')
    throw new ErroApi(`Não foi possível entrar com o Discord. Confirma que ${redirect} está nas Redirect URLs do Supabase (Authentication > URL Configuration).`)
  }
  const u = new URL(fim)
  const p = new URLSearchParams(u.hash.replace(/^#/, '') || u.search)
  const erro = p.get('error_description') ?? p.get('error')
  if (erro) throw new ErroApi(erro.replace(/\+/g, ' '))
  await guardarSessao({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') })
}

/** Entra com o utilizador e a palavra-passe do Rangify (a mesma função que o site usa). */
export async function entrarComPassword(utilizador, password) {
  const s = await funcao('entrar', { utilizador, password }, false)
  await guardarSessao(s)
}

/** Termina só a sessão da extensão (a do site fica como está). */
export async function terminarSessao() {
  const { sessao } = await ler('sessao')
  await chrome.storage.local.remove(['sessao', 'perfil', 'fila', 'partida', 'discord'])
  if (!sessao || !configurado()) return
  fetch(`${CONFIG.supabaseUrl}/auth/v1/logout?scope=local`, {
    method: 'POST',
    headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${sessao.accessToken}` },
  }).catch(() => {})
}
