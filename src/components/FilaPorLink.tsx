import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAvisos } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { avisarMudanca, dados } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { somBloqueado, somLigado } from '@/lib/som'

/** O pedido de "entrar na fila" que veio de um link, guardado até haver sessão (o login pode passar pelo Discord). */
const CHAVE = 'rangify:fila-por-link'
/** Passado este tempo, um pedido antigo já não conta (ninguém quer entrar na fila sem querer, horas depois). */
const VALIDADE = 15 * 60_000

/**
 * O botão "Entrar na fila" do Discord abre o site em `/jogar?fila=1`. O Discord não corre código num
 * botão de link, por isso é aqui que a pessoa entra na fila, sem carregar no botão do site:
 *  1. o pedido é guardado e o `?fila=1` sai do endereço (um recarregar não volta a entrar);
 *  2. com sessão (logo, ou depois de entrar e ligar o Riot ID), entra na fila uma só vez e vai para /jogar.
 * Se a pessoa já está na fila, não acontece nada de novo; se está banida, de castigo ou sem Discord,
 * vê o mesmo erro do botão do site.
 */
export function FilaPorLink() {
  const { carregando, sessao } = useSessao()
  const { atualizar } = usePartida()
  const avisar = useAvisos()
  const local = useLocation()
  const navegar = useNavigate()
  const aCorrer = useRef(false)

  useEffect(() => {
    const q = new URLSearchParams(local.search)
    if (q.get('fila') !== '1') return
    try { localStorage.setItem(CHAVE, String(Date.now())) } catch { /* sem localStorage: só funciona com a sessão já aberta */ }
    q.delete('fila')
    const resto = q.toString()
    navegar({ pathname: local.pathname, search: resto ? `?${resto}` : '' }, { replace: true })
  }, [local.pathname, local.search, navegar])

  useEffect(() => {
    if (carregando || !sessao || sessao.incompleta || aCorrer.current) return
    let quando = 0
    try { quando = Number(localStorage.getItem(CHAVE)) } catch { /* ignora */ }
    if (!quando) return
    try { localStorage.removeItem(CHAVE) } catch { /* ignora */ }
    if (Date.now() - quando > VALIDADE) return
    aCorrer.current = true
    navegar('/jogar', { replace: true })
    dados.entrarFila()
      .then(async () => {
        avisarMudanca('fila')
        await atualizar()
        // Chegou por um link, sem tocar no site: o browser ainda não deixa tocar o som da partida encontrada.
        avisar(somLigado() && somBloqueado()
          ? l('Estás na fila. Toca em qualquer sítio da página para o som de partida encontrada funcionar.', 'You are in the queue. Tap anywhere on the page so the match found sound can play.')
          : l('Estás na fila.', 'You are in the queue.'))
      })
      .catch((e) => avisar(e instanceof Error ? e.message : l('Não foi possível entrar na fila.', 'Could not join the queue.'), 'erro'))
      .finally(() => { aCorrer.current = false })
  }, [carregando, sessao, atualizar, avisar, navegar])

  return null
}
