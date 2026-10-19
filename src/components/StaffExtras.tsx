import { ChevronUp, CircleAlert, Lightbulb, Lock, Megaphone, PlugZap, RefreshCw, ShoppingBag, Trash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRef, useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useCarregar } from '@/hooks/useCarregar'
import { dados, type EstadoSugestao, type PaginaPartidas, type RecargaPartida, type ResumoPartida, type TesteApi } from '@/lib/dados'
import { l, locale } from '@/lib/idioma'
import { diaCurto, haQuanto } from '@/lib/tempo'
import { comSinal, rangifyScores } from '@/lib/pontos'
import { AnunciosDiscord } from './AnunciosDiscord'
import { BotaoSegurar, Carregando, Chip, IconeAgente, Segmentado, Vazio } from './ui'

const hoje = () => new Date().toISOString().slice(0, 10)

/** Publicar e apagar as novidades que aparecem no Dashboard (a mais recente fica lá). */
export function NovidadesStaff({ podeEditar }: { podeEditar: boolean }) {
  const acao = useAcao()
  const lista = useCarregar(() => dados.novidades(50), [], ['staff'], { chave: 'novidades:50' })
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
  // O Rangify Score que cada um teria, com a mesma conta da base de dados.
  const rs = teste ? rangifyScores(teste.jogadores, teste.rondas ?? 1) : []
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
                  <th scope="col" className="px-2 font-normal">{l('Agente', 'Agent')}</th>
                  {['K', 'D', 'A', 'ACS', 'FB', 'Trades', 'HS%', 'KAST', 'RS'].map((c) => <th key={c} scope="col" className="px-2 text-right font-normal">{c}</th>)}
                </tr>
              </thead>
              <tbody className="[&>tr]:border-t [&>tr]:border-white/6">
                {teste.jogadores.map((j, n) => (
                  <tr key={j.riotId} className={j.riotId === teste.riotId ? 'bg-laranja/[0.06]' : ''}>
                    <td className="py-2 pl-3 font-semibold">{j.riotId}</td>
                    <td className={`px-2 font-mono text-[12px] ${j.equipa === 'red' ? 'text-pessego' : 'text-suave'}`}>{j.equipa === 'red' ? l('Vermelha', 'Red') : l('Azul', 'Blue')}</td>
                    <td className="px-2"><span className="inline-flex items-center gap-1.5"><IconeAgente nome={j.agente} tamanho={20} />{j.agente ?? '-'}</span></td>
                    {[j.kills, j.deaths, j.assists, j.acs, j.firstBloods, j.trades, pct(j.hsPct), pct(j.kastPct), rs[n] ?? '-'].map((v, i) => (
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

/** Owner e Dev: exigir o servidor de Discord para entrar na fila. */
export function DiscordStaff() {
  const acao = useAcao()
  const estado = useCarregar(() => dados.estadoDiscord(false), [], ['staff'])
  const [obrigatorio, setObrigatorio] = useState<'sim' | 'nao' | null>(null)
  const [convite, setConvite] = useState<string | null>(null)
  const [eu, setEu] = useState<boolean | null>(null)
  const [aTestar, setATestar] = useState(false)
  if (!estado.valor) return <Carregando />
  const valorObrigatorio = obrigatorio ?? (estado.valor.obrigatorio ? 'sim' : 'nao')
  const valorConvite = convite ?? estado.valor.convite ?? ''

  const guardar = () => acao(async () => {
    await dados.definirDiscordFila(valorObrigatorio === 'sim', valorConvite)
    setObrigatorio(null)
    setConvite(null)
  }, valorObrigatorio === 'sim' ? l('A fila passa a exigir o servidor de Discord.', 'The queue now requires the Discord server.') : l('A fila já não exige o Discord.', 'The queue no longer requires Discord.'))

  const testar = async () => {
    setATestar(true)
    const r = await acao(async () => {
      if (!estado.valor?.obrigatorio) throw new Error('Guarda primeiro com "Obrigatório" ligado: a verificação só corre quando a fila exige o Discord.')
      return dados.estadoDiscord(true)
    })
    setATestar(false)
    if (r) setEu(r.membro)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[640px] text-[13px] leading-normal text-mudo">
        {l('Com isto ligado, só entra na fila quem o bot encontrar no servidor de Discord. Quem não estiver vê o botão para entrar no servidor em vez do botão da fila. A confirmação vale 30 minutos e repete-se sozinha.', 'With this on, only players the bot finds in the Discord server can join the queue. Anyone else sees a button to join the server instead of the queue button. The check lasts 30 minutes and repeats on its own.')}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
          {l('Discord para a fila', 'Discord for the queue')}
          <Segmentado rotulo={l('Discord para a fila', 'Discord for the queue')} valor={valorObrigatorio} onChange={setObrigatorio} opcoes={[{ valor: 'nao', texto: l('Opcional', 'Optional') }, { valor: 'sim', texto: l('Obrigatório', 'Required') }]} />
        </div>
        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
          {l('Convite do servidor', 'Server invite')}
          <input className="campo" value={valorConvite} onChange={(e) => setConvite(e.target.value)} placeholder="https://discord.gg/..." />
        </label>
        <button type="button" className="btn btn-primario" onClick={guardar}>{l('Guardar', 'Save')}</button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-white/6 pt-4">
        <button type="button" className="btn btn-fantasma" disabled={aTestar} onClick={testar}><PlugZap size={15} className="text-laranja" aria-hidden />{aTestar ? l('A perguntar ao Discord…', 'Asking Discord…') : l('Verificar a minha conta', 'Check my account')}</button>
        {eu != null && <Chip tom={eu ? 'vitoria' : 'derrota'}>{eu ? l('O bot encontrou-te no servidor', 'The bot found you in the server') : l('O bot não te encontrou no servidor', 'The bot did not find you in the server')}</Chip>}
        <span className="text-[12.5px] text-mudo">{l('Precisa da Edge Function verificar-discord publicada (ver DISCORD.md).', 'Needs the verificar-discord Edge Function deployed (see DISCORD.md).')}</span>
      </div>
      <MensagensDiscord />
    </div>
  )
}

/**
 * Uma mensagem fixa do bot num canal: carregar no botão publica-a ou atualiza a que lá está
 * (não cria outra).
 */
function MensagemDiscord({ titulo, descricao, requisitos, botao, publicar, feito }: {
  titulo: string; descricao: string; requisitos: string; botao: string; publicar: () => Promise<unknown>; feito: string
}) {
  const acao = useAcao()
  const [aPublicar, setAPublicar] = useState(false)
  const correr = async () => {
    setAPublicar(true)
    await acao(publicar, feito)
    setAPublicar(false)
  }
  return (
    <div className="flex flex-col gap-3 border-t border-white/6 pt-4">
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-bold">{titulo}</span>
        <span className="max-w-[640px] text-[13px] leading-normal text-mudo">{descricao}</span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-suave" disabled={aPublicar} onClick={correr}><Megaphone size={15} aria-hidden />{aPublicar ? l('A publicar…', 'Posting…') : botao}</button>
        <span className="text-[12.5px] text-mudo">{requisitos}</span>
      </div>
    </div>
  )
}

/**
 * O cargo Ranked do Discord (quem tem Ascendente 1 ou mais vê o canal da fila ranked). O bot dá e tira-o sozinho quando o rank
 * muda; este botão acerta toda a gente de uma vez, por exemplo na primeira vez ou depois de mudares o cargo.
 */
function CargosRanked() {
  const acao = useAcao()
  const avisar = useAvisos()
  const [aCorrer, setACorrer] = useState(false)
  const correr = async () => {
    setACorrer(true)
    const r = await acao(() => dados.acertarCargosRanked())
    setACorrer(false)
    if (!r) return
    avisar(l(
      `Cargo Ranked acertado: ${r.dados} com o cargo, ${r.tirados} sem ele, ${r.foraDoServidor} fora do servidor${r.falhas ? `, ${r.falhas} com erro` : ''}${r.incompleto ? `. Faltam ${r.total - r.feitos}: carrega outra vez` : ''}.`,
      `Ranked role updated: ${r.dados} with the role, ${r.tirados} without it, ${r.foraDoServidor} outside the server${r.falhas ? `, ${r.falhas} failed` : ''}${r.incompleto ? `. ${r.total - r.feitos} left: click again` : ''}.`,
    ), r.falhas ? 'erro' : undefined)
  }
  return (
    <div className="flex flex-col gap-3 border-t border-white/6 pt-4">
      <span className="flex flex-col gap-1">
        <span className="text-[14px] font-bold">{l('Cargo Ranked: quem vê o canal da fila ranked', 'Ranked role: who sees the ranked queue channel')}</span>
        <span className="max-w-[640px] text-[13px] leading-normal text-mudo">{l('Quem tem Ascendente 1 ou mais (pelo rank oficial) recebe o cargo Ranked e quem desce abaixo perde-o. O bot acerta o cargo sozinho quando o rank muda; este botão acerta toda a gente agora. O bot precisa da permissão "Gerir cargos" e do cargo dele acima do Ranked.', 'Players with Ascendant 1 or higher (by official rank) get the Ranked role and lose it when they drop below. The bot updates the role on its own when the rank changes; this button updates everyone now. The bot needs the "Manage Roles" permission and its role above Ranked.')}</span>
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-suave" disabled={aCorrer} onClick={correr}><RefreshCw size={15} aria-hidden />{aCorrer ? l('A acertar os cargos…', 'Updating roles…') : l('Acertar o cargo Ranked de toda a gente', 'Update everyone\'s Ranked role')}</button>
        <span className="text-[12.5px] text-mudo">{l('Precisa da função discord-ping (ver DISCORD.md).', 'Needs the discord-ping function (see DISCORD.md).')}</span>
      </div>
    </div>
  )
}

/** As mensagens do bot: o botão de chamar (canal de ping) e as duas filas com os botões de entrar (um canal por fila). */
function MensagensDiscord() {
  return (
    <>
      <MensagemDiscord
        titulo={l('Canal de ping: botão "Chamar para a fila"', 'Ping channel: "Call to the queue" button')}
        descricao={l('Publica no canal de ping o embed com o banner e o botão. Quem carrega pinga o cargo de ping. Só pode haver uma chamada de 5 em 5 minutos para o servidor todo, e cada chamada nova apaga a anterior. Já não mostra quantas pessoas estão na fila (isso é do canal da fila). Carregar aqui outra vez atualiza a mesma mensagem, não cria outra.', 'Posts the embed with the banner and the button in the ping channel. Whoever clicks pings the ping role. Only one call every 5 minutes for the whole server, and each new call deletes the previous one. It no longer shows how many people are in the queue (that is the queue channel\'s job). Clicking here again updates the same message instead of creating a new one.')}
        requisitos={l('Precisa das funções discord-ping e discord-interacoes (ver DISCORD.md).', 'Needs the discord-ping and discord-interacoes functions (see DISCORD.md).')}
        botao={l('Publicar ou atualizar o ping', 'Post or update the ping')}
        publicar={() => dados.publicarPingDiscord()}
        feito={l('Mensagem do ping publicada no Discord.', 'Ping message posted on Discord.')}
      />
      <MensagemDiscord
        titulo={l('Canal da fila aberta: quantas pessoas estão na fila', 'Open queue channel: how many people are in the queue')}
        descricao={l('Publica no canal da fila aberta a contagem (n/10) com os botões "Entrar na fila aberta" e "Abrir o site". "Entrar na fila aberta" abre o site e a pessoa entra na fila sozinha, sem carregar no botão do site. A contagem atualiza-se sozinha quando alguém entra ou sai da fila.', 'Posts the open queue count (n/10) in the open queue channel with the "Join the open queue" and "Open the site" buttons. "Join the open queue" opens the site and the person joins the queue on their own, without pressing the site\'s button. The count updates by itself when someone joins or leaves the queue.')}
        requisitos={l('Precisa das funções discord-ping e discord-partida e das migrações 0027 e 0032 (ver DISCORD.md).', 'Needs the discord-ping and discord-partida functions and migrations 0027 and 0032 (see DISCORD.md).')}
        botao={l('Publicar ou atualizar a fila aberta', 'Post or update the open queue')}
        publicar={() => dados.publicarFilaDiscord()}
        feito={l('Mensagem da fila aberta publicada no Discord.', 'Open queue message posted on Discord.')}
      />
      <MensagemDiscord
        titulo={l('Canal da fila ranked: só Ascendente 1 ou mais', 'Ranked queue channel: Ascendant 1 or higher only')}
        descricao={l('Publica no canal da fila ranked a contagem (n/10), quantos faltam e os botões "Entrar na fila ranked" e "Abrir o site". Só quem tem o cargo Ranked vê este canal. A contagem atualiza-se sozinha.', 'Posts the ranked queue count (n/10), how many are missing and the "Join the ranked queue" and "Open the site" buttons in the ranked queue channel. Only people with the Ranked role see this channel. The count updates by itself.')}
        requisitos={l('Precisa das funções discord-ping e discord-partida e da migração 0032 (ver DISCORD.md).', 'Needs the discord-ping and discord-partida functions and migration 0032 (see DISCORD.md).')}
        botao={l('Publicar ou atualizar a fila ranked', 'Post or update the ranked queue')}
        publicar={() => dados.publicarFilaRankedDiscord()}
        feito={l('Mensagem da fila ranked publicada no Discord.', 'Ranked queue message posted on Discord.')}
      />
      <CargosRanked />
      <AnunciosDiscord />
    </>
  )
}

/** Owner e Dev: volta a ler os dados de uma partida terminada e refaz o RS, o MVP e os pontos. */
export function BotaoRecarregar({ id, simulada, aoAcabar, pequeno = false }: { id: string; simulada: boolean; aoAcabar?: (r: RecargaPartida) => void; pequeno?: boolean }) {
  const acao = useAcao()
  const avisar = useAvisos()
  const [aCorrer, setACorrer] = useState(false)
  const correr = async () => {
    setACorrer(true)
    const r = await acao(() => dados.recarregarPartida(id, simulada))
    setACorrer(false)
    if (!r) return
    const mudou = r.jogadores.filter((j) => j.antes !== j.depois).length
    avisar(l(`${r.codigo} recarregada: ${mudou} ${mudou === 1 ? 'jogador mudou' : 'jogadores mudaram'} de pontos.`, `${r.codigo} reloaded: ${mudou} ${mudou === 1 ? 'player' : 'players'} changed points.`))
    for (const a of r.avisos ?? []) avisar(a, 'erro')
    aoAcabar?.(r)
  }
  return (
    <button type="button" disabled={aCorrer} onClick={correr} className={`btn btn-fantasma ${pequeno ? '!min-h-8 !px-3 !text-[12.5px]' : ''}`}>
      <RefreshCw size={14} className={`text-laranja ${aCorrer ? 'animate-spin' : ''}`} aria-hidden />
      {aCorrer ? l('A recarregar…', 'Reloading…') : l('Recarregar dados', 'Reload data')}
    </button>
  )
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface FimRecarga { ok: number; mudaram: number; falhas: { codigo: string; erro: string }[]; avisos: string[]; parou: boolean }

/**
 * Recarrega, uma a uma, todas as partidas terminadas (por exemplo, depois de mudar a fórmula
 * dos pontos). Nas reais lê a Henrik Dev API, por isso espera uns segundos entre partidas para
 * não esgotar o limite de pedidos. Se alguma falhar, as outras seguem e no fim vê-se quais foram.
 */
function RecarregarTodas() {
  const avisar = useAvisos()
  const [estado, setEstado] = useState<{ feitas: number; total: number; codigo: string } | null>(null)
  const [fim, setFim] = useState<FimRecarga | null>(null)
  const parar = useRef(false)

  const correr = async () => {
    parar.current = false
    setFim(null)
    setEstado({ feitas: 0, total: 0, codigo: '' })
    const todas: ResumoPartida[] = []
    try {
      let cursor: string | null = null
      do {
        const pagina: PaginaPartidas = await dados.partidas({ minhas: false, cursor })
        todas.push(...pagina.linhas)
        cursor = pagina.cursor
      } while (cursor)
    } catch (e) {
      setEstado(null)
      avisar(e instanceof Error ? e.message : l('Não foi possível listar as partidas.', 'Could not list the matches.'), 'erro')
      return
    }
    const r: FimRecarga = { ok: 0, mudaram: 0, falhas: [], avisos: [], parou: false }
    for (let i = 0; i < todas.length; i++) {
      if (parar.current) break
      const m = todas[i]
      setEstado({ feitas: i, total: todas.length, codigo: m.codigo })
      try {
        const x = await dados.recarregarPartida(m.id, m.simulada)
        r.ok++
        r.mudaram += x.jogadores.filter((j) => j.antes !== j.depois).length
        for (const a of x.avisos ?? []) r.avisos.push(`${m.codigo}: ${a}`)
      } catch (e) {
        r.falhas.push({ codigo: m.codigo, erro: e instanceof Error ? e.message : l('Erro desconhecido.', 'Unknown error.') })
      }
      // A API da Riot (Henrik) tem um limite de pedidos por minuto.
      if (!m.simulada && i < todas.length - 1 && !parar.current) await esperar(4000)
    }
    r.parou = parar.current
    setEstado(null)
    setFim(r)
  }

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
          <span className="text-[14px] font-bold">{l('Recarregar todas as partidas', 'Reload all matches')}</span>
          <span className="text-[12.5px] text-mudo">{l('Percorre todas as partidas terminadas, uma a uma. Cada jogador só recebe a diferença nos pontos.', 'Goes through every finished match, one by one. Each player only gets the points difference.')}</span>
        </span>
        {estado ? (
          <button type="button" className="btn btn-fantasma !min-h-10" onClick={() => { parar.current = true }}>{l('Parar depois desta', 'Stop after this one')}</button>
        ) : (
          <BotaoSegurar
            rotulo={l('Segura para recarregar todas as partidas', 'Hold to reload all matches')}
            className="btn btn-suave !min-h-10"
            onConfirmar={correr}
          >
            <RefreshCw size={15} aria-hidden />{l('Recarregar todas', 'Reload all')}
          </BotaoSegurar>
        )}
      </div>
      {estado && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <span className="font-mono text-[12.5px] text-pessego">
            {estado.total ? `${estado.feitas + 1}/${estado.total} · ${estado.codigo}` : l('A listar as partidas…', 'Listing matches…')}
          </span>
          <span className="block h-1.5 overflow-hidden rounded-full bg-white/7">
            <span className="block h-full rounded-full bg-laranja transition-[width] duration-300" style={{ width: `${estado.total ? (estado.feitas / estado.total) * 100 : 3}%` }} />
          </span>
        </div>
      )}
      {fim && (
        <div className="flex flex-col gap-2 text-[13px]">
          <span className="font-semibold text-pessego-claro">
            {fim.parou ? l('Parou. ', 'Stopped. ') : ''}
            {l(`${fim.ok} ${fim.ok === 1 ? 'partida recarregada' : 'partidas recarregadas'}, ${fim.mudaram} ${fim.mudaram === 1 ? 'jogador mudou' : 'jogadores mudaram'} de pontos.`, `${fim.ok} ${fim.ok === 1 ? 'match' : 'matches'} reloaded, ${fim.mudaram} ${fim.mudaram === 1 ? 'player' : 'players'} changed points.`)}
          </span>
          {fim.falhas.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-derrota/30 bg-derrota/[0.06] p-3">
              <span className="font-semibold text-derrota">{l(`${fim.falhas.length} falharam. Tenta-as outra vez, uma a uma, na lista de baixo:`, `${fim.falhas.length} failed. Try them again, one at a time, in the list below:`)}</span>
              {fim.falhas.map((x) => <span key={x.codigo} className="font-mono text-[12px] text-suave">{x.codigo}: {x.erro}</span>)}
            </div>
          )}
          {fim.avisos.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-laranja/25 bg-laranja/[0.05] p-3">
              {fim.avisos.map((a) => <span key={a} className="text-[12.5px] text-suave">{a}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** As últimas partidas terminadas, cada uma com o botão para recarregar. */
export function RecarregarStaff() {
  const lista = useCarregar(() => dados.partidas({ minhas: false }), [], ['partida'])
  const [ultima, setUltima] = useState<RecargaPartida | null>(null)
  if (!lista.valor) return <Carregando />
  const linhas = lista.valor.linhas.slice(0, 8)
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-[640px] text-[13px] leading-normal text-mudo">
        {l('Para partidas fechadas antes do Rangify Score e dos agentes, ou com dados incompletos. Numa partida real, o jogo é lido outra vez na Henrik Dev API. Numa de teste, usa as estatísticas que já tem. O RS, o MVP e os pontos são refeitos e cada jogador recebe só a diferença. O resultado não muda.', 'For matches closed before the Rangify Score and agents, or with incomplete data. In a real match, the game is read again from the Henrik Dev API. In a test match, it uses the stats it already has. RS, MVP and points are redone and each player only gets the difference. The result does not change.')}
      </p>
      {linhas.length > 0 && <RecarregarTodas />}
      {!linhas.length ? <Vazio icone={<RefreshCw size={22} />} titulo={l('Sem partidas terminadas', 'No finished matches')} /> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {linhas.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-[13px] border border-white/7 bg-white/[0.025] px-4 py-3">
              <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
                <span className="font-mono text-[13px] font-semibold text-pessego">{m.codigo} · {m.mapa ?? '-'} · {m.resultadoA}-{m.resultadoB}</span>
                <span className="text-[12.5px] text-mudo">{l('Equipa', 'Team')} {m.capitaoA} vs {l('Equipa', 'Team')} {m.capitaoB} · {haQuanto(m.terminouEm)}</span>
              </span>
              {m.simulada && <Chip tom="laranja">{l('Teste', 'Test')}</Chip>}
              <BotaoRecarregar id={m.id} simulada={m.simulada} pequeno aoAcabar={setUltima} />
            </li>
          ))}
        </ul>
      )}
      {ultima && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-laranja/25 bg-laranja/[0.04] p-4">
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-pessego">{ultima.codigo} · {ultima.fonte === 'api' ? l('LIDA NA API', 'READ FROM THE API') : l('RECALCULADA', 'RECALCULATED')}</span>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {ultima.jogadores.map((j) => (
              <span key={j.nome} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-2 text-[13px]">
                <IconeAgente nome={j.agente} tamanho={22} />
                <span className="min-w-0 flex-1 truncate font-semibold">{j.nome}</span>
                <span className="font-mono text-[12px] text-mudo">RS {j.rangifyScore ?? '-'}</span>
                <span className="font-mono text-[12px]">{j.antes != null ? comSinal(j.antes) : '-'} → <b className={j.depois > 0 ? 'text-vitoria' : 'text-derrota'}>{comSinal(j.depois)}</b></span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Owner e Dev: abrir a loja de Rangify Coins a toda a gente (ou voltar a fechá-la). */
export function LojaStaff() {
  const acao = useAcao()
  const estado = useCarregar(() => dados.loja(), [], ['loja', 'staff'])
  if (!estado.valor) return <Carregando />
  const publica = estado.valor.visivel && estado.valor.publica
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[640px] text-[13px] leading-normal text-mudo">
        {l('Enquanto está fechada, só Owner e Dev veem a loja no menu, e as decorações compradas só aparecem a Owner e Dev. Ao abrir, toda a gente passa a ver a loja e as decorações de todos.', 'While closed, only Owner and Dev see the shop in the menu, and bought decorations only show to Owner and Dev. Once open, everyone sees the shop and everyone\'s decorations.')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Chip tom={publica ? 'vitoria' : 'laranja'}>{publica ? l('Aberta a toda a gente', 'Open to everyone') : l('Fechada: só Owner e Dev', 'Closed: Owner and Dev only')}</Chip>
        {publica ? (
          <BotaoSegurar rotulo={l('Segura para fechar a loja ao público', 'Hold to close the shop to the public')} className="btn btn-fantasma" onConfirmar={() => acao(() => dados.definirLojaPublica(false), l('A loja voltou a estar fechada.', 'The shop is closed again.'))}>
            <Lock size={16} aria-hidden />{l('Fechar a loja ao público', 'Close the shop to the public')}
          </BotaoSegurar>
        ) : (
          <BotaoSegurar rotulo={l('Segura para abrir a loja a toda a gente', 'Hold to open the shop to everyone')} className="btn btn-primario" onConfirmar={() => acao(() => dados.definirLojaPublica(true), l('A loja está aberta a toda a gente.', 'The shop is open to everyone.'))}>
            <ShoppingBag size={16} aria-hidden />{l('Abrir a loja a toda a gente', 'Open the shop to everyone')}
          </BotaoSegurar>
        )}
        <Link to="/loja" className="btn btn-fantasma no-underline">{l('Ir para a loja', 'Go to the shop')}</Link>
      </div>
    </div>
  )
}

/** Owner e Dev: abrir o overlay do OBS, a Twitch e os convites a toda a gente (ou voltar a fechá-los) e ver como está a correr. */
export function DivulgacaoStaff() {
  const acao = useAcao()
  const estado = useCarregar(() => dados.divulgacaoEstado(), [], ['staff', 'streamers'])
  if (!estado.valor) return <Carregando />
  const e = estado.valor
  const numeros: [string, number][] = [
    [l('Twitch ligadas', 'Twitch linked'), e.twitchLigadas],
    [l('Em direto agora', 'Live now'), e.aoVivo],
    [l('Overlays criados', 'Overlays created'), e.overlays],
    [l('Convidados', 'Invited'), e.convidados],
    [l('Convites pagos', 'Invites paid'), e.premiados],
    [l('Coins dadas', 'Coins given'), e.moedasDadas],
  ]
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 max-w-[680px] text-[13px] leading-normal text-mudo">
        {l('Overlay do OBS, marca animada, ligação da Twitch (com o "AO VIVO" ao lado dos jogadores em direto) e convites com recompensa. Enquanto está fechado, só Owner e Dev veem e usam: a página Divulgar aparece no menu só para vocês e as ligações de overlay dos outros jogadores ficam vazias. Ao abrir, toda a gente passa a ter tudo.', 'OBS overlay, animated badge, Twitch link (with "LIVE" next to players who are streaming) and invites with a reward. While closed, only Owner and Dev see and use it: the Share page shows in the menu only for you and other players\' overlay links stay empty. Once open, everyone gets everything.')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Chip tom={e.publico ? 'vitoria' : 'laranja'}>{e.publico ? l('Aberto a toda a gente', 'Open to everyone') : l('Fechado: só Owner e Dev', 'Closed: Owner and Dev only')}</Chip>
        {e.publico ? (
          <BotaoSegurar rotulo={l('Segura para fechar ao público', 'Hold to close to the public')} className="btn btn-fantasma" onConfirmar={() => acao(() => dados.definirStreamersPublico(false), l('A área voltou a estar fechada.', 'The area is closed again.'))}>
            <Lock size={16} aria-hidden />{l('Fechar ao público', 'Close to the public')}
          </BotaoSegurar>
        ) : (
          <BotaoSegurar rotulo={l('Segura para abrir a toda a gente', 'Hold to open to everyone')} className="btn btn-primario" onConfirmar={() => acao(() => dados.definirStreamersPublico(true), l('A área está aberta a toda a gente.', 'The area is open to everyone.'))}>
            <Megaphone size={16} aria-hidden />{l('Abrir a toda a gente', 'Open to everyone')}
          </BotaoSegurar>
        )}
        <Link to="/divulgar" className="btn btn-fantasma no-underline">{l('Ir para a página Divulgar', 'Go to the Share page')}</Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        {numeros.map(([nome, n]) => (
          <div key={nome} className="flex flex-col gap-0.5 rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
            <span className="font-mono text-[22px] leading-none font-semibold">{n}</span>
            <span className="text-[12px] text-mudo">{nome}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="eyebrow">{l('QUEM MAIS CONVIDA', 'TOP INVITERS')}</span>
        {e.top.length === 0 ? <Vazio icone={<Megaphone size={18} />} titulo={l('Ainda ninguém convidou ninguém', 'Nobody has invited anyone yet')} /> : (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {e.top.map((t, i) => (
              <li key={t.perfilId} className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.025] px-3 py-2 text-[13.5px]">
                <span className="w-6 font-mono text-[12px] text-mudo">#{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{t.utilizador}</span>
                <span className="font-mono text-[12px] text-suave">{t.premiados} {l('pagos', 'paid')} · {t.convidados} {l('convidados', 'invited')}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
