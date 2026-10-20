// Atualiza um elemento para ficar igual a um HTML novo mexendo só no que mudou. Redesenhar tudo (innerHTML) a cada
// segundo recriava os botões a meio de um clique e reiniciava as animações da roda; assim os elementos ficam
// os mesmos, só o texto e os atributos que mudaram é que mudam.

function atributos(atual, novo) {
  for (const { name, value } of novo.attributes) {
    // O que a pessoa está a escrever ou a arrastar (um campo com o foco) não se mexe.
    if (name === 'value' && atual === document.activeElement) continue
    if (atual.getAttribute(name) !== value) atual.setAttribute(name, value)
  }
  for (const { name } of [...atual.attributes]) if (!novo.hasAttribute(name)) atual.removeAttribute(name)
}

function filhos(atual, novo) {
  const a = [...atual.childNodes]
  const n = [...novo.childNodes]
  n.forEach((no, i) => {
    const velho = a[i]
    if (!velho) { atual.appendChild(document.importNode(no, true)); return }
    if (velho.nodeType !== no.nodeType || velho.nodeName !== no.nodeName) { atual.replaceChild(document.importNode(no, true), velho); return }
    if (no.nodeType === Node.TEXT_NODE) {
      if (velho.nodeValue !== no.nodeValue) velho.nodeValue = no.nodeValue
      return
    }
    if (no.nodeType === Node.ELEMENT_NODE) { atributos(velho, no); filhos(velho, no) }
  })
  for (let i = a.length - 1; i >= n.length; i--) atual.removeChild(a[i])
}

/** Põe o conteúdo de `destino` igual a `html`. */
export function atualizarHtml(destino, html) {
  const molde = document.createElement('div')
  molde.innerHTML = html
  filhos(destino, molde)
}
