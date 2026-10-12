import { ArrowRight, LoaderCircle, LogOut, Timer } from 'lucide-react'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { useFila } from '@/hooks/useFila'
import { relogio } from '@/lib/tempo'
import { NomeRangify } from './Marca'

/** O estado da fila já pronto a mostrar: lugares ocupados, tempo de espera e castigo. */
export function useVistaFila() {
  const { fila, ocupado, alternar } = useFila()
  const { perfil } = useSessao()
  const agora = useAgora(1000)
  const naFila = !!fila?.naFila
  return {
    naFila,
    ocupado,
    alternar,
    contagem: Math.min(10, fila?.contagem ?? 0),
    regiao: (fila?.regiao ?? perfil?.regiao ?? 'eu').toUpperCase(),
    espera: naFila && fila?.desde ? Math.max(0, (agora - new Date(fila.desde).getTime()) / 1000) : 0,
    castigo: fila?.cooldownAte ? Math.max(0, (new Date(fila.cooldownAte).getTime() - agora) / 1000) : 0,
  }
}

/** Entrar, sair ou a contagem do castigo. */
export function BotaoFila({ grande = false }: { grande?: boolean }) {
  const { naFila, ocupado, alternar, castigo } = useVistaFila()
  const tamanho = grande ? '!h-[50px] !rounded-xl !px-6 !text-[15px] !font-extrabold' : ''
  if (naFila) {
    return (
      <button type="button" className={`btn btn-fantasma ${grande ? '!h-[50px] !rounded-xl !px-5' : ''}`} disabled={ocupado} onClick={alternar}>
        {ocupado ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <LogOut size={16} className="text-laranja" aria-hidden />}
        Sair da fila
      </button>
    )
  }
  return (
    <button type="button" className={`btn btn-primario ${tamanho}`} disabled={ocupado || castigo > 0} onClick={alternar}>
      {castigo > 0 ? <><Timer size={16} aria-hidden />{relogio(castigo)}</> : <>Entrar na fila<ArrowRight size={16} aria-hidden /></>}
    </button>
  )
}

/** "Rangify Hub · EU", com o nome da marca no estilo de sempre. */
export function EtiquetaHub({ regiao }: { regiao: string }) {
  return (
    <span className="inline-flex h-[30px] items-center rounded-[9px] border border-laranja/32 bg-laranja/12 px-3 text-[12.5px] whitespace-nowrap text-pessego-claro">
      <NomeRangify />&nbsp;Hub · {regiao}
    </span>
  )
}

/** Dashboard: dez segmentos à volta da contagem, um por lugar na sala. */
export function AnelFila({ tamanho = 200, contagem, naFila, legenda }: { tamanho?: number; contagem: number; naFila: boolean; legenda: string }) {
  const c = tamanho / 2
  const r = c - 14
  const segmentos = Array.from({ length: 10 }, (_, i) => {
    const a0 = ((-90 + i * 36 + 4) * Math.PI) / 180
    const a1 = ((-90 + (i + 1) * 36 - 4) * Math.PI) / 180
    const d = `M ${(c + r * Math.cos(a0)).toFixed(1)} ${(c + r * Math.sin(a0)).toFixed(1)} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(1)} ${(c + r * Math.sin(a1)).toFixed(1)}`
    const cor = i < contagem ? (naFila && i === 0 ? '#ffb592' : '#ff5b1f') : 'rgba(255,255,255,0.08)'
    return <path key={i} d={d} fill="none" stroke={cor} strokeWidth={11} strokeLinecap="round" style={{ transition: 'stroke .4s' }} />
  })
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={`${contagem} de 10 lugares preenchidos`} style={{ overflow: 'visible', filter: 'drop-shadow(0 0 14px rgba(255,91,31,0.35))' }}>
        {segmentos}
      </svg>
      {naFila && (
        <svg aria-hidden className="fila-gira absolute inset-0" width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ overflow: 'visible' }}>
          <circle cx={c} cy={c} r={r - 18} fill="none" stroke="rgba(255,181,146,0.35)" strokeWidth={1.5} strokeDasharray="3 9" />
        </svg>
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="font-mono leading-none font-semibold tracking-[-0.05em]" style={{ fontSize: tamanho * 0.22 }}>
          {contagem}<span className="text-mudo" style={{ fontSize: tamanho * 0.095 }}>/10</span>
        </span>
        <span className={`font-mono text-[11px] tracking-[0.1em] ${naFila ? 'respira text-pessego' : 'text-mudo'}`}>{legenda}</span>
      </span>
    </div>
  )
}

// Dez posições fixas no radar (num quadro de 300x300); a primeira és tu.
const POSICOES: [number, number][] = [[150, 92], [222, 118], [84, 176], [196, 214], [118, 58], [252, 182], [62, 112], [150, 250], [104, 228], [232, 66]]

/** Página Jogar: os jogadores aparecem como pontos num radar que roda enquanto estás na fila. */
export function RadarFila({ contagem, naFila, legenda }: { contagem: number; naFila: boolean; legenda: string }) {
  return (
    <div className="relative size-[300px] shrink-0">
      <svg width="300" height="300" viewBox="0 0 300 300" role="img" aria-label={`${contagem} de 10 jogadores encontrados`} style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="rgRadarFundo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ff5b1f" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ff5b1f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rgRadarFeixe" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff5b1f" stopOpacity="0" />
            <stop offset="1" stopColor="#ff5b1f" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        <circle cx="150" cy="150" r="140" fill="url(#rgRadarFundo)" />
        <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(255,255,255,0.08)" />
        <circle cx="150" cy="150" r="100" fill="none" stroke="rgba(255,255,255,0.06)" />
        <circle cx="150" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.05)" />
        <path d="M150 10 V290 M10 150 H290" stroke="rgba(255,255,255,0.04)" />
        {naFila && (
          <>
            <g className="fila-varre"><path d="M150 150 L150 10 A140 140 0 0 1 249 51 Z" fill="url(#rgRadarFeixe)" opacity="0.55" /></g>
            <circle className="fila-pulso" cx="150" cy="150" r="60" fill="none" stroke="#ff5b1f" strokeOpacity="0.5" />
          </>
        )}
        {POSICOES.map(([x, y], i) => {
          const eu = naFila && i === 0
          const cheio = i < contagem
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={eu ? 9 : 6.5}
              fill={cheio ? (eu ? '#ffb592' : '#ff5b1f') : 'transparent'}
              stroke={cheio ? (eu ? '#ffd2bd' : 'rgba(255,91,31,0.8)') : 'rgba(255,255,255,0.18)'}
              strokeWidth={1.5}
              className={cheio ? 'fila-ponto' : undefined}
            />
          )
        })}
      </svg>
      <span className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-[14px] border border-white/8 bg-[rgba(9,9,11,0.72)] px-3.5 py-2.5">
        <span className="font-mono text-[30px] leading-none font-semibold tracking-[-0.04em]">{contagem}<span className="text-[15px] text-mudo">/10</span></span>
        <span className={`font-mono text-[10px] tracking-[0.1em] ${naFila ? 'text-pessego' : 'text-mudo'}`}>{legenda}</span>
      </span>
    </div>
  )
}

const FASES = ['Fila', 'Confirmar', 'Draft', 'Mapas', 'Código', 'Resultado']

/** A linha das fases da partida, com a fila (a atual) destacada. */
export function LinhaFases() {
  return (
    <ol aria-label="Fases da partida" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      {FASES.map((f, i) => (
        <li key={f} className="flex items-center gap-1.5" aria-current={i === 0 ? 'step' : undefined}>
          <span className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold ${i === 0 ? 'border-laranja/60 bg-laranja/15 text-pessego-claro' : 'border-white/8 bg-white/[0.02] text-mudo'}`}>
            <span className={`font-mono text-[10.5px] ${i === 0 ? 'text-laranja' : 'text-[#5f5b56]'}`}>0{i + 1}</span>{f}
          </span>
          {i < FASES.length - 1 && <span aria-hidden className="h-px w-3.5 bg-white/14" />}
        </li>
      ))}
    </ol>
  )
}
