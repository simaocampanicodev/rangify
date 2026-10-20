import { useCallback, useEffect, useState } from 'react'
import { usePartida } from '@/contexts/Partida'
import type { FilaTipo } from '@/lib/data'

const CHAVE = 'rangify:fila-vista'

function lerGuardada(): FilaTipo {
  try { return localStorage.getItem(CHAVE) === 'ranked' ? 'ranked' : 'aberta' } catch { return 'aberta' }
}

/**
 * A fila que o Painel mostra: a última que a pessoa escolheu (fica guardada neste browser) e, ao entrar
 * numa fila, essa passa a ser a vista. Quem não tem rank para a ranked também a pode ver (fechada).
 */
export function useFilaVista(): [FilaTipo, (f: FilaTipo) => void] {
  const { fila } = usePartida()
  const [vista, setVista] = useState<FilaTipo>(lerGuardada)
  const emFila = fila?.naFila ? fila.fila : null
  useEffect(() => { if (emFila) setVista(emFila) }, [emFila])
  const escolher = useCallback((f: FilaTipo) => {
    setVista(f)
    try { localStorage.setItem(CHAVE, f) } catch { /* sem localStorage: vale só até recarregar */ }
  }, [])
  return [vista, escolher]
}
