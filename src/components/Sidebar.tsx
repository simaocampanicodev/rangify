import {
  Clock, House, Lightbulb, LogOut, Medal, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, ShoppingBag, Swords, Target, Trophy, User, Users, X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { aoMudarDados, avisarMudanca, dados } from '@/lib/data'
import { caminhoPerfil, nomeJogador } from '@/lib/partida'
import { Marca } from './Marca'
import { abrirPaleta, atalhoPaleta } from './Paleta'
import { NumeroRolante } from './ui/NumeroRolante'
import { Avatar, Modal } from './ui'
import { TituloJogador, useClassesCosmeticos } from './Cosmeticos'
import { useCarregar } from '@/hooks/useCarregar'
import { l } from '@/lib/idioma'

/** A mesma curva em tudo o que abre e fecha com o menu. */
const ANIM = 'duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none'

/** Texto que encolhe até zero quando o menu recolhe (continua lá para os leitores de ecrã). */
function Rotulo({ recolhido, children }: { recolhido: boolean; children: ReactNode }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] ${ANIM} ${recolhido ? 'ml-0 max-w-0 opacity-0' : 'ml-3 max-w-[190px] flex-1 opacity-100'}`}>
      {children}
    </span>
  )
}

interface Item { para: string; texto: string; icone: ReactNode; tour: string; extra?: ReactNode; fim?: boolean; /** Outro caminho que também deixa este item aceso. */ tambem?: string }

function lerRecolhido() {
  try { return localStorage.getItem('rangify:menu') === 'recolhido' } catch { return false }
}

function ItemNav({ item, recolhido, onClick }: { item: Item; recolhido: boolean; onClick?: () => void }) {
  const { pathname } = useLocation()
  const ativo = !!matchPath({ path: item.para, end: !!item.fim }, pathname) || (!!item.tambem && pathname.startsWith(item.tambem))
  return (
    <NavLink
      to={item.para}
      end={item.fim}
      data-tour={item.tour}
      data-item
      data-ativo={ativo ? 'true' : undefined}
      onClick={onClick}
      title={recolhido ? item.texto : undefined}
      className={`menu-item relative flex min-h-11 items-center rounded-[10px] border border-transparent text-[14.5px] no-underline transition-[padding,color] lg:min-h-10 ${ANIM} ${recolhido ? 'px-[20px]' : 'px-3'} ${ativo ? 'font-semibold text-texto' : 'font-medium text-suave hover:text-texto'}`}
    >
      <span className="relative inline-flex shrink-0 text-laranja">
        {item.icone}
        {recolhido && item.extra && <span aria-hidden className="absolute -top-1 -right-1.5 size-2 rounded-full bg-laranja ring-2 ring-[#0b0b0d]" />}
      </span>
      <Rotulo recolhido={recolhido}>
        <span className="truncate">{item.texto}</span>
        {item.extra}
      </Rotulo>
    </NavLink>
  )
}

interface Caixa { top: number; left: number; width: number; height: number }
const caixaDe = (el: HTMLElement): Caixa => ({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight })
const igual = (a: Caixa | null, b: Caixa | null) => (!a || !b ? a === b : a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height)

/**
 * A lista do menu, com duas pílulas (ideia do Sidebar do EasyUI): uma desliza para o item da página em que estás e outra
 * segue o rato de item em item. Medem-se os itens e as pílulas ficam por trás do texto.
 */
function NavMenu({ grupos, rec, aoPesquisar, aoSair, aoNavegar }: {
  grupos: { titulo: string; itens: Item[] }[]; rec: boolean; aoPesquisar: () => void; aoSair: () => void; aoNavegar?: () => void
}) {
  const nav = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const [ativa, setAtiva] = useState<Caixa | null>(null)
  const [sobre, setSobre] = useState<Caixa | null>(null)
  const [aSobrevoar, setASobrevoar] = useState(false)
  const [anima, setAnima] = useState(false)

  const medir = useCallback(() => {
    const el = nav.current?.querySelector<HTMLElement>('[data-ativo="true"]')
    const c = el ? caixaDe(el) : null
    setAtiva((v) => (igual(v, c) ? v : c))
  }, [])
  useLayoutEffect(() => { medir() }, [medir, pathname, rec, grupos.length])
  // Se o menu muda de tamanho (recolher, a loja aparecer), a pílula acompanha logo, sem animar à parte.
  useEffect(() => {
    const el = nav.current
    if (!el) return
    let w = el.offsetWidth
    let h = el.offsetHeight
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === w && el.offsetHeight === h) return
      w = el.offsetWidth
      h = el.offsetHeight
      setAnima(false)
      medir()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [medir])
  useEffect(() => {
    if (ativa && !anima) { const id = window.setTimeout(() => setAnima(true), 60); return () => window.clearTimeout(id) }
  }, [ativa, anima])

  const mover = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-item]')
    if (!el || !nav.current?.contains(el)) { setASobrevoar(false); return }
    const c = caixaDe(el)
    setSobre((v) => (igual(v, c) ? v : c))
    setASobrevoar(true)
  }

  return (
    <nav ref={nav} aria-label={l('Navegação principal', 'Main navigation')} onPointerMove={mover} onPointerLeave={() => setASobrevoar(false)} className="menu-nav relative flex flex-col gap-3.5 lg:gap-3">
      {sobre && <span aria-hidden className="menu-sobre" style={{ ...sobre, opacity: aSobrevoar ? 1 : 0 }} />}
      {ativa && <span aria-hidden className={`menu-ativa ${anima ? '' : 'menu-quieta'}`} style={ativa} />}
      {/* A paleta de comandos (Ctrl/Cmd + K): ir a uma página, entrar na fila ou procurar um jogador. */}
      <button
        type="button"
        data-item
        onClick={aoPesquisar}
        title={rec ? `${l('Procurar', 'Search')} (${atalhoPaleta()})` : undefined}
        className={`menu-item relative flex min-h-11 cursor-pointer items-center rounded-[10px] border border-white/8 bg-white/[0.03] text-left text-[14px] font-medium text-suave transition-[padding,color] hover:text-texto lg:min-h-10 ${ANIM} ${rec ? 'px-[20px]' : 'px-3'}`}
      >
        <Search size={17} className="shrink-0 text-laranja" aria-hidden />
        <Rotulo recolhido={rec}>
          <span className="flex-1 truncate">{l('Procurar', 'Search')}</span>
          <kbd className="rounded-md border border-white/12 bg-white/5 px-1.5 py-px font-mono text-[10.5px] text-mudo">{atalhoPaleta()}</kbd>
        </Rotulo>
      </button>
      {grupos.map((g) => (
        <div key={g.titulo} className="menu-grupo flex flex-col gap-1">
          <div aria-hidden={rec} className={`menu-titulo grid transition-[grid-template-rows,opacity] ${ANIM} ${rec ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
            <div className="min-h-0 overflow-hidden"><span className="block px-3 pb-1 font-mono text-[10.5px] font-semibold tracking-[0.16em] whitespace-nowrap text-mudo">{g.titulo}</span></div>
          </div>
          {g.itens.map((i) => <ItemNav key={i.texto} item={i} recolhido={rec} onClick={aoNavegar} />)}
        </div>
      ))}
      <button
        type="button"
        data-item
        onClick={aoSair}
        title={rec ? l('Terminar sessão', 'Sign out') : undefined}
        className={`menu-item relative flex min-h-11 cursor-pointer items-center rounded-[10px] border border-transparent bg-transparent text-left text-[14.5px] font-medium text-suave transition-[padding,color] hover:text-texto lg:min-h-10 ${ANIM} ${rec ? 'px-[20px]' : 'px-3'}`}
      >
        <LogOut size={18} className="shrink-0 text-laranja" aria-hidden />
        <Rotulo recolhido={rec}>{l('Terminar sessão', 'Sign out')}</Rotulo>
      </button>
    </nav>
  )
}

function Contador({ children, vivo = false }: { children: ReactNode; vivo?: boolean }) {
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-laranja/32 bg-laranja/12 px-2 py-0.5 font-mono text-[11px] text-pessego">
      {vivo && <span className="ao-vivo size-1.5 rounded-full bg-laranja" />}
      {children}
    </span>
  )
}

export function Sidebar() {
  const { perfil, eStaff } = useSessao()
  const { fila, ativa } = usePartida()
  const [recolhido, setRecolhido] = useState(lerRecolhido)
  const [aberto, setAberto] = useState(false)
  const [pedidos, setPedidos] = useState(0)
  const navegar = useNavigate()
  const local = useLocation()
  const cz = useClassesCosmeticos(perfil?.id)
  const loja = useCarregar(() => dados.lojaVisivel(), [perfil?.id, perfil?.funcao], ['loja', 'staff'])
  const divulgar = useCarregar(() => dados.streamersVisivel(), [perfil?.id, perfil?.funcao], ['streamers', 'staff'])
  const torneios = useCarregar(() => dados.torneiosVisivel(), [perfil?.id, perfil?.funcao], ['torneios', 'staff'])
  const convitesTorneio = useCarregar(() => (torneios.valor ? dados.meusConvitesTorneio() : Promise.resolve([])), [perfil?.id, torneios.valor], ['torneios'], { chave: 'torneios:convites' })

  useEffect(() => { setAberto(false) }, [local.pathname])

  // Quando alguém te manda um pedido, o aceita ou te remove, o Realtime avisa logo:
  // a barra lateral relê a lista e, se mudou, avisa as outras páginas (como a de Amigos).
  // A cada 60 s volta a perguntar, para o caso de a ligação em tempo real cair.
  useEffect(() => {
    if (!perfil?.id) return
    let assinatura = ''
    const ler = (avisarSeMudou: boolean) => dados.amigos().then((lista) => {
      setPedidos(lista.filter((a) => a.direcao === 'recebido').length)
      const nova = JSON.stringify(lista.map((a) => [a.perfil.id, a.estado, a.direcao, a.atividade]))
      if (avisarSeMudou && assinatura && nova !== assinatura) avisarMudanca('amigos')
      assinatura = nova
    }).catch(() => {})
    ler(false)
    // A reserva só corre com o separador à frente; ao voltar, relê logo.
    const t = window.setInterval(() => { if (document.visibilityState !== 'hidden') ler(true) }, 60_000)
    const voltar = () => { if (document.visibilityState !== 'hidden') ler(true) }
    document.addEventListener('visibilitychange', voltar)
    const off = aoMudarDados((o) => { if (o === 'amigos') ler(false) })
    const offRealtime = dados.aoMudarAmizades(perfil.id, () => ler(true))
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', voltar); off(); offRealtime() }
  }, [perfil?.id])

  const alternar = () => {
    setRecolhido((r) => {
      try { localStorage.setItem('rangify:menu', r ? 'aberto' : 'recolhido') } catch { /* ignora */ }
      return !r
    })
  }

  // Ctrl/Cmd + B recolhe e abre o menu (como no Sidebar do EasyUI).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) { e.preventDefault(); alternar() }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  // Terminar sessão pede confirmação: um clique sem querer não deve deixar ninguém de fora.
  const [aSair, setASair] = useState(false)
  const [aTerminar, setATerminar] = useState(false)
  const sair = async () => {
    setATerminar(true)
    try {
      await dados.sair()
      setASair(false)
      setAberto(false)
      navegar('/entrar')
    } finally {
      setATerminar(false)
    }
  }

  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: 'HUB', itens: [
        { para: '/', texto: l('Painel', 'Dashboard'), icone: <House size={18} />, tour: 'dashboard', fim: true },
        {
          para: '/jogar', texto: l('Jogar', 'Play'), icone: <Swords size={18} />, tour: 'jogar', tambem: '/partida/',
          extra: ativa ? <Contador vivo>{l('ao vivo', 'live')}</Contador> : fila?.naFila ? <Contador vivo><NumeroRolante valor={fila.contagem} contar={false} />/10</Contador> : null,
        },
        { para: '/ranking', texto: l('Tabela', 'Leaderboard'), icone: <Trophy size={18} />, tour: 'ranking' },
        { para: '/partidas', texto: l('Partidas', 'Matches'), icone: <Clock size={18} />, tour: 'partidas' },
        ...(torneios.valor ? [{ para: '/torneios', texto: l('Torneios', 'Tournaments'), icone: <Medal size={18} />, tour: 'torneios', extra: convitesTorneio.valor?.length ? <Contador>{convitesTorneio.valor.length}</Contador> : null }] : []),
      ],
    },
    {
      titulo: l('COMUNIDADE', 'COMMUNITY'), itens: [
        { para: '/missoes', texto: l('Missões', 'Missions'), icone: <Target size={18} />, tour: 'missoes' },
        { para: '/amigos', texto: l('Amigos', 'Friends'), icone: <Users size={18} />, tour: 'amigos', extra: pedidos ? <Contador>{pedidos}</Contador> : null },
        { para: '/sugestoes', texto: l('Sugestões', 'Suggestions'), icone: <Lightbulb size={18} />, tour: 'sugestoes' },
        ...(loja.valor ? [{ para: '/loja', texto: l('Loja', 'Shop'), icone: <ShoppingBag size={18} />, tour: 'loja' }] : []),
        ...(divulgar.valor ? [{ para: '/divulgar', texto: l('Divulgar', 'Share'), icone: <Megaphone size={18} />, tour: 'divulgar' }] : []),
      ],
    },
    {
      titulo: l('CONTA', 'ACCOUNT'), itens: [
        { para: perfil?.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes', texto: l('Perfil', 'Profile'), icone: <User size={18} />, tour: 'perfil' },
        { para: '/definicoes', texto: l('Definições', 'Settings'), icone: <Settings size={18} />, tour: 'definicoes' },
        ...(eStaff ? [{ para: '/admin', texto: 'Staff', icone: <ShieldCheck size={18} />, tour: 'admin' }] : []),
      ],
    },
  ]

  const conteudo = (movel: boolean) => {
    const rec = recolhido && !movel
    return (
      <>
        {/* Ao recolher, o nome encolhe e o botão passa para baixo do símbolo. */}
        <div className={`flex items-center gap-2.5 ${rec ? 'flex-col' : 'justify-between pr-1 pl-2'}`}>
          <Link to="/" aria-label={l('Rangify, ir para o painel', 'Rangify, go to the dashboard')} className="no-underline"><Marca compacta={rec} /></Link>
          {movel ? (
            <button type="button" aria-label={l('Fechar menu', 'Close menu')} onClick={() => setAberto(false)} className="grid size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-mudo hover:bg-white/8">
              <X size={18} aria-hidden />
            </button>
          ) : (
            <button type="button" aria-label={rec ? l('Abrir menu', 'Open menu') : l('Recolher menu', 'Collapse menu')} onClick={alternar} className="grid size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-mudo hover:bg-white/8">
              {rec ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            </button>
          )}
        </div>
        <NavMenu grupos={grupos} rec={rec} aoPesquisar={() => { setAberto(false); abrirPaleta() }} aoSair={() => setASair(true)} />
        {perfil && (
          <Link
            to={perfil.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes'}
            className={`mt-auto flex items-center rounded-xl border border-white/7 bg-white/[0.025] text-texto no-underline transition-[padding,background-color] hover:bg-white/[0.045] ${ANIM} ${rec ? 'p-[10px]' : 'p-2.5'} ${cz.placa}`}
          >
            <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} destaque perfilId={perfil.id} />
            <Rotulo recolhido={rec}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="cz-nome truncate text-[14px] font-semibold">{nomeJogador(perfil)}</span>
                <TituloJogador perfilId={perfil.id} className="truncate" />
                <span className="truncate font-mono text-[11px] text-mudo">{perfil.riotId ?? perfil.utilizador}</span>
              </span>
              <span className="font-mono text-[12px] font-semibold text-pessego">{perfil.pontos}</span>
            </Rotulo>
          </Link>
        )}
      </>
    )
  }

  return (
    <>
      {/* Ecrãs pequenos: barra no topo e menu deslizante. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-[rgba(10,10,12,0.9)] px-4 py-2.5 vidro-leve lg:hidden">
        <Link to="/" aria-label={l('Rangify, ir para o painel', 'Rangify, go to the dashboard')} className="no-underline"><Marca /></Link>
        <button type="button" aria-label={l('Abrir menu', 'Open menu')} aria-expanded={aberto} onClick={() => setAberto(true)} className="relative grid size-11 cursor-pointer place-items-center rounded-[11px] border border-white/8 bg-white/[0.03] text-marfim">
          <Menu size={19} aria-hidden />
          {(fila?.naFila || ativa || pedidos > 0) && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-laranja" />}
        </button>
      </div>
      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setAberto(false) }} style={{ background: 'rgba(5,5,7,0.6)' }}>
          <aside onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setAberto(false) }} className="entra flex h-full w-[min(300px,86vw)] flex-col gap-[22px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-r border-white/6 bg-[rgba(12,12,14,0.97)] px-3.5 pt-5 pb-4">
            {conteudo(true)}
          </aside>
        </div>
      )}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto border-r border-white/6 bg-[rgba(10,10,12,0.8)] px-3 pt-[18px] pb-3 vidro-leve [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-[width] lg:flex ${ANIM} ${recolhido ? 'w-[84px]' : 'w-[248px]'}`}
      >
        {conteudo(false)}
      </aside>
      <Modal aberto={aSair} onFechar={() => { if (!aTerminar) setASair(false) }} titulo={l('Terminar sessão?', 'Sign out?')} eyebrow={l('CONTA', 'ACCOUNT')} largura={440}>
        <p className="m-0 text-[14px] leading-normal text-suave">{l('Vais ter de voltar a entrar para jogar. Se estás na fila, sais dela. Se estás numa partida, ela continua sem ti.', 'You will need to sign in again to play. If you are in the queue, you leave it. If you are in a match, it goes on without you.')}</p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className="btn btn-fantasma" disabled={aTerminar} onClick={() => setASair(false)}>{l('Cancelar', 'Cancel')}</button>
          <button type="button" className="btn btn-primario" disabled={aTerminar} onClick={sair} autoFocus><LogOut size={16} aria-hidden />{aTerminar ? l('A sair…', 'Signing out…') : l('Terminar sessão', 'Sign out')}</button>
        </div>
      </Modal>
    </>
  )
}
