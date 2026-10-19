/**
 * As páginas públicas para a fonte "Navegador" do OBS:
 *   /overlay/:chave         o cartão (ou a barra) com o rank, o dia, o estado e a última partida
 *   /overlay/:chave/marca   a marca animada com o endereço do site (e o link de convite do jogador)
 *   /marca                  a mesma marca, sem dados de ninguém
 * Não pedem login: a chave secreta na ligação diz de quem são os dados (ver overlay_dados na base de dados).
 * O fundo é transparente. Aceitam, no endereço: estilo=cartao|barra, cor=laranja|azul|verde|rosa|roxo|ouro|branco ou
 * um hex de 6 dígitos, mostrar=rank,hoje,estado,ultima,fim, escala=50..200 (e, na marca, host=endereco).
 * O cartão mostra os pontos da fila em que a pessoa está a jogar (ou da última em que jogou); `fila=aberta|ranked`
 * prende-o a uma só, para quem quer um overlay por fila.
 */
import { ChevronsUp, Users } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { NomeRangify, Simbolo } from '@/components/Marca'
import { useAgora } from '@/hooks/useAgora'
import { VALORES_CONVITE } from '@/lib/convites'
import { aoMudarDados, dados, type EstadoPartida, type FilaTipo, type OverlayDados } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { imagemMapa } from '@/lib/mapas'
import { corRank, nomeRank } from '@/lib/ranks'
import { acertarRelogio, agoraCerto, relogio } from '@/lib/tempo'

const CORES: Record<string, string> = { laranja: '#ff5b1f', azul: '#3b9eff', verde: '#3ddc97', rosa: '#ff5c9d', roxo: '#9146ff', ouro: '#f2c14e', branco: '#f3f0eb' }
const VITORIA = '#5fe3d6'
const DERROTA = '#ff7d8f'
const MUDO = '#8a857e'

export interface OpcoesOverlay { estilo: 'cartao' | 'barra'; cor: string; mostrar: Set<string>; escala: number; fila: FilaTipo | null }

/** As opções vêm do endereço; o que não se percebe fica no padrão. */
export function lerOpcoes(q: URLSearchParams): OpcoesOverlay {
  const bruta = (q.get('cor') ?? 'laranja').toLowerCase()
  const cor = CORES[bruta] ?? (/^[0-9a-f]{6}$/.test(bruta) ? `#${bruta}` : CORES.laranja)
  const todos = ['rank', 'hoje', 'estado', 'ultima', 'fim']
  const pedidos = (q.get('mostrar') ?? '').split(',').map((x) => x.trim()).filter((x) => todos.includes(x))
  const escala = Math.min(200, Math.max(50, Number(q.get('escala')) || 100))
  const fila = q.get('fila') === 'ranked' ? 'ranked' : q.get('fila') === 'aberta' ? 'aberta' : null
  return { estilo: q.get('estilo') === 'barra' ? 'barra' : 'cartao', cor, mostrar: new Set(pedidos.length ? pedidos : todos), escala, fila }
}

/** O fundo do OBS transparente enquanto uma destas páginas está aberta. */
function useFundoTransparente(ativo = true) {
  useEffect(() => {
    if (!ativo) return
    document.documentElement.classList.add('overlay-obs')
    return () => document.documentElement.classList.remove('overlay-obs')
  }, [ativo])
}

/**
 * Os dados do overlay, de 3 em 3 segundos (e logo que algo muda no demo). Guarda os últimos se um pedido falhar.
 * Cada resposta traz a hora do servidor: o overlay acerta o relógio por ela, senão com o relógio do computador uns
 * segundos atrasado os tempos da fila e da partida ficavam em 00:00 até ele "apanhar" o servidor.
 */
function useOverlayDados(chave: string | undefined, fila: FilaTipo | null = null) {
  const [valor, setValor] = useState<OverlayDados | null>(null)
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    if (!chave) { setPronto(true); return }
    let vivo = true
    const carregar = () => dados.overlayDados(chave, fila ?? undefined)
      .then((r) => { if (vivo) { if (r) acertarRelogio(r.agora); setValor(r); setPronto(true) } })
      .catch(() => { if (vivo) setPronto(true) })
    carregar()
    const t = window.setInterval(carregar, 3000)
    const parar = aoMudarDados(() => carregar())
    return () => { vivo = false; window.clearInterval(t); parar() }
  }, [chave, fila])
  return { valor, pronto }
}

type Ultima = NonNullable<OverlayDados['ultima']>
const DURACAO_AVISO = 9000

/**
 * Quando acaba uma partida (a última muda depois do primeiro carregamento), o aviso de vitória ou derrota aparece
 * 9 segundos. A última partida que já lá estava quando o overlay abriu não conta: só as que acabam com ele aberto.
 */
function useFimDePartida(d: OverlayDados | null, ativo: boolean) {
  const visto = useRef<string | null | undefined>(undefined)
  const [aviso, setAviso] = useState<Ultima | null>(null)
  const carregado = d !== null
  const ultima = d?.ultima ?? null
  const codigo = ultima?.codigo ?? null
  useEffect(() => {
    if (!carregado) return
    if (visto.current === undefined) { visto.current = codigo; return }
    if (codigo === visto.current) return
    visto.current = codigo
    if (!ativo || !ultima) return
    setAviso(ultima)
    const t = window.setTimeout(() => setAviso(null), DURACAO_AVISO)
    return () => window.clearTimeout(t)
  }, [carregado, codigo, ultima, ativo])
  return aviso
}

const FASES: Record<string, [string, string]> = {
  READY_CHECK: ['PARTIDA ENCONTRADA', 'MATCH FOUND'],
  DRAFT_PHASE: ['DRAFT', 'DRAFT'],
  MAP_BAN: ['BANS DE MAPA', 'MAP BANS'],
  LOBBY_CREATION: ['A CRIAR O GRUPO', 'CREATING THE PARTY'],
  IN_PROGRESS: ['EM JOGO', 'IN GAME'],
  RESULT_SUBMISSION: ['RESULTADO', 'RESULT'],
  PROCESSING_API: ['A CONFIRMAR', 'CONFIRMING'],
  DISPUTE: ['RESULTADO', 'RESULT'],
}
/** O nome da fila nos rótulos do overlay. */
const nomeFilaOv = (f: FilaTipo | undefined) => (f === 'ranked' ? 'RANKED' : l('ABERTA', 'OPEN'))
const nomeFase = (e: EstadoPartida) => { const f = FASES[e] ?? ['EM PARTIDA', 'IN MATCH']; return l(f[0], f[1]) }

/** O que o estado do jogador diz, já com os tempos a contar. */
function useEstado(d: OverlayDados) {
  useAgora(1000) // só para desenhar outra vez a cada segundo; a hora lê-se já abaixo, ao desenhar, para acompanhar o acerto do relógio
  const agora = agoraCerto()
  const desde = (iso: string | null | undefined) => (iso ? Math.max(0, (agora - Date.parse(iso)) / 1000) : 0)
  if (d.estado === 'partida' && d.partida) {
    const emJogo = d.partida.estado === 'IN_PROGRESS' && !!d.partida.comecouEm
    return { tipo: 'partida' as const, rotulo: `${nomeFase(d.partida.estado)} · ${nomeFilaOv(d.partida.fila ?? d.filaTipo)}`, mapa: d.partida.mapa, tempo: emJogo ? relogio(desde(d.partida.comecouEm)) : null, contagem: 0 }
  }
  if (d.estado === 'fila' && d.fila) {
    return { tipo: 'fila' as const, rotulo: `${l('NA FILA', 'IN QUEUE')} · ${nomeFilaOv(d.filaTipo)}`, mapa: null, tempo: relogio(desde(d.fila.desde)), contagem: Math.min(10, d.fila.contagem) }
  }
  return { tipo: 'livre' as const, rotulo: l('LIVRE', 'IDLE'), mapa: null, tempo: null, contagem: 0 }
}

// ------------------------------------------------------------ peças

/** O emblema do rank: o escudo na cor do rank, com a divisão lá dentro. */
function Emblema({ tier, tamanho = 50 }: { tier: number; tamanho?: number }) {
  const cor = corRank(tier)
  const divisao = /(\d)$/.exec(nomeRank(tier))?.[1] ?? (tier >= 27 ? '★' : '–')
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 50 50" aria-hidden style={{ flexShrink: 0, filter: `drop-shadow(0 0 9px ${cor}80)` }}>
      <polygon points="25,2 45,16 37.5,46 12.5,46 5,16" fill={`${cor}29`} stroke={cor} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="25,10 38,19.5 33,40 17,40 12,19.5" fill={cor} />
      <text x="25" y="33" textAnchor="middle" fontFamily="'JetBrains Mono Variable','JetBrains Mono',monospace" fontWeight="700" fontSize="17" fill="#0b0712">{divisao}</text>
    </svg>
  )
}

/** A barra de RR (0 a 100) na cor do rank, com um traço a cada 25. */
function BarraRr({ tier, rr, altura = 7 }: { tier: number; rr: number | null; altura?: number }) {
  const cor = corRank(tier)
  const pct = Math.max(0, Math.min(100, rr ?? 0))
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="relative block flex-1 overflow-hidden rounded-full" style={{ height: altura, background: 'rgba(255,255,255,0.09)' }}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 68%, black), color-mix(in srgb, ${cor} 68%, white))`, boxShadow: `0 0 10px ${cor}99` }} />
        {[25, 50, 75].map((p) => <span key={p} aria-hidden className="absolute top-0 bottom-0 w-px" style={{ left: `${p}%`, background: 'rgba(10,10,13,0.7)' }} />)}
      </span>
      <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: '#a8a29a' }}>{rr != null ? rr : 0} RR</span>
    </span>
  )
}

/** Quadradinhos do dia: vitórias, derrotas e os que faltam (até 6). */
function Pips({ v, d }: { v: number; d: number }) {
  const n = 6
  const total = v + d
  let vs = v
  let ds = d
  if (total > n) {
    vs = Math.round((v / total) * n)
    if (v > 0 && vs === 0) vs = 1
    if (d > 0 && vs === n) vs = n - 1
    ds = n - vs
  }
  const lista = [...Array(vs).fill(VITORIA), ...Array(ds).fill(DERROTA), ...Array(Math.max(0, n - vs - ds)).fill('')]
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {lista.map((c, i) => <span key={i} className="size-[11px] rounded-[3px]" style={{ background: c || 'rgba(255,255,255,0.1)', boxShadow: c ? `0 0 8px ${c}8c` : undefined }} />)}
    </span>
  )
}

/** Em que fila contam os pontos e em que lugar da tabela dela estás: cheia na ranked, só o contorno na aberta. */
function PilulaFila({ d }: { d: OverlayDados }) {
  const ranked = d.filaTipo === 'ranked'
  const lugar = d.posicao ? ` · #${d.posicao}` : ''
  return (
    <span
      className="inline-flex h-5 items-center gap-[5px] rounded-md px-2 font-mono text-[10px] font-bold tracking-[0.1em] whitespace-nowrap"
      style={ranked ? { background: 'var(--ov)', color: '#170802' } : { border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#d0cbc4' }}
    >
      {ranked ? <ChevronsUp size={11} strokeWidth={3} aria-hidden /> : <Users size={11} strokeWidth={2.6} aria-hidden />}
      {nomeFilaOv(d.filaTipo)}{lugar}
    </span>
  )
}

function Hoje({ d, compacto = false }: { d: OverlayDados; compacto?: boolean }) {
  const h = d.hoje
  const cor = h.delta >= 0 ? VITORIA : DERROTA
  const texto = `${h.vitorias}${l('V', 'W')} ${h.derrotas}${l('D', 'L')}`
  const delta = <span className="font-mono text-[19px] font-bold tracking-[-0.03em]" style={{ color: cor }}>{h.delta > 0 ? '+' : ''}{h.delta}</span>
  if (compacto) {
    return (
      <span className="flex flex-col justify-center gap-2">
        <span className="flex items-center gap-2.5"><span className="font-mono text-[10px] font-bold tracking-[0.16em]" style={{ color: MUDO }}>{l('HOJE', 'TODAY')}</span><Pips v={h.vitorias} d={h.derrotas} /></span>
        <span className="flex items-baseline gap-2.5"><span className="font-mono text-[12px]" style={{ color: '#b4afa8' }}>{texto}</span>{delta}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2.5 border-t border-white/7 pt-3.5">
      <span className="font-mono text-[10px] font-bold tracking-[0.16em]" style={{ color: MUDO }}>{l('HOJE', 'TODAY')}</span>
      <Pips v={h.vitorias} d={h.derrotas} />
      <span className="font-mono text-[12px]" style={{ color: '#b4afa8' }}>{texto}</span>
      <span className="ml-auto">{delta}</span>
    </span>
  )
}

/** Dez segmentos: quantos já estão na fila. */
function SegmentosFila({ n, largura }: { n: number; largura?: number }) {
  return (
    <span className="flex gap-[3px]" style={{ width: largura }} aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-[5px] flex-1 rounded-[3px]" style={i < n ? { background: 'var(--ov)', boxShadow: '0 0 8px color-mix(in srgb, var(--ov) 55%, transparent)' } : { background: 'rgba(255,255,255,0.1)' }} />
      ))}
    </span>
  )
}

function Ponto({ cor, pisca }: { cor: string; pisca: boolean }) {
  return <span className="size-2 rounded-full" style={{ background: cor, animation: pisca ? 'rg-ov-pulsa 1.4s ease-in-out infinite' : undefined }} />
}

/** A caixa do estado no cartão: livre, na fila ou em partida (com a arte do mapa por trás). */
function EstadoCartao({ d }: { d: OverlayDados }) {
  const e = useEstado(d)
  const mapa = e.mapa ? imagemMapa(e.mapa) : undefined
  const base = 'relative flex h-[54px] items-center justify-between gap-2.5 overflow-hidden rounded-[13px] border px-3.5'
  if (e.tipo === 'livre') {
    return (
      <span className={base} style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.32)' }}>
        <span className="inline-flex items-center gap-2.5 font-mono text-[12px] font-bold tracking-[0.12em]" style={{ color: MUDO }}><Ponto cor="#5b5750" pisca={false} />{e.rotulo}</span>
        <span className="text-[12px]" style={{ color: '#6f6a64' }}>{l('pronto para jogar', 'ready to play')}</span>
      </span>
    )
  }
  if (e.tipo === 'fila') {
    return (
      <span className="relative flex h-[54px] flex-col justify-center gap-2 overflow-hidden rounded-[13px] border px-3.5" style={{ borderColor: 'color-mix(in srgb, var(--ov) 35%, transparent)', background: 'rgba(0,0,0,0.32)' }}>
        <span className="flex items-center justify-between gap-2.5">
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] font-bold tracking-[0.12em]" style={{ color: 'var(--ov)' }}><Ponto cor="var(--ov)" pisca />{e.rotulo}</span>
          <span className="font-mono text-[12px]" style={{ color: '#d8d3cc' }}>{e.contagem}/10<span style={{ color: '#6f6a64' }}> · {e.tempo}</span></span>
        </span>
        <SegmentosFila n={e.contagem} />
      </span>
    )
  }
  return (
    <span className={base} style={{ borderColor: 'color-mix(in srgb, var(--ov) 35%, transparent)', background: '#0a0a0d' }}>
      {mapa && <img src={mapa} alt="" className="absolute top-0 left-0 size-full object-cover" style={{ opacity: 0.55 }} />}
      <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,10,13,0.92) 8%, rgba(10,10,13,0.35) 100%)' }} />
      <span className="relative flex flex-col gap-0.5">
        <span className="inline-flex items-center gap-2 font-mono text-[10.5px] font-bold tracking-[0.14em]" style={{ color: 'var(--ov)' }}><Ponto cor="var(--ov)" pisca />{e.rotulo}</span>
        {e.mapa && <span className="text-[18px] leading-none font-extrabold tracking-[0.04em]">{e.mapa.toUpperCase()}</span>}
      </span>
      {e.tempo && <span className="relative font-mono text-[24px] font-bold tracking-[-0.04em]">{e.tempo}</span>}
    </span>
  )
}

/** O estado na barra: um bloco à direita, com a mesma informação. */
function EstadoBarra({ d }: { d: OverlayDados }) {
  const e = useEstado(d)
  const mapa = e.mapa ? imagemMapa(e.mapa) : undefined
  const cor = e.tipo === 'livre' ? MUDO : 'var(--ov)'
  return (
    <span className="relative flex min-w-[290px] items-center overflow-hidden px-6" style={{ background: e.tipo === 'fila' ? 'color-mix(in srgb, var(--ov) 8%, transparent)' : undefined }}>
      {e.tipo === 'partida' && mapa && <img src={mapa} alt="" className="absolute top-0 left-0 size-full object-cover" style={{ opacity: 0.5 }} />}
      {e.tipo === 'partida' && <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(10,10,13,0.9) 5%, rgba(10,10,13,0.3) 100%)' }} />}
      <span className="relative flex w-full items-center justify-between gap-5">
        <span className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-2.5 font-mono text-[12px] font-bold tracking-[0.12em] whitespace-nowrap" style={{ color: cor }}><Ponto cor={e.tipo === 'livre' ? '#5b5750' : 'var(--ov)'} pisca={e.tipo !== 'livre'} />{e.tipo === 'fila' ? `${e.rotulo} ${e.contagem}/10` : e.rotulo}</span>
          {e.tipo === 'fila' && <SegmentosFila n={e.contagem} largura={150} />}
          {e.tipo === 'partida' && e.mapa && <span className="text-[17px] leading-none font-extrabold tracking-[0.04em]">{e.mapa.toUpperCase()}</span>}
          {e.tipo === 'livre' && <span className="text-[12px]" style={{ color: '#6f6a64' }}>{l('pronto para jogar', 'ready to play')}</span>}
        </span>
        {e.tempo && <span className="font-mono text-[22px] font-bold tracking-[-0.04em]">{e.tempo}</span>}
      </span>
    </span>
  )
}

function Ultima({ d }: { d: OverlayDados }) {
  const u = d.ultima
  if (!u) return <span className="font-mono text-[11.5px]" style={{ color: MUDO }}>{l('Ainda sem partidas', 'No matches yet')}</span>
  const cor = u.venceu ? VITORIA : DERROTA
  return (
    <span className="flex items-center gap-2.5 font-mono text-[11.5px] whitespace-nowrap">
      <span className="text-[10px] font-bold tracking-[0.16em]" style={{ color: MUDO }}>{l('ÚLTIMA', 'LAST')}</span>
      <span className="rounded-[5px] px-[7px] py-0.5 text-[10.5px] font-bold tracking-[0.06em]" style={{ background: `${cor}24`, color: cor }}>{u.venceu ? l('VITÓRIA', 'WIN') : l('DERROTA', 'LOSS')}</span>
      {u.rondasFeitas != null && u.rondasSofridas != null && <span>{u.rondasFeitas}–{u.rondasSofridas}</span>}
      {u.mapa && <span style={{ color: MUDO }}>{u.mapa}</span>}
      {u.delta != null && <span className="ml-auto font-bold" style={{ color: cor }}>{u.delta > 0 ? '+' : ''}{u.delta}</span>}
    </span>
  )
}

/** O aviso de fim de partida: uma faixa de vitória ou derrota por cima do cartão, durante 9 segundos. */
function AvisoFim({ u }: { u: Ultima }) {
  const fundo = u.venceu ? 'linear-gradient(95deg, #1d8f86, #5fe3d6)' : 'linear-gradient(95deg, #c2415a, #ff7d8f)'
  return (
    <span key={u.codigo} className="relative flex h-[58px] items-center justify-between gap-2.5 overflow-hidden rounded-2xl px-[18px]" style={{ background: fundo, color: u.venceu ? '#04211f' : '#2a0610', animation: `rg-ov-banner ${DURACAO_AVISO}ms ease-in-out both` }}>
      <span aria-hidden className="absolute top-0 bottom-0 w-[70px]" style={{ background: 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.55), rgba(255,255,255,0))', animation: 'rg-ov-varre 2.2s ease-in-out infinite' }} />
      <span className="relative flex flex-col gap-px">
        <span className="text-[25px] leading-none font-extrabold tracking-[0.08em]">{u.venceu ? l('VITÓRIA', 'VICTORY') : l('DERROTA', 'DEFEAT')}</span>
        <span className="font-mono text-[11px] font-bold tracking-[0.1em]">{u.rondasFeitas != null && u.rondasSofridas != null ? `${u.rondasFeitas}–${u.rondasSofridas}` : ''}{u.mapa ? ` · ${u.mapa.toUpperCase()}` : ''} · {nomeFilaOv(u.fila)}</span>
      </span>
      {u.delta != null && <span className="relative font-mono text-[24px] font-bold tracking-[-0.03em]">{u.delta > 0 ? '+' : ''}{u.delta}<span className="ml-1 text-[11px]">PTS</span></span>}
    </span>
  )
}

const VIDRO: CSSProperties = { background: 'linear-gradient(180deg, rgba(23,23,28,0.95), rgba(10,10,13,0.95))', boxShadow: '0 18px 46px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)' }
/** Espaço por cima para o aviso de fim de partida (58 px de faixa e 8 de folga). */
const ESPACO_AVISO = 66

/** Os cantos em L da cor de destaque, por fora do cartão. */
function Cantos() {
  return (
    <>
      <span aria-hidden className="absolute -top-[7px] -left-[7px] size-4" style={{ borderTop: '2px solid var(--ov)', borderLeft: '2px solid var(--ov)' }} />
      <span aria-hidden className="absolute -right-[7px] -bottom-[7px] size-4" style={{ borderBottom: '2px solid var(--ov)', borderRight: '2px solid var(--ov)' }} />
    </>
  )
}

/** O cartão e a barra do overlay: o rank, o dia, o estado e a última partida. */
export function Overlay() {
  const { chave } = useParams()
  const [q] = useSearchParams()
  const o = lerOpcoes(q)
  const { valor: d, pronto } = useOverlayDados(chave, o.fila)
  const aviso = useFimDePartida(d, o.mostrar.has('fim'))
  useFundoTransparente()
  if (!d) {
    // Chave errada ou área fechada: fica transparente (só com ?debug=1 diz porquê, para as pessoas acertarem a ligação).
    return pronto && q.get('debug') === '1' ? <p className="m-3 font-mono text-[12px] text-derrota">{l('Overlay sem dados: a ligação está errada ou a área ainda está fechada.', 'Overlay has no data: the link is wrong or the area is still closed.')}</p> : null
  }
  const reserva = o.mostrar.has('fim') ? ESPACO_AVISO : 0
  const estilo = { '--ov': o.cor, transform: `scale(${o.escala / 100})`, transformOrigin: 'top left', paddingTop: 8 + reserva } as CSSProperties
  const pontos = (
    <span className="flex flex-col items-end gap-[7px]">
      <span className="flex items-baseline gap-[5px] font-mono"><span className="text-[25px] leading-none font-bold tracking-[-0.05em]">{d.pontos}</span><span className="text-[10px] tracking-[0.1em]" style={{ color: MUDO }}>PTS</span></span>
      <PilulaFila d={d} />
    </span>
  )
  const nomeRankTexto = (
    <span className="font-mono text-[14px] font-bold tracking-[0.12em] whitespace-nowrap" style={{ color: `color-mix(in srgb, ${corRank(d.tier)} 55%, white)` }}>{nomeRank(d.tier).toUpperCase()}</span>
  )

  if (o.estilo === 'barra') {
    return (
      <div style={estilo} className="relative inline-block px-2 pb-2 text-texto">
        {aviso && <span className="absolute right-2 left-2 block" style={{ top: 8 }}><AvisoFim u={aviso} /></span>}
        <span className="relative flex h-[84px] items-stretch overflow-hidden rounded-[20px] border" style={{ ...VIDRO, borderColor: 'color-mix(in srgb, var(--ov) 35%, transparent)', animation: 'rg-ov-entra .4s ease both' }}>
          <span className="flex items-center gap-[13px] pr-6">
            <span className="grid w-[84px] place-items-center self-stretch" style={{ background: 'var(--ov)', color: '#170802' }}><Simbolo tamanho={40} /></span>
            <span className="flex flex-col gap-[3px]"><span className="text-[23px] leading-none font-extrabold tracking-[-0.03em]">{d.nome}</span><span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: MUDO }}>RANGIFY HUB</span></span>
          </span>
          {o.mostrar.has('rank') && (
            <>
              <span aria-hidden className="w-px bg-white/8" />
              <span className="flex items-center gap-[13px] px-6">
                <Emblema tier={d.tier} tamanho={42} />
                <span className="flex w-[150px] flex-col gap-[7px]">{nomeRankTexto}{d.tier > 0 ? <BarraRr tier={d.tier} rr={d.rr} altura={6} /> : null}</span>
                <span className="ml-1">{pontos}</span>
              </span>
            </>
          )}
          {o.mostrar.has('hoje') && (<><span aria-hidden className="w-px bg-white/8" /><span className="flex px-6"><Hoje d={d} compacto /></span></>)}
          {o.mostrar.has('estado') && (<><span aria-hidden className="w-px bg-white/8" /><EstadoBarra d={d} /></>)}
        </span>
      </div>
    )
  }

  return (
    <div style={estilo} className="relative inline-block px-2 pb-2 text-texto">
      <div className="relative w-[340px]">
        {aviso && <span className="absolute left-0 block w-full" style={{ top: -ESPACO_AVISO }}><AvisoFim u={aviso} /></span>}
        <Cantos />
        <span className="relative flex w-[340px] flex-col gap-[15px] overflow-hidden rounded-[18px] border px-[18px] pt-[18px] pb-4" style={{ ...VIDRO, borderColor: 'color-mix(in srgb, var(--ov) 35%, transparent)', animation: 'rg-ov-entra .4s ease both' }}>
          <span aria-hidden className="absolute top-0 right-0 left-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--ov), rgba(255,255,255,0) 68%)' }} />
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5 self-center"><span style={{ color: 'var(--ov)' }} className="inline-flex shrink-0"><Simbolo tamanho={31} /></span><span className="truncate text-[21px] leading-none font-extrabold tracking-[-0.03em]">{d.nome}</span></span>
            {o.mostrar.has('rank') && pontos}
          </span>
          {o.mostrar.has('rank') && (
            <span className="flex items-center gap-[13px]">
              <Emblema tier={d.tier} />
              <span className="flex min-w-0 flex-1 flex-col gap-[7px]">{nomeRankTexto}{d.tier > 0 ? <BarraRr tier={d.tier} rr={d.rr} /> : null}</span>
            </span>
          )}
          {o.mostrar.has('hoje') && <Hoje d={d} />}
          {o.mostrar.has('estado') && <EstadoCartao d={d} />}
          {o.mostrar.has('ultima') && <Ultima d={d} />}
        </span>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ marca animada

/** O endereço sem "https://" nem barras no fim: é o que se lê no ecrã. */
const semProtocolo = (t: string) => t.replace(/^https?:\/\//, '').replace(/\/+$/, '')

interface Slide { rotulo: string; corpo: ReactNode }

/**
 * A marca animada para um cantinho da live. Três mensagens que se trocam de 2,4 em 2,4 segundos (o ciclo todo
 * dura 7,2 s): a marca, o endereço do site e um convite.
 * Com o código do convite mostra o link inteiro (o endereço grande e o "/?convite=…" por baixo, nunca numa linha só
 * demasiado comprida) e o bónus que o convidado recebe. Com ?fundo=1 leva um fundo sólido.
 */
export function OverlayMarca() {
  const { chave } = useParams()
  const [q] = useSearchParams()
  const o = lerOpcoes(q)
  const { valor: d } = useOverlayDados(chave)
  useFundoTransparente()
  const host = semProtocolo(q.get('host') ?? window.location.host)
  const convite = d?.codigoConvite ?? q.get('convite')
  // Letra do endereço: a maior que cabe nos 300 px do ecrã da mensagem (a mono da casa mede 0,6 do tamanho por letra).
  const tamanhoHost = Math.max(12, Math.min(25, Math.floor(300 / (host.length * 0.6))))
  const slides: Slide[] = [
    { rotulo: l('JOGA RANKED NO', 'PLAY RANKED ON'), corpo: <NomeRangify className="text-[42px] leading-none tracking-[-0.04em]" /> },
    {
      rotulo: l('ENTRA JÁ', 'JOIN NOW'),
      corpo: (
        <span className="flex flex-col gap-1.5">
          <span className="font-mono font-bold whitespace-nowrap" style={{ fontSize: tamanhoHost, lineHeight: 1, color: 'var(--ov)' }}>{host}</span>
          {convite && <span className="font-mono text-[15px] font-semibold whitespace-nowrap">/?convite=<span style={{ color: 'var(--ov)' }}>{convite}</span></span>}
        </span>
      ),
    },
    convite
      ? { rotulo: l('BÓNUS DE CONVITE', 'INVITE BONUS'), corpo: <span className="font-mono text-[34px] leading-none font-bold tracking-[-0.04em]">+{VALORES_CONVITE.convidado}<span className="ml-2 text-[15px] tracking-[0.08em]" style={{ color: 'var(--ov)' }}>COINS</span></span> }
      : { rotulo: l('5V5 COM CAPITÃES', '5V5 WITH CAPTAINS'), corpo: <span className="text-[24px] leading-[1.1] font-extrabold tracking-[-0.02em]">{l('Draft, bans e tabela', 'Draft, bans and ranking')}</span> },
  ]
  const estilo = { '--ov': o.cor, transform: `scale(${o.escala / 100})`, transformOrigin: 'top left', background: q.get('fundo') === '1' ? '#09090b' : undefined } as CSSProperties
  return (
    <div style={estilo} className="inline-block p-2 text-texto">
      <div data-marca className="relative flex h-[116px] w-[440px] items-center gap-[18px] overflow-hidden rounded-[24px] border px-[22px]" style={{ background: VIDRO.background, boxShadow: VIDRO.boxShadow, borderColor: 'color-mix(in srgb, var(--ov) 45%, transparent)' }}>
        <span aria-hidden className="absolute top-0 right-0 left-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--ov), rgba(255,255,255,0) 70%)' }} />
        <span aria-hidden className="rg-ov-anim rg-ov-brilho pointer-events-none absolute top-0 bottom-0 w-[90px]" style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0), color-mix(in srgb, var(--ov) 26%, transparent) 45%, rgba(255,255,255,0.1) 52%, rgba(255,255,255,0))', animation: 'rg-ov-c-varre 2.4s ease-in-out infinite' }} />
        <span className="rg-ov-anim relative grid size-[72px] shrink-0 place-items-center rounded-[20px]" style={{ background: 'var(--ov)', color: '#170802', animation: 'rg-ov-c-tile 7.2s ease-in-out infinite', boxShadow: '0 0 26px color-mix(in srgb, var(--ov) 45%, transparent)' }}>
          <Simbolo tamanho={44} />
        </span>
        <span className="relative h-[78px] min-w-0 flex-1">
          {slides.map((s, i) => (
            <span key={i} className="rg-ov-troca absolute top-0 left-0 flex h-[70px] w-full flex-col justify-center gap-[7px]" style={{ opacity: i === 0 ? 1 : 0, animation: 'rg-ov-c-slide 7.2s ease-in-out both infinite', animationDelay: `${i * 2.4 - 7.2}s` }}>
              <span className="font-mono text-[10.5px] font-bold tracking-[0.24em] whitespace-nowrap" style={{ color: MUDO }}>{s.rotulo}</span>
              {s.corpo}
            </span>
          ))}
          <span aria-hidden className="absolute bottom-0 left-0 flex w-full gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <span className="absolute inset-0 origin-left rounded-full" style={{ background: 'var(--ov)', transform: 'scaleX(0)', animation: 'rg-ov-c-prog 7.2s linear both infinite', animationDelay: `${i * 2.4 - 7.2}s` }} />
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  )
}
