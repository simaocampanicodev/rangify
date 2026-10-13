import { Bot, Crown, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type EstatisticasPerfil, type Partida } from '@/lib/dados'
import { capitao, equipa, escolhidos, nomeJogador, tagJogador, vezDe } from '@/lib/partida'
import { corRank, nomeRank, tierMedio } from '@/lib/ranks'
import { SEGUNDOS_ESCOLHA, equipaDaEscolha } from '@/lib/regras'
import { emFalta } from '@/lib/tempo'
import { rgba } from '../ui'
import { ComCosmeticos, TituloJogador } from '../Cosmeticos'
import { ColunaEquipa, ICONE_FUNCAO, Iniciais } from './comum'
import { Relogio } from './Relogio'
import { l, nomeFuncaoJogo } from '@/lib/idioma'

function CartaoCapitao({ p, eq, vez }: { p: Partida; eq: 'A' | 'B'; vez: boolean }) {
  const c = capitao(p, eq)
  if (!c) return null
  const media = nomeRank(tierMedio(equipa(p, eq).map((j) => j.tier)))
  return (
    <div
      className="painel flex min-w-0 flex-1 basis-[250px] items-center gap-3.5 p-[18px] transition-[border-color,box-shadow] duration-300"
      style={vez ? { borderColor: 'rgba(255,91,31,0.55)', boxShadow: '0 0 40px -12px rgba(255,91,31,0.6)' } : undefined}
    >
      <Iniciais nome={nomeJogador(c)} equipa={eq} tamanho={58} url={c.avatarUrl} perfilId={c.perfilId} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className={`flex items-center gap-1.5 font-mono text-[10.5px] font-bold tracking-[0.16em] ${eq === 'A' ? 'text-laranja' : 'text-marfim'}`}>
          <Crown size={12} aria-hidden />{l('CAPITÃO', 'CAPTAIN')} {eq}
        </span>
        <span className="truncate text-[20px] font-extrabold tracking-[-0.02em]">
          {nomeJogador(c)}<span className="font-mono text-[12px] font-medium text-mudo">{tagJogador(c)}</span>
        </span>
        <span className="text-[12.5px] text-[#a6a19a]">{nomeRank(c.tier)} · {l('média da equipa', 'team average')} {media}</span>
      </span>
    </div>
  )
}

export function Draft({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const { atualizar } = usePartida()
  const agora = useAgora(250)
  const [stats, setStats] = useState<Record<string, EstatisticasPerfil>>({})
  const [aEscolher, setAEscolher] = useState<string | null>(null)

  const vez = vezDe(p)!
  const capVez = capitao(p, vez)
  const souEu = capVez?.perfilId === eu && !p.automatica
  const n = escolhidos(p)
  const restante = emFalta(p.prazoFase, agora)
  const livres = useMemo(
    () => p.jogadores.filter((j) => !j.equipa).sort((x, y) => y.tier - x.tier || y.pontos - x.pontos),
    [p.jogadores],
  )

  // KDA, vitórias e ACS de cada um, para os capitães decidirem.
  const ids = p.jogadores.map((j) => j.perfilId).join(',')
  useEffect(() => {
    let vivo = true
    Promise.all(ids.split(',').map(async (id) => [id, await dados.estatisticas(id)] as const))
      .then((lista) => { if (vivo) setStats(Object.fromEntries(lista)) })
      .catch(() => {})
    return () => { vivo = false }
  }, [ids])

  const escolher = async (id: string) => {
    setAEscolher(id)
    await acao(() => dados.escolherJogador(p.id, id))
    await atualizar()
    setAEscolher(null)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-label={l('Vez de escolher', 'Whose pick it is')} className="flex flex-wrap items-stretch gap-3.5">
        <CartaoCapitao p={p} eq="A" vez={vez === 'A'} />
        <div className="painel flex min-w-0 flex-[1.4_1_380px] items-center gap-5 px-[22px] py-[18px]">
          <Relogio restante={restante} total={SEGUNDOS_ESCOLHA} cor={vez === 'A' ? '#ff5b1f' : '#e6e1da'} />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${vez === 'A' ? 'text-laranja' : 'text-marfim'}`}>
              {l(`ESCOLHA ${n + 1} DE 8 · EQUIPA ${vez}`, `PICK ${n + 1} OF 8 · TEAM ${vez}`)}
            </span>
            <h1 className="m-0 text-[24px] leading-[1.1] font-extrabold tracking-[-0.03em]">
              {souEu ? l('É a tua vez de escolher', 'It is your pick') : l(`${capVez ? nomeJogador(capVez) : 'O capitão'} está a escolher`, `${capVez ? nomeJogador(capVez) : 'The captain'} is picking`)}
            </h1>
            <div role="img" aria-label={l(`Ordem do draft, escolha ${n + 1} de 8`, `Draft order, pick ${n + 1} of 8`)} className="flex flex-wrap gap-[5px]">
              {Array.from({ length: 8 }, (_, i) => {
                const e = equipaDaEscolha(i)
                const feita = i < n
                const atual = i === n
                return (
                  <span
                    key={i}
                    className="grid size-[34px] place-items-center rounded-[9px] border font-mono text-[10.5px] font-bold"
                    style={{
                      background: feita ? (e === 'A' ? 'rgba(255,91,31,0.22)' : 'rgba(255,255,255,0.1)') : atual ? 'rgba(255,91,31,0.12)' : 'transparent',
                      borderColor: atual ? '#ff5b1f' : feita ? 'transparent' : 'rgba(255,255,255,0.1)',
                      color: feita ? (e === 'A' ? '#ffb592' : '#e6e1da') : atual ? '#ffd2bd' : '#8a857e',
                    }}
                  >
                    {e}{i + 1}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
        <CartaoCapitao p={p} eq="B" vez={vez === 'B'} />
      </section>

      <div className="flex flex-wrap items-stretch gap-3.5">
        <ColunaEquipa eq="A" jogadores={equipa(p, 'A')} eu={eu} />
        <section aria-labelledby="rg-draft-livres" className="flex min-w-0 flex-[2.6_1_520px] flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 id="rg-draft-livres" className="eyebrow m-0">{l('JOGADORES DISPONÍVEIS', 'AVAILABLE PLAYERS')} · {livres.length}</h2>
            <span className="text-[12.5px] text-mudo">
              {souEu ? l('Escolhe um jogador. Se o tempo acabar, entra o rank oficial mais alto.', 'Pick a player. If time runs out, the highest official rank goes in.') : l('Acompanha o draft em direto.', 'Follow the draft live.')}
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {livres.map((j) => {
              const s = stats[j.perfilId]
              const cor = corRank(j.tier)
              return (
                <ComCosmeticos key={j.perfilId} perfilId={j.perfilId}>{(cz) => (
                <button
                  type="button"
                  data-assinatura={nomeJogador(j)}
                  disabled={!souEu || !!aEscolher}
                  onClick={() => escolher(j.perfilId)}
                  aria-label={`${l('Escolher', 'Pick')} ${nomeJogador(j)}, ${nomeRank(j.tier)}`}
                  className={`group relative flex flex-col gap-3 rounded-2xl border bg-[rgba(16,16,19,0.88)] p-3.5 text-left text-texto transition-[border-color,transform] duration-200 ${souEu ? 'cursor-pointer border-white/10 hover:-translate-y-0.5 hover:border-laranja/60' : 'cursor-default border-white/8'} disabled:opacity-100 ${cz.cartao}`}
                >
                  <span className="flex items-center gap-[11px]">
                    <Iniciais nome={nomeJogador(j)} equipa={null} tamanho={46} url={j.avatarUrl} perfilId={j.perfilId} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <TituloJogador perfilId={j.perfilId} className="truncate" />
                      <span className="cz-nome truncate text-[15px] font-extrabold">
                        {nomeJogador(j)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(j)}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] text-[#a6a19a]">
                        {j.funcaoJogo ? nomeFuncaoJogo(j.funcaoJogo) : l('Sem função preferida', 'No preferred role')}
                        {j.perfilId === eu && <span className="rounded bg-laranja px-1.5 py-px font-mono text-[9.5px] font-bold text-escuro-laranja">{l('TU', 'YOU')}</span>}
                        {j.bot && <Bot size={12} className="text-laranja" aria-label="bot" />}
                      </span>
                    </span>
                    {j.funcaoJogo && (
                      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-laranja/32 bg-laranja/12 text-laranja-claro">
                        {ICONE_FUNCAO[j.funcaoJogo]}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[11px] text-[#ece7e1]" style={{ borderColor: rgba(cor, 0.35), background: rgba(cor, 0.1) }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden><path d="M6 0.8 11 4.2 9.1 11.2H2.9L1 4.2Z" fill={cor} /></svg>
                      {nomeRank(j.tier)}
                    </span>
                    <span className="font-mono text-[13px] font-bold text-pessego">{j.pontos} pts</span>
                  </span>
                  <span className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] bg-white/6">
                    {[
                      ['KDA', s?.kda != null ? s.kda.toFixed(2) : '-'],
                      [l('VIT', 'WIN'), s && s.partidas ? `${Math.round((s.vitorias / s.partidas) * 100)}%` : '-'],
                      ['ACS', s?.acs != null ? Math.round(s.acs) : '-'],
                    ].map(([k, v]) => (
                      <span key={k} className="flex flex-col gap-0.5 bg-[#121215] px-2.5 py-2">
                        <span className="font-mono text-[9.5px] tracking-[0.12em] text-mudo">{k}</span>
                        <span className="font-mono text-[13px] font-semibold">{v}</span>
                      </span>
                    ))}
                  </span>
                  {souEu && (
                    <span className="flex h-[38px] items-center justify-center gap-2 rounded-[10px] border border-laranja/32 bg-laranja/12 text-[13px] font-bold text-pessego-claro transition-colors group-hover:bg-laranja group-hover:text-escuro-laranja">
                      <UserPlus size={15} aria-hidden />{aEscolher === j.perfilId ? l('A escolher…', 'Picking…') : l(`Escolher para a Equipa ${vez}`, `Pick for Team ${vez}`)}
                    </span>
                  )}
                </button>
                )}</ComCosmeticos>
              )
            })}
          </div>
        </section>
        <ColunaEquipa eq="B" jogadores={equipa(p, 'B')} eu={eu} />
      </div>
    </div>
  )
}
