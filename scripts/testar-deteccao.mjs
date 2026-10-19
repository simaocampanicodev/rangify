/**
 * Testa o reconhecimento de um jogo personalizado na API da Riot (supabase/functions/_shared/henrik-partida.ts),
 * que as partidas do hub e os jogos dos torneios partilham: o resultado do lado da Equipa A, as estatísticas,
 * o mapa opcional, a janela de tempo, os jogos já usados e o mínimo de jogadores em comum.
 *
 *   node scripts/testar-deteccao.mjs      (corre também com npm run testar-sql)
 */
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

const codigo = readFileSync(new URL('../supabase/functions/_shared/henrik-partida.ts', import.meta.url), 'utf8')
const { code } = await transform(codigo, { loader: 'ts', format: 'esm' })
const { encontrarPartida, lerPartida } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

let falhas = 0
let passos = 0
const ok = (c, t) => { passos++; if (c) console.log(`  ok  ${t}`); else { falhas++; console.log(`  FALHOU  ${t}`) } }

const agora = Date.now()
// Dez jogadores: P0-P4 vermelhos, P5-P9 azuis. Vermelhos ganham 13-9.
const jogador = (i, equipa) => ({
  puuid: `puuid-${i}`, name: `Jogador${i}`, tag: `T${i}`, team: equipa, character: ['Jett', 'Sage', 'Omen', 'Sova', 'Reyna'][i % 5],
  stats: { score: 4000 + i * 100, kills: 15 + i, deaths: 12, assists: 4, headshots: 20, bodyshots: 60, legshots: 5 },
})
const partida = (extra = {}) => ({
  metadata: { matchid: 'M-1', map: 'Lotus', game_start: Math.floor((agora - 25 * 60_000) / 1000), rounds_played: 22, mode: 'Custom Game', ...extra.metadata },
  players: { all_players: Array.from({ length: 10 }, (_, i) => jogador(i, i < 5 ? 'Red' : 'Blue')) },
  teams: { red: { rounds_won: 13, rounds_lost: 9 }, blue: { rounds_won: 9, rounds_lost: 13 }, ...extra.teams },
  kills: [],
})
const nossos = (equipaDosVermelhos = 'A') => Array.from({ length: 10 }, (_, i) => ({
  perfilId: `perfil-${i}`, equipa: i < 5 ? equipaDosVermelhos : equipaDosVermelhos === 'A' ? 'B' : 'A', riot_id: `Jogador${i}#T${i}`, riot_puuid: null,
}))
const desde = agora - 40 * 60_000

console.log('Deteção do jogo na API')
let r = encontrarPartida([partida()], { mapa: null, desde, nossos: nossos(), minimo: 8 })
ok(r && r.a === 13 && r.b === 9 && r.riotMatchId === 'M-1' && r.stats.length === 10, 'sem mapa marcado reconhece o jogo pelos jogadores: 13-9 para a Equipa A (vermelhos)')
ok(r.stats.find((s) => s.perfilId === 'perfil-3').agente === 'Sova' && r.stats[0].kills === 15 && r.stats[0].hsPct === 24, 'e traz as estatísticas de cada jogador (agente, kills, HS%)')
r = encontrarPartida([partida()], { mapa: null, desde, nossos: nossos('B'), minimo: 8 })
ok(r && r.a === 9 && r.b === 13, 'se a Equipa A for a azul, o resultado vem do lado dela (9-13)')
ok(!encontrarPartida([partida()], { mapa: 'Ascent', desde, nossos: nossos(), minimo: 8 }), 'com um mapa marcado diferente não é este jogo')
ok(encontrarPartida([partida()], { mapa: 'lotus', desde, nossos: nossos(), minimo: 8 }), 'com o mesmo mapa (sem maiúsculas) é')
ok(!encontrarPartida([partida()], { mapa: null, desde, nossos: nossos(), minimo: 8, excluir: ['M-1'] }), 'um jogo da API que já é de outro jogo do torneio é ignorado')
ok(!encontrarPartida([partida()], { mapa: null, desde: agora - 5 * 60_000, nossos: nossos(), minimo: 8 }), 'um jogo que começou antes da janela não conta')
ok(!encontrarPartida([partida()], { mapa: null, desde, ate: agora - 30 * 60_000, nossos: nossos(), minimo: 8 }), 'nem um que começou depois do fim da janela')

// Só 6 dos nossos 10 estão no jogo da API.
const poucos = nossos().map((n, i) => (i < 6 ? n : { ...n, riot_id: `Outro${i}#X` }))
ok(!encontrarPartida([partida()], { mapa: null, desde, nossos: poucos, minimo: 8 }), 'com 6 jogadores em comum e 8 exigidos não é este jogo')
r = encontrarPartida([partida()], { mapa: null, desde, nossos: poucos, minimo: 5 })
ok(r && r.stats.length === 6, 'com o mínimo a 5 já é (e só traz os 6 que lá estão)')
// Testes: 3 jogadores reais, mínimo 2.
const tres = [nossos()[0], nossos()[1], nossos()[7]]
r = encontrarPartida([partida()], { mapa: null, desde, nossos: tres, minimo: 2 })
ok(r && r.a === 13 && r.b === 9, 'num torneio de teste, 3 jogadores reais (2 de um lado e 1 do outro) chegam')
r = encontrarPartida([partida()], { mapa: null, desde, nossos: [nossos()[0], nossos()[1]], minimo: 8 })
ok(r && r.stats.length === 2, 'se houver menos jogadores do que o mínimo, vale o número que existe')
ok(!encontrarPartida([partida({ teams: { red: { rounds_won: 13 }, blue: { rounds_won: 13 } } })], { mapa: null, desde, nossos: nossos(), minimo: 8 }), 'um jogo sem vencedor (13-13) ainda não conta')
ok(!encontrarPartida([], { mapa: null, desde, nossos: nossos(), minimo: 8 }), 'uma lista vazia não encontra nada')
// Vários jogos: apanha o certo.
const outro = partida({ metadata: { matchid: 'M-0' } })
outro.players.all_players.forEach((p, i) => { p.puuid = `x-${i}`; p.name = `Estranho${i}`; p.tag = 'X' })
r = encontrarPartida([outro, partida()], { mapa: null, desde, nossos: nossos(), minimo: 8 })
ok(r && r.riotMatchId === 'M-1', 'numa lista com um jogo de outros jogadores apanha o das nossas equipas')
const lido = lerPartida(partida())
ok(lido.jogadores.length === 10 && lido.rondasPorCor.red === 13, 'lerPartida continua a ler as rondas por cor e os jogadores')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
