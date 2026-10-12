import { Activity, Crosshair, Crown, Flame, Map as MapIcon, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EstatisticasPerfil } from '@/lib/dados'
import { imagemMapa } from '@/lib/mapas'
import { Painel, TituloPainel, Vazio } from './ui'
import { l } from '@/lib/idioma'

const umaCasa = (v: number | null | undefined) => (v != null ? v.toFixed(1) : '-')
const inteiro = (v: number | null | undefined) => (v != null ? String(Math.round(v)) : '-')
const pct = (v: number | null | undefined) => (v != null ? `${Math.round(v)}%` : '-')

function Mosaico({ rotulo, valor, sub, barra, titulo }: { rotulo: string; valor: string; sub?: ReactNode; barra?: number | null; titulo?: string }) {
  return (
    <div title={titulo} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/6 bg-white/[0.025] px-3.5 py-3">
      <span className="rotulo">{rotulo}</span>
      <span className="font-mono text-[22px] leading-none font-semibold tracking-[-0.03em]">{valor}</span>
      {barra != null && (
        <span aria-hidden className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/7">
          <span className="block h-full rounded-full bg-laranja" style={{ width: `${Math.max(0, Math.min(100, barra))}%` }} />
        </span>
      )}
      {sub && <span className="truncate text-[11.5px] text-mudo">{sub}</span>}
    </div>
  )
}

function Grupo({ icone, nome, children }: { icone: ReactNode; nome: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-suave"><span className="text-laranja">{icone}</span>{nome}</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">{children}</div>
    </div>
  )
}

/** As estatísticas tiradas de cada partida, agrupadas por combate, impacto e recordes. */
export function Desempenho({ s }: { s: EstatisticasPerfil }) {
  const seq = s.sequenciaAtual
  return (
    <Painel aria-labelledby="rg-desempenho" className="flex min-w-0 flex-[2_1_560px] flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('DESEMPENHO', 'PERFORMANCE')} titulo={l('Em média, por partida', 'Average per match')} id="rg-desempenho" direita={<span className="font-mono text-[11px] text-mudo">{s.partidas} {s.partidas === 1 ? l('partida', 'match') : l('partidas', 'matches')}</span>} />
      {!s.partidas ? <div className="flex flex-1 items-center justify-center"><Vazio icone={<Activity size={22} />} titulo={l('Ainda sem partidas', 'No matches yet')} texto={l('As estatísticas aparecem depois da primeira partida confirmada.', 'Stats show up after the first confirmed match.')} /></div> : (
        <>
          <Grupo icone={<Crosshair size={14} aria-hidden />} nome={l('Combate', 'Combat')}>
            <Mosaico rotulo="ACS" valor={inteiro(s.acs)} sub={l('por ronda', 'per round')} titulo={l('Average Combat Score: pontuação de combate por ronda', 'Average Combat Score per round')} />
            <Mosaico rotulo="K/D" valor={s.kd != null ? s.kd.toFixed(2) : '-'} sub={`KDA ${s.kda != null ? s.kda.toFixed(2) : '-'}`} titulo={l('Kills a dividir por mortes', 'Kills divided by deaths')} />
            <Mosaico rotulo="Kills" valor={umaCasa(s.killsMedia)} sub={l('por partida', 'per match')} />
            <Mosaico rotulo={l('Mortes', 'Deaths')} valor={umaCasa(s.mortesMedia)} sub={l('por partida', 'per match')} />
            <Mosaico rotulo={l('Assist.', 'Assists')} valor={umaCasa(s.assistMedia)} sub={l('por partida', 'per match')} />
          </Grupo>
          <Grupo icone={<Activity size={14} aria-hidden />} nome={l('Impacto', 'Impact')}>
            <Mosaico rotulo="KAST" valor={pct(s.kastPct)} barra={s.kastPct} titulo={l('Rondas com kill, assistência, sobrevivência ou troca', 'Rounds with a kill, assist, survival or trade')} />
            <Mosaico rotulo="HS%" valor={pct(s.hsPct)} barra={s.hsPct} titulo={l('Percentagem de tiros na cabeça', 'Headshot percentage')} />
            <Mosaico rotulo="Trades" valor={umaCasa(s.tradesMedia)} sub={l('por partida', 'per match')} titulo={l('Kills de troca: matar quem matou um colega há menos de 5 s', 'Trade kills: killing whoever killed a teammate less than 5 s ago')} />
            <Mosaico rotulo="First bloods" valor={umaCasa(s.fbMedia)} sub={l(`${s.firstBloods} no total`, `${s.firstBloods} in total`)} />
            <Mosaico rotulo="MVP" valor={String(s.mvps)} sub={s.partidas ? l(`${Math.round((s.mvps / s.partidas) * 100)}% das partidas`, `${Math.round((s.mvps / s.partidas) * 100)}% of matches`) : undefined} />
          </Grupo>
          <Grupo icone={<Trophy size={14} aria-hidden />} nome={l('Recordes e sequências', 'Records and streaks')}>
            <Mosaico rotulo={l('Melhor ACS', 'Best ACS')} valor={inteiro(s.melhorAcs)} sub={l('numa partida', 'in one match')} />
            <Mosaico rotulo={l('Mais kills', 'Most kills')} valor={inteiro(s.maisKills)} sub={l('numa partida', 'in one match')} />
            <Mosaico rotulo={l('Melhor série', 'Best streak')} valor={String(s.melhorSequencia)} sub={l('vitórias', 'wins')} />
            <Mosaico
              rotulo={l('Agora', 'Now')}
              valor={seq > 0 ? `${seq}${l('V', 'W')}` : seq < 0 ? `${-seq}${l('D', 'L')}` : '-'}
              sub={<span className="inline-flex items-center gap-1">{seq > 1 && <Flame size={11} className="text-laranja" aria-hidden />}{seq !== 0 ? l('seguidas', 'in a row') : l('sem série', 'no streak')}</span>}
            />
            <Mosaico
              rotulo={l('Como capitão', 'As captain')}
              valor={`${s.capitao.vitorias}-${s.capitao.partidas - s.capitao.vitorias}`}
              sub={<span className="inline-flex items-center gap-1"><Crown size={11} className="text-laranja" aria-hidden />{s.capitao.partidas} {s.capitao.partidas === 1 ? l('partida', 'match') : l('partidas', 'matches')}</span>}
            />
          </Grupo>
        </>
      )}
    </Painel>
  )
}

/** Partidas, vitórias e ACS em cada mapa, do mais jogado para o menos jogado. */
export function PorMapa({ s }: { s: EstatisticasPerfil }) {
  return (
    <Painel aria-labelledby="rg-mapas" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 p-[22px]">
      <TituloPainel eyebrow={l('POR MAPA', 'BY MAP')} titulo={l('Onde joga melhor', 'Where they play best')} id="rg-mapas" />
      {!s.porMapa.length ? (
        <div className="flex flex-1 items-center justify-center">
          <Vazio icone={<MapIcon size={22} />} titulo={l('Sem mapas ainda', 'No maps yet')} texto={l('Cada mapa jogado aparece aqui com as vitórias e o ACS.', 'Each map played shows up here with wins and ACS.')} />
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {s.porMapa.map((m) => {
            const vit = m.partidas ? Math.round((m.vitorias / m.partidas) * 100) : 0
            return (
              <li key={m.mapa} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-2 pr-3">
                <span aria-hidden className="mapa h-10 w-14 shrink-0 rounded-lg border border-white/8" style={{ backgroundImage: `url(${imagemMapa(m.mapa)})` }} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{m.mapa}</span>
                    <span className="font-mono text-[12px] text-suave">{m.vitorias}{l('V', 'W')} · {m.partidas - m.vitorias}{l('D', 'L')}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-white/7"><span className="block h-full rounded-full bg-laranja" style={{ width: `${vit}%` }} /></span>
                    <span className="w-9 text-right font-mono text-[11px] text-pessego">{vit}%</span>
                    <span className="w-[54px] text-right font-mono text-[11px] text-mudo">{m.acs != null ? `${Math.round(m.acs)} ACS` : '-'}</span>
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Painel>
  )
}
