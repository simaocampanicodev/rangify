import { useEffect, useState, type ReactNode } from 'react'
import { l } from '@/lib/idioma'
import { NumeroRolante } from './NumeroRolante'

export interface LinhaRecibo { rotulo: ReactNode; valor: number }

/**
 * O recibo dos pontos (ideia do Payment Receipt Printer do EasyUI): um papel térmico escuro que sai da impressora aos
 * poucos, com cada linha de pontos a seguir à outra e o total a rolar no fim. Mostra de onde vieram os pontos da partida.
 */
export function ReciboPontos({ codigo, linhas, total, fila }: { codigo: string; linhas: LinhaRecibo[]; total: number; fila?: string }) {
  const sinal = (v: number) => (v > 0 ? `+${v}` : String(v))
  return (
    <div className="recibo-caixa" role="group" aria-label={l('Recibo dos pontos', 'Points receipt')}>
      <div className="recibo">
        <div className="flex items-center justify-between gap-6 font-mono text-[10px] tracking-[0.16em] text-mudo">
          <span>RANGIFY HUB</span><span>{codigo}{fila ? ` · ${fila}` : ''}</span>
        </div>
        <div className="recibo-tracejado" />
        {linhas.map((x, i) => (
          <div key={i} className="recibo-linha flex items-baseline justify-between gap-6 font-mono text-[12px]" style={{ ['--i' as string]: i }}>
            <span className="text-suave">{x.rotulo}</span>
            <span className={`font-semibold ${x.valor >= 0 ? 'text-vitoria' : 'text-derrota'}`}>{sinal(x.valor)}</span>
          </div>
        ))}
        <div className="recibo-tracejado" />
        <div className="recibo-linha flex items-end justify-between gap-6" style={{ ['--i' as string]: linhas.length }}>
          <span className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-mudo">{l('TOTAL', 'TOTAL')}</span>
          <span className={`font-mono text-[34px] leading-none font-semibold ${total >= 0 ? 'text-vitoria' : 'text-derrota'}`}>
            <NumeroRolante valor={sinal(total)} />
          </span>
        </div>
      </div>
    </div>
  )
}

/** Faíscas laranja a saltar de um ponto (a vitória): umas dezenas de pontinhos com CSS, só uma vez por partida. */
export function Festa({ chave }: { chave: string }) {
  const [ver, setVer] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const k = `rangify:festa:${chave}`
    try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1') } catch { /* sem armazenamento: dá a festa na mesma */ }
    setVer(true)
    const t = window.setTimeout(() => setVer(false), 2200)
    return () => window.clearTimeout(t)
  }, [chave])
  if (!ver) return null
  const cores = ['#ff5b1f', '#ff9466', '#ffb592', '#e6e1da']
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/3 left-1/2 z-10">
      {Array.from({ length: 28 }, (_, i) => {
        const ang = (i / 28) * Math.PI * 2 + (i % 3) * 0.2
        const dist = 70 + ((i * 37) % 70)
        return (
          <span
            key={i}
            className="faisca"
            style={{
              ['--dx' as string]: `${Math.cos(ang) * dist}px`,
              ['--dy' as string]: `${Math.sin(ang) * dist - 40}px`,
              ['--r' as string]: `${(i * 53) % 360}deg`,
              background: cores[i % cores.length],
              animationDelay: `${(i % 5) * 30}ms`,
            }}
          />
        )
      })}
    </span>
  )
}
