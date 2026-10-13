/**
 * Grava o vídeo de apresentação (video/video.html) em MP4, com som, em
 * português e em inglês: video/rangify-pt.mp4 e video/rangify-en.mp4.
 *
 * Abre o Brave (ou o Chrome/Edge) sem janela, com a página a 1920x1080, e:
 *   1. tira uma foto da página por fotograma (30 por segundo), com as animações
 *      a avançar exatamente 1/30 s de cada vez (só a página, nunca o ecrã);
 *   2. a própria página junta as fotos e o som (sintetizado com a Web Audio API)
 *      num MP4 H.264 + AAC, com a biblioteca mp4-muxer, e envia-o para aqui.
 *
 *   node scripts/gravar-video.mjs          (as duas línguas)
 *   node scripts/gravar-video.mjs en       (só uma)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const PORTA = 5178
const PORTA_CDP = 9333
const LINGUAS = process.argv[2] ? [process.argv[2]] : ['pt', 'en']
const BROWSERS = [
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const TIPOS = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.js': 'text/javascript', '.mjs': 'text/javascript' }

let pastaQuadros = null

const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (req.method === 'POST' && url.pathname === '/guardar') {
    const nome = url.searchParams.get('nome') ?? ''
    if (!/^rangify-(pt|en)\.mp4$/.test(nome)) { res.writeHead(400); return res.end() }
    const partes = []
    req.on('data', (c) => partes.push(c))
    req.on('end', () => {
      writeFileSync(join(RAIZ, 'video', nome), Buffer.concat(partes))
      res.writeHead(200); res.end('ok')
    })
    return
  }
  const quadro = url.pathname.match(/^\/quadros\/(\d+)\.jpg$/)
  const caminho = quadro && pastaQuadros
    ? join(pastaQuadros, `${quadro[1]}.jpg`)
    : normalize(join(RAIZ, decodeURIComponent(url.pathname)))
  if ((!quadro && !caminho.startsWith(RAIZ)) || !existsSync(caminho)) { res.writeHead(404); return res.end() }
  try {
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' })
    res.end(readFileSync(caminho))
  } catch { res.writeHead(404); res.end() }
})

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function ligar(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, f) => { ws.onopen = r; ws.onerror = f })
  let id = 0
  const pendentes = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id) }
  }
  const enviar = (method, params = {}) => new Promise((r) => { const n = ++id; pendentes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  const avaliar = async (expression) => {
    const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'Erro na página')
    return r.result?.result?.value
  }
  const abrir = async (url) => {
    await enviar('Page.navigate', { url })
    for (let i = 0; i < 100; i++) {
      await esperar(200)
      const pronto = await avaliar('document.readyState === "complete" && typeof window.iniciarQuadros === "function"').catch(() => false)
      if (pronto) return
    }
    throw new Error('A página não carregou.')
  }
  return { enviar, avaliar, abrir, fechar: () => ws.close() }
}

async function gravar(c, lingua) {
  const base = `http://127.0.0.1:${PORTA}/video/video.html?lingua=${lingua}`
  pastaQuadros = mkdtempSync(join(tmpdir(), 'rangify-quadros-'))
  try {
    await c.abrir(`${base}&modo=quadros`)
    const total = await c.avaliar('window.iniciarQuadros()')
    const inicio = Date.now()
    for (let i = 0; i < total; i++) {
      await c.avaliar(`window.quadro(${i})`)
      const s = await c.enviar('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } })
      writeFileSync(join(pastaQuadros, `${i}.jpg`), Buffer.from(s.result.data, 'base64'))
      if (i % 150 === 0) console.log(`  fotograma ${i} de ${total} (${Math.round((Date.now() - inicio) / 1000)} s)`)
    }
    console.log('  a codificar o MP4…')
    await c.abrir(`${base}&modo=codificar`)
    const r = await c.avaliar(`window.codificar(${total})`)
    console.log(`  video/rangify-${lingua}.mp4: ${r}`)
  } finally {
    rmSync(pastaQuadros, { recursive: true, force: true })
    pastaQuadros = null
  }
}

const browser = BROWSERS.find((b) => existsSync(b))
if (!browser) { console.error('Não encontrei o Brave, o Chrome nem o Edge.'); process.exit(1) }
mkdirSync(join(RAIZ, 'video'), { recursive: true })

servidor.listen(PORTA, '127.0.0.1', async () => {
  const perfil = mkdtempSync(join(tmpdir(), 'rangify-browser-'))
  const proc = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`,
    '--window-size=1920,1080', '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' })
  let c = null
  try {
    let alvo = null
    for (let i = 0; i < 40 && !alvo; i++) {
      await esperar(500)
      try {
        const lista = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`)).json()
        alvo = lista.find((x) => x.type === 'page')
      } catch { /* ainda a arrancar */ }
    }
    if (!alvo) throw new Error('O browser não arrancou.')
    c = await ligar(alvo.webSocketDebuggerUrl)
    await c.enviar('Page.enable')
    // A página tem sempre 1920x1080, seja qual for o ecrã deste computador.
    await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
    for (const l of LINGUAS) { console.log(`Vídeo em ${l}:`); await gravar(c, l) }
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    c?.fechar()
    proc.kill()
    await esperar(1000)
    try { rmSync(perfil, { recursive: true, force: true }) } catch { /* o browser ainda o tem aberto */ }
    servidor.close()
  }
})
