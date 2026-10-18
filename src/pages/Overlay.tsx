/**
 * As páginas públicas para a fonte "Navegador" do OBS:
 *   /overlay/:chave         o cartão com o rank, o dia, o estado e a última partida
 *   /overlay/:chave/marca   a marca animada com o endereço do site (e o link de convite do jogador)
 *   /marca                  a mesma marca, sem dados de ninguém
 * Não pedem login: a chave secreta na ligação diz de quem são os dados (ver overlay_dados na base de dados).
 * O fundo é transparente. Aceitam, no endereço: estilo=cartao|barra, cor=laranja|azul|verde|rosa|roxo|ouro|branco ou
 * um hex de 6 dígitos, mostrar=rank,hoje,estado,ultima, escala=50..200 (e, na marca, host=endereco).
 */
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { NomeRangify, Simbolo } from '@/components/Marca'
import { RankBadge } from '@/components/ui'
import { useAgora } from '@/hooks/useAgora'
import { aoMudarDados, dados, type EstadoPartida, type OverlayDados } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { relogio } from '@/lib/tempo'

const CORES: Record<string, string> = { laranja: '#ff5b1f', azul: '#3b9eff', verde: '#3ddc97', rosa: '#ff5c9d', roxo: '#9146ff', ouro: '#f2c14e', branco: '#f3f0eb' }

export interface OpcoesOverlay { estilo: 'cartao' | 'barra'; cor: string; mostrar: Set<string>; escala: number }

/** As opções vêm do endereço; o que não se percebe fica no padrão. */
export function lerOpcoes(q: URLSearchParams): OpcoesOverlay {
  const bruta = (q.get('cor') ?? 'laranja').toLowerCase()
  const cor = CORES[bruta] ?? (/^[0-9a-f]{6}$/.test(bruta) ? `#${bruta}` : CORES.laranja)
  const todos = ['rank', 'hoje', 'estado', 'ultima']
  const pedidos = (q.get('mostrar') ?? '').split(',').map((x) => x.trim()).filter((x) => todos.includes(x))
  const escala = Math.min(200, Math.max(50, Number(q.get('escala')) || 100))
  return { estilo: q.get('estilo') === 'barra' ? 'barra' : 'cartao', cor, mostrar: new Set(pedidos.length ? pedidos : todos), escala }
}

/** O fundo do OBS transparente enquanto uma destas páginas está aberta. */
function useFundoTransparente(ativo = true) {
  useEffect(() => {
    if (!ativo) return
    document.documentElement.classList.add('overlay-obs')
    return () => document.documentElement.classList.remove('overlay-obs')
  }, [ativo])
}

/** Os dados do overlay, de 5 em 5 segundos (e logo que algo muda no demo). Guarda os últimos se um pedido falhar. */
function useOverlayDados(chave: string | undefined) {
  const [valor, setValor] = useState<OverlayDados | null>(null)
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    if (!chave) { setPronto(true); return }
    let vivo = true
    const carregar = () => dados.overlayDados(chave)
      .then((r) => { if (vivo) { setValor(r); setPronto(true) } })
      .catch(() => { if (vivo) setPronto(true) })
    carregar()
    const t = window.setInterval(carregar, 5000)
    const parar = aoMudarDados(() => carregar())
    return () => { vivo = false; window.clearInterval(t); parar() }
  }, [chave])
  return { valor, pronto }
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
const nomeFase = (e: EstadoPartida) => { const f = FASES[e] ?? ['EM PARTIDA', 'IN MATCH']; return l(f[0], f[1]) }

function Estado({ d, cor }: { d: OverlayDados; cor: string }) {
  const agora = useAgora(1000)
  const desde = (iso: string | null | undefined) => (iso ? Math.max(0, (agora - Date.parse(iso)) / 1000) : 0)
  let texto: string
  let vivo = false
  if (d.estado === 'partida' && d.partida) {
    const emJogo = d.partida.estado === 'IN_PROGRESS' && d.partida.comecouEm
    texto = `${nomeFase(d.partida.estado)}${d.partida.mapa ? ` · ${d.partida.mapa.toUpperCase()}` : ''}${emJogo ? ` · ${relogio(desde(d.partida.comecouEm))}` : ''}`
    vivo = true
  } else if (d.estado === 'fila' && d.fila) {
    texto = `${l('NA FILA', 'IN QUEUE')} · ${Math.min(10, d.fila.contagem)}/10 · ${relogio(desde(d.fila.desde))}`
    vivo = true
  } else {
    texto = l('LIVRE', 'IDLE')
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[12px] font-bold tracking-[0.1em] whitespace-nowrap" style={{ color: vivo ? cor : '#8a857e' }}>
      <span className="size-2 rounded-full" style={{ background: vivo ? cor : '#5b5750', animation: vivo ? 'rg-ov-pulsa 1.6s ease-in-out infinite' : undefined }} aria-hidden />
      {texto}
    </span>
  )
}

function Hoje({ d }: { d: OverlayDados }) {
  const h = d.hoje
  return (
    <span className="inline-flex items-baseline gap-2 font-mono whitespace-nowrap">
      <span className="text-[10.5px] font-bold tracking-[0.14em] text-[#8a857e]">{l('HOJE', 'TODAY')}</span>
      <span className="text-[15px] font-bold text-vitoria">{h.vitorias}<span className="text-[11px]">{l('V', 'W')}</span></span>
      <span className="text-[15px] font-bold text-derrota">{h.derrotas}<span className="text-[11px]">{l('D', 'L')}</span></span>
      <span className={`text-[15px] font-bold ${h.delta >= 0 ? 'text-vitoria' : 'text-derrota'}`}>{h.delta > 0 ? '+' : ''}{h.delta}</span>
    </span>
  )
}

function Ultima({ d }: { d: OverlayDados }) {
  const u = d.ultima
  if (!u) return <span className="font-mono text-[11.5px] text-[#8a857e]">{l('Ainda sem partidas', 'No matches yet')}</span>
  return (
    <span className="inline-flex items-baseline gap-2 font-mono text-[12px] whitespace-nowrap">
      <span className="text-[10.5px] font-bold tracking-[0.14em] text-[#8a857e]">{l('ÚLTIMA', 'LAST')}</span>
      <span className={`font-bold ${u.venceu ? 'text-vitoria' : 'text-derrota'}`}>{u.venceu ? l('VITÓRIA', 'WIN') : l('DERROTA', 'LOSS')}</span>
      {u.rondasFeitas != null && u.rondasSofridas != null && <span className="text-texto">{u.rondasFeitas}-{u.rondasSofridas}</span>}
      {u.mapa && <span className="text-[#8a857e]">{u.mapa}</span>}
      {u.delta != null && <span className={u.delta >= 0 ? 'text-vitoria' : 'text-derrota'}>{u.delta > 0 ? '+' : ''}{u.delta}</span>}
    </span>
  )
}

const VIDRO: CSSProperties = { background: 'linear-gradient(180deg, rgba(20,20,24,0.92), rgba(11,11,14,0.92))', boxShadow: '0 8px 30px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)' }

/** O cartão do overlay: o rank, o dia, o estado e a última partida. */
export function Overlay() {
  const { chave } = useParams()
  const [q] = useSearchParams()
  const o = lerOpcoes(q)
  const { valor: d, pronto } = useOverlayDados(chave)
  useFundoTransparente()
  if (!d) {
    // Chave errada ou área fechada: fica transparente (só com ?debug=1 diz porquê, para as pessoas acertarem a ligação).
    return pronto && q.get('debug') === '1' ? <p className="m-3 font-mono text-[12px] text-derrota">{l('Overlay sem dados: a ligação está errada ou a área ainda está fechada.', 'Overlay has no data: the link is wrong or the area is still closed.')}</p> : null
  }
  const estilo = { '--ov': o.cor, transform: `scale(${o.escala / 100})`, transformOrigin: 'top left' } as CSSProperties
  const cabeca = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Simbolo tamanho={30} className="shrink-0" />
      <span className="truncate text-[18px] leading-none font-extrabold tracking-[-0.02em]">{d.nome}</span>
    </span>
  )

  if (o.estilo === 'barra') {
    return (
      <div style={estilo} className="inline-block text-texto" lang="pt">
        <div className="flex items-center gap-5 rounded-2xl border px-5 py-3" style={{ ...VIDRO, borderColor: `${o.cor}55`, animation: 'rg-ov-entra .4s ease both' }}>
          <span style={{ color: o.cor }}>{cabeca}</span>
          {o.mostrar.has('rank') && <span className="flex items-center gap-2.5"><RankBadge tier={d.tier} rr={d.rr} /><span className="font-mono text-[15px] font-bold">{d.pontos}<span className="ml-1 text-[10.5px] text-[#8a857e]">PTS</span></span></span>}
          {o.mostrar.has('hoje') && <Hoje d={d} />}
          {o.mostrar.has('estado') && <Estado d={d} cor={o.cor} />}
          {o.mostrar.has('ultima') && <Ultima d={d} />}
        </div>
      </div>
    )
  }

  return (
    <div style={estilo} className="inline-block text-texto" lang="pt">
      <div className="flex w-[340px] flex-col gap-3.5 rounded-2xl border p-4" style={{ ...VIDRO, borderColor: `${o.cor}55`, animation: 'rg-ov-entra .4s ease both' }}>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: o.cor }} className="min-w-0">{cabeca}</span>
          {o.mostrar.has('rank') && <span className="font-mono text-[20px] leading-none font-bold">{d.pontos}<span className="ml-1 text-[10.5px] text-[#8a857e]">PTS</span></span>}
        </div>
        {o.mostrar.has('rank') && <div><RankBadge tier={d.tier} rr={d.rr} /></div>}
        {o.mostrar.has('hoje') && <Hoje d={d} />}
        {o.mostrar.has('estado') && <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2"><Estado d={d} cor={o.cor} /></div>}
        {o.mostrar.has('ultima') && <Ultima d={d} />}
      </div>
    </div>
  )
}

/** O endereço que a marca mostra: o do site (ou ?host=) e, com código, o link de convite. */
function enderecoMarca(host: string | null, convite: string | null) {
  const base = (host ?? window.location.host).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return convite ? `${base}/?convite=${convite}` : base
}

/**
 * A marca animada para um cantinho da live: o raio do Rangify, "Joga ranked no Rangify" e o endereço do site.
 * Com a chave do overlay mostra o link de convite do jogador. Com ?fundo=1 leva um fundo sólido e com ?sombra=0 não tem sombra
 * (o GIF do site usa ?sombra=0). Todas as animações repetem-se de 4,8 em 4,8 s, por isso o GIF fecha o ciclo sem saltos.
 */
export function OverlayMarca() {
  const { chave } = useParams()
  const [q] = useSearchParams()
  const o = lerOpcoes(q)
  const { valor: d } = useOverlayDados(chave)
  useFundoTransparente()
  const endereco = enderecoMarca(q.get('host'), d?.codigoConvite ?? q.get('convite'))
  const comFundo = q.get('fundo') === '1'
  const vidro = q.get('sombra') === '0' ? { ...VIDRO, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' } : VIDRO
  const estilo = { '--ov': o.cor, transform: `scale(${o.escala / 100})`, transformOrigin: 'top left', background: comFundo ? '#09090b' : undefined } as CSSProperties
  return (
    <div style={estilo} className="inline-block p-2 text-texto" lang="pt">
      <div data-marca className="rg-ov-anim relative flex h-[124px] w-[420px] items-center gap-4 overflow-hidden rounded-[22px] border px-5" style={{ ...vidro, borderColor: `${o.cor}66`, animation: 'rg-ov-flutua 4.8s ease-in-out infinite' }}>
        <span aria-hidden className="rg-ov-anim pointer-events-none absolute inset-0" style={{ background: `linear-gradient(105deg, transparent 30%, ${o.cor}33 48%, transparent 66%)`, backgroundSize: '300% 100%', animation: 'rg-ov-brilho 2.4s linear infinite' }} />
        <span className="relative grid size-[68px] shrink-0 place-items-center rounded-2xl border" style={{ borderColor: `${o.cor}55`, background: `${o.cor}1f`, color: o.cor }}>
          <span className="rg-ov-anim inline-flex" style={{ animation: 'rg-ov-raio 1.6s ease-in-out infinite' }}><Simbolo tamanho={46} /></span>
        </span>
        <span className="relative flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[10.5px] font-bold tracking-[0.2em] text-[#8a857e]">{l('JOGA RANKED NO', 'PLAY RANKED ON')}</span>
          <NomeRangify className="text-[34px] leading-none tracking-[-0.03em]" />
          <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold whitespace-nowrap" style={{ color: o.cor }}>
            {endereco}
            <span className="rg-ov-anim inline-flex" style={{ animation: 'rg-ov-seta 1.2s ease-in-out infinite' }}><ArrowUpRight size={15} aria-hidden /></span>
          </span>
        </span>
      </div>
    </div>
  )
}
