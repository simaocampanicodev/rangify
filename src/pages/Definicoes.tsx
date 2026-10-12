import { BookOpen, FlaskConical, KeyRound, RefreshCw, RotateCcw, Save, Settings, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EditarPerfil } from '@/components/EditarPerfil'
import { reverTour } from '@/components/Tour'
import { Cabecalho, Carregando, Painel, RankBadge, TituloPainel } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados, type Funcao, type FuncaoJogo, type Regiao } from '@/lib/dados'
import { REGIOES } from '@/lib/regioes'
import { definirVolumeSom, ligarSom, somLigado, tocarPartidaEncontrada, volumeSom } from '@/lib/som'
import { haQuanto } from '@/lib/tempo'

const FUNCOES_JOGO: FuncaoJogo[] = ['Duelista', 'Controlador', 'Iniciador', 'Sentinela']

export function Definicoes() {
  const { perfil, recarregar } = useSessao()
  const acao = useAcao()
  const { sincronizar, aSincronizar } = useSincronizarRank()
  const [regiao, setRegiao] = useState<Regiao>('eu')
  const [funcaoJogo, setFuncaoJogo] = useState<FuncaoJogo | ''>('')
  const [password, setPassword] = useState('')
  const [som, setSom] = useState(somLigado)
  const [volume, setVolume] = useState(volumeSom)

  useEffect(() => {
    if (!perfil) return
    setRegiao(perfil.regiao)
    setFuncaoJogo(perfil.funcaoJogo ?? '')
  }, [perfil])

  if (!perfil) return <Carregando />

  const guardar = () => acao(async () => { await dados.atualizarPerfil({ regiao, funcaoJogo: funcaoJogo || null }); await recarregar() }, 'Definições guardadas.')
  const definirPassword = async () => {
    const ok = await acao(async () => { await dados.definirPassword(password); return true }, 'Palavra-passe guardada.')
    if (ok) { setPassword(''); recarregar() }
  }

  return (
    <>
      <Cabecalho migalhas={['Conta', 'Definições']} titulo="Definições" descricao="A tua conta, a região onde jogas, a função preferida e o guia de boas-vindas." />

      <div className="flex flex-wrap items-stretch gap-4">
        <Painel aria-labelledby="rg-def-jogo" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-[22px]">
          <TituloPainel eyebrow="JOGO" titulo="Preferências" id="rg-def-jogo" />
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            Região da fila
            <select className="campo" value={regiao} onChange={(e) => setRegiao(e.target.value as Regiao)}>
              {REGIOES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
            </select>
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-semibold text-[#d0cbc4]">Função preferida (aparece aos capitães no draft)</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...FUNCOES_JOGO, ''].map((f) => (
                <button key={f || 'nenhuma'} type="button" aria-pressed={funcaoJogo === f} onClick={() => setFuncaoJogo(f as FuncaoJogo | '')} className={`h-9 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold ${funcaoJogo === f ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}>
                  {f || 'Sem preferência'}
                </button>
              ))}
            </div>
          </fieldset>
          <div><button type="button" className="btn btn-primario" onClick={guardar}><Save size={16} aria-hidden />Guardar</button></div>
        </Painel>

        <Painel aria-labelledby="rg-def-conta" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-[22px]">
          <TituloPainel eyebrow="CONTA" titulo={perfil.riotId ?? perfil.utilizador} id="rg-def-conta" />
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between gap-2"><span className="text-suave">Utilizador do Discord</span><span className="font-mono">{perfil.utilizador}</span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-suave">Rank oficial</span><RankBadge tier={perfil.tier} rr={perfil.rr} pequeno /></div>
            <div className="flex items-center justify-between gap-2"><span className="text-suave">Sincronizado</span><span className="text-mudo">{haQuanto(perfil.rankAtualizadoEm)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditarPerfil pequeno />
            <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={16} className="text-laranja" aria-hidden />Sincronizar rank</button>
          </div>
          <form className="flex flex-col gap-2 border-t border-white/7 pt-4" onSubmit={(e) => { e.preventDefault(); definirPassword() }}>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              <span className="flex items-center gap-2"><KeyRound size={14} className="text-laranja" aria-hidden />{perfil.temPassword ? 'Mudar palavra-passe' : 'Definir palavra-passe'}</span>
              <input className="campo" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
              <span className="text-[12px] font-normal text-mudo">Para entrares sem o Discord. Pelo menos 10 caracteres, sem o teu utilizador.</span>
            </label>
            <div><button type="submit" className="btn btn-fantasma" disabled={password.length < 10}>Guardar palavra-passe</button></div>
          </form>
        </Painel>
      </div>

      <Painel aria-labelledby="rg-def-guia" className="flex flex-wrap items-center justify-between gap-4 p-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><BookOpen size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-guia" className="m-0 text-[16px] font-bold">Guia de boas-vindas</h2>
            <span className="text-[13px] text-mudo">A volta pelas abas que aparece às contas novas.</span>
          </div>
        </div>
        <button type="button" className="btn btn-suave" onClick={reverTour}><RotateCcw size={16} aria-hidden />Ver o guia outra vez</button>
      </Painel>

      <Painel aria-labelledby="rg-def-som" className="flex flex-col gap-5 p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><Volume2 size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-som" className="m-0 text-[16px] font-bold">Som de partida encontrada</h2>
            <span className="text-[13px] text-mudo">Um aviso curto quando a fila enche, para não perderes os 20 segundos.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-fantasma" onClick={() => tocarPartidaEncontrada()} disabled={!som}>Testar som</button>
          <button
            type="button"
            role="switch"
            aria-checked={som}
            aria-labelledby="rg-def-som"
            onClick={() => { ligarSom(!som); setSom(!som) }}
            className={`relative h-7 w-12 cursor-pointer rounded-full border transition-colors ${som ? 'border-laranja/60 bg-laranja/40' : 'border-white/12 bg-white/6'}`}
          >
            <span className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition-all ${som ? 'left-[24px] bg-laranja' : 'left-[3px] bg-mudo'}`} />
          </button>
        </div>
        </div>
        <div className={`flex items-center gap-4 border-t border-white/7 pt-4 ${som ? '' : 'opacity-45'}`}>
          <label htmlFor="rg-volume" className="shrink-0 text-[13.5px] font-semibold text-suave">Volume</label>
          {/* Ao largar a barra toca o aviso, para ouvires logo como fica. */}
          <input
            id="rg-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume}
            disabled={!som}
            aria-valuetext={`${volume}%`}
            className="volume min-w-0 flex-1"
            style={{ '--v': `${volume}%` } as React.CSSProperties}
            onChange={(e) => { const v = Number(e.target.value); setVolume(v); definirVolumeSom(v) }}
            onPointerUp={() => tocarPartidaEncontrada()}
            onKeyUp={(e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') tocarPartidaEncontrada() }}
          />
          <span className="w-11 shrink-0 text-right font-mono text-[13px] font-semibold text-pessego">{volume}%</span>
        </div>
      </Painel>

      {dados.modo === 'demo' && (
        <Painel aria-labelledby="rg-def-demo" className="flex flex-col gap-4 border-dashed !border-laranja/40 p-[22px]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><FlaskConical size={18} aria-hidden /></span>
            <div className="flex flex-col gap-0.5">
              <h2 id="rg-def-demo" className="m-0 text-[16px] font-bold">Modo demo</h2>
              <span className="text-[13px] text-mudo">Só existe sem Supabase. Serve para experimentar as permissões de cada função.</span>
            </div>
          </div>
          <label className="flex flex-wrap items-center gap-3 text-[13.5px] text-suave">
            <Settings size={16} className="text-laranja" aria-hidden />
            Função desta conta
            <select className="campo !h-10 !w-auto" value={perfil.funcao} onChange={(e) => acao(() => dados.devMudarFuncao!(e.target.value as Funcao), 'Função mudada.')}>
              <option value="owner">Owner</option><option value="dev">Dev</option><option value="mod">Mod</option><option value="verified">Verificado</option><option value="user">Jogador</option>
            </select>
            <span className="text-[12.5px] text-mudo">As ferramentas de teste só aparecem a Owner e Dev.</span>
          </label>
          <div>
            <button type="button" className="btn btn-fantasma" onClick={() => { if (window.confirm('Apagar todos os dados do modo demo e voltar ao início?')) acao(() => dados.reporDemo!()) }}>
              <RotateCcw size={16} className="text-laranja" aria-hidden />Repor dados de demo
            </button>
          </div>
        </Painel>
      )}
    </>
  )
}
