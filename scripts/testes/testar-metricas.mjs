/**
 * Testa a leitura das métricas do servidor (a Metrics API do Supabase, em formato Prometheus) e a mensagem de alerta do
 * estado do site, que a Edge Function saude-sondar usa (supabase/functions/_shared/metricas.ts).
 *
 *   node scripts/testes/testar-metricas.mjs      (corre também com npm run testar-sql)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const r = await build({ entryPoints: [fileURLToPath(new URL('../../supabase/functions/_shared/metricas.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' })
const pasta = new URL('../../node_modules/.cache/rangify/', import.meta.url)
mkdirSync(pasta, { recursive: true })
const ficheiro = new URL('metricas.mjs', pasta)
writeFileSync(ficheiro, r.outputFiles[0].text)
const { lerMetricas, mensagemAlerta, textoMotivo } = await import(pathToFileURL(fileURLToPath(ficheiro)).href)

let falhas = 0
let passos = 0
function ok(cond, texto) {
  passos++
  if (cond) console.log(`  ok  ${texto}`)
  else { falhas++; console.log(`  FALHOU  ${texto}`) }
}

// Um pedaço do que a Metrics API devolve (2 núcleos), com comentários, etiquetas variadas e valores em notação científica.
const AMOSTRA = `# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle",supabase_project_ref="abc"} 1000.5
node_cpu_seconds_total{cpu="0",mode="iowait",supabase_project_ref="abc"} 4
node_cpu_seconds_total{cpu="0",mode="user",supabase_project_ref="abc"} 90
node_cpu_seconds_total{cpu="1",mode="idle",supabase_project_ref="abc"} 1100
node_cpu_seconds_total{cpu="1",mode="system",supabase_project_ref="abc"} 40
node_memory_MemTotal_bytes{supabase_project_ref="abc"} 1.0e+09
node_memory_MemFree_bytes{supabase_project_ref="abc"} 100000000
node_memory_MemAvailable_bytes{supabase_project_ref="abc"} 4.0e+08
node_filesystem_size_bytes{device="/dev/root",fstype="ext4",mountpoint="/",supabase_project_ref="abc"} 8000000000
node_filesystem_avail_bytes{device="/dev/root",fstype="ext4",mountpoint="/",supabase_project_ref="abc"} 6000000000
node_filesystem_size_bytes{device="/dev/nvme1n1",fstype="xfs",mountpoint="/data",supabase_project_ref="abc"} 10000000000
node_filesystem_avail_bytes{device="/dev/nvme1n1",fstype="xfs",mountpoint="/data",supabase_project_ref="abc"} 1000000000
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",mountpoint="/run",supabase_project_ref="abc"} 100
node_filesystem_avail_bytes{device="tmpfs",fstype="tmpfs",mountpoint="/run",supabase_project_ref="abc"} 1
node_load1{supabase_project_ref="abc"} 1.5
pgrst_db_pool_waiting{supabase_project_ref="abc"} 2
pgrst_db_pool_waiting{supabase_project_ref="abc",extra="x"} 1 1731100000000
`

console.log('\nLer as métricas do servidor')
const m = lerMetricas(AMOSTRA)
ok(m !== null, 'lê o texto')
ok(m.cpuOcioso === 2100.5, 'soma o tempo em repouso dos dois núcleos')
ok(m.cpuTotal === 2234.5, 'e o tempo total de todos os modos (repouso, espera de disco, utilizador, sistema)')
ok(m.ram === 60, 'memória em uso: 40% disponível = 60% usada (a MemAvailable, não a livre)')
ok(m.disco === 90, 'disco: o mais cheio entre / e /data (90% no volume dos dados), sem contar o tmpfs')
ok(m.carga === 0.75, 'carga do último minuto por núcleo: 1,5 em 2 núcleos')
ok(m.poolEspera === 3, 'pedidos à espera no pool da API (soma das séries, com ou sem marca de tempo)')
const semMemAvailable = lerMetricas(AMOSTRA.replace(/node_memory_MemAvailable_bytes.*\n/, '').replace('node_memory_MemFree_bytes{supabase_project_ref="abc"} 100000000', 'node_memory_MemFree_bytes 100000000\nnode_memory_Cached_bytes 200000000\nnode_memory_Buffers_bytes 100000000'))
ok(semMemAvailable.ram === 60, 'sem MemAvailable: a livre mais as caches dão o mesmo')
ok(lerMetricas('') === null && lerMetricas('<html>Unauthorized</html>') === null, 'uma resposta sem contadores de CPU não é aceite')
ok(lerMetricas('node_cpu_seconds_total{cpu="0",mode="idle"} NaN\nnode_cpu_seconds_total{cpu="0",mode="user"} +Inf') === null, 'valores que não são números são ignorados')
const parcial = lerMetricas('node_cpu_seconds_total{cpu="0",mode="idle"} 10\nnode_cpu_seconds_total{cpu="0",mode="user"} 10')
ok(parcial.ram === null && parcial.disco === null && parcial.carga === null && parcial.poolEspera === null, 'o que não vem fica vazio (nunca inventa)')

console.log('\nA mensagem de alerta')
const abre = mensagemAlerta({ estado: 'sobrecarga', mudou: 'abriu', motivos: [
  { codigo: 'cpu', valor: 95, aviso: 70, critico: 90, nivel: 'sobrecarga' },
  { codigo: 'resposta_lenta', monitor: 'api', valor: 2600, aviso: 800, critico: 2400, nivel: 'sobrecarga' },
  { codigo: 'monitor_em_baixo', monitor: 'site', nivel: 'em_baixo', detalhe: 'HTTP 502' },
] }, 'https://rangify.onrender.com/admin?aba=estado')
ok(abre.startsWith('**O Rangify está sobrecarregado**'), 'o título diz o estado')
ok(abre.includes('- CPU do servidor a 95%') && abre.includes('- a API demora 2600 ms a responder (limite 800 ms)') && abre.includes('- o site não responde (HTTP 502)'), 'e cada motivo diz o valor')
ok(abre.endsWith('https://rangify.onrender.com/admin?aba=estado'), 'e acaba com a ligação para a página')
ok(!/[—–]/.test(abre), 'sem travessões')
ok(mensagemAlerta({ estado: 'ok', mudou: 'fechou', motivos: [] }, 'x') === 'O Rangify recuperou. x', 'ao recuperar, avisa que recuperou')
ok(mensagemAlerta({ estado: 'em_baixo', mudou: 'piorou', motivos: [{ codigo: 'monitor_em_baixo', monitor: 'api', nivel: 'em_baixo' }] }, '').startsWith('**O Rangify está em baixo**'), 'se piora, avisa outra vez')
ok(mensagemAlerta({ estado: 'lento', mudou: 'melhorou', motivos: [] }, '') === null && mensagemAlerta({ estado: 'lento', mudou: null, motivos: [] }, '') === null, 'melhorar um pouco ou ficar igual não avisa')
ok(textoMotivo({ codigo: 'qualquer_coisa_nova', nivel: 'lento' }) === 'qualquer_coisa_nova', 'um código que ainda não conhece aparece tal e qual')
const muitos = mensagemAlerta({ estado: 'lento', mudou: 'abriu', motivos: Array.from({ length: 11 }, () => ({ codigo: 'cpu', valor: 71, nivel: 'lento' })) }, '')
ok(muitos.split('\n').length === 7, 'no máximo seis motivos por mensagem')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
