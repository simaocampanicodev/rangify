import { ArrowRight, Crown, FlaskConical, Map as IconeMapa, Scale } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { SeletorIdioma } from '@/components/layout/Idioma'
import { LayoutSimples } from '@/components/layout/Layout'
import { Marca, NomeRangify } from '@/components/ui/Marca'
import { Carregando } from '@/components/ui'
import { IconeDiscord } from '@/components/ui/IconesMarca'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { dados } from '@/lib/data'
import { l } from '@/lib/idioma'
import { LIMITES } from '@/lib/entradas'

export function Entrar() {
  const { carregando, sessao } = useSessao()
  const acao = useAcao()
  const navegar = useNavigate()
  const local = useLocation()
  const [utilizador, setUtilizador] = useState('')
  const [password, setPassword] = useState('')
  const [aEntrar, setAEntrar] = useState(false)
  const destino = (local.state as { de?: string } | null)?.de ?? '/'

  if (carregando) return <LayoutSimples><Carregando /></LayoutSimples>
  if (sessao) return <Navigate to={sessao.incompleta ? '/bem-vindo' : destino} replace />

  const correr = async (f: () => Promise<void>) => {
    setAEntrar(true)
    const ok = await acao(async () => { await f(); return true })
    setAEntrar(false)
    if (ok) navegar(destino, { replace: true })
  }

  return (
    <LayoutSimples>
      <div className="flex w-full max-w-[1040px] flex-wrap items-center justify-center gap-10">
        <div className="flex max-w-[440px] min-w-0 flex-[1_1_360px] flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><Marca /><SeletorIdioma /></div>
          <h1 className="m-0 text-[clamp(36px,5vw,54px)] leading-[0.98] font-extrabold tracking-[-0.05em]">
            {l('O teu 5v5 de Valorant,', 'Your Valorant 5v5,')} <span className="font-serif font-normal text-laranja italic">{l('a sério.', 'for real.')}</span>
          </h1>
          <p className="m-0 text-[15.5px] leading-[1.6] text-suave">
            {l('Fila por região, draft de capitães, ban de mapas e uma tabela própria em que toda a gente começa com 1000 pontos. Os pontos dependem de ganhares e do teu desempenho, não do rank.', 'Regional queue, captains\' draft, map bans and our own leaderboard where everyone starts at 1000 points. Points depend on winning and on how you play, not on rank.')}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {[
              [<Crown size={17} key="c" />, l('Capitães escolhem as equipas à vez', 'Captains pick the teams in turns')],
              [<IconeMapa size={17} key="m" />, l('Bans de mapas até sobrar o decisivo', 'Map bans until the decider is left')],
              [<Scale size={17} key="s" />, l('Pontos pelo teu desempenho em cada partida', 'Points for how you perform in each match')],
            ].map(([icone, texto]) => (
              <li key={texto as string} className="flex items-center gap-3 text-[14px] text-marfim">
                <span className="grid size-9 place-items-center rounded-[10px] border border-laranja/32 bg-laranja/12 text-laranja">{icone}</span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <section aria-labelledby="rg-entrar" className="painel flex w-full max-w-[440px] min-w-0 flex-[1_1_360px] flex-col gap-5 p-[clamp(22px,4vw,32px)]">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">{l('CONTA', 'ACCOUNT')}</span>
            <h2 id="rg-entrar" className="m-0 text-[28px] font-extrabold tracking-[-0.04em]">{l('Entra para jogar', 'Sign in to play')}</h2>
            <p className="m-0 text-[14px] leading-normal text-suave">{l('Cria o teu perfil com a conta Discord. Se já definiste uma palavra-passe, também podes entrar com ela.', 'Create your profile with your Discord account. If you have set a password, you can also sign in with it.')}</p>
          </div>

          <button type="button" disabled={aEntrar} onClick={() => correr(() => dados.entrarComDiscord())} className="btn btn-primario !h-[52px] !text-[15px]">
            <IconeDiscord />{l('Continuar com o Discord', 'Continue with Discord')}
          </button>

          <div className="flex items-center gap-3 text-[12px] text-mudo" aria-hidden>
            <span className="h-px flex-1 bg-white/8" />{l('ou com palavra-passe', 'or with a password')}<span className="h-px flex-1 bg-white/8" />
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); correr(() => dados.entrarComPassword(utilizador, password)) }}>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              {l('Utilizador', 'Username')}
              <input maxLength={LIMITES.utilizador} className="campo" value={utilizador} onChange={(e) => setUtilizador(e.target.value)} autoComplete="username" required />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              {l('Palavra-passe', 'Password')}
              <input maxLength={LIMITES.password} className="campo" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" disabled={aEntrar} className="btn btn-fantasma">{l('Entrar', 'Sign in')}<ArrowRight size={16} aria-hidden /></button>
          </form>

          {dados.entrarDemo && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-laranja/40 bg-laranja/6 p-4">
              <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.14em] text-laranja"><FlaskConical size={14} aria-hidden />{l('MODO DEMO', 'DEMO MODE')}</span>
              <p className="m-0 text-[13px] leading-normal text-suave">
                {l('Sem Supabase configurado, o', 'Without Supabase configured,')} <NomeRangify className="text-laranja-claro" /> {l('corre no teu browser com 64 jogadores de exemplo. O Discord cria uma conta nova (com o guia de boas-vindas); a conta de exemplo já tem histórico e é Owner.', 'runs in your browser with 64 sample players. Discord creates a new account (with the welcome tour); the sample account already has history and is an Owner.')}
              </p>
              <button type="button" disabled={aEntrar} onClick={() => correr(() => dados.entrarDemo!())} className="btn btn-suave">{l('Entrar como Nyx#4521', 'Sign in as Nyx#4521')}</button>
              <span className="text-[12px] text-mudo">{l('Ou com o utilizador', 'Or with the username')} <b className="font-mono text-marfim">nyx</b> {l('e a palavra-passe', 'and the password')} <b className="font-mono text-marfim">nyx4521</b>.</span>
            </div>
          )}
        </section>
      </div>
    </LayoutSimples>
  )
}
