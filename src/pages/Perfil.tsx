import { BadgeCheck, Flag, RefreshCw, Shield, Swords, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Desempenho, OndeJogaMelhor } from '@/components/DesempenhoPerfil'
import { EditarPerfil } from '@/components/EditarPerfil'
import { GraficoForma } from '@/components/GraficoForma'
import { LinhaPartida } from '@/components/LinhaPartida'
import { FundoBanner, TituloJogador } from '@/components/Cosmeticos'
import { EmDireto } from '@/components/AoVivo'
import { Avatar, Cabecalho, Carregando, Chip, LinkSeta, Modal, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { avisarMudanca, dados, type FilaTipo } from '@/lib/data'
import { caminhoPerfil, nomeJogador, riotIdDoCaminho, tagJogador } from '@/lib/partida'
import { PONTOS_INICIAIS, comSinal } from '@/lib/pontos'
import { nomeRegiao } from '@/lib/regioes'
import { HORAS_CACHE_RANK } from '@/lib/regras'
import { l, locale, nomeFuncaoJogo } from '@/lib/idioma'
import { haQuanto } from '@/lib/tempo'

const nomesFuncao = () => ({ owner: 'Owner', dev: 'Dev', mod: 'Mod', verified: l('Verificado', 'Verified'), user: l('Jogador', 'Player') })
/** Os motivos vão para a staff em português; só o texto mostrado muda com a língua. */
const MOTIVOS = ['Abandono', 'Resultado falso', 'Comportamento', 'Batota', 'Outro']
const MOTIVOS_EN: Record<string, string> = { Abandono: 'Abandoning', 'Resultado falso': 'False result', Comportamento: 'Behaviour', Batota: 'Cheating', Outro: 'Other' }

function Denunciar({ perfilId, nome }: { perfilId: string; nome: string }) {
  const acao = useAcao()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [detalhes, setDetalhes] = useState('')
  const enviar = async () => {
    const ok = await acao(async () => { await dados.denunciar(perfilId, motivo, detalhes); return true }, l('Denúncia enviada à staff.', 'Report sent to the staff.'))
    if (ok) { setAberto(false); setDetalhes('') }
  }
  return (
    <>
      <button type="button" className="btn btn-fantasma" onClick={() => setAberto(true)}><Flag size={16} className="text-laranja" aria-hidden />{l('Denunciar', 'Report')}</button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={`${l('Denunciar', 'Report')} ${nome}`} eyebrow={l('DENÚNCIA', 'REPORT')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Motivo', 'Reason')}
            <select className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>{MOTIVOS.map((m) => <option key={m} value={m}>{l(m, MOTIVOS_EN[m])}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('O que aconteceu', 'What happened')}
            <textarea className="campo !h-28 py-3" value={detalhes} onChange={(e) => setDetalhes(e.target.value)} placeholder={l('Partida, ronda e o que viste. Quanto mais concreto, melhor.', 'Match, round and what you saw. The more specific, the better.')} />
          </label>
          <p className="m-0 text-[12.5px] text-mudo">{l('Só a staff vê as denúncias. Denúncias falsas também dão castigo.', 'Only the staff sees reports. False reports are penalised too.')}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-fantasma" onClick={() => setAberto(false)}>{l('Cancelar', 'Cancel')}</button>
            <button type="submit" className="btn btn-primario" disabled={detalhes.trim().length < 10}>{l('Enviar denúncia', 'Send report')}</button>
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
  const alvo = useCarregar(() => dados.perfilPorRiotId(riotId), [riotId, eu?.pontos, eu?.rankAtualizadoEm], ['perfil', 'partida'], { chave: `perfil:${riotId}:${eu?.pontos}:${eu?.rankAtualizadoEm}` })
  const p = alvo.valor
  const id = p?.id ?? ''
  // O filtro das estatísticas: as duas filas juntas, só a aberta ou só a ranked.
  const [filtro, setFiltro] = useState<'todas' | FilaTipo>('todas')
  const fila = filtro === 'todas' ? null : filtro
  const stats = useCarregar(() => (id ? dados.estatisticas(id, fila) : Promise.resolve(null)), [id, filtro], ['partida'], { chave: `estatisticas:${id}:${filtro}` })
  const forma = useCarregar(() => (id ? dados.forma(id, 20, fila) : Promise.resolve([])), [id, filtro], ['partida'], { chave: `forma:${id}:20:${filtro}` })
  const historico = useCarregar(() => (id ? dados.partidas({ minhas: true, perfilId: id, fila, limite: 8 }) : Promise.resolve(null)), [id, filtro], ['partida'], { chave: `partidas:perfil:${id}:${filtro}` })
  const amigos = useCarregar(() => dados.amigos(), [], ['amigos'], { chave: 'amigos' })

  if (!riot && eu?.riotId) return <Navigate to={caminhoPerfil(eu.riotId)} replace />
  if (alvo.carregando && !p) return <Carregando />
  if (!p) return <Vazio icone={<Shield size={22} />} titulo={l('Jogador não encontrado', 'Player not found')} texto={l(`Não há ninguém no hub com o Riot ID ${riotId}.`, `There is nobody on the hub with the Riot ID ${riotId}.`)} />

  const souEu = p.id === eu?.id
  const amizade = amigos.valor?.find((a) => a.perfil.id === p.id)
  const s = stats.valor
  const ganho = p.pontos - PONTOS_INICIAIS
  // A ranked só aparece no perfil de quem já jogou nela; o registo junta as duas filas.
  const comRanked = p.vitoriasRanked + p.derrotasRanked > 0
  const ganhoRanked = p.pontosRanked - PONTOS_INICIAIS
  const vitoriasTodas = p.vitorias + p.vitoriasRanked
  const derrotasTodas = p.derrotas + p.derrotasRanked
  // A posição vive dentro dos pontos de cada fila (e não em mosaicos à parte).
  const posAberta = s && p.vitorias + p.derrotas > 0 ? l(`#${s.posicao} de ${s.totalJogadores} na tabela`, `#${s.posicao} of ${s.totalJogadores} on the board`) : ''
  const posRanked = s?.posicaoRanked ? l(`#${s.posicaoRanked} de ${s.totalRanked} na tabela`, `#${s.posicaoRanked} of ${s.totalRanked} on the board`) : ''
  const verde = (n: number) => (n >= 0 ? 'text-vitoria' : 'text-derrota')
  const taxa = s && s.partidas ? l(`${Math.round((s.vitorias / s.partidas) * 100)}% de vitórias`, `${Math.round((s.vitorias / s.partidas) * 100)}% win rate`) : ''
  const registo = filtro === 'aberta' ? [p.vitorias, p.derrotas] : filtro === 'ranked' ? [p.vitoriasRanked, p.derrotasRanked] : [vitoriasTodas, derrotasTodas]
  const tiles: [string, string, string, string, string?][] = [
    ...(filtro !== 'ranked' ? [[comRanked ? l('Pontos · aberta', 'Points · open') : l('Pontos', 'Points'), String(p.pontos), comSinal(ganho) + l(' desde 1000', ' since 1000'), verde(ganho), posAberta] as [string, string, string, string, string]] : []),
    ...(comRanked && filtro !== 'aberta' ? [[l('Pontos · ranked', 'Points · ranked'), String(p.pontosRanked), comSinal(ganhoRanked) + l(' desde 1000', ' since 1000'), verde(ganhoRanked), posRanked] as [string, string, string, string, string]] : []),
    [l('Registo', 'Record'), `${registo[0]}${l('V', 'W')}·${registo[1]}${l('D', 'L')}`, filtro === 'todas' && comRanked ? l(`${p.vitoriasRanked}V-${p.derrotasRanked}D na ranked`, `${p.vitoriasRanked}W-${p.derrotasRanked}L in ranked`) : taxa, 'text-mudo'],
    ['KDA', s?.kda != null ? s.kda.toFixed(2) : '-', s?.acs != null ? l(`${Math.round(s.acs)} ACS de média`, `${Math.round(s.acs)} average ACS`) : '', 'text-mudo'],
    ['K/D', s?.kd != null ? s.kd.toFixed(2) : '-', s?.killsMedia != null && s?.mortesMedia != null ? l(`${s.killsMedia.toFixed(1)} kills · ${s.mortesMedia.toFixed(1)} mortes por jogo`, `${s.killsMedia.toFixed(1)} kills · ${s.mortesMedia.toFixed(1)} deaths per game`) : '', 'text-mudo'],
    ['Rangify Score', s?.rangifyScore != null ? String(Math.round(s.rangifyScore)) : '-', s?.melhorRs != null ? l(`melhor: ${s.melhorRs}`, `best: ${s.melhorRs}`) : l('100 é a média', '100 is average'), 'text-mudo'],
    ['MVP', s ? String(s.mvps) : '-', s ? `${s.firstBloods} first bloods` : '', 'text-mudo'],
  ]

  return (
    <>
      <FundoBanner perfilId={p.id}>
      <Cabecalho
        migalhas={[l('Conta', 'Account'), souEu ? l('O teu perfil', 'Your profile') : l('Perfil', 'Profile')]}
        titulo={<span className="flex flex-wrap items-center gap-4"><Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={64} destaque={souEu} perfilId={p.id} /><span className="flex flex-col gap-1.5"><span>{nomeJogador(p)}<span className="font-mono text-[0.45em] font-medium tracking-normal text-mudo">{tagJogador(p)}</span></span><TituloJogador perfilId={p.id} className="tracking-normal" /></span></span>}
        descricao={<span className="flex flex-wrap items-center gap-2">
          <RankBadge tier={p.tier} rr={p.rr} />
          <EmDireto perfilId={p.id} />
          <Chip>{nomeRegiao(p.regiao)}</Chip>
          {p.funcaoJogo && <Chip>{nomeFuncaoJogo(p.funcaoJogo)}</Chip>}
          {p.funcao !== 'user' && <Chip tom="laranja"><BadgeCheck size={12} aria-hidden />{nomesFuncao()[p.funcao]}</Chip>}
          <span className="text-[13px] text-mudo">{l('no hub desde', 'on the hub since')} {new Date(p.criadoEm).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}</span>
        </span>}
        acoes={souEu ? (
          <>
            <EditarPerfil onRiotMudou={(r) => navegar(caminhoPerfil(r), { replace: true })} />
            <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={16} className="text-laranja" aria-hidden />{l('Sincronizar rank', 'Sync rank')}</button>
          </>
        ) : (
          <>
            {!amizade && <button type="button" className="btn btn-suave" onClick={async () => { if (await acao(async () => { await dados.pedirAmizade(p.riotId ?? p.utilizador); return true }, l('Pedido de amizade enviado.', 'Friend request sent.'))) avisarMudanca('amigos') }}><UserPlus size={16} aria-hidden />{l('Adicionar amigo', 'Add friend')}</button>}
            {amizade && <Chip tom="laranja">{amizade.estado === 'aceite' ? l('Amigos', 'Friends') : amizade.direcao === 'enviado' ? l('Pedido enviado', 'Request sent') : l('Pediu-te amizade', 'Sent you a request')}</Chip>}
            <Denunciar perfilId={p.id} nome={nomeJogador(p)} />
          </>
        )}
      />
      </FundoBanner>

      {comRanked && (
        <div className="flex justify-end">
          <Segmentado rotulo={l('Estatísticas por fila', 'Stats by queue')} valor={filtro} onChange={setFiltro} opcoes={[{ valor: 'todas', texto: l('Todas as filas', 'All queues') }, { valor: 'aberta', texto: l('Aberta', 'Open') }, { valor: 'ranked', texto: 'Ranked' }]} />
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {tiles.map(([rotulo, valor, sub, cor, sub2]) => (
          <Painel key={rotulo} as="div" className="flex flex-col gap-1.5 !rounded-[14px] p-4">
            <span className="rotulo">{rotulo}</span>
            <span className="font-mono text-[26px] leading-none font-semibold tracking-[-0.03em]">{valor}</span>
            <span className={`text-[12px] ${cor}`}>{sub}</span>
            {sub2 && <span className="text-[12px] text-mudo">{sub2}</span>}
          </Painel>
        ))}
      </div>

      <Painel className="p-[22px]">
        {forma.valor && forma.valor.length >= 2
          ? <GraficoForma dados={forma.valor} />
          : <Vazio icone={<Swords size={22} />} titulo={l('Ainda sem forma para mostrar', 'No form to show yet')} texto={l('O gráfico aparece depois de duas partidas confirmadas.', 'The chart shows up after two confirmed matches.')} />}
      </Painel>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.56fr)]">
        {s && (
          <>
            <Desempenho s={s} />
            <OndeJogaMelhor s={s} />
          </>
        )}
        <Painel aria-labelledby="rg-perfil-hist" className="flex min-w-0 flex-col px-[22px] pt-[22px] pb-2">
          <div className="pb-3"><TituloPainel eyebrow={l('HISTÓRICO', 'HISTORY')} titulo={l('Partidas recentes', 'Recent matches')} id="rg-perfil-hist" /></div>
          {historico.valor?.linhas.length
            ? historico.valor.linhas.slice(0, 8).map((m) => <LinhaPartida key={m.id} m={m} />)
            : <div className="flex flex-1 items-center justify-center"><Vazio icone={<Swords size={22} />} titulo={l('Sem partidas', 'No matches')} /></div>}
          {souEu && <div className="mt-auto border-t border-white/6"><LinkSeta to="/partidas">{l('Ver histórico completo', 'View full history')}</LinkSeta></div>}
        </Painel>
        <Painel aria-labelledby="rg-perfil-rank" className="flex min-w-0 flex-col gap-3 p-[22px]">
          <TituloPainel eyebrow={l('RANK OFICIAL', 'OFFICIAL RANK')} titulo={l('Da Riot, só informativo', 'From Riot, informational only')} id="rg-perfil-rank" />
          <RankBadge tier={p.tier} rr={p.rr} />
          <p className="m-0 text-[13px] leading-normal text-suave">{l('Sincronizado', 'Synced')} {haQuanto(p.rankAtualizadoEm)}. {l(`Atualiza no máximo a cada ${HORAS_CACHE_RANK} horas, através da Henrik Dev API.`, `Updates at most every ${HORAS_CACHE_RANK} hours, through the Henrik Dev API.`)}</p>
          <p className="m-0 text-[13px] leading-normal text-mudo">{l('Não conta para a posição na tabela. Serve para escolher capitães e para atribuir os pontos de cada partida.', 'It does not count for your leaderboard position. It picks the captains and awards the points of each match.')}</p>
        </Painel>
      </div>
    </>
  )
}
