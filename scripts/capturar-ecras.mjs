/**
 * Gera as imagens do README em assets/readme/: o banner e as capturas de ecrã do site (modo demo, com dados de
 * exemplo: nunca mostra contas nem dados reais).
 *
 * Arranca o servidor de desenvolvimento SEM as variáveis do Supabase (por isso é sempre o modo demo) e abre o Brave,
 * o Chrome ou o Edge sem janela, a 1440x900, pelo protocolo de depuração (CDP). Só a página é fotografada.
 *
 *   node scripts/capturar-ecras.mjs               (o banner e todas as capturas)
 *   node scripts/capturar-ecras.mjs banner        (só o banner)
 *   node scripts/capturar-ecras.mjs painel jogar  (só essas)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const SAIDA = join(RAIZ, 'assets', 'readme')
const PORTA = 5180
const PORTA_CDP = 9335
const SITE = `http://127.0.0.1:${PORTA}`
const BROWSERS = [
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const pedidas = process.argv.slice(2)
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function ligar(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, f) => { ws.onopen = r; ws.onerror = f })
  let id = 0
  const pendentes = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id) } }
  const enviar = (method, params = {}) => new Promise((r) => { const n = ++id; pendentes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  const c = {
    enviar,
    async avaliar(expression) {
      const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'Erro na página')
      return r.result?.result?.value
    },
    async ir(url, depois = 2200) {
      await enviar('Page.navigate', { url })
      await esperar(depois)
    },
    async ecra(largura, altura, movel = false) {
      await enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: movel ? 2 : 1, mobile: movel })
      if (movel) await enviar('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' })
    },
    async foto(ficheiro, { formato = 'webp', qualidade = 86 } = {}) {
      const r = await enviar('Page.captureScreenshot', { format: formato, quality: formato === 'png' ? undefined : qualidade, captureBeyondViewport: false })
      writeFileSync(join(SAIDA, ficheiro), Buffer.from(r.result.data, 'base64'))
      console.log('  ' + ficheiro)
    },
    /** Clica no primeiro botão ou ligação cujo texto bate. */
    clicar: (re, raiz = 'document') => c.avaliar(`(() => { const e = [...${raiz}.querySelectorAll('button, a, [role=radio]')].find((x) => ${re}.test(x.textContent.trim())); if (!e) return false; e.click(); return true })()`),
    async ate(condicao, ms = 20000) {
      const fim = Date.now() + ms
      while (Date.now() < fim) { if (await c.avaliar(condicao)) return true; await esperar(300) }
      throw new Error('Esperei por: ' + condicao)
    },
    async rato(x, y) { await enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }) },
    async rolar(y) { await c.avaliar(`window.scrollTo(0, ${y})`); await esperar(500) },
    fechar: () => ws.close(),
  }
  await enviar('Page.enable')
  await enviar('Runtime.enable')
  return c
}

/** Entra na conta de exemplo (Owner, com histórico). */
async function entrar(c) {
  await c.ir(`${SITE}/entrar`, 1500)
  await c.ate(`!!document.querySelector('button')`)
  await c.clicar(/Entrar como/)
  await esperar(1800)
}

/** O estado da demo vive no localStorage: lê-o, muda-o e recarrega a página. */
async function mexerNoEstado(c, corpo) {
  await c.avaliar(`(() => { const chave = Object.keys(localStorage).find((k) => k.startsWith('rangify:demo')); const s = JSON.parse(localStorage.getItem(chave)); ${corpo}; localStorage.setItem(chave, JSON.stringify(s)) })()`)
}

const e = (nome) => pedidas.length === 0 || pedidas.includes(nome)
const tarefas = {
  async banner(c) {
    await c.ecra(1600, 520)
    await c.ir(`${SITE}/assets/readme/banner.html`, 1800)
    await c.foto('banner.png', { formato: 'png' })
  },

  async paginas(c) {
    await c.ecra(1440, 900)
    await entrar(c)
    for (const [nome, rota, depois] of [['painel', '/', 2800], ['jogar', '/jogar', 2800], ['tabela', '/ranking', 2800], ['perfil', '/perfil', 2800], ['missoes', '/missoes', 2600], ['partidas', '/partidas', 2800], ['torneios', '/torneios', 2600]]) {
      if (!e(nome)) continue
      await c.ir(SITE + rota, depois)
      await c.foto(`${nome}.webp`)
    }
    if (e('partida')) {
      await c.ir(`${SITE}/partidas`, 2800)
      await c.avaliar(`document.querySelector('main button.linha-hover').click()`)
      await esperar(1800)
      await c.foto('partida.webp')
    }
    if (e('staff')) {
      await c.ir(`${SITE}/admin`, 2600)
      await c.clicar(/^Ao vivo$/, 'document.querySelector("main")')
      await esperar(1200)
      await c.foto('staff.webp')
    }
    if (e('avisos')) {
      await c.ir(`${SITE}/admin`, 2600)
      await c.clicar(/^Discord$/, 'document.querySelector("main")')
      await esperar(1000)
      await c.avaliar(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        const t = document.getElementById('rg-anuncio-texto')
        set.call(t, '# Novidades da semana\\n\\nA **fila ranked** já está aberta para Ascendente 1 ou mais, com a *Tabela Ranked* à parte.\\n\\n- Pontos separados por fila\\n- Draft A, B, B, A, A, B, B, A\\n\\n-# Boas partidas!')
        t.dispatchEvent(new Event('input', { bubbles: true }))
        t.scrollIntoView({ block: 'start' })
      })()`)
      await esperar(900)
      await c.foto('discord-avisos.webp')
    }
  },

  /** O fluxo de uma partida a sério: draft e bans de mapas (jogados no ecrã), depois o resultado. */
  async partida(c) {
    await c.ecra(1440, 900)
    await entrar(c)
    await c.ir(`${SITE}/jogar`, 2200)
    await c.avaliar(`[...document.querySelectorAll('button')].find((b) => /Simular fila cheia/.test(b.textContent)).click()`)
    await c.ate(`[...document.querySelectorAll('button')].some((b) => /Aceitar/i.test(b.textContent))`)
    await esperar(600)
    await c.clicar(/aceitar/i)
    await c.ate(`document.querySelectorAll('[data-assinatura]').length > 0`, 30000)
    await c.ate(`[...document.querySelectorAll('[data-assinatura]')].some((b) => !b.disabled)`, 30000)
    await esperar(1500)
    if (e('draft')) await c.foto('draft.webp')
    // Escolhe jogadores quando é a vez de quem joga (os bots escolhem pela outra equipa).
    const fim = Date.now() + 90000
    while (Date.now() < fim && await c.avaliar(`document.querySelectorAll('[data-assinatura]').length > 0`)) {
      await c.avaliar(`(() => { const b = [...document.querySelectorAll('[data-assinatura]')].find((x) => !x.disabled); if (b) b.click() })()`)
      await esperar(1300)
    }
    await c.ate(`!!document.querySelector('.ban-livre, .ban-decisivo, [class*=ban-]')`, 30000)
    await esperar(2200)
    if (e('bans')) {
      // O rato sobre um mapa: o cartão alarga e mostra o botão BANIR.
      const pos = await c.avaliar(`(() => { const m = [...document.querySelectorAll('.ban-livre')]; const x = m[Math.min(6, m.length - 1)]; if (!x) return null; const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
      if (pos) { await c.rato(pos.x, pos.y); await esperar(900) }
      await c.foto('bans.webp')
    }
    if (e('resultado')) {
      await mexerNoEstado(c, `
        const p = s.partidas.find((x) => x.estado === 'MAP_BAN' || x.estado === 'DRAFT_PHASE')
        let n = 0
        p.jogadores.forEach((j) => { if (!j.equipa) j.equipa = n++ % 2 ? 'B' : 'A' })
        p.mapa = 'Lotus'; p.estado = 'RESULT_SUBMISSION'
        p.comecouEm = new Date(Date.now() - 24 * 60000).toISOString()
        p.codigoGrupo = 'RGN4X7'
        p.prazoFase = new Date(Date.now() + 60 * 60000).toISOString(); p.inicioFase = new Date().toISOString()
        s.motores = s.motores || {}; s.motores[p.id] = { aceitaEm: {}, jogadaEm: null, resultado: null }`)
      await c.ir(`${SITE}/jogar`, 3200)
      await c.avaliar(`document.querySelector('[role=radio]')?.click()`)
      await esperar(900)
      await c.foto('resultado.webp')
    }
  },

  /** O telemóvel: o mesmo site, a 390 px. */
  async movel(c) {
    await c.ecra(390, 844, true)
    await entrar(c)
    for (const [nome, rota] of [['movel-painel', '/'], ['movel-jogar', '/jogar'], ['movel-tabela', '/ranking']]) {
      if (!e(nome) && !e('movel')) continue
      await c.ir(SITE + rota, 3000)
      await c.foto(`${nome}.webp`, { qualidade: 84 })
    }
  },
}

// ---------------------------------------------------------------- arranque
mkdirSync(SAIDA, { recursive: true })
const browser = BROWSERS.find((b) => existsSync(b))
if (!browser) { console.error('Não encontrei o Brave, o Chrome nem o Edge.'); process.exit(1) }

const vite = spawn(process.execPath, [join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(PORTA), '--host', '127.0.0.1', '--strictPort'], {
  cwd: RAIZ, stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
})
const perfil = mkdtempSync(join(tmpdir(), 'rangify-capturas-'))
const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' })
let c = null
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(SITE)).ok) break } catch { /* a arrancar */ } await esperar(500) }
  let alvo = null
  for (let i = 0; i < 40 && !alvo; i++) {
    await esperar(500)
    try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`)).json()).find((x) => x.type === 'page') } catch { /* a arrancar */ }
  }
  if (!alvo) throw new Error('O browser não arrancou.')
  c = await ligar(alvo.webSocketDebuggerUrl)

  const todas = pedidas.length === 0
  const quer = (...nomes) => todas || nomes.some((n) => pedidas.includes(n))
  if (quer('banner')) { console.log('Banner'); await tarefas.banner(c) }
  if (quer('painel', 'jogar', 'tabela', 'perfil', 'missoes', 'partidas', 'torneios', 'partida', 'staff', 'avisos')) { console.log('Páginas'); await tarefas.paginas(c) }
  if (quer('draft', 'bans', 'resultado')) { console.log('Partida'); await tarefas.partida(c) }
  if (quer('movel', 'movel-painel', 'movel-jogar', 'movel-tabela')) { console.log('Telemóvel'); await tarefas.movel(c) }
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  c?.fechar()
  proc.kill()
  vite.kill()
  await esperar(800)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* ainda em uso */ }
}
