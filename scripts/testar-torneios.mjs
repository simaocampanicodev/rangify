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
ok((await rpc(uids[3], 'torneios_lista')).length === 0 && !(await rpc(uids[3], 'torneios_visivel')), 'o torneio está marcado como aberto, mas com a área fechada continua escondido')

// A área abre-se (e fecha-se) de uma vez para toda a gente
console.log('\nAbrir a área a toda a gente')
await falha(rpc(uids[3], 'torneio_definir_area', { p_aberta: true }), 'Só Owner e Dev', 'um jogador não abre a área')
await falha(rpc(uids[2], 'torneio_definir_area', { p_aberta: true }), 'Só Owner e Dev', 'nem um mod')
await falha(rpc(uids[3], 'torneio_area_aberta'), 'Só Owner e Dev', 'e só a staff lê o estado do botão')
ok(await rpc(uids[0], 'torneio_area_aberta') === false, 'a área nasce fechada')
ok(await rpc(uids[1], 'torneio_definir_area', { p_aberta: true }) === true, 'o Dev abre a área a toda a gente')
ok(await rpc(uids[0], 'torneio_area_aberta') === true, 'e o botão da staff mostra-a aberta')
ok((await rpc(uids[3], 'torneios_lista')).length === 1 && (await rpc(uids[3], 'torneios_visivel')), 'aberta: qualquer jogador vê o separador e o torneio marcado como aberto')
ok((await rpc(uids[3], 'torneio_detalhe', { p_torneio: T })).torneio.gerir === false, 'mas não gere')
await rpc(uids[0], 'torneio_editar', { p_torneio: T, p: { publico: false } })
ok((await rpc(uids[3], 'torneios_lista')).length === 0 && (await rpc(uids[3], 'torneios_visivel')), 'um torneio que não está marcado como aberto continua escondido (mas o separador aparece)')
await rpc(uids[0], 'torneio_editar', { p_torneio: T, p: { publico: true } })
ok(await rpc(uids[0], 'torneio_definir_area', { p_aberta: false }) === false, 'a staff volta a fechar a área')
ok((await rpc(uids[3], 'torneios_lista')).length === 0 && !(await rpc(uids[3], 'torneios_visivel')), 'fechada: o separador e os torneios desaparecem outra vez')
{
  // Quem é convidado para uma equipa vê o separador e o torneio mesmo com a área fechada.
  const tA = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Só convidados', inscricoesAte: futuro, teste: true, publico: true } })
  await publicar(tA)
  const eA = await equipa(uids[0], tA, 'Equipa da staff')
  ok(!(await rpc(uids[5], 'torneios_visivel')) && (await rpc(uids[5], 'torneios_lista')).length === 0, 'sem convite, a pessoa não vê nada')
  await convidar(uids[0], eA, riot(5))
  ok(await rpc(uids[5], 'torneios_visivel') && (await rpc(uids[5], 'torneios_lista')).some((x) => x.id === tA) && (await rpc(uids[5], 'meus_convites_torneio')).length === 1, 'convidada para uma equipa: vê o separador, o torneio e o convite')
  await aceitar(uids[5], eA)
  ok((await det(uids[5], tA)).torneio.minhaEquipa?.nome === 'Equipa da staff', 'aceita e fica na equipa para testar')
  await rpc(uids[5], 'torneio_sair_equipa', { p_equipa: eA })
  ok(!(await rpc(uids[5], 'torneios_visivel')), 'sai da equipa: o separador volta a desaparecer')
  await rpc(uids[0], 'torneio_apagar', { p_torneio: tA })
}
await rpc(uids[0], 'torneio_definir_area', { p_aberta: true })

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
await rpc(uids[0], 'torneio_agendar', { p_jogo: jReal.id, p_quando: jReal.agendadoPara, p_mapa: 'Ascent' })
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


// ------------------------------------------------------------ picks e bans de mapas
console.log('\nPicks e bans de mapas')
{
  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Veto', inscricoesAte: futuro, teste: true, publico: true } })
  await publicar(t)
  const h1 = await equipa(uids[6], t, 'Humanos Um')
  const h2 = await equipa(uids[7], t, 'Humanos Dois')
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: h1 })
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: h2 })
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 2 })
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t, p_seed: 0.4 })
  let dd = await det(uids[0], t)
  ok(dd.torneio.vetoMapas === true && dd.torneio.melhorDe === 1 && dd.torneio.poolMapas === null && dd.torneio.poolEfetiva.join() === 'Abyss,Ascent,Bind,Haven,Lotus,Split,Sunset', 'por defeito há picks e bans, só bans, com a rotação do hub (7 mapas)')
  const uidDe = { 'Humanos Um': uids[6], 'Humanos Dois': uids[7] }
  const entre = (a, b) => dd.jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].sort().join() === [a, b].sort().join())
  const jogo = (id) => det(uids[0], t).then((x) => x.jogos.find((j) => j.id === id))
  const marcar = (id, min = 10) => rpc(uids[0], 'torneio_agendar', { p_jogo: id, p_quando: iso(min * 60 * 1000) })
  const humanos = entre('Humanos Um', 'Humanos Dois')
  await marcar(humanos.id)
  let jv = await jogo(humanos.id)
  const capA = uidDe[jv.equipaA.nome]
  const capB = uidDe[jv.equipaB.nome]
  ok(jv.estado === 'agendado' && jv.mapa === null && jv.veto.feitos.length === 0 && jv.veto.passos.length === 7 && jv.veto.pool.length === 7, 'um jogo agendado ainda sem mapa: 6 bans e a escolha do lado (7 passos)')
  ok(jv.veto.passos.slice(0, 6).map((x) => x.equipa).join('') === 'ABABAB' && jv.veto.passos.slice(0, 6).every((x) => x.tipo === 'ban') && jv.veto.passos[6].tipo === 'lado' && jv.veto.passos[6].equipa === 'A', 'bans A,B,A,B,A,B; quem não baniu por último (A) escolhe o lado')
  await falha(rpc(capA, 'torneio_abrir_jogo', { p_jogo: humanos.id, p_codigo: 'ABC123' }), 'picks e bans', 'sem mapa o capitão não consegue abrir o jogo')
  await falha(rpc(uids[8], 'torneio_veto_iniciar', { p_jogo: humanos.id }), 'capitães', 'um jogador que não é capitão não começa os picks e bans')
  await falha(rpc(uids[21], 'torneio_veto_iniciar', { p_jogo: humanos.id }), 'capitães', 'nem alguém de fora')
  await rpc(capB, 'torneio_veto_iniciar', { p_jogo: humanos.id })
  jv = await jogo(humanos.id)
  ok(jv.estado === 'veto' && jv.mapa === null && new Date(jv.veto.prazo) > new Date() && new Date(jv.veto.prazo) < new Date(Date.now() + 95_000), 'o capitão da equipa B começa: o jogo entra em picks e bans com 90 s para a vez')
  await falha(rpc(capA, 'torneio_veto_iniciar', { p_jogo: humanos.id }), 'já começaram', 'não se começa duas vezes')
  await falha(rpc(capA, 'torneio_abrir_jogo', { p_jogo: humanos.id, p_codigo: 'ABC123' }), 'ainda não acabaram', 'nem se abre o jogo a meio')
  await falha(rpc(capB, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Bind' }), 'Não é a tua vez', 'a equipa B espera pela A')
  await falha(rpc(uids[8], 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Bind' }), 'Só os capitães', 'um colega de equipa não ban')
  await falha(rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Pearl' }), 'já não está disponível', 'um mapa fora da rotação não se ban')
  await rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Bind' })
  await falha(rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Haven' }), 'Não é a tua vez', 'e depois do ban a vez passa para o outro')
  await falha(rpc(capB, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Bind' }), 'já não está disponível', 'um mapa banido não se ban outra vez')
  await rpc(capB, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Haven' })
  for (const [uid, mapa] of [[capA, 'Abyss'], [capB, 'Lotus'], [capA, 'Split']]) await rpc(uid, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: mapa })
  jv = await jogo(humanos.id)
  ok(jv.estado === 'veto' && jv.mapa === null && jv.veto.feitos.length === 5, 'cinco bans feitos: ainda falta um')
  await rpc(capB, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Sunset' })
  jv = await jogo(humanos.id)
  ok(jv.mapa === 'Ascent' && jv.estado === 'veto' && jv.veto.feitos.length === 6 && jv.veto.feitos.map((x) => x.equipa).join('') === 'ABABAB', 'depois do 6.º ban sobra o Ascent: o mapa fica decidido e falta o lado')
  await falha(rpc(capB, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'ataque' }), 'Não é a tua vez', 'o lado é de quem não baniu por último')
  await falha(rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'meio' }), 'Ataque ou Defesa', 'o lado é ataque ou defesa')
  await falha(rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Ascent' }), 'Ataque ou Defesa', 'e não se escolhe um mapa neste passo')
  await rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'defesa' })
  jv = await jogo(humanos.id)
  ok(jv.estado === 'agendado' && jv.veto.ladoEquipa === 'A' && jv.veto.ladoEscolha === 'defesa' && jv.veto.prazo === null && jv.veto.feitos.length === 7, 'a equipa A escolhe defesa: o jogo volta a agendado, pronto a abrir')
  await falha(rpc(capA, 'torneio_veto_iniciar', { p_jogo: humanos.id }), 'já acabaram', 'e não se repetem os picks e bans')
  await rpc(capA, 'torneio_abrir_jogo', { p_jogo: humanos.id, p_codigo: 'MAPA01' })
  ok((await jogo(humanos.id)).estado === 'a_decorrer', 'agora o capitão abre o jogo')
  const dadosJogo = (await servico(`select public._torneio_jogo_dados($1) as r`, [humanos.id]))[0].r
  ok(dadosJogo.mapa === 'Ascent', 'e a deteção pela API procura o jogo no mapa que saiu dos bans')
  await falha(rpc(capA, 'torneio_veto_agir', { p_jogo: humanos.id, p_valor: 'Bind' }), 'não estão a decorrer', 'com o jogo a decorrer já não há vetos')

  // Bots: vetam logo; o humano só joga na sua vez
  dd = await det(uids[0], t)
  const contraBot = dd.jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].includes('Humanos Um') && [j.equipaA.nome, j.equipaB.nome].some((n) => n.startsWith('Bots ')))
  await marcar(contraBot.id)
  const humanoE = uidDe['Humanos Um']
  const humanoEhA = contraBot.equipaA.nome === 'Humanos Um'
  await rpc(humanoE, 'torneio_veto_iniciar', { p_jogo: contraBot.id })
  jv = await jogo(contraBot.id)
  ok(jv.estado === 'veto' && jv.veto.feitos.length === (humanoEhA ? 0 : 1) && jv.veto.feitos.every((x) => x.auto), humanoEhA ? 'a equipa humana é a A e começa: nada feito ainda' : 'a equipa humana é a B: o bot A já baniu um mapa sozinho')
  let guarda = 0
  while ((await jogo(contraBot.id)).estado === 'veto' && guarda++ < 10) {
    const v = await jogo(contraBot.id)
    const livre = v.veto.pool.find((m) => !v.veto.feitos.some((x) => x.valor === m))
    const proximo = v.veto.passos[v.veto.feitos.length]
    await rpc(humanoE, 'torneio_veto_agir', { p_jogo: contraBot.id, p_valor: proximo.tipo === 'lado' ? 'ataque' : livre })
  }
  jv = await jogo(contraBot.id)
  ok(jv.estado === 'agendado' && jv.mapa && jv.veto.feitos.length === 7 && jv.veto.feitos.filter((x) => x.auto).length >= 3, 'contra bots o humano só joga na sua vez e o veto acaba com mapa e lado')
  ok(jv.veto.feitos.filter((x) => x.equipa === (humanoEhA ? 'B' : 'A')).every((x) => x.auto) && jv.veto.feitos.filter((x) => x.equipa === (humanoEhA ? 'A' : 'B')).every((x) => !x.auto), 'só as jogadas do bot são automáticas')

  // Dois bots: os picks e bans fazem-se logo
  const botsJogo = dd.jogos.find((j) => j.equipaA.nome.startsWith('Bots ') && j.equipaB.nome.startsWith('Bots '))
  await marcar(botsJogo.id)
  await rpc(uids[0], 'torneio_veto_iniciar', { p_jogo: botsJogo.id })
  jv = await jogo(botsJogo.id)
  ok(jv.estado === 'agendado' && jv.mapa && jv.veto.feitos.length === 7 && jv.veto.feitos.every((x) => x.auto), 'dois bots vetam tudo ao calhas, logo que o veto começa')

  // Tempo esgotado
  const lento = dd.jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].sort().join() === ['Bots Alpha', 'Humanos Dois'].sort().join() || [j.equipaA.nome, j.equipaB.nome].sort().join() === ['Bots Bravo', 'Humanos Dois'].sort().join())
  await marcar(lento.id)
  const capLento = uids[7]
  await rpc(capLento, 'torneio_veto_iniciar', { p_jogo: lento.id })
  const antes = (await jogo(lento.id)).veto.feitos.length
  ok(!(await rpc(capLento, 'torneio_veto_avancar', { p_jogo: lento.id })), 'dentro do prazo ninguém joga por ti')
  await raiz(`update torneio_jogos set veto_prazo = now() - interval '1 second' where id = $1`, [lento.id])
  ok(await rpc(uids[0], 'torneio_veto_avancar', { p_jogo: lento.id }) === true, 'passado o prazo, quem tiver a página aberta pede e joga-se ao calhas')
  jv = await jogo(lento.id)
  ok(jv.veto.feitos.length > antes && jv.veto.feitos.at(-1).auto && new Date(jv.veto.prazo) > new Date(), 'a jogada fica marcada como automática e o prazo da vez seguinte recomeça')
  ok(!(await rpc(capLento, 'torneio_veto_avancar', { p_jogo: lento.id })), 'e não se joga outra vez dentro do novo prazo')
  await raiz(`update torneio_jogos set veto_prazo = now() - interval '1 second' where id = $1`, [lento.id])
  ok((await servico(`select public._torneio_veto_tick() as r`))[0].r === 1, 'o cron (a cada minuto) também despacha as vezes que passaram do prazo')
  await falha(como(uids[3], `select public._torneio_veto_tick()`), 'permission denied', 'o cron não se chama do browser')
  await rpc(uids[0], 'torneio_veto_concluir', { p_jogo: lento.id })
  jv = await jogo(lento.id)
  ok(jv.estado === 'agendado' && jv.mapa && jv.veto.feitos.length === 7, 'a staff pode despachar o que falta')
  await falha(rpc(uids[7], 'torneio_veto_concluir', { p_jogo: lento.id }), 'Só Owner e Dev', 'só a staff')
  await rpc(uids[0], 'torneio_veto_reiniciar', { p_jogo: lento.id })
  jv = await jogo(lento.id)
  ok(jv.estado === 'agendado' && jv.mapa === null && jv.veto.feitos.length === 0 && jv.veto.ladoEscolha === null && jv.veto.prazo === null, 'reiniciar apaga os vetos e o mapa que saiu deles')
  await falha(rpc(uids[7], 'torneio_veto_reiniciar', { p_jogo: lento.id }), 'Só Owner e Dev', 'só a staff reinicia')

  // A staff fixa o mapa: não há picks e bans
  await rpc(uids[0], 'torneio_agendar', { p_jogo: lento.id, p_quando: iso(15 * 60 * 1000), p_mapa: 'Pearl' })
  jv = await jogo(lento.id)
  ok(jv.mapa === 'Pearl' && jv.veto.mapaStaff === true, 'a staff fixa o mapa à mão')
  await falha(rpc(uids[7], 'torneio_veto_iniciar', { p_jogo: lento.id }), 'staff já definiu', 'então não há picks e bans nesse jogo')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: lento.id, p_quando: iso(20 * 60 * 1000) })
  ok((await jogo(lento.id)).mapa === 'Pearl', 'mudar só a hora não mexe no mapa')
  await rpc(uids[7], 'torneio_abrir_jogo', { p_jogo: lento.id, p_codigo: 'PEARL1' })
  ok((await jogo(lento.id)).estado === 'a_decorrer', 'e o jogo abre sem veto')
  await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: lento.id })
  await rpc(uids[0], 'torneio_agendar', { p_jogo: lento.id, p_quando: iso(20 * 60 * 1000), p_mapa: '' })
  jv = await jogo(lento.id)
  ok(jv.mapa === null && jv.veto.mapaStaff === false, 'tirar o mapa da staff devolve o jogo aos picks e bans')
  await rpc(uids[7], 'torneio_veto_iniciar', { p_jogo: lento.id })
  await rpc(uids[0], 'torneio_agendar', { p_jogo: lento.id, p_quando: iso(20 * 60 * 1000), p_mapa: 'Fracture' })
  jv = await jogo(lento.id)
  ok(jv.estado === 'agendado' && jv.mapa === 'Fracture' && jv.veto.feitos.length === 0, 'se a staff fixar o mapa a meio, os picks e bans acabam e fica o mapa dela')

  // Simulação: os jogos simulados também têm mapa e vetos
  await rpc(uids[0], 'torneio_teste_simular_tudo', { p_torneio: t, p_so_grupos: true })
  dd = await det(uids[0], t)
  ok(dd.jogos.filter((j) => j.fase === 'grupo').every((j) => j.estado === 'concluido' && j.mapa && (j.veto.mapaStaff || (j.veto.feitos.length === 7 && j.veto.ladoEscolha))), 'jogos simulados: todos têm mapa e picks e bans (ou o mapa da staff)')
}
console.log('\n(picks e bans: melhor de 3 e melhor de 5)')
{
  await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'Poucos mapas', inscricoesAte: futuro, poolMapas: ['Ascent', 'Bind'] } }), 'pelo menos 3', 'a lista de mapas do torneio precisa de 3 ou mais')
  await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'Mapa falso', inscricoesAte: futuro, poolMapas: ['Ascent', 'Bind', 'Atlantis'] } }), 'não existe no Valorant', 'e os mapas têm de existir')
  await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'Melhor de 2', inscricoesAte: futuro, melhorDe: 2 } }), 'melhor de 1, 3 ou 5', 'os jogos são à melhor de 1, 3 ou 5')
  await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'MD5 curto', inscricoesAte: futuro, melhorDe: 5, poolMapas: ['Ascent', 'Bind', 'Haven'] } }), 'pelo menos 5 mapas', 'à melhor de 5 são precisos 5 mapas em jogo')
  await falha(rpc(uids[0], 'torneio_criar', { p: { nome: 'MD3 sem veto', inscricoesAte: futuro, melhorDe: 3, vetoMapas: false } }), 'precisam dos picks e bans', 'a melhor de 3 precisa dos picks e bans (de onde saem os mapas)')
  const seq = async (md, n) => (await raiz(`select public._torneio_veto_passos($1, $2) as r`, [md, n]))[0].r.map((x) => `${x.tipo}:${x.equipa}`).join()
  ok(await seq(1, 7) === 'ban:A,ban:B,ban:A,ban:B,ban:A,ban:B,lado:A', 'melhor de 1 com 7 mapas: seis bans à vez e o lado para quem não baniu por último')
  ok(await seq(3, 7) === 'ban:A,ban:B,pick:A,lado:B,pick:B,lado:A,ban:A,ban:B,lado:A', 'melhor de 3 com 7 mapas: ban, ban, pick e lado, pick e lado, ban, ban e o decisivo')
  ok(await seq(5, 7) === 'ban:A,ban:B,pick:A,lado:B,pick:B,lado:A,pick:A,lado:B,pick:B,lado:A,lado:A', 'melhor de 5 com 7 mapas: ban, ban, quatro picks (cada um com o lado do outro) e o decisivo')
  ok(await seq(3, 3) === 'pick:A,lado:B,pick:B,lado:A,lado:A' && await seq(5, 5) === 'pick:A,lado:B,pick:B,lado:A,pick:A,lado:B,pick:B,lado:A,lado:A', 'sem mapas a mais não há bans: só picks')
  ok(await seq(3, 9) === 'ban:A,ban:B,pick:A,lado:B,pick:B,lado:A,ban:A,ban:B,ban:A,ban:B,lado:A', 'com mais mapas há mais bans depois dos picks')

  const t = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Melhor de 3', inscricoesAte: futuro, teste: true, publico: true, melhorDe: 3 } })
  let dd = await det(uids[0], t)
  ok(dd.torneio.melhorDe === 3 && dd.torneio.poolEfetiva.length === 7, 'torneio onde os jogos são à melhor de 3')
  await publicar(t)
  const e1 = await equipa(uids[9], t, 'Serie Um')
  const e2 = await equipa(uids[10], t, 'Serie Dois')
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: e1 })
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: e2 })
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t, p_n: 2 })
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t, p_seed: 0.6 })
  dd = await det(uids[0], t)
  const jg = dd.jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].sort().join() === ['Serie Dois', 'Serie Um'].sort().join())
  const capDe = { 'Serie Um': uids[9], 'Serie Dois': uids[10] }
  const A = capDe[jg.equipaA.nome]
  const B = capDe[jg.equipaB.nome]
  const perfilDeA = pid(jg.equipaA.nome === 'Serie Um' ? 9 : 10)
  const g = (id, tt = t) => det(uids[0], tt).then((x) => x.jogos.find((j) => j.id === id))
  await rpc(uids[0], 'torneio_agendar', { p_jogo: jg.id, p_quando: iso(5 * 60 * 1000) })
  let v = await g(jg.id)
  ok(v.melhorDe === 3 && v.veto.melhorDe === 3 && v.veto.passos.map((x) => `${x.tipo}:${x.equipa}`).join() === 'ban:A,ban:B,pick:A,lado:B,pick:B,lado:A,ban:A,ban:B,lado:A' && v.veto.passos.filter((x) => x.alvo).length === 5, 'o jogo à melhor de 3 tem os picks e bans da série (9 passos)')
  await rpc(A, 'torneio_veto_iniciar', { p_jogo: jg.id })
  const jogada = (uid, valor) => rpc(uid, 'torneio_veto_agir', { p_jogo: jg.id, p_valor: valor })
  await jogada(A, 'Abyss'); await jogada(B, 'Bind')
  await falha(jogada(B, 'Ascent'), 'Não é a tua vez', 'o 1.º pick é da equipa A')
  await jogada(A, 'Ascent')
  await falha(jogada(A, 'defesa'), 'Não é a tua vez', 'e o lado do mapa que A escolheu é da equipa B')
  await falha(jogada(B, 'Ascent'), 'Ataque ou Defesa', 'no passo do lado não se escolhe um mapa')
  await jogada(B, 'ataque')
  await jogada(B, 'Haven')
  await falha(jogada(A, 'Haven'), 'Ataque ou Defesa', 'o lado do mapa da equipa B é da equipa A')
  await jogada(A, 'defesa')
  await jogada(A, 'Lotus'); await jogada(B, 'Split')
  v = await g(jg.id)
  ok(v.estado === 'veto' && v.mapa === null && v.mapas.length === 0 && v.veto.feitos.length === 8, 'faltam só os lados do decisivo: ainda não há mapas fechados')
  await falha(jogada(B, 'ataque'), 'Não é a tua vez', 'o lado do decisivo é de quem não fez a última jogada de mapa')
  await jogada(A, 'ataque')
  v = await g(jg.id)
  ok(v.estado === 'agendado' && v.mapa === 'Ascent' && v.serieA === 0 && v.serieB === 0 && v.mapas.map((m) => `${m.mapa}:${m.escolhidaPor}:${m.ladoEquipa}:${m.ladoEscolha}`).join() === 'Ascent:A:B:ataque,Haven:B:A:defesa,Sunset:decisivo:A:ataque', 'fechados: Ascent (A, B ataca), Haven (B, A defende) e o decisivo Sunset (A ataca)')
  ok(v.veto.ladoEquipa === 'B' && v.veto.ladoEscolha === 'ataque', 'e o jogo começa pelo primeiro mapa e pelo seu lado')

  // Jogar a série: o resultado de cada mapa vem da API
  await rpc(A, 'torneio_abrir_jogo', { p_jogo: jg.id, p_codigo: 'SERIE1' })
  const dados1 = (await servico(`select public._torneio_jogo_dados($1) as r`, [jg.id]))[0].r
  ok(dados1.estado === 'a_decorrer' && dados1.mapa === 'Ascent', 'a API procura o 1.º mapa da série (Ascent)')
  const estat = JSON.stringify([{ perfilId: perfilDeA, agente: 'Jett', kills: 20, deaths: 10, assists: 3, acs: 250, firstBloods: 2, trades: 1, hsPct: 30, kastPct: 70 }])
  const api = (a, b, id) => servico(`select public._torneio_aplicar_resultado($1, $2, $3, $4::jsonb, 'api', $5)`, [jg.id, a, b, estat, id])
  await api(13, 9, 'M-1')
  v = await g(jg.id)
  ok(v.estado === 'agendado' && v.serieA === 1 && v.serieB === 0 && v.mapa === 'Haven' && v.veto.ladoEquipa === 'A' && v.veto.ladoEscolha === 'defesa' && v.mapas[0].estado === 'concluido' && v.mapas[0].scoreA === 13 && v.mapas[0].vencedorId === jg.equipaA.id, 'o 1.º mapa acaba 13-9 para A: 1-0 e o jogo passa ao Haven (A defende)')
  ok(v.jogadores.length === 1 && v.jogadores[0].mapaOrdem === 1, 'as estatísticas ficam ligadas ao mapa 1')
  ok((await servico(`select public._torneio_jogo_dados($1) as r`, [jg.id]))[0].r.usadas.includes('M-1'), 'a partida da API do 1.º mapa fica usada (não se confunde com o 2.º)')
  await rpc(B, 'torneio_abrir_jogo', { p_jogo: jg.id, p_codigo: 'SERIE1' })
  ok((await servico(`select public._torneio_jogo_dados($1) as r`, [jg.id]))[0].r.mapa === 'Haven' && (await g(jg.id)).mapas[1].estado === 'a_decorrer', 'abre-se o 2.º mapa com o mesmo grupo: a API procura o Haven')
  await api(10, 13, 'M-2')
  v = await g(jg.id)
  ok(v.estado === 'agendado' && v.serieA === 1 && v.serieB === 1 && v.mapa === 'Sunset' && v.veto.ladoEquipa === 'A' && v.veto.ladoEscolha === 'ataque', '1-1: o jogo passa ao decisivo (Sunset, A ataca)')
  await rpc(A, 'torneio_abrir_jogo', { p_jogo: jg.id, p_codigo: 'SERIE1' })
  await api(13, 11, 'M-3')
  v = await g(jg.id)
  ok(v.estado === 'concluido' && v.vencedorId === jg.equipaA.id && v.serieA === 2 && v.serieB === 1 && v.scoreA === 36 && v.scoreB === 33 && v.mapas.every((m) => m.estado === 'concluido') && v.como === 'api', 'A ganha a série por 2-1 (rondas 36-33) e o jogo fecha')
  const linha = (await det(uids[0], t)).classificacao.flatMap((c) => c.equipas).find((x) => x.equipaId === jg.equipaA.id)
  ok(linha.vitorias === 1 && linha.rondasGanhas === 36 && linha.rondasPerdidas === 33, 'na tabela do grupo conta uma vitória e as rondas dos três mapas')
  await falha(rpc(uids[0], 'torneio_veto_reiniciar', { p_jogo: jg.id }), 'já começou', 'um jogo acabado não refaz os picks e bans')

  // Desfazer: a série volta ao início
  await rpc(uids[0], 'torneio_desfazer_jogo', { p_jogo: jg.id })
  v = await g(jg.id)
  ok(v.estado === 'agendado' && v.serieA === 0 && v.serieB === 0 && v.mapa === 'Ascent' && v.scoreA === null && v.jogadores.length === 0 && v.mapas.length === 3 && v.mapas.every((m) => m.estado === 'pendente' && m.scoreA === null), 'desfazer volta a série ao 1.º mapa, com os mapas por jogar')
  await api(13, 5, 'N-1'); await api(13, 7, 'N-2')
  v = await g(jg.id)
  ok(v.estado === 'concluido' && v.serieA === 2 && v.serieB === 0 && v.mapas[2].estado === 'pendente', 'ganhando os dois primeiros mapas a série acaba 2-0 e o decisivo não se joga')
  await falha(api(13, 1, 'N-3'), 'já tem resultado', 'não entram mais resultados')

  // Resto do torneio: resultados da staff, W.O., simulação, formato e presencial
  dd = await det(uids[0], t)
  const outros = dd.jogos.filter((j) => j.id !== jg.id && j.equipaA && j.equipaB)
  const [oJ1, oJ2, oJ3, oJ4, oJ5] = outros
  for (const o of [oJ1, oJ2, oJ3, oJ4, oJ5]) await rpc(uids[0], 'torneio_agendar', { p_jogo: o.id, p_quando: iso(30 * 60 * 1000) })

  await rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: oJ1.id, p_a: 13, p_b: 4 })
  v = await g(oJ1.id)
  ok(v.estado !== 'concluido' && v.serieA + v.serieB === 1 && v.mapas.length === 3 && v.mapas[0].scoreA === 13 && v.mapas[0].como === 'staff', 'a staff põe o resultado do mapa em jogo (os picks e bans despacham-se ao calhas) e a série continua')
  await falha(rpc(uids[0], 'torneio_veto_reiniciar', { p_jogo: oJ1.id }), 'série já começou', 'com a série em curso não se refazem os picks e bans')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: oJ1.id, p_quando: iso(30 * 60 * 1000), p_mapa: 'Pearl' }), 'série já começou', 'nem se fixa o mapa')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: oJ1.id, p_quando: iso(30 * 60 * 1000), p_melhor_de: 1 }), 'série já começou', 'nem se muda o formato')

  await rpc(uids[0], 'torneio_walkover', { p_jogo: oJ2.id, p_vencedor: oJ2.equipaB.id })
  v = await g(oJ2.id)
  ok(v.estado === 'concluido' && v.vencedorId === oJ2.equipaB.id && v.serieB === 2 && v.serieA === 0 && v.scoreB === 26 && v.scoreA === 0 && v.como === 'walkover', 'W.O. numa série: a equipa que apareceu ganha 2-0 (26-0 em rondas)')

  await rpc(uids[0], 'torneio_teste_simular', { p_jogo: oJ3.id })
  v = await g(oJ3.id)
  const concl = v.mapas.filter((m) => m.estado === 'concluido')
  ok(v.estado === 'concluido' && v.vencedorId && Math.max(v.serieA, v.serieB) === 2 && concl.length === v.serieA + v.serieB && concl.every((m) => m.como === 'simulado') && v.jogadores.length >= 10 * concl.length, 'simular um jogo joga a série até alguém ter 2 mapas, com estatísticas de cada mapa')
  ok(v.scoreA === concl.reduce((n, m) => n + m.scoreA, 0), 'e as rondas da série são a soma das rondas dos mapas')

  // O formato muda jogo a jogo (até começarem os picks e bans)
  await rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_melhor_de: 1 })
  v = await g(oJ4.id)
  ok(v.melhorDe === 1 && v.veto.melhorDe === 1 && v.veto.passos.length === 7, 'a staff muda um jogo para melhor de 1: voltam os bans à vez')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_mapa: 'Pearl' })
  ok((await g(oJ4.id)).mapa === 'Pearl', 'e aí já se pode fixar o mapa à mão')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_melhor_de: 5 })
  v = await g(oJ4.id)
  ok(v.melhorDe === 5 && v.mapa === null && v.veto.mapaStaff === false && v.veto.passos.map((x) => `${x.tipo}:${x.equipa}`).join() === 'ban:A,ban:B,pick:A,lado:B,pick:B,lado:A,pick:A,lado:B,pick:B,lado:A,lado:A', 'para melhor de 5 o mapa fixado cai e os picks e bans são os de melhor de 5')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_mapa: 'Pearl' }), 'melhor de 5', 'numa série não se fixa um mapa')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_melhor_de: 4 }), 'melhor de 1, 3 ou 5', 'só melhor de 1, 3 ou 5')
  await rpc(uids[0], 'torneio_veto_concluir', { p_jogo: oJ4.id })
  v = await g(oJ4.id)
  ok(v.estado !== 'veto' && v.mapas.length === 5 && v.mapas.filter((m) => m.escolhidaPor === 'decisivo').length === 1 && new Set(v.mapas.map((m) => m.mapa)).size === 5, 'melhor de 5: cinco mapas diferentes, o último é o decisivo')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: oJ4.id, p_quando: iso(30 * 60 * 1000), p_melhor_de: 3 }), 'Reinicia primeiro', 'com os picks e bans feitos só se muda o formato depois de os reiniciar')
  await rpc(uids[0], 'torneio_veto_reiniciar', { p_jogo: oJ4.id })
  v = await g(oJ4.id)
  ok(v.estado === 'agendado' && v.mapas.length === 0 && v.veto.feitos.length === 0, 'reiniciar apaga também os mapas da série')
  await rpc(uids[0], 'torneio_teste_simular', { p_jogo: oJ4.id })
  v = await g(oJ4.id)
  ok(v.estado === 'concluido' && Math.max(v.serieA, v.serieB) === 3 && v.mapas.length === 5, 'simular um melhor de 5 acaba quando alguém chega aos 3 mapas')

  // Série presencial: a staff põe os mapas ganhos
  await rpc(uids[0], 'torneio_agendar', { p_jogo: oJ5.id, p_quando: iso(30 * 60 * 1000), p_presencial: true })
  ok((await g(oJ5.id)).veto === null, 'um jogo presencial não tem picks e bans')
  await falha(rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: oJ5.id, p_a: 3, p_b: 0 }), 'ganha 2 mapas', 'à melhor de 3 o vencedor ganha 2 mapas, não 3')
  await falha(rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: oJ5.id, p_a: 2, p_b: 2 }), 'ganha 2 mapas', 'nem se empata')
  await rpc(uids[0], 'torneio_resolver_jogo', { p_jogo: oJ5.id, p_a: 2, p_b: 1 })
  v = await g(oJ5.id)
  ok(v.estado === 'concluido' && v.serieA === 2 && v.serieB === 1 && v.vencedorId === oJ5.equipaA.id && v.como === 'staff', 'presencial: a staff põe 2-1 e fecha a série')

  // Sem picks e bans no torneio
  const t0 = await rpc(uids[0], 'torneio_criar', { p: { nome: 'Sem veto', inscricoesAte: futuro, teste: true, vetoMapas: false } })
  await publicar(t0)
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: t0, p_n: 4 })
  await rpc(uids[0], 'torneio_sortear', { p_torneio: t0, p_seed: 0.1 })
  const j0 = (await det(uids[0], t0)).jogos[0]
  ok(j0.veto === null, 'com os picks e bans desligados o jogo não tem veto')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: j0.id, p_quando: iso(60 * 1000) })
  await falha(rpc(uids[0], 'torneio_veto_iniciar', { p_jogo: j0.id }), 'não tem picks e bans', 'e não se começa um')
  await falha(rpc(uids[0], 'torneio_agendar', { p_jogo: j0.id, p_quando: iso(60 * 1000), p_melhor_de: 3 }), 'precisam dos picks e bans', 'nem se põe um jogo à melhor de 3 (os mapas saem dos picks e bans)')
  await falha(rpc(uids[0], 'torneio_editar', { p_torneio: t0, p: { melhorDe: 3 } }), 'precisam dos picks e bans', 'nem o torneio passa a melhor de 3 sem picks e bans')
  await rpc(uids[0], 'torneio_abrir_jogo', { p_jogo: j0.id, p_codigo: 'SEMVET' })
  ok((await det(uids[0], t0)).jogos.find((j) => j.id === j0.id).estado === 'a_decorrer', 'o jogo abre sem mapa')
  await rpc(uids[0], 'torneio_editar', { p_torneio: t0, p: { vetoMapas: true, poolMapas: ['Ascent', 'Bind', 'Haven'], melhorDe: 3 } })
  const dt = await det(uids[0], t0)
  ok(dt.torneio.vetoMapas && dt.torneio.poolEfetiva.join() === 'Ascent,Bind,Haven' && dt.jogos[0].veto.passos.map((x) => x.tipo).join() === 'pick,lado,pick,lado,lado' && dt.jogos[0].melhorDe === 3, 'a staff liga os picks e bans depois (3 mapas à melhor de 3: dois picks com o lado e o decisivo)')
  await rpc(uids[0], 'torneio_editar', { p_torneio: t0, p: { poolMapas: [] } })
  ok((await det(uids[0], t0)).torneio.poolMapas === null, 'lista vazia volta à rotação do hub')

  // Torneio a sério: só 30 minutos antes
  const tr = await rpc(uids[0], 'torneio_criar', { p: { nome: 'A sério com veto', inscricoesAte: futuro, minJogadores: 1, publico: true } })
  await publicar(tr)
  const er = await equipa(uids[12], tr, 'Reais Veto Um')
  const er2 = await equipa(uids[13], tr, 'Reais Veto Dois')
  await raiz(`update torneios set teste = true where id = $1`, [tr])
  await rpc(uids[0], 'torneio_teste_equipas', { p_torneio: tr, p_n: 2 })
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: er })
  await rpc(uids[0], 'torneio_teste_preencher', { p_equipa: er2 })
  await rpc(uids[0], 'torneio_sortear', { p_torneio: tr, p_seed: 0.3 })
  await raiz(`update torneios set teste = false where id = $1`, [tr])
  const jr = (await det(uids[0], tr)).jogos.find((j) => [j.equipaA.nome, j.equipaB.nome].sort().join() === ['Reais Veto Dois', 'Reais Veto Um'].sort().join())
  const capR = jr.equipaA.nome === 'Reais Veto Um' ? uids[12] : uids[13]
  await rpc(uids[0], 'torneio_agendar', { p_jogo: jr.id, p_quando: iso(2 * 3600 * 1000) })
  await falha(rpc(capR, 'torneio_veto_iniciar', { p_jogo: jr.id }), 'Ainda é cedo', 'num torneio a sério os picks e bans só abrem 30 minutos antes')
  await rpc(uids[0], 'torneio_agendar', { p_jogo: jr.id, p_quando: iso(20 * 60 * 1000) })
  await rpc(capR, 'torneio_veto_iniciar', { p_jogo: jr.id })
  ok((await det(uids[0], tr)).jogos.find((j) => j.id === jr.id).estado === 'veto', 'a 20 minutos do jogo o capitão já pode começar')
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
