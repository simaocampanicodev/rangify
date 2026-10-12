import { CircleAlert, CircleCheck, Hourglass, LoaderCircle, Minus, Plus, Scale, Send, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { dados, type Equipa, type JogadorPartida, type Partida } from '@/lib/dados'
import { imagemMapa } from '@/lib/mapas'
import { caminhoPerfil, capitao, equipa, nomeJogador, souCapitao } from '@/lib/partida'
import { calcularPontos, comSinal } from '@/lib/pontos'
import { nomeRank, tierMedio } from '@/lib/ranks'
import { validarResultado } from '@/lib/regras'
import { Chip, SeloMvp } from '../ui'
import { Iniciais } from './comum'

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
  const tiers = (eq: Equipa) => equipa(p, eq).map((j) => j.tier)
  const vence: Equipa = a > b ? 'A' : 'B'
  return (
    <div className="flex flex-col gap-1">
      {(['A', 'B'] as const).map((eq) => (
        <div key={eq} className="flex flex-col gap-1">
          <span className={`px-0.5 pt-2.5 pb-1 font-mono text-[10px] font-bold tracking-[0.14em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>EQUIPA {eq} · {eq === vence ? 'VITÓRIA' : 'DERROTA'}</span>
          {equipa(p, eq).map((j) => {
            const r = calcularPontos(j.tier, tiers(eq === 'A' ? 'B' : 'A'), eq === vence)
            return (
              <div key={j.perfilId} className={`flex min-h-[38px] items-center gap-2.5 rounded-[9px] px-2 ${j.perfilId === eu ? 'bg-laranja/10' : ''}`}>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${j.perfilId === eu ? 'font-bold' : ''}`}>{nomeJogador(j)}</span>
                <span className="font-mono text-[11px] text-mudo">{nomeRank(j.tier)}</span>
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
  const [a, setA] = useState(13)
  const [b, setB] = useState(11)
  const [aEnviar, setAEnviar] = useState(false)
  const meuLado = souCapitao(p, eu)
  const jaSubmeti = p.submissoes.find((s) => s.capitaoId === eu)
  const v = validarResultado(a, b)
  const valores = { A: a, B: b }
  const mudar = { A: setA, B: setB }

  const enviar = async () => {
    setAEnviar(true)
    await acao(() => dados.submeterResultado(p.id, a, b), 'Resultado submetido.')
    await atualizar()
    setAEnviar(false)
  }

  if (!meuLado || p.automatica) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="eyebrow m-0">À ESPERA DOS CAPITÃES</h2>
        <p className="m-0 text-[14px] leading-normal text-suave">Só os capitães submetem o resultado. Assim que os dois baterem certo, os pontos entram na tua conta.</p>
        {(['A', 'B'] as const).map((eq) => {
          const c = capitao(p, eq)
          const s = c && p.submissoes.find((x) => x.capitaoId === c.perfilId)
          return c ? (
            <div key={eq} className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
              <Iniciais nome={nomeJogador(c)} equipa={eq} tamanho={30} url={c.avatarUrl} />
              <span className="flex flex-1 flex-col gap-px">
                <span className="text-[13.5px] font-bold">{nomeJogador(c)} · capitão {eq}</span>
                <span className="text-[12px] text-[#d0cbc4]">{s ? `Submeteu ${s.a}-${s.b}` : 'Ainda não submeteu'}</span>
              </span>
              {s ? <CircleCheck size={18} className="text-laranja" aria-hidden /> : <span className="ao-vivo size-2 rounded-full bg-laranja" />}
            </div>
          ) : null
        })}
      </div>
    )
  }

  if (jaSubmeti) {
    const outro = capitao(p, meuLado === 'A' ? 'B' : 'A')
    return (
      <div className="flex flex-col gap-3">
        <h2 className="eyebrow m-0">SUBMETESTE {jaSubmeti.a}-{jaSubmeti.b}</h2>
        <div className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-laranja/32 bg-laranja/12 px-3.5">
          <CircleCheck size={18} className="text-laranja" aria-hidden />
          <span className="text-[13.5px] font-bold">O teu resultado está guardado</span>
        </div>
        <div className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
          <Hourglass size={17} className="text-laranja" aria-hidden />
          <span className="flex-1 text-[13.5px]">À espera de {outro ? nomeJogador(outro) : 'o outro capitão'} confirmar.</span>
          <span className="ao-vivo size-2 rounded-full bg-laranja" />
        </div>
        <p className="m-0 text-[12.5px] text-mudo">Se o outro capitão submeter um resultado diferente, a partida vai para disputa e a staff decide.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="eyebrow m-0">RONDAS GANHAS</h2>
      <div className="flex flex-wrap items-stretch gap-3.5">
        {(['A', 'B'] as const).map((eq) => {
          const c = capitao(p, eq)
          const ganha = v.ok && (eq === 'A' ? a > b : b > a)
          return (
            <div key={eq} className={`relative flex min-w-0 flex-[1_1_240px] flex-col items-center gap-3.5 rounded-[18px] border px-4 py-5 ${ganha ? 'border-laranja/50 bg-laranja/8' : 'border-white/8 bg-white/[0.025]'}`}>
              {ganha && <span className="absolute top-3 right-3 rounded-[5px] bg-laranja px-2 py-[3px] font-mono text-[9.5px] font-extrabold tracking-[0.1em] text-escuro-laranja">VENCEDOR</span>}
              <span className="flex flex-col items-center gap-[3px]">
                <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>EQUIPA {eq}{meuLado === eq ? ' · A TUA' : ''}</span>
                <span className="text-[13px] text-[#a6a19a]">capitão {c ? nomeJogador(c) : '?'} · média {nomeRank(tierMedio(equipa(p, eq).map((j) => j.tier)))}</span>
              </span>
              <div className="flex items-center gap-3.5">
                <button type="button" aria-label={`Menos uma ronda para a Equipa ${eq}`} onClick={() => mudar[eq](Math.max(0, valores[eq] - 1))} className="grid size-[50px] cursor-pointer place-items-center rounded-[14px] border border-white/14 bg-white/[0.04] text-texto hover:bg-white/8">
                  <Minus size={20} aria-hidden />
                </button>
                <output aria-live="polite" className="min-w-[110px] text-center font-mono text-[88px] leading-none font-semibold tracking-[-0.05em]" style={{ color: ganha ? '#ffb592' : '#f3f0eb' }}>{valores[eq]}</output>
                <button type="button" aria-label={`Mais uma ronda para a Equipa ${eq}`} onClick={() => mudar[eq](Math.min(30, valores[eq] + 1))} className="grid size-[50px] cursor-pointer place-items-center rounded-[14px] border border-white/14 bg-white/[0.04] text-texto hover:bg-white/8">
                  <Plus size={20} aria-hidden />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <div role="status" className={`flex items-start gap-2.5 rounded-[14px] border px-4 py-3.5 ${v.ok ? 'border-laranja/32 bg-laranja/10' : 'border-derrota/32 bg-derrota/7'}`}>
        {v.ok ? <CircleCheck size={18} className="mt-px text-laranja" aria-hidden /> : <CircleAlert size={18} className="mt-px text-derrota" aria-hidden />}
        <span className="flex flex-col gap-0.5">
          <strong className={`text-[14.5px] ${v.ok ? 'text-pessego-claro' : 'text-[#ffc2cb]'}`}>{v.titulo}</strong>
          <span className="text-[13px] text-suave">{v.detalhe}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
        <span className="max-w-[380px] text-[12.5px] text-mudo">Depois de submeteres, o outro capitão tem de confirmar. Se não coincidir, a partida vai para disputa.</span>
        <button type="button" disabled={!v.ok || aEnviar} onClick={enviar} className="btn btn-primario !h-[52px] !rounded-[13px] !px-[26px] !text-[15.5px] !font-extrabold">
          <Send size={16} aria-hidden />Submeter {a}-{b}
        </button>
      </div>
    </div>
  )
}

const pct = (v: number | null | undefined) => (v != null ? `${v}%` : '-')

/** As colunas da tabela da partida, com a explicação de cada uma ao passar o rato. */
const COLUNAS: { rotulo: string; titulo: string; largura: number }[] = [
  { rotulo: 'K/D/A', titulo: 'Kills, mortes e assistências', largura: 92 },
  { rotulo: 'ACS', titulo: 'Average Combat Score: pontuação de combate por ronda', largura: 54 },
  { rotulo: 'KAST', titulo: 'Rondas com kill, assistência, sobrevivência ou troca', largura: 58 },
  { rotulo: 'HS%', titulo: 'Percentagem de tiros na cabeça', largura: 54 },
  { rotulo: 'Trades', titulo: 'Kills de troca: mataste quem tinha matado um colega há menos de 5 s', largura: 58 },
  { rotulo: 'FB', titulo: 'First bloods: a primeira kill da ronda', largura: 42 },
  { rotulo: 'Pontos', titulo: 'Pontos Rangify ganhos ou perdidos', largura: 64 },
]

function LinhaEstatisticas({ j, eu }: { j: JogadorPartida; eu: string }) {
  const num = 'px-2 text-right font-mono text-[13px] tabular-nums'
  return (
    <tr className={j.perfilId === eu ? 'bg-laranja/8' : ''}>
      <td className="py-2 pr-2 pl-3">
        <Link to={caminhoPerfil(j.riotId)} className="flex min-w-0 items-center gap-2.5 text-texto no-underline hover:text-pessego">
          <Iniciais nome={nomeJogador(j)} equipa={j.equipa} tamanho={28} url={j.avatarUrl} />
          <span className="truncate text-[13.5px] font-semibold">{nomeJogador(j)}</span>
          {j.capitao && <span className="font-mono text-[11px] font-bold text-laranja">(C)</span>}
          {j.mvp && <SeloMvp tamanho={20} />}
        </Link>
      </td>
      <td className={num}>{j.kills ?? '-'}/{j.deaths ?? '-'}/{j.assists ?? '-'}</td>
      <td className={num}>{j.acs ?? '-'}</td>
      <td className={num}>{pct(j.kastPct)}</td>
      <td className={num}>{pct(j.hsPct)}</td>
      <td className={num}>{j.trades ?? '-'}</td>
      <td className={num}>{j.firstBloods ?? '-'}</td>
      <td className={`pr-3 pl-2 text-right font-mono text-[13.5px] font-bold tabular-nums ${(j.deltaPontos ?? 0) > 0 ? 'text-vitoria' : 'text-derrota'}`}>{j.deltaPontos != null ? comSinal(j.deltaPontos) : '-'}</td>
    </tr>
  )
}

/** As duas equipas com as mesmas larguras de coluna, para os números ficarem alinhados de uma tabela para a outra. */
export function TabelaPartida({ p, eu }: { p: Partida; eu: string }) {
  return (
    <div className="flex flex-col gap-4 overflow-x-auto">
      {(['A', 'B'] as const).map((eq) => (
        <table key={eq} className="w-full min-w-[760px] table-fixed border-collapse">
          <colgroup>
            <col />
            {COLUNAS.map((c) => <col key={c.rotulo} style={{ width: c.largura }} />)}
          </colgroup>
          <caption className={`pb-2 text-left font-mono text-[11px] font-bold tracking-[0.14em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>
            EQUIPA {eq} · {p.resultadoA != null ? (eq === 'A' ? p.resultadoA : p.resultadoB) : '-'} RONDAS {p.vencedor === eq ? '· VITÓRIA' : ''}
          </caption>
          <thead>
            <tr className="rotulo text-left">
              <th scope="col" className="py-1.5 pl-3 font-normal">Jogador</th>
              {COLUNAS.map((c, i) => (
                <th key={c.rotulo} scope="col" title={c.titulo} className={`cursor-help text-right font-normal ${i === COLUNAS.length - 1 ? 'pr-3' : 'px-2'}`}>{c.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
            {[...equipa(p, eq)].sort((x, y) => (y.acs ?? 0) - (x.acs ?? 0)).map((j) => <LinhaEstatisticas key={j.perfilId} j={j} eu={eu} />)}
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
          eyebrow={`TERMINADA · ${p.mapa?.toUpperCase()}${min ? ` · ${min} MIN` : ''}${p.simulada ? ' · SIMULAÇÃO' : ''}`}
          titulo={venci ? `Vitória, ${placar}` : `Derrota, ${placar}`}
          texto={p.simulada ? 'Partida simulada: os pontos são calculados, mas não entram no ranking.' : 'Resultado confirmado. Os pontos já estão no ranking.'}
          direita={minha?.deltaPontos != null && (
            <div className="flex flex-col items-end gap-1 rounded-xl border border-white/12 bg-[rgba(9,9,11,0.6)] px-5 py-3">
              <span className="rotulo">{p.simulada ? 'Pontos (não contam)' : 'Os teus pontos'}</span>
              <span className={`font-mono text-[34px] leading-none font-semibold ${minha.deltaPontos > 0 ? 'text-vitoria' : 'text-derrota'} ${p.simulada ? 'line-through decoration-2 opacity-70' : ''}`}>{comSinal(minha.deltaPontos)}</span>
            </div>
          )}
        />
        <section className="painel flex flex-col gap-4 p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">ESTATÍSTICAS DA PARTIDA</span>
              <span className="text-[13px] text-mudo">KDA, ACS e first bloods tirados da Henrik Dev API.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/partidas?p=${p.id}`} className="btn btn-fantasma !min-h-9 !px-3 !text-[13px]">Ver no histórico</Link>
              <button type="button" className="btn btn-primario !min-h-9 !px-4 !text-[13px]" onClick={fecharResumo}><Trophy size={15} aria-hidden />Voltar à fila</button>
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
        <Cabeca p={p} eyebrow={`DISPUTA · ${p.mapa?.toUpperCase()}`} titulo="Os resultados não coincidem" texto="A partida está nas mãos da staff, que compara com os dados oficiais e decide." />
        <section className="painel flex flex-col gap-3.5 p-[22px]">
          <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.16em] text-derrota"><Scale size={14} aria-hidden />SUBMISSÕES</span>
          {p.submissoes.map((s) => {
            const c = p.jogadores.find((j) => j.perfilId === s.capitaoId)
            return (
              <div key={s.capitaoId} className="flex min-h-[52px] items-center gap-3 rounded-[13px] border border-white/8 bg-white/[0.03] px-3.5">
                {c && <Iniciais nome={nomeJogador(c)} equipa={c.equipa} tamanho={30} url={c.avatarUrl} />}
                <span className="flex-1 text-[13.5px] font-bold">{c ? nomeJogador(c) : '?'} · capitão {c?.equipa}</span>
                <span className="font-mono text-[18px] font-semibold">{s.a}-{s.b}</span>
              </div>
            )
          })}
          <p className="m-0 text-[13px] text-mudo">Não precisas de fazer nada. Quando a disputa for resolvida, a partida aparece no teu histórico.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-fantasma !min-h-9 !px-3 !text-[13px]" onClick={fecharResumo}>Fechar</button>
          </div>
        </section>
      </div>
    )
  }

  if (p.estado === 'PROCESSING_API') {
    return (
      <div className="flex flex-col gap-[18px]">
        <Cabeca p={p} eyebrow={`A PROCESSAR · ${p.mapa?.toUpperCase()}`} titulo={`Resultado confirmado: ${p.resultadoA}-${p.resultadoB}`} texto="Os dois capitães submeteram o mesmo resultado." />
        <section className="painel flex items-center gap-4 p-[22px]" role="status">
          <LoaderCircle size={28} className="shrink-0 animate-spin text-laranja" aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="text-[15px] font-bold">A procurar a partida na Henrik Dev API</span>
            <span className="text-[13px] text-mudo">KDA, ACS, first bloods e missões. Os pontos entram daqui a pouco.</span>
          </span>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Cabeca
        p={p}
        eyebrow={`RESULTADO · ${p.mapa?.toUpperCase()}${min ? ` · ${min} MIN` : ''}`}
        titulo="Qual foi o resultado final?"
        texto="O bloqueio de 15 minutos já terminou. Os dois capitães têm de submeter o mesmo resultado."
        direita={cap && !p.automatica ? <Chip tom="laranja">A submeter como capitão {cap}</Chip> : undefined}
      />
      <div className="flex flex-wrap items-start gap-4">
        <section className="painel flex min-w-0 flex-[2_1_560px] flex-col gap-5 p-[26px]">
          <Submeter p={p} eu={eu} />
        </section>
        <section className="painel flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]">
          <div className="flex flex-col gap-[5px]">
            <span className="eyebrow">PONTOS EM JOGO</span>
            <h2 className="m-0 text-[18px] font-extrabold tracking-[-0.02em]">Se a tua equipa ganhar</h2>
          </div>
          <Previsao p={p} a={minha?.equipa === 'B' ? 11 : 13} b={minha?.equipa === 'B' ? 13 : 11} eu={eu} />
        </section>
      </div>
    </div>
  )
}
