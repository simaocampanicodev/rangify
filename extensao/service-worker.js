// O "motor" da extensão. Enquanto a pessoa está na fila, pergunta ao Rangify de poucos em poucos segundos
// (a mesma chamada `situacao` do site), dá o sinal de vida da fila e, quando a partida é encontrada, toca o som,
// mostra uma notificação e abre a janela de alerta. Fora da fila, só pergunta de 30 em 30 segundos.
import { CONFIG } from './config.js'
import * as api from './lib/api.js'

const ALARME = 'tick'
/** Com fila ou partida a decidir-se, pergunta a cada 3 s: o ready check dura 20 s. */
const RAPIDO_MS = 3000
/** O servidor tira da fila quem passa 3 minutos sem sinal; o site dá-o de 30 em 30 s. */
const BATIMENTO_MS = 25_000
/** Se há quem esteja a ver o site, a janela de alerta não abre por cima dele. */
const SITE_VISIVEL_MS = 25_000
/** Quanto tempo depois de aparecer a partida toca o lembrete (o ready check tem 20 s). */
const LEMBRETE_MS = 12_000
/** A extensão só se diz "viva" ao site se falou com o servidor há menos disto. */
const VIVA_MS = 90_000
const SOM_PADRAO = { ligado: true, volume: 70 }

let aCorrer = false
let ultimoBatimento = 0
let siteVisivelAte = 0

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const ler = api.ler
const guardar = (o) => chrome.storage.local.set(o)

// ------------------------------------------------------------ estado

/** O que o popup e a janela de alerta precisam da partida (e nada do que não precisam). */
function resumo(p, eu) {
  if (!p) return null
  const meu = p.jogadores?.find((j) => j.perfilId === eu)
  return {
    id: p.id, codigo: p.codigo, estado: p.estado, automatica: !!p.automatica, prazo: p.prazoConfirmacao,
    aceitaram: (p.jogadores ?? []).filter((j) => j.aceitou).length, euAceitei: !!meu?.aceitou, participo: !!meu,
  }
}

async function limparEstado(erro = null) {
  await chrome.storage.local.remove(['perfil', 'fila', 'partida', 'discord', 'atualizadoEm'])
  await guardar({ erro })
  await chrome.action.setBadgeText({ text: '' })
}

async function pintarBadge(fila, partida) {
  const pendente = partida?.estado === 'READY_CHECK' && partida.participo && !partida.euAceitei
  const texto = pendente ? '!' : partida ? '▶' : fila?.naFila ? String(Math.min(10, fila.contagem)) : ''
  await chrome.action.setBadgeText({ text: texto })
  await chrome.action.setBadgeBackgroundColor({ color: pendente ? '#ff5b1f' : '#3a3a40' })
  try { await chrome.action.setBadgeTextColor({ color: pendente ? '#170802' : '#f3f0eb' }) } catch { /* versões antigas */ }
}

/**
 * Pergunta o estado ao Rangify e guarda-o. Devolve se vale a pena perguntar depressa (na fila,
 * ou com um ready check por responder), ou null se não há sessão.
 */
async function atualizar({ lento = false } = {}) {
  if (!api.configurado()) return null
  const { sessao, perfil: guardado } = await ler('sessao', 'perfil')
  if (!sessao) { await limparEstado(); return null }
  try {
    const perfilPedido = lento || !guardado ? api.rpc('meu_perfil') : Promise.resolve(guardado)
    const [{ fila, partida }, perfil] = await Promise.all([api.rpc('situacao', { p_partida: null }), perfilPedido])
    if (!perfil) { await limparEstado('Esta conta ainda não tem perfil no Rangify. Abre o site.'); return null }
    const estado = resumo(partida, perfil.id)
    const desvio = fila.agora ? Date.parse(fila.agora) - Date.now() : 0
    await guardar({ perfil, fila, partida: estado, desvio, atualizadoEm: Date.now(), erro: null })
    await pintarBadge(fila, estado)

    if (fila.naFila && Date.now() - ultimoBatimento >= BATIMENTO_MS) {
      ultimoBatimento = Date.now()
      api.rpc('fila_batimento').catch(() => {})
    }
    const pendente = estado?.estado === 'READY_CHECK' && estado.participo && !estado.euAceitei && !estado.automatica
    if (pendente) await partidaEncontrada(estado)
    return { rapido: fila.naFila || pendente }
  } catch (e) {
    if (e.estado === 401) { await limparEstado(e.message); return null }
    // Sem rede ou o servidor falhou: mantém o que havia e tenta outra vez já a seguir.
    await guardar({ erro: e.message })
    return { rapido: !!(await ler('fila')).fila?.naFila }
  }
}

/** Pergunta de 3 em 3 segundos enquanto é preciso. Um só ciclo de cada vez. */
async function correrRapido() {
  if (aCorrer) return
  aCorrer = true
  try {
    for (;;) {
      const r = await atualizar()
      if (!r?.rapido) break
      await dormir(RAPIDO_MS)
      // Chamar uma API da extensão volta a contar o tempo de inatividade: o service worker não adormece a meio.
      chrome.runtime.getPlatformInfo(() => {})
    }
  } finally {
    aCorrer = false
  }
}

// ------------------------------------------------------------ partida encontrada

async function garantirOffscreen() {
  const abertos = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
  if (abertos.length) return
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Tocar o aviso sonoro de partida encontrada.',
  })
}

async function configSom() {
  const { som } = await ler('som')
  return { ...SOM_PADRAO, ...som }
}

/** Toca o acorde no documento offscreen. Com o som desligado nas definições da extensão, não toca. */
async function tocarSom(lembrete = false, forcar = false) {
  const { ligado, volume } = await configSom()
  if (!ligado && !forcar) return
  await garantirOffscreen()
  // O documento acabou de abrir: dá-lhe uns instantes a registar o recetor da mensagem.
  for (let i = 0; i < 6; i++) {
    try {
      const r = await chrome.runtime.sendMessage({ para: 'offscreen', tipo: 'tocar', lembrete, volume })
      if (r) return
    } catch { /* ainda não está pronto */ }
    await dormir(120)
  }
}

async function abrirAlerta() {
  const { janelaAlerta } = await ler('janelaAlerta')
  if (janelaAlerta != null) {
    try { await chrome.windows.update(janelaAlerta, { focused: true, drawAttention: true }); return } catch { /* a janela já fechou */ }
  }
  const j = await chrome.windows.create({ url: chrome.runtime.getURL('alerta/alerta.html'), type: 'popup', width: 440, height: 620, focused: true })
  await guardar({ janelaAlerta: j.id })
}

chrome.windows.onRemoved.addListener(async (id) => {
  const { janelaAlerta } = await ler('janelaAlerta')
  if (janelaAlerta === id) await chrome.storage.local.remove('janelaAlerta')
})

/** Uma partida por vez: guardar o id evita avisar duas vezes (o ciclo e o site podem detetá-la ao mesmo tempo). */
async function partidaEncontrada(partida) {
  const { avisada } = await ler('avisada')
  if (avisada === partida.id) return
  await guardar({ avisada: partida.id })
  await tocarSom(false).catch((e) => console.error('som', e))
  chrome.notifications.create('partida', {
    type: 'basic', iconUrl: chrome.runtime.getURL('icones/icone-128.png'), priority: 2, requireInteraction: true,
    title: 'Partida encontrada!', message: 'Abre o Rangify e aceita a partida. Tens 20 segundos.',
  })
  if (Date.now() > siteVisivelAte) await abrirAlerta().catch((e) => console.error('janela', e))
  // Se ainda não aceitaste a meio da contagem, toca o lembrete.
  setTimeout(async () => {
    const { partida: atual } = await ler('partida')
    if (atual?.id === partida.id && atual.estado === 'READY_CHECK' && !atual.euAceitei) tocarSom(true).catch(() => {})
  }, LEMBRETE_MS)
}

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id)
  abrirSite('/jogar')
})

// ------------------------------------------------------------ abrir o site

/** Abre o Rangify: no separador que já o tem aberto, ou num novo. */
async function abrirSite(caminho = '/jogar') {
  const base = CONFIG.siteUrl.replace(/\/+$/, '')
  const url = base + caminho
  const abertos = await chrome.tabs.query({ url: `${base}/*` }).catch(() => [])
  const t = abertos[0]
  if (!t) { await chrome.tabs.create({ url }); return }
  // Já está na página certa: não a recarrega.
  const mesmaPagina = new URL(t.url).pathname.replace(/\/+$/, '') === caminho
  await chrome.tabs.update(t.id, mesmaPagina ? { active: true } : { active: true, url })
  await chrome.windows.update(t.windowId, { focused: true })
}

// ------------------------------------------------------------ pedidos do popup, da janela e do site

async function entrarNaFila() {
  try {
    await api.rpc('entrar_fila')
  } catch (e) {
    // A verificação do Discord vale 30 minutos: se expirou, pergunta outra vez ao bot e tenta de novo (como o site).
    if (!/servidor de Discord/.test(e.message)) throw e
    const r = await api.funcao('verificar-discord', {})
    if (!r?.membro) throw e
    await api.rpc('entrar_fila')
  }
}

async function tratar(m, remetente) {
  switch (m.tipo) {
    case 'atualizar':
      await atualizar({ lento: true })
      correrRapido()
      return { ok: true }
    case 'entrar':
      await entrarNaFila()
      await atualizar()
      correrRapido()
      return { ok: true }
    case 'sair':
      await api.rpc('sair_fila')
      await atualizar()
      return { ok: true }
    case 'discord': {
      // O estado do Discord para a fila e, se pedido, uma verificação nova junto do bot.
      let estado = await api.rpc('discord_fila').catch(() => null)
      if (m.verificar && estado?.obrigatorio) {
        const r = await api.funcao('verificar-discord', {})
        estado = { ...estado, membro: !!r?.membro }
      }
      await guardar({ discord: estado })
      return estado
    }
    case 'login-discord':
      await api.entrarComDiscord()
      await atualizar({ lento: true })
      correrRapido()
      return { ok: true }
    case 'login-password':
      await api.entrarComPassword(String(m.utilizador ?? ''), String(m.password ?? ''))
      await atualizar({ lento: true })
      correrRapido()
      return { ok: true }
    case 'logout': {
      // Primeiro sai da fila (senão ficava lá até o servidor dar pela falta de sinal).
      await api.rpc('sair_fila').catch(() => {})
      await api.terminarSessao()
      await chrome.action.setBadgeText({ text: '' })
      return { ok: true }
    }
    case 'som':
      await guardar({ som: { ...(await configSom()), ...(m.ligado != null ? { ligado: !!m.ligado } : {}), ...(m.volume != null ? { volume: Math.min(100, Math.max(0, Number(m.volume))) } : {}) } })
      return { ok: true }
    case 'testar-som':
      await tocarSom(false, true)
      return { ok: true }
    case 'abrir-site':
      await abrirSite(typeof m.caminho === 'string' && m.caminho.startsWith('/') ? m.caminho : '/jogar')
      return { ok: true }
    case 'ponte-estado': {
      // O site pergunta se pode confiar na extensão para tocar o som (só vale para a mesma conta).
      let { atualizadoEm, perfil, sessao } = await ler('atualizadoEm', 'perfil', 'sessao')
      if (sessao && Date.now() - (atualizadoEm ?? 0) > VIVA_MS) {
        await Promise.race([atualizar(), dormir(2500)])
        ;({ atualizadoEm, perfil } = await ler('atualizadoEm', 'perfil'))
      }
      const viva = !!sessao && !!perfil && perfil.id === m.perfilId && Date.now() - (atualizadoEm ?? 0) < VIVA_MS
      return { viva, som: (await configSom()).ligado }
    }
    case 'ponte-partida':
      // O site viu a partida primeiro (o Realtime é mais rápido que o ciclo): toca já. Com o site à vista, não abre a janela.
      siteVisivelAte = m.visivel ? Date.now() + SITE_VISIVEL_MS : 0
      await atualizar()
      correrRapido()
      return { ok: true }
    default:
      void remetente
      return undefined
  }
}

chrome.runtime.onMessage.addListener((m, remetente, responder) => {
  // Os recados para o documento offscreen não são nossos.
  if (!m || m.para || !m.tipo) return
  tratar(m, remetente).then(responder, (e) => responder({ erro: e instanceof Error ? e.message : String(e) }))
  return true
})

// ------------------------------------------------------------ arranque

function garantirAlarme() {
  chrome.alarms.get(ALARME, (a) => { if (!a) chrome.alarms.create(ALARME, { periodInMinutes: 0.5 }) })
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARME) return
  atualizar({ lento: true }).then((r) => { if (r?.rapido) correrRapido() })
})
chrome.runtime.onInstalled.addListener(() => { garantirAlarme(); atualizar({ lento: true }).then((r) => { if (r?.rapido) correrRapido() }) })
chrome.runtime.onStartup.addListener(() => { garantirAlarme(); atualizar({ lento: true }).then((r) => { if (r?.rapido) correrRapido() }) })
garantirAlarme()
