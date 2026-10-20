import { useCallback, useEffect, useState } from 'react'
import { aoMudarDados, dados, type EstadoDiscord } from '@/lib/data'

/** Uma verificação recente chega: o Discord só é perguntado outra vez depois disto. */
const VALIDADE_MS = 10 * 60_000

/**
 * Se a fila exige o servidor de Discord e se o jogador está lá. Confirma com o
 * bot ao abrir a página (se a última confirmação for antiga) e quando o jogador
 * volta ao separador, que é o que acontece depois de entrar no servidor.
 */
export function useDiscordFila() {
  const [estado, setEstado] = useState<EstadoDiscord | null>(null)
  const [aVerificar, setAVerificar] = useState(false)

  const verificar = useCallback(async (forcar: boolean) => {
    try {
      const base = await dados.estadoDiscord(false)
      const recente = base.membro && base.verificadoEm && Date.now() - new Date(base.verificadoEm).getTime() < VALIDADE_MS
      // No modo demo não há bot: só o botão "Já entrei" faz de conta que entraste.
      if (!base.obrigatorio || (recente && !forcar) || (!forcar && dados.modo === 'demo')) { setEstado(base); return base }
      setAVerificar(true)
      const novo = await dados.estadoDiscord(true)
      setEstado(novo)
      return novo
    } catch {
      // Sem resposta do Discord: o servidor decide na hora de entrar na fila.
      return null
    } finally {
      setAVerificar(false)
    }
  }, [])

  useEffect(() => { verificar(false) }, [verificar])
  useEffect(() => aoMudarDados((t) => { if (t === 'staff' || t === 'fila') verificar(false) }), [verificar])
  useEffect(() => {
    if (!estado?.obrigatorio || estado.membro) return
    const voltar = () => { if (document.visibilityState === 'visible') verificar(dados.modo !== 'demo') }
    document.addEventListener('visibilitychange', voltar)
    return () => document.removeEventListener('visibilitychange', voltar)
  }, [estado, verificar])

  return {
    /** true só quando é obrigatório e o bot confirmou que não está no servidor. */
    bloqueado: !!estado?.obrigatorio && estado.membro === false,
    convite: estado?.convite ?? null,
    aVerificar,
    verificar: () => verificar(true),
  }
}
