import { ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { l } from '@/lib/idioma'

/**
 * Listas por partes: mostra as primeiras `passo` e um botão "Ver mais" que traz as seguintes. Quando a lista muda de
 * tamanho (um filtro, um item novo) volta ao princípio. Serve para a staff não ter centenas de cartões no ecrã ao mesmo tempo.
 */
export function useMais<T>(lista: T[], passo = 8) {
  const [n, setN] = useState(passo)
  const total = lista.length
  // Um filtro novo (a lista fica de outro tamanho) volta ao princípio; juntar um item a uma lista que já estava toda à vista, não.
  useEffect(() => { setN((v) => (v > passo && total <= passo ? passo : v)) }, [total, passo])
  return {
    visiveis: lista.slice(0, n),
    restam: Math.max(0, total - n),
    verMais: () => setN((v) => v + passo),
    passo,
  }
}

export function BotaoMais({ restam, passo, onClick }: { restam: number; passo: number; onClick: () => void }) {
  if (restam <= 0) return null
  return (
    <button type="button" className="btn btn-fantasma self-center" onClick={onClick}>
      <ChevronDown size={15} aria-hidden />{l(`Ver mais ${Math.min(passo, restam)}`, `Show ${Math.min(passo, restam)} more`)} <span className="text-mudo">({restam})</span>
    </button>
  )
}

/**
 * Uma secção que abre e fecha. Fechada, o conteúdo nem sequer se desenha (poupa trabalho ao browser e deixa o ecrã
 * curto); com `manter`, depois da primeira abertura o conteúdo fica na página, escondido, para não perder o que se escreveu.
 */
export function Colapsavel({ titulo, eyebrow, resumo, aberto: inicial = false, manter = false, children }: {
  titulo: ReactNode; eyebrow?: string; resumo?: ReactNode; aberto?: boolean; manter?: boolean; children: ReactNode
}) {
  const [aberto, setAberto] = useState(inicial)
  const [ja, setJa] = useState(inicial)
  return (
    <section className="flex flex-col rounded-[14px] border border-white/8 bg-white/[0.02]">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => { setAberto((v) => !v); setJa(true) }}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] bg-transparent px-4 py-3.5 text-left text-texto"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <span className="text-[14.5px] font-bold">{titulo}</span>
          {resumo && !aberto && <span className="text-[12.5px] text-mudo">{resumo}</span>}
        </span>
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-mudo transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {(aberto || (manter && ja)) && (
        <div hidden={!aberto} className="flex flex-col gap-3 border-t border-white/7 px-4 pt-4 pb-4">{children}</div>
      )}
    </section>
  )
}
