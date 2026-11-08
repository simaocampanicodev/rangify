// Lê as métricas do servidor do Supabase (a Metrics API devolve texto no formato Prometheus) e a mensagem de alerta do
// estado do site. É código puro (sem Deno nem rede), por isso o teste scripts/testes/testar-metricas.mjs corre-o em Node.

export interface MetricasServidor {
  /** Segundos de CPU em repouso e no total, somados a todos os núcleos. Só valem em diferença entre duas leituras. */
  cpuOcioso: number
  cpuTotal: number
  /** Memória em uso (sem a cache que o sistema devolve), em percentagem. */
  ram: number | null
  /** O disco mais cheio entre a raiz e o volume dos dados, em percentagem. */
  disco: number | null
  /** A carga do último minuto por núcleo (1 é o servidor todo ocupado). */
  carga: number | null
  /** Pedidos à espera de uma ligação à base de dados no pool da API. */
  poolEspera: number | null
}

const LINHA = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?\s*$/
const ETIQUETA = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

function etiquetas(texto: string | undefined): Record<string, string> {
  const r: Record<string, string> = {}
  if (!texto) return r
  for (const m of texto.matchAll(ETIQUETA)) r[m[1]] = m[2]
  return r
}

const arredondar = (n: number) => Math.round(n * 10) / 10

/** Devolve null se o texto não trouxer os contadores de CPU (não é a resposta de que estávamos à espera). */
export function lerMetricas(texto: string): MetricasServidor | null {
  let ocioso = 0, total = 0
  const nucleos = new Set<string>()
  let memTotal: number | null = null, memDisponivel: number | null = null, memLivre = 0, memBuffers = 0, memCache = 0
  let disco: number | null = null
  const tamanho = new Map<string, number>(), livre = new Map<string, number>()
  let carga: number | null = null
  let pool: number | null = null

  for (const linha of texto.split('\n')) {
    if (!linha || linha.startsWith('#')) continue
    const m = LINHA.exec(linha)
    if (!m) continue
    const valor = Number(m[3])
    if (!Number.isFinite(valor)) continue
    const nome = m[1]
    switch (nome) {
      case 'node_cpu_seconds_total': {
        const e = etiquetas(m[2])
        total += valor
        if (e.mode === 'idle') ocioso += valor
        if (e.cpu) nucleos.add(e.cpu)
        break
      }
      case 'node_memory_MemTotal_bytes': memTotal = valor; break
      case 'node_memory_MemAvailable_bytes': memDisponivel = valor; break
      case 'node_memory_MemFree_bytes': memLivre = valor; break
      case 'node_memory_Buffers_bytes': memBuffers = valor; break
      case 'node_memory_Cached_bytes': memCache = valor; break
      case 'node_filesystem_size_bytes':
      case 'node_filesystem_avail_bytes': {
        const ponto = etiquetas(m[2]).mountpoint
        if (ponto === '/' || ponto === '/data') (nome === 'node_filesystem_size_bytes' ? tamanho : livre).set(ponto, valor)
        break
      }
      case 'node_load1': carga = valor; break
      case 'pgrst_db_pool_waiting': pool = (pool ?? 0) + valor; break
    }
  }
  if (!nucleos.size || total <= 0) return null

  for (const [ponto, t] of tamanho) {
    const l = livre.get(ponto)
    if (t > 0 && l !== undefined) disco = Math.max(disco ?? 0, 100 * (1 - l / t))
  }
  // Sem MemAvailable (kernels antigos), a memória que o sistema devolve ao programa é a livre mais as caches.
  const disponivel = memDisponivel ?? (memTotal !== null ? memLivre + memBuffers + memCache : null)
  const ram = memTotal && disponivel !== null ? 100 * (1 - disponivel / memTotal) : null

  return {
    cpuOcioso: ocioso,
    cpuTotal: total,
    ram: ram === null ? null : arredondar(ram),
    disco: disco === null ? null : arredondar(disco),
    carga: carga === null ? null : Math.round((carga / nucleos.size) * 100) / 100,
    poolEspera: pool,
  }
}

// ------------------------------------------------------------ o alerta no Discord

export interface MotivoSaude { codigo: string; monitor?: string; valor?: number; aviso?: number; critico?: number; nivel: string; detalhe?: string }

const MONITORES: Record<string, string> = { site: 'o site', api: 'a API', auth: 'o login', funcoes: 'as Edge Functions' }

/** O motivo numa frase. Os códigos vêm da migração 0045; um código novo aparece tal e qual, sem estragar a mensagem. */
export function textoMotivo(m: MotivoSaude): string {
  const v = m.valor
  const o = m.monitor ? MONITORES[m.monitor] ?? m.monitor : ''
  switch (m.codigo) {
    case 'monitor_em_baixo': return `${o} não responde${m.detalhe ? ` (${m.detalhe})` : ''}`
    case 'resposta_lenta': return `${o} demora ${v} ms a responder (limite ${m.aviso} ms)`
    case 'sondas_em_falta': return 'as verificações deixaram de chegar (a função saude-sondar não responde)'
    case 'cpu': return `CPU do servidor a ${v}%`
    case 'ram': return `memória do servidor a ${v}%`
    case 'disco': return `disco a ${v}%`
    case 'carga': return `carga do servidor a ${v} por núcleo`
    case 'pool_api': return `${v} pedidos à espera de uma ligação à base de dados`
    case 'ligacoes': return `ligações à base de dados a ${v}% do máximo`
    case 'consulta_lenta': return `uma consulta com ${v} s em execução`
    case 'bloqueios': return `${v} consultas à espera de bloqueios`
    case 'partidas_paradas': return `${v} partidas paradas`
    case 'erros_http': return `${v}% dos pedidos da base de dados às funções falharam`
    case 'cron_falhas': return `${v} tarefas agendadas falharam`
    default: return m.codigo
  }
}

const TITULO: Record<string, string> = {
  lento: 'O Rangify está lento',
  sobrecarga: 'O Rangify está sobrecarregado',
  em_baixo: 'O Rangify está em baixo',
}

/** A mensagem para o canal de staff, ou null se a mudança não merece aviso. */
export function mensagemAlerta(r: { estado: string; mudou: string | null; motivos: MotivoSaude[] }, ligacao: string): string | null {
  if (r.mudou === 'fechou') return `O Rangify recuperou. ${ligacao}`.trim()
  if (r.mudou !== 'abriu' && r.mudou !== 'piorou') return null
  const linhas = r.motivos.slice(0, 6).map((m) => `- ${textoMotivo(m)}`)
  return [`**${TITULO[r.estado] ?? 'O Rangify mudou de estado'}**`, ...linhas, ligacao].filter(Boolean).join('\n')
}
