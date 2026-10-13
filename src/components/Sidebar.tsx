import {
  Clock, House, Lightbulb, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Swords, Target, Trophy, User, Users, X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { aoMudarDados, avisarMudanca, dados } from '@/lib/dados'
import { caminhoPerfil, nomeJogador } from '@/lib/partida'
import { Marca } from './Marca'
import { Avatar } from './ui'
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

interface Item { para: string; texto: string; icone: ReactNode; tour: string; extra?: ReactNode; fim?: boolean }

function lerRecolhido() {
  try { return localStorage.getItem('rangify:menu') === 'recolhido' } catch { return false }
}

function ItemNav({ item, recolhido, onClick }: { item: Item; recolhido: boolean; onClick?: () => void }) {
  return (
    <NavLink
      to={item.para}
      end={item.fim}
      data-tour={item.tour}
      onClick={onClick}
      title={recolhido ? item.texto : undefined}
      className={({ isActive }) =>
        `relative flex min-h-11 items-center rounded-[10px] border text-[14.5px] no-underline transition-[padding,background-color,color,border-color] ${ANIM} ${recolhido ? 'px-[20px]' : 'px-3'} ${
          isActive ? 'cantos border-white/9 bg-white/5 font-semibold text-texto' : 'border-transparent font-medium text-suave hover:bg-white/[0.045] hover:text-texto'
        }`
      }
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

  const sair = async () => {
    await dados.sair()
    navegar('/entrar')
  }

  const grupos: { titulo: string; itens: Item[] }[] = [
    {
      titulo: 'HUB', itens: [
        { para: '/', texto: l('Painel', 'Dashboard'), icone: <House size={18} />, tour: 'dashboard', fim: true },
        {
          para: '/jogar', texto: l('Jogar', 'Play'), icone: <Swords size={18} />, tour: 'jogar',
          extra: ativa ? <Contador vivo>{l('ao vivo', 'live')}</Contador> : fila?.naFila ? <Contador vivo>{fila.contagem}/10</Contador> : null,
        },
        { para: '/ranking', texto: l('Tabela', 'Leaderboard'), icone: <Trophy size={18} />, tour: 'ranking' },
        { para: '/partidas', texto: l('Partidas', 'Matches'), icone: <Clock size={18} />, tour: 'partidas' },
      ],
    },
    {
      titulo: l('COMUNIDADE', 'COMMUNITY'), itens: [
        { para: '/missoes', texto: l('Missões', 'Missions'), icone: <Target size={18} />, tour: 'missoes' },
        { para: '/amigos', texto: l('Amigos', 'Friends'), icone: <Users size={18} />, tour: 'amigos', extra: pedidos ? <Contador>{pedidos}</Contador> : null },
        { para: '/sugestoes', texto: l('Sugestões', 'Suggestions'), icone: <Lightbulb size={18} />, tour: 'sugestoes' },
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
        <nav aria-label={l('Navegação principal', 'Main navigation')} className="flex flex-col gap-[18px]">
          {grupos.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-1">
              <div aria-hidden={rec} className={`grid transition-[grid-template-rows,opacity] ${ANIM} ${rec ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
                <div className="min-h-0 overflow-hidden"><span className="block px-3 pb-1.5 font-mono text-[10.5px] font-semibold tracking-[0.16em] whitespace-nowrap text-mudo">{g.titulo}</span></div>
              </div>
              {g.itens.map((i) => <ItemNav key={i.texto} item={i} recolhido={rec} />)}
            </div>
          ))}
          <button
            type="button"
            onClick={sair}
            title={rec ? l('Terminar sessão', 'Sign out') : undefined}
            className={`flex min-h-11 cursor-pointer items-center rounded-[10px] border border-transparent bg-transparent text-left text-[14.5px] font-medium text-suave transition-[padding,background-color,color] hover:bg-white/[0.045] hover:text-texto ${ANIM} ${rec ? 'px-[20px]' : 'px-3'}`}
          >
            <LogOut size={18} className="shrink-0 text-laranja" aria-hidden />
            <Rotulo recolhido={rec}>{l('Terminar sessão', 'Sign out')}</Rotulo>
          </button>
        </nav>
        {perfil && (
          <Link
            to={perfil.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes'}
            className={`mt-auto flex items-center rounded-xl border border-white/7 bg-white/[0.025] text-texto no-underline transition-[padding,background-color] hover:bg-white/[0.045] ${ANIM} ${rec ? 'p-[10px]' : 'p-2.5'}`}
          >
            <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} destaque />
            <Rotulo recolhido={rec}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-semibold">{nomeJogador(perfil)}</span>
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
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-[rgba(10,10,12,0.82)] px-4 py-2.5 backdrop-blur-[18px] vidro-leve lg:hidden">
        <Link to="/" aria-label={l('Rangify, ir para o painel', 'Rangify, go to the dashboard')} className="no-underline"><Marca /></Link>
        <button type="button" aria-label={l('Abrir menu', 'Open menu')} aria-expanded={aberto} onClick={() => setAberto(true)} className="relative grid size-11 cursor-pointer place-items-center rounded-[11px] border border-white/8 bg-white/[0.03] text-marfim">
          <Menu size={19} aria-hidden />
          {(fila?.naFila || ativa || pedidos > 0) && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-laranja" />}
        </button>
      </div>
      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setAberto(false) }} style={{ background: 'rgba(5,5,7,0.6)' }}>
          <aside className="entra flex h-full w-[min(300px,86vw)] flex-col gap-[22px] overflow-y-auto border-r border-white/6 bg-[rgba(12,12,14,0.97)] px-3.5 pt-5 pb-4">
            {conteudo(true)}
          </aside>
        </div>
      )}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-[22px] overflow-x-hidden overflow-y-auto border-r border-white/6 bg-[rgba(10,10,12,0.64)] px-3 pt-[22px] pb-4 backdrop-blur-[18px] vidro-leve transition-[width] lg:flex ${ANIM} ${recolhido ? 'w-[84px]' : 'w-[248px]'}`}
      >
        {conteudo(false)}
      </aside>
    </>
  )
}
