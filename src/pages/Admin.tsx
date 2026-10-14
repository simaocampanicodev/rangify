import { Ban, Check, Flag, Gavel, Hourglass, RotateCcw, Scale, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { DiscordStaff, LojaStaff, NovidadesStaff, RecarregarStaff, SugestoesStaff, TesteApiStaff } from '@/components/StaffExtras'
import { Avatar, BotaoAjuda, Cabecalho, Carregando, Chip, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type Funcao, type Partida, type Perfil } from '@/lib/dados'
import { MAPAS, ROTACAO_PADRAO } from '@/lib/mapas'
import { capitao, nomeJogador } from '@/lib/partida'
import { NOMES_ESTADO, validarResultado } from '@/lib/regras'
import { l as tx } from '@/lib/idioma'
import { haQuanto } from '@/lib/tempo'

const FUNCOES: { valor: Funcao; nome: string }[] = [
  { valor: 'owner', nome: 'Owner' }, { valor: 'dev', nome: 'Dev' }, { valor: 'mod', nome: 'Mod' },
  { valor: 'verified', get nome() { return tx('Verificado', 'Verified') } }, { valor: 'user', get nome() { return tx('Jogador', 'Player') } },
]

function Disputa({ p }: { p: Partida }) {
  const acao = useAcao()
  const [a, setA] = useState(String(p.submissoes[0]?.a ?? 13))
  const [b, setB] = useState(String(p.submissoes[0]?.b ?? 11))
  const v = validarResultado(Number(a), Number(b))
  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold text-pessego">{p.codigo} · {p.mapa}</span>
        <span className="text-[12px] text-mudo">{haQuanto(p.atualizadaEm)}</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
        {p.submissoes.map((s) => {
          const c = p.jogadores.find((j) => j.perfilId === s.capitaoId)
          return (
            <div key={s.capitaoId} className="flex items-center justify-between gap-2 rounded-xl border border-white/7 px-3 py-2">
              <span className="text-[13px]">{c ? nomeJogador(c) : '?'} <span className="text-mudo">({tx('capitão', 'captain')} {c?.equipa})</span></span>
              <span className="font-mono text-[16px] font-semibold">{s.a}-{s.b}</span>
            </div>
          )
        })}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); acao(() => dados.resolverDisputa(p.id, { a: Number(a), b: Number(b) }), tx('Disputa resolvida.', 'Dispute resolved.')) }}>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">{tx('Equipa', 'Team')} A ({capitao(p, 'A') ? nomeJogador(capitao(p, 'A')!) : 'A'})<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">{tx('Equipa', 'Team')} B ({capitao(p, 'B') ? nomeJogador(capitao(p, 'B')!) : 'B'})<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="submit" className="btn btn-primario !min-h-10" disabled={!v.ok}><Gavel size={15} aria-hidden />{tx('Confirmar', 'Confirm')} {a}-{b}</button>
        <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => acao(() => dados.resolverDisputa(p.id, null), tx('Partida anulada.', 'Match voided.'))}><Ban size={15} className="text-laranja" aria-hidden />{tx('Anular', 'Void')}</button>
      </form>
      {!v.ok && <span className="text-[12px] text-derrota">{v.titulo}</span>}
    </article>
  )
}

/**
 * Uma partida a jogar ou à espera do resultado: a staff vê quem já submeteu e
 * submete pelos capitães que faltam (se baterem certo segue para a API; se não, disputa).
 */
function ResultadoPendente({ p }: { p: Partida }) {
  const acao = useAcao()
  const [a, setA] = useState(String(p.submissoes[0]?.a ?? 13))
  const [b, setB] = useState(String(p.submissoes[0]?.b ?? 11))
  const v = validarResultado(Number(a), Number(b))
  const falta = [p.capitaoA, p.capitaoB].filter((c) => c && !p.submissoes.some((s) => s.capitaoId === c))
  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold text-pessego">{p.codigo} · {p.mapa ?? tx('sem mapa', 'no map')}</span>
        <span className="flex items-center gap-2">
          <Chip tom={p.estado === 'RESULT_SUBMISSION' ? 'laranja' : 'neutro'}>{NOMES_ESTADO[p.estado]}</Chip>
          <span className="text-[12px] text-mudo">{tx('começou', 'started')} {haQuanto(p.comecouEm ?? p.atualizadaEm)}</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
        {(['A', 'B'] as const).map((eq) => {
          const c = capitao(p, eq)
          const s = p.submissoes.find((x) => x.capitaoId === c?.perfilId)
          return (
            <div key={eq} className="flex items-center justify-between gap-2 rounded-xl border border-white/7 px-3 py-2">
              <span className="text-[13px]">{c ? nomeJogador(c) : '?'} <span className="text-mudo">({tx('capitão', 'captain')} {eq})</span></span>
              {s ? <span className="font-mono text-[16px] font-semibold">{s.a}-{s.b}</span> : <span className="font-mono text-[12px] text-mudo">{tx('por submeter', 'not submitted')}</span>}
            </div>
          )
        })}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); acao(() => dados.submeterResultadoStaff(p.id, { a: Number(a), b: Number(b) }), tx('Resultado submetido pela staff.', 'Result submitted by staff.')) }}>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">{tx('Equipa', 'Team')} A<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">{tx('Equipa', 'Team')} B<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="submit" className="btn btn-primario !min-h-10" disabled={!v.ok}>
          <Gavel size={15} aria-hidden />{falta.length === 2 ? tx(`Submeter ${a}-${b} pelos dois capitães`, `Submit ${a}-${b} for both captains`) : tx(`Submeter ${a}-${b} pelo capitão que falta`, `Submit ${a}-${b} for the missing captain`)}
        </button>
      </form>
      <span className={`text-[12px] ${v.ok ? 'text-mudo' : 'text-derrota'}`}>
        {v.ok ? (p.submissoes.length ? tx('Se não bater certo com o que o outro capitão já submeteu, a partida vai para disputa.', 'If it does not match what the other captain submitted, the match goes to dispute.') : tx('Com os dois capitães submetidos pela staff, a partida segue para a confirmação na API.', 'With both captains submitted by staff, the match moves on to the API check.')) : v.titulo}
      </span>
    </article>
  )
}

/** Pontos de um jogador, editáveis por Owner e Dev. */
function CampoPontos({ p, onGuardado }: { p: Perfil; onGuardado: () => void }) {
  const acao = useAcao()
  const [valor, setValor] = useState(String(p.pontos))
  useEffect(() => { setValor(String(p.pontos)) }, [p.pontos])
  const n = Number(valor)
  const mudou = valor !== String(p.pontos) && Number.isInteger(n) && n >= 0 && n <= 10000
  const guardar = async () => {
    const ok = await acao(async () => { await dados.definirPontos(p.id, n); return true }, tx(`Pontos de ${p.riotId ?? p.utilizador} acertados para ${n}.`, `${p.riotId ?? p.utilizador}'s points set to ${n}.`))
    if (ok) onGuardado()
  }
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (mudou) guardar() }}>
      <label className="so-leitores" htmlFor={`pts-${p.id}`}>{tx('Pontos de', 'Points of')} {p.utilizador}</label>
      <input id={`pts-${p.id}`} className="campo !h-9 !w-[84px] text-right font-mono !text-[13px]" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 5))} />
      <span className="text-[12px] text-mudo">pts</span>
      {mudou && <button type="submit" className="btn btn-suave !min-h-9 !px-3 !text-[12.5px]">{tx('Guardar', 'Save')}</button>}
    </form>
  )
}

/** A rotação de mapas: só entram nos bans das próximas partidas os mapas escolhidos aqui. */
function Rotacao() {
  const acao = useAcao()
  const { perfil: eu } = useSessao()
  const podeEditar = eu?.funcao === 'owner' || eu?.funcao === 'dev'
  const atual = useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas' })
  const [escolha, setEscolha] = useState<string[] | null>(null)
  const guardada = atual.valor ?? []
  const lista = escolha ?? guardada
  const mudou = escolha !== null && (escolha.length !== guardada.length || escolha.some((m) => !guardada.includes(m)))
  const alternar = (nome: string) => {
    if (!podeEditar) return
    setEscolha(lista.includes(nome) ? lista.filter((m) => m !== nome) : [...lista, nome])
  }
  const guardar = async () => {
    const ok = await acao(async () => { await dados.definirPoolMapas(lista); return true }, tx(`Rotação guardada com ${lista.length} mapas. Vale a partir da próxima partida.`, `Rotation saved with ${lista.length} maps. It applies from the next match.`))
    if (ok) { setEscolha(null); atual.recarregar() }
  }
  if (atual.carregando) return <Carregando />

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-mudo">
        {podeEditar ? tx('Toca num mapa para o tirar ou meter na rotação. ', 'Tap a map to remove it from or add it to the rotation. ') : tx('Só Owner e Dev mudam a rotação. ', 'Only Owner and Dev change the rotation. ')}
        {tx('As partidas que já começaram ficam com os mapas que tinham; as próximas usam esta lista. Mínimo de 3 mapas.', 'Matches already started keep the maps they had; the next ones use this list. At least 3 maps.')}
      </p>
      {/* 7 por linha em ecrãs largos; a última linha estica para nunca ficar um buraco. */}
      <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
        {MAPAS.map((m) => {
          const dentro = lista.includes(m.nome)
          return (
            <li key={m.nome} className="min-w-[120px] flex-[1_1_calc((100%-60px)/7)]">
              <button
                type="button"
                aria-pressed={dentro}
                disabled={!podeEditar}
                onClick={() => alternar(m.nome)}
                className={`group relative flex h-[96px] w-full items-end overflow-hidden rounded-[14px] border p-3 text-left transition-colors ${podeEditar ? 'cursor-pointer' : 'cursor-default'} ${dentro ? 'border-laranja/70' : 'border-white/8'}`}
              >
                <span aria-hidden className="mapa absolute inset-0 transition-[filter,transform] duration-300 group-hover:scale-[1.04]" style={{ backgroundImage: `url(${m.imagem})`, filter: dentro ? undefined : 'grayscale(1) brightness(0.4)' }} />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[rgba(9,9,11,0.92)] via-[rgba(9,9,11,0.25)] to-transparent" />
                <span className={`absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full border ${dentro ? 'border-laranja bg-laranja text-escuro-laranja' : 'border-white/25 bg-[rgba(9,9,11,0.55)] text-transparent'}`}>
                  <Check size={14} strokeWidth={3} aria-hidden />
                </span>
                <span className="relative flex flex-col">
                  <span className={`text-[15px] font-extrabold tracking-[-0.01em] uppercase ${dentro ? 'text-marfim' : 'text-mudo'}`}>{m.nome}</span>
                  <span className="font-mono text-[10.5px] text-mudo">{dentro ? tx('NA ROTAÇÃO', 'IN ROTATION') : tx('FORA', 'OUT')}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/7 pt-3">
          <span className={`mr-auto text-[13px] ${lista.length < 3 ? 'text-pessego' : 'text-suave'}`}>
            {tx(`${lista.length} ${lista.length === 1 ? 'mapa' : 'mapas'} na rotação · ${Math.max(0, lista.length - 1)} bans por partida`, `${lista.length} ${lista.length === 1 ? 'map' : 'maps'} in rotation · ${Math.max(0, lista.length - 1)} bans per match`)}
            {lista.length < 3 && tx(' · escolhe pelo menos 3', ' · pick at least 3')}
          </span>
          <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => setEscolha([...ROTACAO_PADRAO])}><RotateCcw size={15} aria-hidden />{tx('Repor a de origem', 'Reset to default')}</button>
          {mudou && <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => setEscolha(null)}>{tx('Desfazer', 'Undo')}</button>}
          <button type="button" className="btn btn-primario !min-h-10" disabled={!mudou || lista.length < 3} onClick={guardar}>{tx('Guardar rotação', 'Save rotation')}</button>
        </div>
      )}
    </div>
  )
}

function Jogadores() {
  const acao = useAcao()
  const { perfil: eu } = useSessao()
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<Perfil[]>([])
  useEffect(() => {
    const t = window.setTimeout(() => { dados.pesquisarJogadores(q).then(setLista).catch(() => {}) }, 200)
    return () => window.clearTimeout(t)
  }, [q])
  const mudar = async (id: string, f: Funcao) => {
    await acao(() => dados.definirFuncao(id, f), tx('Função atualizada.', 'Role updated.'))
    dados.pesquisarJogadores(q).then(setLista).catch(() => {})
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="so-leitores">{tx('Procurar jogadores', 'Search players')}</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
        <input className="campo !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx('Utilizador ou Riot ID', 'Username or Riot ID')} />
      </label>
      <ul className="m-0 flex list-none flex-col p-0">
        {lista.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-white/6 py-2.5">
            <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={32} perfilId={p.id} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] font-semibold">{p.riotId ?? p.utilizador}</span>
              <span className="font-mono text-[11px] text-mudo">{p.utilizador}</span>
            </span>
            <RankBadge tier={p.tier} pequeno />
            {(eu?.funcao === 'owner' || eu?.funcao === 'dev')
              ? <CampoPontos p={p} onGuardado={() => dados.pesquisarJogadores(q).then(setLista).catch(() => {})} />
              : <span className="font-mono text-[12.5px] text-suave">{p.pontos} pts</span>}
            <select
              aria-label={`${tx('Função de', 'Role of')} ${p.utilizador}`}
              className="campo !h-9 !w-auto !text-[13px]"
              value={p.funcao}
              disabled={p.id === eu?.id || eu?.funcao === 'mod'}
              onChange={(e) => mudar(p.id, e.target.value as Funcao)}
            >
              {FUNCOES.map((f) => <option key={f.valor} value={f.valor}>{f.nome}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Admin() {
  const { eStaff, carregando, perfil } = useSessao()
  const ownerDev = perfil?.funcao === 'owner' || perfil?.funcao === 'dev'
  const acao = useAcao()
  const [aba, setAba] = useState<'disputas' | 'resultados' | 'partidas' | 'denuncias' | 'sugestoes' | 'mapas' | 'novidades' | 'api' | 'discord' | 'loja' | 'jogadores'>('disputas')
  const disputas = useCarregar(() => (eStaff ? dados.disputas() : Promise.resolve([])), [eStaff], ['staff', 'partida'])
  const pendentes = useCarregar(() => (eStaff ? dados.resultadosPendentes() : Promise.resolve([])), [eStaff], ['staff', 'partida'])
  const encravadas = useCarregar(() => (eStaff ? dados.partidasEncravadas() : Promise.resolve([])), [eStaff], ['staff', 'partida'])
  const denuncias = useCarregar(() => (eStaff ? dados.denuncias() : Promise.resolve([])), [eStaff], ['staff'])
  if (carregando) return <Carregando />
  if (!eStaff) return <Navigate to="/" replace />
  const abertas = (denuncias.valor ?? []).filter((d) => d.estado === 'aberta')

  return (
    <>
      <Cabecalho
        migalhas={[tx('Conta', 'Account'), 'Staff']}
        titulo={tx('Área de staff', 'Staff area')}
        descricao={tx('Disputas de resultado, partidas encravadas, denúncias, sugestões, rotação de mapas, novidades e funções dos jogadores.', 'Result disputes, stuck matches, reports, suggestions, map rotation, news and player roles.')}
        acoes={<BotaoAjuda topico="funcoes">{tx('Funções no Rangify', 'Roles on Rangify')}</BotaoAjuda>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {[
          [<Scale size={18} key="d" />, tx('Disputas', 'Disputes'), disputas.valor?.length ?? 0],
          [<Gavel size={18} key="p" />, tx('À espera do resultado', 'Awaiting result'), pendentes.valor?.filter((p) => p.estado === 'RESULT_SUBMISSION').length ?? 0],
          [<Hourglass size={18} key="e" />, tx('Encravadas', 'Stuck'), encravadas.valor?.length ?? 0],
          [<Flag size={18} key="r" />, tx('Denúncias abertas', 'Open reports'), abertas.length],
        ].map(([icone, nome, n]) => (
          <Painel key={nome as string} as="div" className="flex items-center gap-3 !rounded-[14px] p-4">
            <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja">{icone}</span>
            <span className="flex flex-col"><span className="font-mono text-[24px] leading-none font-semibold">{n as number}</span><span className="text-[12.5px] text-mudo">{nome}</span></span>
          </Painel>
        ))}
      </div>
      <Painel className="flex flex-col gap-4 p-[22px]">
        <Segmentado
          rotulo={tx('Secção', 'Section')}
          valor={aba}
          onChange={setAba}
          opcoes={[{ valor: 'disputas', texto: tx('Disputas', 'Disputes') }, { valor: 'resultados', texto: tx('Resultados', 'Results') }, { valor: 'partidas', texto: tx('Partidas', 'Matches') }, { valor: 'denuncias', texto: tx('Denúncias', 'Reports') }, { valor: 'sugestoes', texto: tx('Sugestões', 'Suggestions') }, { valor: 'mapas', texto: tx('Mapas', 'Maps') }, { valor: 'novidades', texto: tx('Novidades', 'News') }, ...(ownerDev ? [{ valor: 'api' as const, texto: 'API' }, { valor: 'discord' as const, texto: 'Discord' }, { valor: 'loja' as const, texto: tx('Loja', 'Shop') }] : []), { valor: 'jogadores', texto: tx('Jogadores', 'Players') }]}
        />
        {aba === 'disputas' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('DISPUTAS', 'DISPUTES')} titulo={tx('Resultados que não coincidem', 'Results that do not match')} />
            {disputas.valor?.length ? disputas.valor.map((p) => <Disputa key={p.id} p={p} />) : <Vazio icone={<Scale size={22} />} titulo={tx('Sem disputas', 'No disputes')} texto={tx('Quando os capitães submeterem resultados diferentes, aparecem aqui.', 'When captains submit different results, they show up here.')} />}
          </div>
        )}
        {aba === 'resultados' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('RESULTADOS', 'RESULTS')} titulo={tx('Partidas à espera do resultado', 'Matches awaiting the result')} />
            {pendentes.valor?.length
              ? [...pendentes.valor].sort((x, y) => (x.estado === 'RESULT_SUBMISSION' ? 0 : 1) - (y.estado === 'RESULT_SUBMISSION' ? 0 : 1)).map((p) => <ResultadoPendente key={p.id} p={p} />)
              : pendentes.erro
                ? <Vazio icone={<Gavel size={22} />} titulo={tx('Não foi possível carregar os resultados', 'Could not load the results')} texto={pendentes.erro} />
                : <Vazio icone={<Gavel size={22} />} titulo={tx('Nada à espera', 'Nothing waiting')} texto={tx('Quando uma partida estiver a jogar ou à espera do resultado, aparece aqui.', 'Matches being played or waiting for the result show up here.')} />}
          </div>
        )}
        {aba === 'partidas' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('PARTIDAS ENCRAVADAS', 'STUCK MATCHES')} titulo={tx('Paradas há demasiado tempo', 'Stopped for too long')} />
            {encravadas.valor?.length ? encravadas.valor.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono text-[13px] font-semibold text-pessego">{p.codigo} · {p.mapa ?? tx('sem mapa', 'no map')}</span>
                  <span className="text-[12.5px] text-mudo">{NOMES_ESTADO[p.estado]} · {tx('parada', 'stopped')} {haQuanto(p.atualizadaEm)}</span>
                </span>
                <Chip>{p.jogadores.length} {tx('jogadores', 'players')}</Chip>
                <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => acao(() => dados.cancelarPartida(p.id), tx('Partida cancelada.', 'Match cancelled.'))}><Ban size={15} className="text-laranja" aria-hidden />{tx('Cancelar partida', 'Cancel match')}</button>
              </div>
            )) : <Vazio icone={<Hourglass size={22} />} titulo={tx('Tudo a andar', 'All running')} texto={tx('Nenhuma partida parada há mais de 10 minutos.', 'No match stopped for more than 10 minutes.')} />}
          </div>
        )}
        {aba === 'denuncias' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('DENÚNCIAS', 'REPORTS')} titulo={tx('Reportadas pela comunidade', 'Reported by the community')} />
            {denuncias.valor?.length ? denuncias.valor.map((d) => (
              <article key={d.id} className={`flex flex-col gap-2 rounded-[14px] border p-4 ${d.estado === 'aberta' ? 'border-laranja/30 bg-laranja/5' : 'border-white/7 bg-white/[0.02] opacity-70'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tom={d.estado === 'aberta' ? 'laranja' : 'neutro'}>{d.motivo}</Chip>
                  <span className="text-[13.5px] font-semibold">{d.alvo.riotId}</span>
                  <span className="text-[12px] text-mudo">{tx('por', 'by')} {d.denunciante} · {haQuanto(d.criadaEm)}</span>
                </div>
                <p className="m-0 text-[13.5px] leading-normal text-suave">{d.detalhes}</p>
                {d.estado === 'aberta' ? (
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-suave !min-h-9 !text-[13px]" onClick={() => acao(() => dados.tratarDenuncia(d.id, 'resolvida'), tx('Denúncia resolvida.', 'Report resolved.'))}><ShieldCheck size={15} aria-hidden />{tx('Resolver', 'Resolve')}</button>
                    <button type="button" className="btn btn-fantasma !min-h-9 !text-[13px]" onClick={() => acao(() => dados.tratarDenuncia(d.id, 'arquivada'), tx('Denúncia arquivada.', 'Report archived.'))}>{tx('Arquivar', 'Archive')}</button>
                  </div>
                ) : <span className="text-[12px] text-mudo">{d.estado === 'resolvida' ? tx('Resolvida', 'Resolved') : tx('Arquivada', 'Archived')}</span>}
              </article>
            )) : <Vazio icone={<Flag size={22} />} titulo={tx('Sem denúncias', 'No reports')} />}
          </div>
        )}
        {aba === 'sugestoes' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('SUGESTÕES', 'SUGGESTIONS')} titulo={tx('Ideias da comunidade', 'Community ideas')} />
            <SugestoesStaff />
          </div>
        )}
        {aba === 'novidades' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('NOVIDADES', 'NEWS')} titulo={tx('O que aparece no Painel', 'What shows on the Dashboard')} />
            <NovidadesStaff podeEditar={ownerDev} />
          </div>
        )}
        {aba === 'api' && ownerDev && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="HENRIK DEV API" titulo={tx('Testar a leitura de um jogo personalizado', 'Test reading a custom game')} />
            <TesteApiStaff />
            <div className="mt-3 flex flex-col gap-3 border-t border-white/6 pt-5">
              <TituloPainel eyebrow={tx('PARTIDAS JOGADAS', 'PLAYED MATCHES')} titulo={tx('Recarregar os dados de uma partida', 'Reload match data')} />
              <RecarregarStaff />
            </div>
          </div>
        )}
        {aba === 'discord' && ownerDev && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="DISCORD" titulo={tx('Servidor obrigatório para a fila', 'Server required for the queue')} />
            <DiscordStaff />
          </div>
        )}
        {aba === 'loja' && ownerDev && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('LOJA', 'SHOP')} titulo={tx('Abrir a loja a toda a gente', 'Open the shop to everyone')} />
            <LojaStaff />
          </div>
        )}
        {aba === 'mapas' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('ROTAÇÃO', 'ROTATION')} titulo={tx('Mapas que se podem jogar', 'Maps that can be played')} />
            <Rotacao />
          </div>
        )}
        {aba === 'jogadores' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow={tx('JOGADORES', 'PLAYERS')} titulo={tx('Funções', 'Roles')} />
            <p className="m-0 text-[13px] text-mudo">{tx('Só o Owner atribui Owner e Dev. Owner e Dev atribuem Mod, Verificado e Jogador, e podem acertar os pontos de cada jogador.', 'Only the Owner gives Owner and Dev. Owner and Dev give Mod, Verified and Player, and can set each player\'s points.')}</p>
            <Jogadores />
          </div>
        )}
      </Painel>
    </>
  )
}
