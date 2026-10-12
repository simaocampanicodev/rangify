import { Minus, Plus, RefreshCw, Search, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, BotaoAjuda, Cabecalho, Esqueleto, LinhasEsqueleto, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados, type LinhaRanking } from '@/lib/dados'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'
import { BONUS_MAX, BONUS_MIN, PONTOS_BASE, POR_DIVISAO, bonusDesnivel, comSinal } from '@/lib/pontos'
import { divisao, nomeDivisao } from '@/lib/ranks'
import { HORAS_CACHE_RANK } from '@/lib/regras'
import { haQuanto } from '@/lib/tempo'

function Forma({ f }: { f: ('V' | 'D')[] }) {
  const texto = f.map((x) => (x === 'V' ? 'vitória' : 'derrota')).join(', ')
  return (
    <span role="img" aria-label={f.length ? `Últimas ${f.length}: ${texto}` : 'Sem partidas'} className="flex gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const x = f[f.length - 5 + i]
        return <span key={i} className="size-2 rounded-full" style={{ background: x === 'V' ? '#5fe3d6' : x === 'D' ? '#ff7d8f' : 'rgba(255,255,255,0.1)' }} />
      })}
    </span>
  )
}

const LUGARES = [
  { rotulo: '1.º LUGAR', cor: '#ff5b1f', halo: 'rgba(255,91,31,0.26)', borda: 'rgba(255,91,31,0.55)' },
  { rotulo: '2.º LUGAR', cor: '#ff9466', halo: 'rgba(255,148,102,0.16)', borda: 'rgba(255,148,102,0.3)' },
  { rotulo: '3.º LUGAR', cor: '#ffb592', halo: 'rgba(255,181,146,0.12)', borda: 'rgba(255,181,146,0.22)' },
]

/** Os três primeiros em grande, por cima da tabela (o 1.º ao meio e mais alto). */
function Podio({ top, eu }: { top: LinhaRanking[]; eu?: string }) {
  const ordem = [top[1], top[0], top[2]]
  return (
    <section aria-label="Pódio da temporada" className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      {ordem.map((l, k) => {
        const i = l.posicao - 1
        const lugar = LUGARES[Math.min(2, i)]
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
            <span className="truncate text-[14px] font-semibold">{nomeJogador(p)}{eu && <span className="ml-1.5 rounded bg-laranja px-1.5 py-px font-mono text-[9.5px] font-bold text-escuro-laranja">TU</span>}</span>
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
      <TituloPainel eyebrow="SIMULADOR" titulo="Quanto ganhas ou perdes" id="rg-sim" />
      <Segmentado rotulo="Resultado da partida" valor={venceu} onChange={setVenceu} opcoes={[{ valor: 'v', texto: 'Vitória' }, { valor: 'd', texto: 'Derrota' }]} />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.03] p-3">
        <button type="button" aria-label="Diminuir diferença de rank" onClick={() => setDif((d) => Math.max(-6, d - 1))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Minus size={16} aria-hidden /></button>
        <span className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-mono text-[18px] font-semibold">{dif > 0 ? `+${dif}` : dif} {Math.abs(dif) === 1 ? 'divisão' : 'divisões'}</span>
          <span className="text-[12px] text-mudo">adversários com média {nomeDivisao(divMinha + dif)}</span>
        </span>
        <button type="button" aria-label="Aumentar diferença de rank" onClick={() => setDif((d) => Math.min(6, d + 1))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Plus size={16} aria-hidden /></button>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-suave">{venceu === 'v' ? `+${PONTOS_BASE}` : `-${PONTOS_BASE}`} de base, {comSinal(bonus)} de desnível</span>
        <span className={`font-mono text-[34px] font-semibold ${total > 0 ? 'text-vitoria' : 'text-derrota'}`}>{comSinal(total)}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-normal text-mudo">Cada divisão de diferença vale {POR_DIVISAO} pontos, entre {BONUS_MIN} e +{BONUS_MAX}.</p>
    </Painel>
  )
}

export function Ranking() {
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
        migalhas={['Hub', 'Ranking']}
        titulo="Ranking da temporada"
        descricao={<>Ordenado pelos pontos do hub. Toda a gente começa com 1000; o rank oficial só ajusta quanto vale cada vitória e cada derrota.</>}
        acoes={<BotaoAjuda topico="ranking">Como funciona o ranking</BotaoAjuda>}
      />

      {pagina.carregando && !q ? <PodioEsqueleto /> : comPodio && <Podio top={linhas.slice(0, 3)} eu={perfil?.id} />}

      <div className="flex flex-wrap items-start gap-4">
        <Painel aria-labelledby="rg-tabela" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3 p-[22px]">
          <TituloPainel
            eyebrow={`${total} JOGADORES`}
            titulo="Tabela de classificação"
            id="rg-tabela"
            direita={<Segmentado rotulo="Filtrar ranking" valor={ambito} onChange={setAmbito} opcoes={[{ valor: 'global', texto: 'Global' }, { valor: 'amigos', texto: 'Só amigos' }]} />}
          />
          <label className="relative block">
            <span className="so-leitores">Procurar jogador</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
            <input className="campo !pl-10" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder="Procurar por Riot ID" />
          </label>
          {pagina.carregando ? <LinhasEsqueleto tipo="ranking" n={8} /> : tabela.length ? (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="rotulo text-left">
                    <th scope="col" className="py-2 pl-3 font-normal">#</th>
                    <th scope="col" className="py-2 font-normal">Jogador</th>
                    <th scope="col" className="hidden px-2 font-normal md:table-cell">Rank oficial</th>
                    <th scope="col" className="hidden px-2 font-normal sm:table-cell">Forma</th>
                    <th scope="col" className="hidden px-2 text-right font-normal lg:table-cell">V-D</th>
                    <th scope="col" className="hidden px-2 text-right font-normal lg:table-cell">Vit.</th>
                    <th scope="col" className="pr-3 text-right font-normal">Pontos</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                  {tabela.map((l, i) => <Linha key={l.perfil.id} l={l} i={i} eu={l.perfil.id === perfil?.id} />)}
                </tbody>
              </table>
            </div>
          ) : comPodio ? (
            <p className="m-0 py-6 text-center text-[13.5px] text-mudo">Só há três jogadores nesta lista, e estão todos no pódio.</p>
          ) : (
            <Vazio icone={<Trophy size={22} />} titulo={ambito === 'amigos' ? 'Ainda sem amigos no ranking' : 'Ninguém com esse nome'} texto={ambito === 'amigos' ? 'Adiciona amigos para comparares os pontos.' : 'Experimenta outro Riot ID.'} />
          )}
          {cursor && (
            <button type="button" className="btn btn-fantasma self-center" disabled={mais} onClick={carregarMais}>{mais ? 'A carregar…' : 'Carregar mais 50'}</button>
          )}
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {perfil && (
            <Painel aria-labelledby="rg-eu" className="flex flex-col gap-3 p-[22px]">
              <span id="rg-eu" className="eyebrow">A TUA POSIÇÃO</span>
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
              <TituloPainel eyebrow="RANK OFICIAL" titulo="Vem da Riot e fica guardado" id="rg-oficial" />
              <div className="flex items-center justify-between gap-2"><RankBadge tier={perfil.tier} rr={perfil.rr} /><span className="text-[12px] text-mudo">{haQuanto(perfil.rankAtualizadoEm)}</span></div>
              <p className="m-0 text-[13px] leading-normal text-suave">Lido pela Henrik Dev API. Atualiza no máximo a cada {HORAS_CACHE_RANK} horas.</p>
              <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={15} className="text-laranja" aria-hidden />Sincronizar agora</button>
            </Painel>
          )}
        </div>
      </div>
    </>
  )
}
