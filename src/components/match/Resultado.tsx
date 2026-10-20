import { CircleCheck, Hourglass, LoaderCircle, Scale, Send, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type Equipa, type JogadorPartida, type Partida } from '@/lib/data'
import { imagemMapa } from '@/lib/mapas'
import { caminhoPerfil, capitao, equipa, ladoInicial, nomeJogador, souCapitao } from '@/lib/partida'
import { calcularPontos, comSinal } from '@/lib/pontos'
import { nomeRank, tierMedio } from '@/lib/ranks'
import { emFalta, relogio } from '@/lib/tempo'
import { Chip, IconeAgente, SeloMvp } from '../ui'
import { Iniciais } from './comum'
import { l } from '@/lib/idioma'

function minutos(p: Partida) {
  if (!p.comecouEm) return null
  const fim = p.terminouEm ? new Date(p.terminouEm).getTime() : Date.now()
  return Math.max(1, Math.round((fim - new Date(p.comecouEm).getTime()) / 60_000))
}

function Cabeca({ p, eyebrow, titulo, texto, direita }: { p: Partida; eyebrow: string; titulo: string; texto: string; direita?: React.ReactNode }) {
  return (
    <section className="mapa relative flex min-h-[170px] items-end overflow-hidden rounded-[22px] border border-white/10" style={{ backgroundImage: `url(${imagemMapa(p.mapa)})` }}>
      <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.72) 50%, rgba(9,9,11,0.2) 100%)' }} />
      <div className="relative flex w-full flex-wrap items-end justify-between gap-3.5 px-7 py-6">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-pessego">{eyebrow}</span>
          <h1 className="m-0 text-[clamp(30px,3.6vw,42px)] leading-[1.04] font-black tracking-[-0.04em]">{titulo}</h1>
          <span className="text-[14px] text-[#d0cbc4]">{texto}</span>
        </div>
        {direita}
      </div>
    </section>
  )
}

/** Pré-visualização dos pontos de cada jogador para um resultado. */
function Previsao({ p, a, b, eu }: { p: Partida; a: number; b: number; eu: string }) {
  const vence: Equipa = a > b ? 'A' : 'B'
  return (
    <div className="flex flex-col gap-1">
      {(['A', 'B'] as const).map((eq) => (
        <div key={eq} className="flex flex-col gap-1">
          <span className={`px-0.5 pt-2.5 pb-1 font-mono text-[10px] font-bold tracking-[0.14em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>{l('EQUIPA', 'TEAM')} {eq} · {eq === vence ? l('VITÓRIA', 'WIN') : l('DERROTA', 'LOSS')}</span>
          {equipa(p, eq).map((j) => {
            const r = calcularPontos(eq === vence, a, b)
            return (
              <div key={j.perfilId} className={`flex min-h-[38px] items-center gap-2.5 rounded-[9px] px-2 ${j.perfilId === eu ? 'bg-laranja/10' : ''}`}>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${j.perfilId === eu ? 'font-bold' : ''}`}>{nomeJogador(j)}</span>
                <span className={`w-11 text-right font-mono text-[13.5px] font-bold ${r.total > 0 ? 'text-vitoria' : 'text-derrota'}`}>{comSinal(r.total)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Submeter({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const { atualizar } = usePartida()
  const agora = useAgora(1000)
  const [escolha, setEscolha] = useState<Equipa | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const meuLado = souCapitao(p, eu)
  const jaVotei = p.submissoes.find((s) => s.capitaoId === eu)
  // Com um voto dado, a API entra em ação quando o outro capitão votar ou ao fim deste prazo.
  const faltam = p.submissoes.length ? emFalta(p.prazoFase, agora) : 0

  const enviar = async () => {
    if (!escolha) return
    setAEnviar(true)
    await acao(() => dados.submeterResultado(p.id, escolha), l('Voto guardado.', 'Vote saved.'))
    await atualizar()
    setAEnviar(false)
  }

  const espera = (
    <div className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5" role="status">
      <Hourglass size={17} className="text-laranja" aria-hidden />
      <span className="flex-1 text-[13.5px]">
        {p.submissoes.length
          ? l(`A Henrik Dev API entra em ação quando o outro capitão votar, ou daqui a ${relogio(faltam)}.`, `The Henrik Dev API steps in when the other captain votes, or in ${relogio(faltam)}.`)
          : l('Quando os dois capitães votarem, ou 3 minutos depois do primeiro voto, a Henrik Dev API entra em ação.', 'When both captains vote, or 3 minutes after the first vote, the Henrik Dev API steps in.')}
      </span>
      <span className="ao-vivo size-2 rounded-full bg-laranja" />
    </div>
  )

  if (!meuLado || p.automatica) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="eyebrow m-0">{l('À ESPERA DOS CAPITÃES', 'WAITING FOR THE CAPTAINS')}</h2>
        <p className="m-0 text-[14px] leading-normal text-suave">{l('Só os capitães confirmam que o jogo acabou, escolhendo a equipa que ganhou. O resultado e os pontos vêm depois da API.', 'Only the captains confirm the game is over, by picking the winning team. The result and points come from the API afterwards.')}</p>
        {(['A', 'B'] as const).map((eq) => {
          const c = capitao(p, eq)
          const s = c && p.submissoes.find((x) => x.capitaoId === c.perfilId)
          return c ? (
            <div key={eq} className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
              <Iniciais nome={nomeJogador(c)} equipa={eq} tamanho={30} url={c.avatarUrl} perfilId={c.perfilId} />
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-[13.5px] font-bold">{nomeJogador(c)} · {l('capitão', 'captain')} {eq}</span>
                <span className="text-[12px] text-[#d0cbc4]">{s ? l(`Votou na Equipa ${s.vencedor}`, `Voted for Team ${s.vencedor}`) : l('Ainda não votou', 'Has not voted yet')}</span>
              </span>
              {s ? <CircleCheck size={18} className="text-laranja" aria-hidden /> : <span className="ao-vivo size-2 rounded-full bg-laranja" />}
            </div>
          ) : null
        })}
        {espera}
      </div>
    )
  }

  if (jaVotei) {
    const outro = capitao(p, meuLado === 'A' ? 'B' : 'A')
    const outroVoto = outro && p.submissoes.find((s) => s.capitaoId === outro.perfilId)
    return (
      <div className="flex flex-col gap-3">
        <h2 className="eyebrow m-0">{l('VOTASTE NA EQUIPA', 'YOU VOTED FOR TEAM')} {jaVotei.vencedor}</h2>
        <div className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-laranja/32 bg-laranja/12 px-3.5">
          <CircleCheck size={18} className="text-laranja" aria-hidden />
          <span className="text-[13.5px] font-bold">{l('O teu voto está guardado', 'Your vote is saved')}</span>
        </div>
        {!outroVoto && (
          <div className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
            <Hourglass size={17} className="text-laranja" aria-hidden />
            <span className="flex-1 text-[13.5px]">{l(`À espera de ${outro ? nomeJogador(outro) : 'o outro capitão'} votar.`, `Waiting for ${outro ? nomeJogador(outro) : 'the other captain'} to vote.`)}</span>
          </div>
        )}
        {espera}
        <p className="m-0 text-[12.5px] text-mudo">{l('O voto só confirma que o jogo acabou. Quem ganhou e o resultado em rondas vêm da API: se alguém votar na equipa errada, a API corrige.', 'The vote only confirms the game is over. The winner and the round score come from the API: if someone votes for the wrong team, the API corrects it.')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <h2 className="eyebrow m-0">{l('QUEM GANHOU?', 'WHO WON?')}</h2>
      <div role="radiogroup" aria-label={l('Equipa vencedora', 'Winning team')} className="flex flex-1 flex-wrap items-stretch gap-3.5">
        {(['A', 'B'] as const).map((eq) => {
          const c = capitao(p, eq)
          const marcada = escolha === eq
          return (
            <button
              key={eq}
              type="button"
              role="radio"
              aria-checked={marcada}
              onClick={() => setEscolha(eq)}
              className={`relative flex min-h-[200px] min-w-0 flex-[1_1_240px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[18px] border px-4 py-5 text-texto transition-colors ${marcada ? 'border-laranja/60 bg-laranja/10' : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.05]'}`}
            >
              {marcada && <span className="absolute top-3 right-3 rounded-[5px] bg-laranja px-2 py-[3px] font-mono text-[9.5px] font-extrabold tracking-[0.1em] text-escuro-laranja">{l('VENCEDOR', 'WINNER')}</span>}
              <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>{l('EQUIPA', 'TEAM')} {eq}{meuLado === eq ? ` · ${l('A TUA', 'YOURS')}` : ''}</span>
              <span className="font-mono text-[88px] leading-none font-semibold tracking-[-0.05em]" style={{ color: marcada ? '#ffb592' : '#f3f0eb' }}>{eq}</span>
              <span className="text-[13px] text-[#a6a19a]">{l('capitão', 'captain')} {c ? nomeJogador(c) : '?'} · {l('média', 'average')} {nomeRank(tierMedio(equipa(p, eq).map((j) => j.tier)))}</span>
            </button>
          )
        })}
      </div>
      {espera}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
        <span className="max-w-[420px] text-[12.5px] text-mudo">{l('Votar só confirma que o jogo acabou. A API define o resultado e quem ganhou, por isso, se te enganares, ela corrige.', 'Voting only confirms the game is over. The API sets the score and the winner, so if you get it wrong, it corrects you.')}</span>
        <button type="button" disabled={!escolha || aEnviar} onClick={enviar} className="btn btn-primario !h-[52px] !rounded-[13px] !px-[26px] !text-[15.5px] !font-extrabold">
          <Send size={16} aria-hidden />{escolha ? l(`Confirmar: ganhou a Equipa ${escolha}`, `Confirm: Team ${escolha} won`) : l('Escolhe a equipa vencedora', 'Pick the winning team')}
        </button>
      </div>
    </div>
  )
}

const pct = (v: number | null | undefined) => (v != null ? `${v}%` : '-')

/** As colunas da tabela da partida, com a explicação de cada uma ao passar o rato. */
const colunas = (): { rotulo: string; titulo: string; largura: number }[] => [
  { rotulo: 'RS', titulo: l('Rangify Score: ACS, KDA, KAST e trades comparados com a média desta partida (100 é a média). Dá de -6 a +6 pontos.', 'Rangify Score: ACS, KDA, KAST and trades compared with this match average (100 is average). Worth -6 to +6 points.'), largura: 52 },
  { rotulo: 'K/D/A', titulo: l('Kills, mortes e assistências', 'Kills, deaths and assists'), largura: 92 },
  { rotulo: 'ACS', titulo: l('Average Combat Score: pontuação de combate por ronda', 'Average Combat Score per round'), largura: 54 },
  { rotulo: 'KAST', titulo: l('Rondas com kill, assistência, sobrevivência ou troca', 'Rounds with a kill, assist, survival or trade'), largura: 58 },
  { rotulo: 'HS%', titulo: l('Percentagem de tiros na cabeça', 'Headshot percentage'), largura: 54 },
  { rotulo: 'Trades', titulo: l('Kills de troca: mataste quem tinha matado um colega há menos de 5 s', 'Trade kills: you killed whoever killed a teammate less than 5 s before'), largura: 58 },
  { rotulo: 'FB', titulo: l('First bloods: a primeira kill da ronda', 'First bloods: the first kill of the round'), largura: 42 },
  { rotulo: l('Pontos', 'Points'), titulo: l('Pontos Rangify ganhos ou perdidos', 'Rangify points won or lost'), largura: 64 },
]

function LinhaEstatisticas({ j, eu }: { j: JogadorPartida; eu: string }) {
  const num = 'px-2 text-right font-mono text-[13px] tabular-nums'
  return (
    <tr className={j.perfilId === eu ? 'bg-laranja/8' : ''}>
      <td className="py-2 pr-2 pl-3">
        <Link to={caminhoPerfil(j.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline hover:text-pessego">
          <Iniciais nome={nomeJogador(j)} equipa={j.equipa} tamanho={28} url={j.avatarUrl} perfilId={j.perfilId} />
          <IconeAgente nome={j.agente} tamanho={24} />
          <span className="truncate text-[13.5px] font-semibold">{nomeJogador(j)}</span>
          {j.capitao && <span className="font-mono text-[11px] font-bold text-laranja">(C)</span>}
          {j.mvp && <SeloMvp tamanho={20} perfilId={j.perfilId} />}
        </Link>
      </td>
      <td className={`${num} font-semibold ${(j.rangifyScore ?? 0) >= 100 ? 'text-pessego' : 'text-suave'}`}>{j.rangifyScore ?? '-'}</td>
      <td className={num}>{j.kills ?? '-'}/{j.deaths ?? '-'}/{j.assists ?? '-'}</td>
      <td className={num}>{j.acs ?? '-'}</td>
      <td className={num}>{pct(j.kastPct)}</td>
      <td className={num}>{pct(j.hsPct)}</td>
      <td className={num}>{j.trades ?? '-'}</td>
      <td className={num}>{j.firstBloods ?? '-'}</td>
      <td title={j.deltaPontos != null && j.deltaDesempenho != null ? l(`Resultado e rank: ${comSinal(j.deltaPontos - j.deltaDesempenho)} · Desempenho: ${comSinal(j.deltaDesempenho)}`, `Result and rank: ${comSinal(j.deltaPontos - j.deltaDesempenho)} · Performance: ${comSinal(j.deltaDesempenho)}`) : undefined} className={`pr-3 pl-2 text-right font-mono text-[13.5px] font-bold tabular-nums ${(j.deltaPontos ?? 0) > 0 ? 'text-vitoria' : 'text-derrota'}`}>{j.deltaPontos != null ? comSinal(j.deltaPontos) : '-'}</td>
    </tr>
  )
}

/** As duas equipas com as mesmas larguras de coluna, para os números ficarem alinhados de uma tabela para a outra. */
export function TabelaPartida({ p, eu }: { p: Partida; eu: string }) {
  const COLUNAS = colunas()
  return (
    <div className="flex flex-col gap-4 overflow-x-auto">
      {(['A', 'B'] as const).map((eq) => (
        <table key={eq} className="w-full min-w-[840px] table-fixed border-collapse">
          <colgroup>
            <col />
            {COLUNAS.map((c) => <col key={c.rotulo} style={{ width: c.largura }} />)}
          </colgroup>
          <caption className={`pb-2 text-left font-mono text-[11px] font-bold tracking-[0.14em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>
            {l('EQUIPA', 'TEAM')} {eq} · {p.resultadoA != null ? (eq === 'A' ? p.resultadoA : p.resultadoB) : '-'} {l('RONDAS', 'ROUNDS')} {p.vencedor === eq ? `· ${l('VITÓRIA', 'WIN')} ` : ''}
            <span className="font-medium text-mudo">· {l('MÉDIA', 'AVERAGE')} {nomeRank(tierMedio(equipa(p, eq).map((j) => j.tier))).toUpperCase()}</span>
            {ladoInicial(p, eq) && (
              <span className="font-medium text-mudo"> · {ladoInicial(p, eq) === 'ataque' ? l('COMEÇOU A ATACAR', 'STARTED ON ATTACK') : l('COMEÇOU A DEFENDER', 'STARTED ON DEFENCE')}{p.lado?.equipa === eq && <span className="ml-1.5 rounded-[5px] border border-laranja/40 bg-laranja/12 px-1.5 py-px text-pessego">{l('ESCOLHEU O LADO', 'PICKED THE SIDE')}</span>}</span>
            )}
          </caption>
          <thead>
            <tr className="rotulo text-left">
              <th scope="col" className="py-1.5 pl-3 font-normal">{l('Jogador', 'Player')}</th>
              {COLUNAS.map((c, i) => (
                <th key={c.rotulo} scope="col" title={c.titulo} className={`cursor-help text-right font-normal ${i === COLUNAS.length - 1 ? 'pr-3' : 'px-2'}`}>{c.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
            {[...equipa(p, eq)].sort((x, y) => (y.rangifyScore ?? 0) - (x.rangifyScore ?? 0) || (y.acs ?? 0) - (x.acs ?? 0)).map((j) => <LinhaEstatisticas key={j.perfilId} j={j} eu={eu} />)}
          </tbody>
        </table>
      ))}
    </div>
  )
}

/** RESULT_SUBMISSION, DISPUTE, PROCESSING_API e COMPLETED. */
export function Resultado({ p, eu }: { p: Partida; eu: string }) {
  const { fecharResumo } = usePartida()
  const minha = p.jogadores.find((j) => j.perfilId === eu)
  const min = minutos(p)
  const cap = souCapitao(p, eu)

  if (p.estado === 'COMPLETED') {
    const venci = minha?.equipa === p.vencedor
    // O resultado lê-se sempre do lado de quem está a ver: as rondas da sua equipa primeiro.
    const placar = minha?.equipa === 'B' ? `${p.resultadoB}-${p.resultadoA}` : `${p.resultadoA}-${p.resultadoB}`
    return (
      <div className="flex flex-col gap-[18px]">
        <Cabeca
          p={p}
          eyebrow={`${l('TERMINADA', 'FINISHED')} · ${p.mapa?.toUpperCase()}${min ? ` · ${min} MIN` : ''}${p.fila === 'ranked' ? ' · RANKED' : ''}${p.simulada ? ` · ${l('SIMULAÇÃO', 'SIMULATION')}` : ''}`}
          titulo={venci ? `${l('Vitória', 'Win')}, ${placar}` : `${l('Derrota', 'Loss')}, ${placar}`}
          texto={p.simulada ? l('Partida de teste: os pontos e as estatísticas contam. Remove-a para voltar tudo atrás.', 'Test match: points and stats count. Remove it to undo everything.') : p.fila === 'ranked' ? l('Resultado confirmado. Os pontos já estão na Tabela Ranked.', 'Result confirmed. The points are already on the Ranked leaderboard.') : l('Resultado confirmado. Os pontos já estão na tabela.', 'Result confirmed. The points are already on the leaderboard.')}
          direita={minha?.deltaPontos != null && (
            <div className="flex flex-col items-end gap-1 rounded-xl border border-white/12 bg-[rgba(9,9,11,0.6)] px-5 py-3">
              <span className="rotulo">{l('Os teus pontos', 'Your points')}{p.fila === 'ranked' ? ' · RANKED' : ''}</span>
              <span className={`font-mono text-[34px] leading-none font-semibold ${minha.deltaPontos > 0 ? 'text-vitoria' : 'text-derrota'}`}>{comSinal(minha.deltaPontos)}</span>
              {minha.deltaDesempenho != null && (
                <span className="font-mono text-[11.5px] text-mudo">
                  {comSinal(minha.deltaPontos - minha.deltaDesempenho)} {l('resultado e rank', 'result and rank')} · <span className={minha.deltaDesempenho >= 0 ? 'text-pessego' : 'text-derrota'}>{comSinal(minha.deltaDesempenho)}</span> RS {minha.rangifyScore}
                </span>
              )}
            </div>
          )}
        />
        <section className="painel flex flex-col gap-4 p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">{l('ESTATÍSTICAS DA PARTIDA', 'MATCH STATS')}</span>
              <span className="text-[13px] text-mudo">{l('Tirados da Henrik Dev API. O Rangify Score (RS) junta o ACS, o KDA, o KAST e os trades: 100 é a média da partida.', 'From the Henrik Dev API. The Rangify Score (RS) combines ACS, KDA, KAST and trades: 100 is the match average.')}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/partidas?p=${p.id}`} className="btn btn-fantasma !min-h-9 !px-3 !text-[13px]">{l('Ver no histórico', 'View in history')}</Link>
              <button type="button" className="btn btn-primario !min-h-9 !px-4 !text-[13px]" onClick={fecharResumo}><Trophy size={15} aria-hidden />{l('Voltar à fila', 'Back to queue')}</button>
            </div>
          </div>
          <TabelaPartida p={p} eu={eu} />
        </section>
      </div>
    )
  }

  if (p.estado === 'DISPUTE') {
    return (
      <div className="flex flex-col gap-[18px]">
        <Cabeca p={p} eyebrow={`${l('DISPUTA', 'DISPUTE')} · ${p.mapa?.toUpperCase()}`} titulo={l('A API não encontrou a partida', 'The API could not find the match')} texto={l('A partida está nas mãos da staff, que compara com os dados oficiais e decide.', 'The match is in the staff\'s hands; they compare it with the official data and decide.')} />
        <section className="painel flex flex-col gap-3.5 p-[22px]">
          <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.16em] text-derrota"><Scale size={14} aria-hidden />{l('VOTOS DOS CAPITÃES', 'CAPTAINS\' VOTES')}</span>
          {p.submissoes.map((s) => {
            const c = p.jogadores.find((j) => j.perfilId === s.capitaoId)
            return (
              <div key={s.capitaoId} className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
                {c && <Iniciais nome={nomeJogador(c)} equipa={c.equipa} tamanho={30} url={c.avatarUrl} perfilId={c.perfilId} />}
                <span className="flex-1 text-[13.5px] font-bold">{c ? nomeJogador(c) : '?'} · {l('capitão', 'captain')} {c?.equipa}</span>
                <span className="font-mono text-[15px] font-semibold">{l('Equipa', 'Team')} {s.vencedor}</span>
              </div>
            )
          })}
          <p className="m-0 text-[13px] text-mudo">{l('Não precisas de fazer nada. Quando a disputa for resolvida, a partida aparece no teu histórico.', 'You do not need to do anything. When the dispute is resolved, the match shows up in your history.')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-fantasma !min-h-9 !px-3 !text-[13px]" onClick={fecharResumo}>{l('Fechar', 'Close')}</button>
          </div>
        </section>
      </div>
    )
  }

  if (p.estado === 'PROCESSING_API') {
    return (
      <div className="flex flex-col gap-[18px]">
        <Cabeca p={p} eyebrow={`${l('A PROCESSAR', 'PROCESSING')} · ${p.mapa?.toUpperCase()}`} titulo={l('Jogo confirmado', 'Game confirmed')} texto={l('Os capitães confirmaram que o jogo acabou. O resultado e quem ganhou vêm da API.', 'The captains confirmed the game is over. The score and the winner come from the API.')} />
        <section className="painel flex items-center gap-4 p-[22px]" role="status">
          <LoaderCircle size={28} className="shrink-0 animate-spin text-laranja" aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold">{l('A procurar a partida na Henrik Dev API', 'Looking up the match on the Henrik Dev API')}</span>
            <span className="text-[13px] text-mudo">{l('Estatísticas e missões. Os pontos entram daqui a pouco.', 'Stats and missions. The points come in shortly.')}</span>
          </span>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Cabeca
        p={p}
        eyebrow={`${l('RESULTADO', 'RESULT')} · ${p.mapa?.toUpperCase()}${min ? ` · ${min} MIN` : ''}`}
        titulo={l('Quem ganhou?', 'Who won?')}
        texto={l('O bloqueio de 15 minutos já terminou. Os capitães confirmam que o jogo acabou e a API diz o resultado.', 'The 15-minute lock is over. The captains confirm the game is over and the API gives the score.')}
        direita={cap && !p.automatica ? <Chip tom="laranja">{l('A votar como capitão', 'Voting as captain')} {cap}</Chip> : undefined}
      />
      {/* Lado a lado com a mesma altura: o espaço a mais vai para os cartões das rondas. */}
      <div className="flex flex-wrap items-stretch gap-4">
        <section className="painel flex min-w-0 flex-[2_1_560px] flex-col gap-5 p-[26px]">
          <Submeter p={p} eu={eu} />
        </section>
        <section className="painel flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]">
          <div className="flex flex-col gap-[5px]">
            <span className="eyebrow">{l('PONTOS EM JOGO', 'POINTS AT STAKE')}</span>
            <h2 className="m-0 text-[18px] font-extrabold tracking-[-0.02em]">{l('Se a tua equipa ganhar', 'If your team wins')}</h2>
          </div>
          <Previsao p={p} a={minha?.equipa === 'B' ? 11 : 13} b={minha?.equipa === 'B' ? 13 : 11} eu={eu} />
        </section>
      </div>
    </div>
  )
}
