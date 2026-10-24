import { useEffect, useState } from 'react'

const GLIFOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

const semMovimento = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Um caractere que "se decifra" (ideia do Text Scramble Decoder do EasyUI): mostra glifos ao calhas e, passado o `atraso`,
 * assenta no verdadeiro. Serve para o código do grupo aparecer como se estivesse a ser descodificado. O texto real está sempre
 * no DOM para os leitores de ecrã; só o que se vê é que muda.
 */
export function CaractereDecifrado({ c, atraso = 0, duracao = 520 }: { c: string; atraso?: number; duracao?: number }) {
  const [visto, setVisto] = useState(() => (semMovimento() ? c : GLIFOS[Math.floor(Math.random() * GLIFOS.length)]))
  useEffect(() => {
    if (semMovimento()) { setVisto(c); return }
    const inicio = performance.now() + atraso
    const id = window.setInterval(() => {
      const t = performance.now()
      if (t < inicio) { setVisto(GLIFOS[Math.floor(Math.random() * GLIFOS.length)]); return }
      if (t >= inicio + duracao) { setVisto(c); window.clearInterval(id); return }
      setVisto(GLIFOS[Math.floor(Math.random() * GLIFOS.length)])
    }, 45)
    return () => window.clearInterval(id)
  }, [c, atraso, duracao])
  return (
    <>
      <span className="so-leitores">{c}</span>
      <span aria-hidden>{visto}</span>
    </>
  )
}
