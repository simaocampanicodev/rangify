/**
 * Qualidade do fundo. Em "completo" os painéis são de vidro (desfocam as linhas
 * por trás); em "leve" ficam opacos, que é o que pesa nas placas gráficas fracas.
 * As linhas continuam a mexer nos dois modos.
 *
 * "auto" começa completo e passa a leve se o computador for fraco ou se, nos
 * primeiros segundos, o browser perder muitos fotogramas. A decisão fica guardada.
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

function aplicar(leve: boolean) {
  document.documentElement.dataset.fundo = leve ? 'leve' : 'completo'
}

function computadorFraco() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4
}

let aMedir = false

/** Conta os fotogramas durante 3 s. Se mais de 1 em 5 demorar o dobro do normal, passa a leve. */
function medir() {
  if (aMedir) return
  // Com o separador escondido o browser quase não desenha: espera que volte.
  if (document.hidden) {
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
    if (lentos > 0.2 && preferenciaFundo() === 'auto') { escrever(CHAVE_AUTO, 'leve'); aplicar(true) }
    else if (ler(CHAVE_AUTO) == null) escrever(CHAVE_AUTO, 'completo')
  }
  requestAnimationFrame(passo)
}

/** Corre uma vez ao abrir o site. */
export function iniciarFundo() {
  const pref = preferenciaFundo()
  if (pref !== 'auto') return aplicar(pref === 'leve')
  const decidido = ler(CHAVE_AUTO)
  if (decidido === 'leve' || computadorFraco()) return aplicar(true)
  aplicar(false)
  // Só mede na primeira visita, depois de a página assentar.
  if (decidido == null) setTimeout(medir, 2500)
}

export function definirPreferenciaFundo(pref: PreferenciaFundo) {
  escrever(CHAVE, pref === 'auto' ? null : pref)
  // Voltar ao automático volta a medir.
  if (pref === 'auto') escrever(CHAVE_AUTO, null)
  iniciarFundo()
}
