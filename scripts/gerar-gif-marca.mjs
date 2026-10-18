/**
 * Gera o GIF animado da marca (public/divulgar/rangify-canto.gif): o raio do Rangify, "Joga ranked no Rangify" e o
 * endereço do site, num cartão com fundo transparente para pôr num cantinho da live. É a página /marca do próprio
 * site, fotografada quadro a quadro (as animações andam de 4,8 em 4,8 s, por isso o GIF fecha o ciclo sem saltos).
 *
 *   npm run gif-marca -- rangify.onrender.com            (precisa do site a correr: npm run dev)
 *   npm run gif-marca -- rangify.onrender.com --cor azul --base http://localhost:5175
 *
 * Precisa do Playwright (npm i -D playwright) e do Python com o Pillow (pip install pillow). Só se corre quando o endereço do site muda.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const argumentos = process.argv.slice(2)
const valor = (nome, padrao) => { const i = argumentos.indexOf(`--${nome}`); return i >= 0 ? argumentos[i + 1] : padrao }
const host = argumentos.find((a, i) => !a.startsWith('--') && !argumentos[i - 1]?.startsWith('--'))
if (!host) {
  console.error('\nDiz-me o endereço do site: npm run gif-marca -- rangify.onrender.com\n')
  process.exit(1)
}
const base = valor('base', 'http://localhost:5175')
const cor = valor('cor', 'laranja')
const caminho = valor('saida', fileURLToPath(new URL('../public/divulgar/rangify-canto.gif', import.meta.url)))
const FPS = 15
const CICLO_MS = 4800
const ESCALA = 2

let playwright
try {
  playwright = await import('playwright')
} catch {
  try {
    // Instalado fora do projeto: procura também nas pastas do NODE_PATH.
    const { createRequire } = await import('node:module')
    playwright = createRequire(import.meta.url)(createRequire(import.meta.url).resolve('playwright', { paths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean) }))
  } catch {
    console.error('\nFalta o Playwright: npm i -D playwright (e npx playwright install chromium).\n')
    process.exit(1)
  }
}

const pasta = mkdtempSync(`${tmpdir()}/rangify-gif-`)
mkdirSync(new URL('../public/divulgar/', import.meta.url), { recursive: true })
const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
try {
  const page = await (await browser.newContext({ viewport: { width: 520, height: 220 }, deviceScaleFactor: ESCALA })).newPage()
  await page.goto(`${base}/marca?host=${encodeURIComponent(host)}&cor=${cor}&sombra=0`)
  const cartao = page.locator('[data-marca]')
  await cartao.waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
  const quadros = Math.round((CICLO_MS / 1000) * FPS)
  for (let i = 0; i < quadros; i++) {
    const t = (i * CICLO_MS) / quadros
    await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.currentTime = ms }), t)
    await cartao.screenshot({ path: `${pasta}/q${String(i).padStart(3, '0')}.png`, omitBackground: true })
  }
  // Os quadros viram o GIF com o Pillow (o ffmpeg deixa cair quadros com transparência): cada quadro com a sua
  // paleta e o fundo transparente. Duração fixa por quadro, em loop.
  const juntar = [
    'import glob, sys',
    'from PIL import Image',
    'ims = [Image.open(f).convert("RGBA") for f in sorted(glob.glob(sys.argv[1] + "/q*.png"))]',
    'ims[0].save(sys.argv[2], save_all=True, append_images=ims[1:], duration=int(sys.argv[3]), loop=0, disposal=2, optimize=False)',
  ].join('\n')
  const argumentosPython = ['-c', juntar, pasta, caminho, String(Math.round(1000 / FPS))]
  try { execFileSync('python3', argumentosPython) } catch { execFileSync('python', argumentosPython) }
  console.log(`GIF pronto: ${caminho} (${Math.round(statSync(caminho).size / 1024)} KB, ${quadros} quadros, ${host})`)
} finally {
  await browser.close()
  rmSync(pasta, { recursive: true, force: true })
}
