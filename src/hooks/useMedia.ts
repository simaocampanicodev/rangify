import { useSyncExternalStore } from 'react'

/** Se a consulta CSS (por exemplo "(max-width: 639px)") se cumpre agora, e muda quando o ecrã muda. */
export function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (aviso) => {
      const m = window.matchMedia(consulta)
      m.addEventListener('change', aviso)
      return () => m.removeEventListener('change', aviso)
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}

/** Telemóvel: abaixo do breakpoint `sm` do Tailwind. */
export const useTelemovelPequeno = () => useMedia('(max-width: 639px)')
