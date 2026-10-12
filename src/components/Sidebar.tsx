import {
  Clock, House, Lightbulb, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Swords, Target, Trophy, User, Users, X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { aoMudarDados, dados } from '@/lib/dados'
import { caminhoPerfil, nomeJogador } from '@/lib/partida'
import { Marca } from './Marca'
import { Avatar } from './ui'

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
        `relative flex min-h-11 items-center gap-3 rounded-[10px] border px-3 text-[14.5px] no-underline transition-colors ${recolhido ? 'justify-center !px-0' : ''} ${
          isActive ? 'cantos border-white/9 bg-white/5 font-semibold text-texto' : 'border-transparent font-medium text-suave hover:bg-white/[0.045] hover:text-texto'
        }`
      }
    >
      <span className="inline-flex text-laranja">{item.icone}</span>
      {recolhido ? <span className="so-leitores">{item.texto}</span> : item.texto}
      {!recolhido && item.extra}
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

  useEffect(() => {
    const ler = () => dados.amigos().then((l) => setPedidos(l.filter((a) => a.direcao === 'recebido').length)).catch(() => {})
    ler()
    return aoMudarDados((o) => { if (o === 'amigos') ler() })
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
        { para: '/', texto: 'Dashboard', icone: <House size={18} />, tour: 'dashboard', fim: true },
        {
          para: '/jogar', texto: 'Jogar', icone: <Swords size={18} />, tour: 'jogar',
          extra: ativa ? <Contador vivo>ao vivo</Contador> : fila?.naFila ? <Contador vivo>{fila.contagem}/10</Contador> : null,
        },
        { para: '/ranking', texto: 'Ranking', icone: <Trophy size={18} />, tour: 'ranking' },
        { para: '/partidas', texto: 'Partidas', icone: <Clock size={18} />, tour: 'partidas' },
      ],
    },
    {
      titulo: 'COMUNIDADE', itens: [
        { para: '/missoes', texto: 'Missões', icone: <Target size={18} />, tour: 'missoes' },
        { para: '/amigos', texto: 'Amigos', icone: <Users size={18} />, tour: 'amigos', extra: pedidos ? <Contador>{pedidos}</Contador> : null },
        { para: '/sugestoes', texto: 'Sugestões', icone: <Lightbulb size={18} />, tour: 'sugestoes' },
      ],
    },
    {
      titulo: 'CONTA', itens: [
        { para: perfil?.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes', texto: 'Perfil', icone: <User size={18} />, tour: 'perfil' },
        { para: '/definicoes', texto: 'Definições', icone: <Settings size={18} />, tour: 'definicoes' },
        ...(eStaff ? [{ para: '/admin', texto: 'Staff', icone: <ShieldCheck size={18} />, tour: 'admin' }] : []),
      ],
    },
  ]

  const conteudo = (movel: boolean) => {
    const rec = recolhido && !movel
    return (
      <>
        <div className={`flex items-center gap-2.5 ${rec ? 'flex-col' : 'justify-between pr-1 pl-2'}`}>
          <Link to="/" aria-label="Rangify, ir para o dashboard" className="no-underline"><Marca compacta={rec} /></Link>
          {movel ? (
            <button type="button" aria-label="Fechar menu" onClick={() => setAberto(false)} className="grid size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-mudo hover:bg-white/8">
              <X size={18} aria-hidden />
            </button>
          ) : (
            <button type="button" aria-label={rec ? 'Abrir menu' : 'Recolher menu'} onClick={alternar} className="grid size-11 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-mudo hover:bg-white/8">
              {rec ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
            </button>
          )}
        </div>
        <nav aria-label="Navegação principal" className="flex flex-col gap-[18px]">
          {grupos.map((g) => (
            <div key={g.titulo} className="flex flex-col gap-1">
              {!rec && <span className="px-3 pb-1.5 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-mudo">{g.titulo}</span>}
              {g.itens.map((i) => <ItemNav key={i.texto} item={i} recolhido={rec} />)}
            </div>
          ))}
          <button
            type="button"
            onClick={sair}
            title={rec ? 'Terminar sessão' : undefined}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-transparent bg-transparent px-3 text-left text-[14.5px] font-medium text-suave transition-colors hover:bg-white/[0.045] hover:text-texto ${rec ? 'justify-center !px-0' : ''}`}
          >
            <LogOut size={18} className="text-laranja" aria-hidden />
            {rec ? <span className="so-leitores">Terminar sessão</span> : 'Terminar sessão'}
          </button>
        </nav>
        {perfil && (
          <Link
            to={perfil.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes'}
            className={`mt-auto flex items-center gap-[11px] rounded-xl border border-white/7 bg-white/[0.025] p-2.5 text-texto no-underline transition-colors hover:bg-white/[0.045] ${rec ? 'justify-center' : ''}`}
          >
            <Avatar nome={nomeJogador(perfil)} url={perfil.avatarUrl} destaque />
            {!rec && (
              <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-semibold">{nomeJogador(perfil)}</span>
                  <span className="truncate font-mono text-[11px] text-mudo">{perfil.riotId ?? perfil.utilizador}</span>
                </span>
                <span className="font-mono text-[12px] font-semibold text-pessego">{perfil.pontos}</span>
              </>
            )}
          </Link>
        )}
      </>
    )
  }

  return (
    <>
      {/* Ecrãs pequenos: barra no topo e menu deslizante. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/6 bg-[rgba(10,10,12,0.82)] px-4 py-2.5 backdrop-blur-[18px] lg:hidden">
        <Link to="/" aria-label="Rangify, ir para o dashboard" className="no-underline"><Marca /></Link>
        <button type="button" aria-label="Abrir menu" aria-expanded={aberto} onClick={() => setAberto(true)} className="relative grid size-11 cursor-pointer place-items-center rounded-[11px] border border-white/8 bg-white/[0.03] text-marfim">
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
        className={`sticky top-0 hidden h-screen shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-white/6 bg-[rgba(10,10,12,0.64)] pt-[22px] pb-4 backdrop-blur-[18px] lg:flex ${recolhido ? 'w-[84px] px-3' : 'w-[248px] px-3.5'}`}
      >
        {conteudo(false)}
      </aside>
    </>
  )
}
