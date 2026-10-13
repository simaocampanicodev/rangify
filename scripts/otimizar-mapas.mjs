/**
 * Converte a arte dos mapas (public/mapas/*.jpg) em WebP, em dois tamanhos:
 *   public/mapas/<mapa>.webp       960x540, para os ecrãs grandes (bans, código, resultado)
 *   public/mapas/mini/<mapa>.webp   192x108, para as miniaturas (histórico, perfil)
 *
 * Usa o Brave, o Chrome ou o Edge sem janela (o canvas do browser faz a conversão),
 * por isso não precisa de mais nenhuma ferramenta.
 *
 *   node scripts/otimizar-mapas.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const PASTA = join(RAIZ, 'public', 'mapas')
const PORTA = 5179
const PORTA_CDP = 9334
const TAMANHOS = [{ largura: 960, pasta: PASTA, qualidade: 0.74 }, { largura: 192, pasta: join(PASTA, 'mini'), qualidade: 0.78 }]
const BROWSERS = [
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

const servidor = createServer((req, res) => {
  const nome = basename(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  const f = join(PASTA, nome)
  if (!/^[a-z]+\.jpg$/.test(nome) || !existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' })
  res.end(readFileSync(f))
})

async function ligar(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((r, f) => { ws.onopen = r; ws.onerror = f })
  let id = 0
  const pendentes = new Map()
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id) } }
  const enviar = (method, params = {}) => new Promise((r) => { const n = ++id; pendentes.set(n, r); ws.send(JSON.stringify({ id: n, method, params })) })
  return {
    avaliar: async (expression) => {
      const r = await enviar('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'Erro na página')
      return r.result?.result?.value
    },
    fechar: () => ws.close(),
  }
}

const converter = (url, largura, qualidade) => `(async () => {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = ${JSON.stringify(url)}
  await img.decode()
  const altura = Math.round(img.naturalHeight * (${largura} / img.naturalWidth))
  const c = new OffscreenCanvas(${largura}, altura)
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, ${largura}, altura)
  const b = await c.convertToBlob({ type: 'image/webp', quality: ${qualidade} })
  if (b.type !== 'image/webp') throw new Error('Este browser não gera WebP.')
  const bytes = new Uint8Array(await b.arrayBuffer())
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
})()`

const browser = BROWSERS.find((b) => existsSync(b))
if (!browser) { console.error('Não encontrei o Brave, o Chrome nem o Edge.'); process.exit(1) }
for (const t of TAMANHOS) mkdirSync(t.pasta, { recursive: true })

servidor.listen(PORTA, '127.0.0.1', async () => {
  const perfil = mkdtempSync(join(tmpdir(), 'rangify-mapas-'))
  const proc = spawn(browser, ['--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  let c = null
  try {
    let alvo = null
    for (let i = 0; i < 40 && !alvo; i++) {
      await esperar(500)
      try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`)).json()).find((x) => x.type === 'page') } catch { /* a arrancar */ }
    }
    if (!alvo) throw new Error('O browser não arrancou.')
    c = await ligar(alvo.webSocketDebuggerUrl)
    let antes = 0, depois = 0
    for (const f of readdirSync(PASTA).filter((x) => x.endsWith('.jpg'))) {
      antes += statSync(join(PASTA, f)).size
      const linha = [f.padEnd(14)]
      for (const t of TAMANHOS) {
        const b64 = await c.avaliar(converter(`http://127.0.0.1:${PORTA}/${f}`, t.largura, t.qualidade))
        const saida = join(t.pasta, f.replace('.jpg', '.webp'))
        writeFileSync(saida, Buffer.from(b64, 'base64'))
        const kb = statSync(saida).size
        if (t.pasta === PASTA) depois += kb
        linha.push(`${t.largura}px ${(kb / 1024).toFixed(0)} KB`)
      }
      console.log('  ' + linha.join('  '))
    }
    console.log(`Grandes: ${(antes / 1024).toFixed(0)} KB em JPG, ${(depois / 1024).toFixed(0)} KB em WebP.`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  } finally {
    c?.fechar()
    proc.kill()
    await esperar(800)
    try { rmSync(perfil, { recursive: true, force: true }) } catch { /* ainda em uso */ }
    servidor.close()
  }
})
