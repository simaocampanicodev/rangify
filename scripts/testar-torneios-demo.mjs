/**
 * Testa o motor dos torneios do modo demo (src/lib/dados/local-torneios.ts) com os mesmos cenários que a SQL:
 * permissões, equipas e convites, sorteio, grupos, desempates, playoffs com folgas, resultados e ferramentas de teste.
 *
 *   node scripts/testar-torneios-demo.mjs      (corre também com npm run testar-sql)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

let falhas = 0
let passos = 0
const ok = (c, t) => { passos++; if (c) console.log(`  ok  ${t}`); else { falhas++; console.log(`  FALHOU  ${t}`) } }
async function falha(p, contem, t) {
  try { await p; ok(false, `${t} (devia dar erro)`) } catch (e) { ok(String(e.message).includes(contem), `${t}: "${e.message}"`) }
}

// O que o browser dá ao módulo: localStorage e eventos.
const memoria = new Map()
globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v), removeItem: (k) => memoria.delete(k) }
globalThis.window = { dispatchEvent() {}, addEventListener() {}, localStorage: globalThis.localStorage }
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o?.detail } }

const r = await build({
  entryPoints: [new URL('../src/lib/dados/local-torneios.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', write: false,
  alias: { '@': new URL('../src', import.meta.url).pathname }, logLevel: 'error', external: ['react'],
})
// O módulo compilado vai para dentro de node_modules, para o "react" (que o idioma usa) se resolver a partir do projeto.
const pasta = new URL('../node_modules/.cache/rangify/', import.meta.url)
mkdirSync(pasta, { recursive: true })
const ficheiro = new URL('local-torneios.mjs', pasta)
writeFileSync(ficheiro, r.outputFiles[0].text)
const { criarTorneiosLocais, calendarioGrupo, ordemChaves } = await import(pathToFileURL(ficheiro.pathname).href)

// ---------------------------------------------------------------- perfis de mentira
const mk = (i, extra = {}) => ({
  id: `p${i}`, utilizador: `u${i}`, avatarUrl: null, riotId: i === 30 ? null : `Jog${String(i).padStart(2, '0')}#EU${i}`, regiao: 'eu', tier: 15, rr: null,
  rankAtualizadoEm: null, pontos: 1000, vitorias: 0, derrotas: 0, funcao: 'user', funcaoJogo: null, bot: false, cooldownAte: null, tourVistoEm: null,
  temPassword: false, criadoEm: new Date().toISOString(), ...extra,
})
const todos = Array.from({ length: 31 }, (_, i) => mk(i, i === 0 ? { funcao: 'owner' } : i === 1 ? { funcao: 'dev' } : i === 2 ? { funcao: 'mod' } : {}))
let sou = 0
let nBots = 0
const ctx = {
  async perfis() { return { eu: todos[sou], todos: [...todos] } },
  criarBot() { const b = mk(100 + nBots++, { bot: true, utilizador: `bot${nBots}`, riotId: `Bot${nBots}#BOT` }); todos.push(b); return b },
}
const D = criarTorneiosLocais(ctx)
const como = (i) => { sou = i }
const riot = (i) => todos[i].riotId
const futuro = new Date(Date.now() + 7 * 86400000).toISOString()

console.log('Calendário e chaves')
const cal = calendarioGrupo(['a', 'b', 'c', 'd'])
ok(cal.length === 6 && [1, 2, 3].every((r) => { const x = cal.filter((j) => j.ronda === r).flatMap((j) => [j.a, j.b]); return x.length === 4 && new Set(x).size === 4 }), '4 equipas: 6 jogos em 3 jornadas, cada equipa uma vez por jornada')
ok(new Set(cal.map((j) => [j.a, j.b].sort().join())).size === 6, 'sem jogos repetidos')
ok(calendarioGrupo(['a', 'b', 'c']).length === 3 && calendarioGrupo(['a', 'b', 'c', 'd', 'e']).length === 10, '3 equipas: 3 jogos; 5 equipas: 10 jogos')
ok(ordemChaves(8).join() === '1,8,4,5,2,7,3,6' && ordemChaves(4).join() === '1,4,2,3' && ordemChaves(2).join() === '1,2', 'a ordem das chaves (1v8, 4v5, 2v7, 3v6)')

console.log('\nPermissões e visibilidade')
como(3)
await falha(D.torneioCriar({ nome: 'Meu torneio', inscricoesAte: futuro }), 'Só Owner e Dev', 'um jogador não cria torneios')
como(2)
await falha(D.torneioCriar({ nome: 'Meu torneio', inscricoesAte: futuro }), 'Só Owner e Dev', 'um mod também não')
como(0)
await falha(D.torneioCriar({ nome: 'x', inscricoesAte: futuro }), 'nome', 'o torneio precisa de nome')
const T = await D.torneioCriar({ nome: 'T7 x LGW Cup', inscricoesAte: futuro, finalPresencial: true })
let d = await D.torneioDetalhe(T)
ok(d.torneio.estado === 'rascunho' && d.torneio.tamanhoGrupo === 4 && d.torneio.passamPorGrupo === 2 && d.torneio.minJogadores === 8, 'valores por defeito')
como(3)
ok((await D.torneiosLista()).length === 0 && !(await D.torneiosVisivel()), 'um jogador não vê rascunhos nem a área')
await falha(D.torneioDetalhe(T), 'Torneio não encontrado', 'nem pelo endereço')
como(0)
await D.torneioMudarEstado(T, 'inscricoes')
como(3)
ok((await D.torneiosLista()).length === 0, 'publicado mas fechado: continua escondido')
como(0)
await D.torneioAcesso(T, riot(3), true)
como(3)
ok((await D.torneiosLista()).length === 1 && await D.torneiosVisivel(), 'com acesso vê o torneio e a área')
como(0)
await D.torneioAcesso(T, riot(3), false)
await D.torneioEditar(T, { publico: true })
como(3)
ok((await D.torneiosLista()).length === 1, 'aberto a todos: vê')

console.log('\nEquipas e convites')
como(30)
await falha(D.torneioCriarEquipa(T, 'Sem Riot'), 'Riot ID', 'sem Riot ID não se cria equipa')
como(3)
const EA = await D.torneioCriarEquipa(T, 'Os Fixes')
await falha((como(4), D.torneioCriarEquipa(T, 'os fixes')), 'Já existe uma equipa', 'nome único sem maiúsculas')
como(3)
await falha(D.torneioCriarEquipa(T, 'Outra'), 'Já estás numa equipa', 'uma equipa por pessoa')
await falha((como(4), D.torneioConvidar(EA, riot(5), 'jogador')), 'Só o capitão', 'só o capitão convida')
como(3)
await falha(D.torneioConvidar(EA, 'ninguemassim', 'jogador'), 'Não encontrei', 'nome inexistente')
await falha(D.torneioConvidar(EA, 'u30', 'jogador'), 'ainda não ligou o Riot ID', 'quem não ligou o Riot ID não é convidado')
await D.torneioConvidar(EA, riot(4), 'jogador')
await D.torneioConvidar(EA, 'jog05', 'jogador')
await falha(D.torneioConvidar(EA, riot(4), 'jogador'), 'Já convidaste', 'não se convida duas vezes')
como(4)
ok((await D.meusConvitesTorneio()).length === 1, 'o convidado vê o convite')
await D.torneioResponderConvite(EA, true)
como(5)
await D.torneioResponderConvite(EA, false)
como(3)
for (const i of [5, 6]) { await D.torneioConvidar(EA, riot(i), 'jogador'); como(i); await D.torneioResponderConvite(EA, true); como(3) }
ok(!(await D.torneioDetalhe(T)).equipas[0].completa, '4 jogadores: incompleta')
await D.torneioConvidar(EA, riot(8), 'coach')
await falha(D.torneioConvidar(EA, riot(9), 'coach'), 'já tem coach', 'só um coach')
await D.torneioConvidar(EA, riot(9), 'suplente'); await D.torneioConvidar(EA, riot(10), 'suplente')
await falha(D.torneioConvidar(EA, riot(11), 'suplente'), '2 suplentes', 'só dois suplentes')
for (const i of [8, 9, 10]) { como(i); await D.torneioResponderConvite(EA, true) }
como(3)
await D.torneioConvidar(EA, riot(7), 'jogador'); como(7); await D.torneioResponderConvite(EA, true); como(3)
ok((await D.torneioDetalhe(T)).equipas[0].completa && (await D.torneioDetalhe(T)).equipas[0].membros.length === 8, '5 jogadores + coach + 2 suplentes: completa')
await falha(D.torneioConvidar(EA, riot(11), 'jogador'), '5 jogadores', 'o 6.º não cabe')
await falha(D.torneioMudarFuncao(EA, 'p3', 'suplente'), 'O capitão joga', 'o capitão não vira suplente')
await falha(D.torneioRemoverMembro(EA, 'p3'), 'O capitão não sai', 'o capitão não se remove')
como(10); await D.torneioSairEquipa(EA)
como(3); await D.torneioMudarFuncao(EA, 'p7', 'suplente')
ok(!(await D.torneioDetalhe(T)).equipas[0].completa, 'um jogador a suplente: incompleta')
await D.torneioMudarFuncao(EA, 'p7', 'jogador')
como(0)
ok((await D.torneioDetalhe(T)).equipas[0].membros.some((m) => m.estado === 'convidado') === false, 'sem convites pendentes')
como(11)
const EB = await D.torneioCriarEquipa(T, 'Os Outros')
como(12)
const EC = await D.torneioCriarEquipa(T, 'Os Terceiros')
como(11); await D.torneioConvidar(EB, riot(13), 'jogador'); como(12); await D.torneioConvidar(EC, riot(13), 'jogador')
como(13)
ok((await D.meusConvitesTorneio()).length === 2, 'dois convites')
await D.torneioResponderConvite(EB, true)
ok((await D.meusConvitesTorneio()).length === 0, 'aceitar um apaga os outros')
// Prazo
como(0)
await D.torneioEditar(T, { inscricoesAte: new Date(Date.now() - 60_000).toISOString() })
como(3)
await falha(D.torneioConvidar(EA, riot(14), 'jogador'), 'inscrições já fecharam', 'depois do prazo o capitão não convida')
await falha((como(15), D.torneioCriarEquipa(T, 'Tarde Demais')), 'não estão abertas', 'nem há inscrições novas')
como(0)
ok((await D.torneioStaffAdicionar(EA, riot(14), 'suplente')).perfilId === 'p14', 'a staff adiciona depois do prazo')
await D.torneioRemoverMembro(EA, 'p14')
await D.torneioEditar(T, { inscricoesAte: futuro })
como(11)
await D.torneioApagarEquipa(EB)

console.log('\nSorteio, jogos e resultados')
como(0)
await falha(D.torneioSortear(T), '4 equipas completas', 'com menos de 4 equipas completas não há sorteio')
const TT = await D.torneioCriar({ nome: 'Teste LGW', inscricoesAte: futuro, teste: true, publico: true, finalPresencial: true })
await D.torneioMudarEstado(TT, 'inscricoes')
ok((await D.torneioDetalhe(TT)).torneio.minJogadores === 2, 'torneio de teste: 2 jogadores para validar')
await falha(D.torneioTesteEquipas(T, 2), 'só existe em torneios de teste', 'não nos torneios a sério')
ok(await D.torneioTesteEquipas(TT, 2) === 2, '2 equipas de bots')
como(21)
const R1 = await D.torneioCriarEquipa(TT, 'Reais Um')
como(0)
ok(await D.torneioTestePreencher(R1) === 4, 'a staff enche a equipa com 4 bots')
como(22)
const R2 = await D.torneioCriarEquipa(TT, 'Reais Dois')
como(0)
await D.torneioTestePreencher(R2, true)
ok((await D.torneioDetalhe(TT)).equipas.find((e) => e.id === R2).membros.length === 8, 'e, completo, com coach e suplentes (8)')
const s1 = await D.torneioSortear(TT, 0.25)
ok(s1.grupos === 1 && s1.equipas === 4, '4 equipas: 1 grupo')
d = await D.torneioDetalhe(TT)
ok(d.torneio.estado === 'grupos' && d.jogos.length === 6 && d.jogos.every((j) => j.estado === 'pendente' && j.rotulo === 'jornada'), '6 jogos de grupo por marcar')
const ordem = (dd) => dd.equipas.map((e) => `${e.nome}:${e.grupo}:${e.ordem}`).sort().join()
const o1 = ordem(d)
await D.torneioSortear(TT, 0.25)
ok(ordem(await D.torneioDetalhe(TT)) === o1, 'a mesma seed dá o mesmo sorteio')
const g1 = (await D.torneioDetalhe(TT)).jogos[0]
await falha(D.torneioAgendar(g1.id, new Date(Date.now() + 86400000).toISOString(), 'Atlantis'), 'Mapa desconhecido', 'mapa inexistente')
await D.torneioAgendar(g1.id, new Date(Date.now() + 86400000).toISOString(), 'Lotus')
ok((await D.torneioDetalhe(TT)).jogos.find((j) => j.id === g1.id).estado === 'agendado', 'com data fica agendado')
await D.torneioAgendar(g1.id, null)
ok((await D.torneioDetalhe(TT)).jogos.find((j) => j.id === g1.id).estado === 'pendente', 'sem data volta a pendente')
const jr = (await D.torneioDetalhe(TT)).jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].sort().join() === 'Reais Dois,Reais Um')
como(21)
await falha(D.torneioAbrirJogo(jr.id, 'abc'), '6 letras', 'o código tem 6 caracteres')
await D.torneioAbrirJogo(jr.id, ' abc123 ')
ok((await D.torneioDetalhe(TT)).jogos.find((j) => j.id === jr.id).codigo === 'ABC123', 'o capitão abre o jogo: o código fica em maiúsculas')
como(23)
await falha(D.torneioAbrirJogo(jr.id, 'ZZZ999'), 'capitães', 'um jogador de fora não abre')
ok((await D.torneioDetalhe(TT)).jogos.find((j) => j.id === jr.id).codigo === null, 'quem não joga não vê o código')
como(22)
ok((await D.torneioDetalhe(TT)).jogos.find((j) => j.id === jr.id).codigo === 'ABC123', 'o capitão da outra equipa vê o código')
como(0)
const marca = async (tid, venc, perd, rv, rp) => {
  const j = (await D.torneioDetalhe(tid)).jogos.find((x) => x.fase === 'grupo' && [x.equipaA.nome, x.equipaB.nome].sort().join() === [venc, perd].sort().join())
  const a = j.equipaA.nome === venc
  await D.torneioResolverJogo(j.id, a ? rv : rp, a ? rp : rv)
}
await falha(D.torneioResolverJogo(jr.id, 13, 13), 'Empates', 'não há empates')
await falha(D.torneioResolverJogo(jr.id, 10, 8), '13 rondas', 'o vencedor tem 13')
await marca(TT, 'Reais Um', 'Reais Dois', 13, 9)
const nomes = ['Bots Alpha', 'Bots Bravo']
await marca(TT, 'Reais Um', nomes[0], 13, 10); await marca(TT, 'Reais Um', nomes[1], 13, 0)
await marca(TT, 'Reais Dois', nomes[0], 13, 8); await marca(TT, 'Reais Dois', nomes[1], 13, 9); await marca(TT, nomes[0], nomes[1], 13, 4)
d = await D.torneioDetalhe(TT)
const tb = d.classificacao[0].equipas
ok(tb.map((l) => l.nome).join() === ['Reais Um', 'Reais Dois', 'Bots Alpha', 'Bots Bravo'].join() && tb[0].vitorias === 3 && tb[1].vitorias === 2 && tb.filter((l) => l.passa).length === 2, 'tabela: Reais Um 3V, Reais Dois 2V, passam 2')
const final = d.jogos.find((j) => j.fase === 'playoff')
ok(d.torneio.estado === 'playoffs' && d.jogos.filter((j) => j.fase === 'playoff').length === 1 && final.rotulo === 'final' && final.presencial && final.origemA.posicao === 1, 'playoffs gerados sozinhos: a final (presencial)')
como(21)
await falha(D.torneioAbrirJogo(final.id, 'FINAL1'), 'presencial', 'a final presencial não abre no hub')
await falha(D.torneioResolverJogo(final.id, 2, 1), 'Só Owner e Dev', 'só a staff')
como(0)
await falha(D.torneioResolverJogo(final.id, 1, 1), 'não há empates', 'sem empates')
await D.torneioResolverJogo(final.id, 2, 1)
d = await D.torneioDetalhe(TT)
ok(d.torneio.estado === 'concluido' && d.torneio.campeao.nome === 'Reais Um', 'a staff põe 2-1 e há campeão')
await D.torneioDesfazerJogo(final.id)
ok((await D.torneioDetalhe(TT)).torneio.estado === 'playoffs' && (await D.torneioDetalhe(TT)).torneio.campeao === null, 'desfazer volta aos playoffs')

console.log('\nDesempates')
const bt = async (n, nome) => { const t = await D.torneioCriar({ nome, inscricoesAte: futuro, teste: true }); await D.torneioMudarEstado(t, 'inscricoes'); await D.torneioTesteEquipas(t, n); return t }
const tab = async (t, g = 1) => (await D.torneioDetalhe(t)).classificacao.find((c) => c.grupo === g).equipas
{
  const t3 = await bt(4, 'Empate a tres')
  await D.torneioSortear(t3, 0.4)
  await marca(t3, 'Bots Alpha', 'Bots Bravo', 13, 5); await marca(t3, 'Bots Bravo', 'Bots Charlie', 13, 10); await marca(t3, 'Bots Charlie', 'Bots Alpha', 13, 11)
  for (const x of ['Alpha', 'Bravo', 'Charlie']) await marca(t3, `Bots ${x}`, 'Bots Delta', 13, 0)
  ok((await tab(t3)).map((l) => l.nome.replace('Bots ', '')).join() === 'Alpha,Charlie,Bravo,Delta', 'empate a três: decide a diferença de rondas')
  const t5 = await bt(4, 'Confronto direto')
  await D.torneioSortear(t5, 0.7)
  await marca(t5, 'Bots Bravo', 'Bots Alpha', 14, 12); await marca(t5, 'Bots Alpha', 'Bots Charlie', 13, 0); await marca(t5, 'Bots Alpha', 'Bots Delta', 13, 0)
  await marca(t5, 'Bots Charlie', 'Bots Bravo', 13, 5); await marca(t5, 'Bots Bravo', 'Bots Delta', 13, 11); await marca(t5, 'Bots Delta', 'Bots Charlie', 13, 11)
  const f = await tab(t5)
  const w = Object.fromEntries(f.map((l) => [l.nome.replace('Bots ', ''), l]))
  ok(w.Alpha.diferenca > w.Bravo.diferenca && w.Bravo.posicao < w.Alpha.posicao && w.Delta.posicao < w.Charlie.posicao, 'confronto direto vale mais do que a diferença de rondas (Bravo > Alpha, Delta > Charlie)')
}

console.log('\nVários tamanhos')
const letras = ['A', 'B', 'C', 'D']
const lab = (j, l) => { const o = j[`origem${l}`]; return o?.tipo === 'grupo' ? `${o.posicao}${letras[o.grupo - 1]}` : '?' }
{
  const t5 = await bt(5, 'Cup 5')
  await falha(D.torneioSortear(t5), 'demasiado pequenos', '5 equipas: grupos demasiado pequenos')
  await D.torneioEditar(t5, { passamPorGrupo: 1 })
  ok((await D.torneioSortear(t5, 0.2)).grupos === 2, 'com 1 a passar: 2 grupos')
  const t8 = await bt(8, 'Cup 8')
  await D.torneioSortear(t8, -0.3)
  await falha(D.torneioEditar(t8, { tamanhoGrupo: 3 }), 'já não se muda', 'o formato não muda depois do sorteio')
  ok(await D.torneioTesteSimularTudo(t8, true) === 12, '12 jogos de grupo simulados')
  d = await D.torneioDetalhe(t8)
  const meias = d.jogos.filter((j) => j.rotulo === 'meias').sort((a, b) => a.ordem - b.ordem)
  ok(meias.length === 2 && `${lab(meias[0], 'A')}-${lab(meias[0], 'B')},${lab(meias[1], 'A')}-${lab(meias[1], 'B')}` === '1A-2B,1B-2A', '8 equipas: meias cruzadas 1A-2B e 1B-2A')
  const fin = d.jogos.find((j) => j.rotulo === 'final')
  await D.torneioResolverJogo(meias[0].id, 13, 7)
  d = await D.torneioDetalhe(t8)
  ok(d.jogos.find((j) => j.id === fin.id).equipaA?.id === meias[0].equipaA.id, 'o vencedor sobe para a final')
  await D.torneioWalkover(meias[1].id, meias[1].equipaB.id)
  d = await D.torneioDetalhe(t8)
  ok(d.jogos.find((j) => j.id === meias[1].id).como === 'walkover' && d.jogos.find((j) => j.id === meias[1].id).scoreB === 13, 'walkover 13-0')
  await D.torneioDesfazerJogo(meias[0].id)
  ok((await D.torneioDetalhe(t8)).jogos.find((j) => j.id === fin.id).equipaA === null, 'desfazer a meia tira o vencedor da final')
  await D.torneioTesteSimularTudo(t8)
  d = await D.torneioDetalhe(t8)
  ok(d.torneio.estado === 'concluido' && d.torneio.campeao && d.jogos.length === 15 && d.jogos.every((j) => j.estado === 'concluido'), '8 equipas: 15 jogos, campeão')
  await falha(D.torneioDesfazerJogo(meias[0].id), 'jogo seguinte já começou', 'com a final feita não se desfaz a meia')
}
{
  const t16 = await bt(16, 'Cup 16')
  await D.torneioSortear(t16, 0.9)
  await D.torneioTesteSimularTudo(t16, true)
  d = await D.torneioDetalhe(t16)
  const q = d.jogos.filter((j) => j.fase === 'playoff' && j.ronda === 1).sort((a, b) => a.ordem - b.ordem)
  ok(d.jogos.filter((j) => j.fase === 'grupo').length === 24 && q.length === 4 && q.map((j) => `${lab(j, 'A')}-${lab(j, 'B')}`).join() === '1A-2B,1C-2D,1B-2A,1D-2C', '16 equipas: quartos 1A-2B, 1C-2D | 1B-2A, 1D-2C')
  await D.torneioTesteSimularTudo(t16)
  d = await D.torneioDetalhe(t16)
  ok(d.torneio.estado === 'concluido' && d.jogos.length === 31, '16 equipas: 31 jogos e campeão')
  const t12 = await bt(12, 'Cup 12')
  ok((await D.torneioSortear(t12, 0.15)).grupos === 3, '12 equipas: 3 grupos')
  await D.torneioTesteSimularTudo(t12, true)
  d = await D.torneioDetalhe(t12)
  const r1 = d.jogos.filter((j) => j.fase === 'playoff' && j.ronda === 1).sort((a, b) => a.ordem - b.ordem)
  const folgas = r1.filter((j) => j.como === 'bye')
  ok(r1.length === 4 && folgas.length === 2 && folgas.map((j) => j.ordem).join() === '1,3' && folgas.every((j) => j.estado === 'concluido' && j.scoreA === null), '12 equipas: chave de 8 com 2 folgas (jogos 1 e 3)')
  const meias = d.jogos.filter((j) => j.rotulo === 'meias').sort((a, b) => a.ordem - b.ordem)
  ok(meias[0].equipaA && !meias[0].equipaB && meias[1].equipaA && !meias[1].equipaB, 'quem teve folga já está na meia-final')
  await D.torneioTesteSimularTudo(t12)
  d = await D.torneioDetalhe(t12)
  ok(d.torneio.estado === 'concluido' && d.jogos.length === 25, '12 equipas: 25 jogos e campeão')
}

console.log('\nLimpeza e testes')
{
  como(0)
  const t = await D.torneioCriar({ nome: 'Preencher', inscricoesAte: futuro, teste: true })
  await D.torneioMudarEstado(t, 'inscricoes')
  await D.torneioTesteEquipas(t, 3)
  const x = (await D.torneioDetalhe(t)).equipas.flatMap((e) => e.membros.map((m) => m.perfilId))
  ok(new Set(x).size === x.length, 'nenhum bot em duas equipas do mesmo torneio')
  await D.torneioTesteReiniciar(t)
  ok((await D.torneioDetalhe(t)).torneio.estado === 'inscricoes', 'reiniciar volta às inscrições')
  await falha(D.torneioApagar(T), 'não se apaga', 'um torneio a sério já publicado não se apaga')
  await D.torneioApagar(t)
  await falha(D.torneioDetalhe(t), 'não encontrado', 'um torneio de teste apaga-se')
  como(3)
  await falha(D.torneioTesteSimular(jr.id), 'Só Owner e Dev', 'um jogador não usa as ferramentas de teste')
}

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
