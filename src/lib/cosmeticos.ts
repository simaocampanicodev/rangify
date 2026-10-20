import { useSyncExternalStore } from 'react'
import { aoMudarDados, dados } from './data'
import type { Cosmeticos } from './loja'

/**
 * O que cada jogador tem equipado, pedido aos poucos: os avatares de uma página
 * juntam-se num só pedido (até 200 de cada vez) e a resposta fica em memória.
 * Quando alguém compra ou equipa algo (ou a loja abre ou fecha), tudo é pedido de novo. Cada resposta vale 10 minutos:
 * passado esse tempo, volta a pedir-se (sem apagar o que já se vê), para apanhar o que os outros jogadores compraram.
 */
const VALIDADE = 10 * 60_000
const VAZIO: Cosmeticos = Object.freeze({})
const cache = new Map<string, Cosmeticos>()
const quando = new Map<string, number>()
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
      const agora = Date.now()
      parte.forEach((id) => { cache.set(id, r[id] ?? VAZIO); quando.set(id, agora) })
    }
    avisar()
  }, 30)
}

function pedir(id: string) {
  if (pendentes.has(id)) return
  pendentes.add(id)
  agendar()
}

export function esquecerCosmeticos() {
  cache.clear()
  quando.clear()
  avisar()
}

// Só a loja mexe nas decorações (comprar, equipar, abrir ou fechar). Os avisos de "perfil" e "staff" são frequentes e não
// as mudam: apagar tudo a cada um deles voltava a pedir as decorações de toda a gente.
aoMudarDados((o) => { if (o === 'loja') esquecerCosmeticos() })
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
  // Velha: mostra-se a que há e pede-se outra por trás.
  if (Date.now() - (quando.get(perfilId) ?? 0) > VALIDADE) pedir(perfilId)
  return c
}
