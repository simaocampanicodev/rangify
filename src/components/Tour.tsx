import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSessao } from '@/contexts/Sessao'
import { dados } from '@/lib/dados'
import { NomeRangify } from './Marca'
import { l } from '@/lib/idioma'

interface Passo { alvo: string | null; titulo: string; texto: ReactNode }

const R = <NomeRangify className="text-laranja-claro" />

/** Os passos na língua do site (construídos ao mostrar o guia). */
const passos = (): Passo[] => [
  { alvo: null, titulo: l('Bem-vindo ao Rangify', 'Welcome to Rangify'), texto: l('Uma volta rápida pelas abas, para saberes onde está cada coisa. Demora menos de um minuto e podes rever tudo nas Definições.', 'A quick tour of the tabs, so you know where everything is. It takes under a minute and you can replay it in Settings.') },
  { alvo: 'dashboard', titulo: l('Painel', 'Dashboard'), texto: l('O teu ponto de partida: pontos, posição na tabela, missões e as últimas partidas.', 'Your starting point: points, leaderboard position, missions and your latest matches.') },
  { alvo: 'jogar', titulo: l('Jogar', 'Play'), texto: l('Entras na fila e, com 10 jogadores, aceitas a partida. Depois vêm o draft dos capitães, os bans de mapas, o código do grupo e o resultado.', 'Join the queue and, with 10 players, accept the match. Then come the captains\' draft, map bans, the party code and the result.') },
  { alvo: 'ranking', titulo: l('Tabela', 'Leaderboard'), texto: <>{l('Ordenada pelos pontos', 'Sorted by')} {R}{l('. Toda a gente começa com 1000. O teu rank oficial é usado para atribuir os pontos: ganhar a uma equipa acima de ti vale mais.', ' points. Everyone starts at 1000. Your official rank is used to award points: beating a team above you is worth more.')}</> },
  { alvo: 'partidas', titulo: l('Partidas', 'Matches'), texto: l('O histórico do hub e o teu, com o resultado, o mapa, o KDA, o ACS e os pontos de cada jogo.', 'The hub history and yours, with the score, map, KDA, ACS and points of each game.') },
  { alvo: 'missoes', titulo: l('Missões', 'Missions'), texto: l('Missões diárias, semanais e de temporada que dão XP para subires de nível no passe. O progresso conta sozinho.', 'Daily, weekly and season missions that give XP to level up your pass. Progress counts on its own.') },
  { alvo: 'amigos', titulo: l('Amigos', 'Friends'), texto: l('Adiciona quem conheces pelo Riot ID e vê quem está na fila ou a jogar.', 'Add people you know by Riot ID and see who is queueing or playing.') },
  { alvo: 'sugestoes', titulo: l('Sugestões', 'Suggestions'), texto: <>{l('Propõe ideias para o', 'Suggest ideas for')} {R} {l('e vota nas da comunidade.', 'and vote on the community\'s.')}</> },
  { alvo: 'perfil', titulo: l('Perfil', 'Profile'), texto: l('A tua página pública: a forma das últimas partidas, as estatísticas e o rank oficial sincronizado.', 'Your public page: recent form, stats and your synced official rank.') },
  { alvo: 'definicoes', titulo: l('Definições', 'Settings'), texto: l('Região, função preferida, língua, som, palavra-passe e este guia, se quiseres vê-lo outra vez.', 'Region, preferred role, language, sound, password and this tour, if you want to see it again.') },
  { alvo: 'ajuda', titulo: l('Dúvidas? Há um botão para isso', 'Questions? There is a button for that'), texto: l('Os botões "Como funciona" explicam a fila, o draft, os mapas, o resultado e a tabela. Boas partidas!', 'The "How it works" buttons explain the queue, the draft, maps, results and the leaderboard. Have fun!') },
]

interface Caixa { top: number; left: number; width: number; height: number }

function visivel(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function procurar(alvo: string | null): HTMLElement | null {
  if (!alvo) return null
  const seletor = alvo === 'ajuda' ? '[data-ajuda]' : `[data-tour="${alvo}"]`
  return [...document.querySelectorAll(seletor)].find(visivel) as HTMLElement | undefined ?? null
}

/** Visita guiada para contas novas, ancorada aos itens da barra lateral. */
export function Tour({ abrirJa = false }: { abrirJa?: boolean }) {
  const { perfil, sessao } = useSessao()
  // Carregado a pedido (rever o guia nas Definições): abre logo no primeiro passo.
  const [passo, setPasso] = useState<number | null>(abrirJa ? 0 : null)
  const [caixa, setCaixa] = useState<Caixa | null>(null)
  const mostrado = useRef(false)

  // Contas novas (sem tourVistoEm) veem a visita assim que a conta fica completa.
  useEffect(() => {
    if (!mostrado.current && perfil && sessao && !sessao.incompleta && !perfil.tourVistoEm) {
      mostrado.current = true
      setPasso(0)
    }
  }, [perfil, sessao])

  useEffect(() => {
    const abrir = () => setPasso(0)
    window.addEventListener('rangify:tour', abrir)
    return () => window.removeEventListener('rangify:tour', abrir)
  }, [])

  const medir = useCallback(() => {
    if (passo === null) return
    const el = procurar(passos()[passo].alvo)
    if (!el) { setCaixa(null); return }
    el.scrollIntoView({ block: 'nearest' })
    const r = el.getBoundingClientRect()
    setCaixa({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [passo])

  useLayoutEffect(() => {
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [medir])

  const terminar = useCallback(() => {
    setPasso(null)
    dados.marcarTourVisto(true).catch(() => {})
  }, [])

  useEffect(() => {
    if (passo === null) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') terminar()
      if (e.key === 'ArrowRight') setPasso((p) => (p !== null && p < passos().length - 1 ? p + 1 : p))
      if (e.key === 'ArrowLeft') setPasso((p) => (p ? p - 1 : p))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [passo, terminar])

  if (passo === null) return null
  const lista = passos()
  const p = lista[passo]
  const ultimo = passo === lista.length - 1
  const largura = Math.min(360, window.innerWidth - 32)

  // A caixa fica à direita do item, ou centrada quando o item não está à vista.
  let estilo: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  let seta: 'esquerda' | 'cima' | null = null
  if (caixa) {
    const espacoDireita = window.innerWidth - (caixa.left + caixa.width)
    if (espacoDireita > largura + 40) {
      const top = Math.max(16, Math.min(window.innerHeight - 260, caixa.top + caixa.height / 2 - 70))
      estilo = { left: caixa.left + caixa.width + 22, top }
      seta = 'esquerda'
    } else {
      const top = Math.min(window.innerHeight - 280, caixa.top + caixa.height + 18)
      estilo = { left: Math.max(16, Math.min(window.innerWidth - largura - 16, caixa.left)), top }
      seta = 'cima'
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="rg-tour-titulo">
      {caixa ? (
        <div
          className="pointer-events-none fixed rounded-[12px] border-2 border-laranja transition-all duration-300"
          style={{ top: caixa.top - 6, left: caixa.left - 6, width: caixa.width + 12, height: caixa.height + 12, boxShadow: '0 0 0 9999px rgba(5,5,7,0.74), 0 0 32px -4px rgba(255,91,31,0.6)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(5,5,7,0.74)]" />
      )}
      <div className="painel entra fixed flex flex-col gap-3.5 !bg-[rgba(16,16,19,0.97)] p-5 shadow-2xl transition-[top,left] duration-300" style={{ ...estilo, width: largura }} key={passo}>
        {seta === 'esquerda' && <span aria-hidden className="absolute top-[62px] -left-[7px] size-3 rotate-45 border-b border-l border-white/10 bg-[#101013]" />}
        {seta === 'cima' && <span aria-hidden className="absolute -top-[7px] left-6 size-3 rotate-45 border-t border-l border-white/10 bg-[#101013]" />}
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow flex items-center gap-2"><Sparkles size={13} aria-hidden />{l('Guia', 'Tour')} · {passo + 1} {l('de', 'of')} {lista.length}</span>
          <button type="button" onClick={terminar} aria-label={l('Saltar o guia', 'Skip the tour')} className="-mt-2 -mr-2 grid size-9 cursor-pointer place-items-center rounded-lg text-mudo hover:bg-white/6 hover:text-texto">
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="rg-tour-titulo" className="m-0 text-[19px] font-extrabold tracking-[-0.025em]">{passo === 0 ? <>{l('Bem-vindo ao', 'Welcome to')} <NomeRangify className="text-laranja" /></> : p.titulo}</h2>
        <p className="m-0 text-[14px] leading-[1.55] text-suave">{p.texto}</p>
        <div className="flex gap-1" aria-hidden>
          {lista.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= passo ? 'bg-laranja' : 'bg-white/10'}`} />)}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={terminar} className="cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-mudo hover:text-texto">{l('Saltar', 'Skip')}</button>
          <div className="flex gap-2">
            {passo > 0 && (
              <button type="button" className="btn btn-fantasma !min-h-10 !px-3" onClick={() => setPasso(passo - 1)}>
                <ArrowLeft size={15} aria-hidden />{l('Anterior', 'Back')}
              </button>
            )}
            <button type="button" className="btn btn-primario !min-h-10" onClick={() => (ultimo ? terminar() : setPasso(passo + 1))} autoFocus>
              {ultimo ? l('Começar a jogar', 'Start playing') : l('Seguinte', 'Next')}
              {!ultimo && <ArrowRight size={15} aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Volta a mostrar o guia (por exemplo, a partir das Definições). */
export function reverTour() {
  window.dispatchEvent(new Event('rangify:tour'))
}
