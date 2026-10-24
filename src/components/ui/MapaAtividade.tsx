import { useMemo } from 'react'
import { locale, l } from '@/lib/idioma'

const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * O calendário de atividade (ideia do Activity Heatmap do EasyUI): uma coluna por semana, uma linha por dia, e cada
 * quadrado acende em laranja conforme as partidas desse dia. `datas` são as datas (ISO) das partidas jogadas.
 */
export function MapaAtividade({ datas, semanas = 20 }: { datas: string[]; semanas?: number }) {
  const { colunas, meses, total, melhor } = useMemo(() => {
    const porDia = new Map<string, number>()
    for (const d of datas) {
      const k = chaveDia(new Date(d))
      porDia.set(k, (porDia.get(k) ?? 0) + 1)
    }
    // A última coluna é a semana de hoje (a semana começa à segunda).
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const diaSemana = (hoje.getDay() + 6) % 7
    const inicio = new Date(hoje)
    inicio.setDate(hoje.getDate() - diaSemana - (semanas - 1) * 7)
    const colunas: { chave: string; n: number; futuro: boolean; data: Date }[][] = []
    const meses: { coluna: number; nome: string }[] = []
    let ultimoMes = -1
    let total = 0
    let melhor = 0
    for (let w = 0; w < semanas; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const data = new Date(inicio)
        data.setDate(inicio.getDate() + w * 7 + d)
        const chave = chaveDia(data)
        const n = porDia.get(chave) ?? 0
        total += n
        melhor = Math.max(melhor, n)
        col.push({ chave, n, futuro: data > hoje, data })
      }
      const primeiro = col[0].data
      if (primeiro.getMonth() !== ultimoMes && (w === 0 || primeiro.getDate() <= 7)) {
        ultimoMes = primeiro.getMonth()
        meses.push({ coluna: w, nome: primeiro.toLocaleDateString(locale(), { month: 'short' }) })
      }
      colunas.push(col)
    }
    return { colunas, meses, total, melhor }
  }, [datas, semanas])

  const nivel = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 4)
  const quadrado = 13
  const espaco = 3
  const passo = quadrado + espaco
  const largura = semanas * passo - espaco
  const nomesDias = [l('Seg', 'Mon'), '', l('Qua', 'Wed'), '', l('Sex', 'Fri'), '', '']

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2 text-[13px] text-suave">
        <span className="font-mono text-[15px] font-semibold text-texto">{total}</span>
        {total === 1 ? l('partida nas últimas', 'match in the last') : l('partidas nas últimas', 'matches in the last')} {semanas} {l('semanas', 'weeks')}
        {melhor > 1 && <span className="text-mudo">· {l(`melhor dia: ${melhor}`, `best day: ${melhor}`)}</span>}
      </div>
      <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
        <div className="flex gap-2" style={{ width: largura + 30 }}>
          <div aria-hidden className="flex w-[22px] shrink-0 flex-col pt-[18px] font-mono text-[9.5px] text-mudo" style={{ gap: espaco }}>
            {nomesDias.map((n, i) => <span key={i} className="flex items-center" style={{ height: quadrado }}>{n}</span>)}
          </div>
          <div className="flex flex-col" style={{ gap: 5 }}>
            <div aria-hidden className="relative h-[13px] font-mono text-[9.5px] text-mudo uppercase" style={{ width: largura }}>
              {meses.map((m) => <span key={m.coluna} className="absolute" style={{ left: m.coluna * passo }}>{m.nome}</span>)}
            </div>
            <div className="flex" style={{ gap: espaco }}>
              {colunas.map((col, w) => (
                <div key={w} className="flex flex-col" style={{ gap: espaco }}>
                  {col.map((c) => (
                    <span
                      key={c.chave}
                      role="img"
                      aria-label={`${c.data.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}: ${c.n}`}
                      title={`${c.data.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${c.n} ${c.n === 1 ? l('partida', 'match') : l('partidas', 'matches')}`}
                      className={`dia-${nivel(c.n)} block rounded-[3px] transition-transform hover:scale-125 ${c.futuro ? 'invisible' : ''}`}
                      style={{ width: quadrado, height: quadrado }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] text-mudo">
        {l('Menos', 'Less')}
        {[0, 1, 2, 3, 4].map((n) => <span key={n} aria-hidden className={`dia-${n} block size-[11px] rounded-[3px]`} />)}
        {l('Mais', 'More')}
      </div>
    </div>
  )
}
