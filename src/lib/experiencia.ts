/**
 * Rangify Experience: as missões dão XP e o XP dá o nível.
 * Passar do nível N para o N+1 custa 400 + 100 x N (a mesma conta do Supabase, em _nivel).
 */
export function custoNivel(n: number) {
  return 400 + 100 * n
}

export function nivelDe(xp: number) {
  let nivel = 1
  let resto = Math.max(0, Math.floor(xp))
  while (resto >= custoNivel(nivel)) {
    resto -= custoNivel(nivel)
    nivel++
  }
  return { nivel, xpNoNivel: resto, xpParaProximo: custoNivel(nivel) }
}

/** De 5 em 5 níveis há um marco no passe. */
export const eMarco = (n: number) => n % 5 === 0

export function formatarXp(n: number) {
  return n.toLocaleString('pt-PT').replace(/\./g, ' ')
}
