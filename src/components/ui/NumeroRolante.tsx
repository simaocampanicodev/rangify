import { useEffect, useState } from 'react'

/**
 * Números que rolam (ideia do Animated Number Morph e do Badge do EasyUI): cada algarismo é uma coluna de 0 a 9 que desliza
 * até ao valor certo, por isso 1004 → 1019 só mexe nas colunas que mudaram. Ao montar começa em zero e conta até ao valor.
 * Aceita texto com sinal ou sufixo ("+12", "-8"): só os algarismos rolam. O valor real fica num texto escondido para os leitores de ecrã.
 */
export function NumeroRolante({ valor, className = '', contar = true }: { valor: number | string; className?: string; contar?: boolean }) {
  const texto = String(valor)
  // Na primeira vez mostra zeros e, no fotograma seguinte, passa ao valor: a transição faz a contagem.
  const [vivo, setVivo] = useState(!contar)
  useEffect(() => {
    if (vivo) return
    const id = window.setTimeout(() => setVivo(true), 60)
    return () => window.clearTimeout(id)
  }, [vivo])

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className="so-leitores">{texto}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {[...texto].map((c, i) => (
          /\d/.test(c)
            ? <Coluna key={texto.length - i} algarismo={vivo ? Number(c) : 0} />
            : <span key={texto.length - i}>{c}</span>
        ))}
      </span>
    </span>
  )
}

/** Uma coluna de algarismos: cada um ocupa uma linha (1em) e a coluna sobe ou desce até ao certo. */
function Coluna({ algarismo }: { algarismo: number }) {
  return (
    <span className="relative inline-block overflow-hidden align-bottom" style={{ height: '1em', lineHeight: 1, width: '0.62em' }}>
      <span className="absolute inset-x-0 top-0 flex flex-col" style={{ transform: `translateY(${-algarismo}em)`, transition: 'transform .75s cubic-bezier(.16, 1, .3, 1)' }}>
        {Array.from({ length: 10 }, (_, d) => <span key={d} className="block text-center" style={{ height: '1em', lineHeight: 1 }}>{d}</span>)}
      </span>
    </span>
  )
}
