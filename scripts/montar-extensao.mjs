/**
 * Prepara a extensão do browser (pasta extensao/) para a carregares no Chrome, Edge ou Brave.
 * Copia-a para extensao/dist com a ligação ao teu Rangify:
 *   - o URL do Supabase e a chave pública, lidos do .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY);
 *   - o endereço do site, para a extensão abrir o Rangify e o site saber que ela está instalada;
 *   - as permissões do manifesto só para esses endereços.
 *
 *   npm run extensao -- https://o-teu-site.onrender.com
 *   npm run extensao -- --dev        (o site em http://localhost:5175)
 *
 * No fim mostra o URL que tens de juntar às Redirect URLs do Supabase para o "Entrar com o Discord" da extensão.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const origem = `${raiz}extensao`
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
const env = { ...lerEnv(), ...process.env }
const siteArg = argumentos.find((a) => !a.startsWith('--')) ?? env.SITE_URL ?? (dev ? 'http://localhost:5175' : '')
const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const supabaseKey = env.VITE_SUPABASE_ANON_KEY ?? ''

function parar(mensagem) {
  console.error(`\n${mensagem}\n`)
  process.exit(1)
}

if (!siteArg) parar('Diz-me onde está o site: npm run extensao -- https://o-teu-site.onrender.com (ou --dev para o localhost:5175).')
if (!supabaseUrl || !supabaseKey) parar('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env: a extensão só funciona com o Supabase ligado (o modo demo vive no browser do site).')
let siteOrigem
try { siteOrigem = new URL(siteArg).origin } catch { parar(`"${siteArg}" não é um endereço válido.`) }

const origens = [siteOrigem, ...(dev && siteOrigem !== 'http://localhost:5175' ? ['http://localhost:5175'] : [])]

rmSync(destino, { recursive: true, force: true })
mkdirSync(destino, { recursive: true })
for (const item of ['service-worker.js', 'estilo.css', 'LEIA-ME.md', 'lib', 'popup', 'alerta', 'offscreen', 'content', 'icones']) {
  cpSync(`${origem}/${item}`, `${destino}/${item}`, { recursive: true })
}

writeFileSync(`${destino}/config.js`, `// Gerado por scripts/montar-extensao.mjs: não edites à mão.
export const CONFIG = ${JSON.stringify({ siteUrl: siteOrigem, supabaseUrl, supabaseKey }, null, 2)}
`)

const manifesto = JSON.parse(readFileSync(`${origem}/manifest.json`, 'utf8'))
manifesto.host_permissions = [`${supabaseUrl}/*`, ...origens.map((o) => `${o}/*`)]
manifesto.content_scripts[0].matches = origens.map((o) => `${o}/*`)
writeFileSync(`${destino}/manifest.json`, JSON.stringify(manifesto, null, 2) + '\n')

// O ID da extensão vem da chave pública do manifesto: o mesmo em qualquer computador.
const id = [...createHash('sha256').update(Buffer.from(manifesto.key, 'base64')).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('')

console.log(`
Extensão pronta em extensao/dist
  site:      ${origens.join(', ')}
  Supabase:  ${supabaseUrl}

1. Abre chrome://extensions (ou edge://extensions), liga o "Modo de programador" e carrega "Carregar sem compactação" na pasta extensao/dist.
2. No Supabase, em Authentication > URL Configuration > Redirect URLs, junta (uma vez):
     https://${id}.chromiumapp.org/
     https://${id}.chromiumapp.org/**
   É para o "Entrar com o Discord" da extensão. Sem isto, só dá para entrar com utilizador e palavra-passe.
`)
