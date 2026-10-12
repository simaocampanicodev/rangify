import { Clock, Flag, Swords } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LinhaPartida } from '@/components/LinhaPartida'
import { TabelaPartida } from '@/components/partida/Resultado'
import { Cabecalho, Carregando, Chip, LinhasEsqueleto, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type ResumoPartida } from '@/lib/dados'
import { MAPAS } from '@/lib/mapas'
import { dataHora } from '@/lib/tempo'

function Detalhe({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const { perfil } = useSessao()
  const p = useCarregar(() => (id ? dados.partida(id) : Promise.resolve(null)), [id])
  const partida = p.valor
  return (
    <Modal aberto={!!id} onFechar={onFechar} titulo={partida ? `${partida.mapa} · ${partida.resultadoA}-${partida.resultadoB}` : 'Partida'} eyebrow={partida ? `PARTIDA ${partida.codigo}` : undefined} largura={760}>
      {!partida ? <Carregando /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {partida.terminouEm && <Chip><Clock size={12} aria-hidden />{dataHora(partida.terminouEm)}</Chip>}
            {partida.simulada && <Chip tom="laranja">Simulada, não conta</Chip>}
            {!partida.estatisticas && <Chip>Sem estatísticas da API</Chip>}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Bans de mapas">
            {partida.bans.map((b) => (
              <span key={b.ordem} className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2 font-mono text-[11px] text-suave">
                <span className={b.equipa === 'A' ? 'text-laranja' : 'text-marfim'}>{b.equipa}</span>{b.mapa}
              </span>
            ))}
            {partida.mapa && <span className="inline-flex h-7 items-center rounded-lg border border-laranja/40 bg-laranja/12 px-2 font-mono text-[11px] font-bold text-pessego">DECISIVO {partida.mapa.toUpperCase()}</span>}
          </div>
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
