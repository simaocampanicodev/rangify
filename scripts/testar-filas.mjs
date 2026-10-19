/**
 * Testa as duas filas (migração 0032) num Postgres local (PGlite), sem rede: quem pode entrar na ranked,
 * uma fila de cada vez, partidas formadas dentro de cada fila, pontos e tabelas separados, a fila no overlay
 * do OBS e as ferramentas de teste.
 *
 *   node scripts/testar-filas.mjs      (corre também com npm run testar-sql)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
let falhas = 0
let passos = 0

function ok(cond, texto) {
  passos++
  if (cond) console.log(`  ok  ${texto}`)
  else { falhas++; console.log(`  FALHOU  ${texto}`) }
}

async function falha(promessa, contem, texto) {
  try {
    await promessa
    ok(false, `${texto} (devia dar erro)`)
  } catch (e) {
    ok(String(e.message).includes(contem), `${texto}: "${e.message}"`)
  }
}

async function como(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`)
    return (await tx.query(sql, params)).rows
  })
}
async function servico(sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return (await tx.query(sql, params)).rows
  })
}
async function anon(sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role anon')
    return (await tx.query(sql, params)).rows
  })
}
const raiz = async (sql, params = []) => (await db.query(sql, params)).rows
const rpc = async (uid, nome, args = {}) => {
  const chaves = Object.keys(args)
  const sql = `select public.${nome}(${chaves.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
  return (await como(uid, sql, Object.values(args)))[0]?.r
}

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to authenticated;
  create publication supabase_realtime;
`)

console.log('\nMigrações')
const migracoes = () => readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
const sql = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')
for (const f of migracoes()) await db.exec(sql(f))
ok(migracoes().includes('0032_filas_ranked.sql'), 'as migrações aplicam-se sem erros (a 0032 incluída)')
await db.exec(sql('0032_filas_ranked.sql'))
ok(true, 'correr a 0032 outra vez não dá erro')

// ------------------------------------------------------------ contas
// 0 owner (Imortal), 1..19 Ascendente 1 ou mais, 20..23 abaixo (Diamante 3 e Ouro), 24 sem rank, 25 sem Riot ID.
console.log('\nContas')
const tierDe = (i) => (i === 0 ? 24 : i < 20 ? 21 + (i % 4) : i < 24 ? 20 - (i % 3) * 3 : 0)
const uids = []
for (let i = 0; i < 26; i++) {
  const [{ id }] = await raiz(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`f${i}@teste.pt`, { name: `f${i}#0`, avatar_url: null }])
  uids.push(id)
  if (i !== 25) await raiz(`update profiles set riot_id = $1, official_tier = $2 where auth_id = $3`, [`Fila${String(i).padStart(2, '0')}#EU${i}`, tierDe(i), id])
}
await raiz(`update profiles set role = 'owner' where auth_id = $1`, [uids[0]])
const perfis = await raiz(`select id, auth_id from profiles order by created_at`)
const pid = (i) => perfis.find((p) => p.auth_id === uids[i]).id
ok(perfis.length === 26, '26 contas criadas')

// ------------------------------------------------------------ estado e regras
console.log('\nQuem pode entrar na ranked')
let e = await rpc(uids[1], 'estado_fila')
ok(e.naFila === false && e.fila === null && e.contagemAberta === 0 && e.contagemRanked === 0 && e.contagem === 0, 'o estado da fila traz as duas contagens e a fila em que estás (nenhuma)')
ok(e.rankedPermitido === true && (await rpc(uids[20], 'estado_fila')).rankedPermitido === false && (await rpc(uids[24], 'estado_fila')).rankedPermitido === false, 'rankedPermitido: Asc 1+ sim, Diamante e sem rank não')
await falha(rpc(uids[20], 'entrar_fila', { p_fila: 'ranked' }), 'Ascendente 1 ou mais', 'abaixo de Ascendente 1 não entra na ranked')
await falha(rpc(uids[24], 'entrar_fila', { p_fila: 'ranked' }), 'Ascendente 1 ou mais', 'sem rank também não')
await falha(rpc(uids[1], 'entrar_fila', { p_fila: 'casual' }), 'Escolhe a fila', 'uma fila que não existe dá erro')
await falha(rpc(uids[25], 'entrar_fila', { p_fila: 'aberta' }), 'Riot ID', 'sem Riot ID não entra em nenhuma')
await rpc(uids[20], 'entrar_fila')
e = await rpc(uids[20], 'estado_fila')
ok(e.naFila && e.fila === 'aberta' && e.contagemAberta === 1 && e.contagem === 1 && e.contagemRanked === 0, 'sem argumento entra na aberta (como a extensão e o Discord faziam)')
await rpc(uids[20], 'sair_fila')
ok(!(await rpc(uids[20], 'estado_fila')).naFila, 'sair da fila continua a funcionar')

console.log('\nUma fila de cada vez')
await rpc(uids[1], 'entrar_fila', { p_fila: 'aberta' })
await falha(rpc(uids[1], 'entrar_fila', { p_fila: 'ranked' }), 'Já estás na fila aberta', 'quem está na aberta não entra na ranked sem sair')
await rpc(uids[1], 'entrar_fila', { p_fila: 'aberta' })
ok((await rpc(uids[1], 'estado_fila')).contagemAberta === 1, 'entrar outra vez na mesma fila não duplica nada')
await rpc(uids[1], 'sair_fila')
await rpc(uids[1], 'entrar_fila', { p_fila: 'ranked' })
e = await rpc(uids[1], 'estado_fila')
ok(e.fila === 'ranked' && e.contagemRanked === 1 && e.contagemAberta === 0 && e.contagem === 1, 'depois de sair, entra na ranked')
await falha(rpc(uids[1], 'entrar_fila', { p_fila: 'aberta' }), 'Já estás na fila ranked', 'e da ranked não passa para a aberta sem sair')
e = await rpc(uids[2], 'estado_fila')
ok(e.contagem === 0 && e.contagemRanked === 1, 'quem não está em nenhuma vê a contagem da aberta em "contagem" e a da ranked à parte')

// ------------------------------------------------------------ as partidas formam-se dentro de cada fila
console.log('\nPartidas dentro de cada fila')
for (const i of [2, 3, 4, 5]) await rpc(uids[i], 'entrar_fila', { p_fila: 'ranked' })   // 5 na ranked
for (const i of [6, 7, 8, 9, 10, 11, 12, 13, 14]) await rpc(uids[i], 'entrar_fila', { p_fila: 'aberta' })   // 9 na aberta
ok((await raiz(`select count(*)::int as n from matches`))[0].n === 0, '5 na ranked e 9 na aberta: ainda não há partida (as filas não se misturam)')
e = await rpc(uids[0], 'estado_fila')
ok(e.contagemAberta === 9 && e.contagemRanked === 5, 'cada fila conta os seus')
await rpc(uids[15], 'entrar_fila', { p_fila: 'aberta' })   // a 10.ª da aberta
let ms = await raiz(`select id, fila from matches order by created_at`)
ok(ms.length === 1 && ms[0].fila === 'aberta', 'à 10.ª pessoa da aberta nasce uma partida da fila aberta')
const mAberta = ms[0].id
ok((await rpc(uids[0], 'estado_fila')).contagemRanked === 5, 'e a ranked fica como estava')
for (const i of [16, 17, 18, 19]) await rpc(uids[i], 'entrar_fila', { p_fila: 'ranked' })
await rpc(uids[0], 'entrar_fila', { p_fila: 'ranked' })
ms = await raiz(`select id, fila from matches order by created_at`)
ok(ms.length === 2 && ms[1].fila === 'ranked', 'à 10.ª pessoa da ranked nasce uma partida da fila ranked')
const mRanked = ms[1].id
const jr = await rpc(uids[1], 'partida_detalhe', { p_match: mRanked })
ok(jr.fila === 'ranked' && jr.jogadores.length === 10, 'a partida traz a fila e os 10 jogadores')
const ja = await rpc(uids[6], 'partida_detalhe', { p_match: mAberta })
ok(ja.fila === 'aberta', 'a da aberta diz que é aberta')
ok((await raiz(`select count(*)::int as n from queue_entries`))[0].n === 0, 'as duas filas ficaram vazias')

// ------------------------------------------------------------ pontos separados
console.log('\nPontos separados')
const fechar = async (match, a, b) => {
  const ids = (await raiz(`select profile_id from match_players where match_id = $1 order by profile_id`, [match])).map((r) => r.profile_id)
  await raiz(`update match_players set team = case when profile_id = any ($2::uuid[]) then 'A'::team else 'B'::team end where match_id = $1`, [match, ids.slice(0, 5)])
  await servico(`select public._fechar($1, $2, $3, null)`, [match, a, b])
  return { equipaA: ids.slice(0, 5), equipaB: ids.slice(5) }
}
const quadro = async (ids) => raiz(`select id, points, wins, losses, ranked_points, ranked_wins, ranked_losses from profiles where id = any ($1::uuid[])`, [ids])
const rk = await fechar(mRanked, 13, 8)
let q = await quadro(rk.equipaA.concat(rk.equipaB))
const ganhaR = q.filter((x) => rk.equipaA.includes(x.id))
const perdeR = q.filter((x) => rk.equipaB.includes(x.id))
ok(ganhaR.every((x) => x.ranked_points > 1000 && x.ranked_wins === 1 && x.ranked_losses === 0), 'quem ganha a ranked sobe nos pontos da ranked e soma uma vitória ranked')
ok(perdeR.every((x) => x.ranked_points < 1000 && x.ranked_losses === 1 && x.ranked_wins === 0), 'quem perde desce nos pontos da ranked')
ok(q.every((x) => x.points === 1000 && x.wins === 0 && x.losses === 0), 'e os pontos da aberta ficam intactos')
const ab = await fechar(mAberta, 13, 5)
q = await quadro(ab.equipaA.concat(ab.equipaB))
ok(q.filter((x) => ab.equipaA.includes(x.id)).every((x) => x.points > 1000 && x.wins === 1) && q.every((x) => x.ranked_points === 1000 && x.ranked_wins === 0 && x.ranked_losses === 0), 'numa partida da aberta é o contrário: mexe na aberta e deixa a ranked')
const pRanked = (await raiz(`select profile_id, points_delta, points_after from match_players where match_id = $1 order by profile_id`, [mRanked]))
const un = await raiz(`select ranked_points from profiles where id = $1`, [pRanked[0].profile_id])
ok(pRanked.every((x) => x.points_delta !== null) && un[0].ranked_points === pRanked[0].points_after, 'os pontos "depois" de cada jogador da ranked são os da ranked')
const pj = await rpc(uids[0], 'meu_perfil')
ok(typeof pj.pontosRanked === 'number' && typeof pj.vitoriasRanked === 'number' && typeof pj.derrotasRanked === 'number', 'o perfil traz os números das duas filas')

console.log('\nTabelas e posição por fila')
const tr = await rpc(uids[0], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: '', p_fila: 'ranked' })
const ta = await rpc(uids[0], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: '', p_fila: 'aberta' })
const tdef = await rpc(uids[0], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: '' })
ok(tr.total === 10 && ta.total === 10, 'cada tabela tem só quem jogou nessa fila (10 e 10)')
ok(tdef.total === 10 && tdef.linhas.every((l) => ta.linhas.some((x) => x.perfil.id === l.perfil.id)), 'sem pedir a fila, a tabela é a da aberta (como antes)')
ok(tr.linhas.every((l) => rk.equipaA.concat(rk.equipaB).includes(l.perfil.id)) && ta.linhas.every((l) => ab.equipaA.concat(ab.equipaB).includes(l.perfil.id)), 'ninguém aparece na tabela de uma fila em que não jogou')
const pontosOrdem = tr.linhas.map((l) => l.perfil.pontos)
ok(pontosOrdem.join() === [...pontosOrdem].sort((x, y) => y - x).join() && tr.linhas[0].posicao === 1, 'a tabela ranked ordena pelos pontos da ranked')
ok(tr.linhas.every((l) => l.perfil.pontos === l.perfil.pontosRanked && l.perfil.vitorias === l.perfil.vitoriasRanked && l.perfil.derrotas === l.perfil.derrotasRanked), 'na tabela ranked, "pontos", "vitórias" e "derrotas" do perfil são os da ranked')
ok(ta.linhas.every((l) => l.perfil.pontos !== l.perfil.pontosRanked || l.perfil.pontos === 1000) && ta.linhas.some((l) => l.perfil.vitorias === 1), 'na tabela aberta são os da aberta')
ok(tr.linhas.every((l) => l.forma.length === 1) && ta.linhas.every((l) => l.forma.length === 1), 'a forma de cada tabela é só das partidas dessa fila')
await falha(rpc(uids[0], 'ranking', { p_fila: 'casual' }), 'Escolhe a fila', 'a tabela de uma fila inexistente dá erro')
const so1 = ab.equipaA[0]
ok((await rpc(uids[0], 'posicao', { p_perfil: so1, p_fila: 'aberta' })) >= 1 && (await rpc(uids[0], 'posicao', { p_perfil: so1, p_fila: 'ranked' })) === 0, 'quem só jogou na aberta tem posição 0 na ranked')
ok((await rpc(uids[0], 'posicao', { p_perfil: so1 })) === (await rpc(uids[0], 'posicao', { p_perfil: so1, p_fila: 'aberta' })), 'a posição sem fila continua a ser a da aberta')
ok((await rpc(uids[0], 'total_tabela', { p_fila: 'ranked' })) === 10 && (await rpc(uids[0], 'total_tabela')) === 10, 'o total de cada tabela')

// ------------------------------------------------------------ perfil, histórico e as tabelas que juntam as duas filas
console.log('\nPerfil, histórico e as outras tabelas')
const soRanked = rk.equipaA[0]
const fp = await rpc(uids[0], 'forma_perfil', { p_perfil: soRanked, p_n: 20 })
ok(fp.length === 1 && fp[0].fila === 'ranked', 'a forma de um jogador traz a fila de cada partida')
const hist = await rpc(uids[0], 'historico', { p_perfil: soRanked, p_minhas: true, p_mapa: null, p_offset: 0 })
ok(hist.linhas.length === 1 && hist.linhas[0].fila === 'ranked', 'o histórico diz em que fila foi cada partida')
const hTodas = await rpc(uids[0], 'historico', { p_perfil: null, p_minhas: false, p_mapa: null, p_offset: 0, p_limite: 50 })
const hRanked = await rpc(uids[0], 'historico', { p_perfil: null, p_minhas: false, p_mapa: null, p_offset: 0, p_limite: 50, p_fila: 'ranked' })
const hAberta = await rpc(uids[0], 'historico', { p_perfil: null, p_minhas: false, p_mapa: null, p_offset: 0, p_limite: 50, p_fila: 'aberta' })
ok(hRanked.linhas.length >= 1 && hRanked.linhas.every((x) => x.fila === 'ranked'), 'o histórico de todas filtra pela fila ranked')
ok(hAberta.linhas.length >= 1 && hAberta.linhas.every((x) => x.fila === 'aberta'), 'e pela aberta')
ok(hRanked.linhas.length + hAberta.linhas.length === hTodas.linhas.length, 'sem filtro vêm as duas filas (as duas somam o total)')
const minhaRanked = await rpc(uids[0], 'historico', { p_perfil: soRanked, p_minhas: true, p_mapa: null, p_offset: 0, p_fila: 'ranked' })
const minhaAberta = await rpc(uids[0], 'historico', { p_perfil: soRanked, p_minhas: true, p_mapa: null, p_offset: 0, p_fila: 'aberta' })
ok(minhaRanked.linhas.length === 1 && minhaAberta.linhas.length === 0, 'o histórico de um jogador também filtra: ele só jogou ranked')
await falha(rpc(uids[0], 'historico', { p_perfil: null, p_minhas: false, p_mapa: null, p_offset: 0, p_fila: 'casual' }), 'Escolhe a fila', 'uma fila inexistente dá erro no histórico')
const st = await rpc(uids[0], 'estatisticas_perfil', { p_perfil: soRanked })
ok(st.partidas === 1 && st.posicao === 0 && st.totalJogadores === 10 && st.posicaoRanked >= 1 && st.totalRanked === 10, 'as estatísticas dão a posição na aberta (0, nunca jogou nela) e na ranked')
const niv = await rpc(uids[0], 'ranking_nivel', { p_limite: 100 })
ok(niv.length === 20 && niv.some((x) => x.perfil.id === soRanked) && niv.some((x) => x.perfil.id === ab.equipaA[0]), 'a tabela de nível junta quem jogou numa fila e quem jogou na outra')

// ------------------------------------------------------------ overlay do OBS
console.log('\nOverlay do OBS')
await raiz(`update config set streamers_public = true where id`)
const { chave } = await rpc(uids[0], 'meu_overlay')
const overlay = async (c, fila) => (await anon(fila ? `select public.overlay_dados($1, $2) as r` : `select public.overlay_dados($1) as r`, fila ? [c, fila] : [c]))[0].r
let ov = await overlay(chave)
ok(ov.filaTipo === 'ranked' && ov.estado === 'livre', 'depois de jogar a ranked, o overlay mostra a fila ranked')
const meuR = (await raiz(`select ranked_points, ranked_wins, ranked_losses, points from profiles where id = $1`, [pid(0)]))[0]
ok(ov.pontos === meuR.ranked_points && ov.vitorias === meuR.ranked_wins && ov.derrotas === meuR.ranked_losses, 'com os pontos e o registo da ranked')
ok(ov.posicao >= 1 && ov.hoje.vitorias + ov.hoje.derrotas === 1 && ov.ultima.fila === 'ranked', 'a posição, o dia e a última partida são da ranked')
const ovA = await overlay(chave, 'aberta')
ok(ovA.filaTipo === 'aberta' && ovA.pontos === 1000 && ovA.posicao === 0 && ovA.hoje.vitorias + ovA.hoje.derrotas === 0 && ovA.ultima === null, 'o endereço pode fixar a aberta: pontos 1000, sem posição, sem jogos')
ok((await overlay(chave, 'ranked')).filaTipo === 'ranked' && (await overlay(chave, 'coisa')).filaTipo === 'ranked', 'fila ranked pedida ou inválida: vale a automática')
await rpc(uids[20], 'entrar_fila', { p_fila: 'aberta' })
await raiz(`update config set streamers_public = true where id`)
const { chave: chave20 } = await (async () => { await raiz(`update profiles set role = 'dev' where id = $1`, [pid(20)]); return rpc(uids[20], 'meu_overlay') })()
ov = await overlay(chave20)
ok(ov.estado === 'fila' && ov.filaTipo === 'aberta' && ov.fila.contagem === 1, 'na fila aberta o overlay diz aberta e quantos há')
await rpc(uids[20], 'sair_fila')
await rpc(uids[5], 'entrar_fila', { p_fila: 'ranked' })
const { chave: chave5 } = await (async () => { await raiz(`update profiles set role = 'dev' where id = $1`, [pid(5)]); return rpc(uids[5], 'meu_overlay') })()
ov = await overlay(chave5)
ok(ov.estado === 'fila' && ov.filaTipo === 'ranked' && ov.fila.contagem === 1, 'na ranked, o overlay diz ranked e a contagem da ranked')
await rpc(uids[5], 'sair_fila')

// ------------------------------------------------------------ remover, definir e ferramentas de teste
console.log('\nRemover, acertar e testar')
await rpc(uids[0], 'remover_partida', { p_match: mRanked })
q = await quadro(rk.equipaA.concat(rk.equipaB))
ok(q.every((x) => x.ranked_points === 1000 && x.ranked_wins === 0 && x.ranked_losses === 0), 'remover uma partida ranked devolve os pontos da ranked')
ok((await quadro(ab.equipaA))[0].points > 1000, 'e não mexe nos da aberta')
await rpc(uids[0], 'definir_pontos', { p_perfil: pid(3), p_pontos: 1777, p_fila: 'ranked' })
const p3 = (await raiz(`select points, ranked_points from profiles where id = $1`, [pid(3)]))[0]
ok(p3.ranked_points === 1777 && p3.points === 1000, 'a staff acerta os pontos da ranked sem mexer na aberta')
await rpc(uids[0], 'definir_pontos', { p_perfil: pid(3), p_pontos: 1555 })
ok((await raiz(`select points from profiles where id = $1`, [pid(3)]))[0].points === 1555, 'sem fila, acerta os da aberta (como antes)')
await falha(rpc(uids[1], 'definir_pontos', { p_perfil: pid(3), p_pontos: 10, p_fila: 'ranked' }), 'Owner e Dev', 'um jogador normal não mexe nos pontos')
await rpc(uids[0], 'dev_encher_fila', { p_ser_capitao: true, p_fila: 'ranked' })
const sim = (await raiz(`select fila, simulated from matches order by created_at desc limit 1`))[0]
ok(sim.fila === 'ranked' && sim.simulated, 'a staff simula uma partida ranked com bots')
await falha(rpc(uids[1], 'dev_encher_fila', { p_ser_capitao: false, p_fila: 'ranked' }), 'Owner e Dev', 'as ferramentas de teste continuam só para Owner e Dev')

console.log('\nAcessos')
await falha(anon(`select public.entrar_fila('aberta')`), 'permission denied', 'sem sessão não se entra na fila')
await falha(como(uids[1], `select public._pode_ranked(p) from profiles p limit 1`), 'permission denied', 'as regras internas não se chamam do browser')
await falha(como(uids[1], `select public._criar_partida(array[]::uuid[], 'eu', false, false, null, 'ranked')`), 'permission denied', 'nem se criam partidas à mão')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
