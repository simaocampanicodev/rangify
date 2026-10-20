import { ArrowRight, ArrowUpRight, Bell, Check, CircleCheck, Clock, Globe, MessageCircle, RefreshCw, Shield, Swords, Target, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnelFila, CartaoFila, SeletorFila, nomeTabela } from '@/components/Fila'
import { SeletorIdioma } from '@/components/Idioma'
import { LinhaPartida } from '@/components/LinhaPartida'
import { NomeRangify } from '@/components/Marca'
import { BarraProgresso, BlocoIcone, BotaoAjuda, Cabecalho, Carregando, LinhasEsqueleto, LinkSeta, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useFilaVista } from '@/hooks/useFilaVista'
import { dados, type Missao, type Partida } from '@/lib/data'
import { formatarXp } from '@/lib/experiencia'
import { traduzirMissao } from '@/lib/missoes'
import { nomeJogador } from '@/lib/partida'
import { PONTOS_INICIAIS, comSinal } from '@/lib/pontos'
import { caminhoPartida } from '@/lib/rotas'
import { nomeRegiao } from '@/lib/regioes'
import { NOMES_ESTADO } from '@/lib/regras'
import { diaCurto, duracaoAte, fimDaSemana, fimDoDia, haQuanto } from '@/lib/tempo'
import { l } from '@/lib/idioma'

function BarrasPontos({ deltas }: { deltas: number[] }) {
  const max = Math.max(30, ...deltas.map(Math.abs))
  const lista = [...Array(Math.max(0, 10 - deltas.length)).fill(null), ...deltas] as (number | null)[]
  return (
    <>
      <div role="img" aria-label={l(`Pontos ganhos e perdidos nas últimas ${deltas.length} partidas`, `Points won and lost in the last ${deltas.length} matches`)} className="relative flex h-[66px] gap-[5px]">
        <span aria-hidden className="absolute inset-x-0 top-[33px] h-px bg-white/10" />
        {lista.map((d, i) => {
          const h = d == null ? 0 : Math.max(3, (Math.abs(d) / max) * 31)
          return (
            <span key={i} className="relative h-[66px] flex-1">
              {d != null && (
                <span
                  className="absolute inset-x-0 rounded-[3px]"
                  style={{ top: d >= 0 ? 33 - h : 34, height: h, background: d >= 0 ? '#5fe3d6' : '#ff7d8f', opacity: 0.85 }}
                />
              )}
            </span>
          )
        })}
      </div>
      <div className="flex justify-between font-mono text-[10.5px] text-mudo"><span>{l('10 partidas atrás', '10 matches ago')}</span><span>{l('última', 'latest')}</span></div>
    </>
  )
}

/** As por fazer primeiro, das mais perto de acabar para as mais longe; as feitas no fim. */
function maisPerto(lista: Missao[]) {
  return [...lista].sort((a, b) => Number(a.concluida) - Number(b.concluida) || b.progresso / b.alvo - a.progresso / a.alvo)
}

function GrupoMissoes({ titulo, renova, lista }: { titulo: string; renova: string; lista: Missao[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2 font-mono text-[10.5px] tracking-[0.12em]">
        <span className="font-bold text-pessego">{titulo}</span>
        <span className="tracking-normal text-mudo">{l('renova em', 'renews in')} {renova}</span>
      </div>
      {lista.map((m) => (
        <div key={m.id} className="flex flex-col gap-2">
          <div className="flex justify-between gap-3 text-[13.5px] leading-[1.4]">
            <span className={m.concluida ? 'text-suave' : 'text-marfim'}>{m.descricao}</span>
            <span className="flex shrink-0 items-center gap-2 font-mono text-[12px]">
              {m.concluida
                ? <span className="inline-flex items-center gap-1 text-pessego"><CircleCheck size={13} aria-hidden />+{formatarXp(m.xp)} XP</span>
                : <><span className="text-mudo">+{formatarXp(m.xp)} XP</span><span className="text-suave">{m.progresso}/{m.alvo}</span></>}
            </span>
          </div>
          <BarraProgresso valor={m.progresso} alvo={m.alvo} rotulo={m.titulo} />
        </div>
      ))}
    </div>
  )
}

/** Com uma partida a decorrer, o cartão da fila dá lugar a este: o anel cheio e o caminho de volta. */
function PartidaAtiva({ partida }: { partida: Partida }) {
  return (
    <Painel aria-labelledby="rg-proxima" className="flex min-w-0 flex-[2_1_540px] flex-wrap items-center gap-x-9 gap-y-6 p-7">
      <AnelFila contagem={10} naFila={false} legenda={l('AO VIVO', 'LIVE')} />
      <div className="flex min-w-[260px] flex-1 flex-col gap-3.5">
        <p className="m-0 max-w-[470px] text-[14.5px] leading-[1.55] text-suave">
          {l('Tens uma partida a decorrer. Volta à página Jogar para a fase em que está.', 'You have a match in progress. Go back to the Play page for its current phase.')}
        </p>
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Link to={caminhoPartida(partida.id)} className="btn btn-primario">{l('Voltar à partida', 'Back to match')}<ArrowRight size={16} aria-hidden /></Link>
          <BotaoAjuda topico="draft">{l('Como funciona o draft', 'How the draft works')}</BotaoAjuda>
          {partida.fila === 'ranked' && <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-pessego">RANKED</span>}
        </div>
      </div>
    </Painel>
  )
}

export function Dashboard() {
  const { perfil } = useSessao()
  const { partida, ativa, fila } = usePartida()
  const [vista, escolher] = useFilaVista()
  const [minhas, setMinhas] = useState<'minhas' | 'todas'>('minhas')
  const id = perfil?.id ?? ''
  const ranked = vista === 'ranked'
  const pontosVista = ranked ? perfil?.pontosRanked : perfil?.pontos
  const posicao = useCarregar(() => dados.posicao(id, vista), [id, vista, pontosVista], ['partida'], { chave: `posicao:${id}:${vista}:${pontosVista}` })
  const forma = useCarregar(() => dados.forma(id, 50), [id], ['partida'], { chave: `forma:${id}:50` })
  const historico = useCarregar(() => dados.partidas({ minhas: minhas === 'minhas' }), [minhas], ['partida'], { minimo: 350, chave: `partidas:${minhas}` })
  const missoes = useCarregar(() => dados.missoes(), [], ['partida'], { chave: 'missoes' })
  const novidades = useCarregar(() => dados.novidades(1), [], ['staff'], { chave: 'novidades:1', fresco: 300_000 })
  if (!perfil) return <Carregando />

  const nome = nomeJogador(perfil)
  const numeros = ranked
    ? { pontos: perfil.pontosRanked, vitorias: perfil.vitoriasRanked, derrotas: perfil.derrotasRanked }
    : { pontos: perfil.pontos, vitorias: perfil.vitorias, derrotas: perfil.derrotas }
  const ganho = numeros.pontos - PONTOS_INICIAIS
  // As últimas 10 partidas da fila que estás a ver (a lista traz as duas, da mais antiga para a mais recente).
  const formaFila = (forma.valor ?? []).filter((f) => (f.fila ?? 'aberta') === vista).slice(-10)
  const lista = (missoes.valor ?? []).map(traduzirMissao)
  const diarias = maisPerto(lista.filter((m) => m.ambito === 'diaria')).slice(0, 3)
  const semanais = maisPerto(lista.filter((m) => m.ambito === 'semanal')).slice(0, 3)
  const novidade = novidades.valor?.[0]
  const atalhos = [
    { para: '/ranking', titulo: l('Tabela', 'Leaderboard'), texto: <>{l('Quem lidera a temporada, ordenado pelos pontos', 'Who leads the season, sorted by')} <NomeRangify className="text-laranja-claro" />{l('.', ' points.')}</>, icone: <Trophy size={19} /> },
    { para: '/partidas', titulo: l('Partidas', 'Matches'), texto: l('O teu histórico e todos os jogos do hub, com KDA e ACS.', 'Your history and every hub game, with KDA and ACS.'), icone: <Clock size={19} /> },
    { para: '/missoes', titulo: l('Missões', 'Missions'), texto: l('Objetivos diários e semanais, ganhe jogos e ganhe XP.', 'Daily and weekly goals, win games and earn XP.'), icone: <Target size={19} /> },
    { para: '/amigos', titulo: l('Amigos', 'Friends'), texto: l('Vê quem está na fila ou a jogar e compara-te na tabela.', 'See who is queueing or playing and compare yourself on the leaderboard.'), icone: <Users size={19} /> },
  ]

  return (
    <>
      <Cabecalho
        migalhas={['Hub', l('Painel', 'Dashboard')]}
        titulo={perfil.vitorias + perfil.derrotas + perfil.vitoriasRanked + perfil.derrotasRanked ? l(`Bem-vindo de volta, ${nome}.`, `Welcome back, ${nome}.`) : l(`Bem-vindo, ${nome}.`, `Welcome, ${nome}.`)}
        descricao={l('A próxima partida está a uma fila de distância. Aqui vês os teus pontos, as missões ativas e como correram os últimos jogos.', 'Your next match is one queue away. Here you see your points, active missions and how your last games went.')}
        acoes={
          <>
            <SeletorIdioma />
            <Link to="/amigos" aria-label={l('Pedidos e amigos', 'Requests and friends')} className="grid size-11 place-items-center rounded-[11px] border border-white/8 bg-white/[0.03] text-[#d9d4cd] hover:bg-white/8"><Bell size={18} aria-hidden /></Link>
            <Link to={ativa && partida ? caminhoPartida(partida.id) : '/jogar'} className="btn btn-primario">{ativa ? l('Voltar à partida', 'Back to match') : l('Jogar agora', 'Play now')}</Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-laranja/32 bg-laranja/12 px-3 text-[12.5px] text-pessego-claro"><span className="size-[7px] rounded-full bg-laranja" />{l('Temporada 1', 'Season 1')}</span>
        {[
          [<Globe size={14} key="g" />, `${l('Região', 'Region')} ${nomeRegiao(perfil.regiao)}`],
          [<MessageCircle size={14} key="d" />, l('Discord ligado', 'Discord linked')],
          [<Check size={14} key="r" />, l('Riot ID ligado', 'Riot ID linked')],
          [<RefreshCw size={14} key="s" />, `${l('Rank oficial sincronizado', 'Official rank synced')} ${haQuanto(perfil.rankAtualizadoEm)}`],
        ].map(([icone, texto]) => (
          <span key={texto as string} className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-white/8 bg-white/[0.035] px-3 text-[12.5px] text-[#d0cbc4]">
            <span className="text-laranja">{icone}</span>{texto}
          </span>
        ))}
      </div>

      <section aria-labelledby="rg-proxima" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="eyebrow">{ativa ? l('PARTIDA A DECORRER', 'MATCH IN PROGRESS') : l('A TUA PRÓXIMA PARTIDA', 'YOUR NEXT MATCH')}</span>
            <h2 id="rg-proxima" className="m-0 text-[28px] leading-[1.05] font-extrabold tracking-[-0.035em]">
              {ativa && partida ? `${partida.codigo}: ${NOMES_ESTADO[partida.estado]}` : l('Pronto para a próxima?', 'Ready for the next one?')}
            </h2>
          </div>
          {!ativa && (
            <SeletorFila
              valor={vista}
              onChange={escolher}
              contagemAberta={fila?.contagemAberta ?? fila?.contagem ?? 0}
              contagemRanked={fila?.contagemRanked ?? 0}
              rankedBloqueada={fila?.rankedPermitido === false}
            />
          )}
        </div>

        <div className="flex flex-wrap items-stretch gap-4">
          <div className="flex min-w-0 flex-[2_1_540px] flex-col">
            {ativa && partida ? <PartidaAtiva partida={partida} /> : <CartaoFila tipo={vista} id={`rg-fila-${vista}`} rodape={<span className="flex"><BotaoAjuda topico="draft">{l('Como funciona o draft', 'How the draft works')}</BotaoAjuda></span>} />}
          </div>

          <Painel aria-labelledby="rg-pts" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 p-6">
            <div className="flex items-center justify-between gap-2.5">
              <h2 id="rg-pts" className="eyebrow m-0">{l('OS TEUS PONTOS', 'YOUR POINTS')} · {nomeTabela(vista).toUpperCase()}</h2>
              <span className="font-mono text-[10.5px] text-mudo">{l('TEMPORADA 1', 'SEASON 1')}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[54px] leading-none font-semibold tracking-[-0.05em]">{numeros.pontos}</span>
              <span className="text-[14px] text-mudo">pts</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-suave">
              <span className={`inline-flex h-6 items-center gap-1 rounded-[7px] border px-2 font-mono text-[12px] font-semibold ${ganho >= 0 ? 'border-vitoria/30 bg-vitoria/10 text-[#7ff0e4]' : 'border-derrota/30 bg-derrota/10 text-[#ffb3bf]'}`}>
                <ArrowUpRight size={13} className={ganho < 0 ? 'rotate-90' : ''} aria-hidden />{comSinal(ganho)}
              </span>
              {l(`desde os ${PONTOS_INICIAIS} iniciais`, `since the starting ${PONTOS_INICIAIS}`)}
            </div>
            {formaFila.length > 0
              ? <BarrasPontos deltas={formaFila.map((f) => f.delta)} />
              : <p className="m-0 text-[13px] text-mudo">
                {ranked && fila?.rankedPermitido === false
                  ? l('A Tabela Ranked abre quando chegares a Ascendente 1.', 'The Ranked leaderboard opens when you reach Ascendant 1.')
                  : forma.carregando && !forma.valor ? l('A carregar…', 'Loading…')
                  : l('Ainda sem partidas nesta fila. A primeira vitória vale entre +12 e +30.', 'No matches in this queue yet. Your first win is worth between +12 and +30.')}
              </p>}
            <div className="flex flex-col gap-[11px] border-t border-white/7 pt-3.5">
              <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">{l('Posição na tabela', 'Leaderboard position')}</span><span className="font-mono font-semibold">{posicao.valor ? `#${posicao.valor}` : '-'}</span></div>
              <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">{l('Rank oficial', 'Official rank')}</span><RankBadge tier={perfil.tier} /></div>
              <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">{l('Registo', 'Record')}</span><span className="font-mono font-semibold">{numeros.vitorias}{l('V', 'W')} · {numeros.derrotas}{l('D', 'L')}</span></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LinkSeta to={`/ranking?fila=${vista}`}>{l('Ver tabela completa', 'View full leaderboard')}</LinkSeta>
            </div>
          </Painel>
        </div>
      </section>

      <section aria-labelledby="rg-atalhos" className="flex flex-col gap-3.5">
        <h2 id="rg-atalhos" className="m-0 text-[19px] font-bold tracking-[-0.02em]">{l('Atalhos', 'Shortcuts')}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {atalhos.map((a) => (
            <Link key={a.para} to={a.para} className="painel cartao-hover flex flex-col gap-3.5 !rounded-[14px] p-[18px] text-texto no-underline">
              <span className="flex items-start justify-between">
                <BlocoIcone>{a.icone}</BlocoIcone>
                <ArrowUpRight size={16} className="text-mudo" aria-hidden />
              </span>
              <span className="flex flex-col gap-[5px]">
                <span className="text-[15px] font-bold">{a.titulo}</span>
                <span className="text-[13px] leading-[1.45] text-[#a6a19a]">{a.texto}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <Painel aria-labelledby="rg-hist" className="flex min-w-0 flex-[2_1_540px] flex-col px-[22px] pt-[22px] pb-2">
          <div className="pb-3">
            <TituloPainel
              eyebrow={l('HISTÓRICO', 'HISTORY')}
              titulo={l('Últimas partidas', 'Latest matches')}
              id="rg-hist"
              direita={<Segmentado rotulo={l('Filtrar partidas', 'Filter matches')} valor={minhas} onChange={setMinhas} opcoes={[{ valor: 'minhas', texto: l('As minhas', 'Mine') }, { valor: 'todas', texto: l('Todas', 'All') }]} />}
            />
          </div>
          {historico.carregando ? <LinhasEsqueleto tipo="partidas" n={4} /> : historico.valor?.linhas.length ? (
            historico.valor.linhas.slice(0, 5).map((m, i) => <LinhaPartida key={m.id} m={m} i={i} />)
          ) : (
            <Vazio icone={<Swords size={22} />} titulo={l('Ainda não jogaste', 'You have not played yet')} texto={l('Entra na fila: as tuas partidas aparecem aqui com o resultado e os pontos.', 'Join the queue: your matches show up here with the score and points.')} />
          )}
          <div className="mt-auto border-t border-white/6"><LinkSeta to="/partidas">{l('Ver histórico completo', 'View full history')}</LinkSeta></div>
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Painel aria-labelledby="rg-missoes" className="flex flex-col gap-4 p-[22px]">
            <TituloPainel eyebrow={l('MISSÕES ATIVAS', 'ACTIVE MISSIONS')} titulo={l('Diárias e semanais', 'Daily and weekly')} id="rg-missoes" />
            {missoes.carregando && !missoes.valor ? <p className="m-0 text-[13.5px] text-mudo">{l('A carregar…', 'Loading…')}</p> : (
              <>
                <GrupoMissoes titulo={l('HOJE', 'TODAY')} renova={duracaoAte(fimDoDia().toISOString())} lista={diarias} />
                <div className="border-t border-white/7" />
                <GrupoMissoes titulo={l('ESTA SEMANA', 'THIS WEEK')} renova={duracaoAte(fimDaSemana().toISOString())} lista={semanais} />
              </>
            )}
            <LinkSeta to="/missoes">{l('Ver todas as missões', 'View all missions')}</LinkSeta>
          </Painel>

          <Painel aria-labelledby="rg-novidades" className="relative flex flex-1 flex-col justify-center gap-2.5 overflow-hidden px-[22px] py-5">
            <div className="flex items-center justify-between gap-2.5">
              <span className="eyebrow">{l('NOVIDADES', 'NEWS')}</span>
              {novidade && <span className="font-mono text-[11px] text-mudo">{diaCurto(novidade.data)}</span>}
            </div>
            {novidade ? (
              <>
                <h2 id="rg-novidades" className="m-0 text-[16px] leading-[1.3] font-bold tracking-[-0.015em]">{novidade.titulo}</h2>
                <p className="m-0 text-[13px] leading-normal whitespace-pre-line text-[#a6a19a]">{novidade.texto}</p>
              </>
            ) : <h2 id="rg-novidades" className="m-0 text-[14px] font-medium text-mudo">{novidades.carregando ? l('A carregar…', 'Loading…') : l('Sem novidades por agora.', 'No news for now.')}</h2>}
            <div className="flex items-center gap-2 pt-1 text-[12.5px] text-mudo"><Shield size={14} className="text-laranja" aria-hidden />{l('Rank oficial da Riot, só informativo', 'Official Riot rank, informational only')}</div>
          </Painel>
        </div>
      </div>
    </>
  )
}
