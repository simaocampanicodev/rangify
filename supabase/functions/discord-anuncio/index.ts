// Chamada pela Staff (Owner e Dev) no site: publica um aviso no canal de avisos do Discord. O corpo diz o que fazer:
//   { titulo?, mensagem, imagem?, avisar? } : publica o aviso (o bot escreve; o texto é o que a staff escreveu, dentro do
//                                              padrão do Rangify: barra laranja, "Rangify Hub" no topo e o aviso da Riot no fim);
//   { acao: 'canal' }                       : só cria o canal (ou diz qual é, se já existe).
// O canal é criado pelo bot na primeira vez (visível para o cargo Member, só de leitura) e o ID fica em config. O token do
// bot fica nos secrets do Supabase; nunca passa pelo site.
import { admin, cors, erro, resposta, utilizador } from '../_shared/comum.ts'
import { type Anuncio, mensagemAnuncio, validarAnuncio } from '../_shared/discord-anuncio.ts'

const API = 'https://discord.com/api/v10'

// Permissões do Discord (bits).
const VER = 1n << 10n
const ESCREVER = 1n << 11n
const INCORPORAR = 1n << 14n
const HISTORICO = 1n << 16n
const p = (...bits: bigint[]) => bits.reduce((a, b) => a | b, 0n).toString()

class ErroDiscord extends Error {
  constructor(public estado: number, mensagem: string) { super(mensagem) }
}

async function discord<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T | null> {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`,
      'Content-Type': 'application/json',
      'X-Audit-Log-Reason': 'Rangify: avisos',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (r.status === 204) return null
  if (!r.ok) throw new ErroDiscord(r.status, `${metodo} ${caminho}: ${r.status} ${await r.text()}`)
  return await r.json() as T
}

/** O cargo Member do servidor: pelo secret DISCORD_CARGO_MEMBER, ou pelo nome ("Member", "Membro", com ou sem enfeites). */
async function cargoMember(guild: string): Promise<string | null> {
  const dado = Deno.env.get('DISCORD_CARGO_MEMBER')
  if (dado) return dado
  const cargos = await discord<{ id: string; name: string }[]>('GET', `/guilds/${guild}/roles`) ?? []
  const limpo = (n: string) => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
  const exato = cargos.find((c) => ['member', 'members', 'membro', 'membros'].includes(limpo(c.name)))
  return (exato ?? cargos.find((c) => /member|membro/.test(limpo(c.name))))?.id ?? null
}

/** Cria o canal de avisos: o cargo Member vê e lê, ninguém escreve (só o bot). */
async function criarCanal(guild: string): Promise<{ id: string; member: boolean }> {
  const eu = await discord<{ id: string }>('GET', '/users/@me')
  const member = await cargoMember(guild)
  const bot = { id: eu!.id, type: 1, allow: p(VER, ESCREVER, INCORPORAR, HISTORICO), deny: '0' }
  const permissoes = [
    // Com o cargo Member, só quem o tem vê. Sem ele, todos veem. Em qualquer caso, ninguém escreve (só o bot).
    member
      ? { id: guild, type: 0, allow: '0', deny: p(VER, ESCREVER) }
      : { id: guild, type: 0, allow: p(VER, HISTORICO), deny: p(ESCREVER) },
    ...(member ? [{ id: member, type: 0, allow: p(VER, HISTORICO), deny: p(ESCREVER) }] : []),
    bot,
  ]
  const c = await discord<{ id: string }>('POST', `/guilds/${guild}/channels`, {
    name: '📢╺╸avisos', type: 0, topic: 'Avisos e novidades do Rangify Hub.', permission_overwrites: permissoes,
  })
  return { id: c!.id, member: !!member }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const u = await utilizador(req)
    if (!u) return erro('Tens de entrar na tua conta.', 401)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('role').eq('auth_id', u.id).maybeSingle()
    if (!perfil || !['owner', 'dev'].includes(perfil.role)) return erro('Só Owner e Dev podem fazer isto.', 403)
    if (!Deno.env.get('DISCORD_BOT_TOKEN')) return erro('O bot do Discord ainda não está configurado (falta o DISCORD_BOT_TOKEN).', 503)
    const guild = Deno.env.get('DISCORD_GUILD_ID')
    if (!guild) return erro('Falta o segredo DISCORD_GUILD_ID.', 503)

    const corpo = await req.json().catch(() => ({})) as Anuncio & { acao?: string }
    const soCanal = corpo.acao === 'canal'
    if (!soCanal) {
      const problema = validarAnuncio(corpo)
      if (problema) return erro(problema)
    }

    const { data: config } = await db.from('config').select('discord_anuncios_canal').eq('id', true).maybeSingle()
    let canal: string | null = Deno.env.get('DISCORD_ANUNCIOS_CANAL') ?? (config as { discord_anuncios_canal: string | null } | null)?.discord_anuncios_canal ?? null
    let canalCriado = false
    let semMember = false

    const garantirCanal = async () => {
      try {
        const novo = await criarCanal(guild)
        await db.from('config').update({ discord_anuncios_canal: novo.id }).eq('id', true)
        canal = novo.id
        canalCriado = true
        semMember = !novo.member
      } catch (e) {
        console.error(e)
        throw new Error(e instanceof ErroDiscord && e.estado === 403
          ? 'O bot não tem permissão para criar o canal (precisa de "Gerir canais"). Podes criá-lo à mão e pôr o ID no secret DISCORD_ANUNCIOS_CANAL.'
          : 'Não foi possível criar o canal de avisos no Discord.')
      }
    }

    if (!canal) await garantirCanal()
    if (soCanal) return resposta({ canal, canalCriado, semMember, link: `https://discord.com/channels/${guild}/${canal}` })

    const enviar = () => discord<{ id: string }>('POST', `/channels/${canal}/messages`, mensagemAnuncio(corpo))
    let msg: { id: string } | null
    try {
      msg = await enviar()
    } catch (e) {
      // O canal foi apagado no Discord: cria outro e tenta outra vez.
      if (e instanceof ErroDiscord && e.estado === 404 && !canalCriado) {
        await garantirCanal()
        msg = await enviar()
      } else throw e
    }
    return resposta({ mensagem: msg!.id, canal, canalCriado, semMember, link: `https://discord.com/channels/${guild}/${canal}/${msg!.id}` })
  } catch (e) {
    console.error(e)
    if (e instanceof ErroDiscord) {
      return erro(e.estado === 403
        ? 'O bot não tem permissão para escrever no canal de avisos (Ver canal, Enviar mensagens e Incorporar links).'
        : `O Discord recusou a mensagem (${e.estado}).`, 502)
    }
    return erro(e instanceof Error ? e.message : 'Não foi possível falar com o Discord. Tenta outra vez daqui a pouco.', 502)
  }
})
