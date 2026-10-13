/**
 * Copia o catálogo da loja (src/lib/loja.ts) para a migração do Supabase
 * (supabase/migrations/0015_loja.sql), entre os marcadores loja:itens.
 * Corre isto sempre que mudares um item, um preço ou uma raridade:
 *
 *   node scripts/gerar-loja-sql.mjs
 *
 * Depois corre outra vez a 0015 no SQL Editor (não estraga nada).
 */
import { readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url)
const ts = readFileSync(new URL('src/lib/loja.ts', raiz), 'utf8')
const inicio = ts.indexOf('export const ITENS_LOJA')
const lista = ts.slice(ts.indexOf('[', ts.indexOf('=', inicio)), ts.indexOf('\n]', inicio) + 2)
// O catálogo é só objetos literais: dá para o ler como JavaScript.
const itens = new Function(`return ${lista}`)()

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const linhas = itens.map((i, n) => `  (${q(i.id)}, ${q(i.categoria)}, ${q(i.raridade)}, ${i.preco}, ${i.conquista ? 'true' : 'false'}, ${n + 1})`)
const bloco = [
  '-- loja:itens:inicio',
  'insert into public.shop_items (id, category, rarity, price, achievement, sort) values',
  linhas.join(',\n'),
  'on conflict (id) do update set category = excluded.category, rarity = excluded.rarity, price = excluded.price, achievement = excluded.achievement, sort = excluded.sort;',
  `delete from public.shop_items where id not in (${itens.map((i) => q(i.id)).join(', ')});`,
  '-- loja:itens:fim',
].join('\n')

const caminho = new URL('supabase/migrations/0015_loja.sql', raiz)
const sql = readFileSync(caminho, 'utf8')
const a = sql.indexOf('-- loja:itens:inicio')
const b = sql.indexOf('-- loja:itens:fim')
if (a < 0 || b < 0) throw new Error('Faltam os marcadores loja:itens na 0015.')
writeFileSync(caminho, sql.slice(0, a) + bloco + sql.slice(b + '-- loja:itens:fim'.length))
console.log(`${itens.length} itens copiados para a 0015.`)
