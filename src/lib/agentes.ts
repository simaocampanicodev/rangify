import type { FuncaoJogo } from './data/tipos'

/** Os agentes do Valorant, com a função e o ícone oficial (valorant-api.com). */
export interface Agente { nome: string; funcao: FuncaoJogo; uuid: string }

export const AGENTES: Agente[] = [
  { nome: 'Astra', funcao: 'Controlador', uuid: '41fb69c1-4189-7b37-f117-bcaf1e96f1bf' },
  { nome: 'Breach', funcao: 'Iniciador', uuid: '5f8d3a7f-467b-97f3-062c-13acf203c006' },
  { nome: 'Brimstone', funcao: 'Controlador', uuid: '9f0d8ba9-4140-b941-57d3-a7ad57c6b417' },
  { nome: 'Chamber', funcao: 'Sentinela', uuid: '22697a3d-45bf-8dd7-4fec-84a9e28c69d7' },
  { nome: 'Clove', funcao: 'Controlador', uuid: '1dbf2edd-4729-0984-3115-daa5eed44993' },
  { nome: 'Cypher', funcao: 'Sentinela', uuid: '117ed9e3-49f3-6512-3ccf-0cada7e3823b' },
  { nome: 'Deadlock', funcao: 'Sentinela', uuid: 'cc8b64c8-4b25-4ff9-6e7f-37b4da43d235' },
  { nome: 'Fade', funcao: 'Iniciador', uuid: 'dade69b4-4f5a-8528-247b-219e5a1facd6' },
  { nome: 'Gekko', funcao: 'Iniciador', uuid: 'e370fa57-4757-3604-3648-499e1f642d3f' },
  { nome: 'Harbor', funcao: 'Controlador', uuid: '95b78ed7-4637-86d9-7e41-71ba8c293152' },
  { nome: 'Iso', funcao: 'Duelista', uuid: '0e38b510-41a8-5780-5e8f-568b2a4f2d6c' },
  { nome: 'Jett', funcao: 'Duelista', uuid: 'add6443a-41bd-e414-f6ad-e58d267f4e95' },
  { nome: 'KAY/O', funcao: 'Iniciador', uuid: '601dbbe7-43ce-be57-2a40-4abd24953621' },
  { nome: 'Killjoy', funcao: 'Sentinela', uuid: '1e58de9c-4950-5125-93e9-a0aee9f98746' },
  { nome: 'Miks', funcao: 'Controlador', uuid: '7c8a4701-4de6-9355-b254-e09bc2a34b72' },
  { nome: 'Neon', funcao: 'Duelista', uuid: 'bb2a4828-46eb-8cd1-e765-15848195d751' },
  { nome: 'Omen', funcao: 'Controlador', uuid: '8e253930-4c05-31dd-1b6c-968525494517' },
  { nome: 'Phoenix', funcao: 'Duelista', uuid: 'eb93336a-449b-9c1b-0a54-a891f7921d69' },
  { nome: 'Raze', funcao: 'Duelista', uuid: 'f94c3b30-42be-e959-889c-5aa313dba261' },
  { nome: 'Reyna', funcao: 'Duelista', uuid: 'a3bfb853-43b2-7238-a4f1-ad90e9e46bcc' },
  { nome: 'Sage', funcao: 'Sentinela', uuid: '569fdd95-4d10-43ab-ca70-79becc718b46' },
  { nome: 'Skye', funcao: 'Iniciador', uuid: '6f2a04ca-43e0-be17-7f36-b3908627744d' },
  { nome: 'Sova', funcao: 'Iniciador', uuid: '320b2a48-4d9b-a075-30f1-1f93a9b638fa' },
  { nome: 'Tejo', funcao: 'Iniciador', uuid: 'b444168c-4e35-8076-db47-ef9bf368f384' },
  { nome: 'Veto', funcao: 'Sentinela', uuid: '92eeef5d-43b5-1d4a-8d03-b3927a09034b' },
  { nome: 'Viper', funcao: 'Controlador', uuid: '707eab51-4836-f488-046a-cda6bf494859' },
  { nome: 'Vyse', funcao: 'Sentinela', uuid: 'efba5359-4016-a1e5-7626-b1ae76895940' },
  { nome: 'Waylay', funcao: 'Duelista', uuid: 'df1cb487-4902-002e-5c17-d28e83e78588' },
  { nome: 'Yoru', funcao: 'Duelista', uuid: '7f94d92c-4234-0a36-9646-3a87eb8b5c89' },
]

const chave = (nome: string) => nome.toLowerCase().replace(/[^a-z]/g, '')

export function agentePorNome(nome: string | null | undefined): Agente | undefined {
  if (!nome) return undefined
  const k = chave(nome)
  return AGENTES.find((a) => chave(a.nome) === k)
}

/**
 * O ícone quadrado do agente, ou undefined se o nome não for conhecido. Por defeito a versão pequena (128 px, chega
 * para os 46 px mais largos do site); `grande` é a original, que serve de reserva se a pequena não existir.
 */
export function iconeAgente(nome: string | null | undefined, grande = false): string | undefined {
  const a = agentePorNome(nome)
  return a ? `https://media.valorant-api.com/agents/${a.uuid}/${grande ? 'displayicon' : 'displayiconsmall'}.png` : undefined
}

/** Os agentes de uma função, pela ordem em que as simulações os escolhem (igual à base de dados). */
export const AGENTES_SIMULADOS: Record<FuncaoJogo | 'outro', string[]> = {
  Duelista: ['Jett', 'Raze', 'Reyna', 'Phoenix', 'Neon', 'Yoru', 'Iso', 'Waylay'],
  Iniciador: ['Sova', 'Skye', 'Fade', 'Breach', 'KAY/O', 'Gekko', 'Tejo'],
  Controlador: ['Omen', 'Brimstone', 'Viper', 'Astra', 'Harbor', 'Clove', 'Miks'],
  Sentinela: ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto'],
  outro: ['Jett', 'Sova', 'Omen', 'Killjoy', 'Raze', 'Skye', 'Viper', 'Cypher'],
}
