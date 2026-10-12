// Liga o Riot ID (corpo { riotId, regiao }) ou volta a ler o rank oficial
// (corpo vazio). O rank só é pedido à Henrik Dev API de 6 em 6 horas.
import { ErroHenrik, admin, cors, enc, erro, henrik, partirRiotId, rankOficial, resposta, utilizador } from '../_shared/comum.ts'

const HORAS_CACHE = 6
const REGIOES = ['eu', 'na', 'ap', 'kr', 'latam', 'br']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('*').eq('auth_id', u.id).single()
    if (!perfil) return erro('Perfil não encontrado.', 404)
    const corpo = await req.json().catch(() => ({})) as { riotId?: string; regiao?: string }

    if (corpo.riotId) {
      const riotId = corpo.riotId.trim()
      if (!/^[^#]{3,16}#[A-Za-z0-9]{3,5}$/.test(riotId)) return erro('O Riot ID tem o formato Nome#TAG, por exemplo Nyx#4521.')
      // Mudar de Riot ID a meio de uma partida estragava a confirmação pela API.
      if (perfil.riot_id) {
        const { data: ativa } = await db.rpc('_partida_ativa', { p_perfil: perfil.id })
        const { data: naFila } = await db.from('queue_entries').select('profile_id').eq('profile_id', perfil.id).maybeSingle()
        if (ativa || naFila) return erro('Sai da fila ou acaba a partida antes de mudar o Riot ID.')
      }
      const { nome, tag } = partirRiotId(riotId)
      const conta = await henrik<{ puuid: string; region: string; name: string; tag: string }>(`/valorant/v1/account/${enc(nome)}/${enc(tag)}`)
      const regiao = REGIOES.includes(corpo.regiao ?? '') ? corpo.regiao! : (REGIOES.includes(conta.region) ? conta.region : 'eu')
      const canonico = `${conta.name}#${conta.tag}`
      const { data: dono } = await db.from('profiles').select('id').neq('id', perfil.id).or(`riot_id.ilike.${canonico.replace(/[%_,()]/g, '')},riot_puuid.eq.${conta.puuid}`).limit(1)
      if (dono?.length) return erro('Esse Riot ID já está ligado a outra conta.')
      const rank = await rankOficial(regiao, conta.name, conta.tag)
      await db.from('profiles').update({
        riot_id: canonico, riot_puuid: conta.puuid, region: regiao, official_tier: rank.tier, official_rr: rank.rr, rank_synced_at: new Date().toISOString(),
      }).eq('id', perfil.id)
      const { data: json } = await db.rpc('_perfil_json_id', { p_id: perfil.id })
      return resposta({ perfil: json, atualizado: true, proximaEm: new Date(Date.now() + HORAS_CACHE * 3_600_000).toISOString() })
    }

    if (!perfil.riot_id) return erro('Liga primeiro o teu Riot ID.')
    const proxima = perfil.rank_synced_at ? new Date(perfil.rank_synced_at).getTime() + HORAS_CACHE * 3_600_000 : 0
    if (proxima > Date.now()) {
      const { data: json } = await db.rpc('_perfil_json_id', { p_id: perfil.id })
      return resposta({ perfil: json, atualizado: false, proximaEm: new Date(proxima).toISOString() })
    }
    const { nome, tag } = partirRiotId(perfil.riot_id)
    const rank = await rankOficial(perfil.region, nome, tag)
    await db.from('profiles').update({ official_tier: rank.tier, official_rr: rank.rr, rank_synced_at: new Date().toISOString() }).eq('id', perfil.id)
    const { data: json } = await db.rpc('_perfil_json_id', { p_id: perfil.id })
    return resposta({ perfil: json, atualizado: true, proximaEm: new Date(Date.now() + HORAS_CACHE * 3_600_000).toISOString() })
  } catch (e) {
    if (e instanceof ErroHenrik) return erro(e.message, e.estado === 404 ? 404 : 502)
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
