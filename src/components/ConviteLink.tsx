import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAvisos } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { convitePendente, guardarConvitePendente, limparConvitePendente } from '@/lib/convites'
import { dados } from '@/lib/data'
import { l } from '@/lib/idioma'

/**
 * Os links de convite abrem o site com `?convite=CODIGO`. O código espera (o login pode passar pelo Discord) e,
 * com a sessão aberta, usa-se uma só vez: quem convidou e quem foi convidado ganham coins quando o convidado
 * acabar a primeira partida. Um convite que não vale (conta antiga, já usado) só avisa e deixa de contar.
 */
export function ConviteLink() {
  const { carregando, sessao } = useSessao()
  const avisar = useAvisos()
  const local = useLocation()
  const navegar = useNavigate()
  const aCorrer = useRef(false)

  useEffect(() => {
    const q = new URLSearchParams(local.search)
    const codigo = q.get('convite')
    if (!codigo) return
    guardarConvitePendente(codigo)
    q.delete('convite')
    const resto = q.toString()
    navegar({ pathname: local.pathname, search: resto ? `?${resto}` : '' }, { replace: true })
  }, [local.pathname, local.search, navegar])

  useEffect(() => {
    if (carregando || !sessao || aCorrer.current) return
    const codigo = convitePendente()
    if (!codigo) return
    limparConvitePendente()
    aCorrer.current = true
    dados.usarConvite(codigo)
      .then((r) => avisar(l(`Convite de ${r.convidador} aceite: recebes ${r.moedas} coins quando acabares a tua primeira partida.`, `Invite from ${r.convidador} accepted: you get ${r.moedas} coins when you finish your first match.`)))
      .catch((e) => avisar(e instanceof Error ? e.message : l('Não foi possível usar o convite.', 'Could not use the invite.'), 'erro'))
      .finally(() => { aCorrer.current = false })
  }, [carregando, sessao, avisar])

  return null
}
