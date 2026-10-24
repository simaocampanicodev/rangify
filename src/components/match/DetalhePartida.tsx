import { ChevronDown, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type JogadorPartida, type Partida } from '@/lib/data'
import { MAPAS, imagemMapa } from '@/lib/mapas'
import { caminhoPerfil, equipa, ladoInicial, nomeJogador } from '@/lib/partida'
import { comSinal } from '@/lib/pontos'
import { nomeRank, tierMedio } from '@/lib/ranks'
import { dataHora } from '@/lib/tempo'
import { IconeAgente, SeloMvp } from '../ui'
import { NumeroRolante } from '../ui/NumeroRolante'
import { Iniciais } from './comum'
import { l } from '@/lib/idioma'

function minutos(p: Partida) {
  if (!p.comecouEm) return null
  const fim = p.terminouEm ? new Date(p.terminouEm).getTime() : Date.now()
  return Math.max(1, Math.round((fim - new Date(p.comecouEm).getTime()) / 60_000))
}

/** O placar: arte do mapa, as rondas de cada equipa (a vencedora a laranja) e quem ganhou. */
function Placar({ p }: { p: Partida }) {
  const lado = (eq: 'A' | 'B') => {
    const rondas = eq === 'A' ? p.resultadoA : p.resultadoB
    const venceu = p.vencedor === eq
    return (
      <span className="flex flex-col items-center gap-1.5">
        <span className={`text-[clamp(52px,6vw,68px)] leading-none font-bold tracking-[-0.06em] ${venceu ? 'text-laranja' : 'text-mudo'}`}>{rondas ?? '-'}</span>
        <span className={`text-[10px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-suave'}`}>{l('EQUIPA', 'TEAM')} {eq}</span>
      </span>
    )
  }
  return (
    <section aria-label={l('Resultado', 'Result')} className="mapa relative flex min-h-[200px] flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 px-4 py-6" style={{ backgroundImage: `url(${imagemMapa(p.mapa)})` }}>
      <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.9) 100%)' }} />
      <span className="relative font-mono text-[10px] font-bold tracking-[0.18em] text-pessego">{p.mapa?.toUpperCase()}</span>
      <div className="relative flex items-end gap-3.5 font-mono">
        {lado('A')}
        <span className="pb-7 text-[26px] leading-none text-mudo">–</span>
        {lado('B')}
      </div>
      {p.vencedor && (
        <span className="relative rounded-full border border-laranja/45 bg-laranja/16 px-3 py-1 font-mono text-[9.5px] font-bold tracking-[0.12em] text-pessego-claro">
          {l(`VITÓRIA DA EQUIPA ${p.vencedor}`, `TEAM ${p.vencedor} WON`)}
        </span>
      )}
    </section>
  )
}

function Dado({ rotulo, valor, laranja = false }: { rotulo: string; valor: ReactNode; laranja?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/6 px-3.5 py-2.5 font-mono text-[11px] first:border-t-0">
      <span className="tracking-[0.12em] text-mudo">{rotulo}</span>
      <span className={laranja ? 'text-pessego' : 'text-marfim'}>{valor}</span>
    </div>
  )
}

/** Os bans em miniaturas (banidos a cinzento, com a letra da equipa) e o mapa jogado destacado. */
function Bans({ p }: { p: Partida }) {
  if (!p.bans.length && !p.mapa) return null
  const bans = [...p.bans].sort((x, y) => x.ordem - y.ordem)
  return (
    <section aria-label={l('Bans de mapas', 'Map bans')} className="flex flex-col gap-2.5">
      <span className="rotulo">Bans</span>
      <div className="grid grid-cols-3 gap-2">
        {bans.map((b) => {
          const m = MAPAS.find((x) => x.nome === b.mapa)
          return (
            <div key={b.ordem} className="flex flex-col items-center gap-1" title={l(`${b.mapa}, banido pela Equipa ${b.equipa}`, `${b.mapa}, banned by Team ${b.equipa}`)}>
              <span className="relative block h-11 w-full overflow-hidden rounded-lg border border-white/12">
                <span aria-hidden className="mapa absolute inset-0" style={{ backgroundImage: m ? `url(${m.imagem})` : undefined, filter: 'grayscale(1) brightness(0.55)' }} />
                <span aria-hidden className={`absolute top-1 left-1 grid size-4 place-items-center rounded-full bg-[rgba(9,9,11,0.85)] font-mono text-[9px] font-bold ${b.equipa === 'A' ? 'text-laranja-claro' : 'text-marfim'}`}>{b.equipa}</span>
              </span>
              <span className="so-leitores">{b.mapa}, {l('equipa', 'team')} {b.equipa}</span>
              <span aria-hidden className="font-mono text-[9px] tracking-[0.04em] text-mudo uppercase">{b.mapa}</span>
            </div>
          )
        })}
      </div>
      {p.mapa && (
        <div className="mapa relative flex h-[50px] items-center overflow-hidden rounded-[11px] border-2 border-laranja px-3" style={{ backgroundImage: `url(${imagemMapa(p.mapa)})`, boxShadow: '0 12px 28px -14px rgba(255,91,31,0.8)' }}>
          <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.82) 0%, rgba(9,9,11,0.1) 100%)' }} />
          <span className="relative font-mono text-[11px] font-bold tracking-[0.1em] text-pessego-claro">{p.mapa.toUpperCase()} · {l('JOGADO', 'PLAYED')}</span>
        </div>
      )}
    </section>
  )
}

type Chave = 'rs' | 'kda' | 'acs' | 'kast' | 'pontos'

/** As colunas, com a explicação ao passar o rato. Cada título ordena a tabela; em sítios estreitos sai o KAST. */
const colunas = (): { chave: Chave; rotulo: string; titulo: string; largura: number; oculta?: string }[] => [
  { chave: 'rs', rotulo: 'RS', titulo: l('Rangify Score: ACS, KDA, KAST e trades comparados com a média desta partida (100 é a média). Dá de -6 a +6 pontos.', 'Rangify Score: ACS, KDA, KAST and trades compared with this match average (100 is average). Worth -6 to +6 points.'), largura: 62 },
  { chave: 'kda', rotulo: 'K/D/A', titulo: l('Kills, mortes e assistências (ordena pelas kills)', 'Kills, deaths and assists (sorts by kills)'), largura: 86 },
  { chave: 'acs', rotulo: 'ACS', titulo: l('Average Combat Score: pontuação de combate por ronda', 'Average Combat Score per round'), largura: 62 },
  { chave: 'kast', rotulo: 'KAST', titulo: l('Rondas com kill, assistência, sobrevivência ou troca', 'Rounds with a kill, assist, survival or trade'), largura: 56, oculta: '@max-[500px]:hidden' },
  { chave: 'pontos', rotulo: l('Pontos', 'Points'), titulo: l('Pontos Rangify ganhos ou perdidos', 'Rangify points won or lost'), largura: 76 },
]

const VALOR: Record<Chave, (j: JogadorPartida) => number> = {
  rs: (j) => j.rangifyScore ?? -1,
  kda: (j) => j.kills ?? -1,
  acs: (j) => j.acs ?? -1,
  kast: (j) => j.kastPct ?? -1,
  pontos: (j) => j.deltaPontos ?? -999,
}

/** Um losango laranja assinala o melhor da equipa; a barrinha mostra a distância ao melhor da partida. */
function Marcador({ melhor }: { melhor: boolean }) {
  return melhor ? <i aria-hidden className="block size-[6px] rotate-45 bg-laranja" /> : null
}
function Barra({ pct }: { pct: number }) {
  return <span aria-hidden className="block h-0.5 w-[34px] rounded bg-white/8"><i className="block h-0.5 rounded bg-laranja" style={{ width: `${pct}%` }} /></span>
}

function Linha({ j, eu, maximos, melhores }: { j: JogadorPartida; eu: string; maximos: { acs: number; rs: number }; melhores: { rs: number; acs: number } }) {
  const num = 'px-1 text-center align-middle font-mono text-[13px] tabular-nums'
  const positivo = (j.deltaPontos ?? 0) > 0
  const extra = [j.hsPct != null && `HS ${j.hsPct}%`, j.trades != null && `${j.trades} trades`, j.firstBloods != null && `${j.firstBloods} first bloods`, j.agente].filter(Boolean).join(' · ')
  return (
    <tr className={`transition-colors hover:bg-white/[0.03] ${j.perfilId === eu ? 'bg-laranja/8' : ''}`}>
      <td className="py-2 pr-2 pl-3">
        <Link to={caminhoPerfil(j.riotId)} title={extra || undefined} className="flex min-w-0 items-center gap-2.5 text-texto no-underline hover:text-pessego">
          <Iniciais nome={nomeJogador(j)} equipa={j.equipa} tamanho={28} url={j.avatarUrl} perfilId={j.perfilId} />
          <IconeAgente nome={j.agente} tamanho={24} />
          <span className="truncate text-[13.5px] font-semibold">{nomeJogador(j)}</span>
          {j.capitao && <span className="font-mono text-[11px] font-bold text-laranja">(C)</span>}
          {j.mvp && <SeloMvp tamanho={18} perfilId={j.perfilId} />}
        </Link>
      </td>
      <td className={`${num} font-semibold ${(j.rangifyScore ?? 0) >= 100 ? 'text-pessego' : 'text-suave'}`}>
        <span className="inline-flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-1.5"><Marcador melhor={j.rangifyScore != null && j.rangifyScore === melhores.rs} />{j.rangifyScore ?? '-'}</span>
          <Barra pct={j.rangifyScore != null && maximos.rs ? (j.rangifyScore / maximos.rs) * 100 : 0} />
        </span>
      </td>
      <td className={num}>{j.kills ?? '-'}/{j.deaths ?? '-'}/{j.assists ?? '-'}</td>
      <td className={num}>
        <span className="inline-flex flex-col items-center gap-1">
          <span className="inline-flex items-center gap-1.5"><Marcador melhor={j.acs != null && j.acs === melhores.acs} />{j.acs ?? '-'}</span>
          <Barra pct={j.acs != null && maximos.acs ? (j.acs / maximos.acs) * 100 : 0} />
        </span>
      </td>
      <td className={`${num} @max-[500px]:hidden`}>{j.kastPct != null ? `${j.kastPct}%` : '-'}</td>
      <td
        title={j.deltaPontos != null && j.deltaDesempenho != null ? l(`Resultado e rank: ${comSinal(j.deltaPontos - j.deltaDesempenho)} · Desempenho: ${comSinal(j.deltaDesempenho)}`, `Result and rank: ${comSinal(j.deltaPontos - j.deltaDesempenho)} · Performance: ${comSinal(j.deltaDesempenho)}`) : undefined}
        className="px-1 text-center align-middle"
      >
        {j.deltaPontos != null ? (
          <span className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[12.5px] font-bold tabular-nums ${positivo ? 'border-vitoria/32 bg-vitoria/12 text-vitoria' : 'border-derrota/32 bg-derrota/12 text-derrota'}`}>
            <NumeroRolante valor={comSinal(j.deltaPontos)} />
          </span>
        ) : <span className="font-mono text-[13px] text-mudo">-</span>}
      </td>
    </tr>
  )
}

/** As duas equipas: uma barra com o resultado e a tabela por baixo. Cada título ordena (e o ACS e o RS ganham a barrinha). */
function Equipas({ p, eu }: { p: Partida; eu: string }) {
  const COLUNAS = colunas()
  const [ordem, setOrdem] = useState<{ chave: Chave; dir: 1 | -1 }>({ chave: 'rs', dir: -1 })
  const jogadores = p.jogadores.filter((j) => j.equipa)
  const maximos = { acs: Math.max(0, ...jogadores.map((j) => j.acs ?? 0)), rs: Math.max(0, ...jogadores.map((j) => j.rangifyScore ?? 0)) }
  const ordenar = (chave: Chave) => setOrdem((o) => (o.chave === chave ? { chave, dir: o.dir === -1 ? 1 : -1 } : { chave, dir: -1 }))
  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      {(['A', 'B'] as const).map((eq) => {
        const lista = equipa(p, eq)
        const melhores = { rs: Math.max(-1, ...lista.map((j) => j.rangifyScore ?? -1)), acs: Math.max(-1, ...lista.map((j) => j.acs ?? -1)) }
        const ordenados = [...lista].sort((x, y) => ordem.dir * (VALOR[ordem.chave](x) - VALOR[ordem.chave](y)) || (y.acs ?? 0) - (x.acs ?? 0))
        const rondas = eq === 'A' ? p.resultadoA : p.resultadoB
        const lado = ladoInicial(p, eq)
        return (
          <section key={eq} aria-label={`${l('Equipa', 'Team')} ${eq}`} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white/[0.03] py-2.5 pr-4 pl-4" style={{ borderLeft: `3px solid ${eq === 'A' ? '#ff5b1f' : '#e6e1da'}` }}>
              <span className={`font-mono text-[11.5px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>{l('EQUIPA', 'TEAM')} {eq}</span>
              <span className="font-mono text-[11.5px]"><b className="text-[15px]">{rondas ?? '-'}</b> {l('RONDAS', 'ROUNDS')}</span>
              {p.vencedor === eq && <span className="rounded-full border border-laranja/45 bg-laranja/16 px-2.5 py-[3px] font-mono text-[9.5px] font-bold tracking-[0.1em] text-pessego-claro">{l('VITÓRIA', 'WIN')}</span>}
              <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-suave">
                {l('MÉDIA', 'AVERAGE')} {nomeRank(tierMedio(lista.map((j) => j.tier))).toUpperCase()}
                {lado && <span className="rounded-[7px] border border-white/16 px-2 py-[3px] text-marfim">{lado === 'ataque' ? l('COMEÇOU A ATACAR', 'STARTED ON ATTACK') : l('COMEÇOU A DEFENDER', 'STARTED ON DEFENCE')}</span>}
                {lado && p.lado?.equipa === eq && <span className="rounded-[7px] border border-laranja/35 px-1.5 py-[3px] text-pessego">{l('ESCOLHA', 'PICK')}</span>}
              </span>
            </div>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="rotulo text-left">
                  <th scope="col" className="py-1.5 pl-3 font-normal">{l('Jogador', 'Player')}</th>
                  {COLUNAS.map((c) => {
                    const ativa = ordem.chave === c.chave
                    return (
                      <th key={c.chave} scope="col" style={{ width: c.largura }} aria-sort={ativa ? (ordem.dir === -1 ? 'descending' : 'ascending') : 'none'} className={`px-1 text-center font-normal ${c.oculta ?? ''}`}>
                        <button type="button" title={c.titulo} onClick={() => ordenar(c.chave)} className={`relative inline-flex cursor-pointer items-center rounded bg-transparent p-0 font-[inherit] tracking-[inherit] uppercase hover:text-texto ${ativa ? 'text-pessego' : 'text-inherit'}`}>
                          {c.rotulo}
                          <ChevronDown size={10} aria-hidden className={`absolute top-1/2 left-full ml-0.5 -translate-y-1/2 transition-all duration-300 ${ativa ? `opacity-100 ${ordem.dir === 1 ? 'rotate-180' : ''}` : 'opacity-0'}`} />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {ordenados.map((j) => <Linha key={j.perfilId} j={j} eu={eu} maximos={maximos} melhores={melhores} />)}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}

/**
 * O detalhe de uma partida acabada (histórico e fim de jogo): à esquerda uma coluna com o placar, os dados, o MVP e os bans;
 * à direita as duas equipas. Em sítios estreitos a coluna passa para cima e as duas partes ficam empilhadas.
 * `extra` entra na coluna logo a seguir ao placar (o recibo dos pontos, no fim de jogo).
 */
export function DetalhePartida({ p, eu, extra }: { p: Partida; eu: string; extra?: ReactNode }) {
  const min = minutos(p)
  const mvp = p.jogadores.find((j) => j.mvp)
  return (
    <div className="@container">
      <div className="grid gap-4 @min-[800px]:grid-cols-[292px_minmax(0,1fr)] @min-[800px]:items-start">
        <aside className="grid gap-3.5 @min-[520px]:grid-cols-2 @min-[800px]:grid-cols-1">
          <div className="flex flex-col gap-3.5 @min-[520px]:col-span-2 @min-[800px]:col-span-1">
            <Placar p={p} />
            {extra}
          </div>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col rounded-[14px] border border-white/8 bg-white/[0.02]">
              <Dado rotulo={l('DATA', 'DATE')} valor={p.terminouEm ? dataHora(p.terminouEm) : '-'} />
              {min && <Dado rotulo={l('DURAÇÃO', 'LENGTH')} valor={`${min} MIN`} />}
              <Dado rotulo={l('FILA', 'QUEUE')} valor={p.fila === 'ranked' ? 'RANKED' : l('ABERTA', 'OPEN')} />
              {p.simulada && <Dado rotulo={l('TIPO', 'TYPE')} valor={l('PARTIDA DE TESTE', 'TEST MATCH')} laranja />}
            </div>
            {mvp && (
              <div className="flex items-center gap-2.5 rounded-[14px] border border-laranja/30 bg-laranja/7 py-2.5 pr-3.5 pl-2.5">
                <span className="grid size-8 place-items-center rounded-[9px] border border-laranja/50 bg-laranja/16 text-laranja"><Star size={16} fill="currentColor" aria-hidden /></span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-mudo">MVP</span>
                  <span className="truncate text-[14px] font-bold">{nomeJogador(mvp)}</span>
                </span>
                {mvp.rangifyScore != null && <span className="font-mono text-[13px] font-bold text-pessego">RS {mvp.rangifyScore}</span>}
              </div>
            )}
          </div>
          <Bans p={p} />
        </aside>
        <Equipas p={p} eu={eu} />
      </div>
    </div>
  )
}
