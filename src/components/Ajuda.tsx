import {
  Ban, BookOpen, ClipboardPaste, Crown, Flag, Scale, Shield, Swords, Target, Trophy,
} from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { l } from '@/lib/idioma'
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

/** Construído ao abrir, para ficar na língua do site. */
function topicos(): Record<TopicoAjuda, Topico> {
  return {
    fila: {
      eyebrow: l('Fila', 'Queue'), titulo: l('Como funciona a fila', 'How the queue works'), icone: <Swords size={20} />,
      intro: l('Dez jogadores da mesma região formam uma partida. Enquanto esperas podes navegar no site à vontade: o alerta aparece em qualquer página.', 'Ten players from the same region make a match. While you wait you can browse the site freely: the alert shows up on any page.'),
      passos: [
        { titulo: l('Entras na fila', 'You join the queue'), texto: l('Precisas de ter o Riot ID ligado. A fila mostra quantos lugares já estão ocupados.', 'You need your Riot ID linked. The queue shows how many spots are taken.') },
        { titulo: l('A fila enche', 'The queue fills'), texto: l(`Com 10 jogadores, a partida é criada e todos recebem um pedido de confirmação com ${SEGUNDOS_CONFIRMAR} segundos.`, `With 10 players, the match is created and everyone gets a ${SEGUNDOS_CONFIRMAR}-second ready check.`) },
        { titulo: l('Aceitas ou recusas', 'You accept or decline'), texto: l(`Se toda a gente aceitar, começa o draft. Quem recusa ou deixa o tempo acabar fica ${MINUTOS_COOLDOWN} minutos sem poder entrar na fila.`, `If everyone accepts, the draft starts. Whoever declines or lets the time run out cannot queue for ${MINUTOS_COOLDOWN} minutes.`) },
        { titulo: l('Ninguém perde o lugar', 'Nobody loses their spot'), texto: l('Quando alguém falha a confirmação, quem aceitou volta à fila com o tempo de espera que já tinha.', 'When someone misses the ready check, those who accepted go back to the queue with the wait time they had.') },
      ],
    },
    draft: {
      eyebrow: 'Draft', titulo: l('Como funciona o draft', 'How the draft works'), icone: <Crown size={20} />,
      intro: l('Os capitães montam as equipas à vez, a partir dos 8 jogadores que sobram.', 'The captains build the teams in turns, from the 8 remaining players.'),
      passos: [
        { titulo: l('Dois capitães', 'Two captains'), texto: l('Os dois jogadores com o rank oficial mais alto são os capitães. O mais alto fica com a Equipa A.', 'The two players with the highest official rank are the captains. The highest gets Team A.') },
        { titulo: l('Escolhas alternadas', 'Alternating picks'), texto: l('O Capitão A escolhe primeiro e depois alternam: A, B, A, B, até cada equipa ter 5 jogadores.', 'Captain A picks first and then they alternate: A, B, A, B, until each team has 5 players.') },
        { titulo: l(`${SEGUNDOS_ESCOLHA} segundos por escolha`, `${SEGUNDOS_ESCOLHA} seconds per pick`), texto: l('Se o tempo acabar, o sistema escolhe pelo capitão o jogador disponível com o rank oficial mais alto.', 'If time runs out, the system picks the available player with the highest official rank for the captain.') },
        { titulo: l('Toda a gente vê', 'Everyone sees it'), texto: l('Os outros jogadores acompanham as escolhas em direto, com o rank e a função preferida de cada um.', 'The other players follow the picks live, with each player\'s rank and preferred role.') },
      ],
    },
    mapas: {
      eyebrow: l('Mapas', 'Maps'), titulo: l('Como funcionam os bans de mapas', 'How map bans work'), icone: <Ban size={20} />,
      intro: l('Entram os mapas da rotação escolhida pela staff (7 de origem). Os capitães tiram mapas até sobrar um, que é o da partida.', 'The maps in the rotation chosen by the staff are used (7 by default). The captains remove maps until one is left, which is the match map.'),
      passos: [
        { titulo: l('Bans alternados', 'Alternating bans'), texto: l('Entre capitães: A, B, A, B... Com 7 mapas são 6 bans.', 'Between captains: A, B, A, B... With 7 maps there are 6 bans.') },
        { titulo: l(`${SEGUNDOS_BAN} segundos por ban`, `${SEGUNDOS_BAN} seconds per ban`), texto: l('Se o tempo acabar, sai um mapa ao acaso dos que ainda estão disponíveis.', 'If time runs out, a random map is removed from the ones still available.') },
        { titulo: l('O decisivo', 'The decider'), texto: l('O mapa que sobra é o da partida. Vês logo quem baniu o quê.', 'The map left over is the match map. You see right away who banned what.') },
      ],
    },
    codigo: {
      eyebrow: l('Grupo', 'Party'), titulo: l('Como funciona o código do grupo', 'How the party code works'), icone: <ClipboardPaste size={20} />,
      intro: <>{l('A partida joga-se num grupo personalizado do Valorant. O', 'The match is played in a Valorant custom party.')} {R} {l('só guarda o código para toda a gente entrar no mesmo sítio.', 'only stores the code so everyone joins the same place.')}</>,
      passos: [
        { titulo: l('O Capitão A cria o grupo', 'Captain A creates the party'), texto: l('No Valorant: Jogar, Personalizado, criar grupo. Copia o código de 6 letras ou números.', 'In Valorant: Play, Custom, create party. Copy the 6-character code.') },
        { titulo: l('Cola o código aqui', 'Paste the code here'), texto: l('Assim que o código é partilhado, os outros 9 jogadores veem-no e podem copiá-lo com um clique.', 'As soon as the code is shared, the other 9 players see it and can copy it in one click.') },
        { titulo: l('Entra com a conta certa', 'Use the right account'), texto: l('Joga com o Riot ID que tens ligado. É por ele que o resultado é confirmado depois.', 'Play with the Riot ID you linked. That is how the result gets confirmed later.') },
        { titulo: l(`Bloqueio de ${MINUTOS_BLOQUEIO} minutos`, `${MINUTOS_BLOQUEIO}-minute lock`), texto: l(`O resultado só pode ser submetido ${MINUTOS_BLOQUEIO} minutos depois de o código ser partilhado, para evitar resultados inventados.`, `The result can only be submitted ${MINUTOS_BLOQUEIO} minutes after the code is shared, to prevent made-up results.`) },
      ],
    },
    resultado: {
      eyebrow: l('Resultado', 'Result'), titulo: l('Como funcionam o resultado e as disputas', 'How results and disputes work'), icone: <Flag size={20} />,
      intro: <>{l('Os dois capitães submetem o resultado e o', 'Both captains submit the result and')} {R} {l('confirma-o com os dados oficiais do jogo.', 'confirms it with the official game data.')}</>,
      passos: [
        { titulo: l('Os capitães submetem', 'The captains submit'), texto: l('Cada capitão indica as rondas das duas equipas. Os outros jogadores só acompanham.', 'Each captain enters the rounds for both teams. The other players just follow.') },
        { titulo: l('Resultados válidos', 'Valid results'), texto: l('Uma equipa chega a 13 com 11 ou menos do outro lado (13-11, 13-7), ou há prolongamento a partir de 12-12 e ganha quem fizer 2 de vantagem (14-12, 15-13).', 'A team reaches 13 with 11 or fewer on the other side (13-11, 13-7), or there is overtime from 12-12 and the first team 2 ahead wins (14-12, 15-13).') },
        { titulo: l('Batem certo', 'They match'), texto: l('A partida segue para processamento: o sistema procura o jogo personalizado na Henrik Dev API e tira o KDA, o ACS, os first bloods, os trades, o HS% e o KAST de cada um.', 'The match goes to processing: the system finds the custom game on the Henrik Dev API and pulls everyone\'s KDA, ACS, first bloods, trades, HS% and KAST.') },
        { titulo: l('Não batem certo', 'They do not match'), texto: l('A partida fica em disputa e a equipa do Rangify decide com base nas provas. Resultados falsos dão castigo.', 'The match goes into dispute and the Rangify team decides based on evidence. False results are penalised.') },
      ],
    },
    ranking: {
      eyebrow: l('Tabela', 'Leaderboard'), titulo: l('Como funciona a tabela', 'How the leaderboard works'), icone: <Trophy size={20} />,
      intro: <>{l('A tabela é ordenada pelos pontos', 'The leaderboard is sorted by')} {R} {l(`, não pelo rank oficial. Toda a gente começa a temporada com ${PONTOS_INICIAIS} pontos.`, `points, not by official rank. Everyone starts the season with ${PONTOS_INICIAIS} points.`)}</>,
      passos: [
        { titulo: l(`Base de ${PONTOS_BASE} pontos`, `${PONTOS_BASE}-point base`), texto: l(`Uma vitória vale +${PONTOS_BASE} e uma derrota tira ${PONTOS_BASE}.`, `A win is worth +${PONTOS_BASE} and a loss takes ${PONTOS_BASE}.`) },
        { titulo: l('O desnível', 'The rank gap'), texto: l('O teu rank oficial é comparado com a média do rank oficial da equipa adversária.', 'Your official rank is compared with the average official rank of the enemy team.') },
        { titulo: l('Adversários acima de ti', 'Opponents above you'), texto: l(`Cada divisão de diferença soma +${POR_DIVISAO}, até +${BONUS_MAX}. Ganhar vale mais e perder custa menos.`, `Each division of difference adds +${POR_DIVISAO}, up to +${BONUS_MAX}. Winning is worth more and losing costs less.`) },
        { titulo: l('Adversários abaixo de ti', 'Opponents below you'), texto: l(`Cada divisão de diferença tira ${POR_DIVISAO}, até ${BONUS_MIN}. Ganhar vale menos e perder custa mais.`, `Each division of difference takes ${POR_DIVISAO}, down to ${BONUS_MIN}. Winning is worth less and losing costs more.`) },
      ],
      nota: <>{l('Exemplo: és Diamante 2 e a outra equipa tem média Ascendente 1, duas divisões acima. Uma vitória dá', 'Example: you are Diamond 2 and the other team averages Ascendant 1, two divisions above. A win gives')} <b className="text-vitoria">+26</b> {l('e uma derrota tira só', 'and a loss only takes')} <b className="text-derrota">14</b>.</>,
    },
    rank: {
      eyebrow: l('Rank oficial', 'Official rank'), titulo: l('Para que serve o rank oficial', 'What the official rank is for'), icone: <Shield size={20} />,
      intro: l('O rank oficial da Riot nunca ordena a tabela. Serve para escolher os capitães e para atribuir os pontos.', 'The official Riot rank never sorts the leaderboard. It picks the captains and is used to award points.'),
      passos: [
        { titulo: l('Vem do teu Riot ID', 'It comes from your Riot ID'), texto: l('É lido através da Henrik Dev API quando ligas a conta.', 'It is read through the Henrik Dev API when you link your account.') },
        { titulo: l(`Atualiza no máximo a cada ${HORAS_CACHE_RANK} horas`, `Updates at most every ${HORAS_CACHE_RANK} hours`), texto: l('Podes pedir uma sincronização no perfil. Pelo meio fica guardado, para não abusar da API.', 'You can request a sync on your profile. In between it is cached, so the API is not overused.') },
        { titulo: l('Sem rank', 'Unranked'), texto: l('Quem ainda não tem rank competitivo conta como Prata 3 nas contas dos pontos.', 'Players without a competitive rank count as Silver 3 for points.') },
      ],
    },
    missoes: {
      eyebrow: l('Missões', 'Missions'), titulo: l('Como funcionam as missões', 'How missions work'), icone: <Target size={20} />,
      intro: l('Objetivos que se completam a jogar no hub. Cada missão dá XP para o Rangify Experience, o passe da temporada.', 'Goals you complete by playing on the hub. Each mission gives XP for the Rangify Experience, the season pass.'),
      passos: [
        { titulo: l('Diárias e semanais', 'Daily and weekly'), texto: l('Aparecem 4 diárias e 8 semanais, sorteadas de um catálogo maior. Mudam todos os dias às 00:00 e à segunda-feira (UTC), e o progresso volta a zero.', '4 daily and 8 weekly missions are drawn from a bigger catalogue. They change every day at 00:00 and on Mondays (UTC), and progress resets.') },
        { titulo: l('De temporada', 'Season'), texto: l('Ficam abertas até ao fim da temporada, como chegar aos 1200 pontos.', 'They stay open until the end of the season, like reaching 1200 points.') },
        { titulo: l('XP e nível', 'XP and level'), texto: l('Completar uma missão dá o XP dela. Passar do nível N para o seguinte custa 400 + 100 x N de XP, e a tabela de nível mostra quem vai mais à frente.', 'Completing a mission gives its XP. Going from level N to the next costs 400 + 100 x N XP, and the level leaderboard shows who is ahead.') },
        { titulo: l('Progresso automático', 'Automatic progress'), texto: l('Os kills, os first bloods, o ACS e os MVP vêm das estatísticas que o sistema tira de cada partida.', 'Kills, first bloods, ACS and MVPs come from the stats the system pulls from each match.') },
      ],
    },
    funcoes: {
      eyebrow: l('Funções', 'Roles'), titulo: l('Funções no Rangify', 'Roles on Rangify'), icone: <Scale size={20} />,
      intro: l('Cada conta tem uma função, que decide o que pode fazer.', 'Each account has a role, which decides what it can do.'),
      passos: [
        { titulo: 'Owner', texto: l('Tudo. É o único que atribui ou retira as funções Owner e Dev.', 'Everything. The only one who gives or removes the Owner and Dev roles.') },
        { titulo: 'Dev', texto: l('Área de staff e ferramentas de teste: simular fila cheia e simular partidas. As partidas de teste contam como as outras; remover uma partida devolve os pontos e tira as estatísticas.', 'Staff area and test tools: simulate a full queue and simulate matches. Test matches count like any other; removing a match returns the points and removes the stats.') },
        { titulo: 'Mod', texto: l('Resolve disputas, cancela partidas encravadas e trata denúncias.', 'Resolves disputes, cancels stuck matches and handles reports.') },
        { titulo: l('Verificado e Jogador', 'Verified and Player'), texto: l('Jogam, sugerem e votam. O Verificado tem um selo no perfil.', 'They play, suggest and vote. Verified players have a badge on their profile.') },
      ],
    },
  }
}

const Contexto = createContext<(t: TopicoAjuda) => void>(() => {})

export function ProvedorAjuda({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<TopicoAjuda | null>(null)
  const fechar = useCallback(() => setAberto(null), [])
  const t = aberto ? topicos()[aberto] : null
  return (
    <Contexto.Provider value={setAberto}>
      {children}
      <Modal aberto={!!t} onFechar={fechar} titulo={t?.titulo} eyebrow={t ? `${l('Como funciona', 'How it works')} · ${t.eyebrow}` : undefined} largura={600}>
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
              <button type="button" className="btn btn-primario" onClick={fechar}>{l('Percebido', 'Got it')}</button>
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
