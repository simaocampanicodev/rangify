/**
 * Testa a migração do Supabase num Postgres local (PGlite), sem rede.
 * Cria o esquema "auth" mínimo, os papéis do Supabase e corre uma partida
 * inteira pelos RPCs, como os clientes fariam: fila, confirmação, draft,
 * bans, código, bloqueio, resultado, pontos, mais os casos de erro.
 *
 *   npm run testar-sql
 */
import { readFileSync } from 'node:fs'
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

/** Corre SQL como um utilizador autenticado (RLS e permissões a sério). */
async function como(uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${uid}', true);`)
    const r = await tx.query(sql, params)
    return r.rows
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

// ------------------------------------------------------------ o que o Supabase já traz
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
  -- Um Storage mínimo, só com o que a migração das fotos usa.
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to authenticated;
`)

console.log('\nMigrações')
for (const f of ['0001_schema.sql', '0002_perfil.sql', '0003_estatisticas.sql', '0004_fila_amigos.sql']) {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'))
  ok(true, `${f} aplicada sem erros`)
}

// ------------------------------------------------------------ 11 contas (10 jogam, 1 fica de fora)
console.log('\nContas')
const nomes = ['Kaiser', 'Lince', 'Vexa', 'Morfeu', 'Tejo', 'Rafa', 'Sombra', 'Fenix', 'Bruma', 'Kairo', 'Fora']
const tiers = [24, 21, 19, 19, 17, 16, 15, 14, 12, 10, 18]
const uids = []
for (const [i, n] of nomes.entries()) {
  const [{ id }] = await raiz(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${n.toLowerCase()}@teste.pt`, { name: `${n.toLowerCase()}#0`, avatar_url: null }])
  uids.push(id)
  await raiz(`update profiles set riot_id = $1, official_tier = $2 where auth_id = $3`, [`${n}#EU${i}`, tiers[i], id])
}
await raiz(`update profiles set role = 'owner' where auth_id = $1`, [uids[0]])
const perfis = await raiz(`select id, auth_id, username, points from profiles order by created_at`)
ok(perfis.length === 11 && perfis[0].username === 'kaiser', 'o trigger cria um perfil por conta, com o utilizador do Discord sem "#0"')
const pid = (i) => perfis.find((p) => p.auth_id === uids[i]).id
const uidDe = (perfilId) => uids[perfis.findIndex((p) => p.id === perfilId)]

const eu0 = await rpc(uids[0], 'meu_perfil')
ok(eu0.pontos === 1000 && eu0.funcao === 'owner' && eu0.riotId === 'Kaiser#EU0', 'meu_perfil devolve o JSON com os nomes do site')

// ------------------------------------------------------------ segurança
console.log('\nSegurança')
await como(uids[1], `update profiles set points = 99999 where id = $1`, [pid(1)]).catch(() => null)
ok((await raiz(`select points from profiles where id = $1`, [pid(1)]))[0].points === 1000, 'um cliente não consegue mudar os próprios pontos')
await falha(como(uids[1], `select public._fechar($1, 13, 0, null)`, ['00000000-0000-0000-0000-000000000000']), 'permission denied', 'as funções internas não se chamam do browser')
await falha(como(uids[1], `select public.aplicar_resultado($1, 13, 0, null)`, ['00000000-0000-0000-0000-000000000000']), 'permission denied', 'aplicar_resultado é só da service role')
await falha(rpc(uids[1], 'dev_encher_fila', { p_ser_capitao: true }), 'Owner e Dev', 'um jogador normal não usa as ferramentas de teste')
await falha(rpc(uids[1], 'disputas'), 'equipa do Rangify', 'um jogador normal não entra na área de staff')

// ------------------------------------------------------------ fila
console.log('\nFila')
for (let i = 0; i < 9; i++) await rpc(uids[i], 'entrar_fila')
let fila = await rpc(uids[0], 'estado_fila')
ok(fila.naFila && fila.contagem === 9, 'com 9 na fila ainda não há partida')
await rpc(uids[9], 'entrar_fila')
let partida = await rpc(uids[0], 'partida_ativa')
ok(partida?.estado === 'READY_CHECK' && partida.jogadores.length === 10, 'o 10.º jogador cria a partida em READY_CHECK')
ok((await rpc(uids[0], 'estado_fila')).contagem === 0, 'a fila esvazia')
await falha(rpc(uids[0], 'entrar_fila'), 'partida a decorrer', 'não se entra na fila com uma partida ativa')
const mid = partida.id

// ------------------------------------------------------------ confirmação
console.log('\nConfirmação')
for (let i = 0; i < 9; i++) await rpc(uids[i], 'responder_confirmacao', { p_match: mid, p_aceita: true })
partida = await rpc(uids[0], 'avancar_partida', { p_match: mid })
ok(partida.estado === 'READY_CHECK', 'com 9 de 10 aceites continua à espera')
await rpc(uids[9], 'responder_confirmacao', { p_match: mid, p_aceita: true })
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'DRAFT_PHASE', 'todos aceitaram: DRAFT_PHASE')
ok(partida.capitaoA === pid(0) && partida.capitaoB === pid(1), 'capitães são os dois ranks oficiais mais altos (A = o mais alto)')

// ------------------------------------------------------------ draft
console.log('\nDraft')
await falha(rpc(uids[1], 'escolher_jogador', { p_match: mid, p_jogador: pid(5) }), 'não é a tua vez', 'o Capitão B não escolhe primeiro')
for (let n = 0; n < 8; n++) {
  const p = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
  const capitao = n % 2 === 0 ? p.capitaoA : p.capitaoB
  const livre = p.jogadores.find((j) => !j.equipa)
  await rpc(uidDe(capitao), 'escolher_jogador', { p_match: mid, p_jogador: livre.perfilId })
}
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'MAP_BAN', 'oito escolhas alternadas: MAP_BAN')
ok(partida.jogadores.filter((j) => j.equipa === 'A').length === 5 && partida.jogadores.filter((j) => j.equipa === 'B').length === 5, 'equipas de 5')

// ------------------------------------------------------------ bans
console.log('\nBans')
const pool = ['Abyss', 'Ascent', 'Bind', 'Breeze', 'Corrode', 'Fracture', 'Haven', 'Icebox', 'Lotus', 'Pearl', 'Split', 'Summit']
for (let n = 0; n < pool.length; n++) {
  const quem = n % 2 === 0 ? uids[0] : uids[1]
  if (n === 1) await falha(rpc(quem, 'banir_mapa', { p_match: mid, p_mapa: 'Abyss' }), 'não está disponível', 'não se bane um mapa já banido')
  await rpc(quem, 'banir_mapa', { p_match: mid, p_mapa: pool[n] })
}
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'LOBBY_CREATION' && partida.mapa === 'Sunset', '12 bans: sobra o Sunset e passa a LOBBY_CREATION')

// ------------------------------------------------------------ código
console.log('\nCódigo do grupo')
await falha(rpc(uids[1], 'definir_codigo', { p_match: mid, p_codigo: 'ABC123' }), 'Equipa A', 'só o Capitão A partilha o código')
await falha(rpc(uids[0], 'definir_codigo', { p_match: mid, p_codigo: 'AB12' }), '6 letras', 'o código tem 6 caracteres')
await rpc(uids[0], 'definir_codigo', { p_match: mid, p_codigo: 'x7k2pq' })
partida = await rpc(uids[3], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'IN_PROGRESS' && partida.codigoGrupo === 'X7K2PQ', 'IN_PROGRESS e os jogadores veem o código')
ok((await rpc(uids[10], 'partida_detalhe', { p_match: mid })).codigoGrupo === null, 'quem não está na partida não vê o código')
ok((await como(uids[10], `select * from match_secrets`)).length === 0, 'nem lendo a tabela diretamente')

// ------------------------------------------------------------ resultado
console.log('\nResultado')
await falha(rpc(uids[0], 'submeter_resultado', { p_match: mid, p_a: 13, p_b: 9 }), '15 minutos', 'o resultado está bloqueado durante 15 minutos')
await raiz(`update matches set phase_deadline = now() - interval '1 second' where id = $1`, [mid])
partida = await rpc(uids[0], 'avancar_partida', { p_match: mid })
ok(partida.estado === 'RESULT_SUBMISSION', 'acabado o bloqueio: RESULT_SUBMISSION')
await falha(rpc(uids[0], 'submeter_resultado', { p_match: mid, p_a: 13, p_b: 12 }), 'prolongamento', '13-12 não é válido')
await falha(rpc(uids[0], 'submeter_resultado', { p_match: mid, p_a: 15, p_b: 12 }), '2 rondas', '15-12 não é válido')
await falha(rpc(uids[4], 'submeter_resultado', { p_match: mid, p_a: 13, p_b: 9 }), 'capitães', 'só os capitães submetem')
await rpc(uids[0], 'submeter_resultado', { p_match: mid, p_a: 14, p_b: 12 })
await rpc(uids[1], 'submeter_resultado', { p_match: mid, p_a: 14, p_b: 12 })
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'PROCESSING_API' && partida.resultadoA === 14, 'resultados iguais: PROCESSING_API')

// A Edge Function devolve as estatísticas tiradas da Henrik Dev API.
const stats = partida.jogadores.map((j, i) => ({ perfilId: j.perfilId, kills: 10 + i, deaths: 12, assists: 4, acs: 180 + i * 10, firstBloods: i % 3, trades: i % 4, hsPct: 20 + i, kastPct: 65 + i }))
await servico(`select public.aplicar_resultado($1, null, null, $2)`, [mid, JSON.stringify(stats)])
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'COMPLETED' && partida.vencedor === 'A' && partida.estatisticas, 'aplicar_resultado fecha a partida com estatísticas')
ok(partida.jogadores.every((j) => j.trades != null && j.hsPct >= 20 && j.kastPct >= 65), 'guarda Trades, HS% e KAST%')

// Os pontos batem certo com a fórmula do site.
const divisao = (t) => (t >= 3 ? Math.min(25, t - 2) : 9)
const esperado = (j) => {
  const adv = partida.jogadores.filter((x) => x.equipa !== j.equipa).map((x) => divisao(x.tier))
  const dif = Math.round(adv.reduce((s, x) => s + x, 0) / adv.length) - divisao(j.tier)
  return (j.equipa === partida.vencedor ? 20 : -20) + Math.max(-8, Math.min(10, 3 * dif))
}
ok(partida.jogadores.every((j) => j.deltaPontos === esperado(j)), 'deltas de pontos iguais aos do site para os 10 jogadores')
const depois = await raiz(`select id, points, wins, losses from profiles`)
ok(partida.jogadores.every((j) => depois.find((p) => p.id === j.perfilId).points === 1000 + j.deltaPontos), 'os pontos foram aplicados aos perfis')
ok(partida.jogadores.filter((j) => j.mvp).length === 1 && partida.jogadores.find((j) => j.mvp).acs === Math.max(...stats.map((s) => s.acs)), 'MVP = maior ACS')
await falha(servico(`select public.aplicar_resultado($1, 13, 0, null)`, [mid]), 'à espera da API', 'não se aplica o resultado duas vezes')
const primeira = partida

// ------------------------------------------------------------ leituras
console.log('\nRanking, perfil e histórico')
const ranking = await rpc(uids[10], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: '' })
ok(ranking.total === 11 && ranking.linhas[0].perfil.pontos >= ranking.linhas[10].perfil.pontos, 'ranking com 11 jogadores, ordenado por pontos')
ok(ranking.linhas.some((l) => l.forma.length === 1), 'a forma (V/D) aparece no ranking')
ok((await rpc(uids[10], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: 'kaiser' })).total === 1, 'pesquisa por Riot ID')
const historico = await rpc(uids[0], 'historico', { p_perfil: null, p_minhas: true, p_mapa: null, p_offset: 0 })
ok(historico.linhas.length === 1 && historico.linhas[0].minha.venceu && historico.linhas[0].mapa === 'Sunset', 'histórico com a partida e o resumo do jogador')
const forma = await rpc(uids[0], 'forma_perfil', { p_perfil: pid(0), p_n: 20 })
ok(forma.length === 1 && forma[0].resultado === '14-12', 'forma do perfil')
const est = await rpc(uids[0], 'estatisticas_perfil', { p_perfil: pid(0) })
ok(est.partidas === 1 && est.vitorias === 1 && est.kda > 0, 'estatísticas do perfil')
const missoes = await rpc(uids[0], 'missoes')
ok(missoes.length === 8 && missoes.find((m) => m.tipo === 'jogos').progresso === 1 && missoes.find((m) => m.tipo === 'vitorias').progresso === 1, 'missões com progresso da semana')

// ------------------------------------------------------------ confirmação falhada
console.log('\nConfirmação falhada')
for (let i = 0; i < 10; i++) await rpc(uids[i], 'entrar_fila')
const m2 = (await rpc(uids[0], 'partida_ativa')).id
for (let i = 0; i < 9; i++) await rpc(uids[i], 'responder_confirmacao', { p_match: m2, p_aceita: true })
await raiz(`update matches set ready_deadline = now() - interval '1 second' where id = $1`, [m2])
partida = await rpc(uids[0], 'avancar_partida', { p_match: m2 })
ok(partida.estado === 'CANCELLED', 'prazo de 20 s esgotado: CANCELLED')
ok((await rpc(uids[9], 'estado_fila')).cooldownAte !== null, 'quem não aceitou fica de castigo')
fila = await rpc(uids[0], 'estado_fila')
ok(fila.naFila && fila.contagem === 9, 'os outros 9 voltam à fila')
await falha(rpc(uids[9], 'entrar_fila'), 'castigo', 'o castigado não volta à fila logo')
for (let i = 0; i < 9; i++) await rpc(uids[i], 'sair_fila')

// ------------------------------------------------------------ disputa
console.log('\nDisputa')
await raiz(`update profiles set cooldown_until = null`)
for (let i = 0; i < 10; i++) await rpc(uids[i], 'entrar_fila')
const m3 = (await rpc(uids[0], 'partida_ativa')).id
await raiz(`update match_players set accepted = true where match_id = $1`, [m3])
await rpc(uids[0], 'avancar_partida', { p_match: m3 })
await raiz(`update matches set state = 'RESULT_SUBMISSION', phase_deadline = now() + interval '1 hour', map = 'Bind', started_at = now() where id = $1`, [m3])
await raiz(`update match_players set team = case when profile_id in (select profile_id from match_players where match_id = $1 order by tier_snapshot desc limit 5) then 'A'::team else 'B'::team end where match_id = $1 and team is null`, [m3])
const p3 = await rpc(uids[0], 'partida_detalhe', { p_match: m3 })
await rpc(uidDe(p3.capitaoA), 'submeter_resultado', { p_match: m3, p_a: 13, p_b: 10 })
await rpc(uidDe(p3.capitaoB), 'submeter_resultado', { p_match: m3, p_a: 10, p_b: 13 })
ok((await rpc(uids[0], 'partida_detalhe', { p_match: m3 })).estado === 'DISPUTE', 'resultados diferentes: DISPUTE')
const disputas = await rpc(uids[0], 'disputas')
ok(disputas.length === 1, 'a staff vê a disputa')
await rpc(uids[0], 'resolver_disputa', { p_match: m3, p_a: 13, p_b: 10 })
ok((await rpc(uids[0], 'partida_detalhe', { p_match: m3 })).estado === 'COMPLETED', 'a staff resolve a disputa')

// ------------------------------------------------------------ ferramentas de teste
console.log('\nFerramentas de teste (Owner)')
const antes = (await rpc(uids[0], 'meu_perfil')).pontos
await rpc(uids[0], 'dev_simular_partida')
let sim = await rpc(uids[0], 'partida_ativa')
ok(sim.simulada && sim.automatica && sim.jogadores.filter((j) => j.bot).length === 9, 'simulação com 9 bots')
for (let i = 0; i < 40 && sim.estado !== 'COMPLETED'; i++) {
  // O tempo anda depressa: os prazos e as jogadas dos bots passam já.
  await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1 and accept_at > now()`, [sim.id])
  await raiz(`update matches set bot_move_at = least(bot_move_at, now() - interval '1 second'),
    phase_deadline = case when state in ('IN_PROGRESS', 'PROCESSING_API') then now() - interval '1 second' else phase_deadline end where id = $1`, [sim.id])
  sim = await rpc(uids[0], 'avancar_partida', { p_match: sim.id })
}
ok(sim.estado === 'COMPLETED' && sim.estatisticas && sim.bans.length === 12 && sim.codigoGrupo, 'a simulação corre sozinha até ao fim, com bans, código e estatísticas')
ok((await rpc(uids[0], 'meu_perfil')).pontos === antes, 'a simulação não mexe nos pontos reais')
ok((await rpc(uids[0], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: false, p_pesquisa: '' })).total === 11, 'os bots não aparecem no ranking')
await rpc(uids[0], 'dev_encher_fila', { p_ser_capitao: true })
sim = await rpc(uids[0], 'partida_ativa')
await rpc(uids[0], 'responder_confirmacao', { p_match: sim.id, p_aceita: true })
await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1`, [sim.id])
sim = await rpc(uids[0], 'avancar_partida', { p_match: sim.id })
ok(sim.estado === 'DRAFT_PHASE' && sim.capitaoA === pid(0), '"Ser capitão" põe o dev como Capitão A')
await raiz(`update matches set state = 'CANCELLED' where id = $1`, [sim.id])

// ------------------------------------------------------------ amigos, sugestões, funções
console.log('\nAmigos, sugestões e funções')
await rpc(uids[2], 'pedir_amizade', { p_alvo: 'kaiser#eu0' })
ok((await rpc(uids[0], 'amigos'))[0]?.direcao === 'recebido', 'pedido de amizade por Riot ID')
await rpc(uids[0], 'responder_amizade', { p_perfil: pid(2), p_aceitar: true })
ok((await rpc(uids[2], 'amigos'))[0]?.estado === 'aceite', 'pedido aceite')
ok((await rpc(uids[0], 'ranking', { p_offset: 0, p_limite: 50, p_so_amigos: true, p_pesquisa: '' })).total === 2, 'ranking só com amigos')
await rpc(uids[3], 'criar_sugestao', { p_titulo: 'Fila por função', p_categoria: 'Fila', p_descricao: 'Escolher a função antes de entrar na fila.' })
let sug = await rpc(uids[4], 'sugestoes', { p_ordem: 'votos' })
ok(sug.length === 1 && sug[0].votos === 1 && !sug[0].votei, 'sugestão criada com o voto do autor')
await rpc(uids[4], 'votar', { p_sugestao: sug[0].id })
sug = await rpc(uids[4], 'sugestoes', { p_ordem: 'votos' })
ok(sug[0].votos === 2 && sug[0].votei, 'votar soma um voto')
await rpc(uids[4], 'votar', { p_sugestao: sug[0].id })
ok((await rpc(uids[4], 'sugestoes', { p_ordem: 'votos' }))[0].votos === 1, 'votar outra vez retira o voto')
await rpc(uids[5], 'denunciar', { p_alvo: pid(6), p_motivo: 'Abandono', p_detalhes: 'Saiu na ronda 6 e não voltou.' })
ok((await rpc(uids[0], 'denuncias')).length === 1, 'a staff vê a denúncia')
ok((await como(uids[5], 'select * from reports')).length === 0, 'quem denuncia não lê as denúncias')
await rpc(uids[0], 'definir_funcao', { p_perfil: pid(1), p_funcao: 'mod' })
await falha(rpc(uids[1], 'definir_funcao', { p_perfil: pid(2), p_funcao: 'dev' }), 'Owner e Dev', 'um Mod não muda funções')
await falha(rpc(uids[0], 'definir_funcao', { p_perfil: pid(0), p_funcao: 'user' }), 'própria função', 'ninguém muda a própria função')

// ------------------------------------------------------------ fotos de perfil
console.log('\nFotos de perfil')
const base = 'https://abc.supabase.co/storage/v1/object/public/avatars'
const foto = await rpc(uids[3], 'definir_avatar', { p_url: `${base}/${uids[3]}/1712.webp` })
ok(foto.avatarUrl === `${base}/${uids[3]}/1712.webp`, 'guarda uma foto da própria pasta')
await falha(rpc(uids[3], 'definir_avatar', { p_url: `${base}/${uids[4]}/1712.webp` }), 'Imagem inválida', 'não aceita a foto da pasta de outra pessoa')
await falha(rpc(uids[3], 'definir_avatar', { p_url: `${base}/${uids[3]}/anim.gif` }), 'Imagem inválida', 'não aceita GIFs')
await falha(rpc(uids[3], 'definir_avatar', { p_url: 'https://site-malicioso.com/x.png' }), 'Imagem inválida', 'não aceita endereços de fora')
await raiz(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url": "https://cdn.discordapp.com/a.png"}' where id = $1`, [uids[3]])
ok((await rpc(uids[3], 'definir_avatar', { p_url: null })).avatarUrl === 'https://cdn.discordapp.com/a.png', 'remover a foto volta à do Discord')
const bucket = (await raiz(`select allowed_mime_types from storage.buckets where id = 'avatars'`))[0]
ok(bucket?.allowed_mime_types.join() === 'image/png,image/jpeg,image/webp', 'o bucket só aceita PNG, JPG e WebP')

// ------------------------------------------------------------ remover partidas e acertar pontos
console.log('\nRemover partidas e acertar pontos')
const pontosAntes = await raiz('select id, points, wins, losses from profiles')
await falha(rpc(uids[1], 'remover_partida', { p_match: mid }), 'Owner e Dev', 'um Mod não remove partidas')
await rpc(uids[0], 'remover_partida', { p_match: mid })
ok((await rpc(uids[0], 'partida_detalhe', { p_match: mid })) === null, 'a partida desaparece do histórico')
const pontosDepois = await raiz('select id, points, wins, losses from profiles')
ok(primeira.jogadores.every((j) => {
  const a = pontosAntes.find((p) => p.id === j.perfilId)
  const d = pontosDepois.find((p) => p.id === j.perfilId)
  return d.points === a.points - j.deltaPontos && d.wins + d.losses === a.wins + a.losses - 1
}), 'os pontos, as vitórias e as derrotas da partida são devolvidos')
await rpc(uids[0], 'dev_encher_fila', { p_ser_capitao: false })
const ativaDev = await rpc(uids[0], 'partida_ativa')
await falha(rpc(uids[0], 'remover_partida', { p_match: ativaDev.id }), 'Cancela a partida', 'uma partida a decorrer não se remove')
await rpc(uids[0], 'cancelar_partida', { p_match: ativaDev.id })
await rpc(uids[0], 'remover_partida', { p_match: ativaDev.id })
ok((await rpc(uids[0], 'partida_detalhe', { p_match: ativaDev.id })) === null, 'uma partida cancelada também se remove')
await rpc(uids[0], 'definir_pontos', { p_perfil: pid(5), p_pontos: 1337 })
ok((await raiz('select points from profiles where id = $1', [pid(5)]))[0].points === 1337, 'o Owner acerta os pontos de um jogador')
await falha(rpc(uids[0], 'definir_pontos', { p_perfil: pid(5), p_pontos: -4 }), 'entre 0 e 10000', 'não aceita pontos negativos')
await falha(rpc(uids[4], 'definir_pontos', { p_perfil: pid(5), p_pontos: 2000 }), 'Owner e Dev', 'um jogador normal não mexe em pontos')
ok((await rpc(uids[0], 'estado_fila')).agora != null, 'o estado da fila traz a hora do servidor')

// ------------------------------------------------------------ fila com amigos e bots
console.log('\nFila com amigos e bots')
await raiz('update profiles set cooldown_until = null')
await rpc(uids[0], 'entrar_fila')
await rpc(uids[2], 'entrar_fila') // amigo do Owner (ficaram amigos mais acima)
await rpc(uids[7], 'entrar_fila') // um estranho na mesma fila
await falha(rpc(uids[2], 'dev_completar_fila', { p_ser_capitao: false }), 'Owner e Dev', 'um jogador normal não completa a fila')
await rpc(uids[0], 'dev_completar_fila', { p_ser_capitao: true })
const comAmigo = await rpc(uids[0], 'partida_ativa')
ok(comAmigo?.simulada && comAmigo.jogadores.length === 10, 'cria uma partida simulada de 10')
ok(comAmigo.jogadores.some((j) => j.perfilId === pid(2)) && comAmigo.jogadores.filter((j) => j.bot).length === 8, 'entra o amigo e o resto são 8 bots')
ok(!comAmigo.jogadores.some((j) => j.perfilId === pid(7)) && (await rpc(uids[7], 'estado_fila')).naFila, 'o estranho fica na fila, fora da partida')
ok((await rpc(uids[2], 'partida_ativa'))?.id === comAmigo.id, 'o amigo vê a mesma partida')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
