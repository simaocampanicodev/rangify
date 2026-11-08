// Limite de pedidos das Edge Functions. O contador vive na base de dados (tabela limites_uso, migração 0044) porque
// cada pedido pode correr numa instância diferente: um contador em memória não vê os pedidos das outras.
import { admin, cors } from './comum.ts'

/**
 * O IP de quem fez o pedido, para as rotas sem sessão. Só se confia no cabeçalho que o Cloudflare (à frente do Supabase)
 * escreve; x-forwarded-for e x-real-ip podem vir forjados pelo cliente. Sem ele devolve null e quem chama só limita por
 * outro critério (por exemplo o utilizador).
 */
export function ipDe(req: Request): string | null {
  return req.headers.get('cf-connecting-ip')
}

/**
 * Conta o pedido e devolve a resposta 429 se passou do limite (e null se pode seguir). A chave junta a rota com quem
 * pede (o id do utilizador, o IP...). Se o contador falhar (ou demorar mais de 2 s) deixa passar: uma falha da base de dados não deve fechar o site. As funções só funcionam com o limite depois de a migração 0044 estar aplicada.
 */
export async function limitar(rota: string, quem: string, max: number, segundos: number): Promise<Response | null> {
  try {
    const { data, error } = await admin().rpc('_limitar_chave', { p_chave: `${rota}:${quem}`, p_max: max, p_segundos: segundos }).abortSignal(AbortSignal.timeout(2000))
    if (error) { console.error('limite', rota, error.message); return null }
    if (data !== false) return null
  } catch (e) {
    console.error('limite', rota, e instanceof Error ? e.message : e)
    return null
  }
  return new Response(JSON.stringify({ erro: 'Fizeste demasiados pedidos. Espera um momento e tenta outra vez.' }), {
    status: 429,
    headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': String(segundos) },
  })
}
