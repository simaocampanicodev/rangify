/**
 * Gera docs/migrations.md: uma tabela com cada migração e a primeira frase do que ela faz (lida do comentário
 * do topo do ficheiro). Volta a correr sempre que juntares uma migração:
 *
 *   node scripts/gerar-indice-migracoes.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const pasta = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const saida = fileURLToPath(new URL('../docs/migrations.md', import.meta.url))

function titulo(texto) {
  // O primeiro parágrafo do comentário do topo, até ao primeiro ponto final.
  const partes = []
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.startsWith('--')) break
    const s = linha.replace(/^--\s?/, '').trim()
    if (/^=+$/.test(s)) continue
    if (!s) { if (partes.length) break; continue }
    partes.push(s)
  }
  const junto = partes.join(' ').replace(/^Rangify:\s*/i, '').replace(/\s+/g, ' ')
  const fim = junto.search(/\.(\s|$)/)
  return (fim >= 0 ? junto.slice(0, fim + 1) : junto).replace(/\|/g, '\\|')
}

const linhas = readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort().map((f) => {
  const t = titulo(readFileSync(pasta + f, 'utf8'))
  return `| [\`${f}\`](../supabase/migrations/${f}) | ${t.charAt(0).toUpperCase() + t.slice(1)} |`
})

writeFileSync(saida, `# Migrações

O esquema, as regras e a máquina de estados do Rangify vivem em \`supabase/migrations/\`. Aplicam-se **por ordem**, uma vez cada, no **SQL Editor** do Supabase (ou com \`supabase db push\`). Cada ficheiro pode voltar a correr sem estragar nada.

- Para mudar a base de dados, cria sempre uma **migração nova**; nunca edites uma antiga.
- Cada migração tem o seu teste em \`scripts/\` (ver [arquitetura](architecture.md#testes)).
- Este índice gera-se com \`node scripts/gerar-indice-migracoes.mjs\`.

| Migração | O que faz |
| --- | --- |
${linhas.join('\n')}
`)
console.log(`${linhas.length} migrações em docs/migrations.md`)
