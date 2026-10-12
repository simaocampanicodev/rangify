import { ArrowRight, LogOut, Radio, Users } from 'lucide-react'
import { Suspense } from 'react'
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
import { Tour } from './Tour'
import { Carregando } from './ui'

/** Aviso no topo de qualquer página enquanto tens uma partida a decorrer. */
function FaixaPartida() {
  const { partida, ativa } = usePartida()
  const local = useLocation()
  if (!ativa || !partida || partida.estado === 'READY_CHECK' || local.pathname === '/jogar') return null
  return (
    <Link to="/jogar" className="flex items-center justify-center gap-3 border-b border-laranja/30 bg-laranja/12 px-4 py-2.5 text-[13.5px] font-semibold text-pessego-claro no-underline hover:bg-laranja/18">
      <Radio size={16} className="ao-vivo text-laranja" aria-hidden />
      Partida {partida.codigo} a decorrer: {NOMES_ESTADO[partida.estado]}
      <span className="inline-flex items-center gap-1 text-laranja-claro">Voltar à partida<ArrowRight size={14} aria-hidden /></span>
    </Link>
  )
}

/** Enquanto estás na fila e andas pelo site: há quanto tempo e quantos já lá estão. */
function FaixaFila() {
  const { ativa } = usePartida()
  const { fila, ocupado, alternar } = useFila()
  const local = useLocation()
  const agora = useAgora(1000)
  if (!fila?.naFila || ativa || local.pathname === '/jogar') return null
  const espera = fila.desde ? (agora - new Date(fila.desde).getTime()) / 1000 : 0
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-laranja/30 bg-laranja/12 px-4 py-2 text-[13.5px] font-semibold text-pessego-claro">
      <span className="flex items-center gap-2.5">
        <span className="relative size-2"><span className="ping absolute inset-0 rounded-full bg-laranja" /><span className="absolute inset-0 rounded-full bg-laranja" /></span>
        Na fila há <span className="font-mono text-texto">{relogio(espera)}</span>
      </span>
      <span className="flex items-center gap-2">
        <Users size={15} className="text-laranja" aria-hidden />
        <span className="font-mono text-texto">{fila.contagem}/10</span> jogadores
        <span aria-hidden className="ml-1 hidden gap-[3px] sm:flex">
          {Array.from({ length: 10 }, (_, i) => <span key={i} className={`h-1.5 w-2.5 rounded-[2px] ${i < fila.contagem ? 'bg-laranja' : 'bg-white/12'}`} />)}
        </span>
      </span>
      <Link to="/jogar" className="inline-flex items-center gap-1 text-laranja-claro no-underline hover:text-pessego">Ver fila<ArrowRight size={14} aria-hidden /></Link>
      <button type="button" disabled={ocupado} onClick={alternar} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-laranja/30 bg-transparent px-2.5 py-1 text-[12.5px] font-semibold text-pessego-claro hover:bg-laranja/15">
        <LogOut size={13} aria-hidden />Sair
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
      <Tour />
    </div>
  )
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
