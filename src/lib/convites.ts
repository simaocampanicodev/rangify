/** As regras dos convites. Os mesmos números estão em _convite_valores() (supabase/migrations/0029_streamers_convites.sql). */
import type { ConviteValores } from './data'

export const VALORES_CONVITE: ConviteValores = {
  convidador: 150,
  convidado: 100,
  marcoACada: 5,
  bonusMarco: 300,
  limiteMes: 20,
  diasParaUsar: 7,
}

/** A chave onde o código do link (?convite=CODIGO) espera até a pessoa entrar. */
const CHAVE_CONVITE = 'rangify:convite'

export function guardarConvitePendente(codigo: string) {
  try { localStorage.setItem(CHAVE_CONVITE, codigo.trim().toUpperCase().slice(0, 16)) } catch { /* sem armazenamento: perde-se o convite */ }
}

export function convitePendente(): string | null {
  try { return localStorage.getItem(CHAVE_CONVITE) } catch { return null }
}

export function limparConvitePendente() {
  try { localStorage.removeItem(CHAVE_CONVITE) } catch { /* nada a fazer */ }
}

/** O link que se partilha: o endereço do site com o código. */
export const linkConvite = (codigo: string) => `${window.location.origin}/?convite=${codigo}`
