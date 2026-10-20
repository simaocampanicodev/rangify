import type { ResumoPartida } from '@/lib/data'
import { imagemMapa } from '@/lib/mapas'
import { comSinal } from '@/lib/pontos'
import { nomeRank } from '@/lib/ranks'
import { haQuanto } from '@/lib/tempo'
import { Chip, IconeAgente, SeloMvp } from './ui'
import { l } from '@/lib/idioma'

/** Uma partida no histórico: mapa, resultado, contexto e pontos. */
export function LinhaPartida({ m, onClick, i }: { m: ResumoPartida; onClick?: () => void; i?: number }) {
  const minha = m.minha
  const meus = minha ? (minha.equipa === 'A' ? m.resultadoA : m.resultadoB) : m.resultadoA
  const deles = minha ? (minha.equipa === 'A' ? m.resultadoB : m.resultadoA) : m.resultadoB
  const cor = minha ? (minha.venceu ? 'text-vitoria' : 'text-derrota') : 'text-texto'
  const conteudo = (
    <>
      <span aria-hidden className="mapa relative h-[50px] w-[78px] shrink-0 overflow-hidden rounded-[10px] border border-white/8" style={{ backgroundImage: `url(${imagemMapa(m.mapa, 'mini')})` }}>
        <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(0,0,0,0.75) 100%)' }} />
        <span className="absolute bottom-1.5 left-2 font-mono text-[9.5px] font-bold tracking-[0.12em] text-white/92">{m.mapa?.toUpperCase()}</span>
      </span>
      <span className="flex min-w-0 flex-[1_1_210px] flex-col gap-1">
        {minha ? (
          <span className="truncate text-[14.5px] font-semibold">
            <span className={cor}>{minha.venceu ? l('Vitória', 'Win') : l('Derrota', 'Loss')}</span> <span className="font-mono text-texto">{meus}-{deles}</span>
          </span>
        ) : (
          // A equipa que ganhou fica a laranja; o resultado vai para a direita.
          <span className="truncate text-[14.5px] font-semibold">
            <span className={m.vencedor === 'A' ? 'text-laranja' : 'text-texto'}>{l('Equipa', 'Team')} {m.capitaoA}</span>
            <span className="font-normal text-mudo"> vs </span>
            <span className={m.vencedor === 'B' ? 'text-laranja' : 'text-texto'}>{l('Equipa', 'Team')} {m.capitaoB}</span>
          </span>
        )}
        <span className="truncate text-[12.5px] text-mudo">
          {minha
            ? `${l('contra média', 'vs average')} ${nomeRank(minha.tierAdversario)} · ${haQuanto(m.terminouEm)}`
            : <><span className="font-mono text-suave">{m.codigo}</span>{` · ${haQuanto(m.terminouEm)}`}</>}
          {m.duracaoMin ? ` · ${m.duracaoMin} min` : ''}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1.5">
        {m.fila === 'ranked' && <Chip tom="laranja">RANKED</Chip>}
        {m.simulada && <Chip tom="laranja">{l('Teste', 'Test')}</Chip>}
        {minha?.mvp && <SeloMvp tamanho={26} />}
        {minha?.agente && <IconeAgente nome={minha.agente} tamanho={26} />}
        {minha && minha.kills != null && <Chip>{minha.kills}/{minha.deaths}/{minha.assists}</Chip>}
        {minha?.rangifyScore != null && <Chip tom={minha.rangifyScore >= 100 ? 'laranja' : undefined}>RS {minha.rangifyScore}</Chip>}
        {!minha && m.mvp && <span className="flex items-center gap-1.5 text-[12.5px] text-suave"><SeloMvp tamanho={22} />{m.mvp}</span>}
      </span>
      <span className="flex w-[76px] shrink-0 flex-col items-end gap-0.5">
        {minha ? (
          <>
            <span className={`font-mono text-[19px] font-semibold ${(minha.deltaPontos ?? 0) > 0 ? 'text-vitoria' : 'text-derrota'}`}>
              {minha.deltaPontos != null ? comSinal(minha.deltaPontos) : '-'}
            </span>
            <span className="text-[11px] text-mudo">{minha.acs != null ? `${minha.acs} ACS` : l('pontos', 'points')}</span>
          </>
        ) : (
          <>
            <span className="font-mono text-[19px] font-semibold text-texto">{m.resultadoA ?? '-'}-{m.resultadoB ?? '-'}</span>
            <span className="text-[11px] text-mudo">{l('resultado', 'score')}</span>
          </>
        )}
      </span>
    </>
  )
  const classe = `flex w-full flex-wrap items-center gap-3.5 border-t border-white/6 py-[13px] text-left text-texto ${i != null ? 'entra-linha' : ''}`
  const estilo = i != null ? ({ '--i': i } as React.CSSProperties) : undefined
  return onClick
    ? <button type="button" onClick={onClick} style={estilo} className={`${classe} linha-hover -mx-2 cursor-pointer rounded-lg border-x-0 border-b-0 bg-transparent px-2`}>{conteudo}</button>
    : <div className={classe} style={estilo}>{conteudo}</div>
}
