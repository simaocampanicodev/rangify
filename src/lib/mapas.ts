/**
 * Todos os mapas do modo 5v5 do Valorant. A arte oficial está em /public/mapas, em WebP
 * (960 px) e em /public/mapas/mini (192 px, para as miniaturas). Os .jpg são a origem:
 * node scripts/otimizar-mapas.mjs volta a gerar os WebP a partir deles.
 */
export interface Mapa { nome: string; locais: string; imagem: string }

export const MAPAS: Mapa[] = [
  { nome: 'Abyss', locais: 'A/B', imagem: '/mapas/abyss.webp' },
  { nome: 'Ascent', locais: 'A/B', imagem: '/mapas/ascent.webp' },
  { nome: 'Bind', locais: 'A/B', imagem: '/mapas/bind.webp' },
  { nome: 'Breeze', locais: 'A/B', imagem: '/mapas/breeze.webp' },
  { nome: 'Corrode', locais: 'A/B', imagem: '/mapas/corrode.webp' },
  { nome: 'Fracture', locais: 'A/B', imagem: '/mapas/fracture.webp' },
  { nome: 'Haven', locais: 'A/B/C', imagem: '/mapas/haven.webp' },
  { nome: 'Icebox', locais: 'A/B', imagem: '/mapas/icebox.webp' },
  { nome: 'Lotus', locais: 'A/B/C', imagem: '/mapas/lotus.webp' },
  { nome: 'Pearl', locais: 'A/B', imagem: '/mapas/pearl.webp' },
  { nome: 'Split', locais: 'A/B', imagem: '/mapas/split.webp' },
  { nome: 'Summit', locais: 'A/B', imagem: '/mapas/summit.webp' },
  { nome: 'Sunset', locais: 'A/B', imagem: '/mapas/sunset.webp' },
]

export const NOMES_MAPAS = MAPAS.map((m) => m.nome)

/** A arte do mapa; "mini" para as miniaturas pequenas (histórico, perfil). */
export function imagemMapa(nome: string | null | undefined, tamanho: 'grande' | 'mini' = 'grande'): string | undefined {
  const img = MAPAS.find((m) => m.nome === nome)?.imagem
  return img && tamanho === 'mini' ? img.replace('/mapas/', '/mapas/mini/') : img
}

/** A rotação de origem; a staff muda-a na área de Staff. */
export const ROTACAO_PADRAO = ['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset']

/** Os capitães banem à vez (A, B, A, B...) até sobrar um mapa da pool da partida. */
export function totalBans(pool: string[]) {
  return Math.max(0, pool.length - 1)
}

/** Os mapas de uma pool, pela ordem do jogo. */
export function mapasDaPool(pool: string[]) {
  return MAPAS.filter((m) => pool.includes(m.nome))
}
export function equipaDoBan(n: number): 'A' | 'B' {
  return n % 2 === 0 ? 'A' : 'B'
}
