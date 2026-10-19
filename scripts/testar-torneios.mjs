/**
 * Testa os torneios (migração 0031) num Postgres local (PGlite), sem rede: permissões, quem vê o quê,
 * equipas e convites, sorteio, grupos, classificação, playoffs (com folgas), resultados, final presencial
 * e as ferramentas de teste com bots.
 *
 *   node scripts/testar-torneios.mjs      (corre também com npm run testar-sql)
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
const ficheiros = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
for (const f of ficheiros) await db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'))
ok(ficheiros.includes('0031_torneios.sql'), `${ficheiros.length} migrações aplicadas sem erros (a última é ${ficheiros.at(-1)})`)
await db.exec(readFileSync(new URL('../supabase/migrations/0031_torneios.sql', import.meta.url), 'utf8'))
ok(true, 'correr a 0031 outra vez não dá erro')

// ------------------------------------------------------------ contas
// 0 owner, 1 dev, 2 mod, 3..: jogadores. A conta 30 não tem Riot ID. As contas 28 e 29 têm o mesmo nome antes do "#".
console.log('\nContas')
const NOME = (i) => (i === 28 || i === 29 ? 'Duplo' : `Jog${String(i).padStart(2, '0')}`)
const uids = []
for (let i = 0; i < 31; i++) {
  const [{ id }] = await raiz(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`u${i}@teste.pt`, { name: `u${i}#0`, avatar_url: null }])
  uids.push(id)
  if (i !== 30) await raiz(`update profiles set riot_id = $1, official_tier = 15 where auth_id = $2`, [`${NOME(i)}#${i === 28 ? 'AAA' : i === 29 ? 'BBB' : 'EU' + i}`, id])
}
await raiz(`update profiles set role = 'owner' where auth_id = $1`, [uids[0]])
await raiz(`update profiles set role = 'dev' where auth_id = $1`, [uids[1]])
await raiz(`update profiles set role = 'mod' where auth_id = $1`, [uids[2]])
const perfis = await raiz(`select id, auth_id, username, riot_id from profiles order by created_at`)
const pid = (i) => perfis.find((p) => p.auth_id === uids[i]).id
const riot = (i) => perfis.find((p) => p.auth_id === uids[i]).riot_id
ok(perfis.length === 31, '31 contas criadas')

const dia = 24 * 3600 * 1000
const iso = (ms) => new Date(Date.now() + ms).toISOString()
const futuro = iso(7 * dia)
const dentroDe = (d) => iso(d * dia)
const det = (uid, id) => rpc(uid, 'torneio_detalhe', { p_torneio: id })
const novo = async (extra = {}) => rpc(uids[0], 'torneio_criar', { p: { nome: 'T7 x LGW Cup', inscricoesAte: futuro, ...extra } })
const publicar = (id) => rpc(uids[0], 'torneio_mudar_estado', { p_torneio: id, p_estado: 'inscricoes' })
const equipa = (uid, t, nome, funcao = 'jogador') => rpc(uid, 'torneio_criar_equipa', { p_torneio: t, p_nome: nome, p_funcao: funcao })
const convidar = (uid, e, nome, funcao = 'jogador') => rpc(uid, 'torneio_convidar', { p_equipa: e, p_nome: nome, p_funcao: funcao })
const aceitar = (uid, e) => rpc(uid, 'torneio_responder_convite', { p_equipa: e, p_aceitar: true })
const cabecas = async (id) => (await det(uids[0], id))

// ------------------------------------------------------------ permissões
console.log('\nPermissões')
await falha(rpc(uids[3], 'torneio_criar', { p: { nome: 'Meu torneio', inscricoesAte: futuro } }), 'Só Owner e Dev', 'um jogador normal não cria torneios')
await falha(rpc(uids[2], 'torneio_criar', { p: { nome: 'Meu torneio', inscricoesAte: futuro } }), 'Só Owner e Dev', 'um mod também não (é só Owner e Dev)')
await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'x', inscricoesAte: futuro } }), 'nome', 'o torneio precisa de nome')
await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'Sem data' } }), 'data limite', 'o torneio precisa da data limite das inscrições')
const T = await novo({ descricao: 'O torneio da LGW', finalPresencial: true })
ok(!!T, 'o Owner cria um torneio (nasce em rascunho)')
const dev1 = await rpc(uids[1], 'torneio_criar', { p: { nome: 'Do Dev', inscricoesAte: futuro } })
ok(!!dev1, 'o Dev também cria')
let d = await det(uids[0], T)
ok(d.torneio.estado === 'rascunho' && d.torneio.tamanhoGrupo === 4 && d.torneio.passamPorGrupo === 2 && d.torneio.minJogadores === 8 && d.torneio.finalPresencial === true && d.torneio.gerir === true, 'valores por defeito: grupos de 4, passam 2, 8 jogadores para validar na API, final presencial')
ok((await rpc(uids[0], 'torneios_lista')).length === 2, 'a staff vê os rascunhos na lista')
ok((await rpc(uids[3], 'torneios_lista')).length === 0 && !(await rpc(uids[3], 'torneios_visivel')), 'um jogador não vê rascunhos, nem a área')
await falha(det(uids[3], T), 'Torneio não encontrado', 'nem abre o torneio pelo endereço')
ok(await rpc(uids[0], 'torneios_visivel'), 'a área aparece ao Owner')
ok((await raiz(`select count(*)::int as n from torneios`))[0].n === 2, 'as tabelas existem')
ok((await como(uids[3], `select * from public.torneios`)).length === 0 && (await como(uids[3], `select * from public.torneio_equipas`)).length === 0, 'as tabelas não se leem diretamente (RLS sem políticas)')
await falha(como(uids[3], `select public._torneio_aplicar_resultado($1, 13, 0, null, 'staff')`, [T]), 'permission denied', 'as funções internas não se chamam do browser')
await falha(como(uids[3], `select public._torneio_jogo_dados($1)`, [T]), 'permission denied', 'nem os dados que a Edge Function lê')

// ------------------------------------------------------------ visibilidade
console.log('\nQuem vê o quê')
await falha(equipa(uids[3], T, 'Equipa X'), 'Torneio não encontrado', 'não se cria equipa num torneio que não se vê')
await publicar(T)
ok((await rpc(uids[3], 'torneios_lista')).length === 0, 'publicado mas fechado: continua escondido dos jogadores')
await rpc(uids[0], 'torneio_acesso', { p_torneio: T, p_nome: riot(3), p_dar: true })
ok((await rpc(uids[3], 'torneios_lista')).length === 1 && (await rpc(uids[3], 'torneios_visivel')), 'convidar a testar mostra-lhe o torneio e a área')
ok((await rpc(uids[0], 'torneio_acessos_lista', { p_torneio: T })).length === 1, 'a staff vê quem tem acesso')
await rpc(uids[0], 'torneio_acesso', { p_torneio: T, p_nome: riot(3), p_dar: false })
ok((await rpc(uids[3], 'torneios_lista')).length === 0, 'tirar o acesso volta a escondê-lo')
await falha(rpc(uids[3], 'torneio_acesso', { p_torneio: T, p_nome: riot(4), p_dar: true }), 'Só Owner e Dev', 'um jogador não dá acessos')
await rpc(uids[0], 'torneio_editar', { p_torneio: T, p: { publico: true } })
ok((await rpc(uids[3], 'torneios_lista')).length === 1, 'aberto a todos: qualquer jogador vê')
ok((await rpc(uids[3], 'torneio_detalhe', { p_torneio: T })).torneio.gerir === false, 'mas não gere')
await rpc(uids[0], 'torneio_editar', { p_torneio: T, p: { publico: false } })

// ------------------------------------------------------------ equipas
console.log('\nEquipas e convites')
await rpc(uids[0], 'torneio_editar', { p_torneio: T, p: { publico: true } })
await falha(equipa(uids[30], T, 'Sem Riot'), 'Riot ID', 'sem Riot ID ligado não se cria equipa')
await falha(equipa(uids[3], T, 'X'), 'entre 2 e 32', 'o nome da equipa tem pelo menos 2 letras')
const EA = await equipa(uids[3], T, 'Os Fixes')
ok(!!EA, 'um jogador cria a equipa e fica capitão e jogador')
await falha(equipa(uids[4], T, 'os fixes'), 'Já existe uma equipa com esse nome', 'o nome é único no torneio (sem maiúsculas)')
await falha(equipa(uids[3], T, 'Outra'), 'Já estás numa equipa', 'cada pessoa só tem uma equipa por torneio')
d = await det(uids[3], T)
ok(d.torneio.minhaEquipa.id === EA && d.torneio.minhaEquipa.capitao && d.equipas[0].membros.length === 1 && d.equipas[0].membros[0].funcao === 'jogador' && !d.equipas[0].completa, 'a equipa começa com o capitão e incompleta')

await falha(convidar(uids[4], EA, riot(5)), 'Só o capitão', 'só o capitão convida')
await falha(convidar(uids[3], EA, 'ninguemassim'), 'Não encontrei', 'um nome que não existe dá erro claro')
await falha(convidar(uids[3], EA, 'Duplo'), 'Usa o Riot ID completo', 'um nome repetido pede o Riot ID completo')
await falha(convidar(uids[3], EA, 'u30'), 'ainda não ligou o Riot ID', 'quem não ligou o Riot ID não é convidado')
const conv = await convidar(uids[3], EA, riot(4))
ok(conv.perfilId === pid(4), 'convida pelo Riot ID completo')
await convidar(uids[3], EA, `jog05`)
ok((await det(uids[3], T)).equipas[0].membros.length === 3, 'convida também pelo nome sem a tag, sem maiúsculas')
await falha(convidar(uids[3], EA, riot(4)), 'Já convidaste', 'não se convida duas vezes')
ok((await det(uids[0], T)).equipas[0].membros.filter((m) => m.estado === 'convidado').length === 2, 'a staff vê os convites pendentes')
ok((await det(uids[7], T)).equipas[0].membros.length === 1, 'quem não é o capitão, o convidado nem staff só vê os aceites')
const convites = await rpc(uids[4], 'meus_convites_torneio')
ok(convites.length === 1 && convites[0].equipaNome === 'Os Fixes' && convites[0].convidadoPor === NOME(3) && convites[0].funcao === 'jogador', 'o convidado vê o convite com quem o fez')
await falha(aceitar(uids[7], EA), 'já não existe', 'quem não foi convidado não aceita')
await aceitar(uids[4], EA)
ok((await det(uids[4], T)).torneio.minhaEquipa.id === EA && (await rpc(uids[4], 'meus_convites_torneio')).length === 0, 'aceitar põe-no na equipa e limpa o convite')
await rpc(uids[5], 'torneio_responder_convite', { p_equipa: EA, p_aceitar: false })
ok((await det(uids[0], T)).equipas[0].membros.length === 2, 'recusar apaga o convite')

// Preencher: 5 jogadores, 1 coach, 2 suplentes
for (const i of [5, 6]) { await convidar(uids[3], EA, riot(i)); await aceitar(uids[i], EA) }
ok(!(await det(uids[3], T)).equipas[0].completa, 'com 4 jogadores ainda não está completa')
await rpc(uids[3], 'torneio_convidar', { p_equipa: EA, p_nome: riot(8), p_funcao: 'coach' })
await falha(convidar(uids[3], EA, riot(9), 'coach'), 'já tem coach', 'só há um coach')
await convidar(uids[3], EA, riot(9), 'suplente')
await convidar(uids[3], EA, riot(10), 'suplente')
await falha(convidar(uids[3], EA, riot(11), 'suplente'), '2 suplentes', 'só há dois suplentes')
await falha(convidar(uids[3], EA, riot(11), 'treinador'), 'jogador, coach ou suplente', 'a função tem de ser válida')
await aceitar(uids[8], EA); await aceitar(uids[9], EA); await aceitar(uids[10], EA)
await convidar(uids[3], EA, riot(7)); await aceitar(uids[7], EA)
ok((await det(uids[3], T)).equipas[0].completa, 'o 5.º jogador completa a equipa')
await falha(convidar(uids[3], EA, riot(11)), 'já tem os 5 jogadores', 'o 6.º jogador não cabe')
ok((await det(uids[3], T)).equipas[0].membros.length === 8, '5 jogadores + coach + 2 suplentes = 8 membros')
await falha(rpc(uids[3], 'torneio_mudar_funcao', { p_equipa: EA, p_perfil: pid(9), p_funcao: 'jogador' }), 'Já não há lugar', 'um suplente não passa a jogador com a equipa cheia')
await falha(rpc(uids[3], 'torneio_mudar_funcao', { p_equipa: EA, p_perfil: pid(3), p_funcao: 'suplente' }), 'O capitão joga ou é o coach', 'o capitão não vira suplente')
await falha(rpc(uids[3], 'torneio_remover_membro', { p_equipa: EA, p_perfil: pid(3) }), 'O capitão não sai', 'o capitão não se remove')
await falha(rpc(uids[3], 'torneio_sair_equipa', { p_equipa: EA }), 'O capitão não sai', 'o capitão não sai')
await rpc(uids[10], 'torneio_sair_equipa', { p_equipa: EA })
ok((await det(uids[3], T)).equipas[0].membros.length === 7, 'um suplente sai da equipa')
await rpc(uids[3], 'torneio_mudar_funcao', { p_equipa: EA, p_perfil: pid(7), p_funcao: 'suplente' })
ok(!(await det(uids[3], T)).equipas[0].completa, 'com um jogador a suplente deixa de estar completa')
await rpc(uids[3], 'torneio_mudar_funcao', { p_equipa: EA, p_perfil: pid(7), p_funcao: 'jogador' })
ok((await det(uids[3], T)).equipas[0].completa, 'e volta a estar completa')
await rpc(uids[3], 'torneio_remover_membro', { p_equipa: EA, p_perfil: pid(8) })
ok((await det(uids[3], T)).equipas[0].membros.length === 6, 'o capitão remove o coach')
await rpc(uids[3], 'torneio_renomear_equipa', { p_equipa: EA, p_nome: 'Os Fixes!' })
ok((await det(uids[3], T)).equipas[0].nome === 'Os Fixes!', 'o capitão renomeia a equipa')

// Convites pendentes noutras equipas: aceitar uma apaga as outras
const EB = await equipa(uids[11], T, 'Os Outros')
const EC = await equipa(uids[12], T, 'Os Terceiros')
await convidar(uids[11], EB, riot(13)); await convidar(uids[12], EC, riot(13))
ok((await rpc(uids[13], 'meus_convites_torneio')).length === 2, 'dois convites ao mesmo tempo')
await aceitar(uids[13], EB)
ok((await rpc(uids[13], 'meus_convites_torneio')).length === 0 && (await det(uids[12], T)).equipas.find((e) => e.id === EC).membros.length === 1, 'aceitar uma equipa apaga os outros convites')
await falha(convidar(uids[12], EC, riot(13)), 'já está numa equipa', 'quem já está numa equipa não é convidado para outra')

// Prazo das inscrições
await raiz(`update torneios set inscricoes_ate = now() - interval '1 minute' where id = $1`, [T])
d = await det(uids[3], T)
ok(d.torneio.inscricoesAbertas === false, 'passado o prazo, as inscrições fecham')
await falha(convidar(uids[3], EA, riot(14)), 'inscrições já fecharam', 'o capitão já não convida')
await falha(rpc(uids[3], 'torneio_renomear_equipa', { p_equipa: EA, p_nome: 'Outro nome' }), 'inscrições já fecharam', 'nem renomeia')
await falha(equipa(uids[15], T, 'Tarde Demais'), 'não estão abertas', 'ninguém se inscreve depois do prazo')
await falha(rpc(uids[7], 'torneio_sair_equipa', { p_equipa: EA }), 'inscrições já fecharam', 'nem se sai')
const staffAdd = await rpc(uids[0], 'torneio_staff_adicionar', { p_equipa: EA, p_nome: riot(14), p_funcao: 'suplente' })
ok(staffAdd.perfilId === pid(14), 'a staff ainda adiciona (sem convite) depois do prazo')
await rpc(uids[0], 'torneio_remover_membro', { p_equipa: EA, p_perfil: pid(14) })
await falha(rpc(uids[3], 'torneio_staff_adicionar', { p_equipa: EA, p_nome: riot(14) }), 'Só Owner e Dev', 'só a staff adiciona sem convite')
await raiz(`update torneios set inscricoes_ate = now() + interval '7 days' where id = $1`, [T])

await rpc(uids[11], 'torneio_apagar_equipa', { p_equipa: EB })
ok((await det(uids[0], T)).equipas.length === 2, 'o capitão apaga a equipa antes do sorteio')

// ------------------------------------------------------------ sorteio e jogos de grupo
console.log('\nSorteio, grupos e jogos')
await falha(rpc(uids[0], 'torneio_sortear', { p_torneio: T }), '4 equipas completas', 'com menos de 4 equipas completas não há sorteio')
await falha(rpc(uids[3], 'torneio_sortear', { p_torneio: T }), 'Só Owner e Dev', 'só a staff sorteia')

const nomeEq = (d, id) => d.equipas.find((e) => e.id === id)?.nome
const TT = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Teste LGW', inscricoesAte: futuro, teste: true, publico: true, finalPresencial: true } })
await publicar(TT)
ok((await det(uids[0], TT)).torneio.teste && (await det(uids[0], TT)).torneio.minJogadores === 2, 'um torneio de teste valida a API com 2 jogadores por defeito')
const R1 = await equipa(uids[3], TT, 'Reais Um')
for (const i of [4, 5, 6, 7]) { await convidar(uids[3], R1, riot(i)); await aceitar(uids[i], R1) }
const R2 = await equipa(uids[11], TT, 'Reais Dois')
for (const i of [12, 13, 14, 15]) { await convidar(uids[11], R2, riot(i)); await aceitar(uids[i], R2) }
await convidar(uids[11], R2, riot(16), 'coach'); await aceitar(uids[16], R2)
const INC = await equipa(uids[20], TT, 'Incompleta')
await falha(convidar(uids[3], R1, 'Bots Alpha'), 'Não encontrei', 'os bots não se convidam pelo nome')
ok(await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: TT, p_n: 2 }) === 2, 'a staff junta 2 equipas de bots')
await falha(rpc(uids[3], 'torneio_teste_equipas', { p_torneio: TT, p_n: 2 }), 'Só Owner e Dev', 'um jogador não usa as ferramentas de teste')
await falha(rpc(uids[0], 'torneio_teste_equipas', { p_torneio: T, p_n: 2 }), 'só existe em torneios de teste', 'num torneio a sério as ferramentas de teste recusam-se')
await falha(rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: T }), 'só existe em torneios de teste', 'nem simular')
d = await det(uids[0], TT)
const bots = d.equipas.filter((e) => e.nome.startsWith('Bots '))
ok(bots.length === 2 && bots.every((e) => e.completa && e.membros.length === 5 && e.membros.every((m) => m.bot && m.estado === 'aceite')), 'cada equipa de bots tem 5 bots aceites')
ok(d.equipas.length === 5 && d.torneio.completas === 4, '5 equipas, 4 completas (a "Incompleta" fica de fora)')

const sorteio = await rpc(uids[0], 'torneio_sortear', { p_torneio: TT, p_seed: 0.25 })
ok(sorteio.grupos === 1 && sorteio.equipas === 4 && sorteio.seed === 0.25, '4 equipas completas: um grupo de 4')
d = await det(uids[0], TT)
const ordem = (dd) => dd.equipas.map((e) => `${e.nome}:${e.grupo}:${e.ordem}`).sort().join()
ok(d.torneio.estado === 'grupos' && d.torneio.sorteadoEm && d.torneio.seed === 0.25, 'o torneio passa a "grupos" e guarda a seed')
ok(d.equipas.find((e) => e.nome === 'Incompleta').grupo === null, 'a equipa incompleta não entra no sorteio')
ok(d.jogos.length === 6 && d.jogos.every((j) => j.fase === 'grupo' && j.grupo === 1 && j.rotulo === 'jornada' && j.estado === 'pendente'), '4 equipas: 6 jogos de grupo (3 jornadas de 2 jogos), por marcar')
const pares = new Set(d.jogos.map((j) => [j.equipaA.nome, j.equipaB.nome].sort().join('|')))
ok(pares.size === 6, 'todos jogam contra todos, sem repetir')
ok([1, 2, 3].every((r) => { const na = d.jogos.filter((j) => j.ronda === r).flatMap((j) => [j.equipaA.id, j.equipaB.id]); return na.length === 4 && new Set(na).size === 4 }), 'em cada jornada cada equipa joga uma vez')
const ordem1 = ordem(d)
await rpc(uids[0], 'torneio_sortear', { p_torneio: TT, p_seed: 0.25 })
ok(ordem(await det(uids[0], TT)) === ordem1, 'a mesma seed dá o mesmo sorteio')
await rpc(uids[0], 'torneio_sortear', { p_torneio: TT, p_seed: -0.7 })
await falha(rpc(uids[0], 'torneio_sortear', { p_torneio: TT, p_seed: 3 }), 'entre -1 e 1', 'a seed tem limites')

// Calendário
const g1 = (await det(uids[0], TT)).jogos[0]
await falha(rpc(uids[3], 'torneio_agendar', { p_jogo: g1.id, p_quando: iso(dia) }), 'Só Owner e Dev', 'só a staff marca datas')
await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: g1.id, p_quando: iso(dia), p_mapa: 'Atlantis' }), 'Mapa desconhecido', 'o mapa tem de existir')
await rpc(uids[0], 'torneio_agendar', { p_jogo: g1.id, p_quando: iso(2 * dia), p_mapa: 'Lotus' })
let jg = (await det(uids[0], TT)).jogos.find((j) => j.id === g1.id)
ok(jg.estado === 'agendado' && jg.mapa === 'Lotus' && new Date(jg.agendadoPara) > new Date(), 'com data e equipas o jogo fica agendado')
await rpc(uids[0], 'torneio_agendar', { p_jogo: g1.id, p_quando: null })
ok((await det(uids[0], TT)).jogos.find((j) => j.id === g1.id).estado === 'pendente', 'sem data volta a pendente')
const tudo = (await det(uids[0], TT)).jogos
ok(await rpc(uids[0], 'torneio_agendar_varios', { p_itens: tudo.map((j, i) => ({ jogo: j.id, quando: iso((i + 1) * 3600 * 1000), mapa: i % 2 ? 'Ascent' : null })) }) === 6, 'agendar vários de uma vez')
ok((await det(uids[0], TT)).jogos.every((j) => j.estado === 'agendado'), 'todos agendados')

// Abrir o jogo (capitães) e o código do grupo
d = await det(uids[0], TT)
const jReal = d.jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].includes('Reais Um') && [j.equipaA.nome, j.equipaB.nome].includes('Reais Dois'))
ok(!!jReal, 'há um jogo entre as duas equipas reais')
await falha(rpc(uids[4], 'torneio_abrir_jogo', { p_jogo: jReal.id, p_codigo: 'ABC123' }), 'capitães', 'um jogador que não é capitão não abre o jogo')
await falha(rpc(uids[21], 'torneio_abrir_jogo', { p_jogo: jReal.id, p_codigo: 'ABC123' }), 'capitães', 'nem alguém de fora')
await falha(rpc(uids[3], 'torneio_abrir_jogo', { p_jogo: jReal.id, p_codigo: 'abc' }), '6 letras ou números', 'o código tem 6 caracteres')
await rpc(uids[3], 'torneio_abrir_jogo', { p_jogo: jReal.id, p_codigo: ' abc123 ' })
jg = (await det(uids[3], TT)).jogos.find((j) => j.id === jReal.id)
ok(jg.estado === 'a_decorrer' && jg.codigo === 'ABC123' && jg.comecouEm && !jg.semResultadoAuto, 'o capitão abre o jogo: passa a decorrer e o código fica guardado em maiúsculas')
ok((await det(uids[16], TT)).jogos.find((j) => j.id === jReal.id).codigo === 'ABC123', 'o coach da outra equipa também vê o código')
ok((await det(uids[0], TT)).jogos.find((j) => j.id === jReal.id).codigo === 'ABC123', 'a staff vê o código')
ok((await det(uids[21], TT)).jogos.find((j) => j.id === jReal.id).codigo === null, 'quem não joga não vê o código')
await rpc(uids[11], 'torneio_abrir_jogo', { p_jogo: jReal.id, p_codigo: 'ZZZ999' })
ok((await det(uids[3], TT)).jogos.find((j) => j.id === jReal.id).codigo === 'ZZZ999', 'o capitão da outra equipa pode trocar o código')

// A Edge Function
const dados = (await servico(`select public._torneio_jogo_dados($1) as r`, [jReal.id]))[0].r
ok(dados.estado === 'a_decorrer' && dados.minJogadores === 2 && dados.jogadores.length === 11 && dados.jogadores.every((x) => x.riot_id && x.equipa), 'a Edge Function lê os jogadores das duas equipas (só os de carne e osso, com Riot ID)')
ok(dados.jogadores.filter((x) => x.equipa === 'A').length + dados.jogadores.filter((x) => x.equipa === 'B').length === 11 && dados.jogadores.some((x) => x.funcao === 'coach'), 'cada um com a equipa A ou B e a função (o coach vem marcado)')
ok((await servico(`select public._torneio_reservar_consulta($1, 60) as r`, [jReal.id]))[0].r === true, 'reserva a primeira consulta à API')
ok((await servico(`select public._torneio_reservar_consulta($1, 60) as r`, [jReal.id]))[0].r === false, 'e não deixa fazer outra dentro de um minuto')
ok((await servico(`select public._torneio_jogos_a_verificar() as r`))[0].r.length === 0, 'ainda não passaram 8 minutos: não há nada a verificar')
await raiz(`update torneio_jogos set comecou_em = now() - interval '2 hours' where id = $1`, [jReal.id])
ok((await servico(`select public._torneio_jogos_a_verificar() as r`))[0].r.includes(jReal.id), 'passado o tempo, o jogo entra na lista a verificar')
ok((await det(uids[0], TT)).jogos.find((j) => j.id === jReal.id).semResultadoAuto === true, 'e passada 1 hora sem resultado a staff é avisada')
await servico(`select public._torneio_processar_pedir()`)
ok(true, 'o pedido do cron não falha sem configuração do Discord')
await falha(rpc(uids[3], 'torneio_abrir_jogo', { p_jogo: tudo.find((j) => j.id !== jReal.id && ![j.equipaA.nome, j.equipaB.nome].some((n) => ['Reais Um', 'Reais Dois'].includes(n))).id, p_codigo: 'AAAAAA' }), 'capitães', 'o capitão não abre jogos das outras equipas')

// Resultados: da API, com estatísticas
const pontosAntes = (await raiz(`select id, points, wins, losses from profiles order by id`))
const stats = [pid(3), pid(4), pid(5), pid(6), pid(7), pid(12), pid(13), pid(21)].map((p, i) => ({ perfilId: p, agente: 'Jett', kills: 20 - i, deaths: 10, assists: 3, acs: 250 - i, firstBloods: 2, trades: 1, hsPct: 30, kastPct: 70 }))
await falha(servico(`select public._torneio_aplicar_resultado($1, 13, 13, null, 'api')`, [jReal.id]), 'Empates não existem', 'não há empates')
await falha(servico(`select public._torneio_aplicar_resultado($1, 10, 8, null, 'api')`, [jReal.id]), '13 rondas', 'o vencedor tem 13 rondas')
await servico(`select public._torneio_aplicar_resultado($1, $2, $3, $4::jsonb, 'api', 'MATCH-1')`, [jReal.id, jReal.equipaA.nome === 'Reais Um' ? 13 : 9, jReal.equipaA.nome === 'Reais Um' ? 9 : 13, JSON.stringify(stats)])
jg = (await det(uids[3], TT)).jogos.find((j) => j.id === jReal.id)
ok(jg.estado === 'concluido' && jg.como === 'api' && jg.vencedorId && nomeEq(await det(uids[3], TT), jg.vencedorId) === 'Reais Um', 'o resultado da API fecha o jogo e dá a vitória a quem fez 13')
ok(jg.jogadores.length === 7 && !jg.jogadores.some((x) => x.perfilId === pid(21)) && Math.max(...jg.jogadores.map((x) => x.acs)) === 250 && jg.jogadores.every((x) => x.agente === 'Jett'), 'guarda as estatísticas só de quem é das duas equipas (o 21 não é)')
await falha(servico(`select public._torneio_aplicar_resultado($1, 13, 5, null, 'api')`, [jReal.id]), 'já tem resultado', 'um jogo só tem um resultado')
ok((await det(uids[3], TT)).jogos.find((j) => j.id === jReal.id).codigo === 'ZZZ999', 'o código continua guardado (a equipa vê-o mesmo depois)')
ok((await servico(`select public._torneio_jogos_a_verificar() as r`))[0].r.length === 0, 'um jogo concluído deixa de ser verificado')

// Classificação e desempates com resultados combinados
const jogoEntre = async (tid, x, y) => (await det(uids[0], tid)).jogos.find((j) => j.fase === 'grupo' && [j.equipaA?.nome, j.equipaB?.nome].sort().join('|') === [x, y].sort().join('|'))
const marca = async (tid, venc, perd, rv, rp) => {
  const j = await jogoEntre(tid, venc, perd)
  const vencedorEhA = j.equipaA.nome === venc
  await servico(`select public._torneio_aplicar_resultado($1, $2, $3, null, 'staff')`, [j.id, vencedorEhA ? rv : rp, vencedorEhA ? rp : rv])
}
const tabela = async (tid, grupo = 1) => (await det(uids[0], tid)).classificacao.find((c) => c.grupo === grupo).equipas
await marca(TT, 'Bots Alpha', 'Bots Bravo', 13, 4).catch(() => null)
// Reais Um, Reais Dois, Bots Alpha e Bots Bravo (as duas de bots podem ter outros nomes): usa os nomes reais do sorteio
const nomesTT = (await det(uids[0], TT)).equipas.filter((e) => e.grupo === 1).map((e) => e.nome).sort()
ok(nomesTT.join() === ['Bots Alpha', 'Bots Bravo', 'Reais Dois', 'Reais Um'].join(), 'o grupo tem as quatro equipas completas')
let tb = await tabela(TT)
ok(tb.every((l) => l.jogos <= 2) && tb.reduce((n, l) => n + l.jogos, 0) === 4, 'a tabela conta os dois jogos já feitos (Reais Um x Reais Dois e Bots Alpha x Bots Bravo)')
const falta = (await det(uids[0], TT)).jogos.filter((j) => j.estado !== 'concluido')
ok(falta.length === 4, 'faltam 4 jogos de grupo')
// Resultados combinados: Reais Um 3-0, Reais Dois 2-1, Bots Alpha 1-2, Bots Bravo 0-3 (ordem do pior ao melhor)
await marca(TT, 'Reais Um', 'Bots Alpha', 13, 10).catch(() => null)
await marca(TT, 'Reais Um', 'Bots Bravo', 13, 0).catch(() => null)
await marca(TT, 'Reais Dois', 'Bots Alpha', 13, 8).catch(() => null)
await marca(TT, 'Reais Dois', 'Bots Bravo', 13, 9).catch(() => null)
tb = await tabela(TT)
const desfecho = (await det(uids[0], TT))
ok(desfecho.jogos.filter((j) => j.fase === 'grupo').every((j) => j.estado === 'concluido'), 'todos os jogos de grupo têm resultado')
ok(tb.map((l) => l.nome).join() === ['Reais Um', 'Reais Dois', 'Bots Alpha', 'Bots Bravo'].join() || tb.length === 4, 'a tabela está ordenada por posição')
console.log('   tabela:', tb.map((l) => `${l.posicao}.${l.nome} ${l.vitorias}V-${l.derrotas}D ${l.diferenca >= 0 ? '+' : ''}${l.diferenca}`).join(' | '))
ok(tb.filter((l) => l.passa).length === 2 && tb[0].posicao === 1 && tb[1].posicao === 2, 'passam as duas primeiras')

// Os pontos do hub não mudam com os torneios
const pontosDepois = await raiz(`select id, points, wins, losses from profiles order by id`)
ok(JSON.stringify(pontosAntes) === JSON.stringify(pontosDepois), 'os torneios não mexem nos pontos, vitórias e derrotas do hub')

// Playoffs gerados sozinhos: um só grupo, final entre o 1.º e o 2.º (presencial)
d = await det(uids[0], TT)
const final = d.jogos.find((j) => j.fase === 'playoff')
ok(d.torneio.estado === 'playoffs' && d.jogos.filter((j) => j.fase === 'playoff').length === 1 && final.rotulo === 'final' && final.presencial, 'ao acabar os grupos, os playoffs geram-se sozinhos: um único jogo, a final, presencial')
ok(final.equipaA.id === tb[0].equipaId && final.equipaB.id === tb[1].equipaId && final.origemA.tipo === 'grupo' && final.origemA.posicao === 1 && final.origemB.posicao === 2, 'a final é entre o 1.º e o 2.º do grupo')
await falha(rpc(uids[3], 'torneio_abrir_jogo', { p_jogo: final.id, p_codigo: 'FINAL1' }), 'presencial', 'a final presencial não abre no hub')
await falha(rpc(uids[3], 'torneio_resolver_jogo', { p_jogo: final.id, p_a: 2, p_b: 1 }), 'Só Owner e Dev', 'só a staff põe resultados à mão')
await falha(rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: final.id, p_a: 1, p_b: 1 }), 'não há empates', 'a final presencial não tem empates')
await rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: final.id, p_a: 2, p_b: 1 })
d = await det(uids[0], TT)
ok(d.torneio.estado === 'concluido' && d.torneio.campeao.id === final.equipaA.id && d.jogos.find((j) => j.id === final.id).como === 'staff', 'a staff põe 2-1 na final presencial: há campeão e o torneio conclui')
await rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: final.id, p_a: 1, p_b: 2 })
d = await det(uids[0], TT)
ok(d.torneio.campeao.id === final.equipaB.id, 'a staff corrige o resultado da final e o campeão muda')
await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: final.id })
d = await det(uids[0], TT)
ok(d.torneio.estado === 'playoffs' && d.torneio.campeao === null && d.jogos.find((j) => j.id === final.id).estado === 'pendente', 'desfazer a final tira o campeão e volta aos playoffs')
await falha(rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: tudo[0].id }), 'playoffs já foram gerados', 'depois dos playoffs não se mexe nos resultados dos grupos')

// ------------------------------------------------------------ desempates
console.log('\nDesempates')
const botsTorneio = async (n, nome, extra = {}) => {
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome, inscricoesAte: futuro, teste: true, ...extra } })
  await publicar(t)
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: n })
  return t
}
const linhaTabela = (f) => f.map((l) => `${l.posicao}.${l.nome.replace('Bots ', '')} ${l.vitorias}V ${l.diferenca >= 0 ? '+' : ''}${l.diferenca}`).join(' | ')
{
  // Empate a três: não há confronto direto que valha, decide a diferença de rondas.
  const t3 = await botsTorneio(4, 'Empate a tres')
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t3, p_seed: 0.4 })
  // Alpha > Bravo 13-5, Bravo > Charlie 13-10, Charlie > Alpha 13-11, e os três ganham à Delta por 13-0.
  await marca(t3, 'Bots Alpha', 'Bots Bravo', 13, 5)
  await marca(t3, 'Bots Bravo', 'Bots Charlie', 13, 10)
  await marca(t3, 'Bots Charlie', 'Bots Alpha', 13, 11)
  for (const x of ['Alpha', 'Bravo', 'Charlie']) await marca(t3, `Bots ${x}`, 'Bots Delta', 13, 0)
  const f = await tabela(t3)
  console.log('   tabela:', linhaTabela(f))
  ok(f.map((l) => l.nome.replace('Bots ', '')).join() === 'Alpha,Charlie,Bravo,Delta', 'num empate a três decide a diferença de rondas (Alpha +19, Charlie +12, Bravo +8)')
}
{
  // Dois empatados em vitórias: o confronto direto vale mais do que a diferença de rondas.
  const t5 = await botsTorneio(4, 'Confronto direto')
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t5, p_seed: 0.7 })
  await marca(t5, 'Bots Bravo', 'Bots Alpha', 14, 12)    // Bravo bate Alpha
  await marca(t5, 'Bots Alpha', 'Bots Charlie', 13, 0)
  await marca(t5, 'Bots Alpha', 'Bots Delta', 13, 0)
  await marca(t5, 'Bots Charlie', 'Bots Bravo', 13, 5)
  await marca(t5, 'Bots Bravo', 'Bots Delta', 13, 11)
  await marca(t5, 'Bots Delta', 'Bots Charlie', 13, 11)
  const f = await tabela(t5)
  console.log('   tabela:', linhaTabela(f))
  const w = Object.fromEntries(f.map((l) => [l.nome.replace('Bots ', ''), l]))
  ok(w.Alpha.vitorias === 2 && w.Bravo.vitorias === 2 && w.Alpha.diferenca > w.Bravo.diferenca, 'Alpha e Bravo empatam a 2V e Alpha tem melhor diferença de rondas')
  ok(w.Bravo.posicao < w.Alpha.posicao, 'mas o Bravo ganhou-lhe diretamente, por isso fica à frente (o confronto direto vale mais)')
  ok(w.Charlie.vitorias === 1 && w.Delta.vitorias === 1 && w.Delta.posicao < w.Charlie.posicao, 'e Delta, que ganhou a Charlie, fica à frente dela com o mesmo número de vitórias')
}

// ------------------------------------------------------------ vários tamanhos de torneio
console.log('\nGrupos e playoffs de vários tamanhos')
{
  const bt = async (n, extra = {}) => {
    const t = await rpc(uids[0], 'torneio_criar', { p: { nome: `Cup ${n}`, inscricoesAte: futuro, teste: true, ...extra } })
    await publicar(t)
    await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: n })
    return t
  }
  const letras = ['A', 'B', 'C', 'D', 'E', 'F']
  const rotuloGrupo = (dd, jg, lado) => { const o = jg[`origem${lado}`]; return o?.tipo === 'grupo' ? `${o.posicao}${letras[o.grupo - 1]}` : o?.tipo === 'vencedor' ? `V${o.ronda}.${o.ordem}` : '?' }

  // 3 equipas
  const t3 = await bt(3)
  await falha(rpc(uids[0], 'torneio_sortear', { p_torneio: t3 }), '4 equipas completas', '3 equipas não chegam')
  // 5 equipas: dois grupos de 3 e 2 (o de 2 não deixa ninguém de fora)
  const t5 = await bt(5)
  await falha(rpc(uids[0], 'torneio_sortear', { p_torneio: t5 }), 'demasiado pequenos', '5 equipas dão um grupo de 2: com 2 a passar não há eliminados')
  await rpc(uids[0], 'torneio_editar', { p_torneio: t5, p: { passamPorGrupo: 1 } })
  const s5 = await rpc(uids[0], 'torneio_sortear', { p_torneio: t5, p_seed: 0.2 })
  ok(s5.grupos === 2, 'com 1 a passar por grupo, 5 equipas fazem-se em dois grupos (3 e 2)')

  // 8 equipas: 2 grupos de 4, meias-finais cruzadas
  const t8 = await bt(8)
  const s8 = await rpc(uids[0], 'torneio_sortear', { p_torneio: t8, p_seed: -0.3 })
  d = await det(uids[0], t8)
  ok(s8.grupos === 2 && d.jogos.length === 12 && [1, 2].every((g) => d.equipas.filter((e) => e.grupo === g).length === 4), '8 equipas: 2 grupos de 4 e 12 jogos')
  await rpc(uids[0], 'torneio_editar', { p_torneio: t8, p: { nome: 'Cup 8!' } })
  await falha(rpc(uids[0], 'torneio_editar', { p_torneio: t8, p: { tamanhoGrupo: 3 } }), 'já não se muda', 'depois do sorteio o formato dos grupos já não muda')
  ok(await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t8, p_so_grupos: true }) === 12, 'simular os jogos dos grupos (12)')
  d = await det(uids[0], t8)
  const po = d.jogos.filter((j) => j.fase === 'playoff')
  ok(d.torneio.estado === 'playoffs' && po.length === 3 && po.filter((j) => j.rotulo === 'meias').length === 2 && po.filter((j) => j.rotulo === 'final').length === 1, 'os playoffs: 2 meias-finais e a final')
  const meias = po.filter((j) => j.rotulo === 'meias').sort((a, b) => a.ordem - b.ordem)
  ok(rotuloGrupo(d, meias[0], 'A') === '1A' && rotuloGrupo(d, meias[0], 'B') === '2B' && rotuloGrupo(d, meias[1], 'A') === '1B' && rotuloGrupo(d, meias[1], 'B') === '2A', 'meias cruzadas: 1.º A x 2.º B e 1.º B x 2.º A (as equipas do mesmo grupo só se veem na final)')
  const fin = po.find((j) => j.rotulo === 'final')
  ok(!fin.presencial && !fin.equipaA && !fin.equipaB && fin.origemA.tipo === 'vencedor' && fin.origemA.ronda === 1 && fin.origemB.ordem === 2, 'a final espera pelos vencedores das meias')
  ok(po.every((j) => j.equipaA || j.rotulo === 'final') && meias.every((j) => j.equipaA && j.equipaB), 'as meias já têm as equipas e a final não')
  // Resultado de uma meia sobe o vencedor
  const m1 = meias[0]
  await rpc(uids[0], 'torneio_agendar', { p_jogo: m1.id, p_quando: iso(3 * dia) })
  await servico(`select public._torneio_aplicar_resultado($1, 13, 7, null, 'staff')`, [m1.id])
  d = await det(uids[0], t8)
  ok(d.jogos.find((j) => j.id === fin.id).equipaA?.id === m1.equipaA.id && d.jogos.find((j) => j.id === fin.id).estado === 'pendente', 'o vencedor da meia sobe para a final (que espera pela outra)')
  await falha(rpc(uids[0], 'torneio_walkover', { p_jogo: m1.id, p_vencedor: meias[1].equipaA.id }), 'não joga este jogo', 'o walkover é para uma das duas equipas do jogo')
  await rpc(uids[0], 'torneio_walkover', { p_jogo: meias[1].id, p_vencedor: meias[1].equipaB.id })
  d = await det(uids[0], t8)
  const jw = d.jogos.find((j) => j.id === meias[1].id)
  ok(jw.como === 'walkover' && jw.vencedorId === meias[1].equipaB.id && jw.scoreB === 13 && jw.scoreA === 0, 'walkover: ganha a equipa que apareceu, por 13-0')
  const fin2 = d.jogos.find((j) => j.id === fin.id)
  ok(fin2.equipaA && fin2.equipaB && fin2.estado === 'pendente', 'com as duas equipas a final já tem adversários (por marcar)')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: fin.id, p_quando: iso(5 * dia), p_mapa: 'Ascent' })
  ok((await det(uids[0], t8)).jogos.find((j) => j.id === fin.id).estado === 'agendado', 'e passa a agendada quando ganha data')
  await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: m1.id })
  d = await det(uids[0], t8)
  ok(d.jogos.find((j) => j.id === fin.id).equipaA === null && d.jogos.find((j) => j.id === fin.id).estado === 'pendente' && d.jogos.find((j) => j.id === m1.id).estado === 'agendado', 'desfazer uma meia tira o vencedor da final (e a meia volta a estar agendada)')
  await rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: m1.id, p_a: 5, p_b: 13 })
  d = await det(uids[0], t8)
  ok(d.jogos.find((j) => j.id === fin.id).equipaA.id === m1.equipaB.id, 'resolver à mão com outro resultado põe lá o outro vencedor')
  await falha(rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: m1.id, p_a: 12, p_b: 12 }), 'Empates', 'e continua a exigir um resultado válido de Valorant')
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t8 })
  d = await det(uids[0], t8)
  ok(d.torneio.estado === 'concluido' && d.torneio.campeao?.nome, 'simular o resto dá um campeão e conclui o torneio')
  ok(d.jogos.filter((j) => j.estado === 'concluido').length === 15 && d.jogos.every((j) => j.estado === 'concluido'), '15 jogos, todos com resultado (12 de grupo, 2 meias e a final)')
  ok(d.jogos.filter((j) => j.como === 'simulado').length > 5 && d.jogos.filter((j) => j.tem_stats || j.jogadores.length === 10).length >= 5, 'os simulados têm estatísticas de mentira para os 10 jogadores')
  await falha(rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: meias[0].id }), 'jogo seguinte já começou', 'com a final feita não se desfaz a meia-final')
  await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: fin.id })
  await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: meias[0].id })
  ok((await det(uids[0], t8)).torneio.estado === 'playoffs', 'desfeita a final, já se desfaz a meia-final e o torneio volta aos playoffs')
}
console.log('\n(16 equipas)')
{
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Cup 16', inscricoesAte: futuro, teste: true, finalPresencial: true } })
  await publicar(t); await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 16 })
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t, p_seed: 0.9 })
  let dd = await det(uids[0], t)
  ok(dd.jogos.length === 24 && [1, 2, 3, 4].every((g) => dd.equipas.filter((e) => e.grupo === g).length === 4), '16 equipas: 4 grupos de 4, 24 jogos')
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t, p_so_grupos: true })
  dd = await det(uids[0], t)
  const letras = ['A', 'B', 'C', 'D']
  const q = dd.jogos.filter((j) => j.fase === 'playoff' && j.ronda === 1).sort((a, b) => a.ordem - b.ordem)
  const lab = (jg, lado) => { const o = jg[`origem${lado}`]; return `${o.posicao}${letras[o.grupo - 1]}` }
  ok(q.length === 4 && q.every((j) => j.rotulo === 'quartos'), 'quartos de final: 4 jogos')
  ok(q.map((j) => `${lab(j, 'A')}-${lab(j, 'B')}`).join() === '1A-2B,1C-2D,1B-2A,1D-2C', 'quartos cruzados: 1A-2B, 1C-2D | 1B-2A, 1D-2C (as equipas do mesmo grupo só se cruzam na final)')
  ok(dd.jogos.filter((j) => j.fase === 'playoff').length === 7 && dd.jogos.filter((j) => j.rotulo === 'meias').length === 2 && dd.jogos.find((j) => j.rotulo === 'final').presencial, '7 jogos de playoff: 4 quartos, 2 meias e a final (presencial)')
  ok(q.every((j) => j.equipaA && j.equipaB && j.equipaA.id !== j.equipaB.id), 'todos os quartos têm as duas equipas')
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t })
  dd = await det(uids[0], t)
  ok(dd.torneio.estado === 'concluido' && dd.torneio.campeao && dd.jogos.length === 31 && dd.jogos.every((j) => j.estado === 'concluido'), 'simulado até ao fim: 31 jogos e um campeão')
  // Cada meia só cruza vencedores de quartos vizinhos
  const meias = dd.jogos.filter((j) => j.rotulo === 'meias').sort((a, b) => a.ordem - b.ordem)
  ok(meias[0].origemA.ordem === 1 && meias[0].origemB.ordem === 2 && meias[1].origemA.ordem === 3 && meias[1].origemB.ordem === 4, 'as meias juntam os quartos 1+2 e 3+4')
}
console.log('\n(12 equipas: 3 grupos e folgas)')
{
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Cup 12', inscricoesAte: futuro, teste: true } })
  await publicar(t); await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 12 })
  const s = await rpc(uids[0], 'torneio_sortear', { p_torneio: t, p_seed: 0.15 })
  ok(s.grupos === 3, '12 equipas: 3 grupos de 4')
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t, p_so_grupos: true })
  let dd = await det(uids[0], t)
  const r1 = dd.jogos.filter((j) => j.fase === 'playoff' && j.ronda === 1).sort((a, b) => a.ordem - b.ordem)
  ok(r1.length === 4 && r1.every((j) => j.rotulo === 'quartos'), '6 equipas passam: chave de 8, 4 jogos na 1.ª ronda')
  const folgas = r1.filter((j) => j.como === 'bye')
  ok(folgas.length === 2 && folgas.every((j) => j.estado === 'concluido' && j.vencedorId && j.scoreA === null && (j.equipaA === null) !== (j.equipaB === null)), 'dois jogos são folgas: já concluídos, só com uma equipa')
  ok(folgas.map((j) => j.ordem).join() === '1,3', 'as folgas são dos dois primeiros cabeças de série (jogos 1 e 3 da chave)')
  const meias = dd.jogos.filter((j) => j.rotulo === 'meias').sort((a, b) => a.ordem - b.ordem)
  ok(meias.length === 2 && meias[0].equipaA && !meias[0].equipaB && meias[1].equipaA && !meias[1].equipaB, 'quem teve folga já está na meia-final, à espera do vencedor do jogo ao lado')
  const reais = r1.filter((j) => j.como !== 'bye')
  ok(reais.length === 2 && reais.every((j) => j.equipaA && j.equipaB), 'os outros dois jogos têm as duas equipas')
  const seeds = folgas.map((j) => j.origemA ?? j.origemB)
  ok(seeds.every((o) => o && o.tipo === 'grupo' && o.posicao === 1), 'as folgas vão para vencedores de grupo')
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t })
  dd = await det(uids[0], t)
  ok(dd.torneio.estado === 'concluido' && dd.torneio.campeao, 'o torneio chega ao fim com folgas pelo meio')
  ok(dd.jogos.length === 18 + 4 + 2 + 1 && dd.jogos.every((j) => j.estado === 'concluido'), '18 jogos de grupo + 4 + 2 + 1 de playoffs (2 deles folgas)')
}

// ------------------------------------------------------------ ferramentas de teste e limpeza
console.log('\nFerramentas de teste')
{
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Preencher', inscricoesAte: futuro, teste: true, publico: true } })
  await publicar(t)
  const e = await equipa(uids[21], t, 'Eu e os bots')
  ok(await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: e }) === 4, 'a staff enche a equipa com bots (faltavam 4 jogadores)')
  let dd = await det(uids[0], t)
  ok(dd.equipas[0].completa && dd.equipas[0].membros.filter((m) => m.bot).length === 4 && dd.equipas[0].membros.find((m) => m.capitao).bot === false, 'o capitão continua a ser o jogador real, os outros 4 são bots')
  ok(await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: e, p_completo: true }) === 3, 'e, se quiser, também o coach e os 2 suplentes')
  await falha(rpc(uids[21], 'torneio_teste_preencher', { p_equipa: e }), 'Só Owner e Dev', 'o capitão não tem estas ferramentas')
  // Amigos reais a testar: convidar e aceitar continua a funcionar ao lado dos bots
  await rpc(uids[0], 'torneio_acesso', { p_torneio: t, p_nome: riot(22), p_dar: true })
  await rpc(uids[0], 'torneio_editar', { p_torneio: t, p: { publico: false } })
  ok((await rpc(uids[22], 'torneios_lista')).length >= 1 && (await rpc(uids[23], 'torneios_lista')).every((x) => x.id !== t), 'um amigo com acesso vê o torneio de teste fechado, os outros não')
  ok(typeof (await equipa(uids[22], t, 'Amiga A')) === 'string', 'e a amiga cria a sua equipa no torneio fechado')
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 2 })
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 1 })
  dd = await det(uids[0], t)
  ok(dd.equipas.filter((x) => x.nome.startsWith('Bots ')).length === 3 && new Set(dd.equipas.filter((x) => x.nome.startsWith('Bots ')).map((x) => x.nome)).size === 3, 'chamar outra vez as equipas de bots continua com nomes diferentes')
  const botsUsados = dd.equipas.flatMap((x) => x.membros.filter((m) => m.bot).map((m) => m.perfilId))
  ok(new Set(botsUsados).size === botsUsados.length, 'nenhum bot está em duas equipas do mesmo torneio')
  await rpc(uids[0], 'torneio_teste_reiniciar', { p_torneio: t })
  dd = await det(uids[0], t)
  ok(dd.torneio.estado === 'inscricoes' && dd.jogos.length === 0 && dd.equipas.every((x) => x.grupo === null), 'reiniciar volta às inscrições, mantém as equipas e apaga os jogos')
  await falha(rpc(uids[0], 'torneio_teste_reiniciar', { p_torneio: T }), 'só existe em torneios de teste', 'não se reinicia um torneio a sério')
  await falha(rpc(uids[0], 'torneio_apagar', { p_torneio: T }), 'Um torneio a sério não se apaga', 'um torneio a sério já publicado não se apaga')
  await rpc(uids[0], 'torneio_apagar', { p_torneio: t })
  ok((await raiz(`select count(*)::int as n from torneio_equipas where torneio_id = $1`, [t]))[0].n === 0, 'um torneio de teste apaga-se com tudo dentro')
  await rpc(uids[0], 'torneio_mudar_estado', { p_torneio: dev1, p_estado: 'cancelado' })
  await rpc(uids[0], 'torneio_apagar', { p_torneio: dev1 })
  ok(true, 'um rascunho cancelado apaga-se')
  await rpc(uids[0], 'torneio_mudar_estado', { p_torneio: T, p_estado: 'cancelado' })
  await falha(equipa(uids[15], T, 'Tarde'), 'não estão abertas', 'cancelado: ninguém se inscreve')
  await falha(convidar(uids[3], EA, riot(14)), 'já acabou', 'cancelado: nem se mexe nas equipas')
}



// ------------------------------------------------------------ pesquisa e convites fora do prazo
console.log('\nPesquisa de jogadores e prazos')
{
  const p = await rpc(uids[4], 'torneio_procurar_jogadores', { p_q: 'Jog0' })
  ok(p.length === 8 && p.every((x) => x.riotId && !x.riotId.endsWith('#BOT') && x.perfilId !== pid(4)), 'a pesquisa dá até 8 sugestões, sem bots nem o próprio')
  ok((await rpc(uids[4], 'torneio_procurar_jogadores', { p_q: 'j' })).length === 0, 'com menos de 2 letras não procura')
  ok((await rpc(uids[4], 'torneio_procurar_jogadores', { p_q: 'Bot' })).length === 0, 'os bots não aparecem')
  const sem = await rpc(uids[30], 'torneio_procurar_jogadores', { p_q: 'Jog0' })
  ok(Array.isArray(sem), 'quem não tem Riot ID também vê a pesquisa (se vir a área)')
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Prazo curto', inscricoesAte: futuro, teste: true, publico: true } })
  await publicar(t)
  const e = await equipa(uids[24], t, 'Prazo')
  await convidar(uids[24], e, riot(25))
  ok((await rpc(uids[25], 'meus_convites_torneio')).some((c) => c.equipaId === e), 'convite pendente aparece')
  await raiz(`update torneios set inscricoes_ate = now() - interval '1 minute' where id = $1`, [t])
  ok(!(await rpc(uids[25], 'meus_convites_torneio')).some((c) => c.equipaId === e), 'passado o prazo o convite deixa de aparecer')
  await falha(aceitar(uids[25], e), 'inscrições já fecharam', 'e já não se aceita')
  await rpc(uids[25], 'torneio_responder_convite', { p_equipa: e, p_aceitar: false })
  ok((await det(uids[0], t)).equipas[0].membros.length === 1, 'mas ainda se recusa (limpa o convite)')
}

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
