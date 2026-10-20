import { Check, Lock, Star, Trophy, Zap } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Experiencia } from '@/lib/data'
import { custoNivel, eMarco, formatarXp } from '@/lib/experiencia'
import { NomeRangify } from './Marca'
import { l } from '@/lib/idioma'

const NIVEIS_NA_PISTA = 7

function Destaque({ icone, valor, texto }: { icone: ReactNode; valor: string; texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-laranja/35 bg-laranja/12 text-laranja">{icone}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-[18px] leading-[1.1] font-bold">{valor}</span>
        <span className="truncate text-[12px] text-mudo">{texto}</span>
      </span>
    </div>
  )
}

/**
 * A faixa do passe no topo das Missões: nível, barra de XP até ao próximo,
 * lugar no ranking de nível e a pista dos próximos níveis.
 */
export function FaixaExperiencia({ exp }: { exp: Experiencia }) {
  const pct = Math.min(100, Math.round((exp.xpNoNivel / exp.xpParaProximo) * 100))
  const falta = exp.xpParaProximo - exp.xpNoNivel
  const primeiro = Math.max(1, exp.nivel - 2)
  const niveis = Array.from({ length: NIVEIS_NA_PISTA }, (_, i) => primeiro + i)
  // XP que ainda falta para chegar a cada nível futuro.
  const ate = (n: number) => {
    let t = falta
    for (let k = exp.nivel + 1; k < n; k++) t += custoNivel(k)
    return t
  }

  return (
    <section aria-labelledby="rg-xp" className="painel relative flex flex-col gap-[22px] overflow-hidden !border-laranja/28 px-[26px] pt-6 pb-[22px] shadow-[0_30px_80px_-50px_rgba(255,91,31,0.7)]">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex size-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[22px] border-[1.5px] border-laranja bg-laranja/12">
          <span className="font-mono text-[10px] font-bold tracking-[0.16em] text-pessego">{l('NÍVEL', 'LEVEL')}</span>
          <span className="text-[44px] leading-none font-black tracking-[-0.04em]">{exp.nivel}</span>
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-laranja">{l('PASSE DA TEMPORADA 1', 'SEASON 1 PASS')}</span>
          <h2 id="rg-xp" className="m-0 text-[28px] leading-none font-extrabold tracking-[-0.03em]"><NomeRangify className="text-laranja" /> Experience</h2>
          <div role="progressbar" aria-label={l(`XP do nível ${exp.nivel}`, `Level ${exp.nivel} XP`)} aria-valuemin={0} aria-valuemax={exp.xpParaProximo} aria-valuenow={exp.xpNoNivel} className="h-3 overflow-hidden rounded-full bg-white/7">
            <div className="h-full rounded-full bg-laranja shadow-[0_0_18px_rgba(255,91,31,0.7)] transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[13px]">
            <span className="font-mono font-semibold">{formatarXp(exp.xpNoNivel)} <span className="text-mudo">/ {formatarXp(exp.xpParaProximo)} XP</span></span>
            <span className="text-suave">{l('Faltam', '')} <span className="font-bold text-pessego">{formatarXp(falta)} XP</span> {l(`para o nível ${exp.nivel + 1}`, `to level ${exp.nivel + 1}`)}</span>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-[210px]">
          <Destaque icone={<Trophy size={17} />} valor={`#${exp.posicao}`} texto={l('na tabela de nível', 'on the level leaderboard')} />
          <Destaque icone={<Zap size={17} />} valor={`+${formatarXp(exp.xpSemana)} XP`} texto={l('ganhos esta semana', 'earned this week')} />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/7 pt-[18px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-mudo">{l('PRÓXIMOS NÍVEIS', 'NEXT LEVELS')}</span>
          <Link to="/ranking?tipo=nivel" className="text-[13px] font-semibold text-pessego no-underline hover:text-pessego-claro">{l('Ver tabela de nível', 'View level leaderboard')} ›</Link>
        </div>
        <ol className="m-0 grid list-none grid-cols-7 p-0">
          {niveis.map((n, i) => {
            const feito = n < exp.nivel
            const agora = n === exp.nivel
            const marco = eMarco(n) && !feito && !agora
            const ultimo = i === niveis.length - 1
            const linha: CSSProperties = {
              background: feito ? '#ff5b1f' : agora ? `linear-gradient(90deg, #ff5b1f 0%, #ff5b1f ${pct}%, rgba(255,255,255,0.1) ${pct}%)` : 'rgba(255,255,255,0.1)',
            }
            return (
              <li key={n} className="relative flex flex-col items-center gap-2" aria-current={agora ? 'step' : undefined}>
                {!ultimo && <span aria-hidden className="absolute top-[17px] right-[-50%] left-1/2 h-0.5" style={linha} />}
                {feito ? (
                  <span className="relative grid size-9 place-items-center rounded-full bg-laranja text-escuro-laranja"><Check size={16} strokeWidth={3} aria-hidden /></span>
                ) : agora ? (
                  <span className="relative grid size-9 place-items-center rounded-full border-2 border-laranja bg-[#2a1209] font-mono text-[12px] font-bold text-pessego shadow-[0_0_0_6px_rgba(255,91,31,0.14)]">{n}</span>
                ) : marco ? (
                  <span className="relative -mt-1 grid size-11 place-items-center rounded-[14px] border-[1.5px] border-laranja/60 bg-laranja/10 text-laranja"><Star size={20} aria-hidden /></span>
                ) : (
                  <span className="relative grid size-9 place-items-center rounded-full border-[1.5px] border-dashed border-white/22 bg-[#121214] font-mono text-[12px] font-bold text-mudo">
                    {ultimo ? <Lock size={14} aria-hidden /> : n}
                  </span>
                )}
                {/* Num telemóvel ficam só os círculos: os números já lá estão. */}
                <span className={`hidden font-mono text-[12px] font-bold sm:block ${agora ? 'text-pessego' : marco ? 'text-pessego' : feito ? 'text-texto' : 'text-mudo'}`}>
                  {agora ? l('AGORA', 'NOW') : `${l('NÍV.', 'LVL')} ${n}`}
                </span>
                <span className={`hidden text-center text-[12px] sm:block ${agora ? 'text-texto' : 'text-mudo'}`}>
                  {feito ? l('Feito', 'Done') : agora ? l(`${pct}% feito`, `${pct}% done`) : `${marco ? l('Marco · ', 'Milestone · ') : ''}${l('a', 'in')} ${formatarXp(ate(n))} XP`}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

/** Esqueleto com a mesma altura, enquanto o XP carrega. */
export function FaixaExperienciaEsqueleto() {
  return <div className="painel esqueleto h-[290px] !rounded-[20px]" aria-hidden />
}
