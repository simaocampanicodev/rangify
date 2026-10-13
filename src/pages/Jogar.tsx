import { Ban, Check, ClipboardPaste, Crown, Flag, Hash, Swords, Users, Volume2 } from 'lucide-react'
import { Suspense, lazy, useEffect } from 'react'
import { FerramentasDev } from '@/components/FerramentasDev'
import { AnelFila, BotaoFila, EtiquetaHub, useVistaFila } from '@/components/Fila'
import { BlocoIcone, BotaoAjuda, Cabecalho, Carregando, Chip, Painel } from '@/components/ui'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { dados, type EstadoPartida, type Partida } from '@/lib/dados'
import { ROTACAO_PADRAO, totalBans } from '@/lib/mapas'
import { useCarregar } from '@/hooks/useCarregar'
import { useIntervalo } from '@/hooks/useVisivel'
import { relogio } from '@/lib/tempo'
import { MINUTOS_BLOQUEIO, SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA } from '@/lib/regras'
import { l } from '@/lib/idioma'

// Os ecrãs da partida só descarregam quando há fila ou partida (ver preCarregarPartida).
const carregarCodigo = () => import('@/components/partida/Codigo')
const carregarDraft = () => import('@/components/partida/Draft')
const carregarMapas = () => import('@/components/partida/Mapas')
const carregarResultado = () => import('@/components/partida/Resultado')
const Codigo = lazy(() => carregarCodigo().then((m) => ({ default: m.Codigo })))
const Draft = lazy(() => carregarDraft().then((m) => ({ default: m.Draft })))
const Mapas = lazy(() => carregarMapas().then((m) => ({ default: m.Mapas })))
const Resultado = lazy(() => carregarResultado().then((m) => ({ default: m.Resultado })))

/** Ao entrar na fila já se descarregam os ecrãs, para a partida abrir sem espera. */
function preCarregarPartida() {
  carregarDraft(); carregarMapas(); carregarCodigo(); carregarResultado()
}

const fases = (): { estados: EstadoPartida[]; nome: string }[] => [
  { estados: ['READY_CHECK'], nome: l('Confirmar', 'Ready check') },
  { estados: ['DRAFT_PHASE'], nome: 'Draft' },
  { estados: ['MAP_BAN'], nome: l('Mapas', 'Maps') },
  { estados: ['LOBBY_CREATION'], nome: l('Código', 'Code') },
  { estados: ['IN_PROGRESS'], nome: l('Em jogo', 'In game') },
  { estados: ['RESULT_SUBMISSION', 'DISPUTE', 'PROCESSING_API', 'COMPLETED'], nome: l('Resultado', 'Result') },
]

/** O chat e a call da tua equipa no Discord, quando o bot já os criou. */
function LinksDiscord({ p }: { p: Partida }) {
  const links = useCarregar(() => dados.discordPartida(p.id), [p.id, p.estado])
  // A criação demora uns segundos depois de as equipas fecharem: volta a perguntar até aparecer.
  const { recarregar, valor } = links
  useIntervalo(recarregar, valor ? null : 8000)
  if (!valor) return null
  const url = (canal: string) => `https://discord.com/channels/${valor.servidor}/${canal}`
  const botao = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-laranja/35 bg-laranja/10 px-2.5 text-[12.5px] font-semibold text-pessego-claro no-underline hover:bg-laranja/20'
  return (
    <span className="flex flex-wrap gap-1.5">
      <a href={url(valor.chat)} target="_blank" rel="noreferrer" className={botao}><Hash size={13} aria-hidden />{l('Chat da partida', 'Match chat')}</a>
      <a href={url(valor.call)} target="_blank" rel="noreferrer" className={botao}><Volume2 size={13} aria-hidden />{l('Call da equipa', 'Team call')}</a>
    </span>
  )
}

function Progresso({ p }: { p: Partida }) {
  const FASES = fases()
  const atual = FASES.findIndex((f) => f.estados.includes(p.estado))
  return (
    <nav aria-label={l('Fases da partida', 'Match phases')} className="painel flex flex-wrap items-center gap-x-4 gap-y-3 !rounded-2xl px-4 py-3">
      <span className="flex items-center gap-2 font-mono text-[12px] font-semibold text-pessego">
        <span className="ao-vivo size-2 rounded-full bg-laranja" />{p.codigo}
      </span>
      {p.simulada && <Chip tom="laranja">{p.automatica ? l('Simulação automática', 'Automatic simulation') : l('Simulada', 'Simulated')}</Chip>}
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
      <LinksDiscord p={p} />
    </nav>
  )
}

function ComoFunciona() {
  const rotacao = useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas', fresco: 300_000 })
  const bans = totalBans(rotacao.valor ?? ROTACAO_PADRAO)
  const passos = [
    { icone: <Users size={18} />, titulo: l('Fila e confirmação', 'Queue and ready check'), texto: l(`10 jogadores, ${SEGUNDOS_CONFIRMAR} s para aceitar.`, `10 players, ${SEGUNDOS_CONFIRMAR} s to accept.`), topico: 'fila' as const },
    { icone: <Crown size={18} />, titulo: 'Draft', texto: l(`2 capitães escolhem à vez, ${SEGUNDOS_ESCOLHA} s por escolha.`, `2 captains pick in turns, ${SEGUNDOS_ESCOLHA} s per pick.`), topico: 'draft' as const },
    { icone: <Ban size={18} />, titulo: l('Ban de mapas', 'Map ban'), texto: l(`${bans} bans de ${SEGUNDOS_BAN} s, sobra o decisivo.`, `${bans} bans of ${SEGUNDOS_BAN} s, the decider is left.`), topico: 'mapas' as const },
    { icone: <ClipboardPaste size={18} />, titulo: l('Código do grupo', 'Party code'), texto: l(`O Capitão A partilha, bloqueio de ${MINUTOS_BLOQUEIO} min.`, `Captain A shares it, ${MINUTOS_BLOQUEIO}-min lock.`), topico: 'codigo' as const },
    { icone: <Flag size={18} />, titulo: l('Resultado', 'Result'), texto: l('Os capitães submetem e a API confirma.', 'The captains submit and the API confirms.'), topico: 'resultado' as const },
  ]
  return (
    <Painel aria-labelledby="rg-fases" className="flex flex-col gap-4 p-[22px]">
      <div className="flex flex-col gap-[5px]">
        <span className="eyebrow">{l('COMO CORRE UMA PARTIDA', 'HOW A MATCH GOES')}</span>
        <h2 id="rg-fases" className="m-0 text-[19px] font-bold tracking-[-0.02em]">{l('Cinco fases, do aceitar aos pontos', 'Five phases, from accepting to points')}</h2>
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
            <span className="mt-auto flex flex-col pt-1.5"><BotaoAjuda topico={s.topico} pequeno>{l('Como funciona', 'How it works')}</BotaoAjuda></span>
          </li>
        ))}
      </ol>
    </Painel>
  )
}

/** O mesmo anel, chips e botão do cartão do Dashboard, para as duas páginas falarem a mesma língua. */
function PainelFila() {
  const { naFila, contagem, regiao, espera, castigo } = useVistaFila()
  const rotacao = useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas', fresco: 300_000 })
  const faltam = 10 - contagem
  const chip = 'inline-flex h-[30px] items-center rounded-[9px] border border-white/8 bg-white/[0.035] px-3 text-[12.5px] text-[#d0cbc4]'
  return (
    <Painel aria-labelledby="rg-fila" className="flex min-w-0 flex-wrap items-center gap-x-10 gap-y-6 px-[34px] py-[30px]">
      <AnelFila
        tamanho={196}
        contagem={contagem}
        naFila={naFila}
        legenda={naFila ? `${l('NA FILA', 'IN QUEUE')} ${relogio(espera)}` : castigo > 0 ? `${l('CASTIGO', 'COOLDOWN')} ${relogio(castigo)}` : l('À ESPERA DE TI', 'WAITING FOR YOU')}
      />
      <div className="flex min-w-[280px] flex-1 flex-col gap-3.5">
        <span className="eyebrow">RANGIFY HUB · {regiao.toUpperCase()}</span>
        <h2 id="rg-fila" className="m-0 text-[34px] leading-[1.05] font-extrabold tracking-[-0.035em]">{naFila ? l('À procura de jogadores…', 'Looking for players…') : l('Pronto para a próxima?', 'Ready for the next one?')}</h2>
        <p className="m-0 max-w-[560px] text-[14.5px] leading-[1.55] text-suave">
          {castigo > 0
            ? l(`Não aceitaste a última partida. Podes voltar à fila daqui a ${relogio(castigo)}.`, `You did not accept the last match. You can queue again in ${relogio(castigo)}.`)
            : naFila
              ? l(`Faltam ${faltam} ${faltam === 1 ? 'jogador' : 'jogadores'} da tua região. Podes andar pelo site: quando a sala encher, ouves um som e aparece o alerta para aceitar.`, `${faltam} ${faltam === 1 ? 'player' : 'players'} from your region to go. You can browse the site: when the lobby fills, you hear a sound and the accept alert shows up.`)
              : l('Entra na fila da tua região. Com 10 jogadores, aceitas a partida e segues para o draft dos capitães, os bans e o código do grupo.', 'Join your region\'s queue. With 10 players, you accept the match and go on to the captains\' draft, the bans and the party code.')}
        </p>
        <div className="flex flex-wrap gap-2">
          <EtiquetaHub regiao={regiao} />
          <span className={chip}>{SEGUNDOS_CONFIRMAR} s {l('para aceitar', 'to accept')}</span>
          <span className={chip}>{l('2 capitães', '2 captains')} · {(rotacao.valor ?? ROTACAO_PADRAO).length} {l('mapas', 'maps')}</span>
          <span className={chip}>{l('5 fases até aos pontos', '5 phases to the points')}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <BotaoFila grande />
          <span className="text-[13px] text-mudo">
            {naFila ? l(`Tens ${SEGUNDOS_CONFIRMAR} segundos para aceitar quando a sala encher.`, `You have ${SEGUNDOS_CONFIRMAR} seconds to accept when the lobby fills.`) : l(`${contagem} ${contagem === 1 ? 'jogador está' : 'jogadores estão'} à espera.`, `${contagem} ${contagem === 1 ? 'player is' : 'players are'} waiting.`)}
          </span>
        </div>
      </div>
    </Painel>
  )
}

export function Jogar() {
  const { partida, fila } = usePartida()
  const { perfil } = useSessao()
  const preparar = !!partida || !!fila?.naFila
  useEffect(() => { if (preparar) preCarregarPartida() }, [preparar])
  if (!perfil) return <Carregando />
  const eu = perfil.id

  if (partida) {
    let fase: React.ReactNode
    switch (partida.estado) {
      case 'READY_CHECK': fase = <Carregando texto={l('À espera de que todos aceitem a partida…', 'Waiting for everyone to accept the match…')} />; break
      case 'DRAFT_PHASE': fase = <Draft p={partida} eu={eu} />; break
      case 'MAP_BAN': fase = <Mapas p={partida} eu={eu} />; break
      case 'LOBBY_CREATION':
      case 'IN_PROGRESS': fase = <Codigo p={partida} eu={eu} />; break
      default: fase = <Resultado p={partida} eu={eu} />
    }
    return (
      <>
        <Progresso p={partida} />
        <Suspense fallback={<Carregando />}>{fase}</Suspense>
        <FerramentasDev />
      </>
    )
  }

  return (
    <>
      <Cabecalho
        migalhas={['Hub', l('Jogar', 'Play')]}
        titulo={l('Jogar', 'Play')}
        descricao={l('Entra na fila da tua região. Quando houver 10 jogadores, recebes o alerta para aceitar e segues para o draft.', 'Join your region\'s queue. When there are 10 players, you get the accept alert and go on to the draft.')}
      />
      <PainelFila />
      <FerramentasDev />
      <ComoFunciona />
      <p className="m-0 flex items-center gap-2 text-[12.5px] text-mudo"><Swords size={14} className="text-laranja" aria-hidden />{l('Precisas do Riot ID ligado e de jogar com essa conta, para o resultado ser confirmado.', 'You need your Riot ID linked and to play with that account, so the result can be confirmed.')}</p>
    </>
  )
}
