import { useEffect, useRef, useState } from 'react'

const visivelAgora = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

/** Se o separador está à frente. Com ele escondido, o site deixa de perguntar ao servidor. */
export function useVisivel() {
  const [visivel, setVisivel] = useState(visivelAgora)
  useEffect(() => {
    const mudou = () => setVisivel(visivelAgora())
    document.addEventListener('visibilitychange', mudou)
    return () => document.removeEventListener('visibilitychange', mudou)
  }, [])
  return visivel
}

/**
 * Corre fn a cada ms enquanto o separador está à frente (ms null: nunca).
 * Ao voltar ao separador corre logo, para os dados não ficarem velhos.
 */
export function useIntervalo(fn: () => void, ms: number | null) {
  const visivel = useVisivel()
  const ref = useRef(fn)
  ref.current = fn
  const antes = useRef(visivel)
  useEffect(() => {
    if (visivel && !antes.current) ref.current()
    antes.current = visivel
    if (!visivel || ms == null) return
    const t = window.setInterval(() => ref.current(), ms)
    return () => window.clearInterval(t)
  }, [visivel, ms])
}
