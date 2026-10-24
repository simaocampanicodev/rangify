import { BookOpen, FlaskConical, Globe, KeyRound, RefreshCw, RotateCcw, Save, Settings, Sparkles, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EditarPerfil } from '@/components/EditarPerfil'
import { SeletorIdioma } from '@/components/Idioma'
import { reverTour } from '@/components/Tour'
import { Cabecalho, Carregando, Painel, RankBadge, Segmentado, TituloPainel } from '@/components/ui'
import { Interruptor } from '@/components/ui/Interruptor'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useSincronizarRank } from '@/hooks/useSincronizarRank'
import { dados, type Funcao, type FuncaoJogo, type Regiao } from '@/lib/data'
import { definirPreferenciaFundo, preferenciaFundo, type PreferenciaFundo } from '@/lib/fundo'
import { REGIOES } from '@/lib/regioes'
import { definirVolumeSom, ligarSom, somLigado, tocarPartidaEncontrada, volumeSom } from '@/lib/som'
import { l, nomeFuncaoJogo } from '@/lib/idioma'
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
  const [fundo, setFundo] = useState(preferenciaFundo)

  useEffect(() => {
    if (!perfil) return
    setRegiao(perfil.regiao)
    setFuncaoJogo(perfil.funcaoJogo ?? '')
  }, [perfil])

  if (!perfil) return <Carregando />

  const guardar = () => acao(async () => { await dados.atualizarPerfil({ regiao, funcaoJogo: funcaoJogo || null }); await recarregar() }, l('Definições guardadas.', 'Settings saved.'))
  const definirPassword = async () => {
    const ok = await acao(async () => { await dados.definirPassword(password); return true }, l('Palavra-passe guardada.', 'Password saved.'))
    if (ok) { setPassword(''); recarregar() }
  }

  return (
    <>
      <Cabecalho migalhas={[l('Conta', 'Account'), l('Definições', 'Settings')]} titulo={l('Definições', 'Settings')} descricao={l('A tua conta, a região onde jogas, a função preferida, a língua e o guia de boas-vindas.', 'Your account, the region you play in, your preferred role, the language and the welcome tour.')} />

      <div className="flex flex-wrap items-stretch gap-4">
        <Painel aria-labelledby="rg-def-jogo" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-[22px]">
          <TituloPainel eyebrow={l('JOGO', 'GAME')} titulo={l('Preferências', 'Preferences')} id="rg-def-jogo" />
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
            {l('Região da fila', 'Queue region')}
            <select className="campo" value={regiao} onChange={(e) => setRegiao(e.target.value as Regiao)}>
              {REGIOES.map((r) => <option key={r.valor} value={r.valor}>{r.nome}</option>)}
            </select>
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-semibold text-[#d0cbc4]">{l('Função preferida (aparece aos capitães no draft)', 'Preferred role (shown to captains in the draft)')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...FUNCOES_JOGO, ''].map((f) => (
                <button key={f || 'nenhuma'} type="button" aria-pressed={funcaoJogo === f} onClick={() => setFuncaoJogo(f as FuncaoJogo | '')} className={`h-9 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold ${funcaoJogo === f ? 'border-laranja/40 bg-laranja/14 text-pessego-claro' : 'border-white/8 bg-white/[0.03] text-suave hover:text-texto'}`}>
                  {f ? nomeFuncaoJogo(f) : l('Sem preferência', 'No preference')}
                </button>
              ))}
            </div>
          </fieldset>
          <div><button type="button" className="btn btn-primario" onClick={guardar}><Save size={16} aria-hidden />{l('Guardar', 'Save')}</button></div>
        </Painel>

        <Painel aria-labelledby="rg-def-conta" className="flex min-w-0 flex-[1_1_380px] flex-col gap-4 p-[22px]">
          <TituloPainel eyebrow={l('CONTA', 'ACCOUNT')} titulo={perfil.riotId ?? perfil.utilizador} id="rg-def-conta" />
          <div className="flex flex-col gap-2 text-[13.5px]">
            <div className="flex items-center justify-between gap-2"><span className="text-suave">{l('Utilizador do Discord', 'Discord username')}</span><span className="font-mono">{perfil.utilizador}</span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-suave">{l('Rank oficial', 'Official rank')}</span><RankBadge tier={perfil.tier} rr={perfil.rr} pequeno /></div>
            <div className="flex items-center justify-between gap-2"><span className="text-suave">{l('Sincronizado', 'Synced')}</span><span className="text-mudo">{haQuanto(perfil.rankAtualizadoEm)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <EditarPerfil pequeno />
            <button type="button" className="btn btn-fantasma" disabled={aSincronizar} onClick={sincronizar}><RefreshCw size={16} className="text-laranja" aria-hidden />{l('Sincronizar rank', 'Sync rank')}</button>
          </div>
          <form className="flex flex-col gap-2 border-t border-white/7 pt-4" onSubmit={(e) => { e.preventDefault(); definirPassword() }}>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#d0cbc4]">
              <span className="flex items-center gap-2"><KeyRound size={14} className="text-laranja" aria-hidden />{perfil.temPassword ? l('Mudar palavra-passe', 'Change password') : l('Definir palavra-passe', 'Set password')}</span>
              <input className="campo" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
              <span className="text-[12px] font-normal text-mudo">{l('Para entrares sem o Discord. Pelo menos 10 caracteres, sem o teu utilizador.', 'To sign in without Discord. At least 10 characters, without your username.')}</span>
            </label>
            <div><button type="submit" className="btn btn-fantasma" disabled={password.length < 10}>{l('Guardar palavra-passe', 'Save password')}</button></div>
          </form>
        </Painel>
      </div>

      <Painel aria-labelledby="rg-def-idioma" className="flex flex-wrap items-center justify-between gap-4 p-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><Globe size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-idioma" className="m-0 text-[16px] font-bold">{l('Língua', 'Language')}</h2>
            <span className="text-[13px] text-mudo">{l('A língua do site. Fica guardada neste browser.', 'The site language. It is saved in this browser.')}</span>
          </div>
        </div>
        <SeletorIdioma />
      </Painel>

      <Painel aria-labelledby="rg-def-guia" className="flex flex-wrap items-center justify-between gap-4 p-[22px]">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><BookOpen size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-guia" className="m-0 text-[16px] font-bold">{l('Guia de boas-vindas', 'Welcome tour')}</h2>
            <span className="text-[13px] text-mudo">{l('A volta pelas abas que aparece às contas novas.', 'The tour of the tabs shown to new accounts.')}</span>
          </div>
        </div>
        <button type="button" className="btn btn-suave" onClick={reverTour}><RotateCcw size={16} aria-hidden />{l('Ver o guia outra vez', 'Replay the tour')}</button>
      </Painel>

      <Painel aria-labelledby="rg-def-som" className="flex flex-col gap-5 p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><Volume2 size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-som" className="m-0 text-[16px] font-bold">{l('Som de partida encontrada', 'Match found sound')}</h2>
            <span className="text-[13px] text-mudo">{l('Um aviso curto quando a fila enche, para não perderes os 20 segundos.', 'A short alert when the queue fills, so you do not miss the 20 seconds.')}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-fantasma" onClick={() => tocarPartidaEncontrada()} disabled={!som}>{l('Testar som', 'Test sound')}</button>
          <Interruptor ligado={som} aria-labelledby="rg-def-som" aoMudar={(v) => { ligarSom(v); setSom(v) }} />
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

      <Painel aria-labelledby="rg-def-fundo" className="flex flex-wrap items-center justify-between gap-4 p-[22px]">
        <div className="flex min-w-0 flex-[1_1_320px] items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><Sparkles size={18} aria-hidden /></span>
          <div className="flex flex-col gap-0.5">
            <h2 id="rg-def-fundo" className="m-0 text-[16px] font-bold">{l('Efeitos do fundo', 'Background effects')}</h2>
            <span className="text-[13px] text-mudo">{l('O leve deixa o fundo parado, para o site ficar mais rápido.', 'Light keeps the background still, so the site runs faster.')}</span>
          </div>
        </div>
        <div className="ml-auto">
          <Segmentado<PreferenciaFundo>
            rotulo={l('Efeitos do fundo', 'Background effects')}
            valor={fundo}
            onChange={(v) => { setFundo(v); definirPreferenciaFundo(v) }}
            opcoes={[{ valor: 'auto', texto: l('Automático', 'Automatic') }, { valor: 'completo', texto: l('Completo', 'Full') }, { valor: 'leve', texto: l('Leve', 'Light') }]}
          />
        </div>
      </Painel>

      {dados.modo === 'demo' && (
        <Painel aria-labelledby="rg-def-demo" className="flex flex-col gap-4 border-dashed !border-laranja/40 p-[22px]">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[11px] border border-laranja/32 bg-laranja/12 text-laranja"><FlaskConical size={18} aria-hidden /></span>
            <div className="flex flex-col gap-0.5">
              <h2 id="rg-def-demo" className="m-0 text-[16px] font-bold">{l('Modo demo', 'Demo mode')}</h2>
              <span className="text-[13px] text-mudo">{l('Só existe sem Supabase. Serve para experimentar as permissões de cada função.', 'Only exists without Supabase. Lets you try out the permissions of each role.')}</span>
            </div>
          </div>
          <label className="flex flex-wrap items-center gap-3 text-[13.5px] text-suave">
            <Settings size={16} className="text-laranja" aria-hidden />
            {l('Função desta conta', 'Role of this account')}
            <select className="campo !h-10 !w-auto" value={perfil.funcao} onChange={(e) => acao(() => dados.devMudarFuncao!(e.target.value as Funcao), l('Função mudada.', 'Role changed.'))}>
              <option value="owner">Owner</option><option value="dev">Dev</option><option value="mod">Mod</option><option value="verified">{l('Verificado', 'Verified')}</option><option value="user">{l('Jogador', 'Player')}</option>
            </select>
            <span className="text-[12.5px] text-mudo">{l('As ferramentas de teste só aparecem a Owner e Dev.', 'The test tools only show for Owner and Dev.')}</span>
          </label>
          <div>
            <button type="button" className="btn btn-fantasma" onClick={() => { if (window.confirm(l('Apagar todos os dados do modo demo e voltar ao início?', 'Delete all demo data and start over?'))) acao(() => dados.reporDemo!()) }}>
              <RotateCcw size={16} className="text-laranja" aria-hidden />{l('Repor dados de demo', 'Reset demo data')}
            </button>
          </div>
        </Painel>
      )}
    </>
  )
}
