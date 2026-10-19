// Chamada pela Staff (Owner e Dev) no site: publica a mensagem do bot num dos canais, ou atualiza a
// que já lá está (o id fica em config). O corpo diz qual:
//   { canal: 'ping' } (ou vazio): canal de ping, com o botão "Chamar para a fila";
//   { canal: 'fila' }            : canal da fila aberta, com a contagem e os botões "Entrar na fila aberta" e "Abrir o site";
//   { canal: 'fila-ranked' }     : canal da fila ranked (só quem tem o cargo Ranked o vê), com o mesmo;
//   { canal: 'cargos' }          : acerta o cargo Ranked de toda a gente pelo rank oficial (Ascendente 1 ou mais).
// O token do bot fica nos secrets do Supabase; nunca passa pelo site.
import { admin, cors, erro, resposta, utilizador } from '../_shared/comum.ts'
import { sincronizarCargoRanked } from '../_shared/discord-cargo.ts'
import { CANAL_FILA, CANAL_FILA_RANKED, CANAL_PING, filaAtual, mensagemFila, mensagemPing } from '../_shared/discord-ping.ts'

const API = 'https://discord.com/api/v10'

async function discord(metodo: string, caminho: string, corpo?: unknown) {
  return fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`,
      'Content-Type': 'application/json',
      'X-Audit-Log-Reason': 'Rangify: mensagem da fila',
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
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

    const { canal } = await req.json().catch(() => ({})) as { canal?: string }
    if (canal === 'cargos') {
      try {
        return resposta({ cargos: await sincronizarCargoRanked(db) })
      } catch (e) {
        console.error(e)
        return erro(e instanceof Error ? e.message : 'Não foi possível acertar os cargos.', 502)
      }
    }
    const aberta = canal === 'fila'
    const ranked = canal === 'fila-ranked'
    const canalId = ranked ? CANAL_FILA_RANKED : aberta ? CANAL_FILA : CANAL_PING
    const coluna = ranked ? 'discord_fila_ranked_message' : aberta ? 'discord_fila_message' : 'discord_ping_message'
    const nome = ranked ? 'da fila ranked' : aberta ? 'da fila aberta' : 'de ping'

    const { data: config } = await db.from('config').select(coluna).eq('id', true).maybeSingle()
    const mensagem = ranked ? mensagemFila(await filaAtual(db, 'ranked'), 'ranked')
      : aberta ? mensagemFila(await filaAtual(db, 'aberta'), 'aberta') : mensagemPing()
    const antiga: string | null = (config as Record<string, string | null> | null)?.[coluna] ?? null

    // Se a mensagem já existe, só a atualiza (os botões continuam os mesmos).
    if (antiga) {
      const r = await discord('PATCH', `/channels/${canalId}/messages/${antiga}`, mensagem)
      if (r.ok) return resposta({ mensagem: antiga, editada: true })
      if (r.status !== 404) {
        console.error('Discord', r.status, await r.text())
        return erro(`O Discord recusou atualizar a mensagem (${r.status}). Confirma as permissões do bot no canal.`, 502)
      }
    }
    const r = await discord('POST', `/channels/${canalId}/messages`, mensagem)
    if (!r.ok) {
      const texto = await r.text()
      console.error('Discord', r.status, texto)
      return erro(r.status === 403
        ? `O bot não tem permissão para escrever no canal ${nome} (Ver canal, Enviar mensagens, Inserir links e Incorporar links).`
        : `O Discord recusou a mensagem (${r.status}).`, 502)
    }
    const nova = (await r.json()) as { id: string }
    await db.from('config').update({ [coluna]: nova.id }).eq('id', true)
    return resposta({ mensagem: nova.id, editada: false })
  } catch (e) {
    console.error(e)
    return erro('Não foi possível falar com o Discord. Tenta outra vez daqui a pouco.', 502)
  }
})
