/**
 * localStorage e sessionStorage que nunca lançam. Em modo privado, com o armazenamento cheio ou bloqueado o browser
 * pode recusar ler ou escrever: quem usa segue em frente, só que sem guardar (a preferência vale até recarregar).
 */
function acesso(qual: () => Storage) {
  return {
    ler(chave: string): string | null {
      try { return qual().getItem(chave) } catch { return null }
    },
    escrever(chave: string, valor: string) {
      try { qual().setItem(chave, valor) } catch { /* sem armazenamento */ }
    },
    apagar(chave: string) {
      try { qual().removeItem(chave) } catch { /* sem armazenamento */ }
    },
  }
}

export const armazemLocal = acesso(() => localStorage)
export const armazemSessao = acesso(() => sessionStorage)
