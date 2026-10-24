import { NumeroRolante } from '../ui/NumeroRolante'

/** Anel de contagem decrescente, como no protótipo do fluxo da partida. */
export function Relogio({ restante, total, tamanho = 92, espessura = 6, cor = '#ff5b1f', texto, legenda }: {
  restante: number; total: number; tamanho?: number; espessura?: number; cor?: string; texto?: string; legenda?: string
}) {
  const r = tamanho / 2 - espessura - 0.5
  const c = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, restante / Math.max(1, total)))
  const segundos = Math.ceil(restante)
  const urgente = segundos <= 5
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      {/* O brilho vai no SVG inteiro (e não no círculo), para seguir a curva em vez de ficar cortado em quadrado. */}
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={`${segundos} segundos restantes`}
        style={{ overflow: 'visible', filter: `drop-shadow(0 0 7px ${urgente ? 'rgba(255,125,143,.45)' : 'rgba(255,91,31,.45)'})` }}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={espessura} />
        <circle
          cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke={urgente ? '#ff7d8f' : cor} strokeWidth={espessura} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
          style={{ transition: 'stroke-dashoffset .3s linear' }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className={`font-mono leading-none font-semibold tracking-[-0.05em] ${urgente ? 'text-derrota' : ''}`} style={{ fontSize: tamanho * 0.29 }}>{texto ?? <NumeroRolante valor={segundos} contar={false} />}</span>
        {legenda && <span className="text-[12px] text-mudo">{legenda}</span>}
      </span>
    </div>
  )
}
