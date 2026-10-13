// O canal e o cargo do ping para a fila, e a mensagem com o botão.
// Os IDs não são segredos (qualquer pessoa no servidor os vê); os secrets
// DISCORD_PING_CANAL e DISCORD_PING_CARGO servem só para os trocar sem mexer no código.

export const CANAL_PING = Deno.env.get('DISCORD_PING_CANAL') ?? '1559654941952577688'
export const CARGO_PING = Deno.env.get('DISCORD_PING_CARGO') ?? '1559654502137602178'
export const BOTAO_PING = 'rangify:ping-fila'
export const SEGUNDOS_ENTRE_PINGS = 180

const EMOJI = '<:rangify:1559320107606614087>'
const ICONE = 'https://cdn.discordapp.com/emojis/1559320107606614087.png'
const BANNER = 'https://www.image2url.com/r2/default/images/1791842536598-ab980e12-da20-4f8d-a374-086da30e7a7e.png'
const LARANJA = 0xff5b1f

/** A mensagem fixa do canal: o embed com o texto e o banner, e o botão. */
export function mensagemPing() {
  const site = Deno.env.get('SITE_URL')
  return {
    embeds: [{
      title: 'Chamar para a fila',
      description: [
        `${EMOJI} Falta gente para a próxima partida? Carrega no botão e o bot avisa toda a gente que tem o cargo <@&${CARGO_PING}>, as pessoas que escolheram receber estes avisos ao entrar no servidor.`,
        '',
        '**Antes de chamares**',
        '• Entra primeiro na fila no site, para quem chega te encontrar lá.',
        '• Chama só quando estiveres mesmo para jogar.',
        '',
        '**Sem spam**',
        '• Cada pessoa só pode chamar uma vez a cada 3 minutos.',
        '• Quem abusar do botão perde o acesso a este canal.',
        '',
        'Já não queres receber estes pings? Muda as tuas respostas em **Canais e cargos**.',
      ].join('\n'),
      color: LARANJA,
      author: { name: 'Rangify Hub', icon_url: ICONE },
      image: { url: BANNER },
      footer: { text: 'Rangify · Boas partidas!', icon_url: ICONE },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: BOTAO_PING, label: 'Chamar para a fila', emoji: { name: '🔔' } },
        ...(site ? [{ type: 2, style: 5, label: 'Abrir o Rangify', url: `${site}/jogar` }] : []),
      ],
    }],
    allowed_mentions: { parse: [] },
  }
}
