/**
 * Prepara a extensão do browser (pasta extension/) para o Chrome, Edge ou Brave.
 * Gera extension/dist com a ligação ao teu Rangify:
 *   - o URL do Supabase e a chave pública, lidos do .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY);
 *   - o endereço do site, para a extensão abrir o Rangify e o site saber que ela está instalada;
 *   - as permissões do manifesto só para esses endereços;
 *   - o supabase-js empacotado no service worker (o Realtime que avisa quando a fila muda).
 *
 *   npm run extension -- https://o-teu-site.onrender.com
 *   npm run extension -- --dev                              (o site em http://localhost:5175)
 *   npm run extension -- https://o-teu-site.onrender.com --zip   (também o .zip para as lojas, ver docs/extension-publishing.md)
 *
 * Para uso teu: carrega extension/dist no browser. Para toda a gente: publica o .zip na Chrome Web Store e no
 * Edge Add-ons, uma vez; ninguém mais corre comandos.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const origem = `${raiz}extension`
const destino = `${origem}/dist`

/** Lê um .env simples (CHAVE=valor), sem dependências. */
function lerEnv() {
  const caminho = `${raiz}.env`
  const env = {}
  if (!existsSync(caminho)) return env
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const argumentos = process.argv.slice(2)
const dev = argumentos.includes('--dev')
const zip = argumentos.includes('--zip')
const env = { ...lerEnv(), ...process.env }
const siteArg = argumentos.find((a) => !a.startsWith('--')) ?? env.SITE_URL ?? (dev ? 'http://localhost:5175' : '')
const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? ''

function parar(mensagem) {
  console.error(`\n${mensagem}\n`)
  process.exit(1)
}

if (!siteArg) parar('Diz-me onde está o site: npm run extension -- https://o-teu-site.onrender.com (ou --dev para o localhost:5175).')
if (!supabaseUrl || !supabaseKey) parar('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env: a extensão só funciona com o Supabase ligado (o modo demo vive no browser do site).')

/**
 * O endereço do site como o browser o entende. Sem "https://" (por exemplo "rangify.onrender.com") acrescenta-o;
 * "localhost" e os endereços de rede local usam "http://". Um "localhost:5175" sem esquema seria lido como
 * esquema "localhost:" e deixava o manifesto inválido ("Missing scheme separator").
 */
function origemDoSite(texto) {
  const t = texto.trim()
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `${/^(localhost|127\.|192\.168\.|10\.)/i.test(t) ? 'http' : 'https'}://${t}`
  try {
    const u = new URL(comEsquema)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.origin
  } catch {
    return null
  }
}

const siteOrigem = origemDoSite(siteArg)
if (!siteOrigem) parar(`"${siteArg}" não é um endereço de site válido. Usa algo como https://o-teu-site.onrender.com`)
if (zip && /^http:\/\/(localhost|127\.)/.test(siteOrigem)) parar('O .zip para as lojas tem de apontar para o site a sério (https://...), não para o localhost.')

const origens = [siteOrigem, ...(dev && siteOrigem !== 'http://localhost:5175' ? ['http://localhost:5175'] : [])]

rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })
for (const item of ['service-worker.js', 'estilo.css', 'lib', 'popup', 'alert', 'offscreen', 'content', 'icons']) {
  cpSync(`${origem}/${item}`, `${destino}/${item}`, { recursive: true })
}

// O guia da extensão vai dentro da pasta, para quem a carrega à mão.
cpSync(`${raiz}docs/extension.md`, `${destino}/README.md`)

writeFileSync(`${destino}/config.js`, `// Gerado por scripts/montar-extensao.mjs: não edites à mão.
export const CONFIG = ${JSON.stringify({ siteUrl: siteOrigem, supabaseUrl, supabaseKey }, null, 2)}
`)

// O Realtime: o supabase-js vai dentro de lib/tempo-real.js (o browser não resolve "@supabase/supabase-js" sozinho).
let esbuild
try { esbuild = await import('esbuild') } catch { parar('Falta o esbuild: corre "npm install" na pasta do projeto e tenta outra vez.') }
await esbuild.build({
  entryPoints: [`${origem}/lib/tempo-real.js`],
  outfile: `${destino}/lib/tempo-real.js`,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

const manifesto = JSON.parse(readFileSync(`${origem}/manifest.json`, 'utf8'))
manifesto.host_permissions = [`${supabaseUrl}/*`, ...origens.map((o) => `${o}/*`)]
// O Realtime abre uma ligação WebSocket ao mesmo Supabase (wss://), que a permissão do https:// cobre.
manifesto.content_scripts[0].matches = origens.map((o) => `${o}/*`)
writeFileSync(`${destino}/manifest.json`, JSON.stringify(manifesto, null, 2) + '\n')

// O ID da extensão vem da chave pública do manifesto: o mesmo em qualquer computador.
const id = [...createHash('sha256').update(Buffer.from(manifesto.key, 'base64')).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')

// ---------------------------------------------------------------- o .zip das lojas

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(dados) {
  let c = 0xffffffff
  for (const b of dados) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Todos os ficheiros de uma pasta, com caminhos relativos e "/" (é o que o zip e as lojas esperam). */
function ficheiros(pasta, prefixo = '') {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = `${pasta}/${nome}`
    return statSync(caminho).isDirectory() ? ficheiros(caminho, `${prefixo}${nome}/`) : [{ nome: `${prefixo}${nome}`, caminho }]
  })
}

/** Um zip simples (deflate), sem dependências. */
function criarZip(lista) {
  const partes = []
  const central = []
  let posicao = 0
  for (const f of lista) {
    const nome = Buffer.from(f.nome, 'utf8')
    const comprimido = deflateRawSync(f.dados)
    const crc = crc32(f.dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8)
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18); local.writeUInt32LE(f.dados.length, 22); local.writeUInt16LE(nome.length, 26); local.writeUInt16LE(0, 28)
    partes.push(local, nome, comprimido)
    const entrada = Buffer.alloc(46)
    entrada.writeUInt32LE(0x02014b50, 0); entrada.writeUInt16LE(20, 4); entrada.writeUInt16LE(20, 6); entrada.writeUInt16LE(0x0800, 8)
    entrada.writeUInt16LE(8, 10); entrada.writeUInt16LE(0, 12); entrada.writeUInt16LE(0x21, 14); entrada.writeUInt32LE(crc, 16)
    entrada.writeUInt32LE(comprimido.length, 20); entrada.writeUInt32LE(f.dados.length, 24); entrada.writeUInt16LE(nome.length, 28)
    entrada.writeUInt32LE(posicao, 42)
    central.push(entrada, nome)
    posicao += 30 + nome.length + comprimido.length
  }
  const tamanhoCentral = central.reduce((t, b) => t + b.length, 0)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(lista.length, 8); fim.writeUInt16LE(lista.length, 10)
  fim.writeUInt32LE(tamanhoCentral, 12); fim.writeUInt32LE(posicao, 16)
  return Buffer.concat([...partes, ...central, fim])
}

let caminhoZip = null
if (zip) {
  // A loja atribui o ID da extensão: o manifesto que vai para lá não leva a "key" de desenvolvimento.
  const { key: _key, ...paraLoja } = manifesto
  const lista = ficheiros(destino)
    .filter((f) => f.nome !== 'manifest.json' && f.nome !== 'README.md')
    .map((f) => ({ nome: f.nome, dados: readFileSync(f.caminho) }))
  lista.push({ nome: 'manifest.json', dados: Buffer.from(JSON.stringify(paraLoja, null, 2) + '\n') })
  caminhoZip = `${origem}/rangify-extension-${manifesto.version}.zip`
  writeFileSync(caminhoZip, criarZip(lista))
}

console.log(`
Extensão pronta em extension/dist (versão ${manifesto.version})
  site:      ${origens.join(', ')}
  Supabase:  ${supabaseUrl}
${caminhoZip ? `  para as lojas: ${caminhoZip.replace(raiz, '')}  (passo a passo em docs/extension-publishing.md)\n` : ''}
Para usares já, no teu browser:
1. Abre chrome://extensions (ou edge://extensions), liga o "Modo de programador" e carrega "Carregar sem compactação" na pasta extension/dist.
2. No Supabase, em Authentication > URL Configuration > Redirect URLs, junta (uma vez):
     https://${id}.chromiumapp.org/
     https://${id}.chromiumapp.org/**
   É para o "Entrar com o Discord" da extensão. Sem isto, só dá para entrar com utilizador e palavra-passe.
   (Na versão das lojas o ID é outro, o que a loja atribuir: ver docs/extension-publishing.md.)
`)
