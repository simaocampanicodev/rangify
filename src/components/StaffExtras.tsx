import { ChevronUp, CircleAlert, Lightbulb, Megaphone, PlugZap, Trash } from 'lucide-react'
import { useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type EstadoSugestao, type TesteApi } from '@/lib/dados'
import { l, locale } from '@/lib/idioma'
import { diaCurto, haQuanto } from '@/lib/tempo'
import { BotaoSegurar, Carregando, Chip, Vazio } from './ui'

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
    const nova = await acao(() => dados.criarNovidade({ data, titulo, texto }), l('Novidade publicada no Painel.', 'News published on the Dashboard.'))
    setAEnviar(false)
    if (nova) { lista.setValor(nova); setTitulo(''); setTexto(''); setData(hoje()) }
  }
  const apagar = async (id: string) => {
    if (!window.confirm(l('Apagar esta novidade?', 'Delete this news item?'))) return
    const r = await acao(() => dados.apagarNovidade(id), l('Novidade apagada.', 'News item deleted.'))
    if (r) lista.setValor(r)
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <form className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4" onSubmit={(e) => { e.preventDefault(); publicar() }}>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1.5 text-[12.5px] text-mudo">
              {l('Data (aparece no canto)', 'Date (shown in the corner)')}
              <input type="date" required className="campo !h-10 !w-[170px]" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[12.5px] text-mudo">
              {l('Título', 'Title')}
              <input className="campo !h-10" required minLength={3} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={l('A Temporada 2 arrancou', 'Season 2 has started')} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-[12.5px] text-mudo">
            {l('Descrição', 'Description')}
            <textarea className="campo min-h-[84px] py-2.5" required minLength={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={l('O que mudou, em uma ou duas frases.', 'What changed, in one or two sentences.')} />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-mudo">{texto.length}/500 · {l('a novidade mais recente é a que aparece no Painel.', 'the most recent item is the one shown on the Dashboard.')}</span>
            <button type="submit" className="btn btn-primario !min-h-10" disabled={aEnviar || titulo.trim().length < 3 || texto.trim().length < 3}>
              <Megaphone size={15} aria-hidden />{aEnviar ? l('A publicar…', 'Publishing…') : l('Publicar novidade', 'Publish news')}
            </button>
          </div>
        </form>
      ) : <p className="m-0 text-[13px] text-mudo">{l('Só Owner e Dev publicam novidades.', 'Only Owner and Dev publish news.')}</p>}

      {lista.carregando && !lista.valor ? <Carregando /> : lista.valor?.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {lista.valor.map((n, i) => (
            <li key={n.id} className="flex items-start gap-3 rounded-[14px] border border-white/7 bg-white/[0.02] p-4">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-mudo">{diaCurto(n.data)}</span>
                  {i === 0 && <Chip tom="laranja">{l('No Painel', 'On the Dashboard')}</Chip>}
                </span>
                <span className="text-[14.5px] font-bold">{n.titulo}</span>
                <span className="text-[13px] leading-normal whitespace-pre-line text-suave">{n.texto}</span>
              </span>
              {podeEditar && (
                <button type="button" aria-label={`${l('Apagar', 'Delete')} ${n.titulo}`} onClick={() => apagar(n.id)} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-white/8 bg-transparent text-mudo hover:bg-white/8 hover:text-texto">
                  <Trash size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <Vazio icone={<Megaphone size={22} />} titulo={l('Sem novidades', 'No news')} texto={l('A primeira que publicares aparece no Painel.', 'The first one you publish shows up on the Dashboard.')} />}
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
          {l('Vai buscar à Henrik Dev API o último jogo personalizado da tua conta e mostra o que o Rangify tiraria dele numa partida real. Não grava nada.', 'Fetches your account\'s latest custom game from the Henrik Dev API and shows what Rangify would pull from it in a real match. Nothing is saved.')}
        </p>
        <button type="button" className="btn btn-primario" disabled={aTestar} onClick={testar}>
          <PlugZap size={15} aria-hidden />{aTestar ? l('A perguntar à API…', 'Asking the API…') : l('Testar API', 'Test API')}
        </button>
      </div>

      {teste && !teste.encontrado && <Vazio icone={<CircleAlert size={22} />} titulo={l('Nenhum jogo personalizado', 'No custom game')} texto={teste.avisos[0] ?? l('A API não devolveu nada.', 'The API returned nothing.')} />}

      {teste?.encontrado && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip tom="laranja">{teste.riotId}</Chip>
            <Chip>{teste.mapa}</Chip>
            <Chip>{l('Vermelha', 'Red')} {teste.resultado} {l('Azul', 'Blue')}</Chip>
            <Chip>{teste.rondas} {l('rondas', 'rounds')} · {teste.mortes} {l('kills lidas', 'kills read')}</Chip>
            {teste.modo && <Chip>{teste.modo}</Chip>}
            {teste.inicio && <Chip>{new Date(teste.inicio).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}</Chip>}
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
                  <th scope="col" className="py-2 pl-3 font-normal">{l('Jogador', 'Player')}</th>
                  <th scope="col" className="px-2 font-normal">{l('Equipa', 'Team')}</th>
                  {['K', 'D', 'A', 'ACS', 'FB', 'Trades', 'HS%', 'KAST'].map((c) => <th key={c} scope="col" className="px-2 text-right font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {teste.jogadores.map((j) => (
                  <tr key={j.riotId} className={j.riotId === teste.riotId ? 'bg-laranja/[0.06]' : ''}>
                    <td className="py-2 pl-3 font-semibold">{j.riotId}</td>
                    <td className={`px-2 font-mono text-[12px] ${j.equipa === 'red' ? 'text-pessego' : 'text-suave'}`}>{j.equipa === 'red' ? l('Vermelha', 'Red') : l('Azul', 'Blue')}</td>
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

const ESTADOS_SUGESTAO: EstadoSugestao[] = ['recebida', 'analise', 'planeada', 'feita']
const nomeEstado = (e: EstadoSugestao) => ({
  recebida: l('Recebida', 'Received'), analise: l('Em análise', 'Under review'), planeada: l('Planeada', 'Planned'), feita: l('Feita', 'Done'),
})[e]

/** Owner, Dev e Mod: mudar o estado das sugestões e apagar as que não fazem sentido. */
export function SugestoesStaff() {
  const acao = useAcao()
  const avisar = useAvisos()
  const lista = useCarregar(() => dados.sugestoes('recentes'), [], ['sugestoes', 'staff'])
  const [filtro, setFiltro] = useState<EstadoSugestao | 'todas'>('todas')
  const visiveis = (lista.valor ?? []).filter((s) => filtro === 'todas' || s.estado === filtro)

  const mudarEstado = (id: string, estado: EstadoSugestao) =>
    acao(() => dados.definirEstadoSugestao(id, estado), l(`Estado mudado para "${nomeEstado(estado)}".`, `Status changed to "${nomeEstado(estado)}".`))
  const apagar = (id: string) => acao(() => dados.apagarSugestao(id), l('Sugestão apagada.', 'Suggestion deleted.'))
  const dica = () => avisar(l('Mantém o botão premido até encher para apagar.', 'Hold the button until it fills to delete.'))

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-mudo">
        {l('O estado aparece a toda a gente na página das Sugestões. Para apagar, mantém o botão do lixo premido até encher; os votos saem com a sugestão.', 'The status shows to everyone on the Suggestions page. To delete, hold the bin button until it fills; the votes go with the suggestion.')}
      </p>
      <div role="group" aria-label={l('Filtrar por estado', 'Filter by status')} className="flex flex-wrap gap-1.5">
        {(['todas', ...ESTADOS_SUGESTAO] as const).map((e) => (
          <button key={e} type="button" aria-pressed={filtro === e} onClick={() => setFiltro(e)} className={`h-8 cursor-pointer rounded-lg border px-3 text-[12.5px] font-semibold ${filtro === e ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}>
            {e === 'todas' ? l('Todas', 'All') : nomeEstado(e)}
          </button>
        ))}
      </div>
      {lista.carregando && !lista.valor ? <Carregando /> : visiveis.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visiveis.map((s) => (
            <li key={s.id} className="flex flex-wrap items-start gap-3 rounded-[14px] border border-white/7 bg-white/[0.02] p-4">
              <span className="flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-xl border border-white/8 py-1.5 text-suave">
                <ChevronUp size={15} aria-hidden /><span className="font-mono text-[13px] font-semibold">{s.votos}</span>
              </span>
              <span className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="text-[14.5px] font-bold">{s.titulo}</span>
                <span className="text-[13px] leading-normal text-suave">{s.descricao}</span>
                <span className="text-[12px] text-mudo">{s.categoria} · {l('por', 'by')} {s.autor} · {haQuanto(s.criadaEm)}</span>
              </span>
              <span className="flex items-center gap-2">
                <label className="so-leitores" htmlFor={`est-${s.id}`}>{l('Estado de', 'Status of')} {s.titulo}</label>
                <select id={`est-${s.id}`} className="campo !h-10 !w-auto !text-[13px]" value={s.estado} onChange={(e) => mudarEstado(s.id, e.target.value as EstadoSugestao)}>
                  {ESTADOS_SUGESTAO.map((e) => <option key={e} value={e}>{nomeEstado(e)}</option>)}
                </select>
                <BotaoSegurar
                  rotulo={l(`Segura para apagar "${s.titulo}"`, `Hold to delete "${s.titulo}"`)}
                  onConfirmar={() => apagar(s.id)}
                  aoLargarCedo={dica}
                  className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-white/8 bg-transparent text-mudo hover:border-derrota/40 hover:text-derrota"
                >
                  <Trash size={15} aria-hidden />
                </BotaoSegurar>
              </span>
            </li>
          ))}
        </ul>
      ) : <Vazio icone={<Lightbulb size={22} />} titulo={l('Sem sugestões', 'No suggestions')} texto={l('Quando a comunidade propuser ideias, aparecem aqui.', 'When the community suggests ideas, they show up here.')} />}
    </div>
  )
}
