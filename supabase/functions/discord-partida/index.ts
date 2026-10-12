// Chamada pela base de dados (trigger em matches, via pg_net), nunca pelo site.
// { tipo: 'criar' }  : cargos RG-1234 / Team A / Team B, dados aos jogadores, e uma
//                      categoria com o chat da partida e uma call por equipa.
// { tipo: 'limpar' } : apaga os canais e os cargos (o Discord tira-os a toda a gente).
// O que foi criado fica em match_discord, para a limpeza saber o que apagar.
import { admin, erro, resposta } from '../_shared/comum.ts'

const API = 'https://discord.com/api/v10'

// Permissões do Discord (bits).
const VER = 1n << 10n
const ESCREVER = 1n << 11n
const HISTORICO = 1n << 16n
const LIGAR = 1n << 20n
const FALAR = 1n << 21n
const VOZ_AUTO = 1n << 25n
const GERIR_CANAIS = 1n << 4n
const p = (...bits: bigint[]) => bits.reduce((a, b) => a | b, 0n).toString()

const LARANJA = 0xff5b1f

class ErroDiscord extends Error {
  constructor(public estado: number, mensagem: string) { super(mensagem) }
}

/** Um pedido à API do Discord, com uma nova tentativa se houver limite de pedidos. */
async function discord<T>(metodo: string, caminho: string, corpo?: unknown, tentativa = 0): Promise<T | null> {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`,
      'Content-Type': 'application/json',
      'X-Audit-Log-Reason': 'Rangify: canais da partida',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (r.status === 429 && tentativa < 3) {
    const j = await r.json().catch(() => ({ retry_after: 1 }))
    await new Promise((res) => setTimeout(res, Math.ceil((j.retry_after ?? 1) * 1000)))
    return discord<T>(metodo, caminho, corpo, tentativa + 1)
  }
  if (r.status === 204) return null
  if (!r.ok) throw new ErroDiscord(r.status, `${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  return await r.json() as T
}

/** Apagar algo que já não existe não é erro. */
async function apagar(caminho: string) {
  try { await discord('DELETE', caminho) } catch (e) {
    if (!(e instanceof ErroDiscord && e.estado === 404)) throw e
  }
}

/** O ID do Discord de cada conta vem do login com o Discord (auth.identities). */
async function idDiscord(db: ReturnType<typeof admin>, authId: string): Promise<string | null> {
  const { data } = await db.auth.admin.getUserById(authId)
  const u = data?.user
  if (!u) return null
  const ident = u.identities?.find((i) => i.provider === 'discord')
  const d = (ident?.identity_data ?? {}) as Record<string, unknown>
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const id = d.provider_id ?? d.sub ?? ident?.id ?? meta.provider_id ?? meta.sub
  return typeof id === 'string' && /^\d{15,22}$/.test(id) ? id : null
}

async function limpar(db: ReturnType<typeof admin>, matchId: string) {
  const { data: d } = await db.from('match_discord').select('*').eq('match_id', matchId).maybeSingle()
  if (!d) return { limpo: false }
  // A criação ainda vai a meio: é ela que limpa no fim, quando vir que a partida acabou.
  if (d.estado === 'a_criar') return { limpo: false, aCriar: true }
  for (const canal of [d.voz_a_id, d.voz_b_id, d.texto_id, d.categoria_id]) if (canal) await apagar(`/channels/${canal}`)
  for (const cargo of [d.cargo_a_id, d.cargo_b_id, d.cargo_id]) if (cargo && d.guild_id) await apagar(`/guilds/${d.guild_id}/roles/${cargo}`)
  await db.from('match_discord').delete().eq('match_id', matchId)
  return { limpo: true }
}

async function criar(db: ReturnType<typeof admin>, matchId: string) {
  const guild = Deno.env.get('DISCORD_GUILD_ID')
  if (!guild) throw new Error('Falta o segredo DISCORD_GUILD_ID.')

  const { data: m } = await db.from('matches').select('id, code, map, state, automatic, captain_a, captain_b').eq('id', matchId).maybeSingle()
  if (!m || m.automatic || ['COMPLETED', 'CANCELLED'].includes(m.state)) return { criado: false }

  // Reserva a partida: se já existe uma linha, outro pedido já tratou (ou está a tratar).
  const { error: jaExiste } = await db.from('match_discord').insert({ match_id: matchId, guild_id: guild })
  if (jaExiste) return { criado: false, repetido: true }

  const { data: jogadores } = await db.from('match_players')
    .select('team, profile_id, profiles(auth_id, riot_id, username, is_bot)')
    .eq('match_id', matchId)
  const codigo: string = m.code
  const nomeCanal = codigo.toLowerCase()
  const eu = await discord<{ id: string }>('GET', '/users/@me')

  const cargo = (await discord<{ id: string }>('POST', `/guilds/${guild}/roles`, { name: codigo, color: LARANJA, permissions: '0', mentionable: false }))!.id
  const cargoA = (await discord<{ id: string }>('POST', `/guilds/${guild}/roles`, { name: `${codigo} · Team A`, color: LARANJA, permissions: '0', mentionable: true }))!.id
  const cargoB = (await discord<{ id: string }>('POST', `/guilds/${guild}/roles`, { name: `${codigo} · Team B`, color: 0xe6e1da, permissions: '0', mentionable: true }))!.id
  await db.from('match_discord').update({ cargo_id: cargo, cargo_a_id: cargoA, cargo_b_id: cargoB }).eq('match_id', matchId)

  // Os cargos a cada jogador. Quem não está no servidor do Discord fica de fora (sem erro).
  const semDiscord: string[] = []
  for (const j of jogadores ?? []) {
    const perfil = j.profiles as { auth_id: string | null; riot_id: string | null; username: string; is_bot: boolean } | null
    if (!perfil || perfil.is_bot || !perfil.auth_id || !j.team) continue
    const id = await idDiscord(db, perfil.auth_id)
    if (!id) { semDiscord.push(perfil.riot_id ?? perfil.username); continue }
    try {
      await discord('PUT', `/guilds/${guild}/members/${id}/roles/${cargo}`)
      await discord('PUT', `/guilds/${guild}/members/${id}/roles/${j.team === 'A' ? cargoA : cargoB}`)
    } catch (e) {
      if (e instanceof ErroDiscord && e.estado === 404) semDiscord.push(perfil.riot_id ?? perfil.username)
      else throw e
    }
  }

  // @everyone (o ID do cargo é o do servidor) não vê nada; o bot vê e gere.
  const base = [
    { id: guild, type: 0, allow: '0', deny: p(VER) },
    { id: eu!.id, type: 1, allow: p(VER, GERIR_CANAIS, ESCREVER, LIGAR), deny: '0' },
  ]
  // Cada ID é guardado logo que existe: se algo falhar a meio, a limpeza apaga o que ficou.
  const guardar = (campos: Record<string, string>) => db.from('match_discord').update(campos).eq('match_id', matchId)
  const categoria = (await discord<{ id: string }>('POST', `/guilds/${guild}/channels`, {
    name: codigo, type: 4,
    permission_overwrites: [...base, { id: cargo, type: 0, allow: p(VER, ESCREVER, HISTORICO), deny: '0' }],
  }))!.id
  await guardar({ categoria_id: categoria })
  const texto = (await discord<{ id: string }>('POST', `/guilds/${guild}/channels`, {
    name: `「💬」${nomeCanal}`, type: 0, parent_id: categoria,
    topic: `Chat da partida ${codigo} no Rangify. Desaparece quando a partida acabar.`,
    permission_overwrites: [...base, { id: cargo, type: 0, allow: p(VER, ESCREVER, HISTORICO), deny: '0' }],
  }))!.id
  await guardar({ texto_id: texto })
  // Toda a partida vê as duas calls, mas só a própria equipa entra em cada uma.
  const voz = async (nome: string, cargoEquipa: string) => (await discord<{ id: string }>('POST', `/guilds/${guild}/channels`, {
    name: nome, type: 2, parent_id: categoria, user_limit: 5,
    permission_overwrites: [
      ...base,
      { id: cargo, type: 0, allow: p(VER), deny: p(LIGAR) },
      { id: cargoEquipa, type: 0, allow: p(VER, LIGAR, FALAR, VOZ_AUTO), deny: '0' },
    ],
  }))!.id
  const vozA = await voz('「🔊」Team A', cargoA)
  await guardar({ voz_a_id: vozA })
  const vozB = await voz('「🔊」Team B', cargoB)
  await guardar({ voz_b_id: vozB, estado: 'criado' })

  const site = Deno.env.get('SITE_URL')
  await discord('POST', `/channels/${texto}/messages`, {
    content: [
      `**Partida ${codigo}**${m.map ? ` · ${m.map}` : ''}`,
      `<@&${cargoA}> entra na <#${vozA}> · <@&${cargoB}> entra na <#${vozB}>.`,
      'Este chat e as calls desaparecem quando a partida acabar.',
      site ? `Acompanha a partida em ${site}/jogar` : '',
      semDiscord.length ? `Sem conta no servidor (não receberam o cargo): ${semDiscord.join(', ')}.` : '',
    ].filter(Boolean).join('\n'),
    allowed_mentions: { roles: [cargoA, cargoB] },
  }).catch(() => null)

  // Se a partida acabou enquanto isto era criado, limpa já.
  const { data: agora } = await db.from('matches').select('state').eq('id', matchId).maybeSingle()
  if (!agora || ['COMPLETED', 'CANCELLED'].includes(agora.state)) return { criado: true, ...(await limpar(db, matchId)) }
  return { criado: true, semDiscord }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('Só POST.', 405)
  const segredo = Deno.env.get('DISCORD_SEGREDO')
  if (!segredo || req.headers.get('x-rangify-segredo') !== segredo) return erro('Sem autorização.', 401)
  const { tipo, matchId } = await req.json().catch(() => ({})) as { tipo?: string; matchId?: string }
  if (!matchId || (tipo !== 'criar' && tipo !== 'limpar')) return erro('Pedido inválido.')
  const db = admin()
  try {
    return resposta(tipo === 'criar' ? await criar(db, matchId) : await limpar(db, matchId))
  } catch (e) {
    console.error(e)
    // Se a criação falhou a meio, tenta não deixar lixo: apaga o que ficou registado.
    if (tipo === 'criar') {
      await db.from('match_discord').update({ estado: 'criado' }).eq('match_id', matchId)
      await limpar(db, matchId).catch(() => null)
    }
    return erro(e instanceof Error ? e.message : 'Erro no Discord.', 500)
  }
})
