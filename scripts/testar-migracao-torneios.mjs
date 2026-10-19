/**
 * Testa a migração 0031 (torneios) por cima da versão anterior (picks e bans com "veto_formato", sem séries), que é
 * o que já está na base de dados de quem a correu antes: as tabelas ficam iguais às de uma instalação nova, os dados
 * que lá estavam não se perdem e as funções cujos argumentos mudaram não ficam duplicadas.
 *
 *   node scripts/testar-migracao-torneios.mjs      (corre também com npm run testar-sql)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

let falhas = 0
let passos = 0
function ok(cond, texto) {
  passos++
  if (cond) console.log(`  ok  ${texto}`)
  else { falhas++; console.log(`  FALHOU  ${texto}`) }
}

const preparar = `
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
`
const migracao = (f) => readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8')
const todas = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
const antes = todas.filter((f) => f < '0031')

/** Tudo o que a 0031 cria nas tabelas e funções de torneios, ordenado: colunas, constraints, índices e funções. */
async function impressao(db) {
  const linhas = async (sql) => (await db.query(sql)).rows.map((r) => r.l)
  return {
    colunas: await linhas(`select table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '') as l
      from information_schema.columns where table_schema = 'public' and (table_name like 'torneio%' or (table_name = 'config' and column_name = 'torneios_public')) order by 1`),
    constraints: await linhas(`select conrelid::regclass || ' ' || pg_get_constraintdef(oid) as l from pg_constraint
      where connamespace = 'public'::regnamespace and conrelid::regclass::text like 'torneio%' order by 1`),
    indices: await linhas(`select indexdef as l from pg_indexes where schemaname = 'public' and tablename like 'torneio%' order by 1`),
    funcoes: await linhas(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || pg_get_function_result(p.oid) as l
      from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like '%torneio%') order by 1`),
    grants: await linhas(`select p.proname || ' ' || coalesce(array_to_string(array(select r.rolname from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') and has_function_privilege(r.rolname, p.oid, 'execute') order by 1), ','), '') as l
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like '%torneio%' order by 1`),
  }
}

// ------------------------------------------------------------ instalação nova (para comparar)
console.log('\nInstalação nova')
const nova = new PGlite()
await nova.exec(preparar)
for (const f of todas) await nova.exec(migracao(f))
ok(true, `${todas.length} migrações aplicadas sem erros`)
const esperado = await impressao(nova)

// ------------------------------------------------------------ por cima da versão anterior
console.log('\nPor cima da versão anterior')
const db = new PGlite()
await db.exec(preparar)
for (const f of antes) await db.exec(migracao(f))
await db.exec(readFileSync(new URL('./fixtures/torneios-0031-anterior.sql', import.meta.url), 'utf8'))
ok(true, 'a versão anterior das tabelas de torneios está na base')

// Dados que já lá podiam estar: um torneio com equipas, um jogo e as estatísticas de um jogador.
const [{ id: auth }] = (await db.query(`insert into auth.users (email, raw_user_meta_data) values ('a@teste.pt', '{"name":"a#0"}') returning id`)).rows
const [{ id: perfil }] = (await db.query(`select id from profiles where auth_id = $1`, [auth])).rows
const [{ id: torneio }] = (await db.query(`insert into torneios (nome, inscricoes_ate, veto_formato) values ('Torneio antigo', now() + interval '7 days', 'ban_pick') returning id`)).rows
const [{ id: eqA }] = (await db.query(`insert into torneio_equipas (torneio_id, nome, capitao_id) values ($1, 'Equipa A', $2) returning id`, [torneio, perfil])).rows
const [{ id: eqB }] = (await db.query(`insert into torneio_equipas (torneio_id, nome, capitao_id) values ($1, 'Equipa B', $2) returning id`, [torneio, perfil])).rows
const [{ id: jogo }] = (await db.query(`insert into torneio_jogos (torneio_id, fase, grupo, ronda, ordem, rotulo, equipa_a, equipa_b, estado, mapa, veto_formato)
  values ($1, 'grupo', 1, 1, 1, 'Grupo A', $2, $3, 'concluido', 'Ascent', 'bans') returning id`, [torneio, eqA, eqB])).rows
await db.query(`insert into torneio_jogo_jogadores (jogo_id, perfil_id, equipa_id, agente, kills) values ($1, $2, $3, 'Jett', 21)`, [jogo, perfil, eqA])

let erro = null
try { await db.exec(migracao('0031_torneios.sql')) } catch (e) { erro = e }
ok(!erro, `a 0031 aplica-se sem erros${erro ? `: ${erro.message}` : ''}`)
try { await db.exec(migracao('0031_torneios.sql')) } catch (e) { erro = e }
ok(!erro, `e corre outra vez sem erros${erro ? `: ${erro.message}` : ''}`)

const obtido = await impressao(db)
for (const [parte, linhas] of Object.entries(esperado)) {
  const em = obtido[parte]
  const faltam = linhas.filter((l) => !em.includes(l))
  const sobram = em.filter((l) => !linhas.includes(l))
  ok(!faltam.length && !sobram.length, `${parte}: iguais aos de uma instalação nova${faltam.length || sobram.length ? ` (faltam: ${faltam.join(' ; ')} | a mais: ${sobram.join(' ; ')})` : ''}`)
}

console.log('\nOs dados antigos')
const [t] = (await db.query(`select nome, melhor_de from torneios where id = $1`, [torneio])).rows
ok(t.nome === 'Torneio antigo' && t.melhor_de === 1, 'o torneio fica, à melhor de 1')
const [j] = (await db.query(`select estado, mapa, melhor_de, veto_melhor_de, serie_a, serie_b from torneio_jogos where id = $1`, [jogo])).rows
ok(j.estado === 'concluido' && j.mapa === 'Ascent' && j.melhor_de === null && j.serie_a === 0 && j.serie_b === 0, 'o jogo fica, sem série')
const [x] = (await db.query(`select agente, kills, mapa_ordem from torneio_jogo_jogadores where jogo_id = $1`, [jogo])).rows
ok(x.agente === 'Jett' && x.kills === 21 && x.mapa_ordem === 1, 'as estatísticas ficam no mapa 1')
ok((await db.query(`select count(*)::int as n from torneio_equipas where torneio_id = $1`, [torneio])).rows[0].n === 2, 'as equipas ficam')

console.log('\nFunciona')
await db.query(`update profiles set role = 'owner' where id = $1`, [perfil])
const como = async (sql, params = []) => db.transaction(async (tx) => {
  await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${auth}', true);`)
  return (await tx.query(sql, params)).rows
})
const [{ r: det }] = await como(`select public.torneio_detalhe(p_torneio => $1) as r`, [torneio])
ok(det.torneio.melhorDe === 1 && det.jogos.length === 1 && det.jogos[0].melhorDe === 1 && det.jogos[0].mapas.length === 0, 'o torneio abre com o formato novo')
const quando = new Date(Date.now() + 3600e3).toISOString()
await como(`select public.torneio_agendar(p_jogo => $1, p_quando => $2, p_melhor_de => 3)`, [jogo, quando]).then(
  () => ok(false, 'um jogo já concluído não muda de formato (devia dar erro)'),
  (e) => ok(!String(e.message).includes('is not unique') && !String(e.message).includes('versão anterior'), `torneio_agendar já é a versão nova: "${e.message}"`),
)
const [{ r: novoT }] = await como(`select public.torneio_criar(p => $1::jsonb) as r`, [JSON.stringify({ nome: 'Torneio novo', inscricoesAte: quando, melhorDe: 3 })])
const [{ r: det2 }] = await como(`select public.torneio_detalhe(p_torneio => $1) as r`, [novoT])
ok(det2.torneio.melhorDe === 3, 'um torneio novo já se cria à melhor de 3')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
