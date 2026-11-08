import type { ReactNode } from 'react'

/**
 * A formatação do Discord (negrito, itálico, listas...) em React, para a pré-visualização dos avisos na Staff.
 * Cobre o que o Discord mostra dentro de um embed: **negrito**, *itálico*, __sublinhado__, ~~riscado~~, `código`, blocos
 * de código, > citações, listas, # títulos, -# texto pequeno, ||spoilers|| e [links](https://...).
 */

const LINK = '#00a8fc'

// Cada alternativa é um grupo; a ordem importa (os mais compridos primeiro).
const INLINE = new RegExp([
  '`([^`\\n]+)`', // 1 código
  '\\|\\|([\\s\\S]+?)\\|\\|', // 2 spoiler
  '\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)', // 3 texto, 4 endereço
  '\\*\\*\\*([\\s\\S]+?)\\*\\*\\*', // 5 negrito e itálico
  '\\*\\*([\\s\\S]+?)\\*\\*', // 6 negrito
  '__([\\s\\S]+?)__', // 7 sublinhado
  '~~([\\s\\S]+?)~~', // 8 riscado
  '\\*([^*\\n]+?)\\*', // 9 itálico com *
  '(?<![\\w])_([^_\\n]+?)_(?![\\w])', // 10 itálico com _
  '(https?:\\/\\/[^\\s<>()]+)', // 11 endereço solto
].join('|'), 'g')

function Spoiler({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[#1a1b1e] px-0.5 text-transparent transition-colors hover:text-[#dbdee1] focus:text-[#dbdee1]" tabIndex={0} title="Spoiler">
      {children}
    </span>
  )
}

/** Uma linha de texto com a formatação de dentro (negrito, itálico...). */
function emLinha(s: string, chave = ''): ReactNode[] {
  const partes: ReactNode[] = []
  let ultimo = 0
  let n = 0
  for (const m of s.matchAll(INLINE)) {
    const i = m.index ?? 0
    if (i > ultimo) partes.push(s.slice(ultimo, i))
    const k = `${chave}${n++}`
    if (m[1] != null) partes.push(<code key={k} className="rounded bg-[#1a1b1e] px-1 py-px font-mono text-[0.9em]">{m[1]}</code>)
    else if (m[2] != null) partes.push(<Spoiler key={k}>{emLinha(m[2], k)}</Spoiler>)
    else if (m[3] != null) partes.push(<a key={k} href={m[4]} target="_blank" rel="noreferrer noopener" style={{ color: LINK }} className="no-underline hover:underline">{emLinha(m[3], k)}</a>)
    else if (m[5] != null) partes.push(<strong key={k}><em>{emLinha(m[5], k)}</em></strong>)
    else if (m[6] != null) partes.push(<strong key={k}>{emLinha(m[6], k)}</strong>)
    else if (m[7] != null) partes.push(<u key={k}>{emLinha(m[7], k)}</u>)
    else if (m[8] != null) partes.push(<s key={k}>{emLinha(m[8], k)}</s>)
    else if (m[9] != null || m[10] != null) partes.push(<em key={k}>{emLinha((m[9] ?? m[10])!, k)}</em>)
    else if (m[11] != null) partes.push(<a key={k} href={m[11]} target="_blank" rel="noreferrer noopener" style={{ color: LINK }} className="no-underline hover:underline">{m[11]}</a>)
    ultimo = i + m[0].length
  }
  if (ultimo < s.length) partes.push(s.slice(ultimo))
  return partes
}

/** O texto inteiro: linha a linha, com os blocos (código, citações, listas, títulos). */
export function TextoDiscord({ texto }: { texto: string }) {
  const linhas = texto.replace(/\r\n/g, '\n').split('\n')
  const blocos: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    // Bloco de código: ``` até ao próximo ``` (ou ao fim).
    if (linha.trimStart().startsWith('```')) {
      // O que vem logo a seguir ao ``` é o nome da linguagem (```js), não é texto.
      const resto = linha.trimStart().slice(3)
      const corpo: string[] = []
      if (resto.includes('```')) corpo.push(resto.slice(0, resto.indexOf('```')))
      else {
        i++
        while (i < linhas.length && !linhas[i].includes('```')) corpo.push(linhas[i++])
        if (i < linhas.length && linhas[i].trimStart() !== '```') corpo.push(linhas[i].slice(0, linhas[i].indexOf('```')))
      }
      blocos.push(<pre key={k++} className="m-0 overflow-x-auto rounded-md border border-white/8 bg-[#1a1b1e] p-2 font-mono text-[0.88em] leading-snug whitespace-pre-wrap">{corpo.join('\n')}</pre>)
      i++
      continue
    }
    const titulo = /^(#{1,3})\s+(.+)$/.exec(linha)
    if (titulo) {
      const tamanho = ['text-[1.5em]', 'text-[1.25em]', 'text-[1.1em]'][titulo[1].length - 1]
      blocos.push(<div key={k++} className={`${tamanho} mt-1 leading-tight font-bold`}>{emLinha(titulo[2], `t${k}`)}</div>)
      i++
      continue
    }
    const pequeno = /^-#\s+(.+)$/.exec(linha)
    if (pequeno) {
      blocos.push(<div key={k++} className="text-[0.8em] text-[#949ba4]">{emLinha(pequeno[1], `p${k}`)}</div>)
      i++
      continue
    }
    if (/^>\s?/.test(linha)) {
      const citacao: string[] = []
      while (i < linhas.length && /^>\s?/.test(linhas[i])) citacao.push(linhas[i++].replace(/^>\s?/, ''))
      blocos.push(
        <div key={k++} className="flex gap-2.5">
          <span aria-hidden className="w-1 shrink-0 rounded bg-[#4e5058]" />
          <div>{citacao.map((c, j) => <div key={j}>{emLinha(c, `q${k}${j}`) }</div>)}</div>
        </div>,
      )
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(linha)) {
      const itens: { n: string | null; t: string }[] = []
      while (i < linhas.length && /^\s*([-*]|\d+\.)\s+/.test(linhas[i])) {
        const m = /^\s*(?:([-*])|(\d+)\.)\s+(.*)$/.exec(linhas[i])!
        itens.push({ n: m[2] ?? null, t: m[3] })
        i++
      }
      blocos.push(
        <ul key={k++} className="m-0 list-none p-0">
          {itens.map((it, j) => (
            <li key={j} className="flex gap-2 pl-2"><span aria-hidden className="shrink-0 text-[#b5bac1]">{it.n ? `${it.n}.` : '•'}</span><span>{emLinha(it.t, `l${k}${j}`)}</span></li>
          ))}
        </ul>,
      )
      continue
    }
    blocos.push(linha.trim() === '' ? <div key={k++} className="h-[1.1em]" aria-hidden /> : <div key={k++}>{emLinha(linha, `s${k}`)}</div>)
    i++
  }
  return <>{blocos}</>
}
