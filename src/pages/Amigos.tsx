import { Check, Search, Trash, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, type RowComponentProps } from 'react-window'
import { Avatar, Cabecalho, Chip, LinhasEsqueleto, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type Amizade } from '@/lib/dados'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'
import { haQuanto } from '@/lib/tempo'

const ALTURA_LINHA = 68

function Estado({ a }: { a: Amizade }) {
  if (a.atividade === 'jogo') return <Chip tom="laranja"><span className="ao-vivo size-1.5 rounded-full bg-laranja" />Em jogo</Chip>
  if (a.atividade === 'fila') return <Chip tom="laranja">Na fila</Chip>
  return <span className="text-[12px] text-mudo">{a.ultimaPartida ? `jogou ${haQuanto(a.ultimaPartida)}` : 'sem partidas'}</span>
}

function LinhaAmigo({ index, style, lista, remover }: RowComponentProps<{ lista: Amizade[]; remover: (id: string) => void }>) {
  const a = lista[index]
  const p = a.perfil
  return (
    <div style={style} className="border-t border-white/6">
      {/* As primeiras linhas entram em cascata; as que aparecem ao fazer scroll entram logo. */}
      <div className={`flex h-full items-center gap-3 px-1 ${index < 10 ? 'entra-linha' : ''}`} style={{ '--i': index } as React.CSSProperties}>
      <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 flex-1 items-center gap-3 text-texto no-underline hover:text-pessego">
        <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={38} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[14px] font-semibold">{nomeJogador(p)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(p)}</span></span>
          <span className="font-mono text-[11.5px] text-mudo">{p.pontos} pts · {p.vitorias}-{p.derrotas}</span>
        </span>
      </Link>
      <span className="hidden sm:inline-flex"><RankBadge tier={p.tier} pequeno /></span>
      <span className="hidden w-[110px] justify-end md:flex"><Estado a={a} /></span>
      <button type="button" aria-label={`Remover ${nomeJogador(p)}`} onClick={() => remover(p.id)} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-mudo hover:bg-white/6 hover:text-derrota">
        <Trash size={16} aria-hidden />
      </button>
      </div>
    </div>
  )
}

export function Amigos() {
  const acao = useAcao()
  const amigos = useCarregar(() => dados.amigos(), [], ['amigos', 'partida', 'fila'], { minimo: 450 })
  const [alvo, setAlvo] = useState('')
  const [filtro, setFiltro] = useState('')
  const [ver, setVer] = useState<'todos' | 'ativos'>('todos')

  const lista = amigos.valor ?? []
  const recebidos = lista.filter((a) => a.direcao === 'recebido')
  const enviados = lista.filter((a) => a.direcao === 'enviado')
  const aceites = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return lista
      .filter((a) => a.estado === 'aceite')
      .filter((a) => ver === 'todos' || a.atividade)
      .filter((a) => !q || a.perfil.riotId?.toLowerCase().includes(q) || a.perfil.utilizador.includes(q))
      .sort((x, y) => Number(!!y.atividade) - Number(!!x.atividade) || y.perfil.pontos - x.perfil.pontos)
  }, [lista, filtro, ver])

  const pedir = async () => {
    const ok = await acao(async () => { await dados.pedirAmizade(alvo); return true }, 'Pedido enviado.')
    if (ok) setAlvo('')
  }
  const remover = (id: string) => acao(() => dados.removerAmigo(id), 'Amigo removido.')

  return (
    <>
      <Cabecalho
        migalhas={['Comunidade', 'Amigos']}
        titulo="Amigos"
        descricao="Junta quem costuma jogar contigo. Vês quem está na fila ou a jogar e podes comparar-te no ranking."
      />
      <div className="flex flex-wrap items-start gap-4">
        <Painel aria-labelledby="rg-amigos" className="flex min-w-0 flex-[2_1_540px] flex-col gap-3 p-[22px]">
          <TituloPainel
            eyebrow={`${lista.filter((a) => a.estado === 'aceite').length} AMIGOS`}
            titulo="A tua lista"
            id="rg-amigos"
            direita={<Segmentado rotulo="Mostrar" valor={ver} onChange={setVer} opcoes={[{ valor: 'todos', texto: 'Todos' }, { valor: 'ativos', texto: 'Ativos agora' }]} />}
          />
          <label className="relative block">
            <span className="so-leitores">Filtrar amigos</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
            <input className="campo !pl-10" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nome" />
          </label>
          {amigos.carregando ? <LinhasEsqueleto tipo="amigos" n={6} /> : aceites.length ? (
            <List
              rowComponent={LinhaAmigo}
              rowCount={aceites.length}
              rowHeight={ALTURA_LINHA}
              rowProps={{ lista: aceites, remover }}
              style={{ height: Math.min(aceites.length, 8) * ALTURA_LINHA }}
            />
          ) : (
            <Vazio icone={<Users size={22} />} titulo={ver === 'ativos' ? 'Ninguém ativo agora' : 'Ainda sem amigos'} texto="Adiciona alguém pelo Riot ID ao lado." />
          )}
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Painel aria-labelledby="rg-adicionar" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow="ADICIONAR" titulo="Novo amigo" id="rg-adicionar" />
            <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); if (alvo.trim()) pedir() }}>
              <input className="campo font-mono" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder="Nome#TAG ou utilizador" aria-label="Riot ID ou utilizador do Discord" />
              <button type="submit" className="btn btn-primario" disabled={!alvo.trim()}><UserPlus size={16} aria-hidden />Enviar pedido</button>
            </form>
          </Painel>
          <Painel aria-labelledby="rg-pedidos" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow="PEDIDOS" titulo={recebidos.length ? `${recebidos.length} por responder` : 'Sem pedidos novos'} id="rg-pedidos" />
            {recebidos.map((a) => (
              <div key={a.perfil.id} className="flex items-center gap-3 rounded-xl border border-laranja/25 bg-laranja/6 p-2.5">
                <Avatar nome={nomeJogador(a.perfil)} url={a.perfil.avatarUrl} tamanho={34} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{a.perfil.riotId}</span>
                  <span className="text-[11.5px] text-mudo">{haQuanto(a.desde)}</span>
                </span>
                <button type="button" aria-label={`Aceitar ${nomeJogador(a.perfil)}`} onClick={() => acao(() => dados.responderAmizade(a.perfil.id, true), 'Pedido aceite.')} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border-0 bg-laranja text-escuro-laranja hover:brightness-110"><Check size={17} aria-hidden /></button>
                <button type="button" aria-label={`Recusar ${nomeJogador(a.perfil)}`} onClick={() => acao(() => dados.responderAmizade(a.perfil.id, false))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/10 bg-transparent text-mudo hover:text-texto"><X size={17} aria-hidden /></button>
              </div>
            ))}
            {enviados.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-white/7 pt-3">
                <span className="rotulo">Enviados</span>
                {enviados.map((a) => (
                  <div key={a.perfil.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-suave">{a.perfil.riotId}</span>
                    <button type="button" onClick={() => acao(() => dados.removerAmigo(a.perfil.id), 'Pedido cancelado.')} className="cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-laranja-claro hover:text-pessego">Cancelar</button>
                  </div>
                ))}
              </div>
            )}
          </Painel>
        </div>
      </div>
    </>
  )
}
