/** Datas e tempos em português de Portugal. */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '-'
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'agora mesmo'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  const sem = Math.round(d / 7)
  if (sem < 5) return sem === 1 ? 'há 1 semana' : `há ${sem} semanas`
  return dataCurta(iso)
}

export function dataCurta(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

export function dataHora(iso: string): string {
  const d = new Date(iso)
  return `${dataCurta(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function relogio(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function emFalta(iso: string | null | undefined, agora = Date.now()): number {
  if (!iso) return 0
  return Math.max(0, (new Date(iso).getTime() - agora) / 1000)
}

export function duracaoAte(iso: string, agora = Date.now()): string {
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

export function fimDaSemana(d = new Date()): Date {
  const ini = new Date(periodoSemana(d) + 'T00:00:00Z')
  ini.setUTCDate(ini.getUTCDate() + 7)
  return ini
}
