/**
 * Qualidade do fundo.
 *   completo: as linhas ondulam e seguem o rato, e os painéis são de vidro.
 *   leve: o fundo fica parado e os painéis opacos. Quase não gasta nada.
 *
 * "auto" é completo, mas passa a leve enquanto o portátil está na bateria, ou de
 * vez se o computador for fraco (ou, na primeira visita, perder muitos fotogramas).
 */
export type PreferenciaFundo = 'auto' | 'completo' | 'leve'

const CHAVE = 'rangify:fundo'
const CHAVE_AUTO = 'rangify:fundo-auto'

const ler = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const escrever = (k: string, v: string | null) => {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* ignora */ }
}

export function preferenciaFundo(): PreferenciaFundo {
  const v = ler(CHAVE)
  return v === 'completo' || v === 'leve' ? v : 'auto'
}

/** true quando o fundo está parado (o Fundo deixa de seguir o rato). */
export const fundoLeve = () => document.documentElement.dataset.fundo === 'leve'

let naBateria = false

function aplicar() {
  const pref = preferenciaFundo()
  const leve = pref === 'leve' || (pref === 'auto' && (naBateria || ler(CHAVE_AUTO) === 'leve' || computadorFraco()))
  document.documentElement.dataset.fundo = leve ? 'leve' : 'completo'
}

function computadorFraco() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
}

let aMedir = false

/** Conta os fotogramas durante 3 s. Se mais de 1 em 5 demorar o dobro do normal, passa a leve de vez. */
function medir() {
  if (aMedir || ler(CHAVE_AUTO) != null || preferenciaFundo() !== 'auto') return
  // Com o separador escondido o browser quase não desenha, e na bateria já está leve: espera.
  if (document.hidden || naBateria) {
    document.addEventListener('visibilitychange', () => setTimeout(medir, 1500), { once: true })
    return
  }
  aMedir = true
  const tempos: number[] = []
  let antes = 0
  const passo = (t: number) => {
    if (document.hidden) { aMedir = false; medir(); return }
    if (antes) tempos.push(t - antes)
    antes = t
    if (tempos.length < 180) { requestAnimationFrame(passo); return }
    aMedir = false
    const ordenados = [...tempos].sort((a, b) => a - b)
    const normal = ordenados[Math.floor(ordenados.length * 0.2)]
    const lentos = tempos.filter((d) => d > normal * 1.8).length / tempos.length
    escrever(CHAVE_AUTO, lentos > 0.2 ? 'leve' : 'completo')
    aplicar()
  }
  requestAnimationFrame(passo)
}

type Bateria = EventTarget & { charging: boolean }

/** Corre uma vez ao abrir o site. */
export function iniciarFundo() {
  aplicar()
  const nav = navigator as Navigator & { getBattery?: () => Promise<Bateria> }
  // Só o Chrome, o Edge e o Brave dizem se o portátil está a carregar.
  nav.getBattery?.().then((b) => {
    const ver = () => {
      naBateria = !b.charging
      aplicar()
      if (!naBateria && !computadorFraco()) setTimeout(medir, 2500)
    }
    ver()
    b.addEventListener('chargingchange', ver)
  }).catch(() => { /* sem informação da bateria */ })
  if (!computadorFraco()) setTimeout(medir, 2500)
}

export function definirPreferenciaFundo(pref: PreferenciaFundo) {
  escrever(CHAVE, pref === 'auto' ? null : pref)
  // Voltar ao automático volta a medir.
  if (pref === 'auto') { escrever(CHAVE_AUTO, null); setTimeout(medir, 1500) }
  aplicar()
}
