import { ChevronUp, Lightbulb, Plus } from 'lucide-react'
import { useState } from 'react'
import { Cabecalho, Carregando, Chip, Modal, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type EstadoSugestao } from '@/lib/dados'
import { haQuanto } from '@/lib/tempo'
import { l } from '@/lib/idioma'

/** As categorias guardam-se em português; só o texto mostrado muda com a língua. */
const CATEGORIAS = ['Fila', 'Partida', 'Ranking', 'Perfil', 'Amigos', 'Discord', 'Eventos', 'Regras', 'Outro']
const CATEGORIAS_EN: Record<string, string> = { Fila: 'Queue', Partida: 'Match', Ranking: 'Leaderboard', Perfil: 'Profile', Amigos: 'Friends', Discord: 'Discord', Eventos: 'Events', Regras: 'Rules', Outro: 'Other' }
const nomeCategoria = (c: string) => l(c === 'Ranking' ? 'Tabela' : c, CATEGORIAS_EN[c] ?? c)
const estados = (): Record<EstadoSugestao, { nome: string; tom: 'neutro' | 'laranja' | 'vitoria' }> => ({
  recebida: { nome: l('Recebida', 'Received'), tom: 'neutro' },
  analise: { nome: l('Em análise', 'Under review'), tom: 'laranja' },
  planeada: { nome: l('Planeada', 'Planned'), tom: 'laranja' },
  feita: { nome: l('Feita', 'Done'), tom: 'vitoria' },
})

function NovaSugestao() {
  const acao = useAcao()
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [descricao, setDescricao] = useState('')
  const enviar = async () => {
    const ok = await acao(async () => { await dados.criarSugestao({ titulo, categoria, descricao }); return true }, l('Sugestão publicada. Obrigado!', 'Suggestion published. Thank you!'))
    if (ok) { setAberto(false); setTitulo(''); setDescricao('') }
  }
  return (
    <>
      <button type="button" className="btn btn-primario" onClick={() => setAberto(true)}><Plus size={16} aria-hidden />{l('Nova sugestão', 'New suggestion')}</button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={l('Propor uma ideia', 'Suggest an idea')} eyebrow={l('SUGESTÃO', 'SUGGESTION')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); enviar() }}>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Título', 'Title')}
            <input className="campo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder={l('Em poucas palavras', 'In a few words')} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Categoria', 'Category')}
            <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value)}>{CATEGORIAS.map((c) => <option key={c} value={c}>{nomeCategoria(c)}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Descrição', 'Description')}
            <textarea className="campo !h-32 py-3" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} placeholder={l('Que problema resolve e como imaginas que funcione.', 'What problem it solves and how you imagine it working.')} />
            <span className="text-right font-mono text-[11px] font-normal text-mudo">{descricao.length}/500</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-fantasma" onClick={() => setAberto(false)}>{l('Cancelar', 'Cancel')}</button>
            <button type="submit" className="btn btn-primario" disabled={titulo.trim().length < 6 || descricao.trim().length < 10}>{l('Publicar', 'Publish')}</button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export function Sugestoes() {
  const acao = useAcao()
  const [ordem, setOrdem] = useState<'votos' | 'recentes'>('votos')
  const [estado, setEstado] = useState<EstadoSugestao | 'todas'>('todas')
  const lista = useCarregar(() => dados.sugestoes(ordem), [ordem], ['sugestoes'])
  const filtradas = (lista.valor ?? []).filter((s) => estado === 'todas' || s.estado === estado)

  return (
    <>
      <Cabecalho
        migalhas={[l('Comunidade', 'Community'), l('Sugestões', 'Suggestions')]}
        titulo={l('Sugestões', 'Suggestions')}
        descricao={l('O que falta no hub? Propõe ideias e vota nas que queres ver primeiro. A equipa atualiza o estado de cada uma.', 'What is the hub missing? Suggest ideas and vote for the ones you want first. The team updates the status of each one.')}
        acoes={<NovaSugestao />}
      />
      <Painel aria-labelledby="rg-sug" className="flex flex-col gap-3 p-[22px]">
        <TituloPainel
          eyebrow={`${filtradas.length} ${l('SUGESTÕES', 'SUGGESTIONS')}`}
          titulo={l('Ideias da comunidade', 'Community ideas')}
          id="rg-sug"
          direita={<Segmentado rotulo={l('Ordenar', 'Sort')} valor={ordem} onChange={setOrdem} opcoes={[{ valor: 'votos', texto: l('Mais votadas', 'Most voted') }, { valor: 'recentes', texto: l('Recentes', 'Recent') }]} />}
        />
        <div role="group" aria-label={l('Filtrar por estado', 'Filter by status')} className="flex flex-wrap gap-1.5">
          {(['todas', 'recebida', 'analise', 'planeada', 'feita'] as const).map((e) => (
            <button key={e} type="button" aria-pressed={estado === e} onClick={() => setEstado(e)} className={`h-8 cursor-pointer rounded-lg border px-3 text-[12.5px] font-semibold ${estado === e ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}>
              {e === 'todas' ? l('Todas', 'All') : estados()[e].nome}
            </button>
          ))}
        </div>
        {lista.carregando && !lista.valor ? <Carregando /> : filtradas.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {filtradas.map((s) => (
              <li key={s.id} className="flex items-start gap-4 border-t border-white/6 py-4">
                <button
                  type="button"
                  aria-pressed={s.votei}
                  aria-label={`${s.votei ? l('Retirar voto de', 'Remove vote from') : l('Votar em', 'Vote for')} ${s.titulo}, ${s.votos} ${l('votos', 'votes')}`}
                  onClick={() => acao(() => dados.votar(s.id))}
                  className={`flex w-14 shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors ${s.votei ? 'border-laranja/50 bg-laranja/15 text-pessego-claro' : 'border-white/10 bg-white/[0.03] text-suave hover:border-laranja/40'}`}
                >
                  <ChevronUp size={18} className={s.votei ? 'text-laranja' : ''} aria-hidden />
                  <span className="font-mono text-[14px] font-semibold">{s.votos}</span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-[15px] font-bold">{s.titulo}</h3>
                    <Chip tom={estados()[s.estado].tom}>{estados()[s.estado].nome}</Chip>
                  </div>
                  <p className="m-0 text-[13.5px] leading-normal text-suave">{s.descricao}</p>
                  <span className="text-[12px] text-mudo">{nomeCategoria(s.categoria)} · {l('por', 'by')} {s.autor} · {haQuanto(s.criadaEm)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : <Vazio icone={<Lightbulb size={22} />} titulo={l('Nada por aqui', 'Nothing here')} texto={l('Sê o primeiro a propor uma ideia.', 'Be the first to suggest an idea.')} />}
      </Painel>
    </>
  )
}
