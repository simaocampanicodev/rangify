import { ArrowDown, ArrowUp, Clock, CornerDownLeft, Home, Lightbulb, LogOut, Medal, Megaphone, Search, Settings, ShieldCheck, ShoppingBag, Swords, Target, Trophy, User, Users } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useSessao } from '@/contexts/Sessao'
import { useFila } from '@/hooks/useFila'
import { dados, type LinhaRanking } from '@/lib/data'
import { l } from '@/lib/idioma'
import { caminhoPerfil, nomeJogador } from '@/lib/partida'
import { Avatar } from './ui'

interface Item {
  id: string
  grupo: 'ir' | 'acao' | 'jogador'
  texto: string
  dica?: string
  icone: ReactNode
  /** O que se procura neste item (sem acentos nem maiúsculas). */
  alvo: string
  executar: () => void
}

const limpar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/** Quanto o texto combina com o que se escreveu: 0 não combina; mais é melhor (começa por, palavra a começar, contém, letras pela ordem). */
function pontuar(alvo: string, q: string): number {
  if (!q) return 1
  if (alvo.startsWith(q)) return 100
  if (alvo.split(/[\s#·-]+/).some((p) => p.startsWith(q))) return 80
  if (alvo.includes(q)) return 60
  let i = 0
  for (const c of alvo) if (c === q[i] && ++i === q.length) return 30
  return 0
}

const GRUPOS: Record<Item['grupo'], () => string> = {
  ir: () => l('IR PARA', 'GO TO'),
  acao: () => l('AÇÕES', 'ACTIONS'),
  jogador: () => l('JOGADORES', 'PLAYERS'),
}

/**
 * A paleta de comandos (ideia do Command Menu e do Spotlight Search do EasyUI): Ctrl/Cmd + K em qualquer página para ir a uma
 * página, entrar ou sair da fila e procurar jogadores pelo Riot ID. O destaque desliza de um resultado para o seguinte.
 */
export default function PaletaJanela({ aoFechar }: { aoFechar: () => void }) {
  const navegar = useNavigate()
  const { perfil, eStaff } = useSessao()
  const { fila, alternar } = useFila()
  // O alternar muda a cada desenho: guardado aqui, a lista de resultados não se refaz por causa dele.
  const alternarRef = useRef(alternar)
  alternarRef.current = alternar
  const [q, setQ] = useState('')
  const [ativo, setAtivo] = useState(0)
  const [jogadores, setJogadores] = useState<LinhaRanking[]>([])
  const [areas, setAreas] = useState({ loja: false, divulgar: false, torneios: false })
  const lista = useRef<HTMLUListElement>(null)
  const [destaque, setDestaque] = useState<{ top: number; height: number } | null>(null)

  // As áreas que só alguns veem (a loja, a divulgação e os torneios): pergunta-se uma vez, ao abrir a paleta pela primeira vez.
  useEffect(() => {
    let vivo = true
    Promise.allSettled([dados.lojaVisivel(), dados.streamersVisivel(), dados.torneiosVisivel()]).then(([a, b, c]) => {
      if (vivo) setAreas({ loja: a.status === 'fulfilled' && a.value, divulgar: b.status === 'fulfilled' && b.value, torneios: c.status === 'fulfilled' && c.value })
    })
    return () => { vivo = false }
  }, [])

  // Jogadores: só com duas letras ou mais, e só depois de parar de escrever.
  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) { setJogadores([]); return }
    let vivo = true
    const t = window.setTimeout(() => {
      dados.ranking({ limite: 5, pesquisa: termo }).then((r) => { if (vivo) setJogadores(r.linhas) }).catch(() => { if (vivo) setJogadores([]) })
    }, 250)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [q])

  const itens = useMemo<Item[]>(() => {
    const ir = (id: string, texto: string, para: string, icone: ReactNode, en?: string): Item => ({
      id, grupo: 'ir', texto, icone, alvo: limpar(`${texto} ${en ?? ''}`), executar: () => navegar(para),
    })
    const todos: Item[] = [
      ir('painel', l('Painel', 'Dashboard'), '/', <Home size={17} />, 'dashboard home'),
      ir('jogar', l('Jogar', 'Play'), '/jogar', <Swords size={17} />, 'fila queue play'),
      ir('tabela', l('Tabela', 'Leaderboard'), '/ranking', <Trophy size={17} />, 'ranking leaderboard'),
      ir('partidas', l('Partidas', 'Matches'), '/partidas', <Clock size={17} />, 'historico history matches'),
      ...(areas.torneios ? [ir('torneios', l('Torneios', 'Tournaments'), '/torneios', <Medal size={17} />, 'tournaments')] : []),
      ir('missoes', l('Missões', 'Missions'), '/missoes', <Target size={17} />, 'missions quests'),
      ir('amigos', l('Amigos', 'Friends'), '/amigos', <Users size={17} />, 'friends'),
      ir('sugestoes', l('Sugestões', 'Suggestions'), '/sugestoes', <Lightbulb size={17} />, 'suggestions ideas'),
      ...(areas.loja ? [ir('loja', l('Loja', 'Shop'), '/loja', <ShoppingBag size={17} />, 'shop store')] : []),
      ...(areas.divulgar ? [ir('divulgar', l('Divulgar', 'Share'), '/divulgar', <Megaphone size={17} />, 'promotion streamers')] : []),
      ir('perfil', l('O meu perfil', 'My profile'), perfil?.riotId ? caminhoPerfil(perfil.riotId) : '/definicoes', <User size={17} />, 'profile'),
      ir('definicoes', l('Definições', 'Settings'), '/definicoes', <Settings size={17} />, 'settings'),
      ...(eStaff ? [ir('staff', 'Staff', '/admin', <ShieldCheck size={17} />, 'admin')] : []),
    ]
    const acoes: Item[] = []
    if (fila?.naFila) {
      acoes.push({ id: 'sair', grupo: 'acao', texto: l('Sair da fila', 'Leave the queue'), icone: <LogOut size={17} />, alvo: limpar('sair da fila leave queue'), executar: () => { alternarRef.current() } })
    } else {
      acoes.push({ id: 'fila-aberta', grupo: 'acao', texto: l('Entrar na fila aberta', 'Join the open queue'), icone: <Users size={17} />, alvo: limpar('entrar fila aberta join open queue'), executar: () => { alternarRef.current('aberta'); navegar('/jogar') } })
      if (fila?.rankedPermitido) acoes.push({ id: 'fila-ranked', grupo: 'acao', texto: l('Entrar na fila ranked', 'Join the ranked queue'), icone: <Trophy size={17} />, alvo: limpar('entrar fila ranked join queue'), executar: () => { alternarRef.current('ranked'); navegar('/jogar') } })
    }
    const gente: Item[] = jogadores.map((j) => ({
      id: `j-${j.perfil.id}`, grupo: 'jogador', texto: nomeJogador(j.perfil), dica: `#${j.posicao}`,
      icone: <Avatar nome={nomeJogador(j.perfil)} url={j.perfil.avatarUrl} tamanho={24} />,
      alvo: '', executar: () => navegar(caminhoPerfil(j.perfil.riotId)),
    }))
    const termo = limpar(q)
    const filtrados = [...todos, ...acoes]
      .map((i, ordem) => ({ i, p: pontuar(i.alvo, termo), ordem }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || a.ordem - b.ordem)
      .map((x) => x.i)
    // Os jogadores vêm sempre do servidor já filtrados.
    return [...filtrados, ...gente]
  }, [q, areas, jogadores, perfil, eStaff, fila?.naFila, fila?.rankedPermitido, navegar])

  useEffect(() => { setAtivo(0) }, [q])
  const fechado = useRef(false)
  const correr = (i: Item | undefined) => { if (!i || fechado.current) return; fechado.current = true; aoFechar(); i.executar() }

  // O destaque mede o resultado ativo e desliza até lá.
  useLayoutEffect(() => {
    const li = lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)
    if (li) {
      const top = li.offsetTop
      const height = li.offsetHeight
      setDestaque((d) => (d && d.top === top && d.height === height ? d : { top, height }))
      li.scrollIntoView({ block: 'nearest' })
    } else setDestaque(null)
  }, [ativo, itens])

  useEffect(() => {
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [])

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); aoFechar() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((v) => (itens.length ? (v + 1) % itens.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((v) => (itens.length ? (v - 1 + itens.length) % itens.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); correr(itens[ativo]) }
  }

  let grupoAnterior: Item['grupo'] | null = null
  return createPortal(
    <div className="fixed inset-0 z-[85] grid place-items-start justify-items-center bg-[rgba(5,5,7,0.78)] p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div role="dialog" aria-modal="true" aria-label={l('Paleta de comandos', 'Command palette')} onKeyDown={tecla} className="painel assenta flex max-h-[min(520px,76vh)] w-full max-w-[580px] flex-col overflow-hidden !rounded-2xl !bg-[rgba(14,14,17,0.97)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/8 px-4">
          <Search size={17} className="shrink-0 text-laranja" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="rg-paleta-lista"
            aria-activedescendant={itens[ativo] ? `rg-paleta-${itens[ativo].id}` : undefined}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={l('Ir para, entrar na fila ou procurar um jogador…', 'Go to, join the queue or find a player…')}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-texto outline-none placeholder:text-mudo"
          />
          <kbd className="hidden rounded-md border border-white/12 bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-mudo sm:block">Esc</kbd>
        </div>
        <ul id="rg-paleta-lista" ref={lista} role="listbox" className="relative m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
          {destaque && <span aria-hidden className="pointer-events-none absolute right-2 left-2 rounded-[10px] border border-laranja/32 bg-laranja/12 transition-[top,height] duration-200 ease-[cubic-bezier(.34,1.3,.64,1)]" style={{ top: destaque.top, height: destaque.height }} />}
          {itens.length === 0 && <li className="px-3 py-8 text-center text-[13.5px] text-mudo">{l('Nada encontrado.', 'Nothing found.')}</li>}
          {itens.map((it, i) => {
            const cabecalho = it.grupo !== grupoAnterior
            grupoAnterior = it.grupo
            return (
              <li key={it.id} role="presentation">
                {cabecalho && <div className="rotulo px-3 pt-2.5 pb-1.5">{GRUPOS[it.grupo]()}</div>}
                <div
                  id={`rg-paleta-${it.id}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseMove={() => { if (i !== ativo) setAtivo(i) }}
                  onClick={() => correr(it)}
                  className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[14px] font-semibold ${i === ativo ? 'text-pessego-claro' : 'text-suave'}`}
                >
                  <span className="grid size-6 shrink-0 place-items-center text-laranja">{it.icone}</span>
                  <span className="min-w-0 flex-1 truncate">{it.texto}</span>
                  {it.dica && <span className="font-mono text-[11px] text-mudo">{it.dica}</span>}
                  {i === ativo && <CornerDownLeft size={14} className="shrink-0 text-mudo" aria-hidden />}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-white/8 px-4 py-2 font-mono text-[10.5px] text-mudo sm:flex">
          <span className="flex items-center gap-1"><ArrowUp size={11} aria-hidden /><ArrowDown size={11} aria-hidden />{l('mover', 'move')}</span>
          <span className="flex items-center gap-1"><CornerDownLeft size={11} aria-hidden />{l('abrir', 'open')}</span>
          <span>Esc {l('fechar', 'close')}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
