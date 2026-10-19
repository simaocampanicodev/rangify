/**
 * Staff › Torneios (só Owner e Dev): criar e editar torneios, publicar, convidar a testar, sortear, marcar o calendário,
 * pôr resultados à mão (final presencial, falta de comparência, falha da API) e as ferramentas de teste com bots.
 */
import { Bot, CalendarClock, Dices, ExternalLink, Eye, EyeOff, Lock, Megaphone, Plus, RotateCcw, Save, Swords, Trash2, Trophy, UserPlus, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BotaoSegurar, Carregando, Chip, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type DadosNovoTorneio, type MelhorDe, type TorneioDetalhe, type TorneioJogo, type TorneioResumo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { MAPAS } from '@/lib/mapas'
import { ChipEstado, ChipJogo, dataLimite, estadoLegivel, nomeGrupo, origemTexto, Papel, rotuloJogo } from './comum'

const pad = (n: number) => String(n).padStart(2, '0')
/** Uma data ISO para o valor de um <input type="datetime-local"> (na hora do computador). */
const paraInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const deInput = (v: string) => (v ? new Date(v).toISOString() : null)
const emDias = (dias: number, hora = 23, min = 59) => { const d = new Date(Date.now() + dias * 86_400_000); d.setHours(hora, min, 0, 0); return paraInput(d.toISOString()) }

/** Um interruptor com texto, como os das outras áreas da staff. */
function Interruptor({ ligado, aoMudar, texto, ajuda, disabled }: { ligado: boolean; aoMudar: (v: boolean) => void; texto: string; ajuda?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={disabled}
        onClick={() => aoMudar(!ligado)}
        className={`relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border transition-colors ${ligado ? 'border-laranja bg-laranja' : 'border-white/18 bg-white/10'}`}
      >
        <span aria-hidden className={`absolute top-[2px] size-4 rounded-full bg-white transition-[left] ${ligado ? 'left-[18px]' : 'left-[2px]'}`} />
      </button>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{texto}</span>
        {ajuda && <span className="text-[12px] leading-normal text-mudo">{ajuda}</span>}
      </span>
    </label>
  )
}

function Campo({ id, rotulo, children, dica }: { id: string; rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-semibold text-suave">{rotulo}</label>
      {children}
      {dica && <span className="text-[11.5px] leading-snug text-mudo">{dica}</span>}
    </div>
  )
}

/** Os mapas em jogo no torneio (vazio = a rotação do hub). */
function EscolherMapas({ valor, aoMudar, rotacaoHub }: { valor: string[]; aoMudar: (v: string[]) => void; rotacaoHub: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={l('Mapas em jogo', 'Maps in play')}>
        {MAPAS.map((m) => {
          const ativo = valor.includes(m.nome)
          return (
            <button
              key={m.nome}
              type="button"
              aria-pressed={ativo}
              onClick={() => aoMudar(ativo ? valor.filter((x) => x !== m.nome) : [...valor, m.nome])}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${ativo ? 'border-laranja bg-laranja/15 text-pessego-claro' : 'border-white/12 bg-transparent text-suave hover:border-white/25'}`}
            >
              {m.nome}
            </button>
          )
        })}
      </div>
      <span className="text-[11.5px] leading-snug text-mudo">
        {valor.length === 0
          ? l(`Nenhum escolhido: usa a rotação do hub (${rotacaoHub.join(', ')}).`, `None picked: uses the hub rotation (${rotacaoHub.join(', ')}).`)
          : valor.length < 3 ? l('Escolhe pelo menos 3 mapas.', 'Pick at least 3 maps.') : l(`${valor.length} mapas escolhidos.`, `${valor.length} maps picked.`)}
      </span>
    </div>
  )
}

/** Criar um torneio ou editar o que já existe. */
function FormTorneio({ inicial, aoGuardar, aoCancelar }: { inicial?: TorneioResumo; aoGuardar: (id: string) => void; aoCancelar: () => void }) {
  const acao = useAcao()
  const editar = !!inicial
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [inscricoesAte, setInscricoesAte] = useState(paraInput(inicial?.inscricoesAte) || emDias(14))
  const [inicio, setInicio] = useState(paraInput(inicial?.inicio))
  const [tamanho, setTamanho] = useState(inicial?.tamanhoGrupo ?? 4)
  const [passam, setPassam] = useState(inicial?.passamPorGrupo ?? 2)
  const [presencial, setPresencial] = useState(inicial?.finalPresencial ?? false)
  const [maxEquipas, setMaxEquipas] = useState(inicial?.maxEquipas ? String(inicial.maxEquipas) : '')
  const [teste, setTeste] = useState(false)
  // Visível a toda a gente quando a área estiver aberta: sim, menos num torneio de teste.
  const [publico, setPublico] = useState(true)
  const [minJogadores, setMinJogadores] = useState(inicial ? String(inicial.minJogadores) : '')
  const [veto, setVeto] = useState(inicial?.vetoMapas ?? true)
  const [melhorDe, setMelhorDe] = useState<MelhorDe>(inicial?.melhorDe ?? 1)
  const [mapas, setMapas] = useState<string[]>(inicial?.poolMapas ?? [])
  const hub = useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas', fresco: 300_000 })
  const grupoEditavel = !inicial || inicial.estado === 'rascunho' || inicial.estado === 'inscricoes'
  const nMapas = mapas.length || (hub.valor?.length ?? 7)
  const valido = nome.trim().length >= 3 && !!inscricoesAte && passam < tamanho && (mapas.length === 0 || mapas.length >= 3) && (!veto || melhorDe <= nMapas)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const base: Partial<DadosNovoTorneio> = {
      nome: nome.trim(), descricao: descricao.trim() || null, inscricoesAte: deInput(inscricoesAte) ?? undefined, inicio: deInput(inicio),
      finalPresencial: presencial, maxEquipas: maxEquipas ? Number(maxEquipas) : null,
      minJogadores: minJogadores ? Number(minJogadores) : undefined, vetoMapas: veto, melhorDe: veto ? melhorDe : 1, poolMapas: mapas,
    }
    if (grupoEditavel) { base.tamanhoGrupo = tamanho; base.passamPorGrupo = passam }
    const id = await acao(async () => {
      if (inicial) { await dados.torneioEditar(inicial.id, base); return inicial.id }
      return dados.torneioCriar({ ...base, teste, publico, nome: nome.trim(), inscricoesAte: deInput(inscricoesAte)! } as DadosNovoTorneio)
    }, editar ? l('Torneio guardado.', 'Tournament saved.') : l('Torneio criado como rascunho. Publica-o quando estiver pronto.', 'Tournament created as a draft. Publish it when it is ready.'))
    if (id) aoGuardar(id)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={guardar}>
      {!editar && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-laranja/25 bg-laranja/[0.05] px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-suave">{l('Modelo pronto: grupos de 4, passam 2, eliminação simples e a final presencial.', 'Ready-made setup: groups of 4, top 2 advance, single elimination and an in-person final.')}</span>
          <button type="button" className="btn btn-fantasma !h-9" onClick={() => {
            setNome('T7 x LGW Cup'); setTamanho(4); setPassam(2); setPresencial(true)
            setDescricao(l('Fase de grupos com 4 equipas (3 jogos cada) e playoffs de eliminação simples: quem perde está fora. A final joga-se presencialmente na LGW.', 'Group stage with 4 teams (3 matches each) and single-elimination playoffs: lose and you are out. The final is played in person at LGW.'))
          }}><Trophy size={15} aria-hidden />T7 x LGW Cup</button>
        </div>
      )}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Campo id="rg-t-nome" rotulo={l('Nome', 'Name')}>
          <input id="rg-t-nome" className="campo" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="T7 x LGW Cup" autoComplete="off" />
        </Campo>
        <Campo id="rg-t-ate" rotulo={l('Inscrições até', 'Registration until')} dica={l('Até lá as equipas podem mudar tudo.', 'Teams can change everything until then.')}>
          <input id="rg-t-ate" type="datetime-local" className="campo" value={inscricoesAte} onChange={(e) => setInscricoesAte(e.target.value)} />
        </Campo>
      </div>
      <Campo id="rg-t-desc" rotulo={l('Descrição (opcional)', 'Description (optional)')}>
        <textarea id="rg-t-desc" className="campo !h-auto min-h-[84px] py-2.5" maxLength={600} value={descricao ?? ''} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <div className="grid gap-3.5 sm:grid-cols-4">
        <Campo id="rg-t-tam" rotulo={l('Equipas por grupo', 'Teams per group')}>
          <select id="rg-t-tam" className="campo" disabled={!grupoEditavel} value={tamanho} onChange={(e) => { const v = Number(e.target.value); setTamanho(v); if (passam >= v) setPassam(v - 1) }}>
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Campo>
        <Campo id="rg-t-passam" rotulo={l('Passam por grupo', 'Advance per group')}>
          <select id="rg-t-passam" className="campo" disabled={!grupoEditavel} value={passam} onChange={(e) => setPassam(Number(e.target.value))}>
            {[1, 2, 3].filter((n) => n < tamanho).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Campo>
        <Campo id="rg-t-max" rotulo={l('Máx. equipas', 'Max teams')} dica={l('Vazio = sem limite.', 'Empty = no limit.')}>
          <input id="rg-t-max" className="campo" inputMode="numeric" value={maxEquipas} onChange={(e) => setMaxEquipas(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="16" />
        </Campo>
        <Campo id="rg-t-min" rotulo={l('Jogadores a reconhecer', 'Players to match')} dica={l('Quantos dos 10 jogadores têm de aparecer numa partida da API da Riot para a darmos como deste jogo. 8 deixa folga para quem joga com outra conta.', 'How many of the 10 players must appear in a Riot API match for us to accept it as this game. 8 leaves room for anyone playing on another account.')}>
          <input id="rg-t-min" className="campo" inputMode="numeric" value={minJogadores} onChange={(e) => setMinJogadores(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder={teste ? '2' : '8'} />
        </Campo>
      </div>
      <Campo id="rg-t-inicio" rotulo={l('Primeiro jogo (opcional)', 'First match (optional)')} dica={l('Só informativo, aparece na página do torneio.', 'Informational only, shown on the tournament page.')}>
        <input id="rg-t-inicio" type="datetime-local" className="campo sm:max-w-[260px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
      </Campo>
      <div className="flex flex-col gap-3.5 rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <Interruptor ligado={presencial} aoMudar={setPresencial} texto={l('Final presencial', 'In-person final')} ajuda={l('Não se abre no hub: a staff põe o resultado. Os restantes jogos são detetados pela API.', 'Not opened in the hub: staff enters the result. All other matches are detected by the API.')} />
        {!editar && <Interruptor ligado={teste} aoMudar={(v) => { setTeste(v); setPublico(!v) }} texto={l('Torneio de teste', 'Test tournament')} ajuda={l('Liga as ferramentas com bots (equipas de bots, encher a tua equipa, simular jogos). Os jogos abrem a qualquer hora e a API precisa só de 2 jogadores.', 'Turns on the bot tools (bot teams, fill your team, simulate matches). Matches open at any time and the API only needs 2 players.')} />}
        {!editar && <Interruptor ligado={publico} aoMudar={setPublico} texto={l('Visível a toda a gente quando a área estiver aberta', 'Visible to everyone once the area is open')} ajuda={l('Desligado, só a staff, quem convidares a testar e as pessoas das equipas inscritas veem este torneio (bom para testes).', 'Off, only staff, whoever you invite to test and people on registered teams see this tournament (good for tests).')} />}
        <Interruptor ligado={veto} aoMudar={setVeto} texto={l('Picks e bans de mapas', 'Map picks and bans')} ajuda={l('Antes de cada jogo os capitães vetam os mapas à vez. Desligado: o mapa é livre (ou fixado por ti no calendário) e todos os jogos são à melhor de 1.', 'Before each match the captains veto maps in turns. Off: the map is free (or set by you in the schedule) and every match is best of 1.')} />
        {veto && (
          <div className="flex flex-col gap-3.5 border-t border-white/8 pt-3.5">
            <div className="flex flex-col gap-1.5">
              <Papel>{l('FORMATO DOS JOGOS', 'MATCH FORMAT')}</Papel>
              <Segmentado<'1' | '3' | '5'>
                rotulo={l('Formato dos jogos', 'Match format')}
                valor={String(melhorDe) as '1' | '3' | '5'}
                onChange={(v) => setMelhorDe(Number(v) as MelhorDe)}
                opcoes={[{ valor: '1', texto: l('Melhor de 1', 'Best of 1') }, { valor: '3', texto: l('Melhor de 3', 'Best of 3') }, { valor: '5', texto: l('Melhor de 5', 'Best of 5') }]}
              />
              <span className="text-[11.5px] leading-snug text-mudo">
                {melhorDe === 1
                  ? l('Um mapa por jogo: banem à vez até sobrar um; quem não baniu por último escolhe o lado (como no hub).', 'One map per match: ban in turns until one is left; whoever did not make the last ban picks the side (like the hub).')
                  : melhorDe === 3
                    ? l('Ganha quem fizer 2 mapas. Picks e bans: ban, ban, pick (a outra equipa escolhe o lado), pick (idem), ban, ban e o que sobra é o decisivo.', 'First to 2 maps wins. Picks and bans: ban, ban, pick (the other team picks the side), pick (same), ban, ban and the map left is the decider.')
                    : l('Ganha quem fizer 3 mapas. Picks e bans: ban, ban, quatro picks (a outra equipa escolhe o lado em cada um) e o que sobra é o decisivo.', 'First to 3 maps wins. Picks and bans: ban, ban, four picks (the other team picks the side on each) and the map left is the decider.')}
                {' '}{l('É o formato por defeito: depois mudas jogo a jogo no calendário (por exemplo só a final).', 'This is the default: you can change it match by match in the schedule (for example only the final).')}
              </span>
              {melhorDe > nMapas && <span className="text-[11.5px] text-derrota">{l(`À melhor de ${melhorDe} são precisos pelo menos ${melhorDe} mapas em jogo (há ${nMapas}).`, `Best of ${melhorDe} needs at least ${melhorDe} maps in play (there are ${nMapas}).`)}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Papel>{l('MAPAS EM JOGO', 'MAPS IN PLAY')}</Papel>
              <EscolherMapas valor={mapas} aoMudar={setMapas} rotacaoHub={hub.valor ?? []} />
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className="btn btn-fantasma" onClick={aoCancelar}>{l('Cancelar', 'Cancel')}</button>
        <button type="submit" className="btn btn-primario" disabled={!valido}><Save size={16} aria-hidden />{editar ? l('Guardar', 'Save') : l('Criar rascunho', 'Create draft')}</button>
      </div>
    </form>
  )
}

/** Aberto a todos ou só a quem convidares a testar (e às equipas inscritas). */
function Visibilidade({ t, area }: { t: TorneioResumo; area: boolean }) {
  const acao = useAcao()
  const acessos = useCarregar(() => dados.torneioAcessos(t.id), [t.id], ['torneios'], { chave: `torneio:acessos:${t.id}` })
  const [nome, setNome] = useState('')
  return (
    <Painel aria-label={l('Visibilidade', 'Visibility')} className="flex flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={l('QUEM VÊ', 'WHO SEES IT')}
        titulo={t.publico && area ? l('Visível a toda a gente', 'Visible to everyone')
          : t.publico ? l('Marcado como aberto, mas a área está fechada', 'Marked as open, but the area is closed')
            : l('Privado: só a staff e quem convidares', 'Private: staff and whoever you invite')}
      />
      <Interruptor
        ligado={t.publico}
        aoMudar={(v) => acao(() => dados.torneioEditar(t.id, { publico: v }), v ? l('O torneio fica visível a toda a gente quando a área estiver aberta.', 'The tournament will be visible to everyone once the area is open.') : l('O torneio voltou a ser privado.', 'The tournament is private again.'))}
        texto={l('Visível a toda a gente quando a área estiver aberta', 'Visible to everyone once the area is open')}
        ajuda={t.estado === 'rascunho' ? l('Um rascunho nunca aparece aos jogadores: publica-o primeiro.', 'A draft never shows to players: publish it first.')
          : !area ? l('A área de Torneios está fechada (botão lá em cima): por agora só veem a staff, quem convidares a testar e as pessoas das equipas inscritas.', 'The Tournaments area is closed (button above): for now only staff, whoever you invite to test and people on registered teams see it.')
            : l('Desligado: só a staff, quem convidares a testar e as pessoas das equipas inscritas veem o torneio.', 'Off: only staff, whoever you invite to test and people on registered teams see the tournament.')}
      />
      <div className="flex flex-col gap-2.5 border-t border-white/8 pt-4">
        <Papel>{l('CONVIDAR A TESTAR (AMIGOS)', 'INVITE TO TEST (FRIENDS)')}</Papel>
        <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
          e.preventDefault()
          const r = await acao(() => dados.torneioAcesso(t.id, nome.trim(), true), l('Acesso dado: já vê o torneio.', 'Access given: they can now see the tournament.'))
          if (r) { setNome(''); acessos.recarregar() }
        }}>
          <label className="sr-only" htmlFor="rg-acesso-nome">{l('Nome do jogador', 'Player name')}</label>
          <input id="rg-acesso-nome" className="campo min-w-[180px] flex-1" placeholder={l('Nome ou Riot ID (Nome#TAG)', 'Name or Riot ID (Name#TAG)')} autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} />
          <button type="submit" className="btn btn-fantasma" disabled={nome.trim().length < 2}><UserPlus size={16} aria-hidden />{l('Dar acesso', 'Give access')}</button>
        </form>
        {acessos.valor && acessos.valor.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {acessos.valor.map((p) => (
              <li key={p.perfilId} className="chip flex items-center gap-1.5 border border-white/10 bg-white/[0.035] py-1 pr-1 pl-3 text-[12.5px]">
                {p.utilizador}
                <button type="button" aria-label={`${l('Tirar o acesso a', 'Remove access for')} ${p.utilizador}`} className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-mudo hover:bg-white/10 hover:text-texto"
                  onClick={async () => { await acao(() => dados.torneioAcesso(t.id, p.riotId ?? p.utilizador, false)); acessos.recarregar() }}><X size={13} aria-hidden /></button>
              </li>
            ))}
          </ul>
        ) : <span className="text-[12.5px] text-mudo">{l('Ainda ninguém convidado a testar.', 'Nobody invited to test yet.')}</span>}
      </div>
    </Painel>
  )
}

function Sorteio({ d }: { d: TorneioDetalhe }) {
  const acao = useAcao()
  const t = d.torneio
  const [seed, setSeed] = useState('')
  const inscritas = d.equipas.filter((e) => e.estado === 'inscrita')
  const incompletas = inscritas.length - t.completas
  const jaSorteado = t.estado !== 'rascunho' && t.estado !== 'inscricoes'
  const podeSortear = t.estado === 'inscricoes' || t.estado === 'grupos'
  const gruposAcabados = t.estado === 'grupos' && d.jogos.some((j) => j.fase === 'grupo') && d.jogos.filter((j) => j.fase === 'grupo').every((j) => j.estado === 'concluido')
  const seedNum = seed.trim() === '' ? null : Number(seed.replace(',', '.'))
  const seedValida = seedNum == null || (Number.isFinite(seedNum) && seedNum >= -1 && seedNum <= 1)
  const sortear = () => {
    if (!seedValida) { acao(async () => { throw new Error('A seed tem de estar entre -1 e 1.') }); return }
    acao(() => dados.torneioSortear(t.id, seedNum), l('Sorteio feito: grupos e jogos criados.', 'Draw done: groups and matches created.'))
  }
  const nGrupos = d.equipas.some((e) => e.grupo) ? new Set(d.equipas.map((e) => e.grupo).filter(Boolean)).size : Math.max(1, Math.floor(t.completas / t.tamanhoGrupo))
  return (
    <Painel aria-label={l('Sorteio', 'Draw')} className="flex flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('SORTEIO', 'DRAW')} titulo={jaSorteado ? l('Sorteio feito', 'Draw done') : l('Sortear os grupos', 'Draw the groups')} />
      <p className="m-0 text-[13px] leading-normal text-suave">
        {t.equipas} {l('equipas', 'teams')} · {t.completas} {l('completas', 'complete')}{incompletas > 0 && <> · <b className="text-pessego">{incompletas} {l('incompletas ficam de fora', 'incomplete are left out')}</b></>}.
        {' '}{l(`Fecha as inscrições e cria ${nGrupos} ${nGrupos === 1 ? 'grupo' : 'grupos'} de ${t.tamanhoGrupo}. Repete-se enquanto nenhum jogo tiver começado (o calendário refaz-se).`, `Closes registration and creates ${nGrupos} ${nGrupos === 1 ? 'group' : 'groups'} of ${t.tamanhoGrupo}. It can be repeated while no match has started (the schedule is rebuilt).`)}
      </p>
      {jaSorteado && (
        <div className="flex flex-wrap gap-2">
          {t.seed != null && <Chip>seed {t.seed}</Chip>}
          <Chip>{new Set(d.equipas.map((e) => e.grupo).filter(Boolean)).size} {l('grupos', 'groups')}</Chip>
          <Chip>{d.jogos.filter((j) => j.fase === 'grupo').length} {l('jogos de grupo', 'group matches')}</Chip>
        </div>
      )}
      {podeSortear && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rg-seed" className="text-[12px] font-semibold text-suave">{l('Seed (opcional)', 'Seed (optional)')}</label>
            <input id="rg-seed" className="campo !w-[140px] font-mono" inputMode="decimal" placeholder="0.2531" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </div>
          <BotaoSegurar
            rotulo={l('Segura para sortear', 'Hold to draw')}
            className="btn btn-primario"
            onConfirmar={sortear}
          >
            <Dices size={16} aria-hidden />{jaSorteado ? l('Segura para sortear outra vez', 'Hold to redraw') : l('Segura para sortear', 'Hold to draw')}
          </BotaoSegurar>
          {!seedValida && <span className="text-[12px] text-derrota">{l('A seed está entre -1 e 1.', 'The seed is between -1 and 1.')}</span>}
        </div>
      )}
      {gruposAcabados && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
          <span className="text-[12.5px] text-suave">{l('Os grupos acabaram mas os playoffs ainda não existem.', 'The groups are over but the playoffs do not exist yet.')}</span>
          <button type="button" className="btn btn-primario" onClick={() => acao(() => dados.torneioGerarPlayoffs(t.id), l('Playoffs gerados.', 'Playoffs generated.'))}><Swords size={16} aria-hidden />{l('Gerar playoffs', 'Generate playoffs')}</button>
        </div>
      )}
    </Painel>
  )
}

type Edicao = { quando: string; mapa: string; presencial: boolean; melhorDe: MelhorDe }

function Calendario({ d }: { d: TorneioDetalhe }) {
  const acao = useAcao()
  const t = d.torneio
  const jogos = useMemo(() => d.jogos.filter((j) => j.como !== 'bye'), [d.jogos])
  const original = (j: TorneioJogo): Edicao => ({
    quando: paraInput(j.agendadoPara),
    mapa: j.veto?.mapaStaff || !t.vetoMapas ? j.mapa ?? '' : '',
    presencial: j.presencial,
    melhorDe: j.melhorDe,
  })
  const [edits, setEdits] = useState<Record<string, Edicao>>({})
  const [inicio, setInicio] = useState(emDias(7, 21, 0))
  const [intervalo, setIntervalo] = useState('60')
  const [juntos, setJuntos] = useState('2')
  const [sobrescrever, setSobrescrever] = useState(false)
  useEffect(() => { setEdits({}) }, [d.jogos.length, t.id])

  const valor = (j: TorneioJogo) => edits[j.id] ?? original(j)
  const mudou = (j: TorneioJogo) => { const e = edits[j.id]; if (!e) return false; const o = original(j); return e.quando !== o.quando || e.mapa !== o.mapa || e.presencial !== o.presencial || e.melhorDe !== o.melhorDe }
  const alterados = jogos.filter(mudou)
  const bloqueado = (j: TorneioJogo) => j.estado === 'a_decorrer' || j.estado === 'concluido'
  const poe = (j: TorneioJogo, p: Partial<Edicao>) => setEdits((v) => ({ ...v, [j.id]: { ...valor(j), ...p } }))

  const preencher = () => {
    const ini = new Date(inicio).getTime()
    const passo = Math.max(1, Number(intervalo) || 60) * 60_000
    const n = Math.max(1, Number(juntos) || 1)
    if (!Number.isFinite(ini)) return
    const prox = jogos.filter((j) => !bloqueado(j) && !j.presencial && (sobrescrever || !j.agendadoPara))
      .sort((x, y) => Number(x.fase === 'playoff') - Number(y.fase === 'playoff') || x.ronda - y.ronda || (x.grupo ?? 0) - (y.grupo ?? 0) || x.ordem - y.ordem)
    // Na fase de grupos cada jornada tem o mesmo número de jogos por grupo: os "juntos" jogam à mesma hora.
    const novo: Record<string, Edicao> = {}
    prox.forEach((j, i) => { novo[j.id] = { ...valor(j), quando: paraInput(new Date(ini + Math.floor(i / n) * passo).toISOString()) } })
    setEdits((v) => ({ ...v, ...novo }))
  }
  const guardar = () => acao(async () => {
    const itens = alterados.map((j) => {
      const e = valor(j), o = original(j)
      return { jogo: j.id, quando: deInput(e.quando), mapa: e.mapa !== o.mapa ? e.mapa : undefined, presencial: e.presencial !== o.presencial ? e.presencial : undefined, melhorDe: e.melhorDe !== o.melhorDe ? e.melhorDe : undefined }
    })
    const n = await dados.torneioAgendarVarios(itens)
    setEdits({})
    return n
  }, l('Calendário guardado.', 'Schedule saved.'))

  const equipas = (j: TorneioJogo) => `${j.equipaA?.nome ?? origemTexto(j.origemA)} · ${j.equipaB?.nome ?? origemTexto(j.origemB)}`
  if (!jogos.length) {
    return (
      <Painel aria-label={l('Calendário', 'Schedule')} className="flex flex-col gap-3 p-[22px]">
        <TituloPainel eyebrow={l('CALENDÁRIO', 'SCHEDULE')} titulo={l('Datas e horas dos jogos', 'Match dates and times')} />
        <Vazio icone={<CalendarClock size={18} />} titulo={l('Ainda não há jogos', 'No matches yet')} texto={l('Faz o sorteio para criar os jogos da fase de grupos.', 'Draw the groups to create the group-stage matches.')} />
      </Painel>
    )
  }
  return (
    <Painel aria-label={l('Calendário', 'Schedule')} className="flex min-w-0 flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={l('CALENDÁRIO', 'SCHEDULE')}
        titulo={l('Datas e horas dos jogos', 'Match dates and times')}
        direita={<button type="button" className="btn btn-primario" disabled={!alterados.length} onClick={guardar}><Save size={16} aria-hidden />{l('Guardar tudo', 'Save all')}{alterados.length > 0 && ` (${alterados.length})`}</button>}
      />
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/8 bg-white/[0.025] p-3.5">
        <Campo id="rg-cal-ini" rotulo={l('Primeiro jogo às', 'First match at')}>
          <input id="rg-cal-ini" type="datetime-local" className="campo !w-[210px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo id="rg-cal-int" rotulo={l('Intervalo (min)', 'Interval (min)')}>
          <input id="rg-cal-int" className="campo !w-[90px]" inputMode="numeric" value={intervalo} onChange={(e) => setIntervalo(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Campo>
        <Campo id="rg-cal-jun" rotulo={l('Jogos à mesma hora', 'Matches at once')}>
          <input id="rg-cal-jun" className="campo !w-[90px]" inputMode="numeric" value={juntos} onChange={(e) => setJuntos(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Campo>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12.5px] text-suave"><input type="checkbox" checked={sobrescrever} onChange={(e) => setSobrescrever(e.target.checked)} />{l('Mudar também os que já têm hora', 'Also change those that have a time')}</label>
        <button type="button" className="btn btn-fantasma" onClick={preencher}><CalendarClock size={16} aria-hidden />{l('Preencher horas', 'Fill in times')}</button>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {jogos.map((j) => {
          const e = valor(j)
          const fixo = bloqueado(j)
          const veto = j.veto
          // O formato muda-se até começarem os picks e bans (depois, reinicia-os primeiro) e nunca a meio de uma série.
          const formatoFixo = fixo || j.serieA + j.serieB > 0 || j.estado === 'veto' || !!veto?.ladoEscolha
          return (
            <li key={j.id} className={`grid gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(190px,auto)_minmax(112px,auto)_minmax(140px,auto)_auto] sm:items-center ${mudou(j) ? 'border-laranja/45 bg-laranja/[0.05]' : 'border-white/8 bg-white/[0.02]'}`}>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-mudo">{j.fase === 'grupo' ? `${nomeGrupo(j.grupo)} · ` : ''}{rotuloJogo(j).toUpperCase()}</span>
                <span className="truncate text-[13.5px] font-semibold">{equipas(j)}</span>
              </div>
              <div>
                <label className="sr-only" htmlFor={`rg-q-${j.id}`}>{l('Data e hora', 'Date and time')}</label>
                <input id={`rg-q-${j.id}`} type="datetime-local" className="campo !h-10 w-full" disabled={fixo} value={e.quando} onChange={(ev) => poe(j, { quando: ev.target.value })} />
              </div>
              <div>
                <label className="sr-only" htmlFor={`rg-f-${j.id}`}>{l('Formato', 'Format')}</label>
                {t.vetoMapas ? (
                  <select id={`rg-f-${j.id}`} className="campo !h-10 w-full" disabled={formatoFixo} title={formatoFixo && !fixo ? l('Reinicia os picks e bans para mudares o formato.', 'Restart the picks and bans to change the format.') : undefined}
                    value={e.melhorDe} onChange={(ev) => { const n = Number(ev.target.value) as MelhorDe; poe(j, { melhorDe: n, mapa: n > 1 ? '' : e.mapa }) }}>
                    <option value={1}>{l('Melhor de 1', 'Best of 1')}</option>
                    <option value={3}>{l('Melhor de 3', 'Best of 3')}</option>
                    <option value={5}>{l('Melhor de 5', 'Best of 5')}</option>
                  </select>
                ) : <span className="text-[12px] text-mudo">{l('Melhor de 1', 'Best of 1')}</span>}
              </div>
              <div>
                <label className="sr-only" htmlFor={`rg-m-${j.id}`}>{l('Mapa', 'Map')}</label>
                <select id={`rg-m-${j.id}`} className="campo !h-10 w-full" disabled={fixo || j.presencial || e.melhorDe > 1} value={e.mapa} onChange={(ev) => poe(j, { mapa: ev.target.value })}>
                  <option value="">{t.vetoMapas ? l('Picks e bans', 'Picks and bans') : l('Sem mapa fixo', 'No fixed map')}</option>
                  {MAPAS.map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="flex min-h-10 cursor-pointer items-center gap-1.5 text-[12px] text-suave"><input type="checkbox" disabled={fixo} checked={e.presencial} onChange={(ev) => poe(j, { presencial: ev.target.checked })} />{l('Presencial', 'In person')}</label>
                <ChipJogo j={j} />
              </div>
              {veto && !veto.mapaStaff && !fixo && (j.equipaA && j.equipaB) && !e.presencial && (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-mudo sm:col-span-5">
                  <span>{l('Picks e bans', 'Picks and bans')}: {veto.feitos.length}/{veto.passos.length}{j.mapa ? ` · ${j.mapa}` : ''}{veto.ladoEquipa ? ` · ${veto.ladoEquipa} ${veto.ladoEscolha === 'ataque' ? l('ataca', 'attacks') : l('defende', 'defends')}` : ''}</span>
                  {(!veto.ladoEscolha) && <button type="button" className="btn btn-fantasma !h-8 !px-3 !text-[12px]" onClick={() => acao(() => dados.torneioVetoConcluir(j.id), l('Picks e bans despachados ao calhas.', 'Picks and bans completed at random.'))}>{l('Despachar ao calhas', 'Complete at random')}</button>}
                  {(veto.feitos.length > 0) && <button type="button" className="btn btn-fantasma !h-8 !px-3 !text-[12px]" onClick={() => acao(() => dados.torneioVetoReiniciar(j.id), l('Picks e bans apagados.', 'Picks and bans cleared.'))}><RotateCcw size={13} aria-hidden />{l('Reiniciar', 'Restart')}</button>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Painel>
  )
}

function ResultadoLinha({ j }: { j: TorneioJogo }) {
  const acao = useAcao()
  // Série online: o resultado é o do mapa em jogo. Série presencial: os mapas ganhos. À melhor de 1: as rondas.
  const serie = j.melhorDe > 1
  const precisa = (j.melhorDe + 1) / 2
  const [a, setA] = useState(serie && j.presencial ? String(precisa) : '13')
  const [b, setB] = useState('')
  const nMapa = j.serieA + j.serieB + 1
  const na = j.equipaA?.nome ?? '?'
  const nb = j.equipaB?.nome ?? '?'
  const feito = j.estado === 'concluido'
  const resolver = (e: React.FormEvent) => {
    e.preventDefault()
    acao(() => dados.torneioResolverJogo(j.id, Number(a), Number(b)), l('Resultado guardado.', 'Result saved.'))
  }
  return (
    <li className={`flex flex-col gap-2.5 rounded-xl border px-3.5 py-3 ${j.semResultadoAuto ? 'border-derrota/40 bg-derrota/[0.05]' : 'border-white/8 bg-white/[0.02]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-mudo">{j.fase === 'grupo' ? `${nomeGrupo(j.grupo)} · ` : ''}{rotuloJogo(j).toUpperCase()}</span>
          <span className="truncate text-[13.5px] font-semibold">{na} <span className="font-normal text-mudo">vs</span> {nb}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {j.semResultadoAuto && <Chip tom="derrota">{l('SEM RESULTADO HÁ 1 H', 'NO RESULT FOR 1 H')}</Chip>}
          {j.presencial && <Chip tom="ouro">{l('PRESENCIAL', 'IN PERSON')}</Chip>}
          {serie && <Chip tom="laranja">{l(`MELHOR DE ${j.melhorDe}`, `BEST OF ${j.melhorDe}`)}{j.serieA + j.serieB > 0 && !feito ? ` · ${j.serieA}-${j.serieB}` : ''}</Chip>}
          <ChipJogo j={j} />
        </div>
      </div>
      {serie && !feito && (
        <span className="text-[12px] text-mudo">
          {j.presencial
            ? l(`Põe os mapas ganhos por cada equipa (o vencedor tem ${precisa}).`, `Enter the maps each team won (the winner has ${precisa}).`)
            : l(`Resultado em rondas do mapa ${Math.min(nMapa, j.mapas.length || nMapa)}${j.mapa ? ` (${j.mapa})` : ''}. Se ainda não houver mapas, os picks e bans despacham-se ao calhas.`, `Round score of map ${Math.min(nMapa, j.mapas.length || nMapa)}${j.mapa ? ` (${j.mapa})` : ''}. If there are no maps yet, picks and bans are completed at random.`)}
        </span>
      )}
      {feito ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="font-mono text-[15px] font-semibold tabular-nums">{serie ? `${j.serieA} - ${j.serieB}` : `${j.scoreA ?? '-'} - ${j.scoreB ?? '-'}`}</span>
          {serie && !j.presencial && <span className="font-mono text-[12px] text-mudo">({j.scoreA}-{j.scoreB} {l('rondas', 'rounds')})</span>}
          <span className="text-mudo">{l('Ganhou', 'Winner')}: <b className="text-texto">{j.vencedorId === j.equipaA?.id ? na : j.vencedorId === j.equipaB?.id ? nb : '?'}</b> · {j.como}</span>
          <BotaoSegurar rotulo={l('Segura para desfazer o resultado', 'Hold to undo the result')} className="btn btn-fantasma !h-9" onConfirmar={() => acao(() => dados.torneioDesfazerJogo(j.id), l('Resultado desfeito.', 'Result undone.'))}>
            <RotateCcw size={14} aria-hidden />{l('Desfazer', 'Undo')}
          </BotaoSegurar>
        </div>
      ) : (
        <form className="flex flex-wrap items-end gap-2" onSubmit={resolver}>
          <label className="flex flex-col gap-1 text-[11.5px] text-mudo">{na}<input className="campo !h-10 w-[80px] font-mono" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <span className="pb-2.5 font-mono text-mudo">-</span>
          <label className="flex flex-col gap-1 text-[11.5px] text-mudo">{nb}<input className="campo !h-10 w-[80px] font-mono" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
          <button type="submit" className="btn btn-primario !h-10" disabled={a === '' || b === ''}>{l('Confirmar', 'Confirm')}</button>
          {!j.presencial && (
            <>
              <BotaoSegurar rotulo={`W.O. ${na}`} className="btn btn-fantasma !h-10" onConfirmar={() => acao(() => dados.torneioWalkover(j.id, j.equipaA!.id), serie ? l(`Falta de comparência registada (${precisa}-0).`, `Forfeit recorded (${precisa}-0).`) : l('Falta de comparência registada (13-0).', 'Forfeit recorded (13-0).'))}>W.O. {na}</BotaoSegurar>
              <BotaoSegurar rotulo={`W.O. ${nb}`} className="btn btn-fantasma !h-10" onConfirmar={() => acao(() => dados.torneioWalkover(j.id, j.equipaB!.id), serie ? l(`Falta de comparência registada (${precisa}-0).`, `Forfeit recorded (${precisa}-0).`) : l('Falta de comparência registada (13-0).', 'Forfeit recorded (13-0).'))}>W.O. {nb}</BotaoSegurar>
            </>
          )}
        </form>
      )}
    </li>
  )
}

type FiltroResultados = 'jogar' | 'feitos' | 'todos'

function Resultados({ d }: { d: TorneioDetalhe }) {
  const [filtro, setFiltro] = useState<FiltroResultados>('jogar')
  const jogos = d.jogos.filter((j) => j.equipaA && j.equipaB && j.como !== 'bye')
  const lista = jogos.filter((j) => filtro === 'todos' || (filtro === 'feitos') === (j.estado === 'concluido'))
    .sort((x, y) => Number(y.semResultadoAuto) - Number(x.semResultadoAuto) || Number(y.estado === 'a_decorrer') - Number(x.estado === 'a_decorrer') || Number(x.fase === 'playoff') - Number(y.fase === 'playoff') || x.ronda - y.ronda || x.ordem - y.ordem)
  return (
    <Painel aria-label={l('Resultados', 'Results')} className="flex min-w-0 flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={l('RESULTADOS', 'RESULTS')}
        titulo={l('Resultados à mão', 'Results by hand')}
        direita={<Segmentado<FiltroResultados> rotulo={l('Filtrar jogos', 'Filter matches')} valor={filtro} onChange={setFiltro} pequeno opcoes={[{ valor: 'jogar', texto: l('Por jogar', 'To play') }, { valor: 'feitos', texto: l('Feitos', 'Done') }, { valor: 'todos', texto: l('Todos', 'All') }]} />}
      />
      <p className="m-0 text-[12.5px] leading-normal text-mudo">{l('Os resultados vêm da API da Riot sozinhos. Isto é para a final presencial, uma falta de comparência (W.O.) ou quando a API falha.', 'Results come from the Riot API by themselves. This is for the in-person final, a forfeit (W.O.) or when the API fails.')}</p>
      {lista.length === 0 ? <Vazio icone={<Trophy size={18} />} titulo={l('Nada por aqui', 'Nothing here')} /> : <ul className="m-0 flex list-none flex-col gap-2 p-0">{lista.map((j) => <ResultadoLinha key={j.id} j={j} />)}</ul>}
    </Painel>
  )
}

/** Só nos torneios de teste: equipas de bots, encher a equipa e simular jogos. */
function Testes({ d }: { d: TorneioDetalhe }) {
  const acao = useAcao()
  const t = d.torneio
  const [n, setN] = useState('4')
  const [equipa, setEquipa] = useState('')
  const [completo, setCompleto] = useState(false)
  const antesDoSorteio = t.estado === 'rascunho' || t.estado === 'inscricoes'
  const equipaId = equipa || d.equipas[0]?.id || ''
  return (
    <Painel aria-label={l('Testes com bots', 'Bot tests')} className="flex flex-col gap-4 p-[22px]">
      <TituloPainel eyebrow={l('TESTES COM BOTS', 'BOT TESTS')} titulo={l('Ferramentas de teste', 'Test tools')} direita={<Chip tom="laranja"><Bot size={12} aria-hidden />{l('SÓ EM TORNEIOS DE TESTE', 'TEST TOURNAMENTS ONLY')}</Chip>} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2.5 rounded-xl border border-white/8 bg-white/[0.025] p-3.5">
          <Papel>{l('EQUIPAS DE BOTS', 'BOT TEAMS')}</Papel>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11.5px] text-mudo">{l('Quantas', 'How many')}<input className="campo !h-10 w-[80px] font-mono" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
            <button type="button" className="btn btn-fantasma !h-10" disabled={!antesDoSorteio || !n} onClick={() => acao(() => dados.torneioTesteEquipas(t.id, Number(n)), l('Equipas de bots criadas.', 'Bot teams created.'))}><Plus size={15} aria-hidden />{l('Juntar equipas de bots', 'Add bot teams')}</button>
          </div>
          <span className="text-[11.5px] text-mudo">{l('5 bots cada, já inscritos e completos. Só antes do sorteio.', '5 bots each, already registered and complete. Before the draw only.')}</span>
        </div>
        <div className="flex flex-col gap-2.5 rounded-xl border border-white/8 bg-white/[0.025] p-3.5">
          <Papel>{l('ENCHER UMA EQUIPA COM BOTS', 'FILL A TEAM WITH BOTS')}</Papel>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11.5px] text-mudo">{l('Equipa', 'Team')}
              <select className="campo !h-10" value={equipaId} onChange={(e) => setEquipa(e.target.value)}>
                {d.equipas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-fantasma !h-10" disabled={!antesDoSorteio || !equipaId} onClick={() => acao(() => dados.torneioTestePreencher(equipaId, completo), l('Equipa preenchida com bots.', 'Team filled with bots.'))}><Bot size={15} aria-hidden />{l('Encher', 'Fill')}</button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-suave"><input type="checkbox" checked={completo} onChange={(e) => setCompleto(e.target.checked)} />{l('Também coach e 2 suplentes', 'Also coach and 2 substitutes')}</label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5 border-t border-white/8 pt-4">
        <button type="button" className="btn btn-fantasma" disabled={t.estado !== 'grupos'} onClick={() => acao(() => dados.torneioTesteSimularTudo(t.id, true), l('Grupos simulados.', 'Groups simulated.'))}>{l('Simular os grupos', 'Simulate the groups')}</button>
        <button type="button" className="btn btn-fantasma" disabled={t.estado !== 'grupos' && t.estado !== 'playoffs'} onClick={() => acao(() => dados.torneioTesteSimularTudo(t.id, false), l('Torneio simulado até ao fim.', 'Tournament simulated to the end.'))}>{l('Simular tudo', 'Simulate everything')}</button>
        <BotaoSegurar rotulo={l('Segura para reiniciar o torneio', 'Hold to restart the tournament')} className="btn btn-fantasma" onConfirmar={() => acao(() => dados.torneioTesteReiniciar(t.id), l('Torneio de volta às inscrições.', 'Tournament back to registration.'))}>
          <RotateCcw size={15} aria-hidden />{l('Segura para reiniciar', 'Hold to restart')}
        </BotaoSegurar>
      </div>
      <p className="m-0 text-[12px] leading-normal text-mudo">{l('Reiniciar apaga grupos, jogos e resultados e volta às inscrições, mantendo as equipas. Para testar com amigos, dá-lhes acesso acima: eles criam a equipa e convidam-se uns aos outros pelo nome.', 'Restarting wipes groups, matches and results and goes back to registration, keeping the teams. To test with friends, give them access above: they create a team and invite each other by name.')}</p>
    </Painel>
  )
}

function Gerir({ id, area, aoApagar }: { id: string; area: boolean; aoApagar: () => void }) {
  const acao = useAcao()
  const [editar, setEditar] = useState(false)
  const detalhe = useCarregar(() => dados.torneioDetalhe(id), [id], ['torneios', 'staff'], { chave: `torneio:${id}` })
  if (detalhe.erro && !detalhe.valor) return <Vazio icone={<Trophy size={18} />} titulo={l('Não foi possível abrir o torneio', 'Could not open the tournament')} texto={detalhe.erro} />
  if (!detalhe.valor) return <Carregando />
  const d = detalhe.valor
  const t = d.torneio
  const acabado = t.estado === 'concluido' || t.estado === 'cancelado'
  const podeApagar = t.estado === 'rascunho' || t.estado === 'cancelado' || t.teste
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Painel aria-label={t.nome} className="flex flex-col gap-4 p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="m-0 truncate text-[22px] font-extrabold tracking-[-0.03em]">{t.nome}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <ChipEstado t={t} />
              {t.teste && <Chip tom="laranja">{l('TESTE', 'TEST')}</Chip>}
              <Chip>{t.equipas} {l('equipas', 'teams')}</Chip>
              <Chip>{t.vetoMapas ? l(`Picks e bans · melhor de ${t.melhorDe}`, `Picks and bans · best of ${t.melhorDe}`) : l('Sem picks e bans', 'No picks and bans')}</Chip>
              <span className="text-[12.5px] text-mudo">{l('Inscrições até', 'Registration until')} {dataLimite(t.inscricoesAte)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/torneios/${t.id}`} className="btn btn-fantasma no-underline"><ExternalLink size={15} aria-hidden />{l('Ver a página', 'View page')}</Link>
            {!acabado && <button type="button" className="btn btn-fantasma" onClick={() => setEditar((v) => !v)}>{editar ? l('Fechar edição', 'Close editing') : l('Editar', 'Edit')}</button>}
          </div>
        </div>
        {t.descricao && <p className="m-0 max-w-[720px] text-[13px] leading-normal text-suave">{t.descricao}</p>}
        <div className="flex flex-wrap gap-2.5 border-t border-white/8 pt-4">
          {t.estado === 'rascunho' && <button type="button" className="btn btn-primario" onClick={() => acao(() => dados.torneioMudarEstado(t.id, 'inscricoes'), l('Publicado: as inscrições estão abertas.', 'Published: registration is open.'))}><Eye size={16} aria-hidden />{l('Publicar e abrir inscrições', 'Publish and open registration')}</button>}
          {t.estado === 'inscricoes' && t.equipas === 0 && <button type="button" className="btn btn-fantasma" onClick={() => acao(() => dados.torneioMudarEstado(t.id, 'rascunho'), l('Voltou a rascunho.', 'Back to draft.'))}><EyeOff size={16} aria-hidden />{l('Voltar a rascunho', 'Back to draft')}</button>}
          {!acabado && (
            <BotaoSegurar rotulo={l('Segura para cancelar o torneio', 'Hold to cancel the tournament')} className="btn btn-fantasma" onConfirmar={() => acao(() => dados.torneioMudarEstado(t.id, 'cancelado'), l('Torneio cancelado.', 'Tournament cancelled.'))}>
              <X size={15} aria-hidden />{l('Segura para cancelar', 'Hold to cancel')}
            </BotaoSegurar>
          )}
          {podeApagar && (
            <BotaoSegurar rotulo={l('Segura para apagar o torneio', 'Hold to delete the tournament')} className="btn btn-fantasma" onConfirmar={async () => { const ok = await acao(async () => { await dados.torneioApagar(t.id); return true }, l('Torneio apagado.', 'Tournament deleted.')); if (ok) aoApagar() }}>
              <Trash2 size={15} className="text-derrota" aria-hidden />{l('Segura para apagar', 'Hold to delete')}
            </BotaoSegurar>
          )}
        </div>
        {t.estado !== 'rascunho' && <span className="text-[12px] text-mudo">{estadoLegivel(t)}{t.campeao ? ` · ${l('Campeã', 'Champion')}: ${t.campeao.nome}` : ''}</span>}
      </Painel>
      <Modal aberto={editar} onFechar={() => setEditar(false)} eyebrow={l('EDITAR', 'EDIT')} titulo={t.nome} largura={760}>
        <FormTorneio inicial={t} aoGuardar={() => { setEditar(false); detalhe.recarregar() }} aoCancelar={() => setEditar(false)} />
      </Modal>
      <Visibilidade t={t} area={area} />
      {t.estado !== 'cancelado' && <Sorteio d={d} />}
      <Calendario d={d} />
      <Resultados d={d} />
      {t.teste && <Testes d={d} />}
    </div>
  )
}

/** O botão que abre a área de Torneios a toda a gente (ou a fecha), como nas outras áreas da staff. */
function AreaTorneios({ aberta, aoMudar }: { aberta: boolean | null; aoMudar: () => void }) {
  const acao = useAcao()
  if (aberta == null) return null
  return (
    <Painel aria-label={l('Área de Torneios', 'Tournaments area')} className="flex flex-wrap items-center justify-between gap-4 p-[18px]">
      <div className="flex min-w-0 max-w-[720px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Chip tom={aberta ? 'vitoria' : 'laranja'}>{aberta ? l('ÁREA ABERTA A TODA A GENTE', 'AREA OPEN TO EVERYONE') : l('ÁREA FECHADA', 'AREA CLOSED')}</Chip>
        </div>
        <p className="m-0 text-[13px] leading-normal text-suave">
          {aberta
            ? l('O separador Torneios aparece a todos e cada pessoa vê os torneios publicados que estiverem marcados como visíveis.', 'The Tournaments tab shows for everyone and each person sees the published tournaments marked as visible.')
            : l('Só tu (Owner e Dev) veem o separador Torneios. Quem for convidado para uma equipa, ou convidado a testar, passa a vê-lo e a ver esse torneio. Ao abrires a área, toda a gente vê os torneios marcados como visíveis.', 'Only you (Owner and Dev) see the Tournaments tab. Anyone invited to a team, or invited to test, starts seeing it and that tournament. Once you open the area, everyone sees the tournaments marked as visible.')}
        </p>
      </div>
      {aberta ? (
        <BotaoSegurar rotulo={l('Segura para fechar a área ao público', 'Hold to close the area to the public')} className="btn btn-fantasma" onConfirmar={async () => { await acao(() => dados.torneiosDefinirArea(false), l('A área de Torneios voltou a estar fechada.', 'The Tournaments area is closed again.')); aoMudar() }}>
          <Lock size={16} aria-hidden />{l('Fechar ao público', 'Close to the public')}
        </BotaoSegurar>
      ) : (
        <BotaoSegurar rotulo={l('Segura para abrir a área a toda a gente', 'Hold to open the area to everyone')} className="btn btn-primario" onConfirmar={async () => { await acao(() => dados.torneiosDefinirArea(true), l('A área de Torneios está aberta a toda a gente.', 'The Tournaments area is open to everyone.')); aoMudar() }}>
          <Megaphone size={16} aria-hidden />{l('Abrir a toda a gente', 'Open to everyone')}
        </BotaoSegurar>
      )}
    </Painel>
  )
}

export function StaffTorneios() {
  const [q, setQ] = useSearchParams()
  const [criar, setCriar] = useState(false)
  const area = useCarregar(() => dados.torneiosAreaAberta(), [], ['torneios', 'staff'], { chave: 'torneios:area' })
  const lista = useCarregar(() => dados.torneiosLista(), [], ['torneios', 'staff'], { chave: 'staff:torneios' })
  const escolhido = q.get('torneio')
  const sel = lista.valor?.some((t) => t.id === escolhido) ? escolhido : lista.valor?.[0]?.id ?? null
  const escolher = (id: string) => { const p = new URLSearchParams(q); p.set('torneio', id); setQ(p, { replace: true }) }

  return (
    <div className="flex min-w-0 flex-col gap-5">
    <AreaTorneios aberta={area.valor} aoMudar={area.recarregar} />
    <div className="grid min-w-0 gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
      <aside aria-label={l('Os teus torneios', 'Your tournaments')} className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">{l('OS TEUS TORNEIOS', 'YOUR TOURNAMENTS')}</span>
          <button type="button" className="btn btn-primario !h-9 !px-3" onClick={() => setCriar(true)}><Plus size={15} aria-hidden />{l('Novo', 'New')}</button>
        </div>
        {!lista.valor ? <Carregando /> : lista.valor.length === 0 ? (
          <Vazio icone={<Trophy size={18} />} titulo={l('Ainda não há torneios', 'No tournaments yet')} texto={l('Cria o primeiro: há um modelo pronto para o T7 x LGW Cup.', 'Create the first one: there is a ready-made setup for the T7 x LGW Cup.')} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {lista.valor.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-current={t.id === sel ? 'true' : undefined}
                  onClick={() => escolher(t.id)}
                  className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border bg-transparent px-3.5 py-3 text-left text-texto transition-colors ${t.id === sel ? 'border-laranja/55 bg-laranja/[0.06]' : 'border-white/8 hover:border-white/20'}`}
                >
                  <span className="truncate text-[14px] font-bold">{t.nome}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ChipEstado t={t} />
                    {t.teste && <Chip tom="laranja">{l('TESTE', 'TEST')}</Chip>}
                  </span>
                  <span className="text-[12px] text-mudo">{t.equipas} {l('equipas', 'teams')} · {t.completas} {l('completas', 'complete')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="min-w-0">
        {sel ? <Gerir key={sel} id={sel} area={!!area.valor} aoApagar={() => { lista.recarregar(); setQ(new URLSearchParams([...q].filter(([k]) => k !== 'torneio')), { replace: true }) }} /> : (
          <Painel className="p-[22px]"><Vazio icone={<Trophy size={18} />} titulo={l('Escolhe ou cria um torneio', 'Pick or create a tournament')} /></Painel>
        )}
      </div>
      <Modal aberto={criar} onFechar={() => setCriar(false)} eyebrow={l('NOVO TORNEIO', 'NEW TOURNAMENT')} titulo={l('Criar um torneio', 'Create a tournament')} largura={760}>
        <FormTorneio aoGuardar={(id) => { setCriar(false); lista.recarregar(); escolher(id) }} aoCancelar={() => setCriar(false)} />
      </Modal>
    </div>
    </div>
  )
}
