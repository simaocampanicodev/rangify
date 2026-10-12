import { Ban } from 'lucide-react'
import { useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type Partida } from '@/lib/dados'
import { MAPAS, equipaDoBan, mapasDaPool, totalBans } from '@/lib/mapas'
import { capitao, nomeJogador, vezDe } from '@/lib/partida'
import { SEGUNDOS_BAN } from '@/lib/regras'
import { emFalta } from '@/lib/tempo'
import { Relogio } from './Relogio'
import { l } from '@/lib/idioma'

export function Mapas({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const { atualizar } = usePartida()
  const agora = useAgora(250)
  const [aBanir, setABanir] = useState<string | null>(null)
  const vez = vezDe(p) ?? 'A'
  const cap = capitao(p, vez)
  const souEu = cap?.perfilId === eu && !p.automatica
  const n = p.bans.length
  // Só entram nos bans os mapas que estavam na rotação quando a partida nasceu.
  const pool = mapasDaPool(p.pool)
  const bans = totalBans(p.pool)

  const banir = async (mapa: string) => {
    setABanir(mapa)
    await acao(() => dados.banirMapa(p.id, mapa))
    await atualizar()
    setABanir(null)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-labelledby="rg-ban-titulo" className="painel flex flex-col gap-[18px] px-[22px] py-5">
        <div className="flex min-w-0 items-center gap-[18px]">
          <Relogio restante={emFalta(p.prazoFase, agora)} total={SEGUNDOS_BAN} tamanho={84} cor={vez === 'A' ? '#ff5b1f' : '#e6e1da'} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${vez === 'A' ? 'text-laranja' : 'text-marfim'}`}>{l(`BAN ${n + 1} DE ${bans} · EQUIPA ${vez}`, `BAN ${n + 1} OF ${bans} · TEAM ${vez}`)}</span>
            <h1 id="rg-ban-titulo" className="m-0 text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em]">
              {souEu ? l('Escolhe um mapa para banir', 'Pick a map to ban') : l(`${cap ? nomeJogador(cap) : 'O capitão'} está a banir um mapa`, `${cap ? nomeJogador(cap) : 'The captain'} is banning a map`)}
            </h1>
            <span className="text-[13.5px] text-[#a6a19a]">{l('Os capitães banem à vez. O mapa que sobrar é o da partida.', 'The captains ban in turns. The map left over is the match map.')}</span>
          </div>
        </div>
        <div role="list" aria-label={l('Ordem dos bans', 'Ban order')} className="flex flex-wrap gap-1.5 border-t border-white/7 pt-4">
          {Array.from({ length: bans + 1 }, (_, i) => {
            const b = p.bans[i]
            const mapa = b ? MAPAS.find((m) => m.nome === b.mapa) : null
            const decisivo = i === bans
            const atual = i === n
            return (
              <div key={i} role="listitem" className="flex w-[58px] flex-col items-center gap-1.5">
                <span
                  className="mapa relative grid h-[38px] w-[58px] place-items-center overflow-hidden rounded-[8px] border font-mono text-[11px] font-bold"
                  style={{
                    backgroundImage: mapa ? `url(${mapa.imagem})` : undefined,
                    borderColor: atual ? '#ff5b1f' : decisivo ? 'rgba(255,91,31,0.4)' : 'rgba(255,255,255,0.1)',
                    filter: mapa ? 'grayscale(1) brightness(0.55)' : undefined,
                    borderStyle: mapa || atual ? 'solid' : 'dashed',
                  }}
                >
                  {!mapa && <span className={atual ? 'text-pessego' : 'text-mudo'}>{decisivo ? '?' : equipaDoBan(i)}</span>}
                </span>
                <span className={`max-w-full truncate font-mono text-[9px] tracking-[0.06em] ${atual ? 'text-pessego' : 'text-mudo'}`}>
                  {decisivo ? l('DECISIVO', 'DECIDER') : mapa ? mapa.nome.toUpperCase() : `BAN ${i + 1}`}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label={l('Mapas da rotação', 'Maps in rotation')} className="ban-linha">
        {pool.map((m) => {
          const ban = p.bans.find((b) => b.mapa === m.nome)
          const decisivo = !!p.mapa && p.mapa === m.nome
          const pode = souEu && !ban && !aBanir
          const classe = decisivo ? 'ban-decisivo' : ban ? 'ban-banido' : 'ban-livre'
          return (
            <div key={m.nome} className={`ban-cartao ${classe}`}>
              <span aria-hidden className="ban-fundo mapa" style={{ backgroundImage: `url(${m.imagem})` }} />
              <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.45) 0%, rgba(9,9,11,0.08) 32%, rgba(9,9,11,0.35) 60%, rgba(9,9,11,0.94) 100%)' }} />
              <span className="ban-locais absolute top-3 left-3 inline-flex h-6 items-center rounded-[7px] border border-white/16 bg-[rgba(9,9,11,0.62)] px-2 font-mono text-[10.5px] font-semibold text-marfim">{m.locais}</span>
              {ban && (
                <span aria-hidden className="absolute top-[40%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                  <span className="grid size-10 place-items-center rounded-full border-2 border-white/70 bg-[rgba(9,9,11,0.4)] text-white"><Ban size={20} /></span>
                  <span className="font-mono text-[10px] font-extrabold tracking-[0.08em] whitespace-nowrap text-pessego-claro">{l('EQUIPA', 'TEAM')} {ban.equipa}</span>
                </span>
              )}
              <span aria-hidden className="ban-vertical">{m.nome}</span>
              <div className="ban-aberto">
                <span className="max-w-full truncate text-[clamp(20px,2.2vw,30px)] leading-[0.95] font-black tracking-[-0.03em] uppercase">{m.nome}</span>
                <span className={`font-mono text-[10.5px] font-bold tracking-[0.12em] ${ban ? 'text-mudo' : 'text-pessego'}`}>
                  {decisivo ? l('MAPA DA PARTIDA', 'MATCH MAP') : ban ? l(`BANIDO PELA EQUIPA ${ban.equipa}`, `BANNED BY TEAM ${ban.equipa}`) : souEu ? l('É A TUA VEZ', 'YOUR TURN') : l('DISPONÍVEL', 'AVAILABLE')}
                </span>
                {pode && (
                  <button
                    type="button"
                    onClick={() => banir(m.nome)}
                    aria-label={`${l('Banir', 'Ban')} ${m.nome}`}
                    className="flex h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-laranja/55 bg-laranja/18 text-[14px] font-extrabold tracking-[0.08em] text-pessego-claro transition-colors hover:bg-laranja hover:text-escuro-laranja"
                  >
                    <Ban size={16} aria-hidden />{aBanir === m.nome ? l('A BANIR…', 'BANNING…') : l('BANIR', 'BAN')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>
      <p className="m-0 text-[13px] text-mudo">
        {souEu ? l('Para o rato num mapa para o abrir e banir. ', 'Hover a map to open and ban it. ') : ''}{l('Os mapas banidos ficam a cinzento; o que sobrar é o da partida.', 'Banned maps turn grey; the one left over is the match map.')}
      </p>
    </div>
  )
}
