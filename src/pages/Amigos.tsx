import { Check, Search, Trash, UserPlus, Users, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { List, type RowComponentProps } from 'react-window'
import { useClassesCosmeticos } from '@/components/Cosmeticos'
import { Avatar, BotaoSegurar, Cabecalho, Chip, LinhasEsqueleto, Painel, RankBadge, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { avisarMudanca, dados, type Amizade } from '@/lib/data'
import { caminhoPerfil, nomeJogador, tagJogador } from '@/lib/partida'
import { l as tx } from '@/lib/idioma'
import { haQuanto } from '@/lib/tempo'

const ALTURA_LINHA = 68

function Estado({ a }: { a: Amizade }) {
  if (a.atividade === 'jogo') return <Chip tom="laranja"><span className="ao-vivo size-1.5 rounded-full bg-laranja" />{tx('Em jogo', 'In game')}</Chip>
  if (a.atividade === 'fila') return <Chip tom="laranja">{tx('Na fila', 'In queue')}</Chip>
  return <span className="text-[12px] text-mudo">{a.ultimaPartida ? `${tx('jogou', 'played')} ${haQuanto(a.ultimaPartida)}` : tx('sem partidas', 'no matches')}</span>
}

function LinhaAmigo({ index, style, lista, remover, dica }: RowComponentProps<{ lista: Amizade[]; remover: (id: string) => void; dica: () => void }>) {
  const a = lista[index]
  const p = a.perfil
  const cz = useClassesCosmeticos(p.id)
  return (
    <div style={style} className="border-t border-white/6">
      {/* As primeiras linhas entram em cascata; as que aparecem ao fazer scroll entram logo. */}
      <div className={`cz-item flex h-full items-center gap-3 px-1 ${index < 10 ? 'entra-linha' : ''} ${cz.placa ? `${cz.placa} rounded-xl px-3` : ''}`} style={{ '--i': index } as React.CSSProperties}>
      <Link to={caminhoPerfil(p.riotId)} className="flex min-w-0 flex-1 items-center gap-3 text-texto no-underline hover:text-pessego">
        <Avatar nome={nomeJogador(p)} url={p.avatarUrl} tamanho={38} perfilId={p.id} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="cz-nome truncate text-[14px] font-semibold">{nomeJogador(p)}<span className="font-mono text-[11px] font-medium text-mudo">{tagJogador(p)}</span></span>
          <span className="font-mono text-[11.5px] text-mudo">{p.pontos} pts · {p.vitorias}-{p.derrotas}</span>
        </span>
      </Link>
      <span className="hidden sm:inline-flex"><RankBadge tier={p.tier} pequeno /></span>
      <span className="hidden w-[110px] justify-end md:flex"><Estado a={a} /></span>
      <BotaoSegurar
        rotulo={tx(`Segura para remover ${nomeJogador(p)}`, `Hold to remove ${nomeJogador(p)}`)}
        onConfirmar={() => remover(p.id)}
        aoLargarCedo={dica}
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-white/8 bg-transparent text-mudo hover:border-derrota/40 hover:text-derrota"
      >
        <Trash size={16} aria-hidden />
      </BotaoSegurar>
      </div>
    </div>
  )
}

export function Amigos() {
  const acao = useAcao()
  const avisar = useAvisos()
  const amigos = useCarregar(() => dados.amigos(), [], ['amigos', 'partida', 'fila'], { minimo: 450, chave: 'amigos' })
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
    const ok = await acao(async () => { await dados.pedirAmizade(alvo); return true }, tx('Pedido enviado.', 'Request sent.'))
    if (ok) { setAlvo(''); avisarMudanca('amigos') }
  }
  /** Corre a ação e, se correu bem, atualiza a lista, o contador da barra lateral e o perfil. */
  const fazer = async (f: () => Promise<unknown>, ok?: string) => {
    const r = await acao(async () => { await f(); return true }, ok)
    if (r) avisarMudanca('amigos')
  }
  const remover = (id: string) => fazer(() => dados.removerAmigo(id), tx('Amigo removido.', 'Friend removed.'))
  const dica = () => avisar(tx('Mantém o botão premido até encher para remover.', 'Hold the button until it fills to remove.'))

  return (
    <>
      <Cabecalho
        migalhas={[tx('Comunidade', 'Community'), tx('Amigos', 'Friends')]}
        titulo={tx('Amigos', 'Friends')}
        descricao={tx('Junta quem costuma jogar contigo. Vês quem está na fila ou a jogar e podes comparar-te na tabela.', 'Add the people you usually play with. See who is queueing or playing and compare yourself on the leaderboard.')}
      />
      <div className="flex flex-wrap items-start gap-4">
        <Painel aria-labelledby="rg-amigos" className="flex min-w-0 flex-[2_1_540px] flex-col gap-3 p-[22px]">
          <TituloPainel
            eyebrow={`${lista.filter((a) => a.estado === 'aceite').length} ${tx('AMIGOS', 'FRIENDS')}`}
            titulo={tx('A tua lista', 'Your list')}
            id="rg-amigos"
            direita={<Segmentado rotulo={tx('Mostrar', 'Show')} valor={ver} onChange={setVer} opcoes={[{ valor: 'todos', texto: tx('Todos', 'All') }, { valor: 'ativos', texto: tx('Ativos agora', 'Active now') }]} />}
          />
          <label className="relative block">
            <span className="so-leitores">{tx('Filtrar amigos', 'Filter friends')}</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-mudo" aria-hidden />
            <input className="campo !pl-10" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={tx('Filtrar por nome', 'Filter by name')} />
          </label>
          {amigos.carregando ? <LinhasEsqueleto tipo="amigos" n={6} /> : aceites.length ? (
            <List
              rowComponent={LinhaAmigo}
              rowCount={aceites.length}
              rowHeight={ALTURA_LINHA}
              rowProps={{ lista: aceites, remover, dica }}
              className="cz-calmo"
              style={{ height: Math.min(aceites.length, 8) * ALTURA_LINHA }}
            />
          ) : (
            <Vazio icone={<Users size={22} />} titulo={ver === 'ativos' ? tx('Ninguém ativo agora', 'Nobody active now') : tx('Ainda sem amigos', 'No friends yet')} texto={tx('Adiciona alguém pelo Riot ID ao lado.', 'Add someone by Riot ID on the side.')} />
          )}
        </Painel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Painel aria-labelledby="rg-adicionar" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow={tx('ADICIONAR', 'ADD')} titulo={tx('Novo amigo', 'New friend')} id="rg-adicionar" />
            <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); if (alvo.trim()) pedir() }}>
              <input className="campo font-mono" value={alvo} onChange={(e) => setAlvo(e.target.value)} placeholder={tx('Nome#TAG ou utilizador', 'Name#TAG or username')} aria-label={tx('Riot ID ou utilizador do Discord', 'Riot ID or Discord username')} />
              <button type="submit" className="btn btn-primario" disabled={!alvo.trim()}><UserPlus size={16} aria-hidden />{tx('Enviar pedido', 'Send request')}</button>
            </form>
          </Painel>
          <Painel aria-labelledby="rg-pedidos" className="flex flex-col gap-3 p-[22px]">
            <TituloPainel eyebrow={tx('PEDIDOS', 'REQUESTS')} titulo={recebidos.length ? tx(`${recebidos.length} por responder`, `${recebidos.length} to answer`) : tx('Sem pedidos novos', 'No new requests')} id="rg-pedidos" />
            {recebidos.map((a) => (
              <div key={a.perfil.id} className="flex items-center gap-3 rounded-xl border border-laranja/25 bg-laranja/6 p-2.5">
                <Avatar nome={nomeJogador(a.perfil)} url={a.perfil.avatarUrl} tamanho={34} perfilId={a.perfil.id} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold">{a.perfil.riotId}</span>
                  <span className="text-[11.5px] text-mudo">{haQuanto(a.desde)}</span>
                </span>
                <button type="button" aria-label={`${tx('Aceitar', 'Accept')} ${nomeJogador(a.perfil)}`} onClick={() => fazer(() => dados.responderAmizade(a.perfil.id, true), tx('Pedido aceite.', 'Request accepted.'))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border-0 bg-laranja text-escuro-laranja hover:brightness-110"><Check size={17} aria-hidden /></button>
                <button type="button" aria-label={`${tx('Recusar', 'Decline')} ${nomeJogador(a.perfil)}`} onClick={() => fazer(() => dados.responderAmizade(a.perfil.id, false))} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-white/10 bg-transparent text-mudo hover:text-texto"><X size={17} aria-hidden /></button>
              </div>
            ))}
            {enviados.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-white/7 pt-3">
                <span className="rotulo">{tx('Enviados', 'Sent')}</span>
                {enviados.map((a) => (
                  <div key={a.perfil.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-suave">{a.perfil.riotId}</span>
                    <button type="button" onClick={() => fazer(() => dados.removerAmigo(a.perfil.id), tx('Pedido cancelado.', 'Request cancelled.'))} className="cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-laranja-claro hover:text-pessego">{tx('Cancelar', 'Cancel')}</button>
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
