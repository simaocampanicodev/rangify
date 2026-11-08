/** As regras dos convites. Os mesmos números estão em _convite_valores() (supabase/migrations/0029_streamers_convites.sql). */
import { armazemLocal } from '../armazem'
import type { ConviteValores } from '../data'

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
  armazemLocal.escrever(CHAVE_CONVITE, codigo.trim().toUpperCase().slice(0, 16))
}

export function convitePendente(): string | null {
  return armazemLocal.ler(CHAVE_CONVITE)
}

export function limparConvitePendente() {
  armazemLocal.apagar(CHAVE_CONVITE)
}

/** O link que se partilha: o endereço do site com o código. */
export const linkConvite = (codigo: string) => `${window.location.origin}/?convite=${codigo}`
