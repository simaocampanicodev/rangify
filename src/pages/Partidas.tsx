import { Clock, Flag, Swords, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LinhaPartida } from '@/components/LinhaPartida'
import { TabelaPartida } from '@/components/partida/Resultado'
import { Cabecalho, Carregando, Chip, LinhasEsqueleto, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { avisarMudanca, dados, type ResumoPartida } from '@/lib/dados'
import { MAPAS } from '@/lib/mapas'
import { dataHora } from '@/lib/tempo'

function Detalhe({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { perfil, podeTestar } = useSessao()
  const acao = useAcao()
  const [aRemover, setARemover] = useState(false)
  const p = useCarregar(() => (id ? dados.partida(id) : Promise.resolve(null)), [id])
  const partida = p.valor

  // Owner e Dev podem tirar uma partida do histórico; numa partida real, os pontos dela voltam atrás.
  const remover = async () => {
    if (!partida) return
    const aviso = partida.simulada
      ? 'Remover esta partida simulada do histórico?'
      : 'Remover esta partida do histórico? Os pontos, as vitórias e as derrotas que ela deu são devolvidos aos 10 jogadores.'
    if (!window.confirm(aviso)) return
    setARemover(true)
    const ok = await acao(async () => { await dados.removerPartida(partida.id); return true }, 'Partida removida do histórico.')
    setARemover(false)
    if (ok) {
      avisarMudanca('partida')
      onFechar()
    }
  }

  return (
    <Modal aberto={!!id} onFechar={onFechar} titulo={partida ? `${partida.mapa} · ${partida.resultadoA}-${partida.resultadoB}` : 'Partida'} eyebrow={partida ? `PARTIDA ${partida.codigo}` : undefined} largura={980}>
      {!partida ? <Carregando /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {partida.terminouEm && <Chip><Clock size={12} aria-hidden />{dataHora(partida.terminouEm)}</Chip>}
            {partida.simulada && <Chip tom="laranja">Simulada, não conta</Chip>}
            {!partida.estatisticas && <Chip>Sem estatísticas da API</Chip>}
            {podeTestar && (
              <button type="button" disabled={aRemover} onClick={remover} className="btn btn-fantasma ml-auto !min-h-8 !px-3 !text-[12.5px]">
                <Trash size={14} className="text-laranja" aria-hidden />Remover partida
              </button>
            )}
          </div>
          {/* Os bans numa linha só: a cor diz que equipa baniu cada mapa. */}
          {partida.bans.length > 0 && (
            <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[12px] leading-relaxed" aria-label="Bans de mapas">
              <span className="rotulo mr-1">Bans</span>
              {partida.bans.map((b, i) => (
                <span key={b.ordem} className={b.equipa === 'A' ? 'text-laranja-claro' : 'text-marfim'} title={`Banido pela Equipa ${b.equipa}`}>
                  {b.mapa}{i < partida.bans.length - 1 && <span className="text-white/20"> ·</span>}
                </span>
              ))}
              {partida.mapa && <span className="ml-1 font-bold text-pessego">→ {partida.mapa}</span>}
              <span className="ml-auto flex gap-3 text-[11px] text-mudo">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-laranja-claro" />Equipa A</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-marfim" />Equipa B</span>
              </span>
            </p>
          )}
          <TabelaPartida p={partida} eu={perfil?.id ?? ''} />
        </div>
      )}
    </Modal>
  )
}

export function Partidas() {
  const acao = useAcao()
  const [params, setParams] = useSearchParams()
  const [ambito, setAmbito] = useState<'minhas' | 'todas'>('minhas')
  const [mapa, setMapa] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<ResumoPartida[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [mais, setMais] = useState(false)
  const aberta = params.get('p')

  const pagina = useCarregar(() => dados.partidas({ minhas: ambito === 'minhas', mapa }), [ambito, mapa], ['partida'], { minimo: 450 })
  useEffect(() => {
    if (pagina.valor) { setLinhas(pagina.valor.linhas); setCursor(pagina.valor.cursor) }
  }, [pagina.valor])

  const carregarMais = async () => {
    setMais(true)
    const r = await acao(() => dados.partidas({ minhas: ambito === 'minhas', mapa, cursor }))
    if (r) { setLinhas((l) => [...l, ...r.linhas]); setCursor(r.cursor) }
    setMais(false)
  }

  const minhas = ambito === 'minhas' ? linhas.filter((l) => l.minha && !l.simulada) : []
  const vit = minhas.filter((l) => l.minha!.venceu).length
  const saldo = minhas.reduce((s, l) => s + (l.minha!.deltaPontos ?? 0), 0)

  return (
    <>
      <Cabecalho
        migalhas={['Hub', 'Partidas']}
        titulo="Partidas"
        descricao="O teu histórico e todos os jogos do hub. Abre uma partida para ver o KDA, o ACS, os first bloods e os pontos de cada jogador."
      />
      <Painel aria-labelledby="rg-partidas" className="flex flex-col px-[22px] pt-[22px] pb-3">
        <div className="flex flex-col gap-3 pb-3">
          <TituloPainel
            eyebrow={ambito === 'minhas' && minhas.length ? `${vit}V · ${minhas.length - vit}D NESTA LISTA · ${saldo >= 0 ? '+' : ''}${saldo} PTS` : 'HISTÓRICO'}
            titulo={ambito === 'minhas' ? 'As tuas partidas' : 'Todas as partidas do hub'}
            id="rg-partidas"
            direita={<Segmentado rotulo="Que partidas" valor={ambito} onChange={setAmbito} opcoes={[{ valor: 'minhas', texto: 'As minhas' }, { valor: 'todas', texto: 'Todas' }]} />}
          />
          <div role="group" aria-label="Filtrar por mapa" className="flex flex-wrap gap-1.5">
            {[null, ...MAPAS.map((m) => m.nome)].map((m) => (
              <button
                key={m ?? 'todos'}
                type="button"
                aria-pressed={mapa === m}
                onClick={() => setMapa(m)}
                className={`h-8 cursor-pointer rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${mapa === m ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}
              >
                {m ?? 'Todos os mapas'}
              </button>
            ))}
          </div>
        </div>
        {pagina.carregando ? <LinhasEsqueleto tipo="partidas" n={6} /> : linhas.length ? (
          linhas.map((m, i) => <LinhaPartida key={m.id} m={m} i={i} onClick={() => setParams({ p: m.id })} />)
        ) : (
          <Vazio
            icone={ambito === 'minhas' ? <Swords size={22} /> : <Flag size={22} />}
            titulo={mapa ? `Sem partidas em ${mapa}` : 'Ainda sem partidas'}
            texto={ambito === 'minhas' ? 'Entra na fila: cada partida confirmada aparece aqui.' : 'Quando o hub tiver partidas terminadas, aparecem aqui.'}
          />
        )}
        {cursor && <button type="button" className="btn btn-fantasma mt-2 self-center" disabled={mais} onClick={carregarMais}>{mais ? 'A carregar…' : 'Carregar mais'}</button>}
      </Painel>
      <Detalhe id={aberta} onFechar={() => setParams({})} />
    </>
  )
}
