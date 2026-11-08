/**
 * Como se fala do estado do site (Staff > Estado): os nomes, as cores e, para cada motivo que a base de dados devolve
 * (migração 0045), o título, a explicação e uma pista do que fazer. Os limites e a decisão de qual é o estado vivem na
 * base de dados; aqui só se traduz. Um código que o site ainda não conhece aparece tal e qual.
 */
import type { EstadoSaude, MonitorSaudeId, MotivoSaude } from './data'
import { l as tx } from './idioma'

type Tom = 'vitoria' | 'ouro' | 'derrota'

export const NIVEL_SAUDE: Record<EstadoSaude, number> = { ok: 0, lento: 1, sobrecarga: 2, em_baixo: 3 }
export const tomSaude = (e: EstadoSaude): Tom => (e === 'ok' ? 'vitoria' : e === 'lento' ? 'ouro' : 'derrota')
/** As mesmas cores do tema (--color-vitoria, --color-ouro, --color-derrota) para quem desenha em SVG. */
export const corSaude = (e: EstadoSaude) => ({ vitoria: '#5fe3d6', ouro: '#f2c14e', derrota: '#ff7d8f' })[tomSaude(e)]

export const nomeSaude = (e: EstadoSaude) =>
  e === 'ok' ? 'OK' : e === 'lento' ? tx('Lento', 'Slow') : e === 'sobrecarga' ? tx('Sobrecarga', 'Overload') : tx('Em baixo', 'Down')

export const fraseSaude = (e: EstadoSaude) =>
  e === 'ok' ? tx('Tudo a funcionar', 'Everything is working')
    : e === 'lento' ? tx('O site está lento', 'The site is slow')
      : e === 'sobrecarga' ? tx('O site está sobrecarregado', 'The site is overloaded')
        : tx('O site está em baixo', 'The site is down')

export const MONITORES: MonitorSaudeId[] = ['site', 'api', 'auth', 'funcoes']

export const nomeMonitor = (id: MonitorSaudeId) =>
  ({ site: tx('Site', 'Site'), api: tx('API e base de dados', 'API and database'), auth: tx('Login', 'Login'), funcoes: 'Edge Functions' })[id] ?? id

export const descricaoMonitor = (id: MonitorSaudeId) =>
  ({
    site: tx('A página que abre no browser (Render).', 'The page that opens in the browser (Render).'),
    api: tx('Uma consulta simples à base de dados, como o site faz.', 'A simple database query, the way the site does it.'),
    auth: tx('O serviço de contas do Supabase.', 'The Supabase accounts service.'),
    funcoes: tx('O tempo até uma Edge Function responder.', 'The time until an Edge Function answers.'),
  })[id] ?? ''

export interface MotivoTexto {
  titulo: string
  explicacao: string
  pista: string
  /** O valor com a unidade ("94%", "2300 ms"); vazio se o motivo não tem valor. */
  valor: string
  /** "aviso a 70%, crítico a 90%"; vazio se não tem limites. */
  limite: string
}

/** A unidade do valor de cada motivo. */
const UNIDADE: Record<string, string> = { cpu: '%', ram: '%', disco: '%', ligacoes: '%', erros_http: '%', consulta_lenta: ' s', resposta_lenta: ' ms' }

export function descreverMotivo(m: MotivoSaude): MotivoTexto {
  const u = UNIDADE[m.codigo] ?? ''
  const valor = m.valor === undefined ? '' : `${m.valor}${u}`
  const limite = m.aviso !== undefined && m.critico !== undefined
    ? tx(`aviso a ${m.aviso}${u}, crítico a ${m.critico}${u}`, `warning at ${m.aviso}${u}, critical at ${m.critico}${u}`)
    : ''
  const nome = m.monitor ? nomeMonitor(m.monitor) : ''
  const base = { valor, limite }
  switch (m.codigo) {
    case 'cpu': return { ...base,
      titulo: tx('CPU do servidor ocupada', 'Server CPU busy'),
      explicacao: tx('O processador está quase no máximo, por isso os pedidos esperam uns pelos outros. Costuma ser muita gente ao mesmo tempo ou uma consulta pesada.', 'The processor is close to its limit, so requests wait for each other. Usually a lot of people at once or a heavy query.'),
      pista: tx('Vê as consultas mais lentas no Supabase (Reports) ou fecha a fila por uns minutos.', 'Check the slowest queries in Supabase (Reports) or close the queue for a few minutes.') }
    case 'ram': return { ...base,
      titulo: tx('Memória do servidor quase cheia', 'Server memory almost full'),
      explicacao: tx('Quando a memória acaba, o servidor começa a usar o disco e fica muito mais lento.', 'When memory runs out, the server starts using the disk and gets much slower.'),
      pista: tx('Se se repetir, o plano do Supabase precisa de mais memória.', 'If it keeps happening, the Supabase plan needs more memory.') }
    case 'disco': return { ...base,
      titulo: tx('Disco quase cheio', 'Disk almost full'),
      explicacao: tx('Com o disco cheio a base de dados deixa de aceitar escritas.', 'With a full disk the database stops accepting writes.'),
      pista: tx('Apaga o que não faz falta ou aumenta o disco no Supabase (Settings, Compute and Disk).', 'Delete what is not needed or increase the disk in Supabase (Settings, Compute and Disk).') }
    case 'carga': return { ...base,
      titulo: tx('Carga do servidor alta', 'High server load'),
      explicacao: tx('Há mais trabalho à espera do que o servidor consegue fazer ao mesmo tempo (1 é o servidor todo ocupado).', 'There is more work waiting than the server can do at once (1 means fully busy).'),
      pista: tx('Costuma ir a par da CPU: o mesmo conselho.', 'It usually goes with the CPU: same advice.') }
    case 'pool_api': return { ...base,
      titulo: tx('Pedidos à espera de uma ligação', 'Requests waiting for a connection'),
      explicacao: tx('A API não tem ligações livres à base de dados e os pedidos esperam na fila.', 'The API has no free database connections and requests wait in line.'),
      pista: tx('Costuma ser consultas lentas a prender ligações.', 'Usually slow queries holding on to connections.') }
    case 'ligacoes': return { ...base,
      titulo: tx('Ligações à base de dados quase no máximo', 'Database connections almost at the maximum'),
      explicacao: tx('Cada pedido usa uma ligação. Perto do máximo, os pedidos novos esperam ou falham.', 'Every request uses a connection. Near the maximum, new requests wait or fail.'),
      pista: tx('Vê se há consultas presas (abaixo) ou sobe o plano do Supabase.', 'Check for stuck queries (below) or upgrade the Supabase plan.') }
    case 'consulta_lenta': return { ...base,
      titulo: tx('Uma consulta demora demasiado', 'A query is taking too long'),
      explicacao: tx('Há uma consulta a correr há muito tempo e pode estar a travar as outras.', 'A query has been running for a long time and may be holding the others back.'),
      pista: tx('No Supabase, Reports mostra qual é.', 'In Supabase, Reports shows which one it is.') }
    case 'bloqueios': return { ...base,
      titulo: tx('Consultas à espera de bloqueios', 'Queries waiting on locks'),
      explicacao: tx('Várias consultas esperam que outra acabe para poderem mexer nos mesmos dados.', 'Several queries wait for another one to finish before touching the same data.'),
      pista: tx('Se não passar sozinho, há uma consulta presa a bloquear as outras.', 'If it does not clear on its own, a stuck query is blocking the others.') }
    case 'partidas_paradas': return { ...base,
      titulo: tx('Partidas paradas', 'Stalled matches'),
      explicacao: tx('Há partidas sem avançar há mais tempo do que devia. Pode ser a API da Riot ou o processamento a falhar.', 'Some matches have not moved for longer than they should. It may be the Riot API or the processing failing.'),
      pista: tx('Vê o separador Ao vivo da Staff.', 'Check the Live tab of the Staff area.') }
    case 'erros_http': return { ...base,
      titulo: tx('Chamadas da base de dados às funções a falhar', 'Database calls to functions failing'),
      explicacao: tx('A base de dados chama as Edge Functions (Discord, Twitch, torneios) e muitas respostas são erros.', 'The database calls the Edge Functions (Discord, Twitch, tournaments) and many answers are errors.'),
      pista: tx('Vê os registos das Edge Functions no Supabase.', 'Check the Edge Function logs in Supabase.') }
    case 'cron_falhas': return { ...base,
      titulo: tx('Tarefas agendadas a falhar', 'Scheduled tasks failing'),
      explicacao: tx('As tarefas de minuto a minuto (fila, Twitch, torneios) falharam nos últimos 15 minutos.', 'The every-minute tasks (queue, Twitch, tournaments) failed in the last 15 minutes.'),
      pista: tx('No Supabase, a tabela cron.job_run_details diz o erro.', 'In Supabase, the cron.job_run_details table shows the error.') }
    case 'resposta_lenta': return { ...base,
      titulo: tx(`${nome} está lento`, `${nome} is slow`),
      explicacao: tx('Demora mais a responder do que devia.', 'It takes longer to answer than it should.'),
      pista: m.monitor === 'site' ? tx('O site é estático: se está lento, vê o estado do Render.', 'The site is static: if it is slow, check Render status.')
        : m.monitor === 'api' ? tx('A API depende da base de dados: vê as ligações e as consultas.', 'The API depends on the database: check connections and queries.')
          : tx('Vê o estado do Supabase.', 'Check Supabase status.') }
    case 'monitor_em_baixo': return { ...base,
      titulo: tx(`${nome} não responde`, `${nome} is not responding`),
      explicacao: m.detalhe ? tx(`A verificação falhou: ${m.detalhe}.`, `The check failed: ${m.detalhe}.`) : tx('A verificação falhou.', 'The check failed.'),
      pista: m.monitor === 'site' ? tx('Vê o estado do serviço no Render.', 'Check the service status on Render.') : tx('Vê o estado do projeto no Supabase.', 'Check the project status on Supabase.') }
    case 'sondas_em_falta': return { ...base,
      titulo: tx('As verificações pararam', 'The checks stopped'),
      explicacao: tx('A função saude-sondar deixou de dar sinal. O Supabase pode ter problemas nas Edge Functions, ou a função foi despublicada.', 'The saude-sondar function stopped reporting. Supabase may have problems with Edge Functions, or the function was unpublished.'),
      pista: tx('Vê os registos da função no Supabase.', 'Check the function logs in Supabase.') }
    default: return { ...base, titulo: m.codigo, explicacao: '', pista: '' }
  }
}
