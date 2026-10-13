import { useEffect, useState } from 'react'
import { agoraCerto } from '@/lib/tempo'

/**
 * A hora atual (acertada com o servidor), refrescada a cada `ms`, para as contagens.
 * Com ativo a false não refresca: quem usa isto não volta a desenhar-se a cada segundo à toa.
 */
export function useAgora(ms = 250, ativo = true) {
  const [agora, setAgora] = useState(() => agoraCerto())
  useEffect(() => {
    if (!ativo) return
    setAgora(agoraCerto())
    const t = window.setInterval(() => setAgora(agoraCerto()), ms)
    return () => window.clearInterval(t)
  }, [ms, ativo])
  return agora
}
