import { ClipboardPaste, Copy, Lock, Timer } from 'lucide-react'
import { useState } from 'react'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type Partida } from '@/lib/dados'
import { imagemMapa } from '@/lib/mapas'
import { capitao, equipa, nomeJogador } from '@/lib/partida'
import { emJogo, comSinal } from '@/lib/pontos'
import { MINUTOS_BLOQUEIO, PADRAO_CODIGO, limparCodigo } from '@/lib/regras'
import { emFalta, relogio } from '@/lib/tempo'
import { ColunaEquipa } from './comum'
import { l } from '@/lib/idioma'

/** LOBBY_CREATION e IN_PROGRESS: o Capitão A partilha o código e começa o bloqueio de 15 minutos. */
export function Codigo({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const avisar = useAvisos()
  const { atualizar } = usePartida()
  const agora = useAgora(500)
  const [codigo, setCodigo] = useState('')
  const [aGuardar, setAGuardar] = useState(false)
  const capA = capitao(p, 'A')
  const souHost = p.capitaoA === eu && !p.automatica
  const emCurso = p.estado === 'IN_PROGRESS'
  const valido = PADRAO_CODIGO.test(codigo)
  const minha = p.jogadores.find((j) => j.perfilId === eu)
  const adversarios = p.jogadores.filter((j) => j.equipa && j.equipa !== minha?.equipa).map((j) => j.tier)
  const aposta = minha ? emJogo(minha.tier, adversarios) : null

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
      avisar(l('Código copiado.', 'Code copied.'))
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
            <h1 id="rg-cod-titulo" className="m-0 text-[clamp(30px,3.6vw,42px)] leading-[1.04] font-black tracking-[-0.04em]">
              {emCurso ? l('Boa partida. O resultado abre daqui a pouco.', 'Good game. The result opens shortly.') : souHost ? l('Cria o grupo e partilha o código', 'Create the party and share the code') : l(`${capA ? nomeJogador(capA) : 'O Capitão A'} está a criar o grupo`, `${capA ? nomeJogador(capA) : 'Captain A'} is creating the party`)}
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
              <span className="font-mono text-[15px] font-semibold"><span className="text-vitoria">{comSinal(aposta.vitoria)}</span> <span className="text-mudo">/</span> <span className="text-derrota">{comSinal(aposta.derrota)}</span></span>
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
                <span className="text-[13px] text-[#a6a19a]">{l('Partilhado por', 'Shared by')} {capA ? nomeJogador(capA) : l('o Capitão A', 'Captain A')} ({l('Capitão A', 'Captain A')}).</span>
              </div>
              <div role="img" aria-label={`${l('Código', 'Code')} ${p.codigoGrupo.split('').join(' ')}`} className="flex flex-wrap gap-2.5">
                {p.codigoGrupo.split('').map((c, i) => (
                  <span key={i} className="grid h-20 w-16 place-items-center rounded-[14px] border border-laranja/32 bg-[rgba(9,9,11,0.6)] font-mono text-[38px] font-bold" style={{ boxShadow: 'inset 0 0 24px rgba(255,91,31,0.12)' }}>{c}</span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" onClick={copiar} className="btn btn-primario !h-[52px] !rounded-[13px] !px-6 !text-[15px] !font-extrabold"><Copy size={17} aria-hidden />{l('Copiar código', 'Copy code')}</button>
              </div>
              <p className="m-0 text-[13.5px] leading-[1.55] text-suave">{l('No Valorant:', 'In Valorant:')} <b className="text-texto">{l('Jogar', 'Play')}</b>, <b className="text-texto">{l('Personalizado', 'Custom')}</b>, <b className="text-texto">{l('Entrar com código', 'Join with code')}</b>. {l('Cola o código e espera pelo resto da sala.', 'Paste the code and wait for the rest of the lobby.')}</p>
              {emCurso && (
                <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-white/8 bg-white/[0.03] p-4">
                  <span className="grid size-11 place-items-center rounded-xl border border-laranja/32 bg-laranja/12 text-laranja"><Lock size={19} aria-hidden /></span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-bold">{l('Resultado bloqueado', 'Result locked')}</span>
                    <span className="text-[12.5px] text-mudo">{l('Abre automaticamente quando o tempo acabar.', 'Opens automatically when the timer ends.')}</span>
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[26px] font-semibold"><Timer size={20} className="text-laranja" aria-hidden />{relogio(bloqueio)}</span>
                </div>
              )}
            </>
          ) : souHost ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="eyebrow">{l('CRIAR O GRUPO', 'CREATE THE PARTY')}</span>
                <h2 id="rg-cod-caixa" className="m-0 text-[22px] font-extrabold tracking-[-0.03em]">{l('Três passos e está feito', 'Three steps and you are done')}</h2>
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
                  <input
                    id="rg-codigo"
                    value={codigo}
                    onChange={(e) => setCodigo(limparCodigo(e.target.value))}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={6}
                    placeholder="ABC123"
                    aria-describedby="rg-codigo-ajuda"
                    className="h-[72px] min-w-0 flex-[1_1_260px] rounded-[14px] border border-white/12 bg-[rgba(9,9,11,0.6)] px-[22px] font-mono text-[34px] font-bold tracking-[0.3em] text-texto uppercase placeholder:text-white/15 focus:border-laranja/75 focus:outline-none"
                  />
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
            </>
          ) : (
            <div className="flex flex-col items-start gap-3.5 py-2.5">
              <span className="eyebrow">{l('À ESPERA', 'WAITING')}</span>
              <h2 id="rg-cod-caixa" className="m-0 text-[22px] font-extrabold tracking-[-0.03em]">{l('O Capitão A está a criar o grupo', 'Captain A is creating the party')}</h2>
              <div className="flex gap-2.5" aria-hidden>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className="ao-vivo h-20 w-16 rounded-[14px] border border-dashed border-white/16 bg-white/[0.02]" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-[13px] text-[#a6a19a]">{l('Assim que o código for guardado, aparece aqui com um botão para copiar.', 'As soon as the code is saved, it shows up here with a copy button.')}</span>
            </div>
          )}
        </section>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <ColunaEquipa eq="A" jogadores={equipa(p, 'A')} eu={eu} />
          <ColunaEquipa eq="B" jogadores={equipa(p, 'B')} eu={eu} />
        </div>
      </div>
    </div>
  )
}
