import { Ban, Flag, Gavel, Hourglass, Scale, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Avatar, BotaoAjuda, Cabecalho, Carregando, Chip, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type Funcao, type Partida, type Perfil } from '@/lib/dados'
import { capitao, nomeJogador } from '@/lib/partida'
import { NOMES_ESTADO, validarResultado } from '@/lib/regras'
import { haQuanto } from '@/lib/tempo'

const FUNCOES: { valor: Funcao; nome: string }[] = [
  { valor: 'owner', nome: 'Owner' }, { valor: 'dev', nome: 'Dev' }, { valor: 'mod', nome: 'Mod' },
  { valor: 'verified', nome: 'Verificado' }, { valor: 'user', nome: 'Jogador' },
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
              <span className="text-[13px]">{c ? nomeJogador(c) : '?'} <span className="text-mudo">(capitão {c?.equipa})</span></span>
              <span className="font-mono text-[16px] font-semibold">{s.a}-{s.b}</span>
            </div>
          )
        })}
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); acao(() => dados.resolverDisputa(p.id, { a: Number(a), b: Number(b) }), 'Disputa resolvida.') }}>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">Equipa A ({capitao(p, 'A') ? nomeJogador(capitao(p, 'A')!) : 'A'})<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="flex flex-col gap-1 text-[12px] text-mudo">Equipa B ({capitao(p, 'B') ? nomeJogador(capitao(p, 'B')!) : 'B'})<input className="campo !h-10 w-24 font-mono" inputMode="numeric" value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} /></label>
        <button type="submit" className="btn btn-primario !min-h-10" disabled={!v.ok}><Gavel size={15} aria-hidden />Confirmar {a}-{b}</button>
        <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => acao(() => dados.resolverDisputa(p.id, null), 'Partida anulada.')}><Ban size={15} className="text-laranja" aria-hidden />Anular</button>
      </form>
      {!v.ok && <span className="text-[12px] text-derrota">{v.titulo}</span>}
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
    const ok = await acao(async () => { await dados.definirPontos(p.id, n); return true }, `Pontos de ${p.riotId ?? p.utilizador} acertados para ${n}.`)
    if (ok) onGuardado()
  }
  return (
    <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); if (mudou) guardar() }}>
      <label className="so-leitores" htmlFor={`pts-${p.id}`}>Pontos de {p.utilizador}</label>
      <input id={`pts-${p.id}`} className="campo !h-9 !w-[84px] text-right font-mono !text-[13px]" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/D/g, '').slice(0, 5))} />
      <span className="text-[12px] text-mudo">pts</span>
      {mudou && <button type="submit" className="btn btn-suave !min-h-9 !px-3 !text-[12.5px]">Guardar</button>}
    </form>
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
    await acao(() => dados.definirFuncao(id, f), 'Função atualizada.')
    dados.pesquisarJogadores(q).then(setLista).catch(() => {})
  }
  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="so-leitores">Procurar jogadores</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
        <input className="campo !pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Utilizador ou Riot ID" />
      </label>
      <ul className="m-0 flex list-none flex-col p-0">
        {lista.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-white/6 py-2.5">
            <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] font-semibold">{p.riotId ?? p.utilizador}</span>
              <span className="font-mono text-[11px] text-mudo">{p.utilizador}</span>
            </span>
            <RankBadge tier={p.tier} pequeno />
            {(eu?.funcao === 'owner' || eu?.funcao === 'dev')
              ? <CampoPontos p={p} onGuardado={() => dados.pesquisarJogadores(q).then(setLista).catch(() => {})} />
              : <span className="font-mono text-[12.5px] text-suave">{p.pontos} pts</span>}
            <select
              aria-label={`Função de ${p.utilizador}`}
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
  const { eStaff, carregando } = useSessao()
  const acao = useAcao()
  const [aba, setAba] = useState<'disputas' | 'partidas' | 'denuncias' | 'jogadores'>('disputas')
  const disputas = useCarregar(() => (eStaff ? dados.disputas() : Promise.resolve([])), [eStaff], ['staff', 'partida'])
  const encravadas = useCarregar(() => (eStaff ? dados.partidasEncravadas() : Promise.resolve([])), [eStaff], ['staff', 'partida'])
  const denuncias = useCarregar(() => (eStaff ? dados.denuncias() : Promise.resolve([])), [eStaff], ['staff'])
  if (carregando) return <Carregando />
  if (!eStaff) return <Navigate to="/" replace />
  const abertas = (denuncias.valor ?? []).filter((d) => d.estado === 'aberta')

  return (
    <>
      <Cabecalho
        migalhas={['Conta', 'Staff']}
        titulo="Área de staff"
        descricao="Disputas de resultado, partidas encravadas, denúncias e funções dos jogadores."
        acoes={<BotaoAjuda topico="funcoes">Funções no Rangify</BotaoAjuda>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {[
          [<Scale size={18} key="d" />, 'Disputas', disputas.valor?.length ?? 0],
          [<Hourglass size={18} key="e" />, 'Encravadas', encravadas.valor?.length ?? 0],
          [<Flag size={18} key="r" />, 'Denúncias abertas', abertas.length],
        ].map(([icone, nome, n]) => (
          <Painel key={nome as string} as="div" className="flex items-center gap-3 !rounded-[14px] p-4">
            <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja">{icone}</span>
            <span className="flex flex-col"><span className="font-mono text-[24px] leading-none font-semibold">{n as number}</span><span className="text-[12.5px] text-mudo">{nome}</span></span>
          </Painel>
        ))}
      </div>
      <Painel className="flex flex-col gap-4 p-[22px]">
        <Segmentado
          rotulo="Secção"
          valor={aba}
          onChange={setAba}
          opcoes={[{ valor: 'disputas', texto: 'Disputas' }, { valor: 'partidas', texto: 'Partidas' }, { valor: 'denuncias', texto: 'Denúncias' }, { valor: 'jogadores', texto: 'Jogadores' }]}
        />
        {aba === 'disputas' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="DISPUTAS" titulo="Resultados que não coincidem" />
            {disputas.valor?.length ? disputas.valor.map((p) => <Disputa key={p.id} p={p} />) : <Vazio icone={<Scale size={22} />} titulo="Sem disputas" texto="Quando os capitães submeterem resultados diferentes, aparecem aqui." />}
          </div>
        )}
        {aba === 'partidas' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="PARTIDAS ENCRAVADAS" titulo="Paradas há demasiado tempo" />
            {encravadas.valor?.length ? encravadas.valor.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono text-[13px] font-semibold text-pessego">{p.codigo} · {p.mapa ?? 'sem mapa'}</span>
                  <span className="text-[12.5px] text-mudo">{NOMES_ESTADO[p.estado]} · parada {haQuanto(p.atualizadaEm)}</span>
                </span>
                <Chip>{p.jogadores.length} jogadores</Chip>
                <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => acao(() => dados.cancelarPartida(p.id), 'Partida cancelada.')}><Ban size={15} className="text-laranja" aria-hidden />Cancelar partida</button>
              </div>
            )) : <Vazio icone={<Hourglass size={22} />} titulo="Tudo a andar" texto="Nenhuma partida parada há mais de 10 minutos." />}
          </div>
        )}
        {aba === 'denuncias' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="DENÚNCIAS" titulo="Reportadas pela comunidade" />
            {denuncias.valor?.length ? denuncias.valor.map((d) => (
              <article key={d.id} className={`flex flex-col gap-2 rounded-[14px] border p-4 ${d.estado === 'aberta' ? 'border-laranja/30 bg-laranja/5' : 'border-white/7 bg-white/[0.02] opacity-70'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tom={d.estado === 'aberta' ? 'laranja' : 'neutro'}>{d.motivo}</Chip>
                  <span className="text-[13.5px] font-semibold">{d.alvo.riotId}</span>
                  <span className="text-[12px] text-mudo">por {d.denunciante} · {haQuanto(d.criadaEm)}</span>
                </div>
                <p className="m-0 text-[13.5px] leading-normal text-suave">{d.detalhes}</p>
                {d.estado === 'aberta' ? (
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-suave !min-h-9 !text-[13px]" onClick={() => acao(() => dados.tratarDenuncia(d.id, 'resolvida'), 'Denúncia resolvida.')}><ShieldCheck size={15} aria-hidden />Resolver</button>
                    <button type="button" className="btn btn-fantasma !min-h-9 !text-[13px]" onClick={() => acao(() => dados.tratarDenuncia(d.id, 'arquivada'), 'Denúncia arquivada.')}>Arquivar</button>
                  </div>
                ) : <span className="text-[12px] text-mudo">{d.estado === 'resolvida' ? 'Resolvida' : 'Arquivada'}</span>}
              </article>
            )) : <Vazio icone={<Flag size={22} />} titulo="Sem denúncias" />}
          </div>
        )}
        {aba === 'jogadores' && (
          <div className="flex flex-col gap-3">
            <TituloPainel eyebrow="JOGADORES" titulo="Funções" />
            <p className="m-0 text-[13px] text-mudo">Só o Owner atribui Owner e Dev. Owner e Dev atribuem Mod, Verificado e Jogador, e podem acertar os pontos de cada jogador.</p>
            <Jogadores />
          </div>
        )}
      </Painel>
    </>
  )
}
