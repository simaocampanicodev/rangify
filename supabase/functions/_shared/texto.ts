// Limpeza do que chega nos pedidos. Sem dependências de Deno, para os testes em Node também a carregarem.

/**
 * Caracteres de controlo (menos tabulação e mudanças de linha), de largura zero e de inversão de direção: servem para
 * disfarçar nomes e mensagens. É a mesma lista de public._texto na base de dados e de lib/entradas.ts no site: se mudar
 * aqui, muda lá.
 */
const INVISIVEIS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu

/** NFC, sem os caracteres acima e sem espaços nas pontas. */
export const limparTexto = (t: string) => t.normalize('NFC').replace(INVISIVEIS, '').trim()

/** Um texto vindo do pedido, limpo. null se não for texto ou passar do tamanho. */
export function textoDoPedido(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null
  const t = limparTexto(valor)
  return t.length <= max ? t : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Um id do pedido: só passa se for um UUID. */
export const uuidDoPedido = (valor: unknown): string | null => (typeof valor === 'string' && UUID.test(valor) ? valor.toLowerCase() : null)
