// Só Owner e Dev: vai buscar o último jogo personalizado da própria conta à
// Henrik Dev API e devolve o que o Rangify tiraria dele, sem gravar nada.
// Serve para confirmar, antes de uma partida a sério, que a API traz tudo.
import { ErroHenrik, admin, cors, erro, henrik, partirRiotId, resposta, utilizador } from '../_shared/comum.ts'
import { caminhoHistorico, lerPartida, type PartidaHenrik } from '../_shared/henrik-partida.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('riot_id, region, role').eq('auth_id', u.id).single()
    if (!perfil) return erro('Perfil não encontrado.', 404)
    if (perfil.role !== 'owner' && perfil.role !== 'dev') return erro('Só Owner e Dev podem fazer isto.', 403)
    if (!perfil.riot_id) return erro('Liga o teu Riot ID primeiro.')

    const { nome, tag } = partirRiotId(perfil.riot_id)
    const lista = await henrik<PartidaHenrik[]>(caminhoHistorico(perfil.region, nome, tag))
    const p = lista?.[0]
    if (!p) return resposta({ riotId: perfil.riot_id, encontrado: false, jogadores: [], avisos: ['A API não devolveu nenhum jogo personalizado desta conta.'] })

    const lido = lerPartida(p)
    const avisos: string[] = []
    if (lido.rondasPorCor.red == null || lido.rondasPorCor.blue == null) avisos.push('A API não trouxe o resultado por equipa.')
    if (!lido.mortes) avisos.push('A API não trouxe as kills ronda a ronda: first bloods, trades e KAST ficam a zero.')
    if (lido.jogadores.every((j) => j.hsPct == null)) avisos.push('A API não trouxe os tiros: o HS% fica vazio.')
    if (lido.jogadores.length !== 10) avisos.push(`O jogo tem ${lido.jogadores.length} jogadores, não 10.`)

    return resposta({
      riotId: perfil.riot_id,
      encontrado: true,
      modo: p.metadata.mode ?? null,
      mapa: p.metadata.map,
      inicio: new Date(p.metadata.game_start * 1000).toISOString(),
      resultado: `${lido.rondasPorCor.red ?? '?'}-${lido.rondasPorCor.blue ?? '?'}`,
      rondas: lido.rondas,
      mortes: lido.mortes,
      jogadores: lido.jogadores.sort((a, b) => a.equipa.localeCompare(b.equipa) || b.acs - a.acs),
      avisos,
    })
  } catch (e) {
    if (e instanceof ErroHenrik) return erro(e.message, 502)
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
