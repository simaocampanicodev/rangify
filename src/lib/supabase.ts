import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const temSupabase = Boolean(url && chave)
export const urlSupabase = url
export const chaveSupabase = chave

/** Só existe quando o .env tem as duas variáveis; caso contrário o site corre em modo demo. */
export const supabase: SupabaseClient | null = temSupabase
  ? createClient(url!, chave!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
