import { Crown, Medal, Settings2, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Chave } from '@/components/torneios/Chave'
import { ChipEstado, Contagem, dataHoraCurta, dataLimite, formatoTexto, nomeFuncao, nomeGrupo, Papel, rotuloJogo } from '@/components/torneios/comum'
import { EquipaCartao, MinhaEquipa } from '@/components/torneios/Equipas'
import { Grupos } from '@/components/torneios/Grupos'
import { JogoLinha, JogoPainel } from '@/components/torneios/Jogo'
import { Cabecalho, Carregando, Chip, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useIntervalo } from '@/hooks/useVisivel'
import { dados, type ConviteTorneio, type TorneioDetalhe, type TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'

type Aba = 'resumo' | 'equipas' | 'grupos' | 'playoffs' | 'calendario'
const ABAS: Aba[] = ['resumo', 'equipas', 'grupos', 'playoffs', 'calendario']

/** Quando as inscrições estão abertas e ainda não estás em nenhuma equipa. */
function InscreverEquipa({ torneioId, aoMudar }: { torneioId: string; aoMudar: () => void }) {
  const acao = useAcao()
  const [nome, setNome] = useState('')
  const [funcao, setFuncao] = useState<'jogador' | 'coach'>('jogador')
  return (
    <Painel aria-labelledby="rg-inscrever" className="flex flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('INSCRIÇÃO', 'REGISTRATION')} titulo={l('Inscrever a tua equipa', 'Register your team')} id="rg-inscrever" />
      <p className="m-0 text-[13px] leading-normal text-suave">
        {l('Escolhe o nome da equipa e entras como capitão. Depois convidas, pelo nome, 4 jogadores, 1 coach e até 2 suplentes: cada um tem de aceitar. Até ao fim das inscrições podes mudar tudo.', 'Pick a team name and you join as captain. Then invite, by name, 4 more players, 1 coach and up to 2 substitutes: each one has to accept. Until registration ends you can change everything.')}
      </p>
      <form className="flex flex-wrap gap-2.5" onSubmit={async (e) => {
        e.preventDefault()
        const id = await acao(() => dados.torneioCriarEquipa(torneioId, nome.trim(), funcao), l('Equipa inscrita. Agora convida a malta.', 'Team registered. Now invite your people.'))
        if (id) { setNome(''); aoMudar() }
      }}>
        <label className="sr-only" htmlFor="rg-nome-nova">{l('Nome da equipa', 'Team name')}</label>
        <input id="rg-nome-nova" className="campo min-w-[200px] flex-[2_1_220px]" placeholder={l('Nome da equipa', 'Team name')} maxLength={32} autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} />
        <select aria-label={l('Entro como', 'I join as')} className="campo !w-auto" value={funcao} onChange={(e) => setFuncao(e.target.value as 'jogador' | 'coach')}>
          <option value="jogador">{l('Capitão e jogador', 'Captain and player')}</option>
          <option value="coach">{l('Capitão e coach', 'Captain and coach')}</option>
        </select>
        <button type="submit" className="btn btn-primario" disabled={nome.trim().length < 2}><UserPlus size={16} aria-hidden />{l('Inscrever', 'Register')}</button>
      </form>
    </Painel>
  )
}

function ConviteAqui({ c, aoMudar }: { c: ConviteTorneio; aoMudar: () => void }) {
  const acao = useAcao()
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[14px] border border-laranja/35 bg-laranja/[0.06] px-4 py-3">
      <span className="min-w-[180px] flex-1 text-[14px]"><b className="text-pessego">{c.equipaNome}</b> {l('convidou-te como', 'invited you as')} <b>{nomeFuncao(c.funcao).toLowerCase()}</b>{c.convidadoPor ? <span className="text-suave"> · {c.convidadoPor}</span> : null}</span>
      <button type="button" className="btn btn-primario !h-9" onClick={async () => { await acao(() => dados.torneioResponderConvite(c.equipaId, true), l('Entraste na equipa.', 'You joined the team.')); aoMudar() }}>{l('Aceitar', 'Accept')}</button>
      <button type="button" className="btn btn-fantasma !h-9" onClick={async () => { await acao(() => dados.torneioResponderConvite(c.equipaId, false)); aoMudar() }}>{l('Recusar', 'Decline')}</button>
    </li>
  )
}

function Facto({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-white/6 py-2.5 first:border-t-0 first:pt-0">
      <span className="font-mono text-[10.5px] font-semibold tracking-[0.12em] text-mudo uppercase">{rotulo}</span>
      <span className="text-right text-[13.5px] font-semibold">{children}</span>
    </div>
  )
}

/** O jogo que interessa à minha equipa: o que está a decorrer, o próximo, ou o último. */
function meuJogo(d: TorneioDetalhe, equipaId: string | undefined): TorneioJogo | null {
  if (!equipaId) return null
  const meus = d.jogos.filter((j) => (j.equipaA?.id === equipaId || j.equipaB?.id === equipaId) && j.como !== 'bye')
  const aDecorrer = meus.find((j) => j.estado === 'a_decorrer')
  if (aDecorrer) return aDecorrer
  const porJogar = meus.filter((j) => j.estado !== 'concluido' && j.equipaA && j.equipaB)
    .sort((a, b) => (a.agendadoPara ? new Date(a.agendadoPara).getTime() : Infinity) - (b.agendadoPara ? new Date(b.agendadoPara).getTime() : Infinity) || a.ronda - b.ronda)
  if (porJogar[0]) return porJogar[0]
  return [...meus].filter((j) => j.estado === 'concluido').sort((a, b) => new Date(b.terminouEm ?? 0).getTime() - new Date(a.terminouEm ?? 0).getTime())[0] ?? null
}

function Calendario({ d, meuId, aoAbrirJogo }: { d: TorneioDetalhe; meuId: string | null; aoAbrirJogo: (j: TorneioJogo) => void }) {
  const [so, setSo] = useState<'todos' | 'meus'>(meuId ? 'meus' : 'todos')
  const jogos = d.jogos.filter((j) => j.como !== 'bye' && (so === 'todos' || !meuId || j.equipaA?.id === meuId || j.equipaB?.id === meuId))
  const comData = jogos.filter((j) => j.agendadoPara).sort((a, b) => new Date(a.agendadoPara!).getTime() - new Date(b.agendadoPara!).getTime())
  const semData = jogos.filter((j) => !j.agendadoPara)
  const dias = new Map<string, TorneioJogo[]>()
  for (const j of comData) {
    const k = new Date(j.agendadoPara!).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
    dias.set(k, [...(dias.get(k) ?? []), j])
  }
  return (
    <Painel className="flex flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={l('CALENDÁRIO', 'SCHEDULE')}
        titulo={l('Quando se joga', 'When it is played')}
        direita={meuId ? <Segmentado rotulo={l('Jogos', 'Matches')} valor={so} onChange={setSo} pequeno opcoes={[{ valor: 'meus', texto: l('Os meus jogos', 'My matches') }, { valor: 'todos', texto: l('Todos', 'All') }]} /> : undefined}
      />
      {!jogos.length && <Vazio icone={<Medal size={22} />} titulo={l('Ainda não há jogos', 'No matches yet')} texto={l('Os jogos aparecem depois do sorteio, e as datas quando a staff as marcar.', 'Matches show up after the draw, and the dates once staff schedules them.')} />}
      {[...dias.entries()].map(([dia, lista]) => (
        <div key={dia} className="flex flex-col gap-2">
          <Papel>{dia}</Papel>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{lista.map((j) => <JogoLinha key={j.id} j={j} meuId={meuId} aoAbrir={aoAbrirJogo} mostrarFase />)}</ul>
        </div>
      ))}
      {semData.length > 0 && (
        <div className="flex flex-col gap-2">
          <Papel>{l('POR MARCAR', 'TO SCHEDULE')}</Papel>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{semData.map((j) => <JogoLinha key={j.id} j={j} meuId={meuId} aoAbrir={aoAbrirJogo} mostrarFase />)}</ul>
        </div>
      )}
    </Painel>
  )
}

export function Torneio() {
  const { id } = useParams()
  const { perfil } = useSessao()
  const [q, setQ] = useSearchParams()
  const pedida = q.get('aba') as Aba | null
  const aba: Aba = pedida && ABAS.includes(pedida) ? pedida : 'resumo'
  const [jogoAberto, setJogoAberto] = useState<string | null>(null)
  const detalhe = useCarregar(() => dados.torneioDetalhe(id ?? ''), [id], ['torneios', 'staff'], { chave: `torneio:${id}` })
  const convites = useCarregar(() => dados.meusConvitesTorneio(), [perfil?.id], ['torneios'], { chave: 'torneios:convites' })
  useIntervalo(() => { detalhe.recarregar(); convites.recarregar() }, 20_000)

  const d = detalhe.valor
  const meuId = perfil?.id ?? ''
  const minhaEquipa = d?.torneio.minhaEquipa ?? null
  const aDecorrer = useMemo(() => (d?.jogos ?? []).filter((j) => j.estado === 'a_decorrer' && (d?.torneio.gerir || j.equipaA?.id === minhaEquipa?.id || j.equipaB?.id === minhaEquipa?.id)), [d, minhaEquipa?.id])
  // Quem joga (ou a staff) pede à API que veja se o jogo já acabou; o servidor também o faz sozinho a cada minuto.
  useIntervalo(() => {
    for (const j of aDecorrer) {
      const passou = dados.modo === 'demo' || (j.comecouEm && Date.now() - new Date(j.comecouEm).getTime() > 8 * 60_000)
      if (passou) dados.torneioProcessarJogo(j.id).then(() => detalhe.recarregar()).catch(() => {})
    }
  }, aDecorrer.length ? (dados.modo === 'demo' ? 5_000 : 30_000) : null)

  if (detalhe.carregando && !d) return <Carregando />
  if (!d) {
    return (
      <Painel className="p-[22px]">
        <Vazio icone={<Medal size={22} />} titulo={l('Torneio não encontrado', 'Tournament not found')} texto={detalhe.erro ?? undefined} acao={<Link to="/torneios" className="btn btn-primario no-underline">{l('Ver os torneios', 'See tournaments')}</Link>} />
      </Painel>
    )
  }

  const t = d.torneio
  const minha = minhaEquipa ? d.equipas.find((e) => e.id === minhaEquipa.id) ?? null : null
  const meusConvites = (convites.valor ?? []).filter((c) => c.torneioId === t.id)
  const aoMudar = () => { detalhe.recarregar(); convites.recarregar() }
  const jogoModal = jogoAberto ? d.jogos.find((j) => j.id === jogoAberto) ?? null : null
  const proximo = meuJogo(d, minha?.id)
  const nJogos = d.jogos.filter((j) => j.como !== 'bye').length
  const feitos = d.jogos.filter((j) => j.estado === 'concluido' && j.como !== 'bye').length

  return (
    <>
      <Cabecalho
        estavel
        migalhas={[l('Torneios', 'Tournaments'), t.nome]}
        titulo={t.nome}
        descricao={t.descricao ?? formatoTexto(t)}
        acoes={
          <>
            <Segmentado<Aba>
              rotulo={l('Secção do torneio', 'Tournament section')}
              valor={aba}
              onChange={(v) => { const n = new URLSearchParams(q); if (v === 'resumo') n.delete('aba'); else n.set('aba', v); setQ(n, { replace: true }) }}
              opcoes={[
                { valor: 'resumo', texto: l('Resumo', 'Summary') },
                { valor: 'equipas', texto: <>{l('Equipas', 'Teams')} <span className="ml-1 font-mono text-[11px] text-mudo">{t.equipas}</span></> },
                { valor: 'grupos', texto: l('Grupos', 'Groups') },
                { valor: 'playoffs', texto: 'Playoffs' },
                { valor: 'calendario', texto: l('Calendário', 'Schedule') },
              ]}
            />
            {t.gerir && <Link to={`/admin?aba=torneios&torneio=${t.id}`} className="btn btn-fantasma no-underline"><Settings2 size={16} aria-hidden />{l('Gerir', 'Manage')}</Link>}
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        <ChipEstado t={t} />
        {t.teste && <Chip tom="laranja">{l('TESTE', 'TEST')}</Chip>}
        {!t.publico && <Chip>{l('FECHADO: só convidados', 'PRIVATE: invited only')}</Chip>}
        <Chip>{t.equipas} {l('equipas', 'teams')}</Chip>
        {nJogos > 0 && <Chip>{feitos}/{nJogos} {l('jogos', 'matches')}</Chip>}
        {t.finalPresencial && <Chip tom="ouro">{l('Final presencial', 'Final in person')}</Chip>}
      </div>

      {aba === 'resumo' && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,430px),1fr))] items-start gap-4">
          <div className="flex min-w-0 flex-col gap-4">
            {t.campeao && (
              <div className="flex items-center gap-3.5 rounded-[18px] border border-ouro/35 bg-ouro/[0.07] px-5 py-4">
                <Crown size={26} className="text-ouro" aria-hidden />
                <span className="flex flex-col"><span className="font-mono text-[10px] tracking-[0.16em] text-ouro">{l('CAMPEÃO', 'CHAMPION')}</span><span className="text-[22px] font-extrabold tracking-[-0.03em]">{t.campeao.nome}</span></span>
              </div>
            )}
            {!minha && meusConvites.length > 0 && (
              <Painel className="flex flex-col gap-3 p-[18px]"><ul className="m-0 flex list-none flex-col gap-2.5 p-0">{meusConvites.map((c) => <ConviteAqui key={c.equipaId} c={c} aoMudar={aoMudar} />)}</ul></Painel>
            )}
            {minha ? <MinhaEquipa torneio={t} equipa={minha} eu={meuId} aoMudar={aoMudar} />
              : t.inscricoesAbertas && t.estado === 'inscricoes' ? <InscreverEquipa torneioId={t.id} aoMudar={aoMudar} />
              : (
                <Painel className="p-[22px]">
                  <Vazio icone={<Medal size={22} />} titulo={t.estado === 'rascunho' ? l('Ainda é um rascunho', 'Still a draft') : l('Não estás neste torneio', 'You are not in this tournament')}
                    texto={t.estado === 'inscricoes' ? l('As inscrições já fecharam.', 'Registration is closed.') : t.estado === 'rascunho' ? l('Só a staff vê o rascunho. Publica-o na Staff › Torneios para abrir as inscrições.', 'Only staff sees the draft. Publish it in Staff › Tournaments to open registration.') : l('Podes seguir tudo nas outras secções.', 'You can follow everything in the other sections.')} />
                </Painel>
              )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            {proximo && <JogoPainel jogo={proximo} detalhe={d} meuId={meuId} aoMudar={aoMudar} />}
            <Painel aria-label={l('Sobre o torneio', 'About the tournament')} className="flex flex-col p-[22px]">
              <TituloPainel eyebrow={l('SOBRE', 'ABOUT')} titulo={l('Como funciona', 'How it works')} />
              <div className="mt-3.5 flex flex-col">
                <Facto rotulo={l('Inscrições até', 'Registration until')}>{dataLimite(t.inscricoesAte)}{t.inscricoesAbertas ? <span className="block font-mono text-[12px] font-medium text-pessego"><Contagem ate={t.inscricoesAte} vazio="" /></span> : null}</Facto>
                {t.inicio && <Facto rotulo={l('Início', 'Starts')}>{dataHoraCurta(t.inicio)}</Facto>}
                <Facto rotulo={l('Equipas', 'Teams')}>{t.equipas}{t.maxEquipas ? ` / ${t.maxEquipas}` : ''} · {t.completas} {l('completas', 'complete')}</Facto>
                <Facto rotulo={l('Grupos', 'Groups')}>{l(`de ${t.tamanhoGrupo}, todos contra todos, passam ${t.passamPorGrupo}`, `of ${t.tamanhoGrupo}, round robin, top ${t.passamPorGrupo} advance`)}</Facto>
                <Facto rotulo="Playoffs">{l('eliminação simples: quem perde está fora', 'single elimination: lose and you are out')}</Facto>
                <Facto rotulo={l('Final', 'Final')}>{t.finalPresencial ? l('presencial (a staff põe o resultado)', 'in person (staff enters the result)') : l('online, como os outros jogos', 'online, like the other matches')}</Facto>
                <Facto rotulo={l('Equipa', 'Team')}>{l('5 jogadores, 1 coach e 2 suplentes', '5 players, 1 coach and 2 substitutes')}</Facto>
                <Facto rotulo={l('Resultados', 'Results')}>{l('lidos da API da Riot', 'read from the Riot API')}</Facto>
              </div>
              <p className="mt-3.5 mb-0 text-[12px] leading-normal text-mudo">
                {l('Os jogos jogam-se em jogos personalizados do Valorant. Um capitão abre o jogo aqui com o código do grupo e o Rangify reconhece o resultado sozinho: não se escreve nenhum resultado.', 'Matches are played as Valorant custom games. A captain opens the match here with the lobby code and Rangify recognises the result by itself: nobody types in a result.')}
              </p>
              {t.teste && <p className="mt-2 mb-0 text-[12px] leading-normal text-[#b57bff]">{l(`Torneio de teste: basta ${t.minJogadores} jogadores reais no jogo para o reconhecermos, e a staff pode simular jogos com bots.`, `Test tournament: just ${t.minJogadores} real players in the match are enough for us to recognise it, and staff can simulate matches with bots.`)}</p>}
            </Painel>
          </div>
        </div>
      )}

      {aba === 'equipas' && (
        <div className="flex flex-col gap-4">
          {!minha && t.inscricoesAbertas && t.estado === 'inscricoes' && <InscreverEquipa torneioId={t.id} aoMudar={aoMudar} />}
          {d.equipas.length === 0
            ? <Painel className="p-[22px]"><Vazio icone={<Medal size={22} />} titulo={l('Ainda não há equipas', 'No teams yet')} texto={l('As equipas inscritas aparecem aqui.', 'Registered teams show up here.')} /></Painel>
            : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] items-start gap-3.5">{d.equipas.map((e) => <EquipaCartao key={e.id} equipa={e} eu={meuId} destaque={e.id === minha?.id} />)}</div>}
        </div>
      )}

      {aba === 'grupos' && <Grupos detalhe={d} meuId={minha?.id ?? null} aoAbrirJogo={(j) => setJogoAberto(j.id)} />}
      {aba === 'playoffs' && <Chave detalhe={d} meuId={minha?.id ?? null} aoAbrirJogo={(j) => setJogoAberto(j.id)} />}
      {aba === 'calendario' && <Calendario d={d} meuId={minha?.id ?? null} aoAbrirJogo={(j) => setJogoAberto(j.id)} />}

      <Modal
        aberto={!!jogoModal}
        onFechar={() => setJogoAberto(null)}
        eyebrow={jogoModal ? `${jogoModal.fase === 'grupo' ? `${nomeGrupo(jogoModal.grupo)} · ` : ''}${rotuloJogo(jogoModal)}`.toUpperCase() : undefined}
        titulo={jogoModal ? `${jogoModal.equipaA?.nome ?? '?'} · ${jogoModal.equipaB?.nome ?? '?'}` : ''}
        largura={760}
      >
        {jogoModal && <JogoPainel jogo={jogoModal} detalhe={d} meuId={meuId} aoMudar={aoMudar} emModal />}
      </Modal>
    </>
  )
}
