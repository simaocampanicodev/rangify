import { Crown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmDireto } from '@/components/AoVivo'
import { ICONE_FUNCAO } from '@/components/partida/comum'
import { Avatar, Esqueleto, IconeAgente, Painel, Segmentado, Vazio } from '@/components/ui'
import { useCarregar } from '@/hooks/useCarregar'
import { AGENTES, agentePorNome } from '@/lib/agentes'
import { dados, type FuncaoJogo, type JogadorAgente, type Perfil } from '@/lib/dados'
import { l, nomeFuncaoJogo } from '@/lib/idioma'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'

type Filtro = 'todos' | FuncaoJogo
const FUNCOES: FuncaoJogo[] = ['Duelista', 'Iniciador', 'Controlador', 'Sentinela']

const partidas = (n: number) => `${n} ${n === 1 ? l('partida', 'match') : l('partidas', 'matches')}`

/** Um agente e o melhor jogador dele (com os seguintes à mão). */
function CartaoAgente({ nome, funcao, jogadores, eu, minimo }: { nome: string; funcao: FuncaoJogo | null; jogadores: JogadorAgente[]; eu?: string; minimo: number }) {
  const [melhor, ...resto] = jogadores
  const minha = jogadores.find((j) => j.perfil.id === eu)
  const taxa = (j: JogadorAgente) => Math.round((j.vitorias / j.partidas) * 100)
  return (
    <article
      aria-label={nome}
      className={`painel flex min-w-0 flex-col gap-3 p-4 ${melhor && melhor.perfil.id === eu ? '!border-laranja/55' : ''} ${melhor ? '' : 'opacity-60'}`}
    >
      <header className="flex items-center gap-3">
        <IconeAgente nome={nome} tamanho={46} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <h3 className="m-0 truncate text-[16px] font-extrabold tracking-[-0.02em]">{nome}</h3>
          {funcao && <span className="inline-flex items-center gap-1.5 text-[11.5px] text-mudo"><span className="text-laranja">{ICONE_FUNCAO[funcao]}</span>{nomeFuncaoJogo(funcao)}</span>}
        </span>
        {/* Na linha de cima e não por baixo: um cartão com este aviso não fica mais alto do que os outros. */}
        {minha && minha.posicao > 1 && (
          <span title={`${l('Tu', 'You')}: #${minha.posicao} · RS ${Math.round(minha.media)}`} className="ml-auto shrink-0 rounded-full border border-laranja/30 bg-laranja/10 px-2 py-0.5 font-mono text-[10.5px] text-pessego">
            {l('Tu', 'You')} #{minha.posicao} · {Math.round(minha.media)}
          </span>
        )}
      </header>
      {melhor ? (
        <>
          <div className="flex items-center gap-2">
            <Link to={caminhoPerfil(melhor.perfil.riotId)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.035] p-2.5 text-texto no-underline transition-colors hover:border-laranja/40">
              <Avatar nome={nomeJogador(melhor.perfil)} url={melhor.perfil.avatarUrl} tamanho={40} destaque={melhor.perfil.id === eu} perfilId={melhor.perfil.id} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold">
                  <Crown size={13} className="shrink-0 text-ouro" aria-label={l('Melhor com este agente', 'Best with this agent')} />
                  <span className="truncate">{nomeJogador(melhor.perfil)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(melhor.perfil)}</span></span>
                </span>
                <span className="truncate font-mono text-[11px] text-mudo" title={[melhor.acs != null ? `ACS ${melhor.acs}` : null, melhor.kda != null ? `KDA ${melhor.kda}` : null].filter(Boolean).join(' · ') || undefined}>{partidas(melhor.partidas)} · {taxa(melhor)}% {l('vit.', 'win')}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-mono text-[22px] leading-none font-semibold tracking-[-0.03em]">{Math.round(melhor.media)}</span>
                <span className="font-mono text-[9.5px] text-mudo">RS</span>
              </span>
            </Link>
            <EmDireto perfilId={melhor.perfil.id} compacto />
          </div>
          {resto.length > 0 && (
            <details className="group mt-auto">
              <summary className="cursor-pointer list-none text-[12px] font-semibold text-suave marker:hidden hover:text-texto">
                <span className="group-open:hidden">{l(`Ver os seguintes (${resto.length})`, `Show the next ones (${resto.length})`)}</span>
                <span className="hidden group-open:inline">{l('Esconder', 'Hide')}</span>
              </summary>
              <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {resto.map((j) => (
                  <li key={j.perfil.id} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${j.perfil.id === eu ? 'bg-laranja/10' : ''}`}>
                    <span className="w-5 font-mono text-[11px] text-mudo">#{j.posicao}</span>
                    <Link to={caminhoPerfil(j.perfil.riotId)} className="min-w-0 flex-1 truncate font-semibold text-texto no-underline hover:text-pessego">{nomeJogador(j.perfil)}</Link>
                    <span className="font-mono text-[11px] text-mudo">{partidas(j.partidas)}</span>
                    <span className="w-8 text-right font-mono text-[13px] font-semibold">{Math.round(j.media)}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : (
        <p className="m-0 text-[12.5px] leading-normal text-mudo">{minimo > 1 ? l(`Ninguém tem ${minimo} partidas ou mais com ${nome} (ainda).`, `Nobody has ${minimo} or more matches with ${nome} (yet).`) : l(`Ninguém jogou com ${nome} ainda.`, `Nobody has played ${nome} yet.`)}</p>
      )}
    </article>
  )
}

/** A tabela do melhor jogador de cada agente: média de Rangify Score com esse agente. */
export function TabelaAgentes({ perfil }: { perfil: Perfil | null }) {
  const [funcao, setFuncao] = useState<Filtro>('todos')
  const [minimo, setMinimo] = useState<1 | 3 | 5>(1)
  const r = useCarregar(() => dados.rankingAgentes({ minimo, top: 5 }), [minimo], ['partida', 'staff'], { minimo: 300, chave: `ranking_agentes:${minimo}` })

  // Os agentes que a API ainda não conhecemos (lançamentos novos) também aparecem, no fim.
  const cartoes = useMemo(() => {
    const dosDados = new Map((r.valor?.agentes ?? []).map((a) => [agentePorNome(a.agente)?.nome ?? a.agente, a.jogadores]))
    const conhecidos = AGENTES.map((a) => ({ nome: a.nome, funcao: a.funcao as FuncaoJogo | null, jogadores: dosDados.get(a.nome) ?? [] }))
    const extra = [...dosDados.entries()].filter(([nome]) => !AGENTES.some((a) => a.nome === nome)).map(([nome, jogadores]) => ({ nome, funcao: null as FuncaoJogo | null, jogadores }))
    return [...conhecidos, ...extra]
  }, [r.valor])

  const visiveis = cartoes.filter((c) => funcao === 'todos' || c.funcao === funcao)
  // Os que têm campeão primeiro (e, entre eles, por ordem alfabética); os vazios ficam no fim.
  const ordenados = [...visiveis].sort((a, b) => Number(b.jogadores.length > 0) - Number(a.jogadores.length > 0))
  const comCampeao = visiveis.filter((c) => c.jogadores.length > 0).length

  return (
    <div className="flex flex-col gap-4">
      <Painel className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <p className="m-0 max-w-[560px] text-[13px] leading-normal text-suave">
          {l('O melhor jogador com cada agente, pela média de Rangify Score nas partidas em que o jogou. Só entra quem já jogou pelo menos uma partida do hub.', 'The best player with each agent, by the average Rangify Score in the matches they played it. Only players who have played at least one hub match are included.')}
        </p>
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-3">
          <Segmentado
            rotulo={l('Função do agente', 'Agent role')}
            valor={funcao}
            onChange={setFuncao}
            pequeno
            opcoes={[{ valor: 'todos', texto: l('Todos', 'All') }, ...FUNCOES.map((f) => ({ valor: f, texto: nomeFuncaoJogo(f) }))]}
          />
          <Segmentado
            rotulo={l('Partidas mínimas com o agente', 'Minimum matches with the agent')}
            valor={String(minimo) as '1' | '3' | '5'}
            onChange={(v) => setMinimo(Number(v) as 1 | 3 | 5)}
            pequeno
            opcoes={[{ valor: '1', texto: l('1+ partida', '1+ match') }, { valor: '3', texto: '3+' }, { valor: '5', texto: '5+' }]}
          />
        </div>
      </Painel>
      {r.carregando ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3" aria-busy>
          {Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="h-[150px] rounded-[18px]" />)}
        </div>
      ) : r.erro ? (
        <Vazio icone={<Crown size={22} />} titulo={l('Não foi possível carregar a tabela', 'Could not load the leaderboard')} texto={r.erro} />
      ) : comCampeao === 0 ? (
        <Vazio icone={<Crown size={22} />} titulo={l('Ainda sem campeões', 'No champions yet')} texto={minimo > 1 ? l('Ninguém tem tantas partidas com o mesmo agente. Experimenta baixar o mínimo.', 'Nobody has that many matches with the same agent. Try lowering the minimum.') : l('A tabela enche-se com as partidas confirmadas com estatísticas da API, que dizem que agente cada um jogou.', 'The leaderboard fills up with matches confirmed with API stats, which say which agent each player used.')} />
      ) : (
        <>
          <p role="status" className="m-0 font-mono text-[11.5px] text-mudo">{l(`${comCampeao} agentes com campeão`, `${comCampeao} agents with a champion`)}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
            {ordenados.map((c) => <CartaoAgente key={c.nome} nome={c.nome} funcao={c.funcao} jogadores={c.jogadores} eu={perfil?.id} minimo={minimo} />)}
          </div>
        </>
      )}
    </div>
  )
}
