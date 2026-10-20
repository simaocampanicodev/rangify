import type { Partida } from './data'

/**
 * Num jogo de 10, só um jogador (o "líder") pergunta o estado da partida à base de dados e o reenvia aos outros 9 pelo
 * Realtime (Broadcast, que não toca na base de dados). A base de dados continua a mandar: tudo o que muda (aceitar,
 * escolher, banir...) passa por ela, e os outros jogadores confirmam o estado com ela de tempos a tempos. O líder só
 * poupa as perguntas repetidas.
 *
 * Aqui ficam as peças puras (sem rede), para se poderem testar: quem é o líder, o que se envia e como se junta o que
 * se recebe ao que cada jogador só ele vê.
 */

/** O que cada jogador diz de si na sala: desde quando está lá e se o separador está à frente. */
export interface Presenca { desde: number; visivel: boolean }

/**
 * O líder é quem tem o separador à frente (um separador escondido adormece os temporizadores) e, entre esses, quem está
 * na sala há mais tempo; os empates resolvem-se pelo ID, para todos chegarem à mesma resposta.
 */
export function eleger(sala: Record<string, Presenca[]>): string | null {
  const candidatos = Object.entries(sala)
    .map(([id, ps]) => ({ id, p: ps[0] }))
    .filter((c) => c.p && Number.isFinite(c.p.desde))
  if (!candidatos.length) return null
  candidatos.sort((a, b) =>
    Number(b.p.visivel) - Number(a.p.visivel) || a.p.desde - b.p.desde || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return candidatos[0].id
}

/**
 * A partida sem o que só cada jogador pode ver: o código do grupo, as sugestões da equipa e o seu próprio voto para cancelar.
 * É isto que o líder envia (o canal é privado, mas não tem de levar o que é pessoal).
 */
export function publica(p: Partida): Partida {
  return {
    ...p,
    codigoGrupo: null,
    sugestoes: [],
    cancelamento: p.cancelamento ? { ...p.cancelamento, euVotei: false } : null,
  }
}

/** Junta o que o líder enviou ao que este jogador já tinha só para si (o código, as suas sugestões e o seu voto). */
export function fundir(recebida: Partida, minha: Partida | null): Partida {
  const mesma = !!minha && minha.id === recebida.id
  return {
    ...recebida,
    codigoGrupo: mesma ? minha.codigoGrupo : null,
    sugestoes: mesma ? minha.sugestoes : [],
    cancelamento: recebida.cancelamento ? { ...recebida.cancelamento, euVotei: mesma ? (minha.cancelamento?.euVotei ?? false) : false } : null,
  }
}

/** Uma impressão digital da partida (sem o que é pessoal), para só reenviar quando algo mudou. */
export function assinatura(p: Partida): string {
  return JSON.stringify(publica(p))
}

/**
 * Depois de receber o estado do líder, é preciso perguntar à base de dados por conta própria? Sim quando a fase mudou
 * (o código do grupo e as sugestões só chegam a quem as pede) ou quando a partida acabou (o resumo é de cada um).
 */
export function precisaDePerguntar(recebida: Partida, minha: Partida | null): boolean {
  if (!minha || minha.id !== recebida.id) return true
  if (recebida.estado !== minha.estado) return true
  return recebida.estado === 'COMPLETED' || recebida.estado === 'CANCELLED'
}

/** Quanto tempo sem notícias do líder até cada um voltar a perguntar por conta própria. */
export const SILENCIO_DO_LIDER_MS = 8000
/** De quanto em quanto tempo o líder reenvia o estado, mesmo sem mudanças (para os outros saberem que ele está vivo). */
export const BATIMENTO_DO_LIDER_MS = 4000
