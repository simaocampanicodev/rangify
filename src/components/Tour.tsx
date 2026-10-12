import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSessao } from '@/contexts/Sessao'
import { dados } from '@/lib/dados'
import { NomeRangify } from './Marca'

interface Passo { alvo: string | null; titulo: string; texto: ReactNode }

const R = <NomeRangify className="text-laranja-claro" />

const PASSOS: Passo[] = [
  { alvo: null, titulo: 'Bem-vindo ao Rangify', texto: <>Uma volta rápida pelas abas, para saberes onde está cada coisa. Demora menos de um minuto e podes rever tudo nas Definições.</> },
  { alvo: 'dashboard', titulo: 'Dashboard', texto: <>O teu ponto de partida: pontos, posição no ranking, missões da semana e as últimas partidas.</> },
  { alvo: 'jogar', titulo: 'Jogar', texto: <>Entras na fila e, com 10 jogadores, aceitas a partida. Depois vêm o draft dos capitães, os bans de mapas, o código do grupo e o resultado.</> },
  { alvo: 'ranking', titulo: 'Ranking', texto: <>Ordenado pelos pontos {R}. Toda a gente começa com 1000. O teu rank oficial só serve para ver se a equipa adversária está acima ou abaixo de ti, o que muda os pontos que ganhas ou perdes.</> },
  { alvo: 'partidas', titulo: 'Partidas', texto: <>O histórico do hub e o teu, com o resultado, o mapa, o KDA, o ACS e os pontos de cada jogo.</> },
  { alvo: 'missoes', titulo: 'Missões', texto: <>Objetivos semanais e de temporada, como ganhar a equipas acima do teu rank. O progresso conta sozinho.</> },
  { alvo: 'amigos', titulo: 'Amigos', texto: <>Adiciona quem conheces pelo Riot ID e vê quem está na fila ou a jogar.</> },
  { alvo: 'sugestoes', titulo: 'Sugestões', texto: <>Propõe ideias para o {R} e vota nas da comunidade.</> },
  { alvo: 'perfil', titulo: 'Perfil', texto: <>A tua página pública: a forma das últimas partidas, as estatísticas e o rank oficial sincronizado.</> },
  { alvo: 'definicoes', titulo: 'Definições', texto: <>Região, função preferida, palavra-passe e este guia, se quiseres vê-lo outra vez.</> },
  { alvo: 'ajuda', titulo: 'Dúvidas? Há um botão para isso', texto: <>Os botões "Como funciona" explicam a fila, o draft, os mapas, o resultado e o ranking. Na página Jogar tens um para cada fase. Boas partidas!</> },
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
export function Tour() {
  const { perfil, sessao } = useSessao()
  const [passo, setPasso] = useState<number | null>(null)
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
    const el = procurar(PASSOS[passo].alvo)
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
      if (e.key === 'ArrowRight') setPasso((p) => (p !== null && p < PASSOS.length - 1 ? p + 1 : p))
      if (e.key === 'ArrowLeft') setPasso((p) => (p ? p - 1 : p))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [passo, terminar])

  if (passo === null) return null
  const p = PASSOS[passo]
  const ultimo = passo === PASSOS.length - 1
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
          <span className="eyebrow flex items-center gap-2"><Sparkles size={13} aria-hidden />Guia · {passo + 1} de {PASSOS.length}</span>
          <button type="button" onClick={terminar} aria-label="Saltar o guia" className="-mt-2 -mr-2 grid size-9 cursor-pointer place-items-center rounded-lg text-mudo hover:bg-white/6 hover:text-texto">
            <X size={16} aria-hidden />
          </button>
        </div>
        <h2 id="rg-tour-titulo" className="m-0 text-[19px] font-extrabold tracking-[-0.025em]">{passo === 0 ? <>Bem-vindo ao <NomeRangify className="text-laranja" /></> : p.titulo}</h2>
        <p className="m-0 text-[14px] leading-[1.55] text-suave">{p.texto}</p>
        <div className="flex gap-1" aria-hidden>
          {PASSOS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= passo ? 'bg-laranja' : 'bg-white/10'}`} />)}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={terminar} className="cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-mudo hover:text-texto">Saltar</button>
          <div className="flex gap-2">
            {passo > 0 && (
              <button type="button" className="btn btn-fantasma !min-h-10 !px-3" onClick={() => setPasso(passo - 1)}>
                <ArrowLeft size={15} aria-hidden />Anterior
              </button>
            )}
            <button type="button" className="btn btn-primario !min-h-10" onClick={() => (ultimo ? terminar() : setPasso(passo + 1))} autoFocus>
              {ultimo ? 'Começar a jogar' : 'Seguinte'}
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
