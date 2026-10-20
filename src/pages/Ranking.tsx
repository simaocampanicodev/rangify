import { Minus, Plus, RefreshCw, Search, Trophy } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmDireto } from '@/components/AoVivo'
import { TabelaAgentes } from '@/components/TabelaAgentes'
import { ExtraLinha, useClassesCosmeticos } from '@/components/Cosmeticos'
import { nomeTabela } from '@/components/Fila'
import { Avatar, BotaoAjuda, Cabecalho, Esqueleto, LinhasEsqueleto, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useFilaVista } from '@/hooks/useFilaVista'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados, type FilaTipo, type LinhaRanking, type Perfil } from '@/lib/data'
import { formatarXp } from '@/lib/experiencia'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'
import { DESEMPENHO_MAX, PONTOS_BASE, RESULTADO_MAX, RESULTADO_MIN, RS_POR_PONTO, bonusDesempenho, comSinal, margemRondas } from '@/lib/pontos'
import { TIER_MINIMO_RANKED } from '@/lib/ranks'
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

/** O que o pódio mostra de cada um: o valor da tabela em grande e um resumo ao lado. */
interface ItemPodio { posicao: number; perfil: Perfil; valor: ReactNode; unidade: string; resumo: string }

/** Os três primeiros em grande, por cima da tabela (o 1.º ao meio e mais alto). */
function Podio({ top, eu }: { top: ItemPodio[]; eu?: string }) {
  const ordem = [top[1], top[0], top[2]]
  return (
    <section aria-label={tx('Pódio da temporada', 'Season podium')} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
      {ordem.map((l, k) => {
        const i = l.posicao - 1
        const lugar = lugares()[Math.min(2, i)]
        const p = l.perfil
        const primeiro = l.posicao === 1
        return (
          <div key={p.id} className={`relative flex flex-col ${primeiro ? 'sm:-mt-4' : ''} ${k === 1 ? 'order-first sm:order-none' : ''}`}>
          <Link
            to={caminhoPerfil(p.riotId)}
            className={`painel cartao-hover entra-linha relative flex flex-1 flex-col gap-3.5 overflow-hidden p-5 text-texto no-underline ${primeiro ? 'cantos sm:pb-7' : ''}`}
            style={{ borderColor: lugar.borda, boxShadow: primeiro ? '0 24px 70px -30px rgba(255,91,31,0.7)' : undefined, '--i': k } as React.CSSProperties}
          >
            <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-60 rounded-full" style={{ background: `radial-gradient(circle, ${lugar.halo} 0%, rgba(0,0,0,0) 65%)` }} />
            <span aria-hidden className="absolute top-2 right-4 font-mono text-[60px] leading-none font-bold tracking-[-0.06em]" style={{ color: lugar.cor, opacity: 0.22 }}>{String(l.posicao).padStart(2, '0')}</span>
            <span className="relative font-mono text-[11px] font-semibold tracking-[0.16em]" style={{ color: lugar.cor }}>{lugar.rotulo}</span>
            <span className="relative flex items-center gap-3">
              <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={primeiro ? 60 : 50} destaque={primeiro || p.id === eu} perfilId={p.id} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{nomeJogador(p)}<span className="font-mono text-[12px] font-medium text-mudo">{tagJogador(p)}</span></span>
                <RankBadge tier={p.tier} pequeno />
              </span>
            </span>
            <span className="relative flex items-baseline justify-between gap-2.5 border-t border-white/7 pt-3">
              <span className="flex items-baseline gap-1.5"><span className={`font-mono font-semibold tracking-[-0.04em] ${primeiro ? 'text-[36px]' : 'text-[30px]'}`}>{l.valor}</span><span className="text-[12px] text-mudo">{l.unidade}</span></span>
              <span className="font-mono text-[12px] text-suave">{l.resumo}</span>
            </span>
          </Link>
          {/* Fora da ligação do cartão: um botão dentro de outro não se pode. */}
          <span className="absolute top-[11px] left-[118px] z-10"><EmDireto perfilId={p.id} compacto /></span>
          </div>
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

/** As duas primeiras células de qualquer tabela (posição e jogador); as outras vêm em children. */
function LinhaBase({ posicao: pos, perfil: p, eu, i, children }: { posicao: number; perfil: Perfil; eu: boolean; i: number; children: ReactNode }) {
  const cz = useClassesCosmeticos(p.id)
  return (
    <tr className={`linha-hover entra-linha cz-item ${eu ? 'bg-laranja/8 cz-sempre' : ''} ${cz.linha}`} style={{ '--i': i } as React.CSSProperties}>
      <td className="w-12 py-2.5 pl-3 font-mono text-[14px] font-semibold">
        <span className={pos <= 3 || eu ? 'text-laranja' : 'text-suave'}>#{pos}</span>
      </td>
      <td className="py-2.5 pr-2">
       <div className="flex min-w-0 items-center gap-2">
        <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline hover:text-pessego">
          <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={32} destaque={eu} perfilId={p.id} />
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[14px] font-semibold"><span className="cz-nome truncate">{nomeJogador(p)}</span><ExtraLinha />{eu && <span className="rounded bg-laranja px-1.5 py-px font-mono text-[9.5px] font-bold text-escuro-laranja">{tx('TU', 'YOU')}</span>}</span>
            <span className="font-mono text-[11px] text-mudo">{tagJogador(p)}</span>
          </span>
        </Link>
        <EmDireto perfilId={p.id} compacto />
       </div>
      </td>
      {children}
    </tr>
  )
}

function Linha({ l, eu, i }: { l: LinhaRanking; eu: boolean; i: number }) {
  const p = l.perfil
  const jogos = p.vitorias + p.derrotas
  return (
    <LinhaBase posicao={l.posicao} perfil={p} eu={eu} i={i}>
      <td className="hidden px-2 md:table-cell"><RankBadge tier={p.tier} pequeno /></td>
      <td className="hidden px-2 sm:table-cell"><Forma f={l.forma} /></td>
      <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{p.vitorias}-{p.derrotas}</td>
      <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{jogos ? `${Math.round((p.vitorias / jogos) * 100)}%` : '-'}</td>
      <td className="pr-3 pl-2 text-right font-mono text-[15px] font-semibold">{p.pontos}</td>
    </LinhaBase>
  )
}

type Ambito = 'global' | 'amigos'
interface Coluna { texto: string; classe: string }

/**
 * Quantas linhas cabem até ao fundo da coluna da direita (A tua posição, Simulador,
 * Rank oficial), para a tabela acabar alinhada com ela. Com a coluna por baixo
 * (telemóvel), ficam 10. Devolve também a altura dessa coluna.
 */
function useLinhasQueCabem(marca: React.RefObject<HTMLSpanElement | null>, corpo: React.RefObject<HTMLTableSectionElement | null>, pronto: boolean) {
  const [r, setR] = useState<{ cabem: number; altura: number | null }>({ cabem: 10, altura: null })
  useLayoutEffect(() => {
    const painel = marca.current?.parentElement
    const lado = painel?.nextElementSibling as HTMLElement | null | undefined
    if (!painel || !lado) return
    const medir = () => {
      const p = painel.getBoundingClientRect()
      const c = lado.getBoundingClientRect()
      // Se a coluna caiu para baixo da tabela, não há nada com que alinhar.
      if (Math.abs(c.top - p.top) > 4) { setR({ cabem: 10, altura: null }); return }
      const primeira = corpo.current?.rows[0]
      if (!primeira) { setR((x) => ({ ...x, altura: c.height })); return }
      const linha = primeira.getBoundingClientRect()
      // Por baixo das linhas fica o botão "Mostrar mais" (56 px) e o espaço do painel (22 px).
      const cabem = Math.max(5, Math.floor((c.height - (linha.top - p.top) - 78) / (linha.height || 52)))
      setR({ cabem, altura: c.height })
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(lado)
    return () => ro.disconnect()
  }, [marca, corpo, pronto])
  return r
}

/** O painel "Classificação" igual nas três tabelas: filtro, pesquisa e a tabela. */
function PainelClassificacao({ total, etiqueta, ambito, setAmbito, pesquisa, setPesquisa, carregando, colunas, linhas, comPodio, vazio, rodape }: {
  total: number; etiqueta?: string; ambito: Ambito; setAmbito: (a: Ambito) => void; pesquisa: string; setPesquisa: (v: string) => void
  carregando: boolean; colunas: Coluna[]; linhas: ReactNode[]; comPodio: boolean; vazio: ReactNode; rodape?: ReactNode
}) {
  const marca = useRef<HTMLSpanElement>(null)
  const corpo = useRef<HTMLTableSectionElement>(null)
  const [aberto, setAberto] = useState(false)
  const { cabem, altura } = useLinhasQueCabem(marca, corpo, !carregando && linhas.length > 0)
  const cortar = !aberto && linhas.length > cabem
  const vistas = cortar ? linhas.slice(0, cabem) : linhas
  return (
    <Painel aria-labelledby="rg-tabela" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3 p-[22px]" style={!aberto && altura ? { minHeight: altura } : undefined}>
      <span ref={marca} hidden />
      <TituloPainel
        eyebrow={`${total} ${tx('JOGADORES', 'PLAYERS')}${etiqueta ? ` · ${etiqueta}` : ''}`}
        titulo={tx('Classificação', 'Standings')}
        id="rg-tabela"
        direita={<Segmentado rotulo={tx('Filtrar tabela', 'Filter leaderboard')} valor={ambito} onChange={setAmbito} opcoes={[{ valor: 'global', texto: 'Global' }, { valor: 'amigos', texto: tx('Só amigos', 'Friends only') }]} />}
      />
      <label className="relative block">
        <span className="so-leitores">{tx('Procurar jogador', 'Search player')}</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
        <input className="campo !pl-10" value={pesquisa} onChange={(e) => setPesquisa(e.target.value)} placeholder={tx('Procurar por Riot ID', 'Search by Riot ID')} />
      </label>
      {carregando ? <LinhasEsqueleto tipo="ranking" n={8} /> : linhas.length ? (
        <div className="-mx-2 overflow-x-auto">
          <table className="cz-calmo w-full border-collapse">
            <thead>
              <tr className="rotulo text-left">
                <th scope="col" className="py-2 pl-3 font-normal">#</th>
                <th scope="col" className="py-2 font-normal">{tx('Jogador', 'Player')}</th>
                {colunas.map((c) => <th key={c.texto} scope="col" className={`font-normal ${c.classe}`}>{c.texto}</th>)}
              </tr>
            </thead>
            <tbody ref={corpo} className="[&>tr]:border-t [&>tr]:border-white/6">{vistas}</tbody>
          </table>
        </div>
      ) : comPodio ? (
        <p className="m-0 py-6 text-center text-[13.5px] text-mudo">{tx('Só há três jogadores nesta lista, e estão todos no pódio.', 'There are only three players on this list, all on the podium.')}</p>
      ) : vazio}
      {cortar ? (
        <button type="button" className="btn btn-fantasma mt-auto self-center" onClick={() => setAberto(true)}>{tx(`Mostrar mais (${linhas.length - cabem})`, `Show more (${linhas.length - cabem})`)}</button>
      ) : (
        <div className="mt-auto flex flex-wrap justify-center gap-2">
          {aberto && <button type="button" className="btn btn-fantasma" onClick={() => setAberto(false)}>{tx('Mostrar menos', 'Show less')}</button>}
          {rodape}
        </div>
      )}
    </Painel>
  )
}

/** "A tua posição", igual nas tabelas. `semJogos` e `bloqueada` vêm da tabela em causa (a ranked tem as suas). */
function CartaoPosicao({ posicao, perfil, resumo, semJogos: semJogosPedido, bloqueada = false }: {
  posicao: number | null | undefined; perfil: Perfil; resumo: string; semJogos?: boolean; bloqueada?: boolean
}) {
  // Só entra na tabela quem já jogou uma partida: até lá não há posição.
  const semJogos = semJogosPedido ?? perfil.vitorias + perfil.derrotas + perfil.vitoriasRanked + perfil.derrotasRanked === 0
  return (
    <Painel aria-labelledby="rg-eu" className="flex flex-col gap-3 p-[22px]">
      <span id="rg-eu" className="eyebrow">{tx('A TUA POSIÇÃO', 'YOUR POSITION')}</span>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-[40px] leading-none font-semibold tracking-[-0.04em] ${posicao ? 'text-laranja' : 'text-mudo'}`}>{posicao ? `#${posicao}` : '-'}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-bold">{nomeJogador(perfil)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(perfil)}</span></span>
          <span className="font-mono text-[12px] text-suave">{semJogos ? tx('Ainda sem partidas', 'No matches yet') : resumo}</span>
        </span>
      </div>
      {semJogos && (
        bloqueada
          ? <p className="m-0 text-[13px] leading-normal text-suave">{tx('A Tabela Ranked abre quando chegares a Ascendente 1. Até lá, os teus pontos ficam na Tabela Aberta.', 'The Ranked leaderboard opens when you reach Ascendant 1. Until then, your points stay on the Open leaderboard.')}</p>
          : (
            <>
              <p className="m-0 text-[13px] leading-normal text-suave">{tx('Ainda não estás na tabela: entras assim que acabares a tua primeira partida.', 'You are not on the leaderboard yet: you get in as soon as you finish your first match.')}</p>
              <Link to="/jogar" className="btn btn-primario no-underline">{tx('Ir jogar', 'Go play')}</Link>
            </>
          )
      )}
    </Painel>
  )
}

/** Global ou só amigos (contigo incluído) e a pesquisa por Riot ID, para as tabelas que vêm inteiras. */
function useFiltroTabela(eu?: string) {
  const [ambito, setAmbito] = useState<Ambito>('global')
  const [pesquisa, setPesquisa] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setQ(pesquisa.trim().toLowerCase()), 250)
    return () => window.clearTimeout(t)
  }, [pesquisa])
  const amigos = useCarregar(() => (ambito === 'amigos' ? dados.amigos() : Promise.resolve([])), [ambito], ['amigos'], { chave: ambito === 'amigos' ? 'amigos' : undefined })
  const ids = new Set([...(amigos.valor ?? []).filter((a) => a.estado === 'aceite').map((a) => a.perfil.id), eu ?? ''])
  const aceita = (p: Perfil) =>
    (ambito === 'global' || ids.has(p.id)) && (!q || `${nomeJogador(p)}${tagJogador(p)} ${p.riotId ?? ''} ${p.utilizador}`.toLowerCase().includes(q))
  return { ambito, setAmbito, pesquisa, setPesquisa, q, aceita, aCarregar: ambito === 'amigos' && amigos.carregando }
}

const vazioFiltro = (ambito: Ambito, geral: ReactNode) => ambito === 'amigos'
  ? <Vazio icone={<Trophy size={22} />} titulo={tx('Ainda sem amigos nesta tabela', 'No friends on this leaderboard yet')} texto={tx('Adiciona amigos para te comparares com eles.', 'Add friends to compare yourself with them.')} />
  : geral

/** Tabela do Rangify Score: quem tem a melhor média de RS. */
function RankingRs({ perfil }: { perfil: Perfil | null }) {
  const r = useCarregar(() => dados.rankingRs(100), [], ['partida', 'staff'], { minimo: 300, chave: 'ranking_rs' })
  const f = useFiltroTabela(perfil?.id)
  const todas = (r.valor?.linhas ?? []).filter((l) => f.aceita(l.perfil))
  const carregando = r.carregando || f.aCarregar
  const comPodio = !f.q && todas.length >= 3 && !carregando
  const tabela = comPodio ? todas.slice(3) : todas
  const meu = r.valor?.eu
  const de = (n: number) => (n === 1 ? tx('partida', 'match') : tx('partidas', 'matches'))
  return (
    <>
      {carregando && !f.q ? <PodioEsqueleto /> : comPodio && <Podio eu={perfil?.id} top={todas.slice(0, 3).map((l) => ({ posicao: l.posicao, perfil: l.perfil, valor: Math.round(l.media), unidade: 'RS', resumo: `${l.partidas} ${de(l.partidas)} · ${tx('melhor', 'best')} ${l.melhor}` }))} />}
      <div className="flex flex-wrap items-start gap-4">
        <PainelClassificacao
          total={r.valor?.linhas.length ?? 0} ambito={f.ambito} setAmbito={f.setAmbito} pesquisa={f.pesquisa} setPesquisa={f.setPesquisa}
          carregando={carregando} comPodio={comPodio}
          colunas={[
            { texto: tx('Rank oficial', 'Official rank'), classe: 'hidden px-2 md:table-cell' },
            { texto: tx('Média = 100', 'Average = 100'), classe: 'hidden px-2 sm:table-cell' },
            { texto: tx('Partidas', 'Matches'), classe: 'hidden px-2 text-right lg:table-cell' },
            { texto: tx('Melhor', 'Best'), classe: 'hidden px-2 text-right lg:table-cell' },
            { texto: 'RS', classe: 'pr-3 text-right' },
          ]}
          linhas={tabela.map((l, i) => (
            <LinhaBase key={l.perfil.id} posicao={l.posicao} perfil={l.perfil} eu={l.perfil.id === perfil?.id} i={i}>
              <td className="hidden px-2 md:table-cell"><RankBadge tier={l.perfil.tier} pequeno /></td>
              <td className="hidden w-[22%] px-2 sm:table-cell">
                {/* A barra vai de 50 a 150: o traço a meio é a média de uma partida. */}
                <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/7">
                  <span className="block h-full rounded-full bg-laranja" style={{ width: `${Math.max(0, Math.min(100, l.media - 50))}%` }} />
                  <span aria-hidden className="absolute top-0 left-1/2 h-full w-px bg-white/40" />
                </span>
              </td>
              <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{l.partidas}</td>
              <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{l.melhor}</td>
              <td className="pr-3 pl-2 text-right font-mono text-[15px] font-semibold">{Math.round(l.media)}</td>
            </LinhaBase>
          ))}
          vazio={vazioFiltro(f.ambito, f.q
            ? <Vazio icone={<Trophy size={22} />} titulo={tx('Ninguém com esse nome', 'Nobody with that name')} texto={tx('Experimenta outro Riot ID.', 'Try another Riot ID.')} />
            : r.erro
              ? <Vazio icone={<Trophy size={22} />} titulo={tx('Não foi possível carregar a tabela', 'Could not load the leaderboard')} texto={r.erro} />
              : <Vazio icone={<Trophy size={22} />} titulo={tx('Ainda sem Rangify Score', 'No Rangify Score yet')} texto={tx('A tabela enche-se com as partidas confirmadas com estatísticas da API.', 'The leaderboard fills up with matches confirmed with API stats.')} />)}
        />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {perfil && <CartaoPosicao posicao={meu?.posicao} perfil={perfil} resumo={meu ? `RS ${Math.round(meu.media)} · ${meu.partidas} ${de(meu.partidas)} · ${tx('melhor', 'best')} ${meu.melhor}` : tx('Sem partidas com RS', 'No matches with RS')} />}
          <Painel aria-labelledby="rg-rs-info" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow="RANGIFY SCORE" titulo={tx('Como se calcula', 'How it is calculated')} id="rg-rs-info" />
            <p className="m-0 text-[13px] leading-normal text-suave">{tx('Em cada partida, o teu ACS (35%), KDA (25%), KAST (25%) e trades (15%) são comparados com a média dos 10 jogadores. 100 é a média da partida.', 'In each match, your ACS (35%), KDA (25%), KAST (25%) and trades (15%) are compared with the average of the 10 players. 100 is the match average.')}</p>
            <p className="m-0 text-[13px] leading-normal text-mudo">{tx('A tabela ordena pela média de todas as tuas partidas. Cada partida também dá de -6 a +6 pontos pelo RS.', 'The leaderboard sorts by the average of all your matches. Each match also gives -6 to +6 points from RS.')}</p>
            <BotaoAjuda topico="ranking">{tx('Ver os pontos', 'See the points')}</BotaoAjuda>
          </Painel>
        </div>
      </div>
    </>
  )
}

/** Tabela de nível: quem tem mais XP do Rangify Experience. */
function RankingNivel({ perfil }: { perfil: Perfil | null }) {
  const lista = useCarregar(() => dados.rankingNivel(100), [], ['partida', 'staff'], { minimo: 300, chave: 'ranking_nivel' })
  const minha = useCarregar(() => dados.experiencia(), [], ['partida', 'staff'], { chave: 'experiencia' })
  const f = useFiltroTabela(perfil?.id)
  const todas = (lista.valor ?? []).filter((l) => f.aceita(l.perfil))
  const carregando = lista.carregando || f.aCarregar
  const comPodio = !f.q && todas.length >= 3 && !carregando
  const tabela = comPodio ? todas.slice(3) : todas
  return (
    <>
      {carregando && !f.q ? <PodioEsqueleto /> : comPodio && <Podio eu={perfil?.id} top={todas.slice(0, 3).map((l) => ({ posicao: l.posicao, perfil: l.perfil, valor: l.nivel, unidade: tx('nível', 'level'), resumo: `${formatarXp(l.xp)} XP` }))} />}
      <div className="flex flex-wrap items-start gap-4">
        <PainelClassificacao
          total={lista.valor?.length ?? 0} ambito={f.ambito} setAmbito={f.setAmbito} pesquisa={f.pesquisa} setPesquisa={f.setPesquisa}
          carregando={carregando} comPodio={comPodio}
          colunas={[
            { texto: tx('Rank oficial', 'Official rank'), classe: 'hidden px-2 md:table-cell' },
            { texto: tx('Progresso', 'Progress'), classe: 'hidden px-2 sm:table-cell' },
            { texto: 'XP', classe: 'hidden px-2 text-right lg:table-cell' },
            { texto: tx('Nível', 'Level'), classe: 'pr-3 text-right' },
          ]}
          linhas={tabela.map((l, i) => (
            <LinhaBase key={l.perfil.id} posicao={l.posicao} perfil={l.perfil} eu={l.perfil.id === perfil?.id} i={i}>
              <td className="hidden px-2 md:table-cell"><RankBadge tier={l.perfil.tier} pequeno /></td>
              <td className="hidden w-[22%] px-2 sm:table-cell">
                <span className="block h-1.5 overflow-hidden rounded-full bg-white/7"><span className="block h-full rounded-full bg-laranja" style={{ width: `${Math.round((l.xpNoNivel / l.xpParaProximo) * 100)}%` }} /></span>
              </td>
              <td className="hidden px-2 text-right font-mono text-[13px] text-suave lg:table-cell">{formatarXp(l.xp)}</td>
              <td className="pr-3 pl-2 text-right font-mono text-[15px] font-semibold">{l.nivel}</td>
            </LinhaBase>
          ))}
          vazio={vazioFiltro(f.ambito, f.q
            ? <Vazio icone={<Trophy size={22} />} titulo={tx('Ninguém com esse nome', 'Nobody with that name')} texto={tx('Experimenta outro Riot ID.', 'Try another Riot ID.')} />
            : <Vazio icone={<Trophy size={22} />} titulo={tx('Ainda ninguém na tabela', 'Nobody on the leaderboard yet')} texto={tx('Entra quem já jogou uma partida. Joga e completa missões para apareceres aqui.', 'Players who have finished a match get in. Play and complete missions to show up here.')} />)}
        />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {perfil && <CartaoPosicao posicao={minha.valor?.posicao} perfil={perfil} resumo={minha.valor ? `${tx('Nível', 'Level')} ${minha.valor.nivel} · ${formatarXp(minha.valor.xp)} XP` : '-'} />}
          <Painel aria-labelledby="rg-nivel-info" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow="RANGIFY EXPERIENCE" titulo={tx('Como se sobe de nível', 'How to level up')} id="rg-nivel-info" />
            <p className="m-0 text-[13px] leading-normal text-suave">{tx('Cada missão diária, semanal ou da temporada que completas dá XP. A tabela ordena pelo XP; em caso de empate, ganha quem tem mais pontos.', 'Every daily, weekly or season mission you complete gives XP. The leaderboard sorts by XP; ties go to whoever has more points.')}</p>
            <Link to="/missoes" className="btn btn-fantasma no-underline">{tx('Ver as missões', 'View missions')}</Link>
          </Painel>
        </div>
      </div>
    </>
  )
}

const BOTAO_PASSO = 'grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8'

/** Quanto se ganha ou perde: o resultado (com a margem de rondas) e o desempenho (Rangify Score). O rank não conta. */
function Simulador() {
  const [venceu, setVenceu] = useState<'v' | 'd'>('v')
  const [rs, setRs] = useState(112)
  // As rondas da equipa que perdeu (a que ganha fez 13).
  const [rondas, setRondas] = useState(9)
  const bonus = bonusDesempenho(rs)
  const margem = margemRondas(13, rondas)
  const base = (venceu === 'v' ? 1 : -1) * (PONTOS_BASE + margem)
  const total = base + bonus
  return (
    <Painel aria-labelledby="rg-sim" className="flex flex-col gap-3.5 p-[22px]">
      <TituloPainel eyebrow={tx('SIMULADOR', 'SIMULATOR')} titulo={tx('Quanto ganhas ou perdes', 'How much you win or lose')} id="rg-sim" />
      <Segmentado rotulo={tx('Resultado da partida', 'Match result')} valor={venceu} onChange={setVenceu} opcoes={[{ valor: 'v', texto: tx('Vitória', 'Win') }, { valor: 'd', texto: tx('Derrota', 'Loss') }]} />
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.03] p-3">
        <button type="button" aria-label={tx('Menos rondas para a equipa que perde', 'Fewer rounds for the losing team')} onClick={() => setRondas((d) => Math.max(0, d - 1))} className={BOTAO_PASSO}><Minus size={16} aria-hidden /></button>
        <span className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-mono text-[18px] font-semibold">{venceu === 'v' ? `13-${rondas}` : `${rondas}-13`}</span>
          <span className="text-[12px] text-mudo">{tx('o resultado em rondas', 'the round score')}</span>
        </span>
        <button type="button" aria-label={tx('Mais rondas para a equipa que perde', 'More rounds for the losing team')} onClick={() => setRondas((d) => Math.min(11, d + 1))} className={BOTAO_PASSO}><Plus size={16} aria-hidden /></button>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-white/[0.03] p-3">
        <button type="button" aria-label={tx('Diminuir o Rangify Score', 'Decrease the Rangify Score')} onClick={() => setRs((d) => Math.max(100 - RS_POR_PONTO * DESEMPENHO_MAX, d - RS_POR_PONTO))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Minus size={16} aria-hidden /></button>
        <span className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-mono text-[18px] font-semibold">RS {rs}</span>
          <span className="text-[12px] text-mudo">{tx('o teu desempenho na partida', 'your performance in the match')}</span>
        </span>
        <button type="button" aria-label={tx('Aumentar o Rangify Score', 'Increase the Rangify Score')} onClick={() => setRs((d) => Math.min(100 + RS_POR_PONTO * DESEMPENHO_MAX, d + RS_POR_PONTO))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/12 bg-white/[0.04] text-texto hover:bg-white/8"><Plus size={16} aria-hidden /></button>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-suave">{comSinal(base)} {tx('pelo resultado', 'from the result')}, {comSinal(bonus)} {tx('pelo desempenho', 'from performance')}</span>
        <span className={`font-mono text-[34px] font-semibold ${total > 0 ? 'text-vitoria' : 'text-derrota'}`}>{comSinal(total)}</span>
      </div>
      <p className="m-0 text-[12.5px] leading-normal text-mudo">{tx(`O resultado vale ${PONTOS_BASE}, de ${RESULTADO_MIN} (13-11) a ${RESULTADO_MAX} (13-0): quanto maior a diferença de rondas, mais se ganha ou se perde. Cada ${RS_POR_PONTO} de RS acima ou abaixo de 100 vale 1 ponto, entre -${DESEMPENHO_MAX} e +${DESEMPENHO_MAX}. O rank oficial não conta.`, `The result is worth ${PONTOS_BASE}, from ${RESULTADO_MIN} (13-11) to ${RESULTADO_MAX} (13-0): the bigger the round difference, the more you win or lose. Every ${RS_POR_PONTO} RS above or below 100 is worth 1 point, between -${DESEMPENHO_MAX} and +${DESEMPENHO_MAX}. Official rank does not count.`)}</p>
    </Painel>
  )
}

export function Ranking() {
  const [params, setParams] = useSearchParams()
  const pedido = params.get('tipo')
  const tipo = pedido === 'nivel' || pedido === 'rs' || pedido === 'agentes' ? pedido : 'pontos'
  const mudarTipo = (t: 'pontos' | 'nivel' | 'rs' | 'agentes') => setParams(t === 'pontos' ? {} : { tipo: t }, { replace: true })
  // A tabela de pontos de cada fila: o link (?fila=) manda; sem ele, a última que escolheste no Painel.
  const [vistaGuardada, guardarVista] = useFilaVista()
  const pedidaFila = params.get('fila')
  const fila: FilaTipo = pedidaFila === 'ranked' || pedidaFila === 'aberta' ? pedidaFila : vistaGuardada
  const mudarFila = (f: FilaTipo) => { guardarVista(f); setParams({ fila: f }, { replace: true }) }
  const ranked = fila === 'ranked'
  const { perfil } = useSessao()
  const acao = useAcao()
  const { sincronizar, aSincronizar } = useSincronizarRank()
  const [ambito, setAmbito] = useState<Ambito>('global')
  const [pesquisa, setPesquisa] = useState('')
  const [q, setQ] = useState('')
  const [linhas, setLinhas] = useState<LinhaRanking[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [mais, setMais] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setQ(pesquisa), 250)
    return () => window.clearTimeout(t)
  }, [pesquisa])

  const pagina = useCarregar(() => dados.ranking({ soAmigos: ambito === 'amigos', pesquisa: q, limite: 50, fila }), [ambito, q, fila], ['partida', 'amigos'], { minimo: 450, chave: `ranking:${fila}:${ambito}:${q}` })
  useEffect(() => {
    if (pagina.valor) { setLinhas(pagina.valor.linhas); setCursor(pagina.valor.cursor) }
  }, [pagina.valor])
  const pontosFila = ranked ? perfil?.pontosRanked : perfil?.pontos
  const minhaPos = useCarregar(() => dados.posicao(perfil?.id ?? '', fila), [perfil?.id, fila, pontosFila], [], { chave: `posicao:${perfil?.id}:${fila}:${pontosFila}` })

  const carregarMais = async () => {
    setMais(true)
    const r = await acao(() => dados.ranking({ cursor, soAmigos: ambito === 'amigos', pesquisa: q, limite: 50, fila }))
    if (r) { setLinhas((l) => [...l, ...r.linhas]); setCursor(r.cursor) }
    setMais(false)
  }

  const total = pagina.valor?.total ?? 0
  // Sem pesquisa, os três primeiros sobem para o pódio e a tabela começa no 4.º.
  const comPodio = !q && linhas.length >= 3 && !pagina.carregando
  const tabela = comPodio ? linhas.slice(3) : linhas
  const meus = ranked
    ? { pontos: perfil?.pontosRanked ?? 0, vitorias: perfil?.vitoriasRanked ?? 0, derrotas: perfil?.derrotasRanked ?? 0 }
    : { pontos: perfil?.pontos ?? 0, vitorias: perfil?.vitorias ?? 0, derrotas: perfil?.derrotas ?? 0 }
  const jogos = meus.vitorias + meus.derrotas

  return (
    <>
      <Cabecalho
        estavel
        migalhas={['Hub', tx('Tabela', 'Leaderboard')]}
        titulo={tx('Tabela da temporada', 'Season leaderboard')}
        descricao={tipo === 'nivel'
          ? tx('Quem subiu mais no passe da temporada com o XP das missões.', 'Who has climbed the season pass furthest with mission XP.')
          : tipo === 'rs'
          ? tx('Quem joga melhor, em média, segundo o Rangify Score de cada partida.', 'Who plays best on average, by the Rangify Score of each match.')
          : tipo === 'agentes'
          ? tx('O melhor jogador de cada agente, pela média de Rangify Score com ele.', 'The best player with each agent, by average Rangify Score with it.')
          : ranked
          ? tx('Só quem jogou na fila ranked (Ascendente 1 ou mais). Os pontos são separados dos da fila aberta.', 'Only players who have played the ranked queue (Ascendant 1 or higher). Points are separate from the open queue.')
          : tx('Ordenada pelos pontos da fila aberta. Entras na tabela quando acabas a tua primeira partida.', 'Sorted by open-queue points. You get on the leaderboard after finishing your first match.')}
        acoes={<BotaoAjuda topico="ranking">{tx('Como funciona a tabela', 'How the leaderboard works')}</BotaoAjuda>}
      />

      <div className="flex flex-wrap items-center justify-end gap-x-[18px] gap-y-3">
        {tipo === 'pontos' && <Segmentado rotulo={tx('Fila', 'Queue')} valor={fila} onChange={mudarFila} opcoes={[{ valor: 'ranked', texto: 'Ranked' }, { valor: 'aberta', texto: tx('Aberta', 'Open') }]} />}
        <Segmentado rotulo={tx('Tipo de tabela', 'Leaderboard type')} valor={tipo} onChange={mudarTipo} opcoes={[{ valor: 'pontos', texto: tx('Pontos', 'Points') }, { valor: 'nivel', texto: tx('Nível', 'Level') }, { valor: 'rs', texto: 'Rangify Score' }, { valor: 'agentes', texto: tx('Agentes', 'Agents') }]} />
      </div>

      {tipo === 'agentes' ? <TabelaAgentes perfil={perfil} /> : tipo === 'rs' ? <RankingRs perfil={perfil} /> : tipo === 'nivel' ? <RankingNivel perfil={perfil} /> : <>

      {pagina.carregando && !q ? <PodioEsqueleto /> : comPodio && <Podio eu={perfil?.id} top={linhas.slice(0, 3).map((l) => {
        const j = l.perfil.vitorias + l.perfil.derrotas
        return { posicao: l.posicao, perfil: l.perfil, valor: l.perfil.pontos, unidade: 'pts', resumo: `${l.perfil.vitorias}-${l.perfil.derrotas}${j ? ` · ${Math.round((l.perfil.vitorias / j) * 100)}%` : ''}` }
      })} />}

      <div className="flex flex-wrap items-start gap-4">
        <PainelClassificacao
          total={total} etiqueta={nomeTabela(fila).toUpperCase()} ambito={ambito} setAmbito={setAmbito} pesquisa={pesquisa} setPesquisa={setPesquisa}
          carregando={pagina.carregando} comPodio={comPodio}
          colunas={[
            { texto: tx('Rank oficial', 'Official rank'), classe: 'hidden px-2 md:table-cell' },
            { texto: tx('Forma', 'Form'), classe: 'hidden px-2 sm:table-cell' },
            { texto: tx('V-D', 'W-L'), classe: 'hidden px-2 text-right lg:table-cell' },
            { texto: tx('Vit.', 'Win%'), classe: 'hidden px-2 text-right lg:table-cell' },
            { texto: tx('Pontos', 'Points'), classe: 'pr-3 text-right' },
          ]}
          linhas={tabela.map((l, i) => <Linha key={l.perfil.id} l={l} i={i} eu={l.perfil.id === perfil?.id} />)}
          vazio={vazioFiltro(ambito, q
            ? <Vazio icone={<Trophy size={22} />} titulo={tx('Ninguém com esse nome', 'Nobody with that name')} texto={tx('Experimenta outro Riot ID.', 'Try another Riot ID.')} />
            : <Vazio icone={<Trophy size={22} />} titulo={tx('A tabela ainda está vazia', 'The leaderboard is still empty')} texto={tx('Entra quem já jogou uma partida. Sê o primeiro!', 'Players who have finished a match get in. Be the first!')} />)}
          rodape={cursor && (
            <button type="button" className="btn btn-fantasma self-center" disabled={mais} onClick={carregarMais}>{mais ? tx('A carregar…', 'Loading…') : tx('Carregar mais 50', 'Load 50 more')}</button>
          )}
        />

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {perfil && <CartaoPosicao posicao={minhaPos.valor} perfil={perfil} semJogos={jogos === 0} bloqueada={ranked && perfil.tier < TIER_MINIMO_RANKED} resumo={`${meus.pontos} pts · ${meus.vitorias}-${meus.derrotas} · ${jogos ? Math.round((meus.vitorias / jogos) * 100) : 0}%`} />}
          {perfil && <Simulador />}
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
