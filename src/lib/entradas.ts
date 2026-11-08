/**
 * O que a pessoa escreve. Tudo o que é texto livre passa por limparTexto antes de sair do site (ver data/limpeza.ts) e
 * os campos usam LIMITES como maxLength. O servidor repete a limpeza e as regras (public._texto e as verificações de
 * cada função): isto só poupa uma viagem e dá o aviso certo no campo. Os números iguais aos do servidor estão marcados.
 */

export const LIMITES = {
  utilizador: 64,
  /** O Supabase Auth só lê os primeiros 72 bytes da palavra-passe. */
  password: 72,
  riotId: 40,
  pesquisa: 100,
  /** Igual à tabela de sugestões (80), ao aviso da staff e à denúncia (1000). */
  sugestaoTitulo: 80,
  sugestaoDescricao: 500,
  denunciaDetalhes: 1000,
  mensagemStaff: 500,
  anuncioMensagem: 4000,
  link: 500,
  convite: 200,
  nomeEquipa: 32,
  canalTwitch: 25,
} as const

/**
 * Caracteres de controlo (menos tabulação e mudanças de linha), de largura zero e de inversão de direção: servem para
 * disfarçar nomes e mensagens. É a mesma lista de public._texto na base de dados e de _shared/texto.ts nas funções de
 * borda: se mudar aqui, muda lá.
 */
const INVISIVEIS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u034F\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}]/gu

/** NFC, sem os caracteres acima e sem espaços nas pontas. */
export const limparTexto = (t: string) => t.normalize('NFC').replace(INVISIVEIS, '').trim()
