// Login com utilizador e palavra-passe, sem expor emails: o servidor troca o
// utilizador pelo email da conta e devolve só a sessão.
// É a rota sem sessão mais exposta (quem a chama ainda não entrou), por isso tem o limite mais apertado: por IP, para
// quem experimenta muitas contas, e por utilizador, para quem experimenta muitas palavras-passe numa só.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { admin, chavePublica, cors, erro, resposta, textoDoPedido } from '../_shared/comum.ts'
import { ipDe, limitar } from '../_shared/limite.ts'

const ERRADO = 'Utilizador ou palavra-passe errados.'
const DEMASIADOS = 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.'
const JANELA = 600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // O IP pode ser partilhado (um torneio presencial, uma escola): o limite por IP é largo; o que protege uma conta é o limite por utilizador.
    const ip = ipDe(req)
    if (ip && await limitar('entrar-ip', ip, 60, JANELA)) return erro(DEMASIADOS, 429)
    const corpo = await req.json().catch(() => null) as { utilizador?: unknown; password?: unknown } | null
    const nome = textoDoPedido(corpo?.utilizador, 64)?.toLowerCase()
    // A palavra-passe não se limpa nem se corta (é o que a pessoa escreveu); só tem de ser texto e não ser enorme.
    const password = typeof corpo?.password === 'string' && corpo.password.length <= 256 ? corpo.password : null
    if (!nome || !password) return erro(ERRADO, 401)
    const porNome = await limitar('entrar-nome', nome, 8, JANELA)
    if (porNome) return erro(DEMASIADOS, 429)
    const db = admin()
    const { data: perfil } = await db.from('profiles').select('auth_id, has_password').eq('username', nome).maybeSingle()
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
