// O aviso de "partida encontrada", o mesmo acorde do site (src/lib/som.ts): três notas a subir, em onda triangular,
// com ataque rápido e cauda suave. Aqui é sintetizado para um WAV e tocado com um <audio>, o caminho que o
// Chrome permite num documento offscreen sem nenhum clique.
const TAXA = 44100
/** Ganho do acorde a 100% (igual ao do site). */
const GANHO_MAXIMO = 0.18
const PISO = 0.0001
const DURACAO = 0.42
const ATAQUE = 0.02
const PASSO = 0.13

function envelope(t, volume) {
  if (t < 0 || t > DURACAO) return 0
  // Rampas exponenciais: do piso ao volume no ataque, e do volume ao piso na cauda.
  if (t < ATAQUE) return PISO * Math.pow(volume / PISO, t / ATAQUE)
  return volume * Math.pow(PISO / volume, (t - ATAQUE) / (DURACAO - ATAQUE))
}

/** Os bytes de um WAV mono de 16 bits com o acorde. "lembrete" é a versão mais curta e baixa, a meio da contagem. */
export function acordeWav(lembrete, volumePct) {
  const volume = GANHO_MAXIMO * (Math.min(100, Math.max(0, volumePct)) / 100) * (lembrete ? 0.6 : 1)
  const notas = lembrete ? [880, 1174.7] : [659.3, 880, 1318.5]
  const amostras = Math.ceil((PASSO * (notas.length - 1) + DURACAO + 0.05) * TAXA)
  const mistura = new Float32Array(amostras)
  if (volume > 0) {
    notas.forEach((freq, i) => {
      const inicio = Math.round(i * PASSO * TAXA)
      for (let k = 0; k < DURACAO * TAXA && inicio + k < amostras; k++) {
        const t = k / TAXA
        const triangular = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t))
        mistura[inicio + k] += triangular * envelope(t, volume)
      }
    })
  }
  const bytes = new ArrayBuffer(44 + amostras * 2)
  const v = new DataView(bytes)
  const texto = (pos, s) => { for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i)) }
  texto(0, 'RIFF'); v.setUint32(4, 36 + amostras * 2, true); texto(8, 'WAVE'); texto(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, TAXA, true); v.setUint32(28, TAXA * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  texto(36, 'data'); v.setUint32(40, amostras * 2, true)
  for (let i = 0; i < amostras; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, mistura[i])) * 32767), true)
  return bytes
}
