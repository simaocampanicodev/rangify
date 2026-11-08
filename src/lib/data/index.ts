import { temSupabase } from '../supabase'
import { comAvisos } from './avisos'
import { comTextoLimpo } from './limpeza'
import { dadosLocais } from './local'
import { dadosSupabase } from './supabase'
import type { Dados } from './tipos'

export * from './tipos'
export { avisarMudanca, aoMudarDados, type Mudanca } from './eventos'

/**
 * Com o Supabase configurado no .env, contas a sério; sem ele, o modo demo,
 * tudo no browser e com bots. As páginas não sabem qual é.
 */
export const dados: Dados = comAvisos(comTextoLimpo(temSupabase ? dadosSupabase : dadosLocais))
