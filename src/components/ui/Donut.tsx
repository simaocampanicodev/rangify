import { useEffect, useState, type ReactNode } from 'react'

export interface ParteDonut { nome: string; valor: number; cor: string }

/**
 * Um anel de fatias (ideia do Donut Chart do EasyUI), desenhado à mão em SVG: os arcos desenham-se ao aparecer, a fatia por
 * baixo do rato acende e o centro passa a mostrar o valor dela. Sem rato, mostra o `centro`.
 */
export function Donut({ partes, centro, tamanho = 152, espessura = 14, rotulo }: {
  partes: ParteDonut[]; centro: ReactNode; tamanho?: number; espessura?: number; rotulo: string
}) {
  const [pronto, setPronto] = useState(false)
  const [sobre, setSobre] = useState<number | null>(null)
  useEffect(() => {
    const id = window.setTimeout(() => setPronto(true), 60)
    return () => window.clearTimeout(id)
  }, [])
  const total = partes.reduce((s, p) => s + p.valor, 0)
  const c = tamanho / 2
  const r = c - espessura / 2 - 4
  const volta = 2 * Math.PI * r
  // Um pequeno espaço entre fatias (só quando há mais do que uma com valor).
  const visiveis = partes.filter((p) => p.valor > 0).length
  const folga = visiveis > 1 ? 5 : 0
  let acumulado = 0
  const arcos = partes.map((p, i) => {
    const fracao = total ? p.valor / total : 0
    const comprimento = Math.max(0, fracao * volta - (p.valor > 0 ? folga : 0))
    const inicio = acumulado * volta + folga / 2
    acumulado += fracao
    return { ...p, i, comprimento, inicio }
  })
  const ativa = sobre != null ? partes[sobre] : null

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={`${rotulo}: ${partes.map((p) => `${p.nome} ${p.valor}`).join(', ')}`} style={{ overflow: 'visible' }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={espessura} />
        {arcos.filter((a) => a.valor > 0).map((a) => (
          <circle
            key={a.nome}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={a.cor}
            strokeWidth={sobre === a.i ? espessura + 4 : espessura}
            strokeLinecap="round"
            strokeDasharray={`${pronto ? a.comprimento : 0} ${volta}`}
            strokeDashoffset={-a.inicio}
            transform={`rotate(-90 ${c} ${c})`}
            opacity={sobre != null && sobre !== a.i ? 0.35 : 1}
            style={{ transition: 'stroke-dasharray .9s cubic-bezier(.16, 1, .3, 1), stroke-width .2s, opacity .2s', cursor: 'default', filter: sobre === a.i ? `drop-shadow(0 0 6px ${a.cor})` : undefined }}
            onPointerEnter={() => setSobre(a.i)}
            onPointerLeave={() => setSobre(null)}
          />
        ))}
      </svg>
      <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        {ativa
          ? <><span className="font-mono text-[26px] leading-none font-semibold tracking-[-0.04em]" style={{ color: ativa.cor }}>{ativa.valor}</span><span className="text-[11.5px] text-mudo">{ativa.nome}</span></>
          : centro}
      </span>
    </div>
  )
}
