/**
 * O aviso sonoro de "partida encontrada": um acorde curto sintetizado com a
 * Web Audio API (sem ficheiros), ao volume escolhido nas Definições. Os browsers só deixam tocar
 * som depois de uma interação, por isso o contexto é criado no primeiro clique.
 */
const CHAVE = 'rangify:som'
const CHAVE_VOLUME = 'rangify:som:volume'
/** Volume de origem (0 a 100). */
export const VOLUME_PADRAO = 70
/** Ganho do acorde a 100%. A 70% fica perto de 0,13, um pouco acima dos 0,08 de antes. */
const GANHO_MAXIMO = 0.18
let contexto: AudioContext | null = null

export function somLigado(): boolean {
  try { return localStorage.getItem(CHAVE) !== 'desligado' } catch { return true }
}

export function ligarSom(ligado: boolean) {
  try { localStorage.setItem(CHAVE, ligado ? 'ligado' : 'desligado') } catch { /* ignora */ }
}

export function volumeSom(): number {
  try {
    const v = Number(localStorage.getItem(CHAVE_VOLUME))
    return localStorage.getItem(CHAVE_VOLUME) != null && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : VOLUME_PADRAO
  } catch { return VOLUME_PADRAO }
}

export function definirVolumeSom(v: number) {
  try { localStorage.setItem(CHAVE_VOLUME, String(Math.min(100, Math.max(0, Math.round(v))))) } catch { /* ignora */ }
}

/** Chamado no primeiro clique ou tecla da página. */
export function desbloquearSom() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    contexto ??= new Ctx()
    if (contexto.state === 'suspended') contexto.resume().catch(() => {})
  } catch { /* sem áudio neste browser */ }
}

function nota(ctx: AudioContext, freq: number, inicio: number, duracao: number, volume: number) {
  const osc = ctx.createOscillator()
  const ganho = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, inicio)
  // Ataque rápido e cauda suave, para não ser agressivo.
  ganho.gain.setValueAtTime(0.0001, inicio)
  ganho.gain.exponentialRampToValueAtTime(volume, inicio + 0.02)
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao)
  osc.connect(ganho).connect(ctx.destination)
  osc.start(inicio)
  osc.stop(inicio + duracao + 0.05)
}

/** Três notas a subir. "lembrete" é a versão mais curta e baixa, a meio da contagem. */
export function tocarPartidaEncontrada(lembrete = false) {
  const nivel = volumeSom() / 100
  if (!somLigado() || nivel <= 0) return
  desbloquearSom()
  const ctx = contexto
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.02
  // O lembrete a meio da contagem fica mais baixo do que o aviso principal.
  const volume = GANHO_MAXIMO * nivel * (lembrete ? 0.6 : 1)
  const notas = lembrete ? [880, 1174.7] : [659.3, 880, 1318.5]
  notas.forEach((f, i) => nota(ctx, f, t + i * 0.13, 0.42, volume))
}
