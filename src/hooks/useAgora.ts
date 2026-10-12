import { useEffect, useState } from 'react'
import { agoraCerto } from '@/lib/tempo'

/** A hora atual (acertada com o servidor), refrescada a cada `ms`, para as contagens. */
export function useAgora(ms = 250) {
  const [agora, setAgora] = useState(() => agoraCerto())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(agoraCerto()), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return agora
}
