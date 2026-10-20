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
// Voltar a correr a 0032 repõe as versões antigas de estatisticas_perfil e forma_perfil: a 0038 corre outra vez por cima.
await db.exec(sql('0038_perfil_por_fila.sql'))

// A 0035 apagou a loja e a 0036 trouxe-a de volta: depois das duas, tudo o que a loja precisa existe e o registo dos convites continua.
const loja = await raiz(`select
  (select count(*)::int from pg_tables where schemaname = 'public' and tablename in ('shop_items', 'shop_inventory', 'shop_equipped', 'shop_rotation', 'coin_ledger')) as tabelas,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('loja', 'comprar_item', 'equipar_item', 'cosmeticos', 'loja_visivel', '_moedas', '_loja_hoje')) as funcoes,
  (select count(*)::int from information_schema.columns where table_schema = 'public' and ((table_name = 'profiles' and column_name = 'avatar_gif') or (table_name = 'config' and column_name = 'shop_public') or (table_name = 'coin_ledger' and column_name = 'item_id'))) as colunas,
  (select count(*)::int from shop_items) as itens`)
ok(loja[0].tabelas === 5 && loja[0].funcoes === 7 && loja[0].colunas === 3, 'depois da 0035 e da 0036 a loja existe: tabelas, funções e colunas')
ok(loja[0].itens >= 100, 'o catálogo da loja voltou (' + loja[0].itens + ' itens)')
await db.exec(sql('0036_loja_de_volta.sql'))
ok(true, 'correr a 0036 outra vez não dá erro')

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
// As estatísticas e a forma do perfil, por fila (0038).
const stR = await rpc(uids[0], 'estatisticas_perfil', { p_perfil: soRanked, p_fila: 'ranked' })
const stA = await rpc(uids[0], 'estatisticas_perfil', { p_perfil: soRanked, p_fila: 'aberta' })
ok(stR.partidas === 1 && stA.partidas === 0, 'as estatísticas filtram por fila: o jogador só jogou ranked (1 na ranked, 0 na aberta)')
ok(stR.porMapa.length === 1 && stA.porMapa.length === 0 && stA.kd === null, 'o K/D, os mapas e os agentes seguem o filtro')
ok(stR.posicaoRanked >= 1 && stR.totalRanked === 10, 'a posição na tabela não depende do filtro')
const fR = await rpc(uids[0], 'forma_perfil', { p_perfil: soRanked, p_n: 20, p_fila: 'ranked' })
const fA = await rpc(uids[0], 'forma_perfil', { p_perfil: soRanked, p_n: 20, p_fila: 'aberta' })
const fT = await rpc(uids[0], 'forma_perfil', { p_perfil: soRanked, p_n: 20 })
ok(fR.length === 1 && fA.length === 0 && fT.length === 1, 'a forma filtra por fila e, sem filtro, junta as duas')
// As estatísticas do draft (0039): vários jogadores numa só chamada, só com o que o draft mostra.
const resumo = await rpc(uids[0], 'estatisticas_resumo', { p_ids: [soRanked, pid(25)] })
const completo = await rpc(uids[0], 'estatisticas_perfil', { p_perfil: soRanked })
ok(resumo[soRanked]?.partidas === 1 && resumo[soRanked].partidas === completo.partidas && resumo[soRanked].vitorias === completo.vitorias, 'o resumo do draft bate certo com o perfil completo (partidas e vitórias)')
ok(resumo[soRanked].acs === completo.acs && resumo[soRanked].kda === completo.kda, 'e também no ACS e no KDA')
ok(resumo[pid(25)] === undefined, 'quem nunca jogou não aparece no resumo')
const muitos = await rpc(uids[0], 'estatisticas_resumo', { p_ids: Array.from({ length: 30 }, (_, i) => pid(i % 26)) })
ok(Object.keys(muitos).length <= 20, 'no máximo 20 jogadores de cada vez')
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

console.log('\nPartida ranked que cai')
{
  // Uma partida ranked em que um jogador não aceita: os outros nove voltam à fila RANKED (não à aberta).
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  await raiz(`update profiles set cooldown_until = null`)
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'entrar_fila', { p_fila: 'ranked' })
  const mr = (await rpc(uids[1], 'partida_ativa')).id
  ok((await raiz(`select fila from matches where id = $1`, [mr]))[0].fila === 'ranked', 'a partida formada na fila ranked é ranked')
  for (let i = 1; i <= 9; i++) await rpc(uids[i], 'responder_confirmacao', { p_match: mr, p_aceita: true })
  await raiz(`update matches set ready_deadline = now() - interval '1 second' where id = $1`, [mr])
  const caida = await rpc(uids[1], 'avancar_partida', { p_match: mr })
  ok(caida.estado === 'CANCELLED', 'sem a confirmação de todos a partida cai')
  const voltaram = await raiz(`select fila, count(*)::int as n from queue_entries group by fila`)
  ok(voltaram.length === 1 && voltaram[0].fila === 'ranked' && voltaram[0].n === 9, 'os nove que aceitaram voltam à fila ranked, não à aberta')
  const e1 = await rpc(uids[1], 'estado_fila')
  ok(e1.naFila && e1.fila === 'ranked' && e1.contagemRanked === 9 && e1.contagemAberta === 0, 'o estado da fila diz ranked (9) e aberta (0)')
  // Entra mais um na ranked: com 10, forma-se logo outra partida ranked, sem tocar na fila aberta.
  await raiz(`update profiles set cooldown_until = null`)
  await rpc(uids[11], 'entrar_fila', { p_fila: 'ranked' })
  const nova = await raiz(`select fila from matches where state = 'READY_CHECK' order by created_at desc limit 1`)
  ok(nova.length === 1 && nova[0].fila === 'ranked', 'com mais um jogador forma-se outra partida ranked')
  // E numa partida da fila aberta, quem aceita continua a voltar à aberta.
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'entrar_fila', { p_fila: 'aberta' })
  const ma = (await rpc(uids[1], 'partida_ativa')).id
  for (let i = 1; i <= 9; i++) await rpc(uids[i], 'responder_confirmacao', { p_match: ma, p_aceita: true })
  await raiz(`update matches set ready_deadline = now() - interval '1 second' where id = $1`, [ma])
  await rpc(uids[1], 'avancar_partida', { p_match: ma })
  const aberta = await raiz(`select fila, count(*)::int as n from queue_entries group by fila`)
  ok(aberta.length === 1 && aberta[0].fila === 'aberta' && aberta[0].n === 9, 'na fila aberta, quem aceita volta à aberta')
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  await raiz(`update profiles set cooldown_until = null`)
}

console.log('\nMenos carga na base de dados')
{
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  await raiz(`update profiles set cooldown_until = null`)
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'entrar_fila', { p_fila: 'ranked' })
  const mc = (await rpc(uids[1], 'partida_ativa')).id
  const pendente = async () => (await servico(`select public._passo_pendente($1) as v`, [mc]))[0].v
  ok((await pendente()) === false, 'uma partida acabada de formar não tem nada por cumprir (a máquina de estados nem é chamada)')
  const antes = (await raiz(`select updated_at from matches where id = $1`, [mc]))[0].updated_at
  const s0 = await rpc(uids[1], 'situacao', { p_partida: null })
  ok(s0.partida.id === mc && s0.partida.estado === 'READY_CHECK' && s0.fila.naFila === false, 'a situação devolve a fila e a partida sem a avançar')
  ok(String((await raiz(`select updated_at from matches where id = $1`, [mc]))[0].updated_at) === String(antes), 'e sem mexer na partida')
  await raiz(`update matches set ready_deadline = now() - interval '1 second' where id = $1`, [mc])
  ok((await pendente()) === true, 'com o prazo da confirmação esgotado, há algo por cumprir')
  const s1 = await rpc(uids[1], 'situacao', { p_partida: null })
  ok(s1.partida.estado === 'CANCELLED', 'a situação cumpre o prazo: a partida cai')
  ok((await pendente()) === false, 'depois de cancelada já não há nada por cumprir')
  // Bots que aceitam sozinhos: numa partida de teste, a aceitação "chega a horas" e conta como pendente.
  await raiz(`update profiles set cooldown_until = null`)
  await rpc(uids[0], 'dev_encher_fila', { p_ser_capitao: true, p_fila: 'aberta' })
  const ms = (await rpc(uids[0], 'partida_ativa')).id
  await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1 and accept_at is not null and not accepted`, [ms])
  ok((await servico(`select public._passo_pendente($1) as v`, [ms]))[0].v === true, 'a aceitação de um bot que já devia ter acontecido conta como pendente')
  await rpc(uids[0], 'avancar_partida', { p_match: ms })
  ok((await raiz(`select count(*)::int as n from match_players where match_id = $1 and not accepted`, [ms]))[0].n <= 1, 'e o avancar_partida cumpre-a')
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)

  // Uma partida só de pessoas, já no draft: o bot_move_at passado (fica sempre marcado depois de cada escolha) não conta,
  // porque o capitão da vez é uma pessoa. Foi isto que punha as perguntas dos dez jogadores em fila no mesmo bloqueio.
  await raiz(`update profiles set cooldown_until = null`)
  await raiz(`delete from queue_entries`)
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'entrar_fila', { p_fila: 'aberta' })
  const mh = (await rpc(uids[1], 'partida_ativa')).id
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'responder_confirmacao', { p_match: mh, p_aceita: true })
  await rpc(uids[1], 'situacao', { p_partida: null })
  const draft = (await raiz(`select state, automatic from matches where id = $1`, [mh]))[0]
  ok(draft.state === 'DRAFT_PHASE' && draft.automatic === false, 'com os dez a aceitar, a partida de pessoas vai para o draft')
  const pend = async () => (await servico(`select public._passo_pendente($1) as v`, [mh]))[0].v
  await raiz(`update matches set bot_move_at = now() - interval '5 seconds', phase_deadline = now() + interval '25 seconds' where id = $1`, [mh])
  ok((await pend()) === false, 'draft de pessoas com a jogada de bot "atrasada": nada por cumprir (as perguntas não bloqueiam a partida)')
  await raiz(`update matches set automatic = true where id = $1`, [mh])
  ok((await pend()) === true, 'se o capitão da vez for um bot, a jogada conta')
  await raiz(`update matches set automatic = false where id = $1`, [mh])
  await raiz(`update matches set state = 'MAP_BAN', phase_deadline = now() + interval '25 seconds', bot_move_at = now() - interval '5 seconds' where id = $1`, [mh])
  ok((await pend()) === false, 'o mesmo nos bans de mapa')
  await raiz(`update matches set phase_deadline = now() - interval '1 second' where id = $1`, [mh])
  ok((await pend()) === true, 'mas o prazo da fase esgotado conta sempre')
  const bansAntes = (await raiz(`select count(*)::int as n from match_bans where match_id = $1`, [mh]))[0].n
  const depois = await rpc(uids[1], 'situacao', { p_partida: null })
  ok(depois.partida.id === mh && (await raiz(`select count(*)::int as n from match_bans where match_id = $1`, [mh]))[0].n === bansAntes + 1, 'e a situação cumpre-o (um ban automático)')
  // Nenhuma pergunta espera na fila do bloqueio da partida: situacao e avancar_partida só tentam o bloqueio com skip locked.
  const defs = await raiz(`select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('situacao', 'avancar_partida')`)
  ok(defs.length === 2 && defs.every((d) => /for update skip locked/i.test(d.def)), 'situacao e avancar_partida nunca esperam pelo bloqueio da partida (skip locked)')
  await db.exec(sql('0041_sem_fila_na_partida.sql'))
  ok(true, 'correr a 0041 outra vez não dá erro')
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)

  await raiz(`update profiles set cooldown_until = null`)
  await raiz(`delete from queue_entries`)
}

console.log('\nSala da partida (Realtime)')
{
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  await raiz(`update profiles set cooldown_until = null`)
  for (let i = 1; i <= 10; i++) await rpc(uids[i], 'entrar_fila', { p_fila: 'ranked' })
  const msala = (await rpc(uids[1], 'partida_ativa')).id
  const pode = async (uid, topico) => (await como(uid, `select public._pode_sala($1) as v`, [topico]))[0].v
  ok((await pode(uids[1], 'partida:' + msala)) === true, 'um jogador da partida entra na sala')
  ok((await pode(uids[11], 'partida:' + msala)) === false, 'quem não joga nessa partida não entra')
  ok((await pode(uids[1], 'partida:00000000-0000-0000-0000-000000000000')) === false, 'uma partida que não existe também não')
  ok((await pode(uids[1], 'partida:x')) === false, 'nem um tópico que não é uma partida')
  await falha(anon(`select public._pode_sala('partida:x')`), 'permission denied', 'sem sessão não se pergunta')
  await db.exec(sql('0040_sala_da_partida.sql'))
  ok(true, 'correr a 0040 outra vez não dá erro (sem Realtime, só avisa)')
  await raiz(`update matches set state = 'CANCELLED', finished_at = now() where state not in ('COMPLETED', 'CANCELLED')`)
  await raiz(`delete from queue_entries`)
  await raiz(`update profiles set cooldown_until = null`)
}

console.log('\nAcessos')
await falha(anon(`select public.entrar_fila('aberta')`), 'permission denied', 'sem sessão não se entra na fila')
await falha(como(uids[1], `select public._pode_ranked(p) from profiles p limit 1`), 'permission denied', 'as regras internas não se chamam do browser')
await falha(como(uids[1], `select public._criar_partida(array[]::uuid[], 'eu', false, false, null, 'ranked')`), 'permission denied', 'nem se criam partidas à mão')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
