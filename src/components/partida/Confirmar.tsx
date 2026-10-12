import { Check, Hourglass, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { dados } from '@/lib/dados'
import { nomeJogador } from '@/lib/partida'
import { BONUS_MAX, PONTOS_BASE } from '@/lib/pontos'
import { nomeRank, tierMedio } from '@/lib/ranks'
import { SEGUNDOS_CONFIRMAR } from '@/lib/regras'
import { tocarPartidaEncontrada } from '@/lib/som'
import { emFalta } from '@/lib/tempo'
import { iniciais } from '../ui'
import { Relogio } from './Relogio'

/**
 * "Partida encontrada": aparece por cima de qualquer página quando a fila
 * enche. 20 segundos para aceitar; quem recusa fica de castigo.
 */
export function Confirmar() {
  const { partida, atualizar } = usePartida()
  const { perfil } = useSessao()
  const acao = useAcao()
  const navegar = useNavigate()
  const agora = useAgora(200)
  const [aEnviar, setAEnviar] = useState(false)

  // Som e título do separador a piscar enquanto não aceitas: lembra-te de voltar ao site.
  const pendente = !!partida && !!perfil && partida.estado === 'READY_CHECK' && !partida.automatica
    && partida.jogadores.some((j) => j.perfilId === perfil.id && !j.aceitou)
  const idPendente = pendente ? partida!.id : null
  const segundos = idPendente ? emFalta(partida!.prazoConfirmacao, agora) : 0
  const tocou = useRef<string | null>(null)
  const lembrou = useRef<string | null>(null)
  useEffect(() => {
    if (!idPendente || tocou.current === idPendente) return
    tocou.current = idPendente
    tocarPartidaEncontrada()
  }, [idPendente])
  useEffect(() => {
    if (!idPendente || lembrou.current === idPendente || segundos > 8 || segundos <= 0) return
    lembrou.current = idPendente
    tocarPartidaEncontrada(true)
  }, [idPendente, segundos])
  useEffect(() => {
    if (!idPendente) return
    const antes = document.title
    let aceso = true
    document.title = '(!) Partida encontrada'
    const t = window.setInterval(() => {
      aceso = !aceso
      document.title = aceso ? '(!) Partida encontrada' : antes
    }, 1000)
    return () => { window.clearInterval(t); document.title = antes }
  }, [idPendente])

  if (!partida || partida.estado !== 'READY_CHECK' || !perfil) return null
  const eu = partida.jogadores.find((j) => j.perfilId === perfil.id)
  if (!eu) return null

  const restante = emFalta(partida.prazoConfirmacao, agora)
  const aceites = partida.jogadores.filter((j) => j.aceitou).length
  const faltam = 10 - aceites
  const responder = async (aceita: boolean) => {
    setAEnviar(true)
    await acao(() => dados.responderConfirmacao(partida.id, aceita))
    await atualizar()
    setAEnviar(false)
    if (aceita) navegar('/jogar')
  }

  return createPortal(
    <div className="fixed inset-0 z-[75] grid place-items-center overflow-y-auto bg-[rgba(5,5,7,0.78)] p-4 backdrop-blur-[4px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rg-conf-titulo"
        className="entra relative my-6 flex w-full max-w-[780px] flex-col items-center gap-6 rounded-[26px] border border-laranja/32 bg-[rgba(13,13,16,0.94)] p-[clamp(22px,4vw,36px)] text-center backdrop-blur-[20px]"
        style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 40px 120px -40px rgba(255,91,31,0.6)' }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[26px]" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255,91,31,0.12), rgba(0,0,0,0) 70%)' }} />
        <div className="relative flex w-full flex-wrap items-center justify-between gap-3">
          <span className="inline-flex h-8 items-center gap-2.5 rounded-full border border-laranja/32 bg-laranja/12 pr-3.5 pl-2.5 font-mono text-[11px] font-bold tracking-[0.14em] text-pessego">
            <span className="relative size-2"><span className="ping absolute inset-0 rounded-full bg-laranja" /><span className="absolute inset-0 rounded-full bg-laranja" /></span>
            PARTIDA ENCONTRADA
          </span>
          <span className="text-[12.5px] text-[#a6a19a]">Fila {partida.regiao.toUpperCase()} · Competitivo 5v5{partida.simulada ? ' · Simulação' : ''}</span>
        </div>

        <Relogio restante={restante} total={SEGUNDOS_CONFIRMAR} tamanho={176} espessura={8} legenda={eu.aceitou ? 'à espera' : 'para aceitar'} />

        <div className="relative flex max-w-[520px] flex-col gap-2">
          <h1 id="rg-conf-titulo" className="m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            {eu.aceitou ? 'Aceitaste. Falta pouco.' : 'A tua partida está pronta'}
          </h1>
          <p className="m-0 text-[14.5px] leading-[1.55] text-suave">
            {eu.aceitou
              ? `À espera de ${faltam} ${faltam === 1 ? 'jogador' : 'jogadores'}. Se alguém não aceitar, voltas à fila com o mesmo lugar.`
              : 'Dez jogadores encontrados. Aceita para seguir para o draft dos capitães. Se recusares, ficas 5 minutos sem poder entrar na fila.'}
          </p>
        </div>

        <div role="list" aria-label="Jogadores da partida" className="relative grid w-full grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          {partida.jogadores.map((j) => (
            <div
              key={j.perfilId}
              role="listitem"
              className={`flex min-h-[52px] items-center gap-2.5 rounded-xl border px-2.5 text-left transition-colors duration-300 ${j.aceitou ? 'border-laranja/40 bg-laranja/10' : 'border-dashed border-white/12 bg-white/[0.02]'}`}
            >
              <span className="relative grid size-[30px] shrink-0 place-items-center rounded-lg text-[11px] font-extrabold text-[#fff3ec]" style={{ background: j.aceitou ? 'linear-gradient(135deg,#5b2a17,#b0461c)' : '#25252a' }}>
                {j.avatarUrl
                  ? <img src={j.avatarUrl} alt="" className={`size-[30px] rounded-lg object-cover ${j.aceitou ? '' : 'opacity-60 grayscale'}`} />
                  : iniciais(nomeJogador(j))}
                <span aria-hidden className={`absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full ${j.aceitou ? 'bg-laranja text-escuro-laranja' : 'bg-[#3a3a40] text-mudo'}`} style={{ boxShadow: '0 0 0 2px #0d0d10' }}>
                  {j.aceitou ? <Check size={9} strokeWidth={3} /> : <Hourglass size={8} />}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-px">
                <span className="truncate text-[13px] font-semibold">{j.perfilId === perfil.id ? 'Tu' : nomeJogador(j)}</span>
                <span className={`text-[11px] ${j.aceitou ? 'text-pessego' : 'text-mudo'}`}>{j.aceitou ? 'Aceitou' : 'A decidir'}</span>
              </span>
            </div>
          ))}
        </div>

        {eu.aceitou ? (
          <div role="status" className="relative inline-flex h-14 items-center gap-2.5 rounded-2xl border border-laranja/32 bg-laranja/12 px-[22px] text-[15px] font-bold text-pessego-claro">
            <Check size={18} aria-hidden />
            Aceite. À espera de {faltam}
          </div>
        ) : (
          <div className="relative flex w-full flex-col items-center gap-3">
            <button type="button" disabled={aEnviar} onClick={() => responder(true)} className="btn btn-primario h-[60px] w-full max-w-[380px] !rounded-2xl !text-[18px] !font-extrabold tracking-[0.04em]" autoFocus>
              ACEITAR
            </button>
            <button type="button" disabled={aEnviar} onClick={() => responder(false)} className="btn border-0 bg-transparent text-suave hover:text-texto">
              <X size={16} aria-hidden />Recusar
            </button>
          </div>
        )}

        <div className="relative grid w-full grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 border-t border-white/7 pt-[18px]">
          <div className="flex flex-col gap-1"><span className="rotulo">Média da sala</span><span className="text-[14px] font-semibold">{nomeRank(tierMedio(partida.jogadores.map((j) => j.tier)))}</span></div>
          <div className="flex flex-col gap-1"><span className="rotulo">Aceitaram</span><span className="font-mono text-[14px] font-semibold">{aceites}/10</span></div>
          <div className="flex flex-col gap-1"><span className="rotulo">Pontos em jogo</span><span className="font-mono text-[14px] font-semibold text-pessego">até +{PONTOS_BASE + BONUS_MAX}</span></div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
