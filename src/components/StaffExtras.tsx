import { CircleAlert, Megaphone, PlugZap, Trash } from 'lucide-react'
import { useState } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type TesteApi } from '@/lib/dados'
import { diaCurto } from '@/lib/tempo'
import { Carregando, Chip, Vazio } from './ui'

const hoje = () => new Date().toISOString().slice(0, 10)

/** Publicar e apagar as novidades que aparecem no Dashboard (a mais recente fica lá). */
export function NovidadesStaff({ podeEditar }: { podeEditar: boolean }) {
  const acao = useAcao()
  const lista = useCarregar(() => dados.novidades(50), [], ['staff'])
  const [data, setData] = useState(hoje)
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [aEnviar, setAEnviar] = useState(false)

  const publicar = async () => {
    setAEnviar(true)
    const nova = await acao(() => dados.criarNovidade({ data, titulo, texto }), 'Novidade publicada no Dashboard.')
    setAEnviar(false)
    if (nova) { lista.setValor(nova); setTitulo(''); setTexto(''); setData(hoje()) }
  }
  const apagar = async (id: string) => {
    if (!window.confirm('Apagar esta novidade?')) return
    const r = await acao(() => dados.apagarNovidade(id), 'Novidade apagada.')
    if (r) lista.setValor(r)
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <form className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4" onSubmit={(e) => { e.preventDefault(); publicar() }}>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-[12.5px] text-mudo">
              Data (aparece no canto)
              <input type="date" required className="campo !h-10 !w-[170px]" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[12.5px] text-mudo">
              Título
              <input className="campo !h-10" required minLength={3} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="A Temporada 2 arrancou" />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-mudo">
            Descrição
            <textarea className="campo min-h-[84px] py-2.5" required minLength={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que mudou, em uma ou duas frases." />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-mudo">{texto.length}/500 · a novidade mais recente é a que aparece no Dashboard.</span>
            <button type="submit" className="btn btn-primario !min-h-10" disabled={aEnviar || titulo.trim().length < 3 || texto.trim().length < 3}>
              <Megaphone size={15} aria-hidden />{aEnviar ? 'A publicar…' : 'Publicar novidade'}
            </button>
          </div>
        </form>
      ) : <p className="m-0 text-[13px] text-mudo">Só Owner e Dev publicam novidades.</p>}

      {lista.carregando && !lista.valor ? <Carregando /> : lista.valor?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lista.valor.map((n, i) => (
            <li key={n.id} className="flex items-start gap-3 rounded-[14px] border border-white/7 bg-white/[0.02] p-4">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-mudo">{diaCurto(n.data)}</span>
                  {i === 0 && <Chip tom="laranja">No Dashboard</Chip>}
                </span>
                <span className="text-[14.5px] font-bold">{n.titulo}</span>
                <span className="text-[13px] leading-normal whitespace-pre-line text-suave">{n.texto}</span>
              </span>
              {podeEditar && (
                <button type="button" aria-label={`Apagar ${n.titulo}`} onClick={() => apagar(n.id)} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-white/8 bg-transparent text-mudo hover:bg-white/8 hover:text-texto">
                  <Trash size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <Vazio icone={<Megaphone size={22} />} titulo="Sem novidades" texto="A primeira que publicares aparece no Dashboard." />}
    </div>
  )
}

const pct = (n: number | null) => (n == null ? '-' : `${n}%`)

/** Lê o último jogo personalizado da conta de quem testa, para ver se a API traz tudo. */
export function TesteApiStaff() {
  const acao = useAcao()
  const [teste, setTeste] = useState<TesteApi | null>(null)
  const [aTestar, setATestar] = useState(false)

  const testar = async () => {
    setATestar(true)
    const r = await acao(() => dados.testarApi())
    setATestar(false)
    if (r) setTeste(r)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[560px] text-[13px] leading-normal text-mudo">
          Vai buscar à Henrik Dev API o último jogo personalizado da tua conta e mostra o que o Rangify tiraria dele numa partida real. Não grava nada.
        </p>
        <button type="button" className="btn btn-primario" disabled={aTestar} onClick={testar}>
          <PlugZap size={15} aria-hidden />{aTestar ? 'A perguntar à API…' : 'Testar API'}
        </button>
      </div>

      {teste && !teste.encontrado && <Vazio icone={<CircleAlert size={22} />} titulo="Nenhum jogo personalizado" texto={teste.avisos[0] ?? 'A API não devolveu nada.'} />}

      {teste?.encontrado && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip tom="laranja">{teste.riotId}</Chip>
            <Chip>{teste.mapa}</Chip>
            <Chip>Vermelha {teste.resultado} Azul</Chip>
            <Chip>{teste.rondas} rondas · {teste.mortes} kills lidas</Chip>
            {teste.modo && <Chip>{teste.modo}</Chip>}
            {teste.inicio && <Chip>{new Date(teste.inicio).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</Chip>}
          </div>
          {teste.avisos.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {teste.avisos.map((a) => <li key={a} className="flex items-center gap-2 text-[13px] text-pessego"><CircleAlert size={14} aria-hidden />{a}</li>)}
            </ul>
          )}
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="rotulo text-left">
                  <th scope="col" className="py-2 pl-3 font-normal">Jogador</th>
                  <th scope="col" className="px-2 font-normal">Equipa</th>
                  {['K', 'D', 'A', 'ACS', 'FB', 'Trades', 'HS%', 'KAST'].map((c) => <th key={c} scope="col" className="px-2 text-right font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {teste.jogadores.map((j) => (
                  <tr key={j.riotId} className={j.riotId === teste.riotId ? 'bg-laranja/[0.06]' : ''}>
                    <td className="py-2 pl-3 font-semibold">{j.riotId}</td>
                    <td className={`px-2 font-mono text-[12px] ${j.equipa === 'red' ? 'text-pessego' : 'text-suave'}`}>{j.equipa === 'red' ? 'Vermelha' : 'Azul'}</td>
                    {[j.kills, j.deaths, j.assists, j.acs, j.firstBloods, j.trades, pct(j.hsPct), pct(j.kastPct)].map((v, i) => (
                      <td key={i} className="px-2 text-right font-mono">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
