/** Os mapas de um jogo à melhor de 3 ou 5: quem os escolheu, o lado de cada um, o resultado e qual é o seguinte. */
import { Check, Shield, Swords } from 'lucide-react'
import { Chip } from '@/components/ui'
import type { MapaSerieTorneio, TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { MAPAS } from '@/lib/mapas'
import { Papel } from './comum'

const nomeDe = (j: TorneioJogo, lado: 'A' | 'B' | null) => (lado === 'A' ? j.equipaA : lado === 'B' ? j.equipaB : null)?.nome ?? (lado ?? '?')

/** "Serie Dois começa a atacar" */
function ladoTexto(j: TorneioJogo, m: MapaSerieTorneio) {
  if (!m.ladoEquipa || !m.ladoEscolha) return null
  return l(`${nomeDe(j, m.ladoEquipa)} começa a ${m.ladoEscolha === 'ataque' ? 'atacar' : 'defender'}`, `${nomeDe(j, m.ladoEquipa)} starts on ${m.ladoEscolha === 'ataque' ? 'attack' : 'defence'}`)
}

export function SerieMapas({ jogo }: { jogo: TorneioJogo }) {
  if (!jogo.mapas.length) return null
  const feitos = jogo.serieA + jogo.serieB
  const agora = jogo.estado === 'concluido' ? -1 : feitos
  return (
    <section aria-label={l('Mapas da série', 'Series maps')} className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Papel>{l(`SÉRIE À MELHOR DE ${jogo.melhorDe}`, `BEST OF ${jogo.melhorDe}`)}</Papel>
        <span className="font-mono text-[12px] text-suave">
          {jogo.equipaA?.nome} <b className="text-texto">{jogo.serieA}</b> - <b className="text-texto">{jogo.serieB}</b> {jogo.equipaB?.nome}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {jogo.mapas.map((m, i) => {
          const arte = MAPAS.find((x) => x.nome === m.mapa)
          const atual = i === agora
          const feito = m.estado === 'concluido'
          const naoJogado = jogo.estado === 'concluido' && !feito
          const ganhouA = feito && m.vencedorId === jogo.equipaA?.id
          return (
            <li key={m.ordem} aria-current={atual ? 'step' : undefined} className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-xl border px-3 py-2.5 ${atual ? 'border-laranja/45 bg-laranja/[0.06]' : 'border-white/8 bg-white/[0.02]'} ${naoJogado ? 'opacity-55' : ''}`}>
              <span className="mapa h-[42px] w-[68px] shrink-0 rounded-[9px] border border-white/12" style={{ backgroundImage: arte ? `url(${arte.imagem})` : undefined, filter: naoJogado ? 'grayscale(1)' : undefined }} aria-hidden />
              <span className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10.5px] tracking-[0.1em] text-mudo">{l('MAPA', 'MAP')} {m.ordem}</span>
                  <b className="text-[15px] font-extrabold tracking-[-0.02em]">{m.mapa}</b>
                  {m.escolhidaPor === 'decisivo' && <Chip tom="ouro">{l('DECISIVO', 'DECIDER')}</Chip>}
                </span>
                <span className="text-[12px] leading-snug text-mudo">
                  {m.escolhidaPor === 'decisivo' ? l('O mapa que sobrou', 'The map left over') : l(`Escolhido por ${nomeDe(jogo, m.escolhidaPor)}`, `Picked by ${nomeDe(jogo, m.escolhidaPor)}`)}
                  {ladoTexto(jogo, m) && <> · <span className="inline-flex items-center gap-1 align-middle">{m.ladoEscolha === 'ataque' ? <Swords size={11} aria-hidden /> : <Shield size={11} aria-hidden />}{ladoTexto(jogo, m)}</span></>}
                </span>
              </span>
              <span className="flex items-center gap-2 font-mono text-[13px]">
                {feito ? (
                  <>
                    <span className="tabular-nums"><span className={ganhouA ? 'font-bold text-vitoria' : 'text-suave'}>{m.scoreA}</span><span className="px-1 text-mudo">-</span><span className={!ganhouA ? 'font-bold text-vitoria' : 'text-suave'}>{m.scoreB}</span></span>
                    <Check size={14} className="text-vitoria" aria-hidden />
                  </>
                ) : m.estado === 'a_decorrer' ? <Chip tom="laranja">{l('A DECORRER', 'IN PROGRESS')}</Chip>
                  : naoJogado ? <Chip>{l('NÃO JOGADO', 'NOT PLAYED')}</Chip>
                    : atual ? <Chip tom="laranja">{l('A SEGUIR', 'UP NEXT')}</Chip> : <Chip>{l('POR JOGAR', 'TO PLAY')}</Chip>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
