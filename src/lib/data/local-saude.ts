/**
 * O estado do site no modo demo. Não há servidor a medir, por isso as sondas, a CPU e as ligações são inventadas, mas
 * têm a forma exata das que a base de dados devolve (migração 0045), para se ver cada ecrã: tudo bem, lento,
 * sobrecarga e em baixo. O Owner escolhe o cenário no próprio ecrã.
 */
import { armazemLocal } from '../armazem'
import { avisarMudanca } from './eventos'
import type {
  BatimentoSaude, CenarioSaude, Dados, EstadoSaude, IncidenteSaude, MonitorSaude, MonitorSaudeId, MotivoSaude, PeriodoSaude, PontoSaude, Saude,
} from './tipos'

const CHAVE = 'rangify:demo-saude'
const MIN = 60_000

/** Um número entre 0 e 1 que só depende de n: o mesmo minuto dá sempre o mesmo valor. */
const ruido = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const arredondar = (n: number, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas

interface Perfil { estado: EstadoSaude; cpu: number; ram: number; ligacoes: number; ativas: number; msApi: number; msSite: number; maisLentaS: number; bloqueadas: number; pool: number; motivos: MotivoSaude[] }

const motivo = (codigo: string, valor: number, aviso: number, critico: number, monitor?: MonitorSaudeId): MotivoSaude =>
  ({ codigo, valor, aviso, critico, nivel: valor >= critico ? 'sobrecarga' : 'lento', ...(monitor ? { monitor } : {}) })

const NORMAL: Perfil = { estado: 'ok', cpu: 18, ram: 52, ligacoes: 24, ativas: 2, msApi: 85, msSite: 120, maisLentaS: 0.4, bloqueadas: 0, pool: 0, motivos: [] }

const PERFIS: Record<Exclude<CenarioSaude, 'normal'>, Perfil> = {
  lento: {
    estado: 'lento', cpu: 76, ram: 74, ligacoes: 40, ativas: 9, msApi: 1100, msSite: 640, maisLentaS: 3.1, bloqueadas: 1, pool: 0,
    motivos: [motivo('cpu', 76, 70, 90), motivo('ligacoes', 66.7, 60, 85), motivo('resposta_lenta', 1100, 800, 2400, 'api')],
  },
  sobrecarga: {
    estado: 'sobrecarga', cpu: 94, ram: 91, ligacoes: 53, ativas: 21, msApi: 3100, msSite: 1900, maisLentaS: 41, bloqueadas: 12, pool: 6,
    motivos: [motivo('cpu', 94, 70, 90), motivo('ram', 91, 85, 95), motivo('ligacoes', 88.3, 60, 85), motivo('consulta_lenta', 41, 5, 30), motivo('bloqueios', 12, 3, 10), motivo('pool_api', 6, 1, 5), motivo('resposta_lenta', 3100, 800, 2400, 'api')],
  },
  em_baixo: {
    estado: 'em_baixo', cpu: 8, ram: 49, ligacoes: 6, ativas: 0, msApi: 0, msSite: 0, maisLentaS: 0, bloqueadas: 0, pool: 0,
    motivos: [
      { codigo: 'monitor_em_baixo', monitor: 'site', nivel: 'em_baixo', detalhe: 'HTTP 502' },
      { codigo: 'monitor_em_baixo', monitor: 'api', nivel: 'em_baixo', detalhe: 'sem resposta em 8 s' },
    ],
  },
}

/** Dois incidentes que já acabaram, para o histórico não aparecer vazio. */
const PASSADOS: { antes: number; duracao: number; perfil: Perfil; estado: IncidenteSaude['estado']; motivos: MotivoSaude[] }[] = [
  { antes: 2 * 86_400_000, duracao: 14 * MIN, perfil: { ...PERFIS.lento, cpu: 41, ram: 87, ligacoes: 43 }, estado: 'lento', motivos: [motivo('ram', 87, 85, 95), motivo('ligacoes', 71.7, 60, 85)] },
  { antes: 9 * 86_400_000, duracao: 31 * MIN, perfil: { ...PERFIS.sobrecarga, ligacoes: 55 }, estado: 'sobrecarga', motivos: [motivo('ligacoes', 91.7, 60, 85), motivo('consulta_lenta', 47, 5, 30), motivo('bloqueios', 14, 3, 10)] },
]

interface Simulacao { cenario: CenarioSaude; desde: number }

function ler(): Simulacao {
  try {
    const s = JSON.parse(armazemLocal.ler(CHAVE) ?? 'null') as Simulacao | null
    if (s && ['normal', 'lento', 'sobrecarga', 'em_baixo'].includes(s.cenario) && Number.isFinite(s.desde)) return s
  } catch { /* guardado por outra versão */ }
  return { cenario: 'normal', desde: Date.now() }
}

/** O que se passava num instante: o cenário a decorrer, um incidente passado, ou o normal. */
function perfilEm(t: number, agora: number, sim: Simulacao): Perfil {
  if (sim.cenario !== 'normal' && t >= sim.desde) return PERFIS[sim.cenario]
  const passado = PASSADOS.find((p) => t >= agora - p.antes && t <= agora - p.antes + p.duracao)
  return passado ? passado.perfil : NORMAL
}

const PASSOS: Record<PeriodoSaude, { n: number; passo: number }> = {
  '1h': { n: 60, passo: MIN },
  '24h': { n: 288, passo: 5 * MIN },
  '7d': { n: 336, passo: 30 * MIN },
  '30d': { n: 360, passo: 120 * MIN },
}

function ponto(t: number, i: number, agora: number, sim: Simulacao): PontoSaude {
  const p = perfilEm(t, agora, sim)
  const r = ruido(Math.floor(t / MIN) + i)
  const mexe = (v: number, parte: number) => v * (1 + (r - 0.5) * parte)
  const baixo = p.estado === 'em_baixo'
  return {
    em: new Date(t).toISOString(), estado: p.estado,
    cpu: arredondar(Math.min(100, mexe(p.cpu, 0.5))), ram: arredondar(Math.min(100, mexe(p.ram, 0.06))),
    ligacoes: Math.round(mexe(p.ligacoes, 0.3)), ligacoesMax: 60, ativas: Math.max(0, Math.round(mexe(p.ativas, 0.8))),
    msApi: baixo ? null : Math.round(mexe(p.msApi, 0.5)), msSite: baixo ? null : Math.round(mexe(p.msSite, 0.4)),
  }
}

function monitor(id: MonitorSaudeId, agora: number, sim: Simulacao): MonitorSaude {
  const avisoMs = id === 'site' || id === 'funcoes' ? 1500 : 800
  const ultimos: BatimentoSaude[] = Array.from({ length: 60 }, (_, k) => {
    const t = agora - (59 - k) * MIN
    const p = perfilEm(t, agora, sim)
    const caiu = p.estado === 'em_baixo' && (id === 'site' || id === 'api')
    const base = id === 'site' ? p.msSite : id === 'api' ? p.msApi : (id === 'auth' ? 70 : 140) * (p.estado === 'ok' ? 1 : p.estado === 'em_baixo' ? 1 : p.estado === 'lento' ? 3 : 8)
    return { em: new Date(t).toISOString(), ok: !caiu, ms: caiu ? null : Math.round(base * (0.75 + ruido(k + id.length * 17) * 0.5)) }
  })
  const emBaixoMin = sim.cenario === 'em_baixo' && (id === 'site' || id === 'api') ? Math.min(1440, Math.round((agora - sim.desde) / MIN)) : 0
  const pct = (janela: number) => arredondar(100 - (Math.min(emBaixoMin, janela) / janela) * 100, 2)
  const bons = ultimos.filter((b) => b.ok && b.ms !== null)
  return {
    id, avisoMs, ultimos, detalhe: ultimos[59].ok ? null : (id === 'site' ? 'HTTP 502' : 'sem resposta em 8 s'), idadeS: 20,
    disponibilidade24h: pct(1440), disponibilidade7d: pct(10080),
    mediaMs: bons.length ? Math.round(bons.reduce((s, b) => s + (b.ms ?? 0), 0) / bons.length) : null,
  }
}

export function criarSaudeLocal(): Pick<Dados, 'saude' | 'saudeResumo' | 'simularSaude' | 'cenarioSaude'> {
  return {
    async saude(periodo) {
      const sim = ler()
      const agora = Date.now()
      const { n, passo } = PASSOS[periodo]
      const p = sim.cenario === 'normal' ? NORMAL : PERFIS[sim.cenario]
      const aberto: IncidenteSaude[] = sim.cenario === 'normal' ? [] : [{ id: 3, inicio: new Date(sim.desde).toISOString(), fim: null, estado: sim.cenario, motivos: p.motivos }]
      const fechados: IncidenteSaude[] = PASSADOS.map((x, i) => ({
        id: 2 - i, inicio: new Date(agora - x.antes).toISOString(), fim: new Date(agora - x.antes + x.duracao).toISOString(), estado: x.estado, motivos: x.motivos,
      }))
      const resultado: Saude = {
        periodo, estado: p.estado, aConfirmar: false, aRecuperar: false,
        desde: aberto[0]?.inicio ?? null, amostraEm: new Date(agora - 20_000).toISOString(), idadeS: 20, semSondas: false,
        motivos: p.motivos,
        agora: {
          cpu: p.cpu, ram: p.ram, disco: 34, carga: arredondar(p.cpu / 100 * 1.4, 2), poolEspera: p.pool,
          ligacoes: p.ligacoes, ligacoesMax: 60, ativas: p.ativas, maisLentaS: p.maisLentaS, bloqueadas: p.bloqueadas,
          fila: p.estado === 'em_baixo' ? 0 : 7, partidas: p.estado === 'em_baixo' ? 0 : 3, partidasParadas: sim.cenario === 'sobrecarga' ? 4 : 0, errosHttp: null,
        },
        servidor: { ok: true, detalhe: null, idadeS: 20 },
        monitores: (['site', 'api', 'auth', 'funcoes'] as const).map((id) => monitor(id, agora, sim)),
        serie: Array.from({ length: n }, (_, i) => ponto(agora - (n - 1 - i) * passo, i, agora, sim)),
        incidentes: [...aberto, ...fechados],
      }
      return resultado
    },
    async saudeResumo() {
      const { cenario } = ler()
      const p = cenario === 'normal' ? NORMAL : PERFIS[cenario]
      return { estado: p.estado, aConfirmar: false, motivos: p.motivos.map((m) => ({ codigo: m.codigo, monitor: m.monitor, nivel: m.nivel })) }
    },
    simularSaude(cenario) {
      armazemLocal.escrever(CHAVE, JSON.stringify({ cenario, desde: Date.now() - 25 * MIN } satisfies Simulacao))
      avisarMudanca('staff')
    },
    cenarioSaude: () => ler().cenario,
  }
}
