// O que todas as Edge Functions que falam com a API do Discord partilham.
export const API = 'https://discord.com/api/v10'

/** O cabeçalho que identifica o bot (o token é um secret da função, nunca vai para o código). */
export const autorizacaoBot = () => `Bot ${Deno.env.get('DISCORD_BOT_TOKEN') ?? ''}`

export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))
