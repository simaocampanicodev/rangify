import { ChevronRight, CircleQuestionMark, LoaderCircle, Star, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { corRank, nomeRank } from '@/lib/ranks'
import { iconeAgente } from '@/lib/agentes'
import { useAjuda, type TopicoAjuda } from './Ajuda'
import { l } from '@/lib/idioma'

/** Converte #rrggbb em rgba(r,g,b,a). */
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function Cabecalho({ migalhas, titulo, descricao, acoes }: {
  migalhas: string[]; titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-[18px]">
      <div className="flex min-w-0 flex-col gap-2.5">
        <nav aria-label={l('Localização', 'Breadcrumb')} className="flex items-center gap-2 text-[13px] text-mudo">
          {migalhas.map((m, i) => (
            <span key={m} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} aria-hidden />}
              <span className={i === migalhas.length - 1 ? 'font-semibold text-texto' : ''}>{m}</span>
            </span>
          ))}
        </nav>
        <h1 className="m-0 text-[clamp(32px,4vw,46px)] leading-[1.02] font-extrabold tracking-[-0.045em]">{titulo}</h1>
        {descricao && <p className="m-0 max-w-[600px] text-[15px] leading-[1.55] text-suave">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  )
}

export function Painel({ children, className = '', as: Tag = 'section', ...resto }: {
  children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'
} & React.HTMLAttributes<HTMLElement>) {
  return <Tag className={`painel ${className}`} {...resto}>{children}</Tag>
}

export function TituloPainel({ eyebrow, titulo, id, direita }: { eyebrow?: string; titulo?: ReactNode; id?: string; direita?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-[5px]">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {titulo && <h2 id={id} className="m-0 text-[19px] font-bold tracking-[-0.02em]">{titulo}</h2>}
      </div>
      {direita}
    </div>
  )
}

/** Quadrado laranja para os ícones das secções, como no protótipo. */
export function BlocoIcone({ children, tamanho = 40 }: { children: ReactNode; tamanho?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[11px] border border-laranja/30 bg-laranja/12 text-laranja-claro"
      style={{ width: tamanho, height: tamanho }}
    >
      {children}
    </span>
  )
}

export function RankBadge({ tier, rr, pequeno = false }: { tier: number; rr?: number | null; pequeno?: boolean }) {
  const cor = corRank(tier)
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-mono whitespace-nowrap ${pequeno ? 'h-6 px-2 text-[10.5px]' : 'h-7 px-2.5 text-[11.5px]'}`}
      style={{ borderColor: rgba(cor, 0.35), background: rgba(cor, 0.1), color: '#f1ece6' }}
    >
      <svg width={pequeno ? 10 : 12} height={pequeno ? 10 : 12} viewBox="0 0 12 12" aria-hidden>
        <path d="M6 0.8 11 4.2 9.1 11.2H2.9L1 4.2Z" fill={cor} />
      </svg>
      {nomeRank(tier)}
      {rr != null && tier > 0 && <span className="text-mudo">{rr} RR</span>}
    </span>
  )
}

export function iniciais(nome: string) {
  const limpo = nome.replace(/[^\p{L}\p{N} ]/gu, '').trim()
  return (limpo.slice(0, 2) || '?').toUpperCase()
}

/** Avatar do Discord ou, sem ele, as iniciais num quadrado escuro com laranja. */
export function Avatar({ nome, url, tamanho = 38, destaque = false }: { nome: string; url?: string | null; tamanho?: number; destaque?: boolean }) {
  const r = Math.round(tamanho * 0.27)
  if (url) return <img src={url} alt="" width={tamanho} height={tamanho} className="shrink-0 object-cover" style={{ borderRadius: r }} />
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center font-extrabold"
      style={{
        width: tamanho, height: tamanho, borderRadius: r, fontSize: Math.max(10, tamanho * 0.34),
        background: destaque ? 'linear-gradient(135deg, #3a2318, #7a3418)' : 'linear-gradient(135deg, #1b1b1f, #2a1d17)',
        color: destaque ? '#ffd5bf' : '#d9cfc6',
        border: `1px solid ${destaque ? 'rgba(255,140,90,0.3)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {iniciais(nome)}
    </span>
  )
}

export function Segmentado<T extends string>({ opcoes, valor, onChange, rotulo, pequeno = false }: {
  opcoes: { valor: T; texto: ReactNode }[]; valor: T; onChange: (v: T) => void; rotulo: string; pequeno?: boolean
}) {
  return (
    <div role="group" aria-label={rotulo} className="inline-flex shrink-0 gap-1 rounded-xl border border-white/7 bg-white/[0.035] p-1">
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.valor)}
            className={`${pequeno ? 'h-8 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13px]'} cursor-pointer rounded-lg border font-semibold transition-colors ${ativo ? 'border-laranja/32 bg-laranja/14 text-pessego-claro' : 'border-transparent bg-transparent text-suave hover:text-texto'}`}
          >
            {o.texto}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({ aberto, onFechar, titulo, eyebrow, children, largura = 560, semFechar = false }: {
  aberto: boolean; onFechar: () => void; titulo: ReactNode; eyebrow?: string; children: ReactNode; largura?: number; semFechar?: boolean
}) {
  const id = useId()
  const caixa = useRef<HTMLDivElement>(null)
  // O onFechar muda a cada render de quem abre a janela; guardado aqui, o efeito
  // abaixo só corre ao abrir e fechar. Sem isto, cada tecla tirava o foco do campo.
  const fechar = useRef(onFechar)
  fechar.current = onFechar
  useEffect(() => {
    if (!aberto) return
    const antes = document.activeElement as HTMLElement | null
    caixa.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape' && !semFechar) fechar.current() }
    window.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      antes?.focus?.()
    }
  }, [aberto, semFechar])
  if (!aberto) return null
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[rgba(5,5,7,0.72)] p-4 backdrop-blur-[3px]" onMouseDown={(e) => { if (e.target === e.currentTarget && !semFechar) onFechar() }}>
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="painel entra relative my-6 flex w-full flex-col gap-4 !bg-[rgba(16,16,19,0.96)] p-6 outline-none"
        style={{ maxWidth: largura }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={id} className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.03em]">{titulo}</h2>
          </div>
          {!semFechar && (
            <button type="button" aria-label={l('Fechar', 'Close')} onClick={onFechar} className="-mt-1 -mr-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-[10px] text-mudo hover:bg-white/6 hover:text-texto">
              <X size={18} aria-hidden />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function BotaoAjuda({ topico, children, pequeno = false }: { topico: TopicoAjuda; children: ReactNode; pequeno?: boolean }) {
  const abrir = useAjuda()
  return (
    <button type="button" data-ajuda onClick={() => abrir(topico)} className={`btn btn-fantasma ${pequeno ? '!min-h-9 !px-3 !text-[13px]' : ''}`}>
      <CircleQuestionMark size={pequeno ? 15 : 16} className="text-laranja" aria-hidden />
      {children}
    </button>
  )
}

export function Vazio({ icone, titulo, texto, acao }: { icone: ReactNode; titulo: string; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <BlocoIcone tamanho={48}>{icone}</BlocoIcone>
      <p className="m-0 text-[15px] font-semibold">{titulo}</p>
      {texto && <p className="m-0 max-w-[420px] text-[13.5px] leading-normal text-mudo">{texto}</p>}
      {acao}
    </div>
  )
}

export function Esqueleto({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`esqueleto block ${className}`} style={style} />
}

/** Linhas a brilhar enquanto o ranking, as partidas ou os amigos carregam. */
export function LinhasEsqueleto({ tipo, n = 6 }: { tipo: 'ranking' | 'partidas' | 'amigos'; n?: number }) {
  return (
    <div role="status" aria-label={l('A carregar', 'Loading')} className="flex flex-col">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-t border-white/6 py-3" style={{ opacity: 1 - i * (0.7 / n) }}>
          {tipo === 'ranking' && <Esqueleto className="h-4 w-7" />}
          {tipo === 'partidas'
            ? <Esqueleto className="h-[50px] w-[78px] shrink-0 !rounded-[10px]" />
            : <Esqueleto className="size-9 shrink-0 !rounded-[10px]" />}
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Esqueleto className="h-3.5" style={{ width: `${46 + ((i * 17) % 30)}%` }} />
            <Esqueleto className="h-2.5" style={{ width: `${28 + ((i * 11) % 20)}%` }} />
          </span>
          {tipo !== 'amigos' && <Esqueleto className="hidden h-6 w-24 !rounded-full sm:block" />}
          <Esqueleto className="h-5 w-12" />
        </div>
      ))}
    </div>
  )
}

export function Carregando({ texto = l('A carregar…', 'Loading…') }: { texto?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-10 text-[13.5px] text-mudo">
      <LoaderCircle size={18} className="animate-spin text-laranja" aria-hidden />
      {texto}
    </div>
  )
}

export function LinkSeta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-semibold text-laranja-claro no-underline hover:text-pessego">
      {children}
      <ChevronRight size={15} aria-hidden />
    </Link>
  )
}

export function BarraProgresso({ valor, alvo, rotulo }: { valor: number; alvo: number; rotulo: string }) {
  const pct = Math.max(0, Math.min(100, (valor / Math.max(1, alvo)) * 100))
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuemin={0} aria-valuemax={alvo} aria-valuenow={valor} className="h-1.5 overflow-hidden rounded-full bg-white/7">
      <div className="h-full rounded-full bg-laranja transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** O ícone do agente; sem agente conhecido, um quadrado com a inicial. */
export function IconeAgente({ nome, tamanho = 24 }: { nome: string | null | undefined; tamanho?: number }) {
  const url = iconeAgente(nome)
  const estilo = { width: tamanho, height: tamanho }
  if (!url) {
    return nome
      ? <span aria-hidden style={estilo} className="inline-grid shrink-0 place-items-center rounded-[6px] border border-white/10 bg-white/5 font-mono text-[11px] text-suave">{nome[0]}</span>
      : null
  }
  return <img src={url} alt="" title={nome ?? undefined} loading="lazy" style={estilo} className="shrink-0 rounded-[6px] border border-white/10 bg-white/5 object-cover" />
}

/** MVP da partida: só uma estrela laranja dentro de um quadrado. */
/**
 * Botão para ações sem volta atrás: só confirma depois de o manteres premido
 * (rato, toque, Enter ou Espaço) até encher. Largar antes cancela.
 */
export function BotaoSegurar({ onConfirmar, rotulo, children, className = '', duracao = 900, aoLargarCedo }: {
  onConfirmar: () => void; rotulo: string; children: ReactNode; className?: string; duracao?: number; aoLargarCedo?: () => void
}) {
  const [aEncher, setAEncher] = useState(false)
  const temporizador = useRef<number | null>(null)
  useEffect(() => () => { if (temporizador.current) window.clearTimeout(temporizador.current) }, [])
  const comecar = () => {
    if (temporizador.current) return
    setAEncher(true)
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null
      setAEncher(false)
      onConfirmar()
    }, duracao)
  }
  const largar = () => {
    if (!temporizador.current) return
    window.clearTimeout(temporizador.current)
    temporizador.current = null
    setAEncher(false)
    aoLargarCedo?.()
  }
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onPointerDown={comecar}
      onPointerUp={largar}
      onPointerLeave={largar}
      onPointerCancel={largar}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); comecar() } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') largar() }}
      onBlur={largar}
      className={`relative overflow-hidden select-none ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 bg-derrota/40"
        style={{ height: aEncher ? '100%' : '0%', transition: aEncher ? `height ${duracao}ms linear` : 'height .2s ease-out' }}
      />
      <span className="relative inline-flex items-center justify-center">{children}</span>
    </button>
  )
}

export function SeloMvp({ tamanho = 22 }: { tamanho?: number }) {
  return (
    <span role="img" aria-label={l('MVP da partida', 'Match MVP')} title={l('MVP da partida', 'Match MVP')} className="inline-grid shrink-0 place-items-center rounded-[6px] border border-laranja/45 bg-laranja/14 text-laranja" style={{ width: tamanho, height: tamanho }}>
      <Star size={Math.round(tamanho * 0.55)} fill="currentColor" strokeWidth={1.5} aria-hidden />
    </span>
  )
}

export function Chip({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'laranja' | 'vitoria' | 'derrota' | 'ouro' }) {
  const tons = {
    neutro: 'border-white/10 bg-white/[0.035] text-[#d0cbc4]',
    laranja: 'border-laranja/32 bg-laranja/12 text-pessego',
    vitoria: 'border-vitoria/30 bg-vitoria/10 text-[#8ff3e8]',
    derrota: 'border-derrota/30 bg-derrota/10 text-[#ffb3bf]',
    ouro: 'border-ouro/35 bg-ouro/10 text-[#ffe3a3]',
  }
  return <span className={`chip border ${tons[tom]}`}>{children}</span>
}
