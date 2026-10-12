import { ArrowLeft, ArrowRight, Check, KeyRound, Shield } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LayoutSimples } from '@/components/Layout'
import { NomeRangify } from '@/components/Marca'
import { Avatar, BotaoAjuda, Carregando } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { dados, type Regiao } from '@/lib/dados'
import { REGIOES } from '@/lib/regioes'
import { PADRAO_RIOT_ID } from '@/lib/regras'


/** Primeiro acesso: palavra-passe (opcional) e Riot ID, como no protótipo. */
export function BemVindo() {
  const { carregando, sessao, perfil, recarregar } = useSessao()
  const acao = useAcao()
  const navegar = useNavigate()
  const [passo, setPasso] = useState<'password' | 'riot' | null>(null)
  const [password, setPassword] = useState('')
  const [riotId, setRiotId] = useState('')
  const [regiao, setRegiao] = useState<Regiao>('eu')
  const [aEnviar, setAEnviar] = useState(false)

  if (carregando) return <LayoutSimples><Carregando /></LayoutSimples>
  if (!sessao) return <Navigate to="/entrar" replace />
  if (!sessao.incompleta) return <Navigate to="/" replace />
  if (!perfil) return <LayoutSimples><Carregando /></LayoutSimples>

  const atual = passo ?? (perfil.temPassword ? 'riot' : 'password')
  const riotValido = PADRAO_RIOT_ID.test(riotId.trim())

  const definir = async () => {
    setAEnviar(true)
    const ok = await acao(async () => { await dados.definirPassword(password); return true }, 'Palavra-passe definida.')
    setAEnviar(false)
    if (ok) setPasso('riot')
  }
  const ligar = async () => {
    setAEnviar(true)
    const p = await acao(() => dados.ligarRiotId(riotId, regiao))
    setAEnviar(false)
    if (p) {
      await recarregar()
      navegar('/', { replace: true })
    }
  }

  return (
    <LayoutSimples>
        <section className="painel flex w-full max-w-[520px] flex-col gap-5 p-[clamp(22px,4vw,32px)]">
          <div className="flex items-center gap-2" aria-label={`Passo ${atual === 'password' ? 1 : 2} de 2`}>
            {['password', 'riot'].map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full ${i <= (atual === 'password' ? 0 : 1) ? 'bg-laranja' : 'bg-white/10'}`} />
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/7 bg-white/[0.03] p-3">
            <Avatar nome={perfil.utilizador} url={perfil.avatarUrl} destaque />
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold">{perfil.utilizador}</span>
              <span className="flex items-center gap-1.5 text-[12px] text-pessego"><Check size={13} aria-hidden />Conta Discord ligada</span>
            </span>
          </div>

          {atual === 'password' ? (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); definir() }}>
              <div className="flex flex-col gap-2">
                <span className="eyebrow flex items-center gap-2"><KeyRound size={13} aria-hidden />PASSO 1 DE 2</span>
                <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.04em]">Define uma palavra-passe</h1>
                <p className="m-0 text-[14px] leading-normal text-suave">Com uma palavra-passe podes entrar sem o Discord. Também podes fazer isto mais tarde, nas Definições.</p>
              </div>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
                Utilizador
                <input className="campo opacity-70" value={perfil.utilizador} readOnly autoComplete="username" />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
                Nova palavra-passe
                <input className="campo" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} />
                <span className="text-[12px] font-normal text-mudo">Pelo menos 10 caracteres. Não pode conter o teu utilizador.</span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn btn-fantasma" onClick={() => setPasso('riot')}>Mais tarde</button>
                <button type="submit" className="btn btn-primario" disabled={password.length < 10 || aEnviar}>Definir palavra-passe</button>
              </div>
            </form>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (riotValido) ligar() }}>
              <div className="flex flex-col gap-2">
                <span className="eyebrow flex items-center gap-2"><Shield size={13} aria-hidden />PASSO 2 DE 2</span>
                <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.04em]">Liga o teu Riot ID</h1>
                <p className="m-0 text-[14px] leading-normal text-suave">
                  O teu rank oficial só serve para medir a dificuldade de cada partida. No ranking do <NomeRangify className="text-laranja-claro" /> toda a gente começa com 1000 pontos.
                </p>
              </div>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
                Riot ID
                <input className="campo font-mono" value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="Nome#TAG" autoComplete="off" spellCheck={false} />
                <span className={`text-[12px] font-normal ${riotId && !riotValido ? 'text-derrota' : 'text-mudo'}`}>
                  {riotId && !riotValido ? 'Usa o formato Nome#TAG, por exemplo Nyx#4521.' : 'O mesmo nome com que jogas. Vamos ler o rank oficial através da Henrik Dev API.'}
                </span>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
                Região
                <select className="campo" value={regiao} onChange={(e) => setRegiao(e.target.value as Regiao)}>
                  {REGIOES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  {!perfil.temPassword && (
                    <button type="button" className="btn btn-fantasma" onClick={() => setPasso('password')}><ArrowLeft size={16} aria-hidden />Voltar</button>
                  )}
                  <BotaoAjuda topico="rank">Para que serve</BotaoAjuda>
                </div>
                <button type="submit" className="btn btn-primario" disabled={!riotValido || aEnviar}>Concluir e entrar<ArrowRight size={16} aria-hidden /></button>
              </div>
            </form>
          )}
        </section>
    </LayoutSimples>
  )
}
