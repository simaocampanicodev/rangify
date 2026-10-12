/** Datas e tempos, em português de Portugal ou em inglês. */
import { l } from './idioma'

/**
 * Diferença entre o relógio do servidor e o deste computador. Os prazos e o
 * tempo na fila vêm do servidor; se o relógio local estiver uns segundos
 * atrasado, as contagens ficavam presas em 00:00. O site acerta-o a cada
 * leitura do estado da fila.
 */
let desvio = 0
let acertado = false

export function acertarRelogio(isoServidor: string | null | undefined) {
  if (!isoServidor) return
  const d = new Date(isoServidor).getTime() - Date.now()
  if (!Number.isFinite(d)) return
  // A primeira leitura vale logo; depois suaviza, para a latência da rede não fazer saltar os números.
  desvio = acertado ? desvio * 0.7 + d * 0.3 : d
  acertado = true
}

export function agoraCerto(): number {
  return Date.now() + desvio
}

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mes = (i: number) => (l('pt', 'en') === 'en' ? MESES_EN : MESES_PT)[i]

export function haQuanto(iso: string | null | undefined, agora = agoraCerto()): string {
  if (!iso) return '-'
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 45) return l('agora mesmo', 'just now')
  const m = Math.round(s / 60)
  if (m < 60) return l(`há ${m} min`, `${m} min ago`)
  const h = Math.round(m / 60)
  if (h < 24) return l(`há ${h} h`, `${h} h ago`)
  const d = Math.round(h / 24)
  if (d === 1) return l('ontem', 'yesterday')
  if (d < 7) return l(`há ${d} dias`, `${d} days ago`)
  const sem = Math.round(d / 7)
  if (sem < 5) return sem === 1 ? l('há 1 semana', '1 week ago') : l(`há ${sem} semanas`, `${sem} weeks ago`)
  return dataCurta(iso)
}

export function dataCurta(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${mes(d.getMonth())}`
}

export function dataHora(iso: string): string {
  const d = new Date(iso)
  return `${dataCurta(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function relogio(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function emFalta(iso: string | null | undefined, agora = agoraCerto()): number {
  if (!iso) return 0
  return Math.max(0, (new Date(iso).getTime() - agora) / 1000)
}

export function duracaoAte(iso: string, agora = agoraCerto()): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - agora) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.round((s % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/** Início da semana (segunda-feira) em ISO, para o período das missões semanais. */
export function periodoSemana(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dia = (x.getUTCDay() + 6) % 7
  x.setUTCDate(x.getUTCDate() - dia)
  return x.toISOString().slice(0, 10)
}

/** Meia-noite UTC de amanhã: quando as missões diárias mudam. */
export function fimDoDia(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
}

/** "2026-10-12" para "12 OUT", como no canto das novidades. */
export function diaCurto(data: string): string {
  const [, m, d] = data.split('-').map(Number)
  return m && d ? `${d} ${mes(m - 1).toUpperCase()}` : data
}

export function fimDaSemana(d = new Date()): Date {
  const ini = new Date(periodoSemana(d) + 'T00:00:00Z')
  ini.setUTCDate(ini.getUTCDate() + 7)
  return ini
}
