/**
 * Testa as duas filas no modo demo (src/lib/data/local.ts), com os mesmos cenários que a SQL (testar-filas.mjs):
 * quem pode entrar na ranked, uma fila de cada vez, partidas e tabelas separadas, o overlay e as ferramentas de teste.
 *
 *   node scripts/testar-filas-demo.mjs      (corre também com npm run testar-sql)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

let falhas = 0
let passos = 0
const ok = (c, t) => { passos++; if (c) console.log(`  ok  ${t}`); else { falhas++; console.log(`  FALHOU  ${t}`) } }
async function falha(p, contem, t) {
  try { await p; ok(false, `${t} (devia dar erro)`) } catch (e) { ok(String(e.message).includes(contem), `${t}: "${e.message}"`) }
}

// O que o browser dá ao módulo: localStorage, eventos e um relógio que não segura o processo.
const memoria = new Map()
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) }
globalThis.window = { dispatchEvent() {}, addEventListener() {}, setInterval: () => 0, localStorage: globalThis.localStorage }
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail } }

const r = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/data/local.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) }, logLevel: 'error', external: ['react'],
})
const pasta = new URL('../node_modules/.cache/rangify/', import.meta.url)
mkdirSync(pasta, { recursive: true })
const ficheiro = new URL('local-filas.mjs', pasta)
writeFileSync(ficheiro, r.outputFiles[0].text)
const { dadosLocais: D } = await import(pathToFileURL(fileURLToPath(ficheiro)).href)

await D.entrarDemo()

console.log('Quem pode entrar na ranked')
let e = await D.estadoFila()
ok(e.naFila === false && e.fila === null && e.contagemAberta === 0 && e.contagemRanked === 0 && e.contagem === 0, 'o estado da fila traz as duas contagens e a fila em que estás (nenhuma)')
ok(e.rankedPermitido === true, 'a conta de demonstração (rank alto) pode usar a ranked')
await falha(D.entrarFila('casual'), 'Escolhe a fila', 'uma fila que não existe dá erro')

// Uma conta nova com rank abaixo de Ascendente 1: ainda fica bloqueada.
let bloqueada = false
for (let i = 0; i < 12 && !bloqueada; i++) {
  await D.entrarComDiscord()
  const p = await D.ligarRiotId(`Baixo${i}#EU${i}`, 'eu')
  bloqueada = p.tier < 21
}
ok(bloqueada, 'arranjei uma conta abaixo de Ascendente 1')
e = await D.estadoFila()
ok(e.rankedPermitido === false, 'rankedPermitido é falso para ela')
await falha(D.entrarFila('ranked'), 'Ascendente 1 ou mais', 'abaixo de Ascendente 1 não entra na ranked')
await D.entrarFila()
e = await D.estadoFila()
ok(e.naFila && e.fila === 'aberta' && e.contagemAberta >= 1 && e.contagemRanked === 0, 'sem argumento entra na aberta')
await D.sairFila()
ok(!(await D.estadoFila()).naFila, 'sair da fila continua a funcionar')

console.log('\nUma fila de cada vez')
await D.entrarDemo()
const abertaAntes = (await D.estadoFila()).contagemAberta
await D.entrarFila('ranked')
e = await D.estadoFila()
ok(e.naFila && e.fila === 'ranked' && e.contagemRanked >= 1 && e.contagemAberta === abertaAntes && e.contagem === e.contagemRanked, 'entra na ranked: a contagem é a da ranked e a da aberta não mexe')
await falha(D.entrarFila('aberta'), 'Já estás na fila ranked', 'da ranked não passa para a aberta sem sair')
await D.entrarFila('ranked')
ok((await D.estadoFila()).fila === 'ranked', 'entrar outra vez na mesma fila não faz nada')
await D.sairFila()
await D.entrarFila('aberta')
await falha(D.entrarFila('ranked'), 'Já estás na fila aberta', 'da aberta não passa para a ranked sem sair')
await D.sairFila()

console.log('\nPartidas e pontos separados')
const antes = await D.ranking({ fila: 'aberta', limite: 50 })
const antesR = await D.ranking({ fila: 'ranked', limite: 50 })
ok(antes.total > 0 && antesR.total > 0, 'a comunidade de exemplo já tem as duas tabelas')
ok(antesR.linhas.every((l) => l.perfil.pontos === l.perfil.pontosRanked && l.perfil.vitorias === l.perfil.vitoriasRanked), 'na tabela ranked, "pontos" e "vitórias" são os da ranked')
ok(antes.linhas.every((l) => l.perfil.pontos !== undefined && l.perfil.vitorias + l.perfil.derrotas > 0), 'a tabela aberta só tem quem jogou na aberta')
ok(antesR.linhas.every((l) => l.perfil.vitoriasRanked + l.perfil.derrotasRanked > 0 && l.perfil.tier >= 21), 'a ranked só tem quem jogou nela (e só Ascendente 1 ou mais)')
const pontosR = antesR.linhas.map((l) => l.perfil.pontos)
ok(pontosR.join() === [...pontosR].sort((a, b) => b - a).join() && antesR.linhas[0].posicao === 1, 'a tabela ranked ordena pelos pontos da ranked')

const meu = (await D.sessao()).perfilId
ok((await D.posicao(meu, 'ranked')) === 0 || (await D.posicao(meu, 'ranked')) >= 1, 'a posição na ranked responde')

await D.devEncherFila({ serCapitao: true, fila: 'ranked' })
let p = await D.partidaAtiva()
ok(p && p.fila === 'ranked' && p.jogadores.length === 10, 'a staff simula uma partida ranked com 10 jogadores')
ok(p.jogadores.every((j) => j.tier >= 21), 'todos os jogadores de uma partida ranked têm Ascendente 1 ou mais (os bots também)')
ok(p.jogadores.every((j) => Number.isInteger(j.pontos)), 'cada jogador traz os pontos da ranked')

const hoje = await D.partidas({ minhas: true })
ok(hoje.linhas.length > 0 && hoje.linhas.every((m) => m.fila === 'aberta' || m.fila === 'ranked'), 'o histórico diz a fila de cada partida')

console.log('\nOverlay do OBS')
const { chave } = await D.meuOverlay()
const ov = await D.overlayDados(chave)
ok(ov && (ov.filaTipo === 'aberta' || ov.filaTipo === 'ranked') && typeof ov.posicao === 'number', 'o overlay diz a fila e a posição nela')
const ovR = await D.overlayDados(chave, 'ranked')
const ovA = await D.overlayDados(chave, 'aberta')
ok(ovR.filaTipo === 'ranked' && ovA.filaTipo === 'aberta', 'o endereço pode fixar a fila')
ok(ovR.pontos !== ovA.pontos || ovR.vitorias !== ovA.vitorias || ovR.derrotas !== ovA.derrotas, 'e cada uma mostra os pontos e o registo da sua tabela')
ok((await D.overlayDados(chave, 'coisa')).filaTipo === ov.filaTipo, 'uma fila inválida vale a automática')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
