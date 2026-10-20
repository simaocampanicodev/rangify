/** As equipas de um torneio: o cartão de cada uma e o editor da equipa de quem joga (convites por nome). */
import { Crown, Search, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar, BotaoSegurar, Chip, Painel, TituloPainel } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { dados, type FuncaoEquipaTorneio, type JogadorSugerido, type TorneioEquipa, type TorneioMembro, type TorneioResumo } from '@/lib/data'
import { l } from '@/lib/idioma'
import { dataLimite, letraGrupo, nomeFuncao, Papel } from './comum'

const CAPACIDADE: Record<FuncaoEquipaTorneio, number> = { jogador: 5, coach: 1, suplente: 2 }
const FUNCOES: FuncaoEquipaTorneio[] = ['jogador', 'coach', 'suplente']

/** Uma equipa vista por toda a gente: nome, grupo, estado e quem lá está. */
export function EquipaCartao({ equipa, eu, destaque = false }: { equipa: TorneioEquipa; eu?: string; destaque?: boolean }) {
  const aceites = equipa.membros.filter((m) => m.estado === 'aceite')
  const jogadores = aceites.filter((m) => m.funcao === 'jogador')
  const outros = aceites.filter((m) => m.funcao !== 'jogador')
  return (
    <article aria-label={equipa.nome} className={`painel flex min-w-0 flex-col gap-3 !rounded-[16px] p-4 ${destaque ? '!border-laranja/55' : ''}`}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="m-0 min-w-0 truncate text-[17px] font-extrabold tracking-[-0.02em]">{equipa.nome}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {equipa.grupo != null && <Chip tom="laranja">{l('GRUPO', 'GROUP')} {letraGrupo(equipa.grupo)}</Chip>}
          {equipa.completa
            ? <Chip tom="vitoria">{l('COMPLETA', 'COMPLETE')}</Chip>
            : <Chip tom="derrota">{jogadores.length}/5</Chip>}
        </span>
      </header>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {jogadores.map((m) => <LinhaMembro key={m.perfilId} m={m} eu={eu} />)}
      </ul>
      {outros.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-white/7 p-0 pt-2.5">
          {outros.map((m) => <LinhaMembro key={m.perfilId} m={m} eu={eu} />)}
        </ul>
      )}
    </article>
  )
}

function LinhaMembro({ m, eu }: { m: TorneioMembro; eu?: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 text-[13.5px]">
      <Avatar nome={m.utilizador} url={m.avatarUrl} tamanho={26} destaque={m.perfilId === eu} perfilId={m.bot ? undefined : m.perfilId} />
      <span className="min-w-0 flex-1 truncate font-semibold">{m.utilizador}</span>
      {m.capitao && <Crown size={13} className="shrink-0 text-ouro" aria-label={l('Capitão', 'Captain')} />}
      {m.funcao !== 'jogador' && <span className="font-mono text-[10px] tracking-[0.12em] text-mudo uppercase">{nomeFuncao(m.funcao)}</span>}
      {m.bot && <span className="font-mono text-[10px] tracking-[0.12em] text-[#b57bff]">BOT</span>}
    </li>
  )
}

// ---------------------------------------------------------------- o editor da equipa de quem joga

/** Sugestões de jogadores enquanto se escreve (a pesquisa só começa às 2 letras). */
function useSugestoes(q: string) {
  const [lista, setLista] = useState<JogadorSugerido[]>([])
  useEffect(() => {
    const v = q.trim()
    if (v.length < 2) { setLista([]); return }
    let vivo = true
    const t = window.setTimeout(() => { dados.torneioProcurarJogadores(v).then((r) => { if (vivo) setLista(r) }).catch(() => { if (vivo) setLista([]) }) }, 220)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [q])
  return lista
}

/**
 * A equipa de quem está inscrito: renomear, convidar pelo nome (a pessoa tem de aceitar), mudar funções,
 * tirar gente e apagar. O capitão só mexe até acabarem as inscrições; a staff mexe sempre.
 */
export function MinhaEquipa({ torneio, equipa, eu, aoMudar }: { torneio: TorneioResumo; equipa: TorneioEquipa; eu: string; aoMudar: () => void }) {
  const acao = useAcao()
  const souCapitao = equipa.capitaoId === eu
  const acaba = torneio.estado === 'concluido' || torneio.estado === 'cancelado'
  const editavel = !acaba && ((souCapitao && torneio.inscricoesAbertas) || torneio.gerir)
  const [nome, setNome] = useState(equipa.nome)
  const [convidar, setConvidar] = useState('')
  const [funcao, setFuncao] = useState<FuncaoEquipaTorneio>('jogador')
  const [aberta, setAberta] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const sugestoes = useSugestoes(aberta ? convidar : '')
  useEffect(() => setNome(equipa.nome), [equipa.nome])

  const porFuncao = (f: FuncaoEquipaTorneio) => equipa.membros.filter((m) => m.funcao === f)
  const jogadoresAceites = porFuncao('jogador').filter((m) => m.estado === 'aceite').length

  const depois = async <T,>(f: () => Promise<T>, ok?: string) => { const r = await acao(f, ok); aoMudar(); return r }
  const convidarAgora = async (quem?: string) => {
    const alvo = (quem ?? convidar).trim()
    if (!alvo) return
    const r = await depois(() => dados.torneioConvidar(equipa.id, alvo, funcao))
    if (r) { setConvidar(''); setAberta(false) }
  }
  const adicionarSemConvite = async () => {
    const alvo = convidar.trim()
    if (!alvo) return
    const r = await depois(() => dados.torneioStaffAdicionar(equipa.id, alvo, funcao), l('Jogador adicionado.', 'Player added.'))
    if (r) { setConvidar(''); setAberta(false) }
  }
  const pedirLugar = (f: FuncaoEquipaTorneio) => { setFuncao(f); campo.current?.focus() }

  const linha = (m: TorneioMembro) => {
    const meu = m.perfilId === eu
    const pendente = m.estado === 'convidado'
    return (
      <li key={m.perfilId} className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${pendente ? 'border-pessego/35 bg-white/[0.025]' : 'border-white/9 bg-white/[0.03]'}`}>
        <span className={pendente ? 'opacity-60' : ''}><Avatar nome={m.utilizador} url={m.avatarUrl} tamanho={38} destaque={meu} perfilId={m.bot ? undefined : m.perfilId} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[14px] font-bold">
            <span className="truncate">{m.utilizador}</span>
            {m.capitao && <Crown size={13} className="shrink-0 text-ouro" aria-label={l('Capitão', 'Captain')} />}
            {m.bot && <span className="font-mono text-[10px] tracking-[0.12em] text-[#b57bff]">BOT</span>}
          </span>
          <span className="truncate font-mono text-[11px] text-mudo">
            {pendente ? <span className="text-pessego">{l('à espera de aceitar', 'waiting to accept')}</span> : m.riotId}
          </span>
        </span>
        {editavel && !m.capitao ? (
          <select
            aria-label={`${l('Função de', 'Role of')} ${m.utilizador}`}
            className="campo !h-8 !w-auto !px-2 !text-[12px]"
            value={m.funcao}
            onChange={(e) => depois(() => dados.torneioMudarFuncao(equipa.id, m.perfilId, e.target.value as FuncaoEquipaTorneio))}
          >
            {FUNCOES.map((f) => <option key={f} value={f}>{nomeFuncao(f)}</option>)}
          </select>
        ) : <Chip>{nomeFuncao(m.funcao).toUpperCase()}</Chip>}
        {editavel && !m.capitao && (
          <button
            type="button"
            aria-label={pendente ? l('Cancelar convite', 'Cancel invite') : l('Tirar da equipa', 'Remove from team')}
            title={pendente ? l('Cancelar convite', 'Cancel invite') : l('Tirar da equipa', 'Remove from team')}
            onClick={() => depois(() => dados.torneioRemoverMembro(equipa.id, m.perfilId))}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-white/10 bg-transparent text-mudo hover:text-derrota"
          >
            <X size={15} aria-hidden />
          </button>
        )}
        {!editavel && meu && !m.capitao && torneio.inscricoesAbertas && (
          <button type="button" className="btn btn-fantasma !h-8 !px-2.5 !text-[12px]" onClick={() => depois(() => dados.torneioSairEquipa(equipa.id), l('Saíste da equipa.', 'You left the team.'))}>{l('Sair', 'Leave')}</button>
        )}
      </li>
    )
  }

  const vazio = (f: FuncaoEquipaTorneio, i: number) => (
    <li key={`${f}-v${i}`}>
      {editavel ? (
        <button type="button" onClick={() => pedirLugar(f)} className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] border border-dashed border-white/14 bg-transparent px-3 py-2.5 text-left text-[13px] text-mudo hover:border-laranja/40 hover:text-texto">
          <span className="grid size-[38px] place-items-center rounded-[11px] border border-dashed border-white/14"><UserPlus size={16} aria-hidden /></span>
          {f === 'jogador' ? l('Lugar livre: convida um jogador', 'Open spot: invite a player') : f === 'coach' ? l('Sem coach: convida um', 'No coach: invite one') : l('Lugar livre: convida um suplente', 'Open spot: invite a substitute')}
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-white/10 px-3 py-2.5 text-[13px] text-mudo">
          <span className="grid size-[38px] place-items-center rounded-[11px] border border-dashed border-white/10 text-[15px]">·</span>
          {l('Lugar livre', 'Open spot')}
        </div>
      )}
    </li>
  )

  const secao = (f: FuncaoEquipaTorneio, titulo: string) => {
    const membros = porFuncao(f)
    return (
      <div className="flex flex-col gap-2">
        <Papel>{titulo} · {membros.length}/{CAPACIDADE[f]}</Papel>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {membros.map(linha)}
          {Array.from({ length: Math.max(0, CAPACIDADE[f] - membros.length) }, (_, i) => vazio(f, i))}
        </ul>
      </div>
    )
  }

  return (
    <Painel aria-labelledby="rg-minha-equipa" className="flex min-w-0 flex-col gap-4 p-[22px]">
      <TituloPainel
        eyebrow={torneio.gerir && !souCapitao ? l('EQUIPA', 'TEAM') : l('A TUA EQUIPA', 'YOUR TEAM')}
        id="rg-minha-equipa"
        direita={equipa.completa ? <Chip tom="vitoria">{l('COMPLETA', 'COMPLETE')}</Chip> : <Chip tom="derrota">{l(`FALTAM ${Math.max(0, 5 - jogadoresAceites)} JOGADORES`, `${Math.max(0, 5 - jogadoresAceites)} PLAYERS MISSING`)}</Chip>}
      />
      {editavel ? (
        <form className="flex gap-2.5" onSubmit={(e) => { e.preventDefault(); if (nome.trim() && nome.trim() !== equipa.nome) depois(() => dados.torneioRenomearEquipa(equipa.id, nome.trim()), l('Nome guardado.', 'Name saved.')) }}>
          <label className="sr-only" htmlFor="rg-nome-equipa">{l('Nome da equipa', 'Team name')}</label>
          <input id="rg-nome-equipa" className="campo min-w-0 flex-1 !text-[18px] !font-extrabold" value={nome} maxLength={32} onChange={(e) => setNome(e.target.value)} />
          <button type="submit" className="btn btn-fantasma" disabled={!nome.trim() || nome.trim() === equipa.nome}>{l('Renomear', 'Rename')}</button>
        </form>
      ) : <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.03em]">{equipa.nome}</h3>}
      <p className="m-0 text-[12.5px] leading-normal text-mudo">
        {torneio.inscricoesAbertas
          ? <>{l('Podes mudar a equipa até', 'You can change the team until')} <b className="text-pessego">{dataLimite(torneio.inscricoesAte)}</b>. {l('Quem convidas tem de aceitar.', 'Whoever you invite has to accept.')}</>
          : torneio.gerir ? l('As inscrições fecharam: só a staff muda a equipa.', 'Registration is closed: only staff can change the team.')
            : l('As inscrições fecharam: a equipa já não muda. Se faltar alguém, fala com a staff.', 'Registration is closed: the team can no longer change. If someone is missing, talk to staff.')}
      </p>
      {secao('jogador', l('JOGADORES', 'PLAYERS'))}
      {secao('coach', 'COACH')}
      {secao('suplente', l('SUPLENTES', 'SUBSTITUTES'))}

      {editavel && (
        <form className="relative flex flex-col gap-2.5 border-t border-white/7 pt-4" onSubmit={(e) => { e.preventDefault(); convidarAgora() }}>
          <Papel>{l('CONVIDAR PELO NOME', 'INVITE BY NAME')}</Papel>
          <div className="flex flex-wrap gap-2.5">
            <div className="relative min-w-[200px] flex-[2_1_240px]">
              <Search size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" />
              <label className="sr-only" htmlFor="rg-convidar">{l('Nome do jogador', 'Player name')}</label>
              <input
                id="rg-convidar"
                ref={campo}
                className="campo w-full !pl-9"
                placeholder={l('Riot ID ou utilizador (Nome#TAG)', 'Riot ID or username (Name#TAG)')}
                autoComplete="off"
                value={convidar}
                onChange={(e) => { setConvidar(e.target.value); setAberta(true) }}
                onFocus={() => setAberta(true)}
                onBlur={() => window.setTimeout(() => setAberta(false), 150)}
              />
              {aberta && sugestoes.length > 0 && (
                <ul role="listbox" aria-label={l('Sugestões', 'Suggestions')} className="painel absolute top-[calc(100%+6px)] right-0 left-0 z-20 m-0 flex list-none flex-col gap-0.5 !rounded-xl !bg-[#141417] p-1.5">
                  {sugestoes.map((s) => (
                    <li key={s.perfilId} role="option" aria-selected={false}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setConvidar(s.riotId ?? s.utilizador); setAberta(false); campo.current?.focus() }} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2 py-1.5 text-left text-texto hover:bg-laranja/10">
                        <Avatar nome={s.utilizador} url={s.avatarUrl} tamanho={26} perfilId={s.perfilId} />
                        <span className="text-[13.5px] font-bold">{s.utilizador}</span>
                        <span className="font-mono text-[11px] text-mudo">{s.riotId}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <select aria-label={l('Função', 'Role')} className="campo !w-auto" value={funcao} onChange={(e) => setFuncao(e.target.value as FuncaoEquipaTorneio)}>
              {FUNCOES.map((f) => <option key={f} value={f}>{nomeFuncao(f)}</option>)}
            </select>
            <button type="submit" className="btn btn-primario" disabled={!convidar.trim()}><UserPlus size={16} aria-hidden />{l('Convidar', 'Invite')}</button>
          </div>
          {torneio.gerir && (
            <button type="button" className="btn btn-fantasma self-start !h-9 !text-[12.5px]" disabled={!convidar.trim()} onClick={adicionarSemConvite}>
              {l('Staff: adicionar já, sem convite', 'Staff: add right away, no invite')}
            </button>
          )}
        </form>
      )}
      {editavel && (torneio.estado === 'inscricoes' || torneio.estado === 'rascunho') && (souCapitao || torneio.gerir) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-3.5">
          <span className="max-w-[360px] text-[12px] text-mudo">{l('Apagar a equipa liberta toda a gente para se inscrever noutra.', 'Deleting the team frees everyone to register elsewhere.')}</span>
          <BotaoSegurar rotulo={l('Segura para apagar a equipa', 'Hold to delete the team')} className="btn btn-fantasma" onConfirmar={() => depois(() => dados.torneioApagarEquipa(equipa.id), l('Equipa apagada.', 'Team deleted.'))}>
            {l('Apagar a equipa', 'Delete team')}
          </BotaoSegurar>
        </div>
      )}
    </Painel>
  )

}
