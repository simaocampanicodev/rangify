/**
 * Testa a escolha do líder de uma partida e o que ele reenvia aos outros nove (src/lib/lider.ts): quem é o líder, o que
 * se envia (sem o código do grupo, as sugestões e o voto de cada um) e como cada jogador junta o que recebe ao que só ele vê.
 *
 *   node scripts/testar-lider.mjs      (corre também com npm run testar-sql)
 */
import { assinatura, eleger, fundir, precisaDePerguntar, publica } from '../src/lib/lider.ts'

let falhas = 0
let passos = 0
function ok(cond, texto) {
  passos++
  if (cond) console.log(`  ok  ${texto}`)
  else { falhas++; console.log(`  FALHOU  ${texto}`) }
}

const p = (desde, visivel = true) => [{ desde, visivel }]

console.log('\nQuem é o líder')
ok(eleger({}) === null, 'sala vazia: não há líder')
ok(eleger({ b: p(100), a: p(200) }) === 'b', 'o líder é quem está na sala há mais tempo')
ok(eleger({ b: p(100, false), a: p(200, true) }) === 'a', 'com o separador escondido não se lidera (os temporizadores adormecem)')
ok(eleger({ b: p(100, false), a: p(200, false) }) === 'b', 'se todos estão escondidos, vale o mais antigo')
ok(eleger({ b: p(100), a: p(100) }) === 'a', 'num empate decide o ID, e toda a gente chega à mesma resposta')
ok(eleger({ b: p(100), a: p(100) }) === eleger({ a: p(100), b: p(100) }), 'a ordem em que as presenças chegam não muda o líder')
ok(eleger({ a: [], b: p(5) }) === 'b', 'presenças vazias são ignoradas')
ok(eleger({ a: [{ desde: NaN, visivel: true }], b: p(5) }) === 'b', 'e as inválidas também')
ok(eleger({ a: p(100, false), b: p(300, true) }) === 'b' && eleger({ a: p(100, true), b: p(300, true) }) === 'a', 'ao esconder o separador, o líder passa para outro; ao voltar, quem está há mais tempo volta a liderar')

const partida = (extra = {}) => ({
  id: 'm1', estado: 'MAP_BAN', codigoGrupo: 'ABC123', bans: [], jogadores: [{ perfilId: 'a', aceitou: true }, { perfilId: 'b', aceitou: false }],
  sugestoes: [{ perfilId: 'a', valor: 'Bind' }], cancelamento: { votos: 3, necessarios: 7, euVotei: true, aberto: true }, prazoFase: '2026-10-20T10:00:00Z', ...extra,
})

console.log('\nO que o líder envia')
const pub = publica(partida())
ok(pub.codigoGrupo === null && pub.sugestoes.length === 0 && pub.cancelamento.euVotei === false, 'sem o código do grupo, sem as sugestões da equipa e sem o voto de quem envia')
ok(pub.cancelamento.votos === 3 && pub.cancelamento.necessarios === 7 && pub.jogadores.length === 2 && pub.prazoFase, 'e com tudo o que é de todos (votos, jogadores, prazos)')
ok(publica(partida({ cancelamento: null })).cancelamento === null, 'sem votação aberta, continua sem votação')
ok(partida().codigoGrupo === 'ABC123', 'enviar não estraga a partida do líder (é uma cópia)')

console.log('\nO que cada um faz com o que recebe')
const minha = partida({ codigoGrupo: 'XYZ789', sugestoes: [{ perfilId: 'eu', valor: 'Haven' }], cancelamento: { votos: 0, necessarios: 7, euVotei: false, aberto: true } })
const nova = fundir(pub, minha)
ok(nova.codigoGrupo === 'XYZ789' && nova.sugestoes.length === 1 && nova.sugestoes[0].valor === 'Haven', 'cada um guarda o seu código e as suas sugestões')
ok(nova.cancelamento.votos === 3 && nova.cancelamento.euVotei === false, 'recebe os votos de todos e mantém o seu próprio voto')
ok(fundir(pub, partida({ cancelamento: { votos: 1, necessarios: 7, euVotei: true, aberto: true } })).cancelamento.euVotei === true, 'se já tinha votado, continua a constar que votou')
ok(fundir(pub, null).codigoGrupo === null && fundir(pub, partida({ id: 'outra' })).sugestoes.length === 0, 'sem partida própria (ou de outra partida) não herda nada')

console.log('\nQuando perguntar à base de dados')
ok(precisaDePerguntar(pub, null) === true, 'sem estado nenhum, pergunta')
ok(precisaDePerguntar(pub, partida({ estado: 'DRAFT_PHASE' })) === true, 'fase nova: pergunta (o código e as sugestões só chegam a quem os pede)')
ok(precisaDePerguntar(pub, partida()) === false, 'mesma fase: confia no líder')
ok(precisaDePerguntar(publica(partida({ estado: 'COMPLETED' })), partida({ estado: 'COMPLETED' })) === true, 'partida acabada: pergunta (o resumo é de cada um)')
ok(precisaDePerguntar(publica(partida({ estado: 'CANCELLED' })), partida()) === true, 'partida cancelada: pergunta')

console.log('\nA impressão digital')
ok(assinatura(partida()) === assinatura(partida({ codigoGrupo: 'OUTRO', sugestoes: [] })), 'o que é pessoal não conta (senão o líder reenviava tudo a cada voto)')
ok(assinatura(partida()) !== assinatura(partida({ estado: 'LOBBY_CREATION' })) && assinatura(partida()) !== assinatura(partida({ bans: [{ mapa: 'Bind' }] })), 'mas qualquer mudança que seja de todos conta')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
