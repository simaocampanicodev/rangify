// Login com utilizador e palavra-passe, sem expor emails: o servidor troca o
// utilizador pelo email da conta e devolve só a sessão.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, chavePublica, cors, erro, resposta } from '../_shared/comum.ts'

const ERRADO = 'Utilizador ou palavra-passe errados.'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { utilizador, password } = await req.json() as { utilizador?: string; password?: string }
    if (!utilizador || !password) return erro(ERRADO, 401)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('auth_id, has_password').eq('username', utilizador.trim().toLowerCase()).maybeSingle()
    if (!perfil?.auth_id || !perfil.has_password) return erro(ERRADO, 401)
    const { data: conta } = await db.auth.admin.getUserById(perfil.auth_id)
    if (!conta.user?.email) return erro(ERRADO, 401)

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, chavePublica(), { auth: { persistSession: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: conta.user.email, password })
    if (error || !data.session) return erro(ERRADO, 401)
    return resposta({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  } catch (e) {
    console.error(e)
    return erro('Algo correu mal. Tenta outra vez.', 500)
  }
})
