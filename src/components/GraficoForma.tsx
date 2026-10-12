import { useEffect, useRef, useState } from 'react'
import type { PontoForma } from '@/lib/dados'
import { comSinal } from '@/lib/pontos'
import { dataCurta } from '@/lib/tempo'
import { Segmentado, SeloMvp } from './ui'

/** Curva suave (Catmull-Rom convertida em Bézier) que passa por todos os pontos. */
function caminho(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i]
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    const [x3, y3] = pts[i + 2] ?? pts[i + 1]
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`
  }
  return d
}

/** O gráfico "Forma" do perfil: pontos ou KDA nas últimas partidas, com média e detalhe ao passar o rato. */
export function GraficoForma({ dados }: { dados: PontoForma[] }) {
  const [modo, setModo] = useState<'pontos' | 'kda'>('pontos')
  const [hover, setHover] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(260, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const valores = dados.map((d) => (modo === 'pontos' ? d.pontos : d.kda ?? 0))
  const altura = 220
  const m = { t: 18, b: 28, l: 44, r: 14 }
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const folga = modo === 'pontos' ? Math.max(10, (max - min) * 0.15) : Math.max(0.2, (max - min) * 0.15)
  const lo = min - folga
  const hi = max + folga
  const x = (i: number) => m.l + (dados.length === 1 ? (largura - m.l - m.r) / 2 : (i / (dados.length - 1)) * (largura - m.l - m.r))
  const y = (v: number) => m.t + (1 - (v - lo) / Math.max(0.0001, hi - lo)) * (altura - m.t - m.b)
  const pts = valores.map((v, i) => [x(i), y(v)] as [number, number])
  const media = valores.reduce((s, v) => s + v, 0) / Math.max(1, valores.length)
  const marcas = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15]
  const fmt = (v: number) => (modo === 'pontos' ? String(Math.round(v)) : v.toFixed(2))
  const h = hover != null ? dados[hover] : null

  const mover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    let melhor = 0
    pts.forEach(([px2], i) => { if (Math.abs(px2 - px) < Math.abs(pts[melhor][0] - px)) melhor = i })
    setHover(melhor)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-[5px]">
          <span className="eyebrow">FORMA</span>
          <h2 className="m-0 text-[19px] font-bold tracking-[-0.02em]">Últimas {dados.length} partidas</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-[12px] text-mudo"><span className="w-5 border-t border-dashed border-white/40" />média {fmt(media)}</span>
          <Segmentado rotulo="Métrica do gráfico" valor={modo} onChange={setModo} opcoes={[{ valor: 'pontos', texto: 'Pontos' }, { valor: 'kda', texto: 'KDA' }]} />
        </div>
      </div>
      <div ref={caixa} className="relative">
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={`${modo === 'pontos' ? 'Pontos' : 'KDA'} nas últimas ${dados.length} partidas, média ${fmt(media)}`}
          onPointerMove={mover}
          onPointerLeave={() => setHover(null)}
          className="block touch-none"
        >
          <defs>
            <linearGradient id="rgFormaArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff5b1f" stopOpacity="0.22" />
              <stop offset="1" stopColor="#ff5b1f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {marcas.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={largura - m.r} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.06)" />
              <text x={m.l - 10} y={y(v) + 4} textAnchor="end" className="fill-mudo font-mono text-[10.5px]">{fmt(v)}</text>
            </g>
          ))}
          {pts.length > 1 && (
            <path d={`${caminho(pts)} L ${pts[pts.length - 1][0]} ${altura - m.b} L ${pts[0][0]} ${altura - m.b} Z`} fill="url(#rgFormaArea)" />
          )}
          <line x1={m.l} x2={largura - m.r} y1={y(media)} y2={y(media)} stroke="rgba(255,255,255,0.4)" strokeDasharray="4 5" />
          <path d={caminho(pts)} fill="none" stroke="#ff5b1f" strokeWidth="2.4" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,91,31,0.5))' }} />
          {hover != null && <line x1={pts[hover][0]} x2={pts[hover][0]} y1={m.t} y2={altura - m.b} stroke="rgba(255,255,255,0.15)" />}
          {pts.map(([px, py], i) => (
            <circle key={i} cx={px} cy={py} r={hover === i ? 6 : 4} fill={dados[i].venceu ? '#5fe3d6' : '#ff7d8f'} stroke="#101013" strokeWidth="2" />
          ))}
          {dados.length > 0 && (
            <>
              <text x={pts[0][0]} y={altura - 8} textAnchor="start" className="fill-mudo font-mono text-[10.5px]">{dataCurta(dados[0].data)}</text>
              <text x={pts[pts.length - 1][0]} y={altura - 8} textAnchor="end" className="fill-mudo font-mono text-[10.5px]">{dataCurta(dados[dados.length - 1].data)}</text>
            </>
          )}
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute z-10 flex w-[190px] flex-col gap-1 rounded-xl border border-white/10 bg-[rgba(12,12,14,0.96)] p-3 text-[12.5px] shadow-xl"
            style={{ left: Math.min(largura - 196, Math.max(0, pts[hover][0] - 95)), top: Math.max(0, pts[hover][1] - 112) }}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`font-bold ${h.venceu ? 'text-vitoria' : 'text-derrota'}`}>{h.venceu ? 'Vitória' : 'Derrota'} {h.resultado}</span>
              {h.mvp && <SeloMvp tamanho={18} />}
            </span>
            <span className="text-mudo">{h.mapa} · {h.adversario}</span>
            <span className="flex justify-between font-mono"><span>{h.pontos} pts</span><span className={h.delta > 0 ? 'text-vitoria' : 'text-derrota'}>{comSinal(h.delta)}</span></span>
            <span className="font-mono text-suave">KDA {h.kda != null ? h.kda.toFixed(2) : '-'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
