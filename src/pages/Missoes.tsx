import {
  Activity, ArrowLeftRight, Award, CircleCheck, Crosshair, Crown, Flame, Gamepad2, Handshake, Map as IconeMapa, Shuffle, Skull, Star, Target, TrendingUp, Trophy, Zap,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FaixaExperiencia, FaixaExperienciaEsqueleto } from '@/components/Experiencia'
import { BarraProgresso, BlocoIcone, BotaoAjuda, Cabecalho, Carregando, Chip, Painel, TituloPainel } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type Missao, type TipoMissao } from '@/lib/dados'
import { formatarXp } from '@/lib/experiencia'
import { duracaoAte, fimDaSemana } from '@/lib/tempo'

const ICONES: Record<TipoMissao, ReactNode> = {
  jogos: <Gamepad2 size={19} />, vitorias: <Trophy size={19} />, vitorias_acima: <TrendingUp size={19} />, first_bloods: <Crosshair size={19} />,
  mvp: <Star size={19} />, sequencia: <Flame size={19} />, acs: <Activity size={19} />, pontos: <Zap size={19} />,
  kills: <Skull size={19} />, assists: <Handshake size={19} />, trades: <ArrowLeftRight size={19} />, capitao: <Crown size={19} />,
  vitorias_capitao: <Award size={19} />, mapas: <IconeMapa size={19} />,
}

function fimDoDia(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
}

function Cartao({ m }: { m: Missao }) {
  return (
    <article className={`painel flex flex-col gap-3.5 !rounded-2xl p-[18px] ${m.concluida ? '!border-laranja/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <BlocoIcone>{ICONES[m.tipo]}</BlocoIcone>
        {m.concluida
          ? <Chip tom="laranja"><CircleCheck size={12} aria-hidden />+{formatarXp(m.xp)} XP</Chip>
          : <span className="inline-flex h-[26px] items-center rounded-full border border-laranja/35 px-2.5 font-mono text-[11.5px] font-bold text-pessego">+{formatarXp(m.xp)} XP</span>}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[15.5px] font-bold">{m.titulo}</h3>
        <p className="m-0 text-[13px] leading-normal text-[#a6a19a]">{m.descricao}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex justify-between font-mono text-[12px]">
          <span className="text-mudo">{m.concluida ? 'Concluída' : 'Progresso'}</span>
          <span className={m.concluida ? 'text-pessego' : 'text-suave'}>{m.progresso}/{m.alvo}</span>
        </div>
        <BarraProgresso valor={m.progresso} alvo={m.alvo} rotulo={m.titulo} />
      </div>
    </article>
  )
}

function Seccao({ id, eyebrow, titulo, renova, lista }: { id: string; eyebrow: string; titulo: string; renova?: string; lista: Missao[] }) {
  if (!lista.length) return null
  const feitas = lista.filter((m) => m.concluida).length
  return (
    <Painel aria-labelledby={id} className="flex flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={eyebrow}
        titulo={titulo}
        id={id}
        direita={<span className="font-mono text-[11.5px] text-mudo">{feitas}/{lista.length} feitas{renova ? ` · renovam em ${renova}` : ''}</span>}
      />
      {/* 4, 8 e 4 missões: em 2 ou 4 colunas as linhas ficam sempre completas. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{lista.map((m) => <Cartao key={m.id} m={m} />)}</div>
    </Painel>
  )
}

export function Missoes() {
  const acao = useAcao()
  const { perfil } = useSessao()
  const podeSortear = perfil?.funcao === 'owner' || perfil?.funcao === 'dev'
  const missoes = useCarregar(() => dados.missoes(), [], ['partida', 'staff'])
  const exp = useCarregar(() => dados.experiencia(), [], ['partida', 'staff'])
  const [aSortear, setASortear] = useState(false)
  if (missoes.carregando && !missoes.valor) return <Carregando />
  const lista = missoes.valor ?? []
  const diarias = lista.filter((m) => m.ambito === 'diaria')
  const semanais = lista.filter((m) => m.ambito === 'semanal')
  const temporada = lista.filter((m) => m.ambito === 'temporada')
  const feitas = lista.filter((m) => m.concluida).length

  const sortear = async () => {
    if (!window.confirm('Sortear missões diárias e semanais novas? O progresso delas volta a zero; o XP já ganho fica.')) return
    setASortear(true)
    const novas = await acao(() => dados.resetarMissoes(), 'Missões novas sorteadas.')
    setASortear(false)
    if (novas) { missoes.setValor(novas); exp.recarregar() }
  }

  return (
    <>
      <Cabecalho
        migalhas={['Comunidade', 'Missões']}
        titulo="Missões"
        descricao={<>Completa missões a jogar no hub para ganhar XP e subir de nível no passe da temporada.</>}
        acoes={
          <>
            {podeSortear && (
              <button type="button" className="btn btn-fantasma" disabled={aSortear} onClick={sortear}>
                <Shuffle size={15} className="text-laranja" aria-hidden />{aSortear ? 'A sortear…' : 'Sortear missões novas'}
              </button>
            )}
            <BotaoAjuda topico="missoes">Como funcionam as missões</BotaoAjuda>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Chip tom="laranja"><Target size={12} aria-hidden />{feitas} de {lista.length} concluídas</Chip>
      </div>
      {exp.valor ? <FaixaExperiencia exp={exp.valor} /> : <FaixaExperienciaEsqueleto />}
      <Seccao id="rg-hoje" eyebrow="DIÁRIAS" titulo="Hoje" renova={duracaoAte(fimDoDia().toISOString())} lista={diarias} />
      <Seccao id="rg-semana" eyebrow="SEMANAIS" titulo="Esta semana" renova={duracaoAte(fimDaSemana().toISOString())} lista={semanais} />
      <Seccao id="rg-temporada" eyebrow="TEMPORADA 1" titulo="Objetivos da temporada" lista={temporada} />
    </>
  )
}
