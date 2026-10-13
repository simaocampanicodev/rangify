import { useSyncExternalStore } from 'react'
import { aoMudarDados, dados } from './dados'
import type { Cosmeticos } from './loja'

/**
 * O que cada jogador tem equipado, pedido aos poucos: os avatares de uma página
 * juntam-se num só pedido (até 200 de cada vez) e a resposta fica em memória.
 * Quando alguém compra ou equipa algo (ou a loja abre ou fecha), tudo é pedido de novo.
 */
const VAZIO: Cosmeticos = Object.freeze({})
const cache = new Map<string, Cosmeticos>()
const pendentes = new Set<string>()
const ouvintes = new Set<() => void>()
let versao = 0
let agendado = false

function avisar() {
  versao++
  ouvintes.forEach((f) => f())
}

function agendar() {
  if (agendado) return
  agendado = true
  setTimeout(async () => {
    agendado = false
    const ids = [...pendentes]
    pendentes.clear()
    for (let i = 0; i < ids.length; i += 200) {
      const parte = ids.slice(i, i + 200)
      let r: Record<string, Cosmeticos> = {}
      try { r = await dados.cosmeticos(parte) } catch { /* sem decorações desta vez */ }
      parte.forEach((id) => cache.set(id, r[id] ?? VAZIO))
    }
    avisar()
  }, 30)
}

function pedir(id: string) {
  if (cache.has(id) || pendentes.has(id)) return
  pendentes.add(id)
  agendar()
}

export function esquecerCosmeticos() {
  cache.clear()
  avisar()
}

aoMudarDados((o) => { if (o === 'loja' || o === 'staff' || o === 'perfil') esquecerCosmeticos() })
// Outra conta vê outras coisas (a loja fechada só aparece a Owner e Dev).
dados.aoMudarSessao(esquecerCosmeticos)

const subscrever = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
const versaoAtual = () => versao

/** As decorações de um jogador (vazio enquanto não chegam, ou se não tiver nenhuma). */
export function useCosmeticos(perfilId: string | null | undefined): Cosmeticos {
  useSyncExternalStore(subscrever, versaoAtual)
  if (!perfilId) return VAZIO
  const c = cache.get(perfilId)
  if (!c) { pedir(perfilId); return VAZIO }
  return c
}
