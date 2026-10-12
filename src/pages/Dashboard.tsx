import { ArrowRight, ArrowUpRight, Bell, Check, Clock, Globe, MessageCircle, RefreshCw, Shield, Swords, Target, Trophy, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartaoFila } from '@/components/Fila'
import { LinhaPartida } from '@/components/LinhaPartida'
import { NomeRangify } from '@/components/Marca'
import { BarraProgresso, BlocoIcone, BotaoAjuda, Cabecalho, Carregando, LinhasEsqueleto, LinkSeta, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados } from '@/lib/dados'
import { nomeJogador } from '@/lib/partida'
import { PONTOS_INICIAIS, comSinal } from '@/lib/pontos'
import { nomeRegiao } from '@/lib/regioes'
import { NOMES_ESTADO } from '@/lib/regras'
import { duracaoAte, fimDaSemana, haQuanto } from '@/lib/tempo'

function BarrasPontos({ deltas }: { deltas: number[] }) {
  const max = Math.max(30, ...deltas.map(Math.abs))
  const lista = [...Array(Math.max(0, 10 - deltas.length)).fill(null), ...deltas] as (number | null)[]
  return (
    <>
      <div role="img" aria-label={`Pontos ganhos e perdidos nas últimas ${deltas.length} partidas`} className="relative flex h-[66px] gap-[5px]">
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
      <div className="flex justify-between font-mono text-[10.5px] text-mudo"><span>10 partidas atrás</span><span>última</span></div>
    </>
  )
}

export function Dashboard() {
  const { perfil } = useSessao()
  const { partida, ativa } = usePartida()
  const [minhas, setMinhas] = useState<'minhas' | 'todas'>('minhas')
  const id = perfil?.id ?? ''
  const posicao = useCarregar(() => dados.posicao(id), [id, perfil?.pontos], ['partida'])
  const forma = useCarregar(() => dados.forma(id, 10), [id], ['partida'])
  const historico = useCarregar(() => dados.partidas({ minhas: minhas === 'minhas' }), [minhas], ['partida'], { minimo: 350 })
  const missoes = useCarregar(() => dados.missoes(), [], ['partida'])
  if (!perfil) return <Carregando />

  const nome = nomeJogador(perfil)
  const ganho = perfil.pontos - PONTOS_INICIAIS
  const semanais = (missoes.valor ?? []).filter((m) => m.ambito === 'semanal' && !m.concluida).slice(0, 3)
  const atalhos = [
    { para: '/ranking', titulo: 'Ranking', texto: <>Quem lidera a temporada, ordenado pelos pontos <NomeRangify className="text-laranja-claro" />.</>, icone: <Trophy size={19} /> },
    { para: '/partidas', titulo: 'Partidas', texto: 'O teu histórico e todos os jogos do hub, com KDA e ACS.', icone: <Clock size={19} /> },
    { para: '/missoes', titulo: 'Missões', texto: 'Objetivos da semana, como ganhar a equipas acima do teu rank.', icone: <Target size={19} /> },
    { para: '/amigos', titulo: 'Amigos', texto: 'Vê quem está na fila ou a jogar e compara-te no ranking.', icone: <Users size={19} /> },
  ]

  return (
    <>
      <Cabecalho
        migalhas={['Hub', 'Dashboard']}
        titulo={perfil.vitorias + perfil.derrotas ? `Bem-vindo de volta, ${nome}.` : `Bem-vindo, ${nome}.`}
        descricao="A próxima partida está a uma fila de distância. Aqui vês os teus pontos, as missões ativas e como correram os últimos jogos."
        acoes={
          <>
            <Link to="/amigos" aria-label="Pedidos e amigos" className="grid size-11 place-items-center rounded-[11px] border border-white/8 bg-white/[0.03] text-[#d9d4cd] hover:bg-white/8"><Bell size={18} aria-hidden /></Link>
            <Link to="/jogar" className="btn btn-primario">{ativa ? 'Voltar à partida' : 'Jogar agora'}</Link>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-laranja/32 bg-laranja/12 px-3 text-[12.5px] text-pessego-claro"><span className="size-[7px] rounded-full bg-laranja" />Temporada 1</span>
        {[
          [<Globe size={14} key="g" />, `Região ${nomeRegiao(perfil.regiao)}`],
          [<MessageCircle size={14} key="d" />, 'Discord ligado'],
          [<Check size={14} key="r" />, 'Riot ID ligado'],
          [<RefreshCw size={14} key="s" />, `Rank oficial sincronizado ${haQuanto(perfil.rankAtualizadoEm)}`],
        ].map(([icone, texto]) => (
          <span key={texto as string} className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-white/8 bg-white/[0.035] px-3 text-[12.5px] text-[#d0cbc4]">
            <span className="text-laranja">{icone}</span>{texto}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <Painel aria-labelledby="rg-proxima" className="flex min-w-0 flex-[2_1_540px] p-7">
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <span className="eyebrow">{ativa ? 'PARTIDA A DECORRER' : 'A TUA PRÓXIMA PARTIDA'}</span>
            <h2 id="rg-proxima" className="m-0 max-w-[460px] text-[31px] leading-[1.08] font-extrabold tracking-[-0.035em]">
              {ativa && partida ? `${partida.codigo}: ${NOMES_ESTADO[partida.estado]}` : 'Entra na fila e joga um 5v5 a sério.'}
            </h2>
            <p className="m-0 max-w-[470px] text-[14.5px] leading-[1.55] text-suave">
              Dez jogadores da mesma região, dois capitães, draft à vez e ban de mapas até sobrar um. Tudo validado pelo teu Riot ID.
            </p>
            {ativa ? (
              <div className="flex flex-wrap gap-2.5">
                <Link to="/jogar" className="btn btn-primario">Voltar à partida<ArrowRight size={16} aria-hidden /></Link>
                <BotaoAjuda topico="draft">Como funciona o draft</BotaoAjuda>
              </div>
            ) : (
              <CartaoFila compacto />
            )}
          </div>
        </Painel>

        <Painel aria-labelledby="rg-pts" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 p-6">
          <div className="flex items-center justify-between gap-2.5">
            <h2 id="rg-pts" className="eyebrow m-0">OS TEUS PONTOS</h2>
            <span className="font-mono text-[10.5px] text-mudo">TEMPORADA 1</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[54px] leading-none font-semibold tracking-[-0.05em]">{perfil.pontos}</span>
            <span className="text-[14px] text-mudo">pts</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-suave">
            <span className={`inline-flex h-6 items-center gap-1 rounded-[7px] border px-2 font-mono text-[12px] font-semibold ${ganho >= 0 ? 'border-vitoria/30 bg-vitoria/10 text-[#7ff0e4]' : 'border-derrota/30 bg-derrota/10 text-[#ffb3bf]'}`}>
              <ArrowUpRight size={13} className={ganho < 0 ? 'rotate-90' : ''} aria-hidden />{comSinal(ganho)}
            </span>
            desde os {PONTOS_INICIAIS} iniciais
          </div>
          {forma.valor && forma.valor.length > 0
            ? <BarrasPontos deltas={forma.valor.map((f) => f.delta)} />
            : <p className="m-0 text-[13px] text-mudo">Ainda sem partidas. A primeira vitória vale entre +12 e +30.</p>}
          <div className="flex flex-col gap-[11px] border-t border-white/7 pt-3.5">
            <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">Posição no ranking</span><span className="font-mono font-semibold">#{posicao.valor ?? '-'}</span></div>
            <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">Rank oficial</span><RankBadge tier={perfil.tier} /></div>
            <div className="flex items-center justify-between gap-2.5 text-[13.5px]"><span className="text-suave">Registo</span><span className="font-mono font-semibold">{perfil.vitorias}V · {perfil.derrotas}D</span></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LinkSeta to="/ranking">Ver ranking completo</LinkSeta>
          </div>
        </Painel>
      </div>

      <section aria-labelledby="rg-atalhos" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="rg-atalhos" className="m-0 text-[19px] font-bold tracking-[-0.02em]">Atalhos</h2>
          <span className="text-[13px] text-mudo">Sabes o que queres? Vai direto.</span>
        </div>
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

      <div className="flex flex-wrap items-start gap-4">
        <Painel aria-labelledby="rg-hist" className="flex min-w-0 flex-[2_1_540px] flex-col px-[22px] pt-[22px] pb-2">
          <div className="pb-3">
            <TituloPainel
              eyebrow="HISTÓRICO"
              titulo="Últimas partidas"
              id="rg-hist"
              direita={<Segmentado rotulo="Filtrar partidas" valor={minhas} onChange={setMinhas} opcoes={[{ valor: 'minhas', texto: 'As minhas' }, { valor: 'todas', texto: 'Todas' }]} />}
            />
          </div>
          {historico.carregando ? <LinhasEsqueleto tipo="partidas" n={4} /> : historico.valor?.linhas.length ? (
            historico.valor.linhas.slice(0, 5).map((m, i) => <LinhaPartida key={m.id} m={m} i={i} />)
          ) : (
            <Vazio icone={<Swords size={22} />} titulo="Ainda não jogaste" texto="Entra na fila: as tuas partidas aparecem aqui com o resultado e os pontos." />
          )}
          <div className="border-t border-white/6"><LinkSeta to="/partidas">Ver histórico completo</LinkSeta></div>
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Painel aria-labelledby="rg-missoes" className="flex flex-col gap-4 p-[22px]">
            <TituloPainel eyebrow="MISSÕES ATIVAS" titulo="Esta semana" id="rg-missoes" direita={<span className="font-mono text-[11px] text-mudo">renova em {duracaoAte(fimDaSemana().toISOString())}</span>} />
            {semanais.length ? semanais.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <div className="flex justify-between gap-3 text-[13.5px] leading-[1.4]">
                  <span className="text-marfim">{m.descricao}</span>
                  <span className="shrink-0 font-mono text-suave">{m.progresso}/{m.alvo}</span>
                </div>
                <BarraProgresso valor={m.progresso} alvo={m.alvo} rotulo={m.titulo} />
              </div>
            )) : <p className="m-0 text-[13.5px] text-mudo">{missoes.carregando ? 'A carregar…' : 'Missões da semana concluídas. Bom trabalho!'}</p>}
            <LinkSeta to="/missoes">Ver todas as missões</LinkSeta>
          </Painel>

          <Painel aria-labelledby="rg-novidades" className="relative flex flex-col gap-2.5 overflow-hidden px-[22px] py-5">
            <div className="flex items-center justify-between gap-2.5">
              <span className="eyebrow">NOVIDADES</span>
              <span className="font-mono text-[11px] text-mudo">1 SET</span>
            </div>
            <h2 id="rg-novidades" className="m-0 text-[16px] leading-[1.3] font-bold tracking-[-0.015em]">A Temporada 1 arrancou. Toda a gente começa com 1000 pontos.</h2>
            <p className="m-0 text-[13px] leading-normal text-[#a6a19a]">Ganhar a equipas acima do teu rank oficial vale mais. Perder contra elas custa menos.</p>
            <div className="flex items-center gap-2 pt-1 text-[12.5px] text-mudo"><Shield size={14} className="text-laranja" aria-hidden />Rank oficial só para o desnível, nunca para ordenar.</div>
          </Painel>
        </div>
      </div>
    </>
  )
}
