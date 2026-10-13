import { ArrowRight, LogOut, Radio, Users } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { useFila } from '@/hooks/useFila'
import { useSessao } from '@/contexts/Sessao'
import { NOMES_ESTADO } from '@/lib/regras'
import { relogio } from '@/lib/tempo'
import { Fundo } from './Fundo'
import { Confirmar } from './partida/Confirmar'
import { Rodape } from './Rodape'
import { Sidebar } from './Sidebar'
import { Carregando } from './ui'
import { l } from '@/lib/idioma'

/** Aviso no topo de qualquer página enquanto tens uma partida a decorrer. */
function FaixaPartida() {
  const { partida, ativa } = usePartida()
  const local = useLocation()
  if (!ativa || !partida || partida.estado === 'READY_CHECK' || local.pathname === '/jogar') return null
  return (
    <Link to="/jogar" className="flex items-center justify-center gap-3 border-b border-laranja/30 bg-laranja/12 px-4 py-2.5 text-[13.5px] font-semibold text-pessego-claro no-underline hover:bg-laranja/18">
      <Radio size={16} className="ao-vivo text-laranja" aria-hidden />
      {l('Partida', 'Match')} {partida.codigo} {l('a decorrer', 'in progress')}: {NOMES_ESTADO[partida.estado]}
      <span className="inline-flex items-center gap-1 text-laranja-claro">{l('Voltar à partida', 'Back to match')}<ArrowRight size={14} aria-hidden /></span>
    </Link>
  )
}

/** Só este número muda a cada segundo, não a faixa toda. */
function TempoNaFila({ desde }: { desde: string | null }) {
  const agora = useAgora(1000)
  const espera = desde ? (agora - new Date(desde).getTime()) / 1000 : 0
  return <span className="font-mono text-texto">{relogio(espera)}</span>
}

/** Enquanto estás na fila e andas pelo site: há quanto tempo e quantos já lá estão. */
function FaixaFila() {
  const { ativa } = usePartida()
  const { fila, ocupado, alternar } = useFila()
  const local = useLocation()
  if (!fila?.naFila || ativa || local.pathname === '/jogar') return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-laranja/30 bg-laranja/12 px-4 py-2 text-[13.5px] font-semibold text-pessego-claro">
      <span className="flex items-center gap-2.5">
        <span className="relative size-2"><span className="ping absolute inset-0 rounded-full bg-laranja" /><span className="absolute inset-0 rounded-full bg-laranja" /></span>
        {l('Na fila há', 'In queue for')} <TempoNaFila desde={fila.desde} />
      </span>
      <span className="flex items-center gap-2">
        <Users size={15} className="text-laranja" aria-hidden />
        <span className="font-mono text-texto">{fila.contagem}/10</span> {l('jogadores', 'players')}
        <span aria-hidden className="ml-1 hidden gap-[3px] sm:flex">
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-1.5 w-2.5 rounded-[2px] ${i < fila.contagem ? 'bg-laranja' : 'bg-white/12'}`} />)}
        </span>
      </span>
      <Link to="/jogar" className="inline-flex items-center gap-1 text-laranja-claro no-underline hover:text-pessego">{l('Ver fila', 'View queue')}<ArrowRight size={14} aria-hidden /></Link>
      <button type="button" disabled={ocupado} onClick={alternar} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-laranja/30 bg-transparent px-2.5 py-1 text-[12.5px] font-semibold text-pessego-claro hover:bg-laranja/15">
        <LogOut size={13} aria-hidden />{l('Sair', 'Leave')}
      </button>
    </div>
  )
}

/** O esqueleto das páginas com sessão: barra lateral, conteúdo e o aviso legal sempre no fundo. */
export function Layout() {
  const { carregando, sessao } = useSessao()
  const local = useLocation()
  if (carregando) return <div className="grid min-h-screen place-items-center"><Carregando /></div>
  if (!sessao) return <Navigate to="/entrar" replace state={{ de: local.pathname }} />
  if (sessao.incompleta) return <Navigate to="/bem-vindo" replace />

  return (
    <div className="relative min-h-screen">
      <Fundo />
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col lg:min-h-screen">
          <FaixaPartida />
          <FaixaFila />
          <main id="conteudo" className="w-full flex-1 px-[clamp(16px,3.2vw,48px)] pt-[30px] pb-12">
            {/* A chave muda com a página: cada aba entra com a sua animação. */}
            <div key={local.pathname} className="entra-pagina flex max-w-[1180px] flex-col gap-6">
              <Suspense fallback={<Carregando />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
          <Rodape />
        </div>
      </div>
      <Confirmar />
      <TourSoQuandoPreciso />
    </div>
  )
}

// O guia da primeira visita só descarrega para contas novas ou quando alguém o pede.
const Tour = lazy(() => import('./Tour').then((m) => ({ default: m.Tour })))

function TourSoQuandoPreciso() {
  const { perfil, sessao } = useSessao()
  const [pedido, setPedido] = useState(false)
  useEffect(() => {
    const abrir = () => setPedido(true)
    window.addEventListener('rangify:tour', abrir)
    return () => window.removeEventListener('rangify:tour', abrir)
  }, [])
  const novo = !!perfil && !!sessao && !sessao.incompleta && !perfil.tourVistoEm
  if (!novo && !pedido) return null
  return <Suspense fallback={null}><Tour abrirJa={pedido} /></Suspense>
}

/** Páginas sem sessão (entrar e primeiro acesso): o mesmo fundo e o mesmo rodapé no fim do ecrã. */
export function LayoutSimples({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Fundo />
      <div className="relative z-10 flex min-h-screen flex-col">
        <main className="flex w-full flex-1 items-center justify-center px-4 py-10">{children}</main>
        <Rodape />
      </div>
    </div>
  )
}
