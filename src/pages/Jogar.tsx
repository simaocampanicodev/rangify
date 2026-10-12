import { Ban, Check, ClipboardPaste, Crown, Flag, Swords, Users } from 'lucide-react'
import { FerramentasDev } from '@/components/FerramentasDev'
import { BotaoFila, LinhaFases, RadarFila, useVistaFila } from '@/components/Fila'
import { NomeRangify } from '@/components/Marca'
import { Codigo } from '@/components/partida/Codigo'
import { Draft } from '@/components/partida/Draft'
import { Mapas } from '@/components/partida/Mapas'
import { Resultado } from '@/components/partida/Resultado'
import { BlocoIcone, BotaoAjuda, Cabecalho, Carregando, Chip, Painel } from '@/components/ui'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import type { EstadoPartida, Partida } from '@/lib/dados'
import { TOTAL_BANS } from '@/lib/mapas'
import { relogio } from '@/lib/tempo'
import { MINUTOS_BLOQUEIO, SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA } from '@/lib/regras'

const FASES: { estados: EstadoPartida[]; nome: string }[] = [
  { estados: ['READY_CHECK'], nome: 'Confirmar' },
  { estados: ['DRAFT_PHASE'], nome: 'Draft' },
  { estados: ['MAP_BAN'], nome: 'Mapas' },
  { estados: ['LOBBY_CREATION'], nome: 'Código' },
  { estados: ['IN_PROGRESS'], nome: 'Em jogo' },
  { estados: ['RESULT_SUBMISSION', 'DISPUTE', 'PROCESSING_API', 'COMPLETED'], nome: 'Resultado' },
]

function Progresso({ p }: { p: Partida }) {
  const atual = FASES.findIndex((f) => f.estados.includes(p.estado))
  return (
    <nav aria-label="Fases da partida" className="painel flex flex-wrap items-center gap-x-4 gap-y-3 !rounded-2xl px-4 py-3">
      <span className="flex items-center gap-2 font-mono text-[12px] font-semibold text-pessego">
        <span className="ao-vivo size-2 rounded-full bg-laranja" />{p.codigo}
      </span>
      {p.simulada && <Chip tom="laranja">{p.automatica ? 'Simulação automática' : 'Simulada'}</Chip>}
      <ol className="m-0 flex flex-1 list-none flex-wrap items-center gap-1.5 p-0">
        {FASES.map((f, i) => {
          const feita = i < atual || p.estado === 'COMPLETED'
          const agora = i === atual && p.estado !== 'COMPLETED'
          return (
            <li key={f.nome} aria-current={agora ? 'step' : undefined} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden className={`h-px w-4 ${feita || agora ? 'bg-laranja/60' : 'bg-white/10'}`} />}
              <span className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold ${agora ? 'border-laranja/60 bg-laranja/15 text-pessego-claro' : feita ? 'border-transparent text-suave' : 'border-transparent text-mudo'}`}>
                {feita && <Check size={12} className="text-laranja" aria-hidden />}
                {f.nome}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function ComoFunciona() {
  const passos = [
    { icone: <Users size={18} />, titulo: 'Fila e confirmação', texto: `10 jogadores, ${SEGUNDOS_CONFIRMAR} s para aceitar.`, topico: 'fila' as const },
    { icone: <Crown size={18} />, titulo: 'Draft', texto: `2 capitães escolhem à vez, ${SEGUNDOS_ESCOLHA} s por escolha.`, topico: 'draft' as const },
    { icone: <Ban size={18} />, titulo: 'Ban de mapas', texto: `${TOTAL_BANS} bans de ${SEGUNDOS_BAN} s, sobra o decisivo.`, topico: 'mapas' as const },
    { icone: <ClipboardPaste size={18} />, titulo: 'Código do grupo', texto: `O Capitão A partilha, bloqueio de ${MINUTOS_BLOQUEIO} min.`, topico: 'codigo' as const },
    { icone: <Flag size={18} />, titulo: 'Resultado', texto: 'Os capitães submetem e a API confirma.', topico: 'resultado' as const },
  ]
  return (
    <Painel aria-labelledby="rg-fases" className="flex flex-col gap-4 p-[22px]">
      <div className="flex flex-col gap-[5px]">
        <span className="eyebrow">COMO CORRE UMA PARTIDA</span>
        <h2 id="rg-fases" className="m-0 text-[19px] font-bold tracking-[-0.02em]">Cinco fases, do aceitar aos pontos</h2>
      </div>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 p-0">
        {passos.map((s, i) => (
          <li key={s.titulo} className="flex flex-col gap-2.5 rounded-[14px] border border-white/7 bg-white/[0.03] p-3.5">
            <span className="flex items-center justify-between">
              <BlocoIcone tamanho={36}>{s.icone}</BlocoIcone>
              <span className="font-mono text-[12px] font-extrabold text-laranja">0{i + 1}</span>
            </span>
            <span className="text-[14px] font-bold">{s.titulo}</span>
            <span className="text-[12.5px] leading-normal text-mudo">{s.texto}</span>
            {/* O botão fica sempre no fundo do cartão, à mesma altura em todos. */}
            <span className="mt-auto flex flex-col pt-1.5"><BotaoAjuda topico={s.topico} pequeno>Como funciona</BotaoAjuda></span>
          </li>
        ))}
      </ol>
    </Painel>
  )
}

/** O cartão do Rangify Hub: o radar com os jogadores encontrados, as fases e o botão da fila. */
function PainelFila() {
  const { naFila, contagem, regiao, espera, castigo } = useVistaFila()
  const faltam = 10 - contagem
  return (
    <Painel aria-labelledby="rg-fila" className="flex min-w-0 flex-wrap items-center gap-x-11 gap-y-6 px-[34px] py-[26px]">
      <RadarFila contagem={contagem} naFila={naFila} legenda={naFila ? relogio(espera) : 'NA SALA'} />
      <div className="flex min-w-[280px] flex-1 flex-col gap-4">
        <span className="eyebrow flex items-baseline gap-1.5"><NomeRangify className="text-[15px] tracking-normal normal-case" />HUB · {regiao}</span>
        <h2 id="rg-fila" className="m-0 text-[34px] leading-[1.05] font-extrabold tracking-[-0.035em]">{naFila ? 'À procura de jogadores…' : 'Pronto para a próxima?'}</h2>
        <p className="m-0 max-w-[560px] text-[14.5px] leading-[1.55] text-suave">
          {castigo > 0
            ? `Não aceitaste a última partida. Podes voltar à fila daqui a ${relogio(castigo)}.`
            : naFila
              ? `Faltam ${faltam} ${faltam === 1 ? 'jogador' : 'jogadores'} da tua região. Podes andar pelo site: quando a sala encher, ouves um som e aparece o alerta para aceitar.`
              : 'Entra na fila da tua região. Com 10 jogadores, aceitas a partida e segues para o draft dos capitães, os bans e o código do grupo.'}
        </p>
        <LinhaFases />
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <BotaoFila grande />
          <span className="text-[13px] text-mudo">
            {naFila ? `Tens ${SEGUNDOS_CONFIRMAR} segundos para aceitar quando a sala encher.` : `${contagem} ${contagem === 1 ? 'jogador está' : 'jogadores estão'} à espera.`}
          </span>
        </div>
      </div>
    </Painel>
  )
}

export function Jogar() {
  const { partida } = usePartida()
  const { perfil } = useSessao()
  if (!perfil) return <Carregando />
  const eu = perfil.id

  if (partida) {
    let fase: React.ReactNode
    switch (partida.estado) {
      case 'READY_CHECK': fase = <Carregando texto="À espera de que todos aceitem a partida…" />; break
      case 'DRAFT_PHASE': fase = <Draft p={partida} eu={eu} />; break
      case 'MAP_BAN': fase = <Mapas p={partida} eu={eu} />; break
      case 'LOBBY_CREATION':
      case 'IN_PROGRESS': fase = <Codigo p={partida} eu={eu} />; break
      default: fase = <Resultado p={partida} eu={eu} />
    }
    return (
      <>
        <Progresso p={partida} />
        {fase}
        <FerramentasDev />
      </>
    )
  }

  return (
    <>
      <Cabecalho
        migalhas={['Hub', 'Jogar']}
        titulo="Jogar"
        descricao="Entra na fila da tua região. Quando houver 10 jogadores, recebes o alerta para aceitar e segues para o draft."
      />
      <PainelFila />
      <FerramentasDev />
      <ComoFunciona />
      <p className="m-0 flex items-center gap-2 text-[12.5px] text-mudo"><Swords size={14} className="text-laranja" aria-hidden />Precisas do Riot ID ligado e de jogar com essa conta, para o resultado ser confirmado.</p>
    </>
  )
}
