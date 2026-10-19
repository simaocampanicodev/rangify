// Deteta o resultado dos jogos de torneio que estão a decorrer, como processar-partida faz nas partidas do hub:
// procura o jogo personalizado no histórico de um jogador da API (Henrik Dev), reconhece-o pela hora e pelos
// jogadores das duas equipas e grava o resultado e as estatísticas (que sobem o vencedor na chave).
//
// Duas formas de a chamar:
//   * A base de dados, a cada minuto (pg_cron + pg_net), com o segredo partilhado do Discord no cabeçalho
//     x-rangify-segredo: verifica todos os jogos a decorrer há pelo menos 8 minutos.
//   * Um jogador das duas equipas (ou a staff), com a sessão e { jogoId }: verifica esse jogo.
// Cada jogo gasta no máximo uma consulta à API por minuto, venha o pedido de onde vier.
// Se o jogo ainda não aparecer devolve { pendente: true }; passada 1 hora, a staff é avisada na página
// do torneio e põe o resultado à mão.
import { ErroHenrik, admin, cors, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'
import { caminhoHistorico, encontrarPartida, type JogadorNosso, type PartidaHenrik } from '../_shared/henrik-partida.ts'

interface JogadorTorneio {
  perfilId: string; authId: string | null; equipa: 'A' | 'B'; riot_id: string | null; riot_puuid: string | null
  region: string; funcao: 'jogador' | 'coach' | 'suplente'; capitao: boolean
}
interface DadosJogo {
  estado: string; mapa: string | null; comecouEm: string | null; minJogadores: number; torneioId: string
  jogadores: JogadorTorneio[]; usadas: string[]
}

/** A janela começa antes de abrirem o jogo: o código pode ter sido posto minutos depois de começarem a jogar. */
const MARGEM_ANTES_MS = 15 * 60_000
/** No máximo duas consultas por ciclo (uma por equipa), que cada uma gasta pedidos da chave. */
const CONSULTAS_POR_CICLO = 2

async function processar(jogoId: string): Promise<{ estado: string; pendente?: boolean; aviso?: string }> {
  const db = admin()
  const { data } = await db.rpc('_torneio_jogo_dados', { p_jogo: jogoId })
  const dados = data as DadosJogo | null
  if (!dados) return { estado: 'desconhecido' }
  if (dados.estado !== 'a_decorrer') return { estado: dados.estado }

  const { data: reservada } = await db.rpc('_torneio_reservar_consulta', { p_jogo: jogoId, p_segundos: 60 })
  if (!reservada) return { estado: 'a_decorrer', pendente: true }

  // O coach não joga: fica de fora do reconhecimento.
  const quemJoga = dados.jogadores.filter((j) => j.funcao !== 'coach' && j.riot_id)
  const nossos: JogadorNosso[] = quemJoga.map((j) => ({ perfilId: j.perfilId, equipa: j.equipa, riot_id: j.riot_id, riot_puuid: j.riot_puuid }))
  if (!nossos.length) return { estado: 'a_decorrer', pendente: true, aviso: 'Nenhum jogador com Riot ID ligado.' }

  // Quem se consulta: o capitão de cada equipa (se jogar) e, na falta, o primeiro jogador.
  const consultar: JogadorTorneio[] = []
  for (const eq of ['A', 'B'] as const) {
    const doLado = quemJoga.filter((j) => j.equipa === eq)
    const escolhido = doLado.find((j) => j.capitao && j.funcao === 'jogador') ?? doLado.find((j) => j.funcao === 'jogador') ?? doLado[0]
    if (escolhido) consultar.push(escolhido)
  }

  const desde = new Date(dados.comecouEm ?? Date.now()).getTime() - MARGEM_ANTES_MS
  for (const quem of consultar.slice(0, CONSULTAS_POR_CICLO)) {
    const { nome, tag } = partirRiotId(quem.riot_id!)
    const lista = await henrik<PartidaHenrik[]>(caminhoHistorico(quem.region, nome, tag))
    const achada = encontrarPartida(lista ?? [], { mapa: dados.mapa, desde, nossos, minimo: dados.minJogadores, excluir: dados.usadas })
    if (!achada) continue
    const { error } = await db.rpc('_torneio_aplicar_resultado', {
      p_jogo: jogoId, p_a: achada.a, p_b: achada.b, p_stats: achada.stats, p_como: 'api', p_riot_match: achada.riotMatchId,
    })
    // Um resultado que as regras recusam (a API ainda a meio, por exemplo) fica para o próximo ciclo.
    if (error) return { estado: 'a_decorrer', pendente: true, aviso: error.message }
    return { estado: 'concluido' }
  }
  return { estado: 'a_decorrer', pendente: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return erro('Só POST.', 405)
  try {
    const db = admin()
    const segredo = Deno.env.get('DISCORD_SEGREDO')
    // A base de dados, a cada minuto: percorre os jogos que já podem ter acabado.
    if (segredo && req.headers.get('x-rangify-segredo') === segredo) {
      const { data: ids } = await db.rpc('_torneio_jogos_a_verificar')
      const resultados: Record<string, string> = {}
      for (const id of (ids as string[] | null) ?? []) {
        try {
          resultados[id] = (await processar(id)).estado
        } catch (e) {
          resultados[id] = e instanceof ErroHenrik ? `api ${e.estado}` : 'erro'
          if (e instanceof ErroHenrik && e.estado === 429) break
        }
      }
      return resposta({ verificados: resultados })
    }

    // Um jogador do jogo (ou a staff), a partir da página do torneio.
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const { jogoId } = await req.json() as { jogoId?: string }
    if (!jogoId) return erro('Falta o jogo.')
    const { data: dados } = await db.rpc('_torneio_jogo_dados', { p_jogo: jogoId })
    if (!dados) return erro('Jogo não encontrado.', 404)
    const participa = (dados as DadosJogo).jogadores.some((j) => j.authId === u.id)
    if (!participa) {
      const { data: perfil } = await db.from('profiles').select('role').eq('auth_id', u.id).single()
      if (!perfil || !['owner', 'dev'].includes(perfil.role as string)) return erro('Não fazes parte deste jogo.', 403)
    }
    return resposta(await processar(jogoId))
  } catch (e) {
    if (e instanceof ErroHenrik) return resposta({ pendente: true, aviso: e.message })
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
