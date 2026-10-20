import { ExternalLink } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSessao } from '@/contexts/Sessao'
import { aoMudarDados, dados, type StreamerAoVivo } from '@/lib/data'
import { l } from '@/lib/idioma'

/** O símbolo da Twitch (o lucide já não traz logótipos de marcas). */
export function IconeTwitch({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  )
}

interface ValorAoVivo { mapa: Map<string, StreamerAoVivo>; lista: StreamerAoVivo[] }
const Contexto = createContext<ValorAoVivo>({ mapa: new Map(), lista: [] })

/** O endereço da live: só o nome do canal, que a Twitch limita a letras, números e _. */
const enderecoLive = (canal: string) => `https://www.twitch.tv/${encodeURIComponent(canal)}`

/**
 * Quem está em direto na Twitch (jogadores com o canal ligado). Atualiza a cada minuto, e logo que a staff
 * abre ou fecha a área ou alguém liga o canal. Enquanto a área estiver fechada para quem vê, a lista vem vazia.
 */
export function ProvedorAoVivo({ children }: { children: ReactNode }) {
  const { perfil } = useSessao()
  const [lista, setLista] = useState<StreamerAoVivo[]>([])
  const perfilId = perfil?.id

  useEffect(() => {
    if (!perfilId) { setLista([]); return }
    let vivo = true
    const carregar = () => dados.streamersAoVivo().then((r) => { if (vivo) setLista(r) }).catch(() => {})
    carregar()
    const t = window.setInterval(() => { if (!document.hidden) carregar() }, 60_000)
    const parar = aoMudarDados((o) => { if (o === 'streamers' || o === 'staff') carregar() })
    return () => { vivo = false; window.clearInterval(t); parar() }
  }, [perfilId])

  const valor = useMemo(() => ({ mapa: new Map(lista.map((s) => [s.perfilId, s])), lista }), [lista])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export const useAoVivo = () => useContext(Contexto)

/** "AO VIVO" com a ligação à live, ao lado de um jogador que está em direto (nada, se não estiver). */
export function EmDireto({ perfilId, compacto = false }: { perfilId: string; compacto?: boolean }) {
  const { mapa } = useAoVivo()
  const s = mapa.get(perfilId)
  if (!s) return null
  const dica = [s.titulo, s.jogo, s.espetadores != null ? l(`${s.espetadores} a ver`, `${s.espetadores} watching`) : null].filter(Boolean).join(' · ')
  return (
    <a
      href={enderecoLive(s.canal)}
      target="_blank"
      rel="noopener noreferrer"
      title={dica || l('Abrir a live na Twitch', 'Open the stream on Twitch')}
      aria-label={`${l('Abrir a live de', 'Open the stream of')} ${s.nome} ${l('na Twitch', 'on Twitch')}`}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#9146ff]/50 bg-[#9146ff]/16 font-mono font-bold whitespace-nowrap text-[#d4baff] no-underline transition-colors hover:border-[#b48bff]/70 hover:bg-[#9146ff]/28 ${compacto ? 'h-5 px-1.5 text-[9.5px]' : 'h-6 px-2.5 text-[10.5px]'}`}
    >
      <span className="ao-vivo size-1.5 rounded-full bg-[#ff4d5e]" aria-hidden />
      {l('AO VIVO', 'LIVE')}
      {compacto ? <ExternalLink size={10} aria-hidden /> : <><IconeTwitch size={12} />{l('Ver live', 'Watch')}</>}
    </a>
  )
}

/** Uma faixa com quem está em direto agora, cada um com o botão da live (nada, se ninguém estiver). */
export function FaixaAoVivo() {
  const { lista } = useAoVivo()
  if (!lista.length) return null
  return (
    <section aria-label={l('Jogadores em direto', 'Players live now')} className="painel flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3">
      <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.16em] text-[#d4baff]">
        <IconeTwitch size={14} />{l('EM DIRETO AGORA', 'LIVE NOW')}
      </span>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {lista.map((s) => (
          <li key={s.perfilId} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] py-1 pr-1.5 pl-3">
            <span className="text-[13px] font-semibold">{s.utilizador}</span>
            {s.espetadores != null && <span className="font-mono text-[11px] text-mudo">{s.espetadores}</span>}
            <EmDireto perfilId={s.perfilId} />
          </li>
        ))}
      </ul>
    </section>
  )
}
