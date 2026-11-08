import { useEffect, useState } from 'react'

/** Números que rolam: cada algarismo é uma coluna de 0 a 9 e só mexem os que mudaram. Aceita sinal e sufixo ("+12", "14:21"); o valor real fica num texto escondido para os leitores de ecrã. */
export function NumeroRolante({ valor, className = '', contar = true }: { valor: number | string; className?: string; contar?: boolean }) {
  const texto = String(valor)
  // Na primeira vez mostra zeros e, passado um instante, passa ao valor: a transição faz a contagem.
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

const ALGARISMOS = Array.from({ length: 10 }, (_, d) => d)

/**
 * Uma coluna de algarismos. Um "0" invisível dá à coluna o mesmo tamanho e a mesma linha de base do texto à volta; por cima
 * dele corre a pilha de 0 a 9, que sobe ou desce até ao certo. O recorte (contain: paint) esconde os outros e não alarga a área de deslocamento de quem está à volta.
 */
function Coluna({ algarismo }: { algarismo: number }) {
  return (
    <span className="relative inline-block" style={{ contain: 'paint' }}>
      <span style={{ visibility: 'hidden' }}>0</span>
      <span className="absolute inset-x-0 top-0 flex flex-col" style={{ height: '1000%', transform: `translateY(${-algarismo * 10}%)`, transition: 'transform .75s cubic-bezier(.16, 1, .3, 1)' }}>
        {ALGARISMOS.map((d) => <span key={d} className="grid flex-1 place-items-center">{d}</span>)}
      </span>
    </span>
  )
}
