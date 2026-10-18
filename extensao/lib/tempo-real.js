// O Realtime do Supabase para a extensão: o servidor avisa quando a fila muda ou a partida avança, em vez de a
// extensão perguntar de poucos em poucos segundos. É o mesmo mecanismo do site (src/lib/dados/supabase.ts,
// aoMudarJogo). Este ficheiro é empacotado com o supabase-js pelo `npm run extensao` (scripts/montar-extensao.mjs).
import { createClient } from '@supabase/supabase-js'

/**
 * Cria a ligação. `aoMudar(tabela)` corre quando algo mudou ("queue_entries": alguém entrou ou saiu da fila;
 * "match_players": entraste numa partida; "matches": a tua partida avançou) e `aoEstado(vivo)` quando o canal
 * liga ou cai. O supabase-js trata sozinho dos sinais de vida e de voltar a ligar.
 */
export function criarTempoReal({ url, chave, aoMudar, aoEstado }) {
  const cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  })
  let canal = null
  let atual = ''
  let token = ''
  let vivo = false

  const mudou = (estado) => {
    const agora = estado === 'SUBSCRIBED'
    if (agora === vivo) return
    vivo = agora
    aoEstado?.(vivo)
  }

  function fechar() {
    if (canal) cliente.removeChannel(canal)
    canal = null
    atual = ''
    if (vivo) { vivo = false; aoEstado?.(false) }
  }

  return {
    /** Escuta a fila, as partidas em que entras e (se houver) a tua partida. Só volta a ligar se algo mudou. */
    ligar({ perfilId, partidaId, accessToken }) {
      if (accessToken !== token) {
        token = accessToken
        // Sem isto, o servidor fecha o canal quando o token da sessão expira.
        cliente.realtime.setAuth(token)
      }
      const chaveCanal = `${perfilId}|${partidaId ?? ''}`
      if (canal && chaveCanal === atual) return
      fechar()
      atual = chaveCanal
      let c = cliente.channel(`extensao-${perfilId}-${partidaId ?? 'fila'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, () => aoMudar('queue_entries'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_players', filter: `profile_id=eq.${perfilId}` }, () => aoMudar('match_players'))
      if (partidaId) c = c.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${partidaId}` }, () => aoMudar('matches'))
      canal = c
      c.subscribe((estado) => mudou(estado))
    },
    /** Deixa de escutar e fecha a ligação: sem fila nem ready check não há razão para a manter aberta (ela também mantinha o service worker acordado). */
    async desligar() {
      fechar()
      await cliente.removeAllChannels()
      cliente.realtime.disconnect()
    },
    estaVivo: () => vivo,
  }
}
