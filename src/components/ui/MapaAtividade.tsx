import { useEffect, useMemo, useRef, useState } from 'react'
import { locale, l } from '@/lib/idioma'

const chaveDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Tamanho de cada quadrado e espaço entre eles (px). */
const QUADRADO = 22
const ESPACO = 4
const COLUNA_DIAS = 26

/**
 * O calendário de atividade (ideia do Activity Heatmap do EasyUI): uma coluna por semana, uma linha por dia, e cada
 * quadrado acende em laranja conforme as partidas desse dia. `datas` são as datas (ISO) das partidas jogadas.
 * O número de semanas acompanha a largura disponível, por isso o calendário ocupa sempre a largura toda do painel.
 */
export function MapaAtividade({ datas }: { datas: string[] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width))
    ro.observe(el)
    setLargura(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const semanas = Math.max(8, Math.min(52, Math.floor((largura - COLUNA_DIAS) / (QUADRADO + ESPACO))))

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
        const futuro = data > hoje
        if (!futuro) { total += n; melhor = Math.max(melhor, n) }
        col.push({ chave, n, futuro, data })
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

  const nivel = (n: number) => (n >= 4 ? 4 : n)
  const nomesDias = [l('Seg', 'Mon'), '', l('Qua', 'Wed'), '', l('Sex', 'Fri'), '', '']

  return (
    <div ref={caixa} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-suave">
        <span className="font-mono text-[15px] font-semibold text-texto">{total}</span>
        {total === 1 ? l('partida nas últimas', 'match in the last') : l('partidas nas últimas', 'matches in the last')} {semanas} {l('semanas', 'weeks')}
        {melhor > 1 && <span className="text-mudo">· {l(`melhor dia: ${melhor}`, `best day: ${melhor}`)}</span>}
      </div>
      {/* Uma grelha: primeira coluna para os dias da semana, uma por semana, e uma linha em cima para os meses. */}
      <div className="grid w-fit" style={{ gridTemplateColumns: `${COLUNA_DIAS}px repeat(${semanas}, ${QUADRADO}px)`, columnGap: ESPACO, rowGap: ESPACO }}>
        {meses.map((m) => (
          <span key={m.coluna} aria-hidden className="font-mono text-[10px] whitespace-nowrap text-mudo uppercase" style={{ gridColumn: m.coluna + 2, gridRow: 1 }}>{m.nome}</span>
        ))}
        {nomesDias.map((n, d) => n && (
          <span key={d} aria-hidden className="flex items-center font-mono text-[10px] text-mudo" style={{ gridColumn: 1, gridRow: d + 2, height: QUADRADO }}>{n}</span>
        ))}
        {colunas.map((col, w) => col.map((c, d) => (
          <span
            key={c.chave}
            role="img"
            aria-label={`${c.data.toLocaleDateString(locale(), { day: 'numeric', month: 'long' })}: ${c.n}`}
            title={`${c.data.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${c.n} ${c.n === 1 ? l('partida', 'match') : l('partidas', 'matches')}`}
            className={`dia-${nivel(c.n)} block rounded-[4px] transition-transform hover:scale-110 ${c.futuro ? 'invisible' : ''}`}
            style={{ gridColumn: w + 2, gridRow: d + 2, width: QUADRADO, height: QUADRADO }}
          />
        )))}
      </div>
      <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] text-mudo">
        {l('Menos', 'Less')}
        {[0, 1, 2, 3, 4].map((n) => <span key={n} aria-hidden className={`dia-${n} block size-[12px] rounded-[3px]`} />)}
        {l('Mais', 'More')}
      </div>
    </div>
  )
}
