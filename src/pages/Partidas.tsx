import { Flag, Swords, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LinhaPartida } from '@/components/LinhaPartida'
import { DetalhePartida } from '@/components/match/DetalhePartida'
import { BotaoRecarregar } from '@/components/StaffExtras'
import { Cabecalho, Carregando, Chip, LinhasEsqueleto, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { avisarMudanca, dados, type FilaTipo, type ResumoPartida } from '@/lib/data'
import { MAPAS } from '@/lib/mapas'
import { l as tx } from '@/lib/idioma'

/** Partidas por página: as mais recentes primeiro, e "Ver mais" traz as seguintes. */
const POR_PAGINA = 10

/** Só existe (e só pede a tabela da partida) enquanto a partida estiver aberta. */
function Detalhe({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { perfil, podeTestar } = useSessao()
  const acao = useAcao()
  const [aRemover, setARemover] = useState(false)
  const p = useCarregar(() => (id ? dados.partida(id) : Promise.resolve(null)), [id], [], { chave: `partida:${id}` })
  const partida = p.valor

  // Owner e Dev podem tirar uma partida do histórico; os pontos e as estatísticas dela voltam atrás.
  const remover = async () => {
    if (!partida) return
    const aviso = partida.estado === 'COMPLETED'
      ? tx('Remover esta partida do histórico? Os pontos, as vitórias, as derrotas e as estatísticas que ela deu saem dos perfis dos 10 jogadores.', 'Remove this match from the history? The points, wins, losses and stats it gave are removed from the profiles of all 10 players.')
      : tx('Remover esta partida do histórico?', 'Remove this match from the history?')
    if (!window.confirm(aviso)) return
    setARemover(true)
    const ok = await acao(async () => { await dados.removerPartida(partida.id); return true }, tx('Partida removida do histórico.', 'Match removed from the history.'))
    setARemover(false)
    if (ok) {
      avisarMudanca('partida')
      onFechar()
    }
  }

  return (
    <Modal aberto={!!id} onFechar={onFechar} titulo={partida ? `${partida.mapa} · ${partida.resultadoA}-${partida.resultadoB}` : tx('Partida', 'Match')} eyebrow={partida ? `${tx('PARTIDA', 'MATCH')} ${partida.codigo}` : undefined} largura={980}>
      {!partida ? <Carregando /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {!partida.estatisticas && <Chip>{tx('Sem estatísticas da API', 'No API stats')}</Chip>}
            {podeTestar && partida.estado === 'COMPLETED' && (
              <span className="ml-auto"><BotaoRecarregar id={partida.id} simulada={partida.simulada} pequeno aoAcabar={() => p.recarregar()} /></span>
            )}
            {podeTestar && (
              <button type="button" disabled={aRemover} onClick={remover} className={`btn btn-fantasma !min-h-8 !px-3 !text-[12.5px] ${partida.estado === 'COMPLETED' ? '' : 'ml-auto'}`}>
                <Trash size={14} className="text-laranja" aria-hidden />{tx('Remover partida', 'Remove match')}
              </button>
            )}
          </div>
          <DetalhePartida p={partida} eu={perfil?.id ?? ''} />
        </div>
      )}
    </Modal>
  )
}

export function Partidas() {
  const acao = useAcao()
  const [params, setParams] = useSearchParams()
  const [ambito, setAmbito] = useState<'minhas' | 'todas'>('minhas')
  const [fila, setFila] = useState<'todas' | FilaTipo>('todas')
  const [mapa, setMapa] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<ResumoPartida[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [mais, setMais] = useState(false)
  const aberta = params.get('p')

  const pagina = useCarregar(() => dados.partidas({ minhas: ambito === 'minhas', mapa, limite: POR_PAGINA, fila: fila === 'todas' ? null : fila }), [ambito, mapa, fila], ['partida'], { minimo: 450, chave: `partidas:${ambito}:${mapa ?? ''}:${fila}` })
  useEffect(() => {
    if (pagina.valor) { setLinhas(pagina.valor.linhas); setCursor(pagina.valor.cursor) }
  }, [pagina.valor])

  const carregarMais = async () => {
    setMais(true)
    const r = await acao(() => dados.partidas({ minhas: ambito === 'minhas', mapa, cursor, limite: POR_PAGINA, fila: fila === 'todas' ? null : fila }))
    if (r) { setLinhas((l) => [...l, ...r.linhas]); setCursor(r.cursor) }
    setMais(false)
  }

  const minhas = ambito === 'minhas' ? linhas.filter((l) => l.minha) : []
  const vit = minhas.filter((l) => l.minha!.venceu).length
  const saldo = minhas.reduce((s, l) => s + (l.minha!.deltaPontos ?? 0), 0)

  return (
    <>
      <Cabecalho
        migalhas={['Hub', tx('Partidas', 'Matches')]}
        titulo={tx('Partidas', 'Matches')}
        descricao={tx('O teu histórico e todos os jogos do hub. Abre uma partida para ver o KDA, o ACS, os first bloods e os pontos de cada jogador.', 'Your history and every hub game. Open a match to see each player\'s KDA, ACS, first bloods and points.')}
      />
      <Painel aria-labelledby="rg-partidas" className="flex flex-col px-[22px] pt-[22px] pb-3">
        <div className="flex flex-col gap-3 pb-3">
          <TituloPainel
            eyebrow={ambito === 'minhas' && minhas.length ? tx(`${vit}V · ${minhas.length - vit}D NESTA LISTA · ${saldo >= 0 ? '+' : ''}${saldo} PTS`, `${vit}W · ${minhas.length - vit}L IN THIS LIST · ${saldo >= 0 ? '+' : ''}${saldo} PTS`) : tx('HISTÓRICO', 'HISTORY')}
            titulo={ambito === 'minhas' ? tx('As tuas partidas', 'Your matches') : tx('Todas as partidas do hub', 'All hub matches')}
            id="rg-partidas"
            direita={(
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <Segmentado rotulo={tx('Fila', 'Queue')} valor={fila} onChange={setFila} opcoes={[{ valor: 'todas', texto: tx('Todas as filas', 'All queues') }, { valor: 'aberta', texto: tx('Aberta', 'Open') }, { valor: 'ranked', texto: 'Ranked' }]} />
                <Segmentado rotulo={tx('Que partidas', 'Which matches')} valor={ambito} onChange={setAmbito} opcoes={[{ valor: 'minhas', texto: tx('As minhas', 'Mine') }, { valor: 'todas', texto: tx('Todas', 'All') }]} />
              </div>
            )}
          />
          <div role="group" aria-label={tx('Filtrar por mapa', 'Filter by map')} className="flex flex-wrap gap-1.5">
            {[null, ...MAPAS.map((m) => m.nome)].map((m) => (
              <button
                key={m ?? 'todos'}
                type="button"
                aria-pressed={mapa === m}
                onClick={() => setMapa(m)}
                className={`h-8 cursor-pointer rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${mapa === m ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}
              >
                {m ?? tx('Todos os mapas', 'All maps')}
              </button>
            ))}
          </div>
        </div>
        {pagina.carregando ? <LinhasEsqueleto tipo="partidas" n={6} /> : linhas.length ? (
          linhas.map((m, i) => <LinhaPartida key={m.id} m={m} i={i} onClick={() => setParams({ p: m.id })} />)
        ) : (
          <Vazio
            icone={ambito === 'minhas' ? <Swords size={22} /> : <Flag size={22} />}
            titulo={mapa || fila !== 'todas' ? tx(`Sem partidas${fila !== 'todas' ? ` na fila ${fila === 'ranked' ? 'ranked' : 'aberta'}` : ''}${mapa ? ` em ${mapa}` : ''}`, `No${fila !== 'todas' ? ` ${fila === 'ranked' ? 'ranked' : 'open'}` : ''} matches${mapa ? ` on ${mapa}` : ''}`) : tx('Ainda sem partidas', 'No matches yet')}
            texto={ambito === 'minhas' ? tx('Entra na fila: cada partida confirmada aparece aqui.', 'Join the queue: every confirmed match shows up here.') : tx('Quando o hub tiver partidas terminadas, aparecem aqui.', 'When the hub has finished matches, they show up here.')}
          />
        )}
        {cursor && <button type="button" className="btn btn-fantasma mt-2 self-center" disabled={mais} onClick={carregarMais}>{mais ? tx('A carregar…', 'Loading…') : tx('Ver mais', 'Show more')}</button>}
      </Painel>
      {aberta && <Detalhe id={aberta} onFechar={() => setParams({})} />}
    </>
  )
}
