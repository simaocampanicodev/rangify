/** Os playoffs: a chave de eliminação simples, desenhada ronda a ronda, com a final em destaque. */
import { Crown, Trophy } from 'lucide-react'
import { Painel, Vazio } from '@/components/ui'
import type { TorneioDetalhe, TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { dataHoraCurta, nomeMelhorDe, origemTexto, pontosJogo, rotuloJogo } from './comum'

const LARGURA = 250
const ALTURA = 92
const FOLGA_Y = 22
const FOLGA_X = 64
const TOPO = 34

function Caixa({ j, meuId, aoAbrir }: { j: TorneioJogo; meuId: string | null; aoAbrir: (j: TorneioJogo) => void }) {
  const linha = (lado: 'A' | 'B') => {
    const e = lado === 'A' ? j.equipaA : j.equipaB
    const origem = lado === 'A' ? j.origemA : j.origemB
    const score = pontosJogo(j, lado)
    const ganhou = j.estado === 'concluido' && !!e && j.vencedorId === e.id
    const meu = !!e && e.id === meuId
    return (
      <span className={`flex items-center justify-between gap-2 px-3 py-[9px] text-[13px] ${ganhou ? 'bg-vitoria/[0.09]' : ''} ${meu ? 'shadow-[inset_3px_0_0_var(--color-laranja)]' : ''}`}>
        <span className={`min-w-0 truncate ${e ? 'font-bold' : j.como === 'bye' ? 'text-mudo italic' : 'text-mudo'}`}>
          {e ? e.nome : j.como === 'bye' ? l('Folga', 'Bye') : origemTexto(origem)}
        </span>
        <span className={`font-mono text-[13px] ${ganhou ? 'font-bold text-vitoria' : 'text-mudo'}`}>{score ?? '—'}</span>
      </span>
    )
  }
  const final = j.rotulo === 'final'
  return (
    <button
      type="button"
      onClick={() => aoAbrir(j)}
      aria-label={rotuloJogo(j)}
      className={`flex w-full cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white/[0.03] p-0 text-left text-texto transition-colors hover:border-laranja/50 ${final ? 'border-ouro/40' : 'border-white/9'}`}
      style={{ height: ALTURA }}
    >
      {linha('A')}
      <span className="h-px bg-white/7" />
      {linha('B')}
      <span className={`mt-auto flex items-center gap-1.5 truncate border-t border-white/7 px-3 py-[5px] font-mono text-[10px] tracking-[0.1em] uppercase ${final ? 'text-ouro' : j.estado === 'a_decorrer' ? 'text-pessego' : 'text-mudo'}`}>
        {final && <Crown size={11} aria-hidden />}
        {nomeMelhorDe(j.melhorDe) && <span className="text-pessego-claro">{nomeMelhorDe(j.melhorDe)}</span>}
        {j.estado === 'concluido' ? l('Concluído', 'Finished')
          : j.estado === 'a_decorrer' ? l('A decorrer', 'In progress')
          : j.presencial ? l('Presencial', 'In person')
          : j.agendadoPara ? `${dataHoraCurta(j.agendadoPara)}${j.mapa ? ` · ${j.mapa}` : ''}`
          : l('Por marcar', 'To schedule')}
      </span>
    </button>
  )
}

export function Chave({ detalhe, meuId, aoAbrirJogo }: { detalhe: TorneioDetalhe; meuId: string | null; aoAbrirJogo: (j: TorneioJogo) => void }) {
  const jogos = detalhe.jogos.filter((j) => j.fase === 'playoff')
  const t = detalhe.torneio
  if (!jogos.length) {
    return (
      <Painel className="p-[22px]">
        <Vazio
          icone={<Trophy size={22} />}
          titulo={l('Os playoffs começam quando os grupos acabam', 'Playoffs start when the groups end')}
          texto={l(`Passam as ${t.passamPorGrupo} melhores equipas de cada grupo. A partir daí, quem perde está fora${t.finalPresencial ? ' e a final joga-se presencialmente' : ''}.`, `The top ${t.passamPorGrupo} teams of each group go through. From there, whoever loses is out${t.finalPresencial ? ' and the final is played in person' : ''}.`)}
        />
      </Painel>
    )
  }
  const rondas = Math.max(...jogos.map((j) => j.ronda))
  const primeira = jogos.filter((j) => j.ronda === 1).length
  const U = ALTURA + FOLGA_Y
  const altura = TOPO + primeira * U
  const largura = rondas * LARGURA + (rondas - 1) * FOLGA_X
  const x = (r: number) => (r - 1) * (LARGURA + FOLGA_X)
  const centro = (r: number, ordem: number) => TOPO + U * 2 ** (r - 1) * (ordem - 0.5)
  const topo = (r: number, ordem: number) => centro(r, ordem) - ALTURA / 2

  const ligacoes: string[] = []
  for (const j of jogos) {
    if (j.ronda === rondas) continue
    const par = Math.ceil(j.ordem / 2)
    const x1 = x(j.ronda) + LARGURA
    const x2 = x(j.ronda + 1)
    const xm = x1 + FOLGA_X / 2
    ligacoes.push(`M${x1},${centro(j.ronda, j.ordem)} H${xm} V${centro(j.ronda + 1, par)} H${x2}`)
  }
  const titulo = (r: number) => {
    const j = jogos.find((x) => x.ronda === r)!
    return j.rotulo === 'ronda' ? `${l('Ronda', 'Round')} ${r}` : rotuloJogo(j)
  }
  const campeao = t.campeao

  return (
    <Painel className="flex min-w-0 flex-col gap-4 p-[22px]">
      {campeao && (
        <div className="flex items-center gap-3 rounded-[14px] border border-ouro/30 bg-ouro/[0.07] px-4 py-3">
          <Crown size={22} className="text-ouro" aria-hidden />
          <span className="flex flex-col"><span className="font-mono text-[10px] tracking-[0.16em] text-ouro">{l('CAMPEÃO', 'CHAMPION')}</span><span className="text-[18px] font-extrabold">{campeao.nome}</span></span>
        </div>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="relative" style={{ width: largura, height: altura }}>
          {Array.from({ length: rondas }, (_, i) => i + 1).map((r) => (
            <span key={r} className="absolute font-mono text-[11px] font-semibold tracking-[0.16em] text-laranja uppercase" style={{ left: x(r), top: 0 }}>{titulo(r)}</span>
          ))}
          <svg aria-hidden className="pointer-events-none absolute inset-0" width={largura} height={altura} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.5">
            {ligacoes.map((d, i) => <path key={i} d={d} strokeLinejoin="round" />)}
          </svg>
          {jogos.map((j) => (
            <div key={j.id} className="absolute" style={{ left: x(j.ronda), top: topo(j.ronda, j.ordem), width: LARGURA }}>
              <Caixa j={j} meuId={meuId} aoAbrir={aoAbrirJogo} />
            </div>
          ))}
        </div>
      </div>
      <p className="m-0 text-[12px] leading-normal text-mudo">
        {l('Antes de se saber quem joga, cada lugar mostra de onde vem (1.º Grupo A, vencedor do jogo 2...).', 'Before it is known who plays, each slot shows where it comes from (1st Group A, winner of match 2...).')}
      </p>
    </Painel>
  )
}
