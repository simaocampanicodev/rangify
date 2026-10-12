import { BadgeCheck, Flag, RefreshCw, Shield, Swords, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Desempenho, PorMapa } from '@/components/DesempenhoPerfil'
import { EditarPerfil } from '@/components/EditarPerfil'
import { GraficoForma } from '@/components/GraficoForma'
import { LinhaPartida } from '@/components/LinhaPartida'
import { Avatar, Cabecalho, Carregando, Chip, LinkSeta, Modal, Painel, RankBadge, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados } from '@/lib/dados'
import { caminhoPerfil, nomeJogador, riotIdDoCaminho, tagJogador } from '@/lib/partida'
import { PONTOS_INICIAIS, comSinal } from '@/lib/pontos'
import { nomeRegiao } from '@/lib/regioes'
import { HORAS_CACHE_RANK } from '@/lib/regras'
import { haQuanto } from '@/lib/tempo'

const NOMES_FUNCAO = { owner: 'Owner', dev: 'Dev', mod: 'Mod', verified: 'Verificado', user: 'Jogador' }
const MOTIVOS = ['Abandono', 'Resultado falso', 'Comportamento', 'Batota', 'Outro']

function Denunciar({ perfilId, nome }: { perfilId: string; nome: string }) {
  const acao = useAcao()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalhes, setDetalhes] = useState('')
  const enviar = async () => {
    const ok = await acao(async () => { await dados.denunciar(perfilId, motivo, detalhes); return true }, 'Denúncia enviada à staff.')
    if (ok) { setAberto(false); setDetalhes('') }
  }
  return (
    <>
      <button type="button" className="btn btn-fantasma" onClick={() => setAberto(true)}><Flag size={16} className="text-laranja" aria-hidden />Denunciar</button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={`Denunciar ${nome}`} eyebrow="DENÚNCIA">
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            Motivo
            <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            O que aconteceu
            <textarea className="campo !h-28 py-3" value={detalhes} onChange={(e) => setDetalhes(e.target.value)} placeholder="Partida, ronda e o que viste. Quanto mais concreto, melhor." />
          </label>
          <p className="m-0 text-[12.5px] text-mudo">Só a staff vê as denúncias. Denúncias falsas também dão castigo.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-fantasma" onClick={() => setAberto(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primario" disabled={detalhes.trim().length < 10}>Enviar denúncia</button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function Perfil() {
  const { riot } = useParams()
  const navegar = useNavigate()
  const { perfil: eu } = useSessao()
  const acao = useAcao()
  const { sincronizar, aSincronizar } = useSincronizarRank()
  const riotId = riot ? riotIdDoCaminho(riot) : eu?.riotId ?? ''
  const alvo = useCarregar(() => dados.perfilPorRiotId(riotId), [riotId, eu?.pontos, eu?.rankAtualizadoEm], ['perfil', 'partida'])
  const p = alvo.valor
  const id = p?.id ?? ''
  const stats = useCarregar(() => (id ? dados.estatisticas(id) : Promise.resolve(null)), [id], ['partida'])
  const forma = useCarregar(() => (id ? dados.forma(id, 20) : Promise.resolve([])), [id], ['partida'])
  const historico = useCarregar(() => (id ? dados.partidas({ minhas: true, perfilId: id }) : Promise.resolve(null)), [id], ['partida'])
  const amigos = useCarregar(() => dados.amigos(), [], ['amigos'])

  if (!riot && eu?.riotId) return <Navigate to={caminhoPerfil(eu.riotId)} replace />
  if (alvo.carregando && !p) return <Carregando />
  if (!p) return <Vazio icone={<Shield size={22} />} titulo="Jogador não encontrado" texto={`Não há ninguém no hub com o Riot ID ${riotId}.`} />

  const souEu = p.id === eu?.id
  const amizade = amigos.valor?.find((a) => a.perfil.id === p.id)
  const s = stats.valor
  const ganho = p.pontos - PONTOS_INICIAIS

  return (
    <>
      <Cabecalho
        migalhas={['Conta', souEu ? 'O teu perfil' : 'Perfil']}
        titulo={<span className="flex flex-wrap items-center gap-4"><Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={64} destaque={souEu} /><span>{nomeJogador(p)}<span className="font-mono text-[0.45em] font-medium tracking-normal text-mudo">{tagJogador(p)}</span></span></span>}
        descricao={<span className="flex flex-wrap items-center gap-2">
          <RankBadge tier={p.tier} rr={p.rr} />
          <Chip>{nomeRegiao(p.regiao)}</Chip>
          {p.funcaoJogo && <Chip>{p.funcaoJogo}</Chip>}
          {p.funcao !== 'user' && <Chip tom="laranja"><BadgeCheck size={12} aria-hidden />{NOMES_FUNCAO[p.funcao]}</Chip>}
          <span className="text-[13px] text-mudo">no hub desde {new Date(p.criadoEm).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</span>
        </span>}
        acoes={souEu ? (
          <>
            <EditarPerfil onRiotMudou={(r) => navegar(caminhoPerfil(r), { replace: true })} />
            <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={16} className="text-laranja" aria-hidden />Sincronizar rank</button>
          </>
        ) : (
          <>
            {!amizade && <button type="button" className="btn btn-suave" onClick={() => acao(() => dados.pedirAmizade(p.riotId ?? p.utilizador), 'Pedido de amizade enviado.')}><UserPlus size={16} aria-hidden />Adicionar amigo</button>}
            {amizade && <Chip tom="laranja">{amizade.estado === 'aceite' ? 'Amigos' : amizade.direcao === 'enviado' ? 'Pedido enviado' : 'Pediu-te amizade'}</Chip>}
            <Denunciar perfilId={p.id} nome={nomeJogador(p)} />
          </>
        )}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {[
          ['Pontos', String(p.pontos), comSinal(ganho) + ' desde 1000', ganho >= 0 ? 'text-vitoria' : 'text-derrota'],
          ['Posição', s ? `#${s.posicao}` : '-', s ? `de ${s.totalJogadores} jogadores` : '', 'text-mudo'],
          ['Registo', `${p.vitorias}V · ${p.derrotas}D`, s && s.partidas ? `${Math.round((s.vitorias / s.partidas) * 100)}% de vitórias` : 'sem partidas', 'text-mudo'],
          ['KDA', s?.kda != null ? s.kda.toFixed(2) : '-', s?.acs != null ? `${Math.round(s.acs)} ACS de média` : '', 'text-mudo'],
          ['MVP', s ? String(s.mvps) : '-', s ? `${s.firstBloods} first bloods` : '', 'text-mudo'],
        ].map(([rotulo, valor, sub, cor]) => (
          <Painel key={rotulo} as="div" className="flex flex-col gap-1.5 !rounded-[14px] p-4">
            <span className="rotulo">{rotulo}</span>
            <span className="font-mono text-[26px] leading-none font-semibold tracking-[-0.03em]">{valor}</span>
            <span className={`text-[12px] ${cor}`}>{sub}</span>
          </Painel>
        ))}
      </div>

      <Painel className="p-[22px]">
        {forma.valor && forma.valor.length >= 2
          ? <GraficoForma dados={forma.valor} />
          : <Vazio icone={<Swords size={22} />} titulo="Ainda sem forma para mostrar" texto="O gráfico aparece depois de duas partidas confirmadas." />}
      </Painel>

      {s && (
        <div className="flex flex-wrap items-stretch gap-4">
          <Desempenho s={s} />
          <PorMapa s={s} />
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-4">
        <Painel aria-labelledby="rg-perfil-hist" className="flex min-w-0 flex-[2_1_540px] flex-col px-[22px] pt-[22px] pb-2">
          <div className="pb-3"><TituloPainel eyebrow="HISTÓRICO" titulo="Partidas recentes" id="rg-perfil-hist" /></div>
          {historico.valor?.linhas.length
            ? historico.valor.linhas.slice(0, 8).map((m) => <LinhaPartida key={m.id} m={m} />)
            : <div className="flex flex-1 items-center justify-center"><Vazio icone={<Swords size={22} />} titulo="Sem partidas" /></div>}
          {souEu && <div className="mt-auto border-t border-white/6"><LinkSeta to="/partidas">Ver histórico completo</LinkSeta></div>}
        </Painel>
        <Painel aria-labelledby="rg-perfil-rank" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-[22px]">
          <TituloPainel eyebrow="RANK OFICIAL" titulo="Da Riot, para o desnível" id="rg-perfil-rank" />
          <RankBadge tier={p.tier} rr={p.rr} />
          <p className="m-0 text-[13px] leading-normal text-suave">Sincronizado {haQuanto(p.rankAtualizadoEm)}. Atualiza no máximo a cada {HORAS_CACHE_RANK} horas, através da Henrik Dev API.</p>
          <p className="m-0 text-[13px] leading-normal text-mudo">Não conta para a posição no ranking. Serve para escolher capitães e para ajustar os pontos de cada partida.</p>
        </Painel>
      </div>
    </>
  )
}
