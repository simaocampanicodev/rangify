import { Minus, Plus, RefreshCw, Search, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, BotaoAjuda, Cabecalho, Esqueleto, LinhasEsqueleto, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados, type LinhaRanking } from '@/lib/dados'
import { formatarXp } from '@/lib/experiencia'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'
import { BONUS_MAX, BONUS_MIN, PONTOS_BASE, POR_DIVISAO, bonusDesnivel, comSinal } from '@/lib/pontos'
import { divisao, nomeDivisao } from '@/lib/ranks'
import { HORAS_CACHE_RANK } from '@/lib/regras'
import { l as tx } from '@/lib/idioma'
import { haQuanto } from '@/lib/tempo'

function Forma({ f }: { f: ('V' | 'D')[] }) {
  const texto = f.map((x) => (x === 'V' ? tx('vitória', 'win') : tx('derrota', 'loss'))).join(', ')
  return (
    <span role="img" aria-label={f.length ? `${tx('Últimas', 'Last')} ${f.length}: ${texto}` : tx('Sem partidas', 'No matches')} className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const x = f[f.length - 5 + i]
        return <span key={i} className="size-2 rounded-full" style={{ background: x === 'V' ? '#5fe3d6' : x === 'D' ? '#ff7d8f' : 'rgba(255,255,255,0.1)' }} />
      })}
    </span>
  )
}

const lugares = () => [
  { rotulo: tx('1.º LUGAR', '1ST PLACE'), cor: '#ff5b1f', halo: 'rgba(255,91,31,0.26)', borda: 'rgba(255,91,31,0.55)' },
  { rotulo: tx('2.º LUGAR', '2ND PLACE'), cor: '#ff9466', halo: 'rgba(255,148,102,0.16)', borda: 'rgba(255,148,102,0.3)' },
  { rotulo: tx('3.º LUGAR', '3RD PLACE'), cor: '#ffb592', halo: 'rgba(255,181,146,0.12)', borda: 'rgba(255,181,146,0.22)' },
]

/** Os três primeiros em grande, por cima da tabela (o 1.º ao meio e mais alto). */
function Podio({ top, eu }: { top: LinhaRanking[]; eu?: string }) {
  const ordem = [top[1], top[0], top[2]]
  return (
    <section aria-label={tx('Pódio da temporada', 'Season podium')} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      {ordem.map((l, k) => {
        const i = l.posicao - 1
        const lugar = lugares()[Math.min(2, i)]
        const p = l.perfil
        const primeiro = l.posicao === 1
        const jogos = p.vitorias + p.derrotas
        return (
          <Link
            key={p.id}
            to={caminhoPerfil(p.riotId)}
            className={`painel cartao-hover entra-linha relative flex flex-col gap-3.5 overflow-hidden p-5 text-texto no-underline ${primeiro ? 'cantos sm:-mt-4 sm:pb-7' : ''} ${k === 1 ? 'order-first sm:order-none' : ''}`}
            style={{ borderColor: lugar.borda, boxShadow: primeiro ? '0 24px 70px -30px rgba(255,91,31,0.7)' : undefined, '--i': k } as React.CSSProperties}
          >
            <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-60 rounded-full" style={{ background: `radial-gradient(circle, ${lugar.halo} 0%, rgba(0,0,0,0) 65%)` }} />
            <span aria-hidden className="absolute top-2 right-4 font-mono text-[60px] leading-none font-bold tracking-[-0.06em]" style={{ color: lugar.cor, opacity: 0.22 }}>{String(l.posicao).padStart(2, '0')}</span>
            <span className="relative font-mono text-[11px] font-semibold tracking-[0.16em]" style={{ color: lugar.cor }}>{lugar.rotulo}</span>
            <span className="relative flex items-center gap-3">
              <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={primeiro ? 60 : 50} destaque={primeiro || p.id === eu} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{nomeJogador(p)}<span className="font-mono text-[12px] font-medium text-mudo">{tagJogador(p)}</span></span>
                <RankBadge tier={p.tier} pequeno />
              </span>
            </span>
            <span className="relative flex items-baseline justify-between gap-2.5 border-t border-white/7 pt-3">
              <span className="flex items-baseline gap-1.5"><span className={`font-mono font-semibold tracking-[-0.04em] ${primeiro ? 'text-[36px]' : 'text-[30px]'}`}>{p.pontos}</span><span className="text-[12px] text-mudo">pts</span></span>
              <span className="font-mono text-[12px] text-suave">{p.vitorias}-{p.derrotas}{jogos ? ` · ${Math.round((p.vitorias / jogos) * 100)}%` : ''}</span>
            </span>
          </Link>
        )
      })}
    </section>
  )
}

function PodioEsqueleto() {
  return (
    <div aria-hidden className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      {[0, 1, 2].map((k) => (
        <div key={k} className={`painel flex flex-col gap-3.5 p-5 ${k === 1 ? 'sm:-mt-4 sm:pb-7' : ''}`}>
          <Esqueleto className="h-3 w-20" />
          <span className="flex items-center gap-3"><Esqueleto className="size-[50px] !rounded-[13px]" /><span className="flex flex-1 flex-col gap-2"><Esqueleto className="h-4 w-2/3" /><Esqueleto className="h-5 w-24 !rounded-full" /></span></span>
          <Esqueleto className="h-8 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function Linha({ l, eu, i }: { l: LinhaRanking; eu: boolean; i: number }) {
  const p = l.perfil
  const jogos = p.vitorias + p.derrotas
  const pos = l.posicao
  return (
    <tr className={`linha-hover entra-linha ${eu ? 'bg-laranja/8' : ''}`} style={{ '--i': i } as React.CSSProperties}>
      <td className="w-12 py-2.5 pl-3 font-mono text-[14px] font-semibold">
        <span className={pos <= 3 || eu ? 'text-laranja' : 'text-suave'}>#{pos}</span>
      </td>
      <td className="py-2.5 pr-2">
        <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline hover:text-pessego">
          <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={32} destaque={eu} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-semibold">{nomeJogador(p)}{eu && <span className="ml-1.5 rounded bg-laranja px-1.5 py-px font-mono text-[9.5px] font-bold text-escuro-laranja">{tx('TU', 'YOU')}</span>}</span>
            <span className="font-mono text-[11px] text-mudo">{tagJogador(p)}</span>
          </span>
        </Link>
      </td>
      <td className="hidden px-2 md:table-cell"><RankBadge tier={p.tier} pequeno /></td>
      <td className="hidden px-2 sm:table-cell"><Forma f={l.forma} /></td>
      <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{p.vitorias}-{p.derrotas}</td>
      <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{jogos ? `${Math.round((p.vitorias / jogos) * 100)}%` : '-'}</td>
      <td className="pr-3 pl-2 text-right font-mono text-[15px] font-semibold">{p.pontos}</td>
    </tr>
  )
}

function Simulador({ divMinha }: { divMinha: number }) {
  const [venceu, setVenceu] = useState<'v' | 'd'>('v')
  const [dif, setDif] = useState(2)
  const bonus = bonusDesnivel(dif)
  const total = (venceu === 'v' ? PONTOS_BASE : -PONTOS_BASE) + bonus
  return (
    <Painel aria-labelledby="rg-sim" className="flex flex-col gap-3.5 p-[22px]">
      <TituloPainel eyebrow={tx('SIMULADOR', 'SIMULATOR')} titulo={tx('Quanto ganhas ou perdes', 'How much you win or lose')} id="rg-sim" />
      <Segmentado rotulo={tx('Resultado da partida', 'Match result')} valor={venceu} onChange={setVenceu} opcoes={[{ valor: 'v', texto: tx('Vitória', 'Win') }, { valor: 'd', texto: tx('Derrota', 'Loss') }]} />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.03] p-3">
        <button type="button" aria-label={tx('Diminuir diferença de rank', 'Decrease rank difference')} onClick={() => setDif((d) => Math.max(-6, d - 1))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Minus size={16} aria-hidden /></button>
        <span className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-mono text-[18px] font-semibold">{dif > 0 ? `+${dif}` : dif} {Math.abs(dif) === 1 ? tx('divisão', 'division') : tx('divisões', 'divisions')}</span>
          <span className="text-[12px] text-mudo">{tx('adversários com média', 'opponents averaging')} {nomeDivisao(divMinha + dif)}</span>
        </span>
        <button type="button" aria-label={tx('Aumentar diferença de rank', 'Increase rank difference')} onClick={() => setDif((d) => Math.min(6, d + 1))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Plus size={16} aria-hidden /></button>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-suave">{venceu === 'v' ? `+${PONTOS_BASE}` : `-${PONTOS_BASE}`} {tx('de base', 'base')}, {comSinal(bonus)} {tx('pelo rank', 'from rank')}</span>
        <span className={`font-mono text-[34px] font-semibold ${total > 0 ? 'text-vitoria' : 'text-derrota'}`}>{comSinal(total)}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-normal text-mudo">{tx(`Cada divisão de diferença vale ${POR_DIVISAO} pontos, entre ${BONUS_MIN} e +${BONUS_MAX}.`, `Each division of difference is worth ${POR_DIVISAO} points, between ${BONUS_MIN} and +${BONUS_MAX}.`)}</p>
    </Painel>
  )
}

/** Ranking do Rangify Score: quem tem a melhor média de RS (com partidas suficientes). */
function RankingRs({ eu }: { eu?: string }) {
  const r = useCarregar(() => dados.rankingRs(50), [], ['partida', 'staff'], { minimo: 300 })
  const v = r.valor
  const meu = v?.eu
  const faltam = v && meu ? Math.max(0, v.minimo - meu.partidas) : v?.minimo ?? 0
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Painel aria-labelledby="rg-rs" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3 p-[22px]">
        <TituloPainel eyebrow={tx('DESEMPENHO', 'PERFORMANCE')} titulo={tx('Tabela do Rangify Score', 'Rangify Score leaderboard')} id="rg-rs" />
        <p className="m-0 text-[13px] text-mudo">{tx(`A média do RS de cada um: ACS, KDA, KAST e trades comparados com a média de cada partida (100 é a média). Entra quem tem pelo menos ${v?.minimo ?? 3} partidas com RS.`, `Each player's average RS: ACS, KDA, KAST and trades compared with each match's average (100 is average). Players with at least ${v?.minimo ?? 3} matches with RS are listed.`)}</p>
        {r.carregando ? <LinhasEsqueleto tipo="ranking" n={8} /> : v?.linhas.length ? (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="rotulo text-left">
                  <th scope="col" className="py-2 pl-3 font-normal">#</th>
                  <th scope="col" className="py-2 font-normal">{tx('Jogador', 'Player')}</th>
                  <th scope="col" className="hidden px-2 font-normal sm:table-cell">{tx('Média da partida = 100', 'Match average = 100')}</th>
                  <th scope="col" className="px-2 text-right font-normal">{tx('Partidas', 'Matches')}</th>
                  <th scope="col" className="hidden px-2 text-right font-normal sm:table-cell">{tx('Melhor', 'Best')}</th>
                  <th scope="col" className="pr-3 text-right font-normal">RS</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {v.linhas.map((l) => {
                  const p = l.perfil
                  const sou = p.id === eu
                  return (
                    <tr key={p.id} className={sou ? 'bg-laranja/[0.06]' : ''}>
                      <td className={`py-2.5 pl-3 font-mono text-[13px] ${l.posicao <= 3 ? 'font-bold text-laranja' : 'text-mudo'}`}>{l.posicao}</td>
                      <td className="py-2.5">
                        <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline">
                          <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={30} destaque={sou} />
                          <span className="truncate text-[14px] font-semibold">{nomeJogador(p)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(p)}</span></span>
                        </Link>
                      </td>
                      <td className="hidden w-[28%] px-2 sm:table-cell">
                        {/* A barra vai de 50 a 150: o traço a meio é a média da partida. */}
                        <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/7">
                          <span className="block h-full rounded-full bg-laranja" style={{ width: `${Math.max(0, Math.min(100, l.media - 50))}%` }} />
                          <span aria-hidden className="absolute top-0 left-1/2 h-full w-px bg-white/40" />
                        </span>
                      </td>
                      <td className="px-2 text-right font-mono text-[13px] text-suave">{l.partidas}</td>
                      <td className="hidden px-2 text-right font-mono text-[13px] text-suave sm:table-cell">{l.melhor}</td>
                      <td className="pr-3 text-right"><span className={`inline-grid min-w-12 place-items-center rounded-[9px] border px-2 py-1 font-mono text-[13px] font-bold ${l.media >= 100 ? 'border-laranja/40 bg-laranja/10 text-pessego' : 'border-white/10 bg-white/[0.04] text-suave'}`}>{Math.round(l.media)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Vazio icone={<Trophy size={22} />} titulo={tx('Ainda ninguém entrou', 'Nobody is in yet')} texto={tx(`A tabela aparece quando alguém tiver ${v?.minimo ?? 3} partidas confirmadas com estatísticas.`, `The leaderboard shows up once someone has ${v?.minimo ?? 3} confirmed matches with stats.`)} />}
      </Painel>
      {v && (
        <Painel aria-labelledby="rg-meu-rs" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]">
          <span id="rg-meu-rs" className="eyebrow">{tx('O TEU RANGIFY SCORE', 'YOUR RANGIFY SCORE')}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.04em] text-laranja">{meu ? Math.round(meu.media) : '-'}</span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{meu?.posicao ? `#${meu.posicao}` : tx('Fora da tabela', 'Not listed yet')}</span>
              <span className="font-mono text-[12px] text-suave">{meu ? tx(`${meu.partidas} ${meu.partidas === 1 ? 'partida' : 'partidas'} · melhor ${meu.melhor}`, `${meu.partidas} ${meu.partidas === 1 ? 'match' : 'matches'} · best ${meu.melhor}`) : tx('Sem partidas com RS', 'No matches with RS')}</span>
            </span>
          </div>
          {faltam > 0 && <p className="m-0 text-[13px] text-mudo">{tx(`Faltam ${faltam} ${faltam === 1 ? 'partida' : 'partidas'} para entrares na tabela.`, `${faltam} more ${faltam === 1 ? 'match' : 'matches'} to get on the leaderboard.`)}</p>}
          <BotaoAjuda topico="ranking">{tx('Como se calcula o RS', 'How RS is calculated')}</BotaoAjuda>
        </Painel>
      )}
    </div>
  )
}

/** Ranking de nível: quem tem mais XP do Rangify Experience. */
function RankingNivel({ eu }: { eu?: string }) {
  const lista = useCarregar(() => dados.rankingNivel(50), [], ['partida', 'staff'], { minimo: 300 })
  const minha = useCarregar(() => dados.experiencia(), [], ['partida', 'staff'])
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Painel aria-labelledby="rg-nivel" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3 p-[22px]">
        <TituloPainel eyebrow="RANGIFY EXPERIENCE" titulo={tx('Tabela de nível', 'Level leaderboard')} id="rg-nivel" />
        <p className="m-0 text-[13px] text-mudo">{tx('Ordenada pelo XP das missões completas. Em caso de empate, ganha quem tem mais pontos.', 'Sorted by XP from completed missions. Ties go to whoever has more points.')}</p>
        {lista.carregando ? <LinhasEsqueleto tipo="ranking" n={8} /> : lista.valor?.length ? (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="rotulo text-left">
                  <th scope="col" className="py-2 pl-3 font-normal">#</th>
                  <th scope="col" className="py-2 font-normal">{tx('Jogador', 'Player')}</th>
                  <th scope="col" className="hidden px-2 font-normal sm:table-cell">{tx('Progresso', 'Progress')}</th>
                  <th scope="col" className="px-2 text-right font-normal">XP</th>
                  <th scope="col" className="pr-3 text-right font-normal">{tx('Nível', 'Level')}</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {lista.valor.map((l) => {
                  const p = l.perfil
                  const sou = p.id === eu
                  return (
                    <tr key={p.id} className={sou ? 'bg-laranja/[0.06]' : ''}>
                      <td className={`py-2.5 pl-3 font-mono text-[13px] ${l.posicao <= 3 ? 'font-bold text-laranja' : 'text-mudo'}`}>{l.posicao}</td>
                      <td className="py-2.5">
                        <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline">
                          <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={30} destaque={sou} />
                          <span className="truncate text-[14px] font-semibold">{nomeJogador(p)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(p)}</span></span>
                        </Link>
                      </td>
                      <td className="hidden w-[30%] px-2 sm:table-cell">
                        <span className="block h-1.5 overflow-hidden rounded-full bg-white/7"><span className="block h-full rounded-full bg-laranja" style={{ width: `${Math.round((l.xpNoNivel / l.xpParaProximo) * 100)}%` }} /></span>
                      </td>
                      <td className="px-2 text-right font-mono text-[13px] text-suave">{formatarXp(l.xp)}</td>
                      <td className="pr-3 text-right"><span className="inline-grid min-w-9 place-items-center rounded-[9px] border border-laranja/40 bg-laranja/10 px-2 py-1 font-mono text-[13px] font-bold text-pessego">{l.nivel}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <Vazio icone={<Trophy size={22} />} titulo={tx('Ainda ninguém tem XP', 'Nobody has XP yet')} texto={tx('Completa missões para apareceres aqui.', 'Complete missions to show up here.')} />}
      </Painel>
      {minha.valor && (
        <Painel aria-labelledby="rg-meu-nivel" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]">
          <span id="rg-meu-nivel" className="eyebrow">{tx('O TEU NÍVEL', 'YOUR LEVEL')}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.04em] text-laranja">#{minha.valor.posicao}</span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{tx('Nível', 'Level')} {minha.valor.nivel}</span>
              <span className="font-mono text-[12px] text-suave">{formatarXp(minha.valor.xp)} XP · {minha.valor.total} {tx('jogadores', 'players')}</span>
            </span>
          </div>
          <Link to="/missoes" className="text-[13px] font-semibold text-pessego no-underline hover:text-pessego-claro">{tx('Ver as missões', 'View missions')} ›</Link>
        </Painel>
      )}
    </div>
  )
}

export function Ranking() {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tipo')
  const tipo = pedido === 'nivel' || pedido === 'rs' ? pedido : 'pontos'
  const mudarTipo = (t: 'pontos' | 'nivel' | 'rs') => setParams(t === 'pontos' ? {} : { tipo: t }, { replace: true })
  const { perfil } = useSessao()
  const acao = useAcao()
  const { sincronizar, aSincronizar } = useSincronizarRank()
  const [ambito, setAmbito] = useState<'global' | 'amigos'>('global')
  const [pesquisa, setPesquisa] = useState('')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<LinhaRanking[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [mais, setMais] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setQ(pesquisa), 250)
    return () => window.clearTimeout(t)
  }, [pesquisa])

  const pagina = useCarregar(() => dados.ranking({ soAmigos: ambito === 'amigos', pesquisa: q, limite: 50 }), [ambito, q], ['partida', 'amigos'], { minimo: 450 })
  useEffect(() => {
    if (pagina.valor) { setLinhas(pagina.valor.linhas); setCursor(pagina.valor.cursor) }
  }, [pagina.valor])
  const minhaPos = useCarregar(() => dados.posicao(perfil?.id ?? ''), [perfil?.id, perfil?.pontos])

  const carregarMais = async () => {
    setMais(true)
    const r = await acao(() => dados.ranking({ cursor, soAmigos: ambito === 'amigos', pesquisa: q, limite: 50 }))
    if (r) { setLinhas((l) => [...l, ...r.linhas]); setCursor(r.cursor) }
    setMais(false)
  }

  const total = pagina.valor?.total ?? 0
  // Sem pesquisa, os três primeiros sobem para o pódio e a tabela começa no 4.º.
  const comPodio = !q && linhas.length >= 3 && !pagina.carregando
  const tabela = comPodio ? linhas.slice(3) : linhas
  const jogos = (perfil?.vitorias ?? 0) + (perfil?.derrotas ?? 0)

  return (
    <>
      <Cabecalho
        migalhas={['Hub', tx('Tabela', 'Leaderboard')]}
        titulo={tx('Tabela da temporada', 'Season leaderboard')}
        descricao={tipo === 'nivel'
          ? tx('Quem subiu mais no passe da temporada com o XP das missões.', 'Who has climbed the season pass furthest with mission XP.')
          : tipo === 'rs'
          ? tx('Quem joga melhor, em média, segundo o Rangify Score de cada partida.', 'Who plays best on average, by the Rangify Score of each match.')
          : tx('Ordenada pelos pontos do hub. Toda a gente começa com 1000; o rank oficial é usado para atribuir os pontos de cada vitória e derrota.', 'Sorted by hub points. Everyone starts at 1000; the official rank is used to award the points for each win and loss.')}
        acoes={
          <>
            <Segmentado rotulo={tx('Tipo de tabela', 'Leaderboard type')} valor={tipo} onChange={mudarTipo} opcoes={[{ valor: 'pontos', texto: tx('Pontos', 'Points') }, { valor: 'nivel', texto: tx('Nível', 'Level') }, { valor: 'rs', texto: 'Rangify Score' }]} />
            <BotaoAjuda topico="ranking">{tx('Como funciona a tabela', 'How the leaderboard works')}</BotaoAjuda>
          </>
        }
      />

      {tipo === 'rs' ? <RankingRs eu={perfil?.id} /> : tipo === 'nivel' ? <RankingNivel eu={perfil?.id} /> : <>

      {pagina.carregando && !q ? <PodioEsqueleto /> : comPodio && <Podio top={linhas.slice(0, 3)} eu={perfil?.id} />}

      <div className="flex flex-wrap items-start gap-4">
        <Painel aria-labelledby="rg-tabela" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3 p-[22px]">
          <TituloPainel
            eyebrow={`${total} ${tx('JOGADORES', 'PLAYERS')}`}
            titulo={tx('Classificação', 'Standings')}
            id="rg-tabela"
            direita={<Segmentado rotulo={tx('Filtrar tabela', 'Filter leaderboard')} valor={ambito} onChange={setAmbito} opcoes={[{ valor: 'global', texto: 'Global' }, { valor: 'amigos', texto: tx('Só amigos', 'Friends only') }]} />}
          />
          <label className="relative block">
            <span className="so-leitores">{tx('Procurar jogador', 'Search player')}</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
            <input className="campo !pl-10" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder={tx('Procurar por Riot ID', 'Search by Riot ID')} />
          </label>
          {pagina.carregando ? <LinhasEsqueleto tipo="ranking" n={8} /> : tabela.length ? (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="rotulo text-left">
                    <th scope="col" className="py-2 pl-3 font-normal">#</th>
                    <th scope="col" className="py-2 font-normal">{tx('Jogador', 'Player')}</th>
                    <th scope="col" className="hidden px-2 font-normal md:table-cell">{tx('Rank oficial', 'Official rank')}</th>
                    <th scope="col" className="hidden px-2 font-normal sm:table-cell">{tx('Forma', 'Form')}</th>
                    <th scope="col" className="hidden px-2 text-right font-normal lg:table-cell">{tx('V-D', 'W-L')}</th>
                    <th scope="col" className="hidden px-2 text-right font-normal lg:table-cell">{tx('Vit.', 'Win%')}</th>
                    <th scope="col" className="pr-3 text-right font-normal">{tx('Pontos', 'Points')}</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                  {tabela.map((l, i) => <Linha key={l.perfil.id} l={l} i={i} eu={l.perfil.id === perfil?.id} />)}
                </tbody>
              </table>
            </div>
          ) : comPodio ? (
            <p className="m-0 py-6 text-center text-[13.5px] text-mudo">{tx('Só há três jogadores nesta lista, e estão todos no pódio.', 'There are only three players on this list, all on the podium.')}</p>
          ) : (
            <Vazio icone={<Trophy size={22} />} titulo={ambito === 'amigos' ? tx('Ainda sem amigos na tabela', 'No friends on the leaderboard yet') : tx('Ninguém com esse nome', 'Nobody with that name')} texto={ambito === 'amigos' ? tx('Adiciona amigos para comparares os pontos.', 'Add friends to compare points.') : tx('Experimenta outro Riot ID.', 'Try another Riot ID.')} />
          )}
          {cursor && (
            <button type="button" className="btn btn-fantasma self-center" disabled={mais} onClick={carregarMais}>{mais ? tx('A carregar…', 'Loading…') : tx('Carregar mais 50', 'Load 50 more')}</button>
          )}
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {perfil && (
            <Painel aria-labelledby="rg-eu" className="flex flex-col gap-3 p-[22px]">
              <span id="rg-eu" className="eyebrow">{tx('A TUA POSIÇÃO', 'YOUR POSITION')}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.04em] text-laranja">#{minhaPos.valor ?? '-'}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold">{nomeJogador(perfil)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(perfil)}</span></span>
                  <span className="font-mono text-[12px] text-suave">{perfil.pontos} pts · {perfil.vitorias}-{perfil.derrotas} · {jogos ? Math.round((perfil.vitorias / jogos) * 100) : 0}%</span>
                </span>
              </div>
            </Painel>
          )}
          {perfil && <Simulador divMinha={divisao(perfil.tier)} />}
          {perfil && (
            <Painel aria-labelledby="rg-oficial" className="flex flex-col gap-3 p-[22px]">
              <TituloPainel eyebrow={tx('RANK OFICIAL', 'OFFICIAL RANK')} titulo={tx('Vem da Riot e fica guardado', 'From Riot, and cached')} id="rg-oficial" />
              <div className="flex items-center justify-between gap-2"><RankBadge tier={perfil.tier} rr={perfil.rr} /><span className="text-[12px] text-mudo">{haQuanto(perfil.rankAtualizadoEm)}</span></div>
              <p className="m-0 text-[13px] leading-normal text-suave">{tx(`Lido pela Henrik Dev API. Atualiza no máximo a cada ${HORAS_CACHE_RANK} horas.`, `Read by the Henrik Dev API. Updates at most every ${HORAS_CACHE_RANK} hours.`)}</p>
              <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={15} className="text-laranja" aria-hidden />{tx('Sincronizar agora', 'Sync now')}</button>
            </Painel>
          )}
        </div>
      </div>
      </>}
    </>
  )
}
