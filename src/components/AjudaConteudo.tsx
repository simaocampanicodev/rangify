// Os textos da ajuda ("Como funciona") e a janela onde aparecem. Este ficheiro só
// descarrega quando alguém abre a ajuda pela primeira vez (ver Ajuda.tsx).
import {
  Ban, BookOpen, ClipboardPaste, Crown, Flag, Scale, Shield, Swords, Target, Trophy,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { l } from '@/lib/idioma'
import { DESEMPENHO_MAX, PONTOS_BASE, PONTOS_INICIAIS, RESULTADO_MAX, RESULTADO_MIN, RS_POR_PONTO, margemRondas } from '@/lib/pontos'
import { HORAS_CACHE_RANK, MINUTOS_BLOQUEIO, MINUTOS_COOLDOWN, SEGUNDOS_BAN, SEGUNDOS_CONFIRMAR, SEGUNDOS_ESCOLHA } from '@/lib/regras'
import { NomeRangify } from './Marca'
import { Modal } from './ui'

import type { TopicoAjuda } from './Ajuda'

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
        { titulo: l('Dois capitães ao calhas', 'Two random captains'), texto: l('Os dois capitães são sorteados entre os 10, para o draft não ficar sempre com as mesmas pessoas.', 'The two captains are drawn at random from the 10, so the draft does not always go to the same people.') },
        { titulo: l('Ordem das escolhas', 'Pick order'), texto: l('Depois dos dois capitães, as 8 escolhas seguem a ordem A, B, B, A, A, B, B, A, até cada equipa ter 5 jogadores.', 'After the two captains, the 8 picks follow A, B, B, A, A, B, B, A, until each team has 5 players.') },
        { titulo: l(`${SEGUNDOS_ESCOLHA} segundos por escolha`, `${SEGUNDOS_ESCOLHA} seconds per pick`), texto: l('Se o tempo acabar, o sistema escolhe pelo capitão o jogador disponível com o rank oficial mais alto.', 'If time runs out, the system picks the available player with the highest official rank for the captain.') },
        { titulo: l('Toda a gente vê', 'Everyone sees it'), texto: l('Os outros jogadores acompanham as escolhas em direto, com o rank e a função preferida de cada um.', 'The other players follow the picks live, with each player\'s rank and preferred role.') },
      ],
    },
    mapas: {
      eyebrow: l('Mapas', 'Maps'), titulo: l('Como funcionam os bans de mapas', 'How map bans work'), icone: <Ban size={20} />,
      intro: l('Entram os mapas da rotação escolhida pela staff (7 de origem). Os capitães tiram mapas até sobrar um, que é o da partida.', 'The maps in the rotation chosen by the staff are used (7 by default). The captains remove maps until one is left, which is the match map.'),
      passos: [
        { titulo: l('Bans alternados', 'Alternating bans'), texto: l('Entre capitães: A, B, A, B... Com 7 mapas são 6 bans.', 'Between captains: A, B, A, B... With 7 maps there are 6 bans.') },
        { titulo: l(`${SEGUNDOS_BAN} segundos por ban`, `${SEGUNDOS_BAN} seconds per ban`), texto: l('Os colegas do capitão podem sugerir o mapa a banir; o capitão decide. Se o tempo acabar, sai o mais sugerido pela equipa, ou um ao acaso.', 'The captain\'s teammates can suggest the map to ban; the captain decides. If time runs out, the team\'s most suggested map goes, or a random one.') },
        { titulo: l('O decisivo e o lado', 'The decider and the side'), texto: l('O mapa que sobra é o da partida. A equipa que não fez o último ban escolhe se começa a atacar ou a defender.', 'The map left over is the match map. The team that did not make the last ban picks whether it starts on attack or defence.') },
      ],
    },
    codigo: {
      eyebrow: l('Grupo', 'Party'), titulo: l('Como funciona o código do grupo', 'How the party code works'), icone: <ClipboardPaste size={20} />,
      intro: <>{l('A partida joga-se num grupo personalizado do Valorant. O', 'The match is played in a Valorant custom party.')} {R} {l('só guarda o código para toda a gente entrar no mesmo sítio.', 'only stores the code so everyone joins the same place.')}</>,
      passos: [
        { titulo: l('Um capitão cria o grupo', 'A captain creates the party'), texto: l('No Valorant: Jogar, Personalizado, criar grupo. Copia o código de 6 letras ou números. Qualquer um dos dois capitães o pode partilhar, o primeiro a guardar vale.', 'In Valorant: Play, Custom, create party. Copy the 6-character code. Either captain can share it, the first to save it wins.') },
        { titulo: l('Cola o código aqui', 'Paste the code here'), texto: l('Assim que o código é partilhado, os outros 9 jogadores veem-no e podem copiá-lo com um clique.', 'As soon as the code is shared, the other 9 players see it and can copy it in one click.') },
        { titulo: l('Entra com a conta certa', 'Use the right account'), texto: l('Joga com o Riot ID que tens ligado. É por ele que o resultado é confirmado depois.', 'Play with the Riot ID you linked. That is how the result gets confirmed later.') },
        { titulo: l(`Bloqueio de ${MINUTOS_BLOQUEIO} minutos`, `${MINUTOS_BLOQUEIO}-minute lock`), texto: l(`Os capitães só podem confirmar quem ganhou ${MINUTOS_BLOQUEIO} minutos depois de o código ser partilhado, para ninguém dar o jogo como acabado cedo demais.`, `The captains can only confirm who won ${MINUTOS_BLOQUEIO} minutes after the code is shared, so nobody calls the game over too early.`) },
      ],
    },
    resultado: {
      eyebrow: l('Resultado', 'Result'), titulo: l('Como funciona o resultado', 'How the result works'), icone: <Flag size={20} />,
      intro: <>{l('Os capitães só confirmam que o jogo acabou. O resultado e quem ganhou vêm dos dados oficiais, pelo', 'The captains only confirm the game is over. The score and the winner come from the official data, through')} {R}.</>,
      passos: [
        { titulo: l('Os capitães votam', 'The captains vote'), texto: l('Cada capitão escolhe a equipa que ganhou (A ou B). É só a confirmação de que o jogo acabou. Os outros jogadores só acompanham.', 'Each captain picks the winning team (A or B). It is only the confirmation that the game is over. The other players just follow.') },
        { titulo: l('A API entra em ação', 'The API steps in'), texto: l('Quando os dois capitães votam, ou 3 minutos depois de um deles votar, o sistema procura o jogo personalizado na Henrik Dev API e tira o resultado em rondas, quem ganhou e o KDA, o ACS, os first bloods, os trades, o HS% e o KAST de cada um.', 'When both captains vote, or 3 minutes after one of them votes, the system finds the custom game on the Henrik Dev API and pulls the round score, the winner and each player\'s KDA, ACS, first bloods, trades, HS% and KAST.') },
        { titulo: l('Votaram mal?', 'Voted wrong?'), texto: l('Não faz mal: a API sabe quem ganhou e com que resultado, e corrige. Ninguém tem de resolver nada à mão.', 'No problem: the API knows who won and with what score, and corrects it. Nobody has to fix anything by hand.') },
        { titulo: l('A API não encontra o jogo', 'The API cannot find the game'), texto: l('Só então a partida fica em disputa e a equipa do Rangify decide com base nas provas.', 'Only then does the match go into dispute and the Rangify team decides based on evidence.') },
      ],
    },
    ranking: {
      eyebrow: l('Tabela', 'Leaderboard'), titulo: l('Como funciona a tabela', 'How the leaderboard works'), icone: <Trophy size={20} />,
      intro: <>{l('A tabela é ordenada pelos pontos', 'The leaderboard is sorted by')} {R} {l(`, não pelo rank oficial. Toda a gente começa a temporada com ${PONTOS_INICIAIS} pontos.`, `points, not by official rank. Everyone starts the season with ${PONTOS_INICIAIS} points.`)}</>,
      passos: [
        { titulo: l('Só entra quem já jogou', 'Only players who have played get in'), texto: l('Quem acabou de criar a conta não aparece na tabela: entras assim que acabares a tua primeira partida.', 'Players who just created their account are not on the leaderboard: you get in as soon as you finish your first match.') },
        { titulo: l(`Base de ${PONTOS_BASE} pontos`, `${PONTOS_BASE}-point base`), texto: l(`Uma vitória vale +${PONTOS_BASE} e uma derrota tira ${PONTOS_BASE}.`, `A win is worth +${PONTOS_BASE} and a loss takes ${PONTOS_BASE}.`) },
        { titulo: l('A margem de rondas', 'The round margin'), texto: l(`Um 13-1 não vale o mesmo que um 13-11: a base vai de ${RESULTADO_MIN} (13-11) a ${RESULTADO_MAX} (13-0). Quem ganha de lavada ganha mais, e quem perde de lavada perde mais.`, `A 13-1 is not worth the same as a 13-11: the base goes from ${RESULTADO_MIN} (13-11) to ${RESULTADO_MAX} (13-0). Winning by a landslide earns more, and losing by a landslide costs more.`) },
        { titulo: l('O rank não conta', 'Rank does not count'), texto: l('O rank oficial da Riot não entra nas contas: ganhar vale o mesmo para toda a gente. O que muda os pontos é o que jogas.', 'Official Riot rank is not part of the maths: winning is worth the same for everyone. What changes your points is how you play.') },
        { titulo: l('O teu desempenho: Rangify Score', 'Your performance: Rangify Score'), texto: l(`O RS junta o teu ACS (35%), KDA (25%), KAST (25%) e trades (15%), comparados com a média dos 10 jogadores da partida. 100 é a média. Cada ${RS_POR_PONTO} de RS acima ou abaixo de 100 vale 1 ponto, até ${DESEMPENHO_MAX} para cada lado. O MVP é quem tem o RS mais alto. No separador Agentes vês o melhor jogador de cada agente, pela média de RS com ele.`, `RS combines your ACS (35%), KDA (25%), KAST (25%) and trades (15%), compared with the average of the 10 players in the match. 100 is average. Every ${RS_POR_PONTO} RS above or below 100 is worth 1 point, up to ${DESEMPENHO_MAX} either way. The MVP is whoever has the highest RS.`) },
      ],
      nota: <>{l('Exemplo: ganhas por 13-5 e fazes um RS de 124. O resultado dá', 'Example: you win 13-5 with an RS of 124. The result gives')} <b className="text-vitoria">+{PONTOS_BASE + margemRondas(13, 5)}</b> {l('(20 e mais 1 pela diferença de rondas) e o desempenho soma mais', '(20 plus 1 for the round difference) and performance adds')} <b className="text-vitoria">{Math.round(24 / RS_POR_PONTO)}</b>{l('. Se perdesses 5-13 com o mesmo RS, a derrota tiraria', '. If you lost 5-13 with the same RS, the loss would take')} <b className="text-derrota">{PONTOS_BASE + margemRondas(13, 5)}</b> {l('e o desempenho devolvia', 'and performance would give back')} <b className="text-vitoria">{Math.round(24 / RS_POR_PONTO)}</b>.</>,
    },
    rank: {
      eyebrow: l('Rank oficial', 'Official rank'), titulo: l('Para que serve o rank oficial', 'What the official rank is for'), icone: <Shield size={20} />,
      intro: l('O rank oficial da Riot é só informativo: aparece no perfil e na média da sala e das equipas. Não ordena a tabela e não conta para os pontos.', 'The official Riot rank is informational only: it shows on profiles and in the lobby and team averages. It does not sort the leaderboard and does not count towards points.'),
      passos: [
        { titulo: l('Vem do teu Riot ID', 'It comes from your Riot ID'), texto: l('É lido através da Henrik Dev API quando ligas a conta.', 'It is read through the Henrik Dev API when you link your account.') },
        { titulo: l(`Atualiza no máximo a cada ${HORAS_CACHE_RANK} horas`, `Updates at most every ${HORAS_CACHE_RANK} hours`), texto: l('Podes pedir uma sincronização no perfil. Pelo meio fica guardado, para não abusar da API.', 'You can request a sync on your profile. In between it is cached, so the API is not overused.') },
        { titulo: l('Sem rank', 'Unranked'), texto: l('Quem ainda não tem rank competitivo conta como Prata 3 na média da sala e das equipas.', 'Players without a competitive rank count as Silver 3 in the lobby and team averages.') },
      ],
    },
    missoes: {
      eyebrow: l('Missões', 'Missions'), titulo: l('Como funcionam as missões', 'How missions work'), icone: <Target size={20} />,
      intro: l('Objetivos que se completam a jogar no hub. Cada missão dá XP para o Rangify Experience, o passe da temporada.', 'Goals you complete by playing on the hub. Each mission gives XP for the Rangify Experience, the season pass.'),
      passos: [
        { titulo: l('Diárias e semanais', 'Daily and weekly'), texto: l('Aparecem 4 diárias e 8 semanais, sorteadas de um catálogo maior. Mudam todos os dias às 00:00 e à segunda-feira (UTC), e o progresso volta a zero.', '4 daily and 8 weekly missions are drawn from a bigger catalogue. They change every day at 00:00 and on Mondays (UTC), and progress resets.') },
        { titulo: l('De temporada', 'Season'), texto: l('Ficam abertas até ao fim da temporada, como chegar aos 1200 pontos.', 'They stay open until the end of the season, like reaching 1200 points.') },
        { titulo: l('XP e nível', 'XP and level'), texto: l('Completar uma missão dá o XP dela. Passar do nível N para o seguinte custa 400 + 100 x N de XP, e a tabela de nível mostra quem vai mais à frente.', 'Completing a mission gives its XP. Going from level N to the next costs 400 + 100 x N XP, and the level leaderboard shows who is ahead.') },
        { titulo: l('Progresso automático', 'Automatic progress'), texto: l('Os kills, os first bloods, o ACS e os MVP (o Rangify Score mais alto) vêm das estatísticas que o sistema tira de cada partida.', 'Kills, first bloods, ACS and MVPs (the highest Rangify Score) come from the stats the system pulls from each match.') },
      ],
    },
    funcoes: {
      eyebrow: l('Funções', 'Roles'), titulo: l('Funções no Rangify', 'Roles on Rangify'), icone: <Scale size={20} />,
      intro: l('Cada conta tem uma função, que decide o que pode fazer.', 'Each account has a role, which decides what it can do.'),
      passos: [
        { titulo: 'Owner', texto: l('Tudo. É o único que atribui ou retira as funções Owner e Dev.', 'Everything. The only one who gives or removes the Owner and Dev roles.') },
        { titulo: 'Dev', texto: l('Área de staff e ferramentas de teste: simular fila cheia e simular partidas. As partidas de teste contam como as outras; remover uma partida devolve os pontos e tira as estatísticas.', 'Staff area and test tools: simulate a full queue and simulate matches. Test matches count like any other; removing a match returns the points and removes the stats.') },
        { titulo: 'Mod', texto: l('Avisa jogadores e bane-os da fila (com uma mensagem e a duração à escolha), cancela partidas encravadas, trata denúncias e sugestões e decide as partidas que a API não encontra.', 'Warns players and bans them from the queue (with a message and a length of their choice), cancels stuck matches, handles reports and suggestions and decides the matches the API cannot find.') },
        { titulo: l('Verificado e Jogador', 'Verified and Player'), texto: l('Jogam, sugerem e votam. O Verificado tem um selo no perfil.', 'They play, suggest and vote. Verified players have a badge on their profile.') },
      ],
    },
  }
}

/** A janela de ajuda de um tópico. */
export function JanelaAjuda({ topico, onFechar: fechar }: { topico: TopicoAjuda; onFechar: () => void }) {
  const t = topicos()[topico]
  return (
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
  )
}
