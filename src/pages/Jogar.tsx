import { Ban, Check, ClipboardPaste, Crown, Flag, Hash, Radio, Swords, Trophy, Users, Volume2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { FaixaAoVivo } from '@/components/AoVivo'
import { FerramentasDev } from '@/components/FerramentasDev'
import { ConviteExtensao } from '@/components/ConviteExtensao'
import { CartaoFila } from '@/components/Fila'
import { BlocoIcone, BotaoAjuda, Cabecalho, Carregando, Chip, Painel } from '@/components/ui'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { dados, type EstadoPartida, type Partida } from '@/lib/data'
import { ROTACAO_PADRAO, totalBans } from '@/lib/mapas'
import { useCarregar } from '@/hooks/useCarregar'
import { useIntervalo } from '@/hooks/useVisivel'
import { abrirNaApp, telemovel, urlCanalWeb } from '@/lib/discord'
import { useAvisos } from '@/contexts/Avisos'
import { MINUTOS_BLOQUEIO, SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA } from '@/lib/regras'
import { l } from '@/lib/idioma'

// Os ecrãs da partida só descarregam quando há fila ou partida (ver preCarregarPartida).
const carregarCodigo = () => import('@/components/match/Codigo')
const carregarDraft = () => import('@/components/match/Draft')
const carregarMapas = () => import('@/components/match/Mapas')
const carregarResultado = () => import('@/components/match/Resultado')
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

/**
 * O chat e a call da tua equipa no Discord, quando o bot já os criou.
 * No computador abrem a aplicação do Discord já no canal; se ela não abrir, aparece o link para o browser.
 * A call primeiro pede ao bot que te mude para lá: funciona se já estiveres numa call do servidor.
 */
function LinksDiscord({ p }: { p: Partida }) {
  const links = useCarregar(() => dados.discordPartida(p.id), [p.id, p.estado])
  const avisar = useAvisos()
  const [semApp, setSemApp] = useState<string | null>(null)
  const [dica, setDica] = useState(false)
  const [aPuxar, setAPuxar] = useState(false)
  // A criação demora uns segundos depois de as equipas fecharem: volta a perguntar até aparecer.
  const { recarregar, valor } = links
  useIntervalo(recarregar, valor ? null : 8000)
  if (!valor) return null
  const abrir = (canal: string) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (abrirNaApp(valor.servidor, canal, () => setSemApp(canal))) { e.preventDefault(); setSemApp(null) }
  }
  // No telemóvel o link segue normalmente e o pedido ao bot vai ao mesmo tempo.
  const entrarCall = async (e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return
    if (telemovel()) { dados.puxarCall(p.id).catch(() => null); return }
    e.preventDefault()
    setAPuxar(true)
    const r = await Promise.race([
      dados.puxarCall(p.id).catch(() => ({ movido: false, foraDaVoz: false })),
      new Promise<{ movido: boolean; foraDaVoz?: boolean }>((ok) => setTimeout(() => ok({ movido: false }), 3000)),
    ])
    setAPuxar(false)
    if (r.movido) { setDica(false); avisar(l('Estás na call da tua equipa.', 'You are in your team call.')); return }
    setDica(!!r.foraDaVoz)
    abrirNaApp(valor.servidor, valor.call, () => setSemApp(valor.call))
    setSemApp(null)
  }
  const botao = 'inline-flex h-8 items-center gap-1.5 rounded-lg border border-laranja/35 bg-laranja/10 px-2.5 text-[12.5px] font-semibold text-pessego-claro no-underline hover:bg-laranja/20'
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <a href={urlCanalWeb(valor.servidor, valor.chat)} onClick={abrir(valor.chat)} target="_blank" rel="noreferrer" className={botao}><Hash size={13} aria-hidden />{l('Chat da partida', 'Match chat')}</a>
      <a href={urlCanalWeb(valor.servidor, valor.call)} onClick={entrarCall} aria-busy={aPuxar} target="_blank" rel="noreferrer" className={botao}><Volume2 size={13} aria-hidden />{aPuxar ? l('A entrar…', 'Joining…') : l('Call da equipa', 'Team call')}</a>
      {dica && !semApp && (
        <span className="text-[12px] text-mudo">{l('Dica: se já estiveres numa call do servidor, o Rangify muda-te sozinho para a da equipa.', 'Tip: if you are already in a voice channel on the server, Rangify moves you to your team call.')}</span>
      )}
      {semApp && (
        <span className="text-[12px] text-mudo">
          {l('A aplicação não abriu?', 'The app did not open?')}{' '}
          <a href={urlCanalWeb(valor.servidor, semApp)} target="_blank" rel="noreferrer" className="font-semibold text-pessego underline-offset-2 hover:underline" onClick={() => setSemApp(null)}>{l('Abrir no browser', 'Open in the browser')}</a>
        </span>
      )}
    </span>
  )
}

function Progresso({ p }: { p: Partida }) {
  const FASES = fases()
  const atual = FASES.findIndex((f) => f.estados.includes(p.estado))
  const lista = useRef<HTMLOListElement>(null)
  // Centra a fase atual na linha das fases (só mexe na própria linha, nunca na página).
  useEffect(() => {
    const ol = lista.current
    const li = ol?.querySelector<HTMLElement>('[aria-current=step]')
    if (ol && li) ol.scrollLeft = li.offsetLeft - (ol.clientWidth - li.offsetWidth) / 2
  }, [atual])
  return (
    <nav aria-label={l('Fases da partida', 'Match phases')} className="painel flex flex-wrap items-center gap-x-4 gap-y-3 !rounded-2xl px-4 py-3">
      <span className="flex items-center gap-2 font-mono text-[12px] font-semibold text-pessego">
        <span className="ao-vivo size-2 rounded-full bg-laranja" />{p.codigo}
      </span>
      {p.fila === 'ranked' && <Chip tom="laranja">RANKED</Chip>}
      {p.simulada && <Chip tom="laranja">{p.automatica ? l('Simulação automática', 'Automatic simulation') : l('Simulada', 'Simulated')}</Chip>}
      {/* No telemóvel as fases ficam numa linha que se arrasta (a atual centrada), em vez de uma coluna de seis linhas. */}
      <ol ref={lista} className="relative m-0 flex basis-full list-none flex-nowrap items-center gap-1.5 overflow-x-auto p-0 [scrollbar-width:none] sm:flex-1 sm:basis-auto sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
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
    { icone: <ClipboardPaste size={18} />, titulo: l('Código do grupo', 'Party code'), texto: l(`Um dos capitães partilha, bloqueio de ${MINUTOS_BLOQUEIO} min.`, `One of the captains shares it, ${MINUTOS_BLOQUEIO}-min lock.`), topico: 'codigo' as const },
    { icone: <Flag size={18} />, titulo: l('Resultado', 'Result'), texto: l('Os capitães confirmam quem ganhou e a API diz o resultado.', 'The captains confirm who won and the API gives the score.'), topico: 'resultado' as const },
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

/** Uma fila de cada vez, pontos separados por fila, e o overlay a dizer em qual estás. */
function DuasFilas() {
  const itens = [
    { icone: <Users size={18} />, titulo: l('Uma fila de cada vez', 'One queue at a time'), texto: l('Entras numa só. Para mudar, sais da atual e entras na outra.', 'You join one only. To switch, leave the current one and join the other.') },
    { icone: <Trophy size={18} />, titulo: l('Pontos separados', 'Separate points'), texto: l('Cada fila tem a sua Tabela. Os pontos da ranked não se misturam com os da aberta.', 'Each queue has its own leaderboard. Ranked points never mix with open ones.') },
    { icone: <Radio size={18} />, titulo: l('Aparece no overlay', 'Shows on the overlay'), texto: l('O overlay do OBS diz em que fila estás a jogar e mostra os pontos dessa tabela.', 'The OBS overlay says which queue you are playing in and shows that leaderboard\'s points.') },
  ]
  return (
    <Painel aria-labelledby="rg-duas-filas" className="flex flex-col gap-4 p-[22px]">
      <div className="flex flex-col gap-[5px]">
        <span className="eyebrow">{l('COMO FUNCIONAM AS FILAS', 'HOW THE QUEUES WORK')}</span>
        <h2 id="rg-duas-filas" className="m-0 text-[19px] font-bold tracking-[-0.02em]">{l('Duas filas, duas tabelas', 'Two queues, two leaderboards')}</h2>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5 p-0">
        {itens.map((s) => (
          <li key={s.titulo} className="flex gap-3 rounded-[14px] border border-white/7 bg-white/[0.03] p-3.5">
            <BlocoIcone tamanho={36}>{s.icone}</BlocoIcone>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[14px] font-bold">{s.titulo}</span>
              <span className="text-[12.5px] leading-normal text-mudo">{s.texto}</span>
            </span>
          </li>
        ))}
      </ul>
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
        descricao={l('Escolhe a fila. A aberta é para toda a gente; a ranked é só para Ascendente 1 ou mais. Quando houver 10 jogadores, recebes o alerta para aceitar e segues para o draft.', 'Pick a queue. Open is for everyone; ranked is for Ascendant 1 or higher only. When there are 10 players, you get the accept alert and go on to the draft.')}
      />
      {/* Uma grelha em vez de duas colunas soltas: os cartões partilham as linhas, por isso o título, a escada de ranks, as etiquetas e o botão ficam alinhados. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-x-6 gap-y-5">
        <CartaoFila tipo="aberta" id="rg-fila-aberta" alinhada />
        <CartaoFila tipo="ranked" id="rg-fila-ranked" alinhada />
      </div>
      <ConviteExtensao className="max-w-[560px]" />
      <DuasFilas />
      <FaixaAoVivo />
      <FerramentasDev />
      <ComoFunciona />
      <p className="m-0 flex items-center gap-2 text-[12.5px] text-mudo"><Swords size={14} className="text-laranja" aria-hidden />{l('Precisas do Riot ID ligado e de jogar com essa conta, para o resultado ser confirmado.', 'You need your Riot ID linked and to play with that account, so the result can be confirmed.')}</p>
    </>
  )
}
