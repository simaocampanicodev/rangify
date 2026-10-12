import { Activity, Crosshair, Crown, Flame, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import type { EstatisticasPerfil } from '@/lib/dados'
import { imagemMapa } from '@/lib/mapas'
import { Painel, TituloPainel, Vazio } from './ui'

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
      <TituloPainel eyebrow="DESEMPENHO" titulo="Em média, por partida" id="rg-desempenho" direita={<span className="font-mono text-[11px] text-mudo">{s.partidas} {s.partidas === 1 ? 'partida' : 'partidas'}</span>} />
      {!s.partidas ? <Vazio icone={<Activity size={22} />} titulo="Ainda sem partidas" texto="As estatísticas aparecem depois da primeira partida confirmada." /> : (
        <>
          <Grupo icone={<Crosshair size={14} aria-hidden />} nome="Combate">
            <Mosaico rotulo="ACS" valor={inteiro(s.acs)} sub="por ronda" titulo="Average Combat Score: pontuação de combate por ronda" />
            <Mosaico rotulo="K/D" valor={s.kd != null ? s.kd.toFixed(2) : '-'} sub={`KDA ${s.kda != null ? s.kda.toFixed(2) : '-'}`} titulo="Kills a dividir por mortes" />
            <Mosaico rotulo="Kills" valor={umaCasa(s.killsMedia)} sub="por partida" />
            <Mosaico rotulo="Mortes" valor={umaCasa(s.mortesMedia)} sub="por partida" />
            <Mosaico rotulo="Assist." valor={umaCasa(s.assistMedia)} sub="por partida" />
          </Grupo>
          <Grupo icone={<Activity size={14} aria-hidden />} nome="Impacto">
            <Mosaico rotulo="KAST" valor={pct(s.kastPct)} barra={s.kastPct} titulo="Rondas com kill, assistência, sobrevivência ou troca" />
            <Mosaico rotulo="HS%" valor={pct(s.hsPct)} barra={s.hsPct} titulo="Percentagem de tiros na cabeça" />
            <Mosaico rotulo="Trades" valor={umaCasa(s.tradesMedia)} sub="por partida" titulo="Kills de troca: matar quem matou um colega há menos de 5 s" />
            <Mosaico rotulo="First bloods" valor={umaCasa(s.fbMedia)} sub={`${s.firstBloods} no total`} />
            <Mosaico rotulo="MVP" valor={String(s.mvps)} sub={s.partidas ? `${Math.round((s.mvps / s.partidas) * 100)}% das partidas` : undefined} />
          </Grupo>
          <Grupo icone={<Trophy size={14} aria-hidden />} nome="Recordes e sequências">
            <Mosaico rotulo="Melhor ACS" valor={inteiro(s.melhorAcs)} sub="numa partida" />
            <Mosaico rotulo="Mais kills" valor={inteiro(s.maisKills)} sub="numa partida" />
            <Mosaico rotulo="Melhor série" valor={String(s.melhorSequencia)} sub="vitórias" />
            <Mosaico
              rotulo="Agora"
              valor={seq > 0 ? `${seq}V` : seq < 0 ? `${-seq}D` : '-'}
              sub={<span className="inline-flex items-center gap-1">{seq > 1 && <Flame size={11} className="text-laranja" aria-hidden />}{seq !== 0 ? 'seguidas' : 'sem série'}</span>}
            />
            <Mosaico
              rotulo="Como capitão"
              valor={`${s.capitao.vitorias}-${s.capitao.partidas - s.capitao.vitorias}`}
              sub={<span className="inline-flex items-center gap-1"><Crown size={11} className="text-laranja" aria-hidden />{s.capitao.partidas} {s.capitao.partidas === 1 ? 'partida' : 'partidas'}</span>}
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
      <TituloPainel eyebrow="POR MAPA" titulo="Onde joga melhor" id="rg-mapas" />
      {!s.porMapa.length ? <p className="m-0 text-[13px] text-mudo">Ainda sem partidas.</p> : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {s.porMapa.map((m) => {
            const vit = m.partidas ? Math.round((m.vitorias / m.partidas) * 100) : 0
            return (
              <li key={m.mapa} className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-2 pr-3">
                <span aria-hidden className="mapa h-10 w-14 shrink-0 rounded-lg border border-white/8" style={{ backgroundImage: `url(${imagemMapa(m.mapa)})` }} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{m.mapa}</span>
                    <span className="font-mono text-[12px] text-suave">{m.vitorias}V · {m.partidas - m.vitorias}D</span>
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
