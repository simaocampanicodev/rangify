import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAvisos } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useSessao } from '@/contexts/Sessao'
import { avisarMudanca, dados, type FilaTipo } from '@/lib/data'
import { l } from '@/lib/idioma'
import { somBloqueado, somLigado } from '@/lib/som'

/** O pedido de "entrar na fila" que veio de um link, guardado até haver sessão (o login pode passar pelo Discord). */
const CHAVE = 'rangify:fila-por-link'
/** Passado este tempo, um pedido antigo já não conta (ninguém quer entrar na fila sem querer, horas depois). */
const VALIDADE = 15 * 60_000

/**
 * Os botões "Entrar na fila" do Discord abrem o site em `/jogar?fila=aberta` ou `/jogar?fila=ranked` (o `?fila=1`
 * dos botões antigos conta como a aberta). O Discord não corre código num botão de link, por isso é aqui que a
 * pessoa entra na fila, sem carregar no botão do site:
 *  1. o pedido é guardado e o `?fila=` sai do endereço (um recarregar não volta a entrar);
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
    // Só a página Jogar tem este pedido: a Tabela também usa ?fila=, mas para escolher que tabela ver.
    if (local.pathname !== '/jogar') return
    const q = new URLSearchParams(local.search)
    const pedida = q.get('fila')
    if (pedida !== '1' && pedida !== 'aberta' && pedida !== 'ranked') return
    try { localStorage.setItem(CHAVE, `${Date.now()}|${pedida === 'ranked' ? 'ranked' : 'aberta'}`) } catch { /* sem localStorage: só funciona com a sessão já aberta */ }
    q.delete('fila')
    const resto = q.toString()
    navegar({ pathname: local.pathname, search: resto ? `?${resto}` : '' }, { replace: true })
  }, [local.pathname, local.search, navegar])

  useEffect(() => {
    if (carregando || !sessao || sessao.incompleta || aCorrer.current) return
    let quando = 0
    let tipo: FilaTipo = 'aberta'
    try {
      const [hora, qual] = (localStorage.getItem(CHAVE) ?? '').split('|')
      quando = Number(hora)
      if (qual === 'ranked') tipo = 'ranked'
    } catch { /* ignora */ }
    if (!quando) return
    try { localStorage.removeItem(CHAVE) } catch { /* ignora */ }
    if (Date.now() - quando > VALIDADE) return
    aCorrer.current = true
    navegar('/jogar', { replace: true })
    dados.entrarFila(tipo)
      .then(async () => {
        avisarMudanca('fila')
        await atualizar()
        // Chegou por um link, sem tocar no site: o browser ainda não deixa tocar o som da partida encontrada.
        avisar(somLigado() && somBloqueado()
          ? l('Estás na fila. Toca em qualquer sítio da página para o som de partida encontrada funcionar.', 'You are in the queue. Tap anywhere on the page so the match found sound can play.')
          : tipo === 'ranked' ? l('Estás na fila ranked.', 'You are in the ranked queue.') : l('Estás na fila aberta.', 'You are in the open queue.'))
      })
      .catch((e) => avisar(e instanceof Error ? e.message : l('Não foi possível entrar na fila.', 'Could not join the queue.'), 'erro'))
      .finally(() => { aCorrer.current = false })
  }, [carregando, sessao, atualizar, avisar, navegar])

  return null
}
