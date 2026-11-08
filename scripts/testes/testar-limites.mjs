/**
 * Testa as migrações 0043 e 0044 num Postgres local (PGlite): os bots nunca repetem o Riot ID, o limite de pedidos, o
 * texto limpo antes de chegar às funções, o contrato das funções embrulhadas e o acesso de quem não entrou.
 *
 *   node scripts/testes/testar-limites.mjs      (corre também com npm run testar-sql)
 */
import { criarBase, migracao } from './_arnes.mjs'

const P = String.fromCodePoint

const t = await criarBase()
const { ok, falha, como, servico, anon, raiz, rpc } = t
const limpar = () => raiz('delete from limites_uso')
// Os limites são por janela de tempo: começar logo a seguir a uma mudança de janela, senão uma série de pedidos pode cair em duas.
const janelaFresca = async (segundos, margemMs) => { const resto = segundos * 1000 - (Date.now() % (segundos * 1000)); if (resto < margemMs) await new Promise((r) => setTimeout(r, resto + 200)) }

console.log('\nContas')
const uids = await t.criarContas(4, 'lim')
await raiz(`update profiles set riot_id = 'Lim' || username || '#EU1', official_tier = 24 where auth_id = any ($1::uuid[])`, [uids])
await raiz(`update profiles set role = 'owner' where auth_id = $1`, [uids[0]])
const perfis = await raiz(`select id, auth_id from profiles where auth_id = any ($1::uuid[])`, [uids])
const pid = (i) => perfis.find((p) => p.auth_id === uids[i]).id
ok(perfis.length === 4, '4 contas criadas')

console.log('\nBots com Riot ID único (0043)')
await raiz(`insert into profiles (username, riot_id, is_bot) select 'bot_t' || g, 'Bot0000#BOT', true from generate_series(1, 6) g`)
const bots = await raiz(`select riot_id from profiles where username like 'bot_t%'`)
ok(bots.length === 6 && new Set(bots.map((b) => b.riot_id.toLowerCase())).size === 6, 'seis bots a pedir o mesmo Riot ID ficam com seis diferentes')
ok(bots.filter((b) => b.riot_id === 'Bot0000#BOT').length === 1 && bots.every((b) => /^Bot[0-9A-F]{4,8}#BOT$/.test(b.riot_id)), 'o primeiro fica como pediu e os outros trocam para 8 caracteres')
await raiz(`insert into profiles (username, riot_id) values ('nao_bot', 'Qualquer#123')`)
ok((await raiz(`select riot_id from profiles where username = 'nao_bot'`))[0].riot_id === 'Qualquer#123', 'o Riot ID de quem não é bot não se toca')
await db_semBot()
async function db_semBot() {
  await raiz(`delete from profiles where username like 'bot_t%' or username = 'nao_bot'`)
}

console.log('\nMais texto disfarçado')
const disfarce = await raiz(`select public._texto($1) as t`, [P(0x3164) + 'Nome' + P(0x2800) + P(0xE0041) + P(0x3000) + P(0xA0)])
ok(disfarce[0].t === 'Nome', 'o preenchimento de Hangul, o braille em branco, as marcas de etiqueta, o espaço ideográfico e o espaço duro saem')
const branco = await raiz(`select public._texto($1) as t`, [P(0x3164) + P(0x2800)])
ok(branco[0].t === '', 'um nome feito só de caracteres que parecem vazios fica mesmo vazio (e a função original recusa-o)')
console.log('\nO texto chega limpo')
const bruto = await raiz(`select public._texto($1) as t`, [''])
ok(bruto.length === 1, 'a função de limpeza existe')
await falha(como(uids[1], `select public._texto('x')`), 'permission denied', 'só a base de dados chama a limpeza (um utilizador não)')
await limpar()
await rpc(uids[1], 'criar_sugestao', { p_titulo: 'Olá\u200B mun\u202Edo novo', p_categoria: 'geral', p_descricao: 'Uma descrição\u0007 com\u00AD lixo invisível e texto bastante.' })
const sug = (await raiz(`select title, description from suggestions order by created_at desc limit 1`))[0]
ok(sug.title === 'Olá mundo novo' && sug.description === 'Uma descrição com lixo invisível e texto bastante.', 'zero-width, direção invertida, controlo e hífen mole saem do título e da descrição')
await falha(rpc(uids[1], 'criar_sugestao', { p_titulo: 'x'.repeat(201), p_categoria: 'geral', p_descricao: 'Uma descrição com tamanho suficiente.' }), 'demasiado longo (máximo 200', 'um título gigante nem chega à função original')
await falha(rpc(uids[1], 'criar_sugestao', { p_titulo: 'Curto', p_categoria: 'geral', p_descricao: 'Uma descrição com tamanho suficiente.' }), 'pelo menos 6 caracteres', 'as regras da função original continuam (título curto demais)')
const programador = String.fromCodePoint(0x1F468, 0x200D, 0x1F4BB) // um emoji de várias peças, ligado por ZWJ
const emoji = await raiz(`select public._texto($1) as t`, [`${programador} ${String.fromCodePoint(0x200B)} equipa`])
ok(emoji[0].t === `${programador}  equipa`, 'o ZWJ que junta um emoji (e o ZWNJ de alguns alfabetos) fica; o espaço de largura zero sai')
const normal = await raiz(`select public._texto(E'  é \t linha\nnova  ') as t`)
ok(normal[0].t === 'é \t linha\nnova', 'normaliza (NFC), tira os espaços das pontas e deixa a tabulação e as mudanças de linha')

console.log('\nLimite de pedidos (0044)')
await limpar()
await janelaFresca(60, 15000)
let recusados = 0
let mensagem = ''
for (let i = 0; i < 31; i++) {
  try { await rpc(uids[2], 'entrar_fila', { p_fila: 'aberta' }) } catch (e) { if (e.message.includes('demasiados pedidos')) { recusados++; mensagem = e.message } }
}
ok(recusados === 1, 'ao 31.º pedido de entrar na fila dentro de um minuto, recusa (os 30 primeiros chegam à função original)')
ok(mensagem === 'Fizeste demasiados pedidos. Espera um momento e tenta outra vez.', 'a mensagem é a que o site mostra tal e qual')
ok((await rpc(uids[3], 'estado_fila')).naFila === false, 'quem fez menos pedidos não é afetado (o contador é por utilizador)')
await falha(rpc(uids[3], 'entrar_fila', { p_fila: 'casual' }), 'Escolhe a fila', 'e as regras da função original continuam a valer para ele')
const contador = (await raiz(`select n from limites_uso where chave = 'entrar_fila:' || $1 order by janela desc limit 1`, [uids[2]]))[0]
ok(contador?.n === 30, 'o contador guarda os pedidos concluídos (30): o recusado, como qualquer pedido que dá erro, é desfeito pelo PostgREST com tudo o resto')
await falha(como(uids[2], `select public._limitar_chave('x', 1, 1)`), 'permission denied', 'um utilizador não chama o contador diretamente')
await falha(como(uids[2], `select count(*) from limites_uso`), 'permission denied', 'nem lê a tabela dos contadores')
const edge = async (chave) => (await servico(`select public._limitar_chave($1, 2, 60) as r`, [chave]))[0].r
ok((await edge('edge:teste')) === true && (await edge('edge:teste')) === true, 'as funções de borda usam o mesmo contador: os dois primeiros pedidos cabem')
ok((await edge('edge:teste')) === false, 'o terceiro não cabe (devolve false, sem erro: a função de borda escolhe a resposta)')
ok((await edge('edge:outra')) === true, 'e outra chave tem o seu contador')
// Um contador antigo (janela passada) não conta e a limpeza apaga o que expirou.
await raiz(`insert into limites_uso (chave, janela, n, expira) values ('velho', 1, 99, now() - interval '1 day')`)
for (let i = 0; i < 200; i++) await servico(`select public._limitar_chave('limpeza', 100000, 60)`)
ok((await raiz(`select count(*)::int as n from limites_uso where chave = 'velho'`))[0].n === 0, 'a limpeza ao acaso apaga os contadores expirados')

console.log('\nO contrato das funções embrulhadas não mudou')
const nomes = ['criar_sugestao', 'votar', 'denunciar', 'pedir_amizade', 'usar_convite', 'pesquisar_jogadores', 'torneio_procurar_jogadores', 'perfil_por_riot', 'torneio_convidar', 'torneio_criar_equipa', 'torneio_renomear_equipa', 'torneio_acesso', 'torneio_staff_adicionar', 'entrar_fila', 'definir_codigo', 'definir_avatar', 'definir_avatar_gif', 'comprar_item', 'atualizar_perfil', 'definir_discord_fila', 'overlay_dados', 'ranking', 'criar_novidade', 'avisar_jogador', 'banir_da_fila', 'definir_fila_fechada']
const embrulhadas = await raiz(`select p.proname, (select count(*) from pg_proc b where b.pronamespace = p.pronamespace and b.proname = '_' || p.proname || '_base') as base
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any ($1) order by 1`, [nomes])
ok(embrulhadas.length === nomes.length && embrulhadas.every((f) => f.base === '1' || f.base === 1), `as ${nomes.length} funções têm o mesmo nome e uma base _<nome>_base`)
const dadoPorOmissao = await raiz(`select pg_get_function_arguments('public.entrar_fila'::regproc) as a`)
ok(/p_fila text DEFAULT 'aberta'/.test(dadoPorOmissao[0].a), 'entrar_fila continua a poder chamar-se sem argumentos (a extensão faz assim)')
await falha(como(uids[1], `select public._criar_sugestao_base('titulo longo', 'geral', 'descrição longa o bastante')`), 'permission denied', 'a função original já não se chama de fora')
await falha(como(uids[1], `select public._entrar_fila_base('aberta')`), 'permission denied', 'nem a do fila')

console.log('\nQuem não entrou')
await falha(anon(`select public.criar_sugestao('Um título', 'geral', 'Uma descrição longa o suficiente')`), 'permission denied', 'sem sessão não se cria uma sugestão')
await falha(anon(`select public.estado_fila()`), 'permission denied', 'nem se vê o estado da fila')
await falha(anon(`select public.meu_perfil()`), 'permission denied', 'nem o perfil')
await falha(anon(`select public.pesquisar_jogadores('a')`), 'permission denied', 'nem se pesquisam jogadores')
const abertas = (await raiz(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> 'overlay_dados' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).map((f) => f.proname)
ok(abertas.length === 0, 'só o overlay ficou aberto a quem não entrou (as políticas de segurança são todas para quem entrou, por isso eu() e e_staff() também se fecharam)')
ok((await anon(`select public.overlay_dados('chave-que-nao-existe') as r`))[0].r === null, 'o overlay do OBS continua a abrir sem conta')
await limpar()
await janelaFresca(60, 15000)
await raiz(`insert into overlay_chaves (profile_id, chave) values ($1, 'chave-limite')`, [pid(1)])
let overlayRecusado = 0
for (let i = 0; i < 305; i++) { try { await anon(`select public.overlay_dados('chave-limite')`) } catch (e) { if (e.message.includes('demasiados pedidos')) overlayRecusado++ } }
ok(overlayRecusado === 5, 'e uma chave que existe tem o seu limite (300 por minuto)')
ok((await raiz(`select count(*)::int as n from limites_uso where chave like 'overlay:%'`))[0].n === 1, 'chaves inventadas não criam contadores (só a que existe)')
ok((await anon(`select public.overlay_dados('outra-chave') as r`))[0].r === null, 'outra chave não é afetada')
ok((await rpc(uids[1], 'estado_fila')).naFila === false, 'quem entrou continua a poder usar as funções')
ok((await servico(`select count(*)::int as n from profiles`))[0].n >= 4, 'e a chave de serviço (funções de borda, bot) também continua a poder tudo o que podia')

console.log('\nCorrer outra vez')
await t.db.exec(migracao('0043_bots_ids_unicos.sql'))
await t.db.exec(migracao('0044_limites_e_entradas.sql'))
ok(true, 'correr a 0043 e a 0044 outra vez não dá erro')
// Uma migração antiga que recria uma função embrulhada tira-lhe o embrulho: voltar a correr a 0044 repõe-no.
await t.db.exec(migracao('0042_fechar_filas.sql'))
let semEmbrulho = (await raiz(`select position('_limitar' in prosrc) as p from pg_proc where proname = 'entrar_fila' and pronamespace = 'public'::regnamespace`))[0].p
ok(semEmbrulho === 0, 'recriar o entrar_fila (0042) tira o embrulho')
await t.db.exec(migracao('0044_limites_e_entradas.sql'))
semEmbrulho = (await raiz(`select position('_limitar' in prosrc) as p from pg_proc where proname = 'entrar_fila' and pronamespace = 'public'::regnamespace`))[0].p
ok(semEmbrulho > 0, 'a 0044 volta a embrulhá-lo')
await limpar()
await rpc(uids[1], 'entrar_fila', { p_fila: 'aberta' })
ok((await rpc(uids[1], 'estado_fila')).naFila === true, 'e o embrulho chama a versão nova da função (a do 0042)')

console.log('\nCorrer outra vez não estraga os embrulhos')
await t.db.exec(migracao('0044_limites_e_entradas.sql'))
const embrulhos = await raiz(`select p.proname, p.prosrc as corpo, b.prosrc as base from pg_proc p join pg_proc b on b.pronamespace = p.pronamespace and b.proname = '_' || p.proname || '_base' where p.pronamespace = 'public'::regnamespace and p.proname = any ($1)`, [nomes])
ok(embrulhos.length === nomes.length, 'todas as funções continuam com a sua base depois de a 0044 correr três vezes')
ok(embrulhos.every((e) => e.corpo.includes('_' + e.proname + '_base') && !e.base.includes('_' + e.proname + '_base')), 'cada embrulho chama a sua base e nenhuma base chama a si própria (sem recursão)')
await falha(rpc(uids[0], 'torneio_acesso', { p_torneio: pid(0), p_nome: 'x' }), 'Torneio', 'torneio_acesso responde com o erro da função original (não com um estouro de pilha)')
t.resumo()
