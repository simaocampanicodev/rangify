/**
 * O título e a descrição de cada missão vêm da base de dados em português.
 * Em inglês, usa-se este catálogo pelo id (o mesmo da migração 0007).
 */
import type { Missao } from './dados'
import { emIngles } from './idioma'

const EN: Record<string, [string, string]> = {
  'd-jogar': ['Warm-up', 'Play 1 match today.'],
  'd-vitoria': ['First win', 'Win 1 match today.'],
  'd-tres': ['Full session', 'Play 3 matches today.'],
  'd-kills': ['Hot hand', 'Get 20 kills today.'],
  'd-fb': ['Opening pick', 'Get 3 first bloods today.'],
  'd-assist': ['Team spirit', 'Get 8 assists today.'],
  'd-duas': ['Double dose', 'Win 2 matches today.'],
  'd-capitao': ['Captain of the day', 'Play 1 match as captain today.'],
  'd-trades': ['Fair trade', 'Get 4 trades today.'],
  'd-acs': ['Good game', 'Finish a match today with 250 ACS or more.'],
  'm-jogos': ['Competitive routine', 'Play 10 matches this week.'],
  'm-vitorias': ['Five wins', 'Win 5 matches this week.'],
  'm-acima': ['Against the favourites', 'Win 2 matches against a team with a higher average official rank than yours.'],
  'm-fb': ['First blood', 'Get 15 first bloods this week.'],
  'm-mvp': ['Player of the match', 'Be MVP in 2 matches this week.'],
  's-serie': ['In form', 'Win 3 matches in a row this week.'],
  's-kills': ['Reaper', 'Get 100 kills this week.'],
  's-assist': ['Golden support', 'Get 40 assists this week.'],
  's-lider': ['Leadership', 'Win 2 matches as captain this week.'],
  's-mapas': ['Map tour', 'Play on 4 different maps this week.'],
  's-trades': ['Trade king', 'Get 15 trades this week.'],
  's-acs': ['Big game', 'Finish a match this week with 270 ACS or more.'],
  's-maratona': ['Marathon runner', 'Play 20 matches this week.'],
  's-imparavel': ['Unstoppable', 'Win 10 matches this week.'],
  's-capitao': ['Captain on duty', 'Play 4 matches as captain this week.'],
  'm-seq': ['On a run', 'Win 4 matches in a row this season.'],
  'm-acs': ['Inspired night', 'Finish a match with 300 ACS or more.'],
  'm-pontos': ['Road to 1200', 'Reach 1200 points this season.'],
  't-veterano': ['Veteran', 'Play 50 matches this season.'],
}

/** A missão com o título e a descrição na língua do site. */
export function traduzirMissao(m: Missao): Missao {
  const t = emIngles() ? EN[m.id] : undefined
  return t ? { ...m, titulo: t[0], descricao: t[1] } : m
}
