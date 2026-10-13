/**
 * Um aviso de que alguma coisa mudou ("partida", "fila", "perfil", "amigos"),
 * para os painéis abertos noutros sítios da página se atualizarem logo.
 */
export type Mudanca = 'partida' | 'fila' | 'perfil' | 'amigos' | 'sugestoes' | 'staff' | 'loja'

export function avisarMudanca(o: Mudanca) {
  window.dispatchEvent(new CustomEvent('rangify:dados', { detail: o }))
}

export function aoMudarDados(cb: (o: Mudanca) => void): () => void {
  const f = (e: Event) => cb((e as CustomEvent<Mudanca>).detail)
  window.addEventListener('rangify:dados', f)
  return () => window.removeEventListener('rangify:dados', f)
}
