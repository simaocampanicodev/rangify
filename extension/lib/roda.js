// A roda da fila: dez segmentos à volta da contagem, um por lugar na sala (o mesmo desenho do site).
const PI = Math.PI

export function rodaSvg({ tamanho = 196, contagem, naFila }) {
  const c = tamanho / 2
  const r = c - 14
  const n = Math.max(0, Math.min(10, contagem))
  let segmentos = ''
  for (let i = 0; i < 10; i++) {
    const a0 = ((-90 + i * 36 + 4) * PI) / 180
    const a1 = ((-90 + (i + 1) * 36 - 4) * PI) / 180
    const d = `M ${(c + r * Math.cos(a0)).toFixed(1)} ${(c + r * Math.sin(a0)).toFixed(1)} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(1)} ${(c + r * Math.sin(a1)).toFixed(1)}`
    const cor = i < n ? (naFila && i === 0 ? '#ffb592' : '#ff5b1f') : 'rgba(255,255,255,0.08)'
    segmentos += `<path d="${d}" fill="none" stroke="${cor}" stroke-width="11" stroke-linecap="round"/>`
  }
  const gira = naFila
    ? `<svg aria-hidden="true" class="fila-gira" style="position:absolute;inset:0;overflow:visible" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}"><circle cx="${c}" cy="${c}" r="${r - 18}" fill="none" stroke="rgba(255,181,146,0.35)" stroke-width="1.5" stroke-dasharray="3 9"/></svg>`
    : ''
  return `<svg class="anel-aceso" role="img" aria-label="${n} de 10 lugares preenchidos" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}" style="overflow:visible">${segmentos}</svg>${gira}`
}

/** Um anel que se esvazia com o tempo (a contagem do ready check). */
export function relogioSvg({ tamanho = 170, restante, total }) {
  const c = tamanho / 2
  const r = c - 10
  const comprimento = 2 * PI * r
  const fracao = Math.max(0, Math.min(1, restante / total))
  return `<svg width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}" role="img" aria-label="${Math.ceil(restante)} segundos"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ff5b1f" stroke-width="8" stroke-linecap="round" stroke-dasharray="${comprimento}" stroke-dashoffset="${comprimento * (1 - fracao)}" transform="rotate(-90 ${c} ${c})" style="transition:stroke-dashoffset .25s linear;filter:drop-shadow(0 0 10px rgba(255,91,31,0.45))"/></svg>`
}
