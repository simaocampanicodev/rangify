import {
  Ban, BookOpen, ClipboardPaste, Crown, Flag, Scale, Shield, Swords, Target, Trophy,
} from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { BONUS_MAX, BONUS_MIN, PONTOS_BASE, PONTOS_INICIAIS, POR_DIVISAO } from '@/lib/pontos'
import { HORAS_CACHE_RANK, MINUTOS_BLOQUEIO, MINUTOS_COOLDOWN, SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA } from '@/lib/regras'
import { NomeRangify } from './Marca'
import { Modal } from './ui'

export type TopicoAjuda =
  | 'fila' | 'draft' | 'mapas' | 'codigo' | 'resultado' | 'ranking' | 'rank' | 'missoes' | 'funcoes'

interface Topico {
  eyebrow: string
  titulo: string
  icone: ReactNode
  intro: ReactNode
  passos: { titulo: string; texto: ReactNode }[]
  nota?: ReactNode
}

const R = <NomeRangify className="text-laranja-claro" />

const TOPICOS: Record<TopicoAjuda, Topico> = {
  fila: {
    eyebrow: 'Fila', titulo: 'Como funciona a fila', icone: <Swords size={20} />,
    intro: <>Dez jogadores da mesma região formam uma partida. Enquanto esperas podes navegar no site à vontade: o alerta aparece em qualquer página.</>,
    passos: [
      { titulo: 'Entras na fila', texto: 'Precisas de ter o Riot ID ligado. A fila mostra quantos lugares já estão ocupados.' },
      { titulo: 'A fila enche', texto: `Com 10 jogadores, a partida é criada e todos recebem um pedido de confirmação com ${SEGUNDOS_CONFIRMAR} segundos.` },
      { titulo: 'Aceitas ou recusas', texto: `Se toda a gente aceitar, começa o draft. Quem recusa ou deixa o tempo acabar fica ${MINUTOS_COOLDOWN} minutos sem poder entrar na fila.` },
      { titulo: 'Ninguém perde o lugar', texto: 'Quando alguém falha a confirmação, quem aceitou volta à fila com o tempo de espera que já tinha.' },
    ],
  },
  draft: {
    eyebrow: 'Draft', titulo: 'Como funciona o draft', icone: <Crown size={20} />,
    intro: <>Os capitães montam as equipas à vez, a partir dos 8 jogadores que sobram.</>,
    passos: [
      { titulo: 'Dois capitães', texto: 'Os dois jogadores com o rank oficial mais alto são os capitães. O mais alto fica com a Equipa A.' },
      { titulo: 'Escolhas alternadas', texto: 'O Capitão A escolhe primeiro e depois alternam: A, B, A, B, até cada equipa ter 5 jogadores.' },
      { titulo: `${SEGUNDOS_ESCOLHA} segundos por escolha`, texto: 'Se o tempo acabar, o sistema escolhe pelo capitão o jogador disponível com o rank oficial mais alto.' },
      { titulo: 'Toda a gente vê', texto: 'Os outros jogadores acompanham as escolhas em direto, com o rank e a função preferida de cada um.' },
    ],
  },
  mapas: {
    eyebrow: 'Mapas', titulo: 'Como funcionam os bans de mapas', icone: <Ban size={20} />,
    intro: <>A pool tem 7 mapas. Os capitães tiram mapas até sobrar um, que é o da partida.</>,
    passos: [
      { titulo: 'Seis bans', texto: 'Alternados entre capitães: A, B, A, B, A, B.' },
      { titulo: `${SEGUNDOS_BAN} segundos por ban`, texto: 'Se o tempo acabar, sai um mapa ao acaso dos que ainda estão disponíveis.' },
      { titulo: 'O decisivo', texto: 'O mapa que sobra é o da partida. Vês logo quem baniu o quê.' },
    ],
  },
  codigo: {
    eyebrow: 'Grupo', titulo: 'Como funciona o código do grupo', icone: <ClipboardPaste size={20} />,
    intro: <>A partida joga-se num grupo personalizado do Valorant. O {R} só guarda o código para toda a gente entrar no mesmo sítio.</>,
    passos: [
      { titulo: 'O Capitão A cria o grupo', texto: 'No Valorant: Jogar, Personalizado, criar grupo. Copia o código de 6 letras ou números.' },
      { titulo: 'Cola o código aqui', texto: 'Assim que o código é partilhado, os outros 9 jogadores veem-no e podem copiá-lo com um clique.' },
      { titulo: 'Entra com a conta certa', texto: 'Joga com o Riot ID que tens ligado. É por ele que o resultado é confirmado depois.' },
      { titulo: `Bloqueio de ${MINUTOS_BLOQUEIO} minutos`, texto: 'O resultado só pode ser submetido 15 minutos depois de o código ser partilhado, para evitar resultados inventados.' },
    ],
  },
  resultado: {
    eyebrow: 'Resultado', titulo: 'Como funcionam o resultado e as disputas', icone: <Flag size={20} />,
    intro: <>Os dois capitães submetem o resultado e o {R} confirma-o com os dados oficiais do jogo.</>,
    passos: [
      { titulo: 'Os capitães submetem', texto: 'Cada capitão indica as rondas das duas equipas. Os outros jogadores só acompanham.' },
      { titulo: 'Resultados válidos', texto: 'Uma equipa chega a 13 com 11 ou menos do outro lado (13-11, 13-7), ou há prolongamento a partir de 12-12 e ganha quem fizer 2 de vantagem (14-12, 15-13).' },
      { titulo: 'Batem certo', texto: 'A partida segue para processamento: o sistema procura o jogo personalizado na Henrik Dev API e tira o KDA, o ACS e os first bloods de cada um.' },
      { titulo: 'Não batem certo', texto: 'A partida fica em disputa e a equipa do Rangify decide com base nas provas. Resultados falsos dão castigo.' },
    ],
  },
  ranking: {
    eyebrow: 'Ranking', titulo: 'Como funciona o ranking', icone: <Trophy size={20} />,
    intro: <>O ranking é ordenado pelos pontos {R}, não pelo rank oficial. Toda a gente começa a temporada com {PONTOS_INICIAIS} pontos.</>,
    passos: [
      { titulo: `Base de ${PONTOS_BASE} pontos`, texto: `Uma vitória vale +${PONTOS_BASE} e uma derrota tira ${PONTOS_BASE}.` },
      { titulo: 'O desnível', texto: 'O teu rank oficial é comparado com a média do rank oficial da equipa adversária.' },
      { titulo: 'Adversários acima de ti', texto: `Cada divisão de diferença soma +${POR_DIVISAO}, até +${BONUS_MAX}. Ganhar vale mais e perder custa menos.` },
      { titulo: 'Adversários abaixo de ti', texto: `Cada divisão de diferença tira ${POR_DIVISAO}, até ${BONUS_MIN}. Ganhar vale menos e perder custa mais.` },
    ],
    nota: <>Exemplo: és Diamante 2 e a outra equipa tem média Ascendente 1, duas divisões acima. Uma vitória dá <b className="text-vitoria">+26</b> e uma derrota tira só <b className="text-derrota">14</b>.</>,
  },
  rank: {
    eyebrow: 'Rank oficial', titulo: 'Para que serve o rank oficial', icone: <Shield size={20} />,
    intro: <>O rank oficial da Riot nunca ordena o ranking. Serve para escolher os capitães e para calcular o desnível dos pontos.</>,
    passos: [
      { titulo: 'Vem do teu Riot ID', texto: 'É lido através da Henrik Dev API quando ligas a conta.' },
      { titulo: `Atualiza no máximo a cada ${HORAS_CACHE_RANK} horas`, texto: 'Podes pedir uma sincronização no perfil. Pelo meio fica guardado, para não abusar da API.' },
      { titulo: 'Sem rank', texto: 'Quem ainda não tem rank competitivo conta como Prata 3 nas contas do desnível.' },
    ],
  },
  missoes: {
    eyebrow: 'Missões', titulo: 'Como funcionam as missões', icone: <Target size={20} />,
    intro: <>Objetivos que se completam a jogar no hub. Cada missão dá XP para o Rangify Experience, o passe da temporada.</>,
    passos: [
      { titulo: 'Diárias e semanais', texto: 'Aparecem 4 diárias e 8 semanais, sorteadas de um catálogo maior. Mudam todos os dias às 00:00 e à segunda-feira (UTC), e o progresso volta a zero.' },
      { titulo: 'De temporada', texto: 'Ficam abertas até ao fim da temporada, como chegar aos 1200 pontos.' },
      { titulo: 'XP e nível', texto: 'Completar uma missão dá o XP dela. Passar do nível N para o seguinte custa 400 + 100 x N de XP, e o ranking de nível mostra quem vai mais à frente.' },
      { titulo: 'Progresso automático', texto: 'Os kills, os first bloods, o ACS e os MVP vêm das estatísticas que o sistema tira de cada partida.' },
    ],
  },
  funcoes: {
    eyebrow: 'Funções', titulo: 'Funções no Rangify', icone: <Scale size={20} />,
    intro: <>Cada conta tem uma função, que decide o que pode fazer.</>,
    passos: [
      { titulo: 'Owner', texto: 'Tudo. É o único que atribui ou retira as funções Owner e Dev.' },
      { titulo: 'Dev', texto: 'Área de staff e ferramentas de teste: simular fila cheia e simular partidas. As partidas de teste contam como as outras; remover uma partida devolve os pontos e tira as estatísticas.' },
      { titulo: 'Mod', texto: 'Resolve disputas, cancela partidas encravadas e trata denúncias.' },
      { titulo: 'Verificado e Jogador', texto: 'Jogam, sugerem e votam. O Verificado tem um selo no perfil.' },
    ],
  },
}

const Contexto = createContext<(t: TopicoAjuda) => void>(() => {})

export function ProvedorAjuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<TopicoAjuda | null>(null)
  const fechar = useCallback(() => setAberto(null), [])
  const t = aberto ? TOPICOS[aberto] : null
  return (
    <Contexto.Provider value={setAberto}>
      {children}
      <Modal aberto={!!t} onFechar={fechar} titulo={t?.titulo} eyebrow={t ? `Como funciona · ${t.eyebrow}` : undefined} largura={600}>
        {t && (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[14.5px] leading-[1.6] text-suave">{t.intro}</p>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {t.passos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3.5 rounded-xl border border-white/6 bg-white/[0.025] p-3.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-laranja/32 bg-laranja/12 font-mono text-[12px] font-bold text-pessego">{i + 1}</span>
                  <span className="flex flex-col gap-1">
                    <span className="text-[14px] font-bold">{p.titulo}</span>
                    <span className="text-[13.5px] leading-normal text-suave">{p.texto}</span>
                  </span>
                </li>
              ))}
            </ol>
            {t.nota && (
              <p className="m-0 flex gap-2.5 rounded-xl border border-laranja/25 bg-laranja/8 p-3.5 text-[13.5px] leading-normal text-marfim">
                <BookOpen size={17} className="mt-px shrink-0 text-laranja" aria-hidden />
                <span>{t.nota}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button type="button" className="btn btn-primario" onClick={fechar}>Percebido</button>
            </div>
          </div>
        )}
      </Modal>
    </Contexto.Provider>
  )
}

export function useAjuda() {
  return useContext(Contexto)
}
