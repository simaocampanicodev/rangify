// O "motor" da extensão. Enquanto a pessoa está na fila (ou com uma partida a decidir-se), o Rangify avisa-a por
// Realtime quando algo muda, como faz ao site: a extensão não pergunta de poucos em poucos segundos. Só dá o sinal de
// vida da fila e, quando a partida é encontrada, toca o som, mostra uma notificação e abre a janela de alerta.
// Fora da fila só pergunta uma vez por minuto (um alarme).
import { CONFIG } from './config.js'
import * as api from './lib/api.js'
import { criarTempoReal } from './lib/tempo-real.js'

const ALARME = 'tick'
/** Com o Realtime ligado, só confirma de vez em quando (é a reserva, se um aviso se perder). */
const RESERVA_VIVO_MS = 20_000
/** Sem Realtime (rede, bloqueio), pergunta mais depressa para a extensão não ficar cega. */
const RESERVA_SEM_TEMPO_REAL_MS = 5000
/** Com um ready check por responder, mostra quantos já aceitaram. */
const RESERVA_READY_MS = 4000
/** Vários avisos seguidos (dez pessoas a entrar) viram uma só pergunta. */
const JUNTAR_AVISOS_MS = 400
/** O servidor tira da fila quem passa 3 minutos sem sinal; o site dá-o de 30 em 30 s. */
const BATIMENTO_MS = 30_000
/** Se há quem esteja a ver o site, a janela de alerta não abre por cima dele. */
const SITE_VISIVEL_MS = 25_000
/** Quanto tempo depois de aparecer a partida toca o lembrete (o ready check tem 20 s). */
const LEMBRETE_MS = 12_000
/** A extensão só se diz "viva" ao site se falou com o servidor há menos disto. */
const VIVA_MS = 90_000
/** O relógio do servidor só se guarda de novo se mudar mais do que isto (senão cada resposta mexia no storage). */
const TOLERANCIA_DESVIO_MS = 1500
const SOM_PADRAO = { ligado: true, volume: 70 }

let aCorrer = false
let ultimoBatimento = 0
let ultimaEscrita = 0
let siteVisivelAte = 0
let temporizadorAvisos = null

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

/**
 * Guarda só o que mudou. Cada escrita no storage acorda o popup e a janela de alerta, por isso uma resposta igual
 * à anterior não pode escrever nada (era isto que fazia tudo piscar e "lagar").
 */
const memoria = {}
async function guardarMudancas(novo) {
  const mudou = {}
  for (const [k, v] of Object.entries(novo)) {
    const j = JSON.stringify(v ?? null)
    if (memoria[k] === j) continue
    memoria[k] = j
    mudou[k] = v ?? null
  }
  if (Object.keys(mudou).length) await guardar(mudou)
}

/** A diferença para o relógio do servidor: só muda no storage se andar mais do que a tolerância (varia uns ms a cada resposta). */
function desvioEstavel(fila) {
  const novo = fila.agora ? Date.parse(fila.agora) - Date.now() : 0
  const antes = memoria.desvio == null ? null : JSON.parse(memoria.desvio)
  return antes != null && Math.abs(novo - antes) < TOLERANCIA_DESVIO_MS ? antes : novo
}

async function limparEstado(erro = null) {
  tempoReal?.desligar()
  for (const k of ['perfil', 'fila', 'partida', 'discord', 'atualizadoEm', 'desvio']) delete memoria[k]
  await chrome.storage.local.remove(['perfil', 'fila', 'partida', 'discord', 'atualizadoEm', 'desvio'])
  await guardarMudancas({ erro })
  await chrome.action.setBadgeText({ text: '' })
}

let ultimoBadge = ''
async function pintarBadge(fila, partida) {
  const pendente = partida?.estado === 'READY_CHECK' && partida.participo && !partida.euAceitei
  const texto = pendente ? '!' : partida ? '▶' : fila?.naFila ? String(Math.min(10, fila.contagem)) : ''
  if (texto === ultimoBadge) return
  ultimoBadge = texto
  await chrome.action.setBadgeText({ text: texto })
  await chrome.action.setBadgeBackgroundColor({ color: pendente ? '#ff5b1f' : '#3a3a40' })
  try { await chrome.action.setBadgeTextColor({ color: pendente ? '#170802' : '#f3f0eb' }) } catch { /* versões antigas */ }
}

// ------------------------------------------------------------ tempo real

let tempoReal = null

/**
 * O Realtime só está ligado enquanto interessa: na fila, ou com um ready check por decidir. Fora disso não há
 * ligação nenhuma (e a extensão só pergunta uma vez por minuto).
 */
async function ajustarEscuta(perfil, fila, partida) {
  const { sessao } = await ler('sessao')
  const precisa = !!sessao && !!perfil && (fila?.naFila || partida?.estado === 'READY_CHECK')
  if (!precisa) { tempoReal?.desligar(); return }
  tempoReal ??= criarTempoReal({ url: CONFIG.supabaseUrl, chave: CONFIG.supabaseKey, aoMudar: aoMudarTempoReal, aoEstado: () => {} })
  tempoReal.ligar({ perfilId: perfil.id, partidaId: partida?.estado === 'READY_CHECK' ? partida.id : null, accessToken: sessao.accessToken })
}

const tabelasPorTratar = new Set()

/** O servidor avisou que algo mudou. Vários avisos seguidos (dez pessoas a entrar) juntam-se numa só pergunta. */
function aoMudarTempoReal(tabela) {
  tabelasPorTratar.add(tabela)
  clearTimeout(temporizadorAvisos)
  temporizadorAvisos = setTimeout(async () => {
    const tabelas = new Set(tabelasPorTratar)
    tabelasPorTratar.clear()
    // Só alguém a entrar ou sair da fila: basta a contagem. Uma partida a mexer-se pede o estado todo.
    if (tabelas.has('match_players') || tabelas.has('matches')) manter(await atualizar())
    else atualizarSoFila()
  }, JUNTAR_AVISOS_MS)
}

/** A contagem e o meu lugar na fila, sem avançar partidas nem trazer jogadores (uma chamada pequena). */
async function atualizarSoFila() {
  const { sessao, fila: antes } = await ler('sessao', 'fila')
  if (!sessao) return
  try {
    const fila = await api.rpc('estado_fila')
    // Saí da fila (ou entrei numa partida): isso já é assunto para o estado completo.
    if (!!antes?.naFila !== !!fila.naFila) { manter(await atualizar()); return }
    await guardarMudancas({ fila, desvio: desvioEstavel(fila), erro: null })
    await pintarBadge(fila, (await ler('partida')).partida)
  } catch (e) {
    if (e.estado === 401) await limparEstado(e.message)
  }
}

// ------------------------------------------------------------ atualizar

/**
 * Pergunta o estado ao Rangify e guarda-o. Devolve { rapido, pendente } (vale a pena ir confirmando: na fila, ou com um
 * ready check a decidir-se; pendente é "ainda não aceitaste"), ou null se não há sessão.
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
    await guardarMudancas({ perfil, fila, partida: estado, desvio: desvioEstavel(fila), erro: null })
    // Para o site saber que a extensão está viva; não acorda ninguém porque o popup ignora esta chave.
    if (Date.now() - ultimaEscrita > 10_000) { ultimaEscrita = Date.now(); await guardar({ atualizadoEm: ultimaEscrita }) }
    await pintarBadge(fila, estado)

    if (fila.naFila && Date.now() - ultimoBatimento >= BATIMENTO_MS) {
      ultimoBatimento = Date.now()
      api.rpc('fila_batimento').catch(() => {})
    }
    const pendente = estado?.estado === 'READY_CHECK' && estado.participo && !estado.euAceitei && !estado.automatica
    if (pendente) await partidaEncontrada(estado)
    await ajustarEscuta(perfil, fila, estado)
    return { rapido: !!fila.naFila || estado?.estado === 'READY_CHECK', pendente }
  } catch (e) {
    if (e.estado === 401) { await limparEstado(e.message); return null }
    // Sem rede ou o servidor falhou: mantém o que havia e tenta outra vez daqui a pouco.
    await guardarMudancas({ erro: e.message })
    return { rapido: !!(await ler('fila')).fila?.naFila, pendente: false }
  }
}

/**
 * A reserva: enquanto estás na fila, confirma de vez em quando (20 s com o Realtime ligado, 5 s sem ele, 4 s com um ready check
 * por aceitar), para o caso de um aviso se perder. Chamar uma API da extensão também impede o service worker de adormecer.
 */
async function manter(primeiro) {
  if (aCorrer) return
  aCorrer = true
  try {
    let r = primeiro
    for (;;) {
      r = r === undefined ? await atualizar() : r
      if (!r?.rapido) break
      const ms = r.pendente ? RESERVA_READY_MS : tempoReal?.estaVivo() ? RESERVA_VIVO_MS : RESERVA_SEM_TEMPO_REAL_MS
      r = undefined
      await dormir(ms)
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
  const j = await chrome.windows.create({ url: chrome.runtime.getURL('alert/alert.html'), type: 'popup', width: 440, height: 620, focused: true })
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
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon-128.png'), priority: 2, requireInteraction: true,
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
      manter(await atualizar({ lento: true }))
      return { ok: true }
    case 'entrar':
      await entrarNaFila()
      manter(await atualizar())
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
      manter(await atualizar({ lento: true }))
      return { ok: true }
    case 'login-password':
      await api.entrarComPassword(String(m.utilizador ?? ''), String(m.password ?? ''))
      manter(await atualizar({ lento: true }))
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
    case 'ponte-fila':
      // O site viu a pessoa entrar ou sair da fila: a extensão começa (ou deixa) de a acompanhar já, sem esperar pelo alarme.
      manter(await atualizar())
      return { ok: true }
    case 'ponte-partida':
      // O site viu a partida primeiro (o Realtime é mais rápido que o ciclo): toca já. Com o site à vista, não abre a janela.
      siteVisivelAte = m.visivel ? Date.now() + SITE_VISIVEL_MS : 0
      manter(await atualizar())
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

/** Fora da fila, a extensão só pergunta uma vez por minuto (versões antigas perguntavam de 30 em 30 s). */
function garantirAlarme() {
  chrome.alarms.get(ALARME, (a) => { if (!a || a.periodInMinutes !== 1) chrome.alarms.create(ALARME, { periodInMinutes: 1 }) })
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARME) return
  atualizar({ lento: true }).then((r) => { if (r?.rapido) manter(r) })
})
chrome.runtime.onInstalled.addListener(() => { garantirAlarme(); atualizar({ lento: true }).then((r) => { if (r?.rapido) manter(r) }) })
chrome.runtime.onStartup.addListener(() => { garantirAlarme(); atualizar({ lento: true }).then((r) => { if (r?.rapido) manter(r) }) })
garantirAlarme()
