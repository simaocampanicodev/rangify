import { useCallback, useEffect, useState } from 'react'
import { usePartida } from '@/contexts/Partida'
import { armazemLocal } from '@/lib/armazem'
import type { FilaTipo } from '@/lib/data'

const CHAVE = 'rangify:fila-vista'

function lerGuardada(): FilaTipo {
  return armazemLocal.ler(CHAVE) === 'ranked' ? 'ranked' : 'aberta'
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
    armazemLocal.escrever(CHAVE, f)
  }, [])
  return [vista, escolher]
}
