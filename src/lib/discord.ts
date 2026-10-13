/**
 * Abrir um canal do Discord na própria aplicação.
 *
 * No computador, um link https abre o Discord no browser. O endereço discord://
 * abre a aplicação já no canal (no caso da call, no canal de voz, onde basta
 * carregar em "Entrar na voz"). No telemóvel o link https já abre a aplicação.
 */
export const urlCanalWeb = (servidor: string, canal: string) => `https://discord.com/channels/${servidor}/${canal}`
export const urlCanalApp = (servidor: string, canal: string) => `discord://-/channels/${servidor}/${canal}`

const telemovel = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))

/**
 * Tenta abrir a aplicação. Devolve false (em vez de abrir) no telemóvel, para o
 * link https seguir normalmente. Se ao fim de uns segundos a janela nunca perdeu
 * o foco, a aplicação não abriu (não está instalada): chama semApp.
 */
export function abrirNaApp(servidor: string, canal: string, semApp: () => void): boolean {
  if (telemovel()) return false
  let abriu = false
  const marcar = () => { abriu = true }
  window.addEventListener('blur', marcar, { once: true })
  document.addEventListener('visibilitychange', marcar, { once: true })
  window.location.href = urlCanalApp(servidor, canal)
  setTimeout(() => {
    window.removeEventListener('blur', marcar)
    document.removeEventListener('visibilitychange', marcar)
    if (!abriu) semApp()
  }, 2500)
  return true
}
