import { Check, ClipboardPaste, Copy, Lock, Settings2, Timer, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type Partida } from '@/lib/data'
import { imagemMapa } from '@/lib/mapas'
import { capitao, equipa, ladoInicial, nomeJogador } from '@/lib/partida'
import { DESEMPENHO_MAX, emJogo } from '@/lib/pontos'
import { MINUTOS_BLOQUEIO, PADRAO_CODIGO, limparCodigo } from '@/lib/regras'
import { emFalta, relogio } from '@/lib/tempo'
import { CodigoInput } from '../ui/CodigoInput'
import { CaractereDecifrado } from '../ui/Decifrar'
import { NumeroRolante } from '../ui/NumeroRolante'
import { ColunaEquipa } from './comum'
import { l } from '@/lib/idioma'

/** As definições do grupo personalizado que têm de estar sempre assim (nomes como aparecem no Valorant). */
const DEFINICOES_LOBBY: { en: string; pt: string; ligado: boolean }[] = [
  { en: 'Allow Cheats', pt: 'Permitir batotas', ligado: false },
  { en: 'Tournament Mode', pt: 'Modo torneio', ligado: true },
  { en: 'Overtime: Win By Two', pt: 'Prolongamento: ganhar por duas rondas', ligado: true },
  { en: 'Play Out All Rounds', pt: 'Jogar todas as rondas', ligado: false },
  { en: 'Hide Match History', pt: 'Ocultar o histórico da partida', ligado: false },
  { en: 'Record Replay', pt: 'Gravar a repetição', ligado: true },
]

/** O que o grupo tem de ter no lobby, para quem o cria confirmar antes de começar. */
function DefinicoesLobby() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.025] p-4">
      <span className="flex items-center gap-2 text-[14px] font-bold"><Settings2 size={16} className="text-laranja" aria-hidden />{l('Definições do grupo: mete sempre assim', 'Party settings: always set them like this')}</span>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 p-0">
        {DEFINICOES_LOBBY.map((d) => (
          <li key={d.en} className="flex items-center justify-between gap-3 rounded-xl border border-white/7 bg-[rgba(9,9,11,0.45)] px-3 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[12.5px] font-semibold text-texto">{d.en}</span>
              <span className="text-[11.5px] text-mudo">{l(d.pt, d.en)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2.5">
              <span className={`font-mono text-[10.5px] font-bold tracking-[0.08em] ${d.ligado ? 'text-pessego-claro' : 'text-mudo'}`}>{d.ligado ? l('LIGADO', 'ON') : l('DESLIGADO', 'OFF')}</span>
              <span aria-hidden aria-checked={d.ligado} className="interruptor pointer-events-none"><span /></span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Alguém caiu ou não pode jogar: com 7 votos de 10 a partida é cancelada, sem pontos nem castigos. */
function CancelarPartida({ p }: { p: Partida }) {
  const acao = useAcao()
  const { atualizar } = usePartida()
  const [aVotar, setAVotar] = useState(false)
  const c = p.cancelamento
  if (!c || !c.aberto || p.automatica) return null
  const votar = async () => {
    setAVotar(true)
    await acao(() => dados.votarCancelar(p.id, !c.euVotei), c.euVotei ? l('Voto retirado.', 'Vote withdrawn.') : l('Votaste para cancelar a partida.', 'You voted to cancel the match.'))
    await atualizar()
    setAVotar(false)
  }
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
      <span className="grid size-11 place-items-center rounded-xl border border-derrota/30 bg-derrota/10 text-derrota"><UserX size={19} aria-hidden /></span>
      <span className="flex min-w-0 flex-1 basis-[200px] flex-col gap-0.5">
        <span className="text-[14px] font-bold">{l('Alguém caiu ou não pode jogar?', 'Did someone drop or can they not play?')}</span>
        <span className="text-[12.5px] text-mudo">
          {l(`Se ${c.necessarios} jogadores votarem, a partida é cancelada, sem pontos nem castigos, e ninguém fica preso.`, `If ${c.necessarios} players vote, the match is cancelled with no points and no penalties, and nobody is stuck.`)}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <span className="flex flex-col items-end gap-1" role="status" aria-live="polite">
          <span className="font-mono text-[15px] font-bold">{c.votos}/{c.necessarios}</span>
          <span className="block h-1.5 w-24 overflow-hidden rounded-full bg-white/8"><span className="block h-full rounded-full bg-derrota transition-[width] duration-300" style={{ width: `${Math.min(100, (c.votos / c.necessarios) * 100)}%` }} /></span>
        </span>
        <button type="button" onClick={votar} disabled={aVotar} aria-pressed={c.euVotei} className={`btn !min-h-10 ${c.euVotei ? 'btn-fantasma' : 'btn-suave'}`}>
          {c.euVotei ? l('Retirar o meu voto', 'Withdraw my vote') : l('Votar para cancelar', 'Vote to cancel')}
        </button>
      </span>
    </div>
  )
}

/** LOBBY_CREATION e IN_PROGRESS: um dos capitães (A ou B) partilha o código e começa o bloqueio de 15 minutos. */
export function Codigo({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const avisar = useAvisos()
  const { atualizar } = usePartida()
  const agora = useAgora(500)
  const [codigo, setCodigo] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => {
    if (!copiado) return
    const t = window.setTimeout(() => setCopiado(false), 1800)
    return () => window.clearTimeout(t)
  }, [copiado])
  const capA = capitao(p, 'A')
  const capB = capitao(p, 'B')
  // Qualquer um dos dois capitães partilha o código: o primeiro a guardar vale, para a partida não cair se um se esquecer.
  const souCapitao = (p.capitaoA === eu || p.capitaoB === eu) && !p.automatica
  const nomesCapitaes = [capA, capB].filter((c) => !!c).map((c) => nomeJogador(c!)).join(l(' ou ', ' or '))
  const emCurso = p.estado === 'IN_PROGRESS'
  const valido = PADRAO_CODIGO.test(codigo)
  const minha = p.jogadores.find((j) => j.perfilId === eu)
  const aposta = minha ? emJogo() : null

  const colar = async () => {
    try {
      setCodigo(limparCodigo(await navigator.clipboard.readText()))
    } catch {
      avisar(l('O browser não deixou ler a área de transferência. Escreve o código à mão.', 'The browser did not allow reading the clipboard. Type the code in.'), 'erro')
    }
  }
  const guardar = async () => {
    setAGuardar(true)
    await acao(() => dados.definirCodigo(p.id, codigo), l('Código partilhado com os 10 jogadores.', 'Code shared with all 10 players.'))
    await atualizar()
    setAGuardar(false)
  }
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(p.codigoGrupo ?? '')
      setCopiado(true)
    } catch {
      avisar(l('Não foi possível copiar. Seleciona o código à mão.', 'Could not copy. Select the code manually.'), 'erro')
    }
  }

  const bloqueio = emFalta(p.prazoFase, agora)
  const passos = [
    <>{l('No Valorant, abre', 'In Valorant, open')} <b className="text-texto">{l('Jogar', 'Play')}</b> {l('e depois', 'and then')} <b className="text-texto">{l('Personalizado', 'Custom')}</b>.</>,
    <>{l('Cria o grupo no mapa', 'Create the party on')} <b className="text-texto">{p.mapa}</b> {l('e copia o código de 6 caracteres.', 'and copy the 6-character code.')}</>,
    <>{l('Cola o código aqui. Os outros 9 jogadores veem-no logo.', 'Paste the code here. The other 9 players see it right away.')}</>,
  ]

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-labelledby="rg-cod-titulo" className="mapa relative flex min-h-[220px] items-end overflow-hidden rounded-[22px] border border-white/10" style={{ backgroundImage: `url(${imagemMapa(p.mapa)})` }}>
        <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.7) 45%, rgba(9,9,11,0.15) 100%)' }} />
        <div className="relative flex w-full flex-wrap items-end justify-between gap-4 px-7 py-[26px]">
          <div className="flex max-w-[560px] flex-col gap-2">
            <span className="font-mono text-[11px] font-bold tracking-[0.18em] text-pessego">{emCurso ? l('EM JOGO', 'IN GAME') : 'LOBBY'} · {p.mapa?.toUpperCase()}</span>
            {p.lado?.escolha && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-laranja/35 bg-[rgba(9,9,11,0.6)] px-2.5 py-1 font-mono text-[11.5px] font-semibold text-pessego-claro">
                {l(`Equipa A começa a ${ladoInicial(p, 'A') === 'ataque' ? 'atacar' : 'defender'}`, `Team A starts on ${ladoInicial(p, 'A') === 'ataque' ? 'attack' : 'defence'}`)}
                <span className="text-mudo">· {l(`escolha da Equipa ${p.lado.equipa}`, `picked by Team ${p.lado.equipa}`)}</span>
              </span>
            )}
            <h1 id="rg-cod-titulo" className="m-0 text-[clamp(30px,3.6vw,42px)] leading-[1.04] font-black tracking-[-0.04em]">
              {emCurso ? l('Boa partida. O resultado abre daqui a pouco.', 'Good game. The result opens shortly.') : souCapitao ? l('Cria o grupo e partilha o código', 'Create the party and share the code') : l('Um dos capitães está a criar o grupo', 'One of the captains is creating the party')}
            </h1>
            <span className="text-[14px] leading-normal text-[#d0cbc4]">
              {emCurso
                ? l(`Os capitães podem submeter o resultado ${MINUTOS_BLOQUEIO} minutos depois de o código ser partilhado.`, `The captains can submit the result ${MINUTOS_BLOQUEIO} minutes after the code is shared.`)
                : l('O código só aparece aos 10 jogadores desta partida. Entra com o Riot ID que tens ligado.', 'The code only shows to the 10 players in this match. Join with the Riot ID you linked.')}
            </span>
          </div>
          {aposta && (
            <div className="flex flex-col items-end gap-1 rounded-xl border border-white/12 bg-[rgba(9,9,11,0.6)] px-4 py-3">
              <span className="rotulo">{l('Em jogo para ti', 'At stake for you')}</span>
              <span className="font-mono text-[15px] font-semibold"><span className="text-vitoria">+{aposta.minimo} a +{aposta.maximo}</span> <span className="text-mudo">/</span> <span className="text-derrota">-{aposta.minimo} a -{aposta.maximo}</span></span>
              <span className="font-mono text-[11px] text-mudo" title={l('Depende das rondas do resultado (13-1 vale mais do que 13-11) e o Rangify Score da partida soma ou tira até 6 pontos.', 'It depends on the round score (13-1 is worth more than 13-11) and the match Rangify Score adds or takes up to 6 points.')}>{l(`pelas rondas e ± ${DESEMPENHO_MAX} pelo RS`, `by rounds and ± ${DESEMPENHO_MAX} from RS`)}</span>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <section aria-labelledby="rg-cod-caixa" className="painel flex min-w-0 flex-[2_1_520px] flex-col gap-5 p-[26px]">
          {p.codigoGrupo ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{l('CÓDIGO DO GRUPO', 'PARTY CODE')}</span>
                <h2 id="rg-cod-caixa" className="m-0 text-[22px] font-extrabold tracking-[-0.03em]">{l('Entra no grupo com este código', 'Join the party with this code')}</h2>
                <span className="text-[13px] text-[#a6a19a]">{l('Partilhado por um dos capitães', 'Shared by one of the captains')}{nomesCapitaes ? ` (${nomesCapitaes})` : ''}.</span>
              </div>
              {/* O código e o botão de copiar lado a lado, à mesma altura. */}
              <div className="flex flex-wrap items-center gap-3">
                <div role="img" aria-label={`${l('Código', 'Code')} ${p.codigoGrupo.split('').join(' ')}`} className="flex gap-2 sm:gap-2.5">
                  {p.codigoGrupo.split('').map((c, i) => (
                    <span key={i} className="salta grid h-20 w-12 place-items-center rounded-[14px] border border-laranja/32 bg-[rgba(9,9,11,0.6)] font-mono text-[34px] leading-none font-bold sm:w-14 sm:text-[38px]" style={{ boxShadow: 'inset 0 0 24px rgba(255,91,31,0.12)', animationDelay: `${i * 70}ms` }}><CaractereDecifrado c={c} atraso={i * 90} /></span>
                  ))}
                </div>
                <button type="button" onClick={copiar} aria-live="polite" className="btn btn-primario !h-20 min-w-[170px] !rounded-[14px] !px-6 !text-[15px] !font-extrabold">
                  <span key={copiado ? 'ok' : 'copiar'} className="salta inline-flex items-center gap-2">
                    {copiado ? <Check size={18} strokeWidth={3} aria-hidden /> : <Copy size={17} aria-hidden />}{copiado ? l('Copiado', 'Copied') : l('Copiar código', 'Copy code')}
                  </span>
                </button>
              </div>
              <p className="m-0 text-[13.5px] leading-[1.55] text-suave">{l('No Valorant:', 'In Valorant:')} <b className="text-texto">{l('Jogar', 'Play')}</b>, <b className="text-texto">{l('Personalizado', 'Custom')}</b>, <b className="text-texto">{l('Entrar com código', 'Join with code')}</b>. {l('Cola o código e espera pelo resto da sala.', 'Paste the code and wait for the rest of the lobby.')}</p>
              <DefinicoesLobby />
              {emCurso && (
                <div className="relative flex flex-wrap items-center gap-3.5 overflow-hidden rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/6"><span className="block h-full bg-laranja/70 transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(0, Math.min(100, (1 - bloqueio / (MINUTOS_BLOQUEIO * 60)) * 100))}%` }} /></span>
                  <span className="grid size-11 place-items-center rounded-xl border border-laranja/32 bg-laranja/12 text-laranja"><Lock size={19} aria-hidden /></span>
                  <span className="flex min-w-0 flex-1 basis-[160px] flex-col gap-0.5">
                    <span className="text-[14px] font-bold">{l('Resultado bloqueado', 'Result locked')}</span>
                    <span className="text-[12.5px] text-mudo">{l('Abre automaticamente quando o tempo acabar.', 'Opens automatically when the timer ends.')}</span>
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[26px] font-semibold"><Timer size={20} className="text-laranja" aria-hidden /><NumeroRolante valor={relogio(bloqueio)} contar={false} /></span>
                </div>
              )}
            </>
          ) : souCapitao ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{l('CRIAR O GRUPO', 'CREATE THE PARTY')}</span>
                <h2 id="rg-cod-caixa" className="m-0 text-[22px] font-extrabold tracking-[-0.03em]">{l('Três passos e está feito', 'Three steps and you are done')}</h2>
                <span className="text-[13px] text-[#a6a19a]">{l('Tu ou o outro capitão: o primeiro a guardar o código partilha-o com todos.', 'You or the other captain: whoever saves the code first shares it with everyone.')}</span>
              </div>
              <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5 p-0">
                {passos.map((t, i) => (
                  <li key={i} className="flex flex-col gap-2 rounded-[14px] border border-white/7 bg-white/[0.03] p-3.5">
                    <span className="font-mono text-[12px] font-extrabold text-laranja">0{i + 1}</span>
                    <span className="text-[13.5px] leading-normal text-suave">{t}</span>
                  </li>
                ))}
              </ol>
              <form className="flex flex-col gap-2.5" onSubmit={(e) => { e.preventDefault(); if (valido) guardar() }}>
                <label htmlFor="rg-codigo" className="text-[13px] font-semibold text-[#d0cbc4]">{l('Código do grupo', 'Party code')}</label>
                <div className="flex flex-wrap items-stretch gap-2.5">
                  <CodigoInput id="rg-codigo" valor={codigo} aoMudar={setCodigo} ajudaId="rg-codigo-ajuda" invalido={!!codigo && codigo.length === 6 && !valido} />
                  <button type="button" onClick={colar} className="btn btn-fantasma !h-[72px] !rounded-[14px]"><ClipboardPaste size={17} className="text-laranja" aria-hidden />{l('Colar', 'Paste')}</button>
                </div>
                <span id="rg-codigo-ajuda" role="status" className={`text-[13px] ${codigo && !valido ? 'text-derrota' : valido ? 'text-pessego' : 'text-mudo'}`}>
                  {!codigo ? l('Só letras e números, 6 caracteres.', 'Letters and numbers only, 6 characters.') : valido ? l('Código válido. Guarda para o partilhar.', 'Valid code. Save it to share it.') : l(`Faltam ${6 - codigo.length} caracteres.`, `${6 - codigo.length} characters to go.`)}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
                  <span className="max-w-[380px] text-[12.5px] text-mudo">{l('Nunca partilhes o código fora do hub.', 'Never share the code outside the hub.')}</span>
                  <button type="submit" disabled={!valido || aGuardar} className="btn btn-primario !h-[50px] !rounded-[13px] !px-6 !text-[15px] !font-extrabold">{l('Guardar e partilhar', 'Save and share')}</button>
                </div>
              </form>
              <DefinicoesLobby />
            </>
          ) : (
            <div className="flex flex-col items-start gap-3.5 py-2.5">
              <span className="eyebrow">{l('À ESPERA', 'WAITING')}</span>
              <h2 id="rg-cod-caixa" className="m-0 text-[22px] font-extrabold tracking-[-0.03em]">{l('Um dos capitães está a criar o grupo', 'One of the captains is creating the party')}</h2>
              <div className="flex gap-2.5" aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="ao-vivo h-20 w-16 rounded-[14px] border border-dashed border-white/16 bg-white/[0.02]" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[13px] text-[#a6a19a]">{l('Os dois capitães podem partilhar o código. Assim que um o guardar, aparece aqui com um botão para copiar.', 'Either captain can share the code. As soon as one saves it, it shows up here with a copy button.')}</span>
            </div>
          )}
          {minha && <CancelarPartida p={p} />}
        </section>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <ColunaEquipa eq="A" jogadores={equipa(p, 'A')} eu={eu} />
          <ColunaEquipa eq="B" jogadores={equipa(p, 'B')} eu={eu} />
        </div>
      </div>
    </div>
  )
}
