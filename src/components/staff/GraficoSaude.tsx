import { useEffect, useRef, useState } from 'react'
import type { EstadoSaude, PeriodoSaude } from '@/lib/data'
import { l as tx } from '@/lib/idioma'
import { corSaude } from '@/lib/saude'
import { dataCurta, dataHora } from '@/lib/tempo'

export interface SerieGrafico { chave: string; nome: string; cor: string; valores: (number | null)[]; unidade: string }
export interface LinhaGrafico { valor: number; rotulo: string; cor: string }

const ALTURA = 168
const M = { t: 10, b: 22, l: 38, r: 10 }

function hora(iso: string, periodo: PeriodoSaude) {
  return periodo === '7d' || periodo === '30d' ? dataCurta(iso) : new Date(iso).toLocaleTimeString(tx('pt-PT', 'en-GB'), { hour: '2-digit', minute: '2-digit' })
}

/**
 * Um gráfico de linhas simples para o estado do site: as séries pelo tempo, linhas tracejadas nos limites, faixas
 * coloridas por trás onde o site não estava bem e, ao passar o rato, o valor de cada série nesse momento.
 */
export function GraficoSaude({ titulo, eyebrow, em, estados, series, linhas = [], maximo, periodo, vazio, className = '' }: {
  className?: string; titulo: string; eyebrow: string; em: string[]; estados: EstadoSaude[]; series: SerieGrafico[]; linhas?: LinhaGrafico[]
  maximo?: number; periodo: PeriodoSaude; vazio?: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(420)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(240, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const temDados = series.some((s) => s.valores.some((v) => v !== null))
  const topo = Math.max(maximo ?? 0, ...series.flatMap((s) => s.valores.filter((v): v is number => v !== null)), ...linhas.map((x) => x.valor)) * (maximo ? 1 : 1.12) || 1
  const n = em.length
  const x = (i: number) => M.l + (n <= 1 ? (largura - M.l - M.r) / 2 : (i / (n - 1)) * (largura - M.l - M.r))
  const y = (v: number) => M.t + (1 - Math.min(v, topo) / topo) * (ALTURA - M.t - M.b)
  const passo = n <= 1 ? largura : (largura - M.l - M.r) / (n - 1)

  // Uma linha por troço contínuo: onde falta o valor, a linha interrompe-se.
  const caminho = (valores: (number | null)[]) => {
    let d = ''
    let aberto = false
    valores.forEach((v, i) => {
      if (v === null) { aberto = false; return }
      d += `${aberto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      aberto = true
    })
    return d.trim()
  }
  const marcas = [0, 0.5, 1].map((f) => f * topo)
  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - M.l) / Math.max(1, passo)))))
  }
  const fmt = (v: number | null, u: string) => (v === null ? '-' : `${Math.round(v * 10) / 10}${u}`)

  return (
    <div className={`flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-white/8 bg-white/[0.02] p-3.5 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="eyebrow">{eyebrow}</span>
          <h3 className="m-0 text-[15px] font-bold tracking-[-0.01em]">{titulo}</h3>
        </div>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {series.map((s) => (
            <span key={s.chave} className="flex items-center gap-1.5 text-[11.5px] text-mudo"><span className="h-0.5 w-3.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span>
          ))}
        </span>
      </div>
      <div ref={caixa} className="relative">
        {!temDados ? (
          <div className="grid place-items-center text-center text-[12.5px] text-mudo" style={{ height: ALTURA }}>{vazio ?? tx('Sem dados neste período.', 'No data in this period.')}</div>
        ) : (
          <>
            <svg width={largura} height={ALTURA} onPointerMove={mover} onPointerLeave={() => setHover(null)} className="block touch-pan-y" role="img" aria-label={titulo}>
              {estados.map((e, i) => e !== 'ok' && (
                <rect key={i} x={x(i) - passo / 2} y={M.t} width={Math.max(2, passo)} height={ALTURA - M.t - M.b} fill={corSaude(e)} opacity={0.13} />
              ))}
              {marcas.map((v) => (
                <g key={v}>
                  <line x1={M.l} x2={largura - M.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" />
                  <text x={M.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-mudo font-mono text-[10px]">{Math.round(v)}</text>
                </g>
              ))}
              {linhas.map((li) => li.valor <= topo && (
                <g key={li.rotulo}>
                  <line x1={M.l} x2={largura - M.r} y1={y(li.valor)} y2={y(li.valor)} stroke={li.cor} strokeDasharray="4 4" opacity={0.65} />
                  <text x={largura - M.r - 2} y={y(li.valor) - 4} textAnchor="end" className="font-mono text-[9.5px]" fill={li.cor} opacity={0.9}>{li.rotulo}</text>
                </g>
              ))}
              {series.map((s) => <path key={s.chave} d={caminho(s.valores)} fill="none" stroke={s.cor} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" />)}
              {[0, Math.floor((n - 1) / 2), n - 1].filter((i, k, a) => n > 0 && a.indexOf(i) === k).map((i) => (
                <text key={i} x={x(i)} y={ALTURA - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-mudo font-mono text-[10px]">{hora(em[i], periodo)}</text>
              ))}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={ALTURA - M.b} stroke="rgba(255,255,255,0.35)" />}
              {hover !== null && series.map((s) => s.valores[hover] !== null && <circle key={s.chave} cx={x(hover)} cy={y(s.valores[hover]!)} r={3.2} fill={s.cor} />)}
            </svg>
            {hover !== null && (
              <div
                className="pointer-events-none absolute top-1 z-10 min-w-[120px] rounded-lg border border-white/12 bg-[rgba(14,14,17,0.96)] px-2.5 py-2 text-[11.5px] shadow-lg"
                style={{ left: Math.min(Math.max(x(hover) + 10, 0), largura - 150) }}
              >
                <div className="mb-1 font-mono text-[10.5px] text-mudo">{dataHora(em[hover])}</div>
                {series.map((s) => (
                  <div key={s.chave} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-suave"><span className="size-1.5 rounded-full" style={{ background: s.cor }} />{s.nome}</span><span className="font-mono font-semibold">{fmt(s.valores[hover], s.unidade)}</span></div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
