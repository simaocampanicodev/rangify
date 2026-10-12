import { Activity, CircleCheck, Crosshair, Flame, Gamepad2, Star, Target, TrendingUp, Trophy, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { BarraProgresso, BlocoIcone, BotaoAjuda, Cabecalho, Carregando, Chip, Painel, TituloPainel } from '@/components/ui'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type Missao } from '@/lib/dados'
import { duracaoAte, fimDaSemana } from '@/lib/tempo'

const ICONES: Record<Missao['tipo'], ReactNode> = {
  jogos: <Gamepad2 size={19} />, vitorias: <Trophy size={19} />, vitorias_acima: <TrendingUp size={19} />, first_bloods: <Crosshair size={19} />,
  mvp: <Star size={19} />, sequencia: <Flame size={19} />, acs: <Activity size={19} />, pontos: <Zap size={19} />,
}

function Cartao({ m }: { m: Missao }) {
  return (
    <article className={`painel flex flex-col gap-3.5 !rounded-2xl p-[18px] ${m.concluida ? '!border-laranja/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <BlocoIcone>{ICONES[m.tipo]}</BlocoIcone>
        {m.concluida ? <Chip tom="laranja"><CircleCheck size={12} aria-hidden />Concluída</Chip> : <Chip>{m.ambito === 'semanal' ? 'Semanal' : 'Temporada'}</Chip>}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[15.5px] font-bold">{m.titulo}</h3>
        <p className="m-0 text-[13px] leading-normal text-[#a6a19a]">{m.descricao}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex justify-between font-mono text-[12px]">
          <span className="text-mudo">Progresso</span>
          <span className={m.concluida ? 'text-pessego' : 'text-suave'}>{m.progresso}/{m.alvo}</span>
        </div>
        <BarraProgresso valor={m.progresso} alvo={m.alvo} rotulo={m.titulo} />
      </div>
    </article>
  )
}

export function Missoes() {
  const missoes = useCarregar(() => dados.missoes(), [], ['partida'])
  if (missoes.carregando && !missoes.valor) return <Carregando />
  const lista = missoes.valor ?? []
  const semanais = lista.filter((m) => m.ambito === 'semanal')
  const temporada = lista.filter((m) => m.ambito === 'temporada')
  const feitas = lista.filter((m) => m.concluida).length

  return (
    <>
      <Cabecalho
        migalhas={['Comunidade', 'Missões']}
        titulo="Missões"
        descricao="Objetivos que se completam a jogar no hub. O progresso vem das estatísticas de cada partida confirmada."
        acoes={<BotaoAjuda topico="missoes">Como funcionam as missões</BotaoAjuda>}
      />
      <div className="flex flex-wrap gap-2">
        <Chip tom="laranja"><Target size={12} aria-hidden />{feitas} de {lista.length} concluídas</Chip>
        <Chip>Semanais renovam em {duracaoAte(fimDaSemana().toISOString())}</Chip>
      </div>
      <Painel aria-labelledby="rg-semana" className="flex flex-col gap-4 p-[22px]">
        <TituloPainel eyebrow="SEMANAIS" titulo="Esta semana" id="rg-semana" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">{semanais.map((m) => <Cartao key={m.id} m={m} />)}</div>
      </Painel>
      <Painel aria-labelledby="rg-temporada" className="flex flex-col gap-4 p-[22px]">
        <TituloPainel eyebrow="TEMPORADA 1" titulo="Objetivos da temporada" id="rg-temporada" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">{temporada.map((m) => <Cartao key={m.id} m={m} />)}</div>
      </Painel>
    </>
  )
}
