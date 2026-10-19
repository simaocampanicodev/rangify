/** Um jogo do torneio: a linha da lista, o resultado e o painel onde os capitães abrem o grupo. */
import { Check, Copy, Crown, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Chip, Painel, TituloPainel } from '@/components/ui'
import { useAcao, useAvisos } from '@/contexts/Avisos'
import { useAgora } from '@/hooks/useAgora'
import { dados, type TorneioDetalhe, type TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { ChipJogo, comoTexto, dataHoraCurta, nomeGrupo, nomeMelhorDe, origemTexto, Papel, rotuloJogo } from './comum'
import { SerieMapas } from './Serie'
import { VetoJogo } from './Veto'

/** O nome de uma equipa, ou de onde vem enquanto não se sabe. */
export function NomeEquipa({ j, lado, forte = false }: { j: TorneioJogo; lado: 'A' | 'B'; forte?: boolean }) {
  const e = lado === 'A' ? j.equipaA : j.equipaB
  const origem = lado === 'A' ? j.origemA : j.origemB
  if (e) return <span className={`min-w-0 truncate ${forte ? 'font-extrabold' : 'font-bold'}`}>{e.nome}</span>
  if (j.como === 'bye') return <span className="min-w-0 truncate text-mudo italic">{l('Folga', 'Bye')}</span>
  return <span className="min-w-0 truncate text-mudo">{origemTexto(origem)}</span>
}

/** O resultado: o vencedor a verde. */
export function Placar({ j }: { j: TorneioJogo }) {
  // Numa série mostram-se os mapas ganhos (desde que haja um); à melhor de 1, as rondas.
  const serie = j.melhorDe > 1
  const a0 = serie ? j.serieA : j.scoreA
  const b0 = serie ? j.serieB : j.scoreB
  if (serie ? j.estado !== 'concluido' && j.serieA + j.serieB === 0 : j.estado !== 'concluido' || a0 == null || b0 == null) return <span className="font-mono text-mudo">vs</span>
  const a = j.vencedorId === j.equipaA?.id
  const acabou = j.estado === 'concluido'
  return (
    <span className="font-mono text-[14px] font-semibold tabular-nums">
      <span className={acabou && a ? 'text-vitoria' : 'text-suave'}>{a0}</span>
      <span className="px-1 text-mudo">-</span>
      <span className={acabou && !a ? 'text-vitoria' : 'text-suave'}>{b0}</span>
    </span>
  )
}

/** Uma linha de jogo para as listas (grupos e calendário). */
export function JogoLinha({ j, meuId, aoAbrir, mostrarFase = false }: { j: TorneioJogo; meuId?: string | null; aoAbrir: (j: TorneioJogo) => void; mostrarFase?: boolean }) {
  const meu = !!meuId && (j.equipaA?.id === meuId || j.equipaB?.id === meuId)
  return (
    <li>
      <button
        type="button"
        onClick={() => aoAbrir(j)}
        className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-xl border bg-transparent px-3 py-2.5 text-left text-texto transition-colors hover:border-laranja/40 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(150px,auto)] ${meu ? 'border-laranja/40 bg-laranja/[0.05]' : 'border-white/8'}`}
      >
        <span className="flex min-w-0 justify-end text-right text-[13.5px]"><NomeEquipa j={j} lado="A" /></span>
        <Placar j={j} />
        <span className="flex min-w-0 text-[13.5px]"><NomeEquipa j={j} lado="B" /></span>
        <span className="col-span-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-mudo sm:col-span-1 sm:justify-end">
          {mostrarFase && <span>{j.fase === 'grupo' ? `${nomeGrupo(j.grupo)} · ` : ''}{rotuloJogo(j)}</span>}
          {nomeMelhorDe(j.melhorDe) && <span className="text-pessego-claro">{nomeMelhorDe(j.melhorDe)}</span>}
          {j.estado === 'concluido' ? <ChipJogo j={j} /> : j.agendadoPara ? <span className={j.estado === 'a_decorrer' ? 'text-pessego' : ''}>{dataHoraCurta(j.agendadoPara)}{j.mapa ? ` · ${j.mapa}` : ''}</span> : <span>{l('Por marcar', 'To schedule')}</span>}
          {(j.estado === 'a_decorrer' || j.estado === 'veto') && <ChipJogo j={j} />}
        </span>
      </button>
    </li>
  )
}

/** As estatísticas de cada jogador, por equipa, lidas da partida da API. */
export function EstatisticasJogo({ j }: { j: TorneioJogo }) {
  if (!j.jogadores.length) return null
  // Numa série há estatísticas de cada mapa que já se jogou.
  const ordens = [...new Set(j.jogadores.map((x) => x.mapaOrdem))].sort((x, y) => x - y)
  const lado = (id: string | undefined, nome: string | undefined, ordem: number) => {
    const linhas = j.jogadores.filter((x) => x.equipaId === id && x.mapaOrdem === ordem)
    if (!linhas.length) return null
    return (
      <div className="flex flex-col gap-1.5">
        <Papel>{nome}</Papel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[13px]">
            <thead>
              <tr className="text-right font-mono text-[10px] tracking-[0.14em] text-mudo">
                <th className="py-1.5 pr-2 text-left font-semibold">{l('JOGADOR', 'PLAYER')}</th>
                <th className="px-2 text-left font-semibold">{l('AGENTE', 'AGENT')}</th>
                <th className="px-2 font-semibold">ACS</th><th className="px-2 font-semibold">K</th><th className="px-2 font-semibold">D</th><th className="px-2 font-semibold">A</th><th className="pl-2 font-semibold">FB</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.perfilId} className="border-t border-white/6 text-right font-mono">
                  <td className="max-w-[150px] truncate py-1.5 pr-2 text-left font-sans text-[13.5px] font-bold">{x.utilizador}</td>
                  <td className="px-2 text-left font-sans text-suave">{x.agente ?? '-'}</td>
                  <td className="px-2">{x.acs ?? '-'}</td><td className="px-2">{x.kills ?? '-'}</td><td className="px-2">{x.deaths ?? '-'}</td><td className="px-2">{x.assists ?? '-'}</td><td className="pl-2">{x.firstBloods ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      {ordens.map((o) => {
        const mapa = j.mapas.find((m) => m.ordem === o)
        return (
          <div key={o} className="flex flex-col gap-4">
            {j.melhorDe > 1 && <Papel>{l('MAPA', 'MAP')} {o}{mapa ? ` · ${mapa.mapa.toUpperCase()}${mapa.scoreA != null ? ` · ${mapa.scoreA}-${mapa.scoreB}` : ''}` : ''}</Papel>}
            {lado(j.equipaA?.id, j.equipaA?.nome, o)}{lado(j.equipaB?.id, j.equipaB?.nome, o)}
          </div>
        )
      })}
    </div>
  )
}

function Passos({ j }: { j: TorneioJogo }) {
  // Com picks e bans há um passo a mais (o mapa); com o mapa posto pela staff não há.
  const comVeto = !!j.veto && !j.veto.mapaStaff
  const k = Math.min(j.serieA + j.serieB + 1, j.mapas.length)
  const jogar = j.mapas.length > 0 ? l(`Mapa ${k} de ${j.mapas.length}`, `Map ${k} of ${j.mapas.length}`) : l('A jogar', 'Playing')
  const passos = comVeto
    ? [l('Agendado', 'Scheduled'), l('Picks e bans', 'Picks and bans'), l('Grupo criado', 'Lobby created'), jogar, l('Resultado da API', 'API result')]
    : [l('Agendado', 'Scheduled'), l('Grupo criado', 'Lobby created'), jogar, l('Resultado da API', 'API result')]
  const a = comVeto ? 1 : 0
  const vetoFeito = !!j.veto?.ladoEscolha
  // "feitos" = quantos já estão cumpridos; "agora" = o passo em curso (-1 = tudo feito).
  const feitos = j.estado === 'concluido' ? passos.length
    : j.estado === 'a_decorrer' ? 2 + a
      : j.estado === 'veto' ? 1
        // Entre dois mapas de uma série o grupo já existe: falta abrir o mapa seguinte.
        : j.estado === 'agendado' ? (j.serieA + j.serieB > 0 ? 2 + a : comVeto && vetoFeito ? 2 : 1) : 0
  const agora = j.estado === 'concluido' ? -1 : feitos
  return (
    <ol className="m-0 flex list-none p-0" aria-label={l('Fases do jogo', 'Match steps')}>
      {passos.map((p, i) => {
        const ok = i < feitos
        const ativo = i === agora
        return (
          <li key={p} aria-current={ativo ? 'step' : undefined} className={`flex flex-1 flex-col items-center gap-1.5 text-center text-[11.5px] ${ativo ? 'font-bold text-texto' : 'text-mudo'}`}>
            <span aria-hidden className={`grid size-[22px] place-items-center rounded-full border-2 ${ok ? 'border-vitoria bg-vitoria text-[#06201d]' : ativo ? 'border-laranja shadow-[0_0_0_4px_rgba(255,91,31,0.2)]' : 'border-white/18'}`}>
              {ok && <Check size={12} strokeWidth={3} />}
            </span>
            {p}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * O jogo por inteiro: quem joga, a hora, o código do grupo (os capitães abrem o jogo e partilham-no) e,
 * no fim, o resultado com as estatísticas. O resultado vem da API da Riot, nunca de quem joga.
 */
export function JogoPainel({ jogo, detalhe, meuId, aoMudar, emModal = false }: { jogo: TorneioJogo; detalhe: TorneioDetalhe; meuId: string; aoMudar: () => void; emModal?: boolean }) {
  const acao = useAcao()
  const avisar = useAvisos()
  const agora = useAgora(30_000)
  const [codigo, setCodigo] = useState('')
  const [trocar, setTrocar] = useState(false)
  // Entre os mapas de uma série o grupo do Valorant é o mesmo: o código já vem preenchido.
  useEffect(() => { setCodigo(jogo.serieA + jogo.serieB > 0 ? jogo.codigo ?? '' : ''); setTrocar(false) }, [jogo.id, jogo.estado, jogo.serieA, jogo.serieB, jogo.codigo])

  const t = detalhe.torneio
  const eqA = detalhe.equipas.find((e) => e.id === jogo.equipaA?.id)
  const eqB = detalhe.equipas.find((e) => e.id === jogo.equipaB?.id)
  const souCapitao = [eqA, eqB].some((e) => e?.capitaoId === meuId)
  const jogoDeMembro = [eqA, eqB].some((e) => e?.membros.some((m) => m.perfilId === meuId && m.estado === 'aceite'))
  // Os capitães abrem o jogo quando ele já tem data (nos torneios de teste, quando quiserem); a staff abre sempre.
  const podeAbrir = !!jogo.equipaA && !!jogo.equipaB && !jogo.presencial && jogo.estado !== 'concluido' && (t.gerir || (souCapitao && (jogo.estado !== 'pendente' || t.teste)))
  const abreEm = jogo.agendadoPara ? new Date(jogo.agendadoPara).getTime() - 30 * 60_000 : null
  const nMapa = jogo.serieA + jogo.serieB + 1
  const cedo = !t.gerir && !t.teste && nMapa === 1 && (abreEm == null || agora < abreEm)
  // Com picks e bans ligados o mapa tem de estar decidido antes de se abrir o jogo.
  const faltaVeto = !!jogo.veto && !jogo.mapa
  const podeComecarVeto = !!jogo.veto && !jogo.veto.mapaStaff && !jogo.veto.ladoEscolha && jogo.estado !== 'concluido' && jogo.estado !== 'a_decorrer'
    && (t.gerir || (souCapitao && (jogo.estado === 'agendado' || t.teste)))

  const abrir = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await acao(async () => { await dados.torneioAbrirJogo(jogo.id, codigo); return true })
    if (ok) { avisar(l('Jogo aberto: o resultado é lido da API da Riot.', 'Match opened: the result is read from the Riot API.')); aoMudar() }
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(jogo.codigo ?? ''); avisar(l('Código copiado.', 'Code copied.')) } catch { avisar(l('Não foi possível copiar: seleciona o código à mão.', 'Could not copy: select the code by hand.'), 'erro') }
  }

  const vencedor = jogo.vencedorId === jogo.equipaA?.id ? jogo.equipaA : jogo.vencedorId === jogo.equipaB?.id ? jogo.equipaB : null
  const como = comoTexto(jogo.como)

  return (
    <Painel aria-label={rotuloJogo(jogo)} className={`flex min-w-0 flex-col gap-5 ${emModal ? '!border-0 !bg-transparent' : `p-[22px] ${jogo.estado === 'a_decorrer' ? '!border-laranja/35' : ''}`}`}>
      {!emModal && (
        <TituloPainel
          eyebrow={`${jogo.fase === 'grupo' ? `${nomeGrupo(jogo.grupo)} · ` : ''}${rotuloJogo(jogo)}`.toUpperCase()}
          direita={<ChipJogo j={jogo} />}
        />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
        <div className="min-w-0 text-right text-[clamp(20px,3vw,30px)] leading-tight font-extrabold tracking-[-0.04em]"><NomeEquipa j={jogo} lado="A" forte /></div>
        <div className="text-center"><Placar j={jogo} /></div>
        <div className="min-w-0 text-[clamp(20px,3vw,30px)] leading-tight font-extrabold tracking-[-0.04em]"><NomeEquipa j={jogo} lado="B" forte /></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {emModal && <ChipJogo j={jogo} />}
        <Chip>{jogo.agendadoPara ? dataHoraCurta(jogo.agendadoPara) : l('Sem data', 'No date yet')}</Chip>
        {nomeMelhorDe(jogo.melhorDe) && <Chip tom="laranja">{l(`MELHOR DE ${jogo.melhorDe}`, `BEST OF ${jogo.melhorDe}`)}</Chip>}
        <Chip>{jogo.mapa && jogo.estado !== 'concluido' ? `${l('Mapa', 'Map')}${jogo.mapas.length ? ` ${nMapa}` : ''}: ${jogo.mapa}` : jogo.estado === 'concluido' && jogo.mapas.length ? `${jogo.mapas.filter((m) => m.estado === 'concluido').length} ${l('mapas jogados', 'maps played')}` : jogo.mapa ? `${l('Mapa', 'Map')}: ${jogo.mapa}` : jogo.veto ? l('Mapa por picks e bans', 'Map by picks and bans') : l('Mapa à escolha das equipas', 'Map picked by the teams')}</Chip>
        {jogo.presencial && <Chip tom="ouro">{l('PRESENCIAL', 'IN PERSON')}</Chip>}
        {vencedor && <Chip tom="vitoria"><Crown size={12} aria-hidden />{vencedor.nome}</Chip>}
      </div>

      {jogo.presencial ? (
        <p className="m-0 rounded-[14px] border border-ouro/30 bg-ouro/[0.06] px-4 py-3 text-[13px] leading-normal text-suave">
          {l('Este jogo é presencial: não se abre no hub. O resultado é posto pela staff no fim.', 'This match is played in person: it is not opened in the hub. Staff enters the result at the end.')}
        </p>
      ) : jogo.equipaA && jogo.equipaB ? <Passos j={jogo} /> : null}

      {!jogo.presencial && jogo.veto && jogo.equipaA && jogo.equipaB && jogo.estado !== 'concluido' && (
        <VetoJogo jogo={jogo} detalhe={detalhe} meuId={meuId} aoMudar={aoMudar} podeComecar={podeComecarVeto} cedo={cedo} abreEm={abreEm} />
      )}
      <SerieMapas jogo={jogo} />

      {jogo.semResultadoAuto && t.gerir && (
        <p role="alert" className="m-0 flex items-start gap-2.5 rounded-[14px] border border-derrota/35 bg-derrota/[0.05] px-4 py-3 text-[13px] leading-normal text-suave">
          <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-derrota" />
          <span><b className="text-derrota">{l('Sem resultado automático há mais de 1 hora.', 'No automatic result for over an hour.')}</b> {l('Põe o resultado à mão na Staff › Torneios.', 'Enter the result by hand in Staff › Tournaments.')}</span>
        </p>
      )}

      {jogo.estado === 'a_decorrer' && jogo.codigo && (
        <div className="flex flex-col gap-2.5 rounded-[14px] border border-white/8 bg-white/[0.035] p-4">
          <Papel>{l('CÓDIGO DO GRUPO', 'LOBBY CODE')}</Papel>
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="font-mono text-[clamp(26px,5vw,34px)] font-bold tracking-[0.2em]">{jogo.codigo}</span>
            <button type="button" className="btn btn-fantasma !h-9" onClick={copiar}><Copy size={15} aria-hidden />{l('Copiar', 'Copy')}</button>
            {podeAbrir && <button type="button" className="btn btn-fantasma !h-9" onClick={() => setTrocar((v) => !v)}>{l('Trocar código', 'Change code')}</button>}
          </div>
          <p className="m-0 text-[12.5px] leading-normal text-suave">
            {l('Cria o jogo personalizado no Valorant com este código. O Rangify vê o resultado sozinho na API da Riot (a cada minuto), por isso ninguém o escreve: ', 'Create the custom game in Valorant with this code. Rangify reads the result by itself from the Riot API (every minute), so nobody types it: ')}
            <b className="text-texto">{l('podem fechar esta página.', 'you can close this page.')}</b>
          </p>
        </div>
      )}
      {jogo.estado === 'a_decorrer' && !jogo.codigo && (
        <p className="m-0 rounded-[14px] border border-white/8 bg-white/[0.035] px-4 py-3 text-[13px] leading-normal text-suave">
          {l('O jogo está a decorrer. O resultado vai aparecer aqui quando a API da Riot o tiver.', 'The match is in progress. The result will show up here once the Riot API has it.')}
        </p>
      )}

      {podeAbrir && !faltaVeto && jogo.estado !== 'veto' && (jogo.estado !== 'a_decorrer' || trocar) && (
        <form className="flex flex-col gap-2.5 rounded-[14px] border border-white/8 bg-white/[0.035] p-4" onSubmit={abrir}>
          <Papel>{jogo.estado === 'a_decorrer' ? l('TROCAR O CÓDIGO DO GRUPO', 'CHANGE THE LOBBY CODE') : nMapa > 1 ? l(`ABRIR O MAPA ${nMapa} · ${jogo.mapa?.toUpperCase() ?? ''}`, `OPEN MAP ${nMapa} · ${jogo.mapa?.toUpperCase() ?? ''}`) : l('ABRIR O JOGO', 'OPEN THE MATCH')}</Papel>
          <p className="m-0 text-[12.5px] leading-normal text-suave">
            {nMapa > 1 && jogo.estado !== 'a_decorrer'
              ? l('Escolhe o mapa seguinte no mesmo grupo do Valorant (o código é o mesmo) e abre-o aqui. O resultado deste mapa é lido da API da Riot.', 'Pick the next map in the same Valorant lobby (the code is the same) and open it here. This map\'s result is read from the Riot API.')
              : l('Cria o jogo personalizado no Valorant, copia o código do grupo e cola-o aqui. As duas equipas veem o código e o resultado é lido da API da Riot.', 'Create the custom game in Valorant, copy the lobby code and paste it here. Both teams see the code and the result is read from the Riot API.')}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <label className="sr-only" htmlFor="rg-codigo-jogo">{l('Código do grupo', 'Lobby code')}</label>
            <input
              id="rg-codigo-jogo"
              className="campo min-w-[150px] flex-1 !font-mono !text-[18px] !tracking-[0.2em] uppercase"
              placeholder="ABC123"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <button type="submit" className="btn btn-primario" disabled={codigo.length !== 6 || cedo}>{jogo.estado === 'a_decorrer' ? l('Guardar o código', 'Save the code') : nMapa > 1 ? l(`Abrir o mapa ${nMapa}`, `Open map ${nMapa}`) : l('Abrir o jogo', 'Open the match')}</button>
          </div>
          {cedo && <span className="text-[12px] text-pessego">{abreEm ? `${l('Abre às', 'Opens at')} ${new Date(abreEm).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${l('30 minutos antes da hora marcada.', '30 minutes before the scheduled time.')}` : l('A staff ainda não marcou a hora deste jogo.', 'Staff has not scheduled this match yet.')}</span>}
        </form>
      )}
      {!podeAbrir && jogo.estado === 'agendado' && jogoDeMembro && !faltaVeto && (
        <p className="m-0 text-[12.5px] leading-normal text-mudo">{l('Quando for a hora, um dos capitães cria o grupo e abre o jogo aqui: o código aparece-te logo.', 'When it is time, one of the captains creates the lobby and opens the match here: the code shows up for you right away.')}</p>
      )}

      {jogo.estado === 'concluido' && (
        <div className="flex flex-col gap-3 border-t border-white/7 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Papel>{l('RESULTADO', 'RESULT')}</Papel>
            {como && <span className="text-[12px] text-mudo">{como}</span>}
          </div>
          <EstatisticasJogo j={jogo} />
        </div>
      )}
    </Painel>
  )
}
