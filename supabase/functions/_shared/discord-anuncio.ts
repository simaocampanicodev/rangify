// A mensagem dos avisos do Rangify no Discord: o que a staff escreve entra num embed com o padrão de sempre
// (barra laranja à esquerda, "Rangify Hub" com o ícone no topo e, no fim, o aviso de que o hub não é afiliado com a
// Riot). Sem imports, para se poder testar fora do Deno (scripts/testar-anuncio.mjs).

const ICONE = 'https://cdn.discordapp.com/emojis/1559320107606614087.png'
const LARANJA = 0xff5b1f

/** O texto do rodapé: lê-se em todos os avisos. */
export const RODAPE_ANUNCIO = 'Rangify Hub é um projeto independente: não é afiliado, desenvolvido nem apoiado pela Riot Games.'

export const MAX_TITULO = 256
export const MAX_MENSAGEM = 4000

export type Avisar = 'nao' | 'everyone' | 'here'

export interface Anuncio { titulo?: string; mensagem?: string; imagem?: string; avisar?: Avisar }

/** Os erros de um aviso (em português, para o site os mostrar tal e qual); null se estiver tudo certo. */
export function validarAnuncio(a: Anuncio): string | null {
  const titulo = (a.titulo ?? '').trim()
  const mensagem = (a.mensagem ?? '').trim()
  const imagem = (a.imagem ?? '').trim()
  if (!mensagem) return 'Escreve a mensagem do aviso.'
  if (titulo.length > MAX_TITULO) return `O título tem no máximo ${MAX_TITULO} caracteres.`
  if (mensagem.length > MAX_MENSAGEM) return `A mensagem tem no máximo ${MAX_MENSAGEM} caracteres (tem ${mensagem.length}).`
  if (imagem && !/^https:\/\/[^\s]+$/i.test(imagem)) return 'A imagem tem de ser um link https.'
  if (a.avisar && !['nao', 'everyone', 'here'].includes(a.avisar)) return 'Escolhe como avisar: ninguém, @everyone ou @here.'
  return null
}

/** O corpo do pedido ao Discord para publicar um aviso. */
export function mensagemAnuncio(a: Anuncio, agora = new Date()) {
  const titulo = (a.titulo ?? '').trim()
  const imagem = (a.imagem ?? '').trim()
  const avisar = a.avisar ?? 'nao'
  return {
    content: avisar === 'everyone' ? '@everyone' : avisar === 'here' ? '@here' : undefined,
    embeds: [{
      author: { name: 'Rangify Hub', icon_url: ICONE },
      ...(titulo ? { title: titulo } : {}),
      description: (a.mensagem ?? '').trim(),
      color: LARANJA,
      ...(imagem ? { image: { url: imagem } } : {}),
      footer: { text: RODAPE_ANUNCIO, icon_url: ICONE },
      timestamp: agora.toISOString(),
    }],
    // Só com @everyone ou @here é que a mensagem pinga alguém; o resto do texto nunca pinga.
    allowed_mentions: { parse: avisar === 'nao' ? [] : ['everyone'] },
  }
}
