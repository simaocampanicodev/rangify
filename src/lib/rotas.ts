/** O endereço de uma partida em curso: /partida/<ID>. Só quem joga nela a vê (o servidor só devolve a partida de quem está nela). */
export const PREFIXO_PARTIDA = '/partida/'
export const caminhoPartida = (id: string) => `${PREFIXO_PARTIDA}${id}`
