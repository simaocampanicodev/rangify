import { useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { dados } from '@/lib/dados'
import { duracaoAte } from '@/lib/tempo'

/** Pede o rank oficial à Henrik Dev API, respeitando o intervalo de 6 horas. */
export function useSincronizarRank() {
  const acao = useAcao()
  const avisar = useAvisos()
  const [aSincronizar, setASincronizar] = useState(false)
  const sincronizar = async () => {
    setASincronizar(true)
    const r = await acao(() => dados.sincronizarRank())
    setASincronizar(false)
    if (!r) return
    if (r.atualizado) avisar('Rank oficial atualizado.')
    else avisar(`O rank já está atualizado. Podes voltar a sincronizar daqui a ${r.proximaEm ? duracaoAte(r.proximaEm) : 'umas horas'}.`)
  }
  return { sincronizar, aSincronizar }
}
