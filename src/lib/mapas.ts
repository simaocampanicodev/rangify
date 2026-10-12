/** Todos os mapas do modo 5v5 do Valorant. A arte oficial está em /public/mapas. */
export interface Mapa { nome: string; locais: string; imagem: string }

export const MAPAS: Mapa[] = [
  { nome: 'Abyss', locais: 'A/B', imagem: '/mapas/abyss.jpg' },
  { nome: 'Ascent', locais: 'A/B', imagem: '/mapas/ascent.jpg' },
  { nome: 'Bind', locais: 'A/B', imagem: '/mapas/bind.jpg' },
  { nome: 'Breeze', locais: 'A/B', imagem: '/mapas/breeze.jpg' },
  { nome: 'Corrode', locais: 'A/B', imagem: '/mapas/corrode.jpg' },
  { nome: 'Fracture', locais: 'A/B', imagem: '/mapas/fracture.jpg' },
  { nome: 'Haven', locais: 'A/B/C', imagem: '/mapas/haven.jpg' },
  { nome: 'Icebox', locais: 'A/B', imagem: '/mapas/icebox.jpg' },
  { nome: 'Lotus', locais: 'A/B/C', imagem: '/mapas/lotus.jpg' },
  { nome: 'Pearl', locais: 'A/B', imagem: '/mapas/pearl.jpg' },
  { nome: 'Split', locais: 'A/B', imagem: '/mapas/split.jpg' },
  { nome: 'Summit', locais: 'A/B', imagem: '/mapas/summit.jpg' },
  { nome: 'Sunset', locais: 'A/B', imagem: '/mapas/sunset.jpg' },
]

export const NOMES_MAPAS = MAPAS.map((m) => m.nome)

export function imagemMapa(nome: string | null | undefined): string | undefined {
  return MAPAS.find((m) => m.nome === nome)?.imagem
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
