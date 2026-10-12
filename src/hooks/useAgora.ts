import { useEffect, useState } from 'react'

/** A hora atual, refrescada a cada `ms`, para contagens decrescentes. */
export function useAgora(ms = 250) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return agora
}
