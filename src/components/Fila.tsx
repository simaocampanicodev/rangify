import { ArrowRight, LoaderCircle, LogOut, Timer } from 'lucide-react'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { useFila } from '@/hooks/useFila'
import { relogio } from '@/lib/tempo'
import { NomeRangify } from './Marca'
import { l } from '@/lib/idioma'

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
        {l('Sair da fila', 'Leave queue')}
      </button>
    )
  }
  return (
    <button type="button" className={`btn btn-primario ${tamanho}`} disabled={ocupado || castigo > 0} onClick={alternar}>
      {castigo > 0 ? <><Timer size={16} aria-hidden />{relogio(castigo)}</> : <>{l('Entrar na fila', 'Join queue')}<ArrowRight size={16} aria-hidden /></>}
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
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={l(`${contagem} de 10 lugares preenchidos`, `${contagem} of 10 spots filled`)} style={{ overflow: 'visible', filter: 'drop-shadow(0 0 14px rgba(255,91,31,0.35))' }}>
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
