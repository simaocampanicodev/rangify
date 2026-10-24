/**
 * A luz do rato nos cartões (ideia do Spotlight Card do EasyUI): um só ouvinte para a página toda. Quando o rato anda por cima
 * de um elemento com a classe `luz`, guarda a posição nas variáveis --mx e --my, que o CSS (efeitos.css) usa para acender
 * o interior e a borda. Nenhum componente se redesenha, e sem rato (telemóvel) ou com "reduzir animações" não faz nada.
 */
export function iniciarLuz() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let alvo: HTMLElement | null = null
  let x = 0
  let y = 0
  let agendado = false
  const pintar = () => {
    agendado = false
    if (!alvo) return
    const r = alvo.getBoundingClientRect()
    alvo.style.setProperty('--mx', `${x - r.left}px`)
    alvo.style.setProperty('--my', `${y - r.top}px`)
  }
  window.addEventListener('pointermove', (e) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>('.luz') ?? null
    alvo = el
    if (!el) return
    x = e.clientX
    y = e.clientY
    if (!agendado) { agendado = true; requestAnimationFrame(pintar) }
  }, { passive: true })
}
