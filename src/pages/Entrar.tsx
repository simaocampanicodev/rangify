import { ArrowRight, Crown, FlaskConical, Map as IconeMapa, Scale } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LayoutSimples } from '@/components/Layout'
import { Marca, NomeRangify } from '@/components/Marca'
import { Carregando } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { dados } from '@/lib/dados'

export function IconeDiscord({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.6 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.8 19.8 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.8ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
    </svg>
  )
}

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
          <Marca />
          <h1 className="m-0 text-[clamp(36px,5vw,54px)] leading-[0.98] font-extrabold tracking-[-0.05em]">
            O teu 5v5 de Valorant, <span className="font-serif font-normal text-laranja italic">a sério.</span>
          </h1>
          <p className="m-0 text-[15.5px] leading-[1.6] text-suave">
            Fila por região, draft de capitães, ban de mapas e um ranking próprio em que toda a gente começa com 1000 pontos. O teu rank oficial só decide quanto vale cada vitória.
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {[
              [<Crown size={17} key="c" />, 'Capitães escolhem as equipas à vez'],
              [<IconeMapa size={17} key="m" />, 'Bans de mapas até sobrar o decisivo'],
              [<Scale size={17} key="s" />, 'Pontos ajustados ao rank da equipa adversária'],
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
            <span className="eyebrow">CONTA</span>
            <h2 id="rg-entrar" className="m-0 text-[28px] font-extrabold tracking-[-0.04em]">Entra para jogar</h2>
            <p className="m-0 text-[14px] leading-normal text-suave">Cria o teu perfil com a conta Discord. Se já definiste uma palavra-passe, também podes entrar com ela.</p>
          </div>

          <button type="button" disabled={aEntrar} onClick={() => correr(() => dados.entrarComDiscord())} className="btn btn-primario !h-[52px] !text-[15px]">
            <IconeDiscord />Continuar com o Discord
          </button>

          <div className="flex items-center gap-3 text-[12px] text-mudo" aria-hidden>
            <span className="h-px flex-1 bg-white/8" />ou com palavra-passe<span className="h-px flex-1 bg-white/8" />
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); correr(() => dados.entrarComPassword(utilizador, password)) }}>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              Utilizador
              <input className="campo" value={utilizador} onChange={(e) => setUtilizador(e.target.value)} autoComplete="username" required />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              Palavra-passe
              <input className="campo" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" disabled={aEntrar} className="btn btn-fantasma">Entrar<ArrowRight size={16} aria-hidden /></button>
          </form>

          {dados.modo === 'demo' && dados.entrarDemo && (
            <div className="flex flex-col gap-3 rounded-[14px] border border-dashed border-laranja/40 bg-laranja/6 p-4">
              <span className="flex items-center gap-2 font-mono text-[11px] font-bold tracking-[0.14em] text-laranja"><FlaskConical size={14} aria-hidden />MODO DEMO</span>
              <p className="m-0 text-[13px] leading-normal text-suave">
                Sem Supabase configurado, o <NomeRangify className="text-laranja-claro" /> corre no teu browser com 64 jogadores de exemplo. O Discord cria uma conta nova (com o guia de boas-vindas); a conta de exemplo já tem histórico e é Owner.
              </p>
              <button type="button" disabled={aEntrar} onClick={() => correr(() => dados.entrarDemo!())} className="btn btn-suave">Entrar como Nyx#4521</button>
              <span className="text-[12px] text-mudo">Ou com o utilizador <b className="font-mono text-marfim">nyx</b> e a palavra-passe <b className="font-mono text-marfim">nyx4521</b>.</span>
            </div>
          )}
        </section>
      </div>
    </LayoutSimples>
  )
}
