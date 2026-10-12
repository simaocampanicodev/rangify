import { ArrowRight, LoaderCircle, LogOut, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { useFila } from '@/hooks/useFila'
import { relogio } from '@/lib/tempo'
import { BotaoAjuda } from './ui'

/** Os 10 lugares da fila, a encher. */
export function LugaresFila({ contagem, grosso = false }: { contagem: number; grosso?: boolean }) {
  return (
    <div role="img" aria-label={`${contagem} de 10 lugares preenchidos`} className="grid grid-cols-10 gap-[5px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`rounded-[3px] transition-colors duration-500 ${grosso ? 'h-2.5' : 'h-2'}`}
          style={{ background: i < contagem ? '#ff5b1f' : 'rgba(255,255,255,0.08)', boxShadow: i < contagem ? '0 0 10px rgba(255,91,31,0.5)' : undefined }}
        />
      ))}
    </div>
  )
}

/**
 * O cartão da fila: estado, lugares, tempo de espera e o botão de entrar ou sair.
 * "compacto" é a versão do Dashboard; "largo" ocupa a linha toda na página Jogar.
 */
export function CartaoFila({ compacto = false, largo = false }: { compacto?: boolean; largo?: boolean }) {
  const { fila, ocupado, alternar } = useFila()
  const { perfil } = useSessao()
  const agora = useAgora(1000)
  const naFila = !!fila?.naFila
  const contagem = fila?.contagem ?? 0
  const castigo = fila?.cooldownAte ? Math.max(0, (new Date(fila.cooldownAte).getTime() - agora) / 1000) : 0
  const espera = fila?.desde ? (agora - new Date(fila.desde).getTime()) / 1000 : 0

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex flex-col gap-[9px] rounded-xl border border-white/6 bg-white/[0.03] p-3.5 ${largo ? '' : 'max-w-[460px]'}`}>
        <div className="flex items-center justify-between text-[12.5px] text-suave">
          <span className="inline-flex items-center gap-2">
            <span className={`size-[7px] rounded-full bg-laranja ${naFila ? 'ao-vivo' : 'opacity-50'}`} />
            Fila {(fila?.regiao ?? perfil?.regiao ?? 'eu').toUpperCase()}, competitivo
            {naFila && <span className="font-mono text-pessego">· {relogio(espera)}</span>}
          </span>
          <span className="font-mono font-semibold text-texto">{contagem}/10</span>
        </div>
        <LugaresFila contagem={contagem} grosso={largo} />
        <span className="text-[12px] text-mudo">
          {castigo > 0
            ? `Não aceitaste a última partida. Podes voltar à fila daqui a ${relogio(castigo)}.`
            : naFila
              ? `Faltam ${10 - contagem} ${10 - contagem === 1 ? 'jogador' : 'jogadores'}. Quando a fila encher, ouves um som e aparece o alerta para aceitar, em qualquer página do site.`
              : 'Quando a fila encher, ouves um som e aparece um alerta para confirmar presença, em qualquer página do site.'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
        {naFila ? (
          <button type="button" className="btn btn-fantasma" disabled={ocupado} onClick={alternar}>
            {ocupado ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <LogOut size={16} className="text-laranja" aria-hidden />}
            Sair da fila
          </button>
        ) : (
          <button type="button" className="btn btn-primario" disabled={ocupado || castigo > 0} onClick={alternar}>
            {castigo > 0 ? <><Timer size={16} aria-hidden />{relogio(castigo)}</> : <>Entrar na fila<ArrowRight size={16} aria-hidden /></>}
          </button>
        )}
        {compacto && <BotaoAjuda topico="draft">Como funciona o draft</BotaoAjuda>}
        {compacto && <Link to="/jogar" className="text-[13.5px] font-semibold text-laranja-claro no-underline hover:text-pessego">Abrir a página Jogar</Link>}
      </div>
    </div>
  )
}
