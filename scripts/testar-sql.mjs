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
  -- A publicação do Realtime, vazia como num projeto novo.
  create publication supabase_realtime;
`)

console.log('\nMigrações')
for (const f of ['0001_schema.sql', '0002_perfil.sql', '0003_estatisticas.sql', '0004_fila_amigos.sql', '0005_perfil_estatisticas.sql', '0006_rotacao_testes.sql', '0007_experiencia.sql', '0008_novidades_api.sql', '0009_situacao.sql', '0010_sugestoes_staff.sql', '0011_discord.sql', '0012_rangify_score.sql', '0013_recarregar_partida.sql', '0014_tempo_real.sql', '0015_loja.sql']) {
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
// A rotação de origem tem 7 mapas: 6 bans e sobra o Sunset.
const pool = ['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Split']
for (let n = 0; n < pool.length; n++) {
  const quem = n % 2 === 0 ? uids[0] : uids[1]
  if (n === 1) await falha(rpc(quem, 'banir_mapa', { p_match: mid, p_mapa: 'Abyss' }), 'não está disponível', 'não se bane um mapa já banido')
  await rpc(quem, 'banir_mapa', { p_match: mid, p_mapa: pool[n] })
}
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'LOBBY_CREATION' && partida.mapa === 'Sunset', '6 bans na rotação de 7: sobra o Sunset e passa a LOBBY_CREATION')

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
const AGENTES_TESTE = ['Jett', 'Sova', 'Omen', 'Killjoy', 'Raze', 'Skye', 'Viper', 'Cypher', 'Reyna', 'Fade']
const stats = partida.jogadores.map((j, i) => ({ perfilId: j.perfilId, kills: 10 + i, deaths: 12, assists: 4, acs: 180 + i * 10, firstBloods: i % 3, trades: i % 4, hsPct: 20 + i, kastPct: 65 + i, agente: AGENTES_TESTE[i] }))
await servico(`select public.aplicar_resultado($1, null, null, $2)`, [mid, JSON.stringify(stats)])
partida = await rpc(uids[0], 'partida_detalhe', { p_match: mid })
ok(partida.estado === 'COMPLETED' && partida.vencedor === 'A' && partida.estatisticas, 'aplicar_resultado fecha a partida com estatísticas')
ok(partida.jogadores.every((j) => j.trades != null && j.hsPct >= 20 && j.kastPct >= 65), 'guarda Trades, HS% e KAST%')

// O Rangify Score, com a mesma conta de src/lib/pontos.ts.
const rangifyScores = (js, rondas) => {
  const med = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length
  const b = js.map((j) => ({ acs: j.acs, kda: (j.kills + j.assists) / Math.max(1, j.deaths), kast: j.kastPct, tr: j.trades / Math.max(1, rondas) }))
  const m = { acs: med(b.map((x) => x.acs)), kda: med(b.map((x) => x.kda)), kast: med(b.map((x) => x.kast)), tr: med(b.map((x) => x.tr)) }
  const r = (x, y) => (y > 0 ? Math.min(2, Math.max(0.25, x / y)) : null)
  const pesos = { acs: 0.35, kda: 0.25, kast: 0.25, tr: 0.15 }
  return b.map((x) => {
    let soma = 0, peso = 0
    for (const k of Object.keys(pesos)) { const v = r(x[k], m[k]); if (v != null) { soma += v * pesos[k]; peso += pesos[k] } }
    return Math.round((100 * soma) / peso)
  })
}
const bonusRs = (rs) => { const x = (rs - 100) / 6; return Math.max(-6, Math.min(6, Math.sign(x) * Math.round(Math.abs(x)))) || 0 }
const rsEsperado = new Map(rangifyScores(stats, 26).map((v, i) => [stats[i].perfilId, v]))
ok(partida.jogadores.every((j) => j.rangifyScore === rsEsperado.get(j.perfilId)), 'Rangify Score igual ao do site para os 10 jogadores')
const mediaRs = partida.jogadores.reduce((t, j) => t + j.rangifyScore, 0) / 10
ok(mediaRs > 95 && mediaRs < 105, `o RS médio da partida anda à volta de 100 (${mediaRs})`)
ok(partida.jogadores.every((j) => j.agente === stats.find((s) => s.perfilId === j.perfilId).agente), 'guarda o agente de cada jogador')

// Os pontos batem certo com a fórmula do site: resultado, desnível e desempenho.
const divisao = (t) => (t >= 3 ? Math.min(25, t - 2) : 9)
const esperado = (j) => {
  const adv = partida.jogadores.filter((x) => x.equipa !== j.equipa).map((x) => divisao(x.tier))
  const dif = Math.round(adv.reduce((s, x) => s + x, 0) / adv.length) - divisao(j.tier)
  return (j.equipa === partida.vencedor ? 20 : -20) + Math.max(-8, Math.min(10, 3 * dif)) + bonusRs(rsEsperado.get(j.perfilId))
}
ok(partida.jogadores.every((j) => j.deltaPontos === esperado(j)), 'deltas de pontos iguais aos do site para os 10 jogadores')
ok(partida.jogadores.every((j) => j.deltaDesempenho === bonusRs(j.rangifyScore) && Math.abs(j.deltaDesempenho) <= 6), 'a parte do desempenho fica guardada e vai de -6 a +6')
ok(partida.jogadores.some((j) => j.deltaDesempenho > 0) && partida.jogadores.some((j) => j.deltaDesempenho < 0), 'quem joga melhor ganha pontos extra e quem joga pior perde')
const depois = await raiz(`select id, points, wins, losses from profiles`)
ok(partida.jogadores.every((j) => depois.find((p) => p.id === j.perfilId).points === 1000 + j.deltaPontos), 'os pontos foram aplicados aos perfis')
ok(partida.jogadores.filter((j) => j.mvp).length === 1 && partida.jogadores.find((j) => j.mvp).rangifyScore === Math.max(...partida.jogadores.map((j) => j.rangifyScore)), 'MVP = maior Rangify Score')
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
ok(est.kastPct >= 65 && est.hsPct >= 20 && est.tradesMedia != null && est.kd > 0, 'perfil com KAST, HS%, trades e K/D')
ok(est.sequenciaAtual === 1 && est.melhorSequencia === 1 && est.capitao.partidas === 1 && est.capitao.vitorias === 1, 'sequências e registo como capitão')
ok(est.porMapa.length === 1 && est.porMapa[0].mapa === 'Sunset' && est.porMapa[0].vitorias === 1, 'números por mapa')
ok(forma[0].acs != null && forma[0].rs === rsEsperado.get(pid(0)), 'a forma traz o ACS e o Rangify Score')
ok(est.rangifyScore === rsEsperado.get(pid(0)) && est.melhorRs === rsEsperado.get(pid(0)), 'o perfil traz o Rangify Score médio e o melhor')
ok(est.porAgente.length === 1 && est.porAgente[0].agente === stats.find((s) => s.perfilId === pid(0)).agente && est.porAgente[0].vitorias === 1, 'números por agente')
ok(est.porMapa[0].rs === rsEsperado.get(pid(0)), 'o RS também vem por mapa')
ok(historico.linhas[0].minha.rangifyScore === rsEsperado.get(pid(0)) && historico.linhas[0].minha.agente != null, 'o histórico traz o RS e o agente')
const missoes = await rpc(uids[0], 'missoes')
const porAmbito = (a) => missoes.filter((m) => m.ambito === a).length
ok(missoes.length === 16 && porAmbito('diaria') === 4 && porAmbito('semanal') === 8 && porAmbito('temporada') === 4, 'aparecem 4 diárias, 8 semanais e 4 de temporada')
ok(missoes.find((m) => m.id === 't-veterano').progresso === 1 && missoes.every((m) => m.xp > 0), 'missões com progresso e XP')
const xpInicial = await rpc(uids[0], 'experiencia')
ok(xpInicial.xp === missoes.filter((m) => m.concluida).reduce((t, m) => t + m.xp, 0), 'o XP é a soma das missões completas')

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
ok(sim.estado === 'COMPLETED' && sim.estatisticas && sim.bans.length === 6 && sim.codigoGrupo, 'a simulação corre sozinha até ao fim, com bans, código e estatísticas')
ok((await rpc(uids[0], 'meu_perfil')).pontos !== antes, 'a partida de teste também dá pontos')
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
await rpc(uids[0], 'cancelar_partida', { p_match: comAmigo.id })

// ------------------------------------------------------------ rotação de mapas
console.log('\nRotação de mapas')
ok((await rpc(uids[4], 'pool_mapas')).length === 7, 'a rotação começa com 7 mapas')
await falha(rpc(uids[4], 'definir_pool_mapas', { p_mapas: ['Ascent', 'Bind', 'Icebox'] }), 'Owner e Dev', 'um jogador normal não muda a rotação')
await falha(rpc(uids[0], 'definir_pool_mapas', { p_mapas: ['Ascent', 'Bind'] }), 'pelo menos 3', 'a rotação tem pelo menos 3 mapas')
await falha(rpc(uids[0], 'definir_pool_mapas', { p_mapas: ['Ascent', 'Bind', 'Inventado'] }), 'não existe', 'não aceita mapas inventados')
await rpc(uids[0], 'definir_pool_mapas', { p_mapas: ['Pearl', 'Ascent', 'Icebox', 'Bind'] })
ok((await rpc(uids[4], 'pool_mapas')).join() === 'Ascent,Bind,Icebox,Pearl', 'a staff troca os mapas da rotação')
const pontosAntesTeste = (await rpc(uids[0], 'meu_perfil')).pontos
await rpc(uids[0], 'dev_simular_partida')
let rot = await rpc(uids[0], 'partida_ativa')
ok(rot.pool.join() === 'Ascent,Bind,Icebox,Pearl', 'a partida nova usa a rotação nova')
for (let i = 0; i < 40 && rot.estado !== 'COMPLETED'; i++) {
  await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1 and accept_at > now()`, [rot.id])
  await raiz(`update matches set bot_move_at = least(bot_move_at, now() - interval '1 second'),
    phase_deadline = case when state in ('IN_PROGRESS', 'PROCESSING_API') then now() - interval '1 second' else phase_deadline end where id = $1`, [rot.id])
  rot = await rpc(uids[0], 'avancar_partida', { p_match: rot.id })
}
ok(rot.estado === 'COMPLETED' && rot.bans.length === 3 && ['Ascent', 'Bind', 'Icebox', 'Pearl'].includes(rot.mapa) && !rot.bans.some((b) => b.mapa === 'Sunset'), 'só os mapas da rotação entram nos bans (3 bans em 4 mapas)')
const delta = rot.jogadores.find((j) => j.perfilId === pid(0)).deltaPontos
ok((await rpc(uids[0], 'meu_perfil')).pontos === pontosAntesTeste + delta, 'os pontos da partida de teste entram no perfil')
const hist = await rpc(uids[0], 'historico', { p_perfil: pid(0), p_minhas: true, p_mapa: null, p_offset: 0 })
ok(hist.linhas.some((l) => l.id === rot.id), 'e a partida de teste aparece no histórico de quem a vê')
const jogosAntes = (await rpc(uids[0], 'estatisticas_perfil', { p_perfil: pid(0) })).partidas
await rpc(uids[0], 'remover_partida', { p_match: rot.id })
ok((await rpc(uids[0], 'meu_perfil')).pontos === pontosAntesTeste, 'remover a partida de teste devolve os pontos')
ok((await rpc(uids[0], 'estatisticas_perfil', { p_perfil: pid(0) })).partidas === jogosAntes - 1, 'e as estatísticas dela saem do perfil')
ok((await raiz('select count(*)::int as n from match_players where match_id = $1', [rot.id]))[0].n === 0, 'e saem da base de dados')

// ------------------------------------------------------------ Rangify Experience
console.log('\nRangify Experience')
const nivel = async (xp) => (await raiz('select public._nivel($1) as n', [xp]))[0].n
ok((await nivel(0)).nivel === 1 && (await nivel(499)).nivel === 1, 'começa no nível 1')
const n2 = await nivel(1099)
ok((await nivel(500)).nivel === 2 && n2.nivel === 2 && n2.xpNoNivel === 599 && n2.xpParaProximo === 600, 'cada nível custa 400 + 100 x nível')
await falha(como(uids[1], 'select public._atualizar_missoes($1, false)', [pid(1)]), 'permission denied', 'o XP não se dá a partir do browser')
await falha(rpc(uids[4], 'resetar_missoes'), 'Owner e Dev', 'um jogador normal não sorteia as missões')
const antesReset = await rpc(uids[0], 'missoes')
const xpAntesReset = (await rpc(uids[0], 'experiencia')).xp
const depoisReset = await rpc(uids[0], 'resetar_missoes')
const ids = (l, a) => l.filter((m) => m.ambito === a).map((m) => m.id)
ok(ids(depoisReset, 'diaria').length === 4 && !ids(depoisReset, 'diaria').some((i) => ids(antesReset, 'diaria').includes(i)), 'o reset sorteia 4 diárias novas, diferentes das anteriores')
ok(ids(depoisReset, 'semanal').length === 8 && ids(depoisReset, 'semanal').join() !== ids(antesReset, 'semanal').join(), 'e 8 semanais')
ok(depoisReset.filter((m) => m.ambito !== 'temporada').every((m) => m.progresso === 0), 'as missões novas começam do zero')
ok((await rpc(uids[0], 'experiencia')).xp === xpAntesReset, 'o XP já ganho fica depois do reset')

// Uma rotação diária com o Aquecimento, para a partida de teste o completar.
await raiz(`insert into quest_rotations (scope, started_at, quest_ids) values ('daily', now(), '{d-jogar,d-vitoria,d-kills,d-assist}')`)
await rpc(uids[0], 'dev_simular_partida')
let xpm = await rpc(uids[0], 'partida_ativa')
for (let i = 0; i < 40 && xpm.estado !== 'COMPLETED'; i++) {
  await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1 and accept_at > now()`, [xpm.id])
  await raiz(`update matches set bot_move_at = least(bot_move_at, now() - interval '1 second'),
    phase_deadline = case when state in ('IN_PROGRESS', 'PROCESSING_API') then now() - interval '1 second' else phase_deadline end where id = $1`, [xpm.id])
  xpm = await rpc(uids[0], 'avancar_partida', { p_match: xpm.id })
}
const exp1 = await rpc(uids[0], 'experiencia')
ok(xpm.estado === 'COMPLETED' && exp1.xp >= xpAntesReset + 100, 'acabar a partida dá logo o XP do Aquecimento, sem abrir as missões')
const miss1 = await rpc(uids[0], 'missoes')
ok(miss1.find((m) => m.id === 'd-jogar').concluida, 'e a missão aparece concluída')
ok((await raiz('select count(*)::int as n from quest_completions c join profiles p on p.id = c.profile_id where p.is_bot'))[0].n === 0, 'os bots não ganham XP')
const rn = await rpc(uids[4], 'ranking_nivel', { p_limite: 10 })
ok(rn[0].perfil.id === pid(0) && rn[0].xp === exp1.xp && rn[0].nivel === exp1.nivel && exp1.posicao === 1, 'o ranking de nível ordena por XP')
ok(exp1.total === 11 && exp1.xpSemana >= 100, 'experiência com o total de jogadores e o XP da semana')
await rpc(uids[0], 'remover_partida', { p_match: xpm.id })
ok((await rpc(uids[0], 'experiencia')).xp === xpAntesReset, 'remover a partida tira o XP das missões que ela completou')
ok(!(await rpc(uids[0], 'missoes')).find((m) => m.id === 'd-jogar').concluida, 'e a missão volta a estar por fazer')

// ------------------------------------------------------------ novidades e API
console.log('\nNovidades e Henrik Dev API')
const nov0 = await rpc(uids[4], 'novidades', { p_limite: 5 })
ok(nov0.length === 1 && nov0[0].titulo.includes('Temporada 1') && nov0[0].data === '2026-09-01', 'há uma novidade de origem')
await falha(rpc(uids[4], 'criar_novidade', { p_data: '2026-10-12', p_titulo: 'Olá a todos', p_texto: 'Texto de teste.' }), 'Owner e Dev', 'um jogador normal não publica novidades')
await falha(rpc(uids[0], 'criar_novidade', { p_data: '2026-10-12', p_titulo: 'Oi', p_texto: 'Texto de teste.' }), 'título', 'o título tem pelo menos 3 caracteres')
const nov1 = await rpc(uids[0], 'criar_novidade', { p_data: '2026-10-12', p_titulo: 'Missões diárias chegaram', p_texto: 'Agora há XP e níveis.' })
ok(nov1.length === 2 && nov1[0].titulo === 'Missões diárias chegaram' && nov1[0].data === '2026-10-12', 'a staff publica uma novidade e ela aparece primeiro')
const nov2 = await rpc(uids[0], 'apagar_novidade', { p_id: nov1[0].id })
ok(nov2.length === 1, 'e pode apagá-la')
await como(uids[1], 'update matches set api_checked_at = now()').catch(() => null)
ok((await raiz(`select count(*)::int as n from matches where api_checked_at is not null`))[0].n === 0, 'o browser não mexe na marca da última consulta à API')

// Uma partida real à espera da API fica 30 minutos antes de fechar sem estatísticas.
for (let i = 0; i < 10; i++) await rpc(uids[i], 'entrar_fila')
const real = (await rpc(uids[0], 'partida_ativa')).id
await raiz(`update matches set state = 'RESULT_SUBMISSION', score_a = null, score_b = null where id = $1`, [real])
await raiz(`update matches set state = 'PROCESSING_API', score_a = 13, score_b = 5 where id = $1`, [real])
const prazo = (await raiz(`select extract(epoch from phase_deadline - now())::int as s, simulated from matches where id = $1`, [real]))[0]
ok(!prazo.simulated && prazo.s > 29 * 60 && prazo.s <= 30 * 60, 'à espera da API: 30 minutos de prazo numa partida real')
await raiz(`update matches set state = 'CANCELLED', finished_at = now() where id = $1`, [real])

// ------------------------------------------------------------ situação numa só chamada
console.log('\nSituação (fila e partida numa só chamada)')
const s0 = await rpc(uids[0], 'situacao', { p_partida: null })
ok(s0.fila && s0.fila.naFila === false && s0.partida === null, 'sem partida: devolve a fila e partida vazia')
const terminadaId = (await raiz(`select id from matches where state = 'COMPLETED' order by finished_at desc limit 1`))[0].id
const s1 = await rpc(uids[0], 'situacao', { p_partida: terminadaId })
ok(s1.partida?.id === terminadaId && s1.partida.estado === 'COMPLETED', 'sem partida ativa: devolve a que o site ainda mostra (o resumo)')
for (let i = 0; i < 10; i++) await rpc(uids[i], 'entrar_fila')
const ativaAgora = (await rpc(uids[0], 'partida_ativa')).id
const s2 = await rpc(uids[0], 'situacao', { p_partida: terminadaId })
ok(s2.partida?.id === ativaAgora && s2.partida.estado === 'READY_CHECK' && s2.fila.naFila === false, 'com partida ativa: é essa que vem, mesmo com outra a ser mostrada')
await raiz(`update match_players set accept_at = now() - interval '1 second' where match_id = $1`, [ativaAgora])
await raiz(`update matches set ready_deadline = now() - interval '1 second' where id = $1`, [ativaAgora])
const s3 = await rpc(uids[0], 'situacao', { p_partida: ativaAgora })
ok(s3.partida?.id === ativaAgora && s3.partida.estado === 'DRAFT_PHASE', 'e avança a partida na mesma chamada (todos aceitaram: draft)')
await raiz(`update matches set state = 'CANCELLED', finished_at = now() where id = $1`, [ativaAgora])

// ------------------------------------------------------------ sugestões na staff
console.log('\nSugestões na staff')
await rpc(uids[5], 'criar_sugestao', { p_titulo: 'Modo torneio semanal', p_categoria: 'Eventos', p_descricao: 'Um torneio ao fim de semana com equipas fixas.' })
const alvoSug = (await rpc(uids[4], 'sugestoes', { p_ordem: 'recentes' }))[0]
await rpc(uids[4], 'votar', { p_sugestao: alvoSug.id })
await falha(rpc(uids[4], 'definir_estado_sugestao', { p_id: alvoSug.id, p_estado: 'planeada' }), 'equipa do Rangify', 'um jogador normal não muda o estado das sugestões')
await falha(rpc(uids[4], 'apagar_sugestao', { p_id: alvoSug.id }), 'equipa do Rangify', 'um jogador normal não apaga sugestões')
await rpc(uids[0], 'definir_estado_sugestao', { p_id: alvoSug.id, p_estado: 'planeada' })
ok((await rpc(uids[4], 'sugestoes', { p_ordem: 'recentes' })).find((s) => s.id === alvoSug.id).estado === 'planeada', 'a staff muda o estado e toda a gente o vê')
await falha(rpc(uids[0], 'definir_estado_sugestao', { p_id: alvoSug.id, p_estado: 'inventado' }), 'desconhecido', 'não aceita estados inventados')
await rpc(uids[0], 'apagar_sugestao', { p_id: alvoSug.id })
ok(!(await rpc(uids[4], 'sugestoes', { p_ordem: 'recentes' })).some((s) => s.id === alvoSug.id), 'a staff apaga a sugestão')
ok((await raiz('select count(*)::int as n from suggestion_votes where suggestion_id = $1', [alvoSug.id]))[0].n === 0, 'e os votos dela saem da base de dados')
await falha(rpc(uids[0], 'apagar_sugestao', { p_id: alvoSug.id }), 'já não existe', 'apagar duas vezes avisa que já não existe')

// ------------------------------------------------------------ Discord
console.log('\nDiscord')
await raiz(`insert into discord_config (url, segredo) values ('https://exemplo.supabase.co/functions/v1/discord-partida', 'segredo-de-teste') on conflict (id) do nothing`)
ok((await como(uids[1], 'select * from discord_config')).length === 0, 'o browser não lê o segredo do Discord')
for (let i = 0; i < 10; i++) await rpc(uids[i], 'entrar_fila')
const dPartida = (await rpc(uids[0], 'partida_ativa')).id
await raiz(`update match_players set team = case when profile_id in (select profile_id from match_players where match_id = $1 order by profile_id limit 5) then 'A'::team else 'B'::team end where match_id = $1`, [dPartida])
// Sem pg_net (como aqui), o pedido ao Discord falha em silêncio e a partida segue.
await raiz(`update matches set state = 'MAP_BAN' where id = $1`, [dPartida])
ok((await raiz(`select state from matches where id = $1`, [dPartida]))[0].state === 'MAP_BAN', 'o pedido ao Discord nunca trava a partida')
ok((await rpc(uids[0], 'discord_partida', { p_match: dPartida })) === null, 'sem canais criados, não há links')
await raiz(`insert into match_discord (match_id, estado, guild_id, texto_id, voz_a_id, voz_b_id) values ($1, 'criado', '111', '222', '333', '444')`, [dPartida])
const equipaDe = async (i) => (await raiz(`select team from match_players where match_id = $1 and profile_id = $2`, [dPartida, pid(i)]))[0].team
const links0 = await rpc(uids[0], 'discord_partida', { p_match: dPartida })
ok(links0.servidor === '111' && links0.chat === '222' && links0.call === ((await equipaDe(0)) === 'A' ? '333' : '444'), 'cada jogador recebe o chat e a call da sua equipa')
ok((await rpc(uids[10], 'discord_partida', { p_match: dPartida })) === null, 'quem não joga a partida não recebe links')
await raiz(`update matches set state = 'CANCELLED', finished_at = now() where id = $1`, [dPartida])
ok((await raiz(`select state from matches where id = $1`, [dPartida]))[0].state === 'CANCELLED', 'acabar a partida pede a limpeza sem erros')
await raiz(`delete from match_discord where match_id = $1`, [dPartida])
await raiz(`delete from discord_config`)

// ------------------------------------------------------------ Discord obrigatório para a fila
console.log('\nDiscord obrigatório para a fila')
const df0 = await rpc(uids[3], 'discord_fila')
ok(df0.obrigatorio === false && df0.membro === null, 'por defeito a fila não exige o Discord')
await falha(rpc(uids[3], 'definir_discord_fila', { p_obrigatorio: true, p_convite: 'https://discord.gg/rangify' }), 'Owner e Dev', 'só Owner e Dev mudam a regra')
await falha(rpc(uids[0], 'definir_discord_fila', { p_obrigatorio: true, p_convite: '' }), 'convite', 'não fica obrigatório sem convite')
await falha(rpc(uids[0], 'definir_discord_fila', { p_obrigatorio: true, p_convite: 'https://exemplo.pt/x' }), 'discord.gg', 'só aceita convites do Discord')
const df1 = await rpc(uids[0], 'definir_discord_fila', { p_obrigatorio: true, p_convite: 'https://discord.gg/rangify' })
ok(df1.obrigatorio && df1.convite === 'https://discord.gg/rangify', 'a staff torna o Discord obrigatório')
await como(uids[3], `update profiles set discord_member = true, discord_checked_at = now() where auth_id = $1`, [uids[3]]).catch(() => null)
ok((await raiz(`select discord_member from profiles where auth_id = $1`, [uids[3]]))[0].discord_member === null, 'um jogador não se marca a si próprio como membro')
await falha(rpc(uids[3], 'entrar_fila'), 'servidor de Discord', 'fora do servidor não entra na fila')
// O que a Edge Function verificar-discord grava depois de perguntar ao bot.
await raiz(`update profiles set discord_member = true, discord_checked_at = now() where auth_id = $1`, [uids[3]])
await rpc(uids[3], 'entrar_fila')
ok((await rpc(uids[3], 'estado_fila')).naFila, 'no servidor (verificado há pouco), entra na fila')
await rpc(uids[3], 'sair_fila')
await raiz(`update profiles set discord_checked_at = now() - interval '31 minutes' where auth_id = $1`, [uids[3]])
await falha(rpc(uids[3], 'entrar_fila'), 'servidor de Discord', 'uma verificação com mais de 30 minutos não chega')
await raiz(`update profiles set discord_member = false, discord_checked_at = now() where auth_id = $1`, [uids[3]])
await falha(rpc(uids[3], 'entrar_fila'), 'servidor de Discord', 'quem saiu do servidor fica fora da fila')
await rpc(uids[0], 'definir_discord_fila', { p_obrigatorio: false, p_convite: 'https://discord.gg/rangify' })
await rpc(uids[3], 'entrar_fila')
ok((await rpc(uids[3], 'estado_fila')).naFila, 'desligada a regra, volta a entrar sem Discord')
await rpc(uids[3], 'sair_fila')

// ------------------------------------------------------------ agentes e desempenho
console.log('\nAgentes e desempenho')
const simAg = await raiz(`select public._agente_simulado('Duelista', n) as a from generate_series(1, 8) n`)
ok(new Set(simAg.map((x) => x.a)).size === 8, 'a mesma função dá agentes diferentes a cada jogador')
const bon = (await raiz(`select public._bonus_desempenho(null) as a, public._bonus_desempenho(160) as b, public._bonus_desempenho(40) as c, public._bonus_desempenho(97) as d`))[0]
ok(bon.a === 0 && bon.b === 6 && bon.c === -6 && bon.d === bonusRs(97), 'sem RS vale 0, fica entre -6 e +6 e arredonda como o site')
await falha(como(uids[1], `select public._rangify_scores($1, 24)`, ['00000000-0000-0000-0000-000000000000']), 'permission denied', 'o RS não se calcula a partir do browser')

// ------------------------------------------------------------ recarregar uma partida jogada
console.log('\nRecarregar uma partida jogada')
const rec = (await raiz(`select id, simulated, points_applied from matches where state = 'COMPLETED' and points_applied order by finished_at desc limit 1`))[0]
// Como uma partida fechada antes da 0012: sem agentes, sem RS e com os pontos da fórmula antiga.
const jogRec = await raiz(`select profile_id, points_delta, coalesce(points_perf, 0) as perf from match_players where match_id = $1 and team is not null`, [rec.id])
for (const j of jogRec) {
  await raiz(`update match_players set agent = null, rangify_score = null, points_perf = null, points_delta = $3 where match_id = $1 and profile_id = $2`, [rec.id, j.profile_id, j.points_delta - j.perf])
  await raiz(`update profiles set points = points - $2 where id = $1`, [j.profile_id, j.perf])
}
const pontosAntesRec = new Map((await raiz(`select id, points from profiles`)).map((p) => [p.id, p.points]))
const agentesRec = jogRec.map((j, i) => ({ perfilId: j.profile_id, agente: AGENTES_TESTE[i % AGENTES_TESTE.length] }))
await falha(como(uids[0], `select public._recalcular($1, null)`, [rec.id]), 'permission denied', 'o recálculo interno não se chama do browser')
const r1 = await servico(`select public._recalcular($1, $2) as r`, [rec.id, JSON.stringify(agentesRec)])
const resRec = r1[0].r
const depoisRec = await raiz(`select mp.profile_id, mp.agent, mp.rangify_score, mp.points_delta, mp.points_perf, mp.mvp from match_players mp where mp.match_id = $1 and mp.team is not null`, [rec.id])
ok(resRec.jogadores.length === jogRec.length && depoisRec.every((j) => j.agent && j.rangify_score != null), 'recarregar dá agentes e RS a todos os jogadores')
ok(depoisRec.filter((j) => j.mvp).length === 1, 'e escolhe um MVP')
const perfisDepois = new Map((await raiz(`select id, points from profiles`)).map((p) => [p.id, p.points]))
ok(jogRec.every((j) => {
  const novo = depoisRec.find((d) => d.profile_id === j.profile_id)
  return perfisDepois.get(j.profile_id) - pontosAntesRec.get(j.profile_id) === novo.points_delta - (j.points_delta - j.perf)
}), 'cada jogador recebe só a diferença entre os pontos novos e os antigos')
ok(depoisRec.every((j) => j.points_perf === bonusRs(j.rangify_score)), 'a parte do desempenho fica guardada')
const r2 = (await servico(`select public._recalcular($1, null) as r`, [rec.id]))[0].r
const perfisOutraVez = new Map((await raiz(`select id, points from profiles`)).map((p) => [p.id, p.points]))
ok(r2.jogadores.every((j) => j.antes === j.depois) && jogRec.every((j) => perfisOutraVez.get(j.profile_id) === perfisDepois.get(j.profile_id)), 'recarregar outra vez não mexe em nada')
await raiz(`update matches set simulated = false where id = $1`, [rec.id])
await falha(rpc(uids[0], 'recalcular_partida', { p_match: rec.id }), 'Henrik Dev API', 'numa partida real, o recálculo sem API é recusado')
await raiz(`update matches set simulated = true where id = $1`, [rec.id])
await falha(rpc(uids[3], 'recalcular_partida', { p_match: rec.id }), 'Owner e Dev', 'só Owner e Dev recalculam')
const r3 = await rpc(uids[0], 'recalcular_partida', { p_match: rec.id })
ok(r3.jogadores.length === jogRec.length, 'numa partida de teste, Owner e Dev recalculam com o que ela já tem')
await raiz(`update matches set simulated = $2 where id = $1`, [rec.id, rec.simulated])

// ------------------------------------------------------------ tabela do Rangify Score
console.log('\nTabela do Rangify Score')
const trs = await rpc(uids[0], 'ranking_rs', { p_limite: 50, p_minimo: 1 })
ok(trs.minimo === 1 && trs.linhas.length > 0 && trs.linhas.every((l, i, a) => i === 0 || a[i - 1].media >= l.media), 'ordenada pela média de RS, da maior para a menor')
ok(trs.linhas.every((l) => l.partidas >= 1 && l.melhor >= l.media && !l.perfil.bot), 'cada linha traz as partidas e o melhor RS, sem bots')
ok(trs.eu && trs.eu.partidas >= 1 && trs.linhas.find((l) => l.perfil.id === pid(0))?.posicao === trs.eu.posicao, 'traz o próprio jogador com a posição dele')
const trs99 = await rpc(uids[0], 'ranking_rs', { p_limite: 50, p_minimo: 99 })
ok(trs99.linhas.length === 0 && trs99.eu && trs99.eu.posicao === null, 'sem partidas suficientes ninguém entra, mas o próprio vê a média')

// ------------------------------------------------------------ tempo real
console.log('\nTempo real')
const publicadas = (await raiz(`select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by tablename`)).map((x) => x.tablename)
ok(['friends', 'match_players', 'matches', 'queue_entries'].every((t) => publicadas.includes(t)), `amizades, fila e partidas no Realtime (${publicadas.join(', ')})`)
await db.exec(readFileSync(new URL('../supabase/migrations/0014_tempo_real.sql', import.meta.url), 'utf8'))
ok(true, 'correr a 0014 outra vez não dá erro')

// ------------------------------------------------------------ loja
console.log('\nLoja de Rangify Coins')
const jog = uids[5]
const fechada = await rpc(jog, 'loja')
ok(fechada.visivel === false, 'com a loja fechada, um jogador não a vê')
await falha(rpc(jog, 'comprar_item', { p_item: 'b-aro' }), 'ainda não está aberta', 'nem compra nada')
const lj = await rpc(uids[0], 'loja')
const itensLoja = new Map((await raiz(`select id, rarity, category, achievement, price from shop_items`)).map((i) => [i.id, i]))
const catHoje = lj.hoje.diarios.map((id) => itensLoja.get(id).category)
ok(lj.visivel && lj.staff && !lj.publica, 'o Owner vê a loja fechada ao público')
ok(lj.hoje.diarios.length === 8 && new Set(catHoje).size === 8, `8 diários, um de cada categoria (${lj.hoje.diarios.join(', ')})`)
ok(lj.hoje.diarios.every((id) => itensLoja.get(id).rarity !== 'lendario'), 'os diários nunca são lendários')
ok(lj.hoje.semanais.length === 2 && lj.hoje.semanais.every((id) => itensLoja.get(id).rarity === 'epico') && itensLoja.get(lj.hoje.semanais[0]).category !== itensLoja.get(lj.hoje.semanais[1]).category, 'dois semanais épicos de categorias diferentes')
ok(itensLoja.get(lj.hoje.destaque)?.rarity === 'lendario', 'o destaque é lendário')
ok(new Set([...lj.hoje.diarios, ...lj.hoje.semanais, lj.hoje.destaque]).size === 11, 'nenhum item aparece duas vezes')
ok(itensLoja.size === 109, 'o catálogo tem os 109 itens de src/lib/loja.ts')
const ganhas = lj.ganhas.porNivel + lj.ganhas.porMarcos + lj.ganhas.porSemanais + lj.ganhas.porMvp
ok(lj.moedas === ganhas && ganhas >= 0, `as coins são as do Experience (${lj.moedas})`)

await falha(rpc(jog, 'loja_moedas_teste', { p_quantidade: 5000 }), 'Owner e Dev', 'um jogador não dá coins a si próprio')
const lj2 = await rpc(uids[0], 'loja_moedas_teste', { p_quantidade: 10000 })
ok(lj2.moedas === lj.moedas + 10000 && lj2.ganhas.testes === 10000, 'o Owner dá 10 000 coins de teste a si próprio')
const hojeTodos = [...lj.hoje.diarios, ...lj.hoje.semanais, lj.hoje.destaque]
const fora = [...itensLoja.values()].find((i) => i.category === 'borda' && !hojeTodos.includes(i.id)).id
const lj3 = await rpc(uids[0], 'comprar_item', { p_item: fora })
ok(lj3.inventario.includes(fora) && lj3.equipados.borda === fora && lj3.moedas === lj2.moedas - itensLoja.get(fora).price, `o Owner compra um item que não está hoje na loja (${fora}) e fica equipado`)
await falha(rpc(uids[0], 'comprar_item', { p_item: fora }), 'Já tens', 'não compra o mesmo duas vezes')
const lj4 = await rpc(uids[0], 'comprar_item', { p_item: 't-topo' })
ok(lj4.equipados.titulo === 't-topo', 'para testar, o Owner também obtém títulos de conquista')

await rpc(uids[0], 'definir_loja_publica', { p_publica: true })
const ljJ = await rpc(jog, 'loja')
ok(ljJ.visivel && ljJ.publica && !ljJ.staff, 'aberta ao público, o jogador já a vê')
await falha(rpc(jog, 'comprar_item', { p_item: fora }), 'já não está na loja hoje', 'o jogador só compra o que está hoje na loja')
await falha(rpc(jog, 'comprar_item', { p_item: 't-mvp' }), 'ganha-se a jogar', 'nem títulos de conquista')
await raiz(`insert into coin_ledger (profile_id, delta, reason) values ($1, $2, 'teste')`, [pid(5), -ljJ.moedas])
await falha(rpc(jog, 'comprar_item', { p_item: ljJ.hoje.destaque }), 'coins suficientes', 'sem coins não compra')
await raiz(`insert into coin_ledger (profile_id, delta, reason) values ($1, 5000, 'teste')`, [pid(5)])
const diario = lj.hoje.diarios[0]
const ljJ2 = await rpc(jog, 'comprar_item', { p_item: diario })
ok(ljJ2.inventario.includes(diario), 'com coins, compra um diário')
const cos = await rpc(jog, 'cosmeticos', { p_ids: [pid(0), pid(5)] })
ok(cos[pid(0)]?.borda === fora && cos[pid(0)]?.titulo === 't-topo' && cos[pid(5)], 'os outros veem o que cada um tem equipado')
const ljJ3 = await rpc(jog, 'desequipar_item', { p_categoria: itensLoja.get(diario).category })
ok(!Object.values(ljJ3.equipados).includes(diario) && ljJ3.inventario.includes(diario), 'desequipar tira o item, mas fica no inventário')
const ljJ4 = await rpc(jog, 'equipar_item', { p_item: diario })
ok(Object.values(ljJ4.equipados).includes(diario), 'e volta a equipar')
await falha(rpc(jog, 'equipar_item', { p_item: fora }), 'Ainda não tens', 'não equipa o que não tem')

await falha(rpc(uids[0], 'definir_avatar_gif', { p_url: 'https://exemplo.pt/x.gif' }), 'Compra primeiro', 'a GIF de perfil precisa da Foto em GIF')
await rpc(uids[0], 'comprar_item', { p_item: 'gif' })
await falha(rpc(uids[0], 'definir_avatar_gif', { p_url: 'http://exemplo.pt/x.gif' }), 'https', 'só aceita links https de imagens')
const ljG = await rpc(uids[0], 'definir_avatar_gif', { p_url: 'https://media.tenor.com/abc/gato.gif' })
const cosG = await rpc(jog, 'cosmeticos', { p_ids: [pid(0)] })
ok(ljG.avatarGif && cosG[pid(0)]?.gif === 'https://media.tenor.com/abc/gato.gif', 'com o link, a GIF aparece aos outros')

const criadaEm = async () => (await raiz(`select created_at from shop_rotation order by day desc limit 1`))[0].created_at
const antesRes = await criadaEm()
await falha(rpc(jog, 'loja_resetar'), 'Owner e Dev', 'um jogador não sorteia a loja')
const ljR = await rpc(uids[0], 'loja_resetar')
ok(ljR.hoje.diarios.length === 8 && (await criadaEm()) > antesRes, 'o Owner sorteia a loja de hoje outra vez')
const ontem = ljR.hoje.diarios.slice()
await raiz(`update shop_rotation set day = day - 1 where day = (select max(day) from shop_rotation)`)
const ljN = await rpc(uids[0], 'loja')
ok(ljN.hoje.diarios.every((id) => !ontem.includes(id)), 'no dia seguinte, os diários de ontem não se repetem')
ok(JSON.stringify(ljN.hoje.semanais) === JSON.stringify(ljR.hoje.semanais) || new Date(ljN.hoje.dia).getUTCDay() === 1, 'os semanais ficam a semana toda')

const antesDev = await rpc(uids[0], 'loja')
const ljD = await rpc(uids[0], 'loja_devolver', { p_item: fora })
ok(!ljD.inventario.includes(fora) && ljD.moedas === antesDev.moedas + itensLoja.get(fora).price, 'devolver tira o item e devolve as coins')
const ljD2 = await rpc(uids[0], 'comprar_item', { p_item: fora })
ok(ljD2.inventario.includes(fora), 'e o item pode ser comprado outra vez')
const ljTudo = await rpc(uids[0], 'loja_devolver', { p_item: null })
ok(ljTudo.inventario.every((id) => itensLoja.get(id).achievement) && ljTudo.avatarGif === null && ljTudo.moedas === lj2.moedas, `devolver tudo deixa só o que se ganhou a jogar e repõe as coins (${ljTudo.inventario.join(', ')})`)
await falha(rpc(jog, 'loja_devolver', { p_item: null }), 'Owner e Dev', 'só Owner e Dev devolvem itens')

await rpc(uids[0], 'definir_loja_publica', { p_publica: false })
ok(JSON.stringify(await rpc(jog, 'cosmeticos', { p_ids: [pid(5)] })) === '{}', 'com a loja fechada, os jogadores não veem decorações')
await db.exec(readFileSync(new URL('../supabase/migrations/0015_loja.sql', import.meta.url), 'utf8'))
ok((await raiz(`select count(*)::int as n from shop_inventory where profile_id = $1`, [pid(5)]))[0].n >= 1, 'correr a 0015 outra vez não apaga inventários')

console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
process.exit(falhas ? 1 : 0)
