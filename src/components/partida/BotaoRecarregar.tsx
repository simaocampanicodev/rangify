import { RefreshCw } from 'lucide-react'
import { useAcaoOcupada, useAvisos } from '@/contexts/Avisos'
import { dados, type RecargaPartida } from '@/lib/data'
import { l } from '@/lib/idioma'

/** Owner e Dev: volta a ler os dados de uma partida terminada e refaz o RS, o MVP e os pontos. */
export function BotaoRecarregar({ id, simulada, aoAcabar, pequeno = false }: { id: string; simulada: boolean; aoAcabar?: (r: RecargaPartida) => void; pequeno?: boolean }) {
  const avisar = useAvisos()
  const { ocupado: aCorrer, correr: executar } = useAcaoOcupada()
  const correr = async () => {
    const r = await executar(() => dados.recarregarPartida(id, simulada))
    if (!r) return
    const mudou = r.jogadores.filter((j) => j.antes !== j.depois).length
    avisar(l(`${r.codigo} recarregada: ${mudou} ${mudou === 1 ? 'jogador mudou' : 'jogadores mudaram'} de pontos.`, `${r.codigo} reloaded: ${mudou} ${mudou === 1 ? 'player' : 'players'} changed points.`))
    for (const a of r.avisos ?? []) avisar(a, 'erro')
    aoAcabar?.(r)
  }
  return (
    <button type="button" disabled={aCorrer} onClick={correr} className={`btn btn-fantasma ${pequeno ? '!min-h-8 !px-3 !text-[12.5px]' : ''}`}>
      <RefreshCw size={14} className={`text-laranja ${aCorrer ? 'animate-spin' : ''}`} aria-hidden />
      {aCorrer ? l('A recarregar…', 'Reloading…') : l('Recarregar dados', 'Reload data')}
    </button>
  )
}
