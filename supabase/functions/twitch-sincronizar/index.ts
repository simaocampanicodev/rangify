// Chamada pela base de dados (pg_cron + pg_net) a cada minuto: vê na Twitch quem dos jogadores com o canal
// ligado está em direto e guarda-o em twitch_contas. O site mostra "AO VIVO" e o botão da live a partir daí.
// Autenticada pelo mesmo segredo partilhado do Discord (DISCORD_SEGREDO), não por um utilizador.
import { admin, erro, resposta } from '../_shared/comum.ts'
import { sincronizarLives, twitchConfigurada } from '../_shared/twitch.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('Só POST.', 405)
  const segredo = Deno.env.get('DISCORD_SEGREDO')
  if (!segredo || req.headers.get('x-rangify-segredo') !== segredo) return erro('Sem autorização.', 401)
  if (!twitchConfigurada()) return erro('Faltam os segredos TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET.', 503)
  try {
    return resposta(await sincronizarLives(admin()))
  } catch (e) {
    console.error(e)
    return erro('Não foi possível ver as lives na Twitch.', 502)
  }
})
