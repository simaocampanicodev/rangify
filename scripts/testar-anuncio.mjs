/**
 * Testa a mensagem dos avisos do Discord (supabase/functions/_shared/discord-anuncio.ts): o padrão (barra laranja,
 * "Rangify Hub" no topo, aviso da Riot no fim), as validações e as menções. Sem rede.
 *
 *   node scripts/testar-anuncio.mjs      (corre também com npm run testar-sql)
 */
import { MAX_MENSAGEM, MAX_TITULO, RODAPE_ANUNCIO, mensagemAnuncio, validarAnuncio } from '../supabase/functions/_shared/discord-anuncio.ts'

let falhas = 0
let passos = 0
function ok(cond, texto) {
  passos++
  if (cond) console.log(`  ok  ${texto}`)
  else { falhas++; console.log(`  FALHOU  ${texto}`) }
}

console.log('\nPadrão do aviso')
const agora = new Date('2026-10-20T21:05:00Z')
const m = mensagemAnuncio({ titulo: '  Novidades ', mensagem: '  Olá, **mundo**!  ' }, agora)
const e = m.embeds[0]
ok(e.color === 0xff5b1f, 'a barra à esquerda é laranja')
ok(e.author.name === 'Rangify Hub' && e.author.icon_url.includes('1559320107606614087'), '"Rangify Hub" com o ícone no topo')
ok(e.footer.text === RODAPE_ANUNCIO && /Riot Games/.test(e.footer.text) && /não é afiliado/.test(e.footer.text), 'o rodapé diz que o hub não é afiliado com a Riot')
ok(e.footer.icon_url === e.author.icon_url && e.timestamp === '2026-10-20T21:05:00.000Z', 'o rodapé tem o ícone e a hora')
ok(e.title === 'Novidades' && e.description === 'Olá, **mundo**!', 'o título e o texto são os escritos (sem espaços a mais)')
ok(!('image' in e), 'sem imagem, o embed não leva imagem')
ok(m.content === undefined && m.allowed_mentions.parse.length === 0, 'por omissão não pinga ninguém')

console.log('\nTítulo e imagem opcionais')
const so = mensagemAnuncio({ mensagem: 'Só texto' }, agora).embeds[0]
ok(!('title' in so), 'sem título, não há título')
const img = mensagemAnuncio({ mensagem: 'x', imagem: ' https://exemplo.pt/a.png ' }, agora).embeds[0]
ok(img.image?.url === 'https://exemplo.pt/a.png', 'a imagem entra no embed')

console.log('\nMenções')
const ev = mensagemAnuncio({ mensagem: 'x', avisar: 'everyone' }, agora)
ok(ev.content === '@everyone' && ev.allowed_mentions.parse.join() === 'everyone', '@everyone pinga toda a gente')
const he = mensagemAnuncio({ mensagem: 'x', avisar: 'here' }, agora)
ok(he.content === '@here' && he.allowed_mentions.parse.join() === 'everyone', '@here pinga quem está online (o Discord trata-o como "everyone")')
const tentativa = mensagemAnuncio({ mensagem: 'olá @everyone <@&123>' }, agora)
ok(tentativa.content === undefined && tentativa.allowed_mentions.parse.length === 0, 'um @everyone escrito no texto não pinga ninguém')

console.log('\nValidação')
ok(validarAnuncio({ mensagem: 'Olá' }) === null, 'uma mensagem simples é válida')
ok(/Escreve a mensagem/.test(validarAnuncio({ mensagem: '   ' }) ?? ''), 'sem mensagem dá erro')
ok(/título/.test(validarAnuncio({ titulo: 'x'.repeat(MAX_TITULO + 1), mensagem: 'a' }) ?? ''), 'um título comprido demais dá erro')
ok(/máximo/.test(validarAnuncio({ mensagem: 'x'.repeat(MAX_MENSAGEM + 1) }) ?? ''), 'uma mensagem comprida demais dá erro')
ok(validarAnuncio({ mensagem: 'x'.repeat(MAX_MENSAGEM) }) === null, 'no limite ainda cabe')
ok(/https/.test(validarAnuncio({ mensagem: 'a', imagem: 'http://x.pt/a.png' }) ?? ''), 'a imagem tem de ser https')
ok(/https/.test(validarAnuncio({ mensagem: 'a', imagem: 'javascript:alert(1)' }) ?? ''), 'e não aceita outros esquemas')
ok(/avisar/.test(validarAnuncio({ mensagem: 'a', avisar: 'toda a gente' }) ?? ''), 'só se pode avisar ninguém, @here ou @everyone')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
