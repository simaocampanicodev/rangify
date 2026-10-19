/**
 * Picks e bans de mapas de um jogo do torneio. Os capitães das duas equipas vetam à vez (a equipa A começa);
 * o mapa que sobra, ou o que a equipa da vez escolhe, é o do jogo, e a outra equipa escolhe o lado.
 * Cada vez tem 90 s: passado o tempo joga-se ao calhas. Os bots jogam logo.
 */
import { Ban, Check, Shield, Swords } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Relogio } from '@/components/partida/Relogio'
import { Papel } from '@/components/torneios/comum'
import { Chip } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useAgora } from '@/hooks/useAgora'
import { useIntervalo } from '@/hooks/useVisivel'
import { dados, type JogadaVetoTorneio, type TorneioDetalhe, type TorneioJogo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { MAPAS } from '@/lib/mapas'
import { acertarRelogio, emFalta } from '@/lib/tempo'

const SEGUNDOS = 90
const nomeLado = (lado: 'ataque' | 'defesa') => (lado === 'ataque' ? l('Ataque', 'Attack') : l('Defesa', 'Defence'))
const cor = (equipa: 'A' | 'B') => (equipa === 'A' ? 'text-laranja' : 'text-marfim')
const tipoTexto = (tipo: 'ban' | 'pick' | 'lado') => (tipo === 'ban' ? 'BAN' : tipo === 'pick' ? l('ESCOLHA', 'PICK') : l('LADO', 'SIDE'))

/** A fila de passos: o que já aconteceu, o que está a acontecer e o que falta. */
function Fila({ jogo, vez }: { jogo: TorneioJogo; vez: number }) {
  const v = jogo.veto!
  return (
    <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={l('Ordem dos picks e bans', 'Pick and ban order')}>
      {v.passos.map((p, i) => {
        const feito: JogadaVetoTorneio | undefined = v.feitos[i]
        const mapa = feito && feito.tipo !== 'lado' ? MAPAS.find((m) => m.nome === feito.valor) : null
        const atual = i === vez && jogo.estado === 'veto'
        return (
          <li key={i} className="flex w-[58px] flex-col items-center gap-1.5">
            <span
              className="mapa relative grid h-[38px] w-[58px] place-items-center overflow-hidden rounded-[8px] border font-mono text-[11px] font-bold"
              style={{
                backgroundImage: mapa ? `url(${mapa.imagem})` : undefined,
                borderColor: atual ? '#ff5b1f' : feito?.tipo === 'pick' ? 'rgba(255,91,31,0.6)' : 'rgba(255,255,255,0.1)',
                filter: mapa && feito?.tipo === 'ban' ? 'grayscale(1) brightness(0.55)' : undefined,
                borderStyle: feito || atual ? 'solid' : 'dashed',
              }}
            >
              {feito?.tipo === 'lado' ? (feito.valor === 'ataque' ? <Swords size={15} aria-hidden /> : <Shield size={15} aria-hidden />)
                : !mapa && <span className={atual ? 'text-pessego' : 'text-mudo'}>{p.equipa}</span>}
            </span>
            <span className={`max-w-full truncate font-mono text-[9px] tracking-[0.06em] ${atual ? 'text-pessego' : 'text-mudo'}`}>
              {feito && feito.tipo !== 'lado' ? feito.valor.toUpperCase() : `${tipoTexto(p.tipo)}${v.melhorDe > 1 && p.alvo ? ` ${p.alvo}` : ''}`}
            </span>
            <span className="so-leitores">{p.equipa} {feito ? `${tipoTexto(p.tipo)} ${feito.valor}${feito.auto ? ` (${l('automático', 'automatic')})` : ''}` : tipoTexto(p.tipo)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** O resumo quando tudo está decidido: o mapa e o lado. */
function Resumo({ jogo }: { jogo: TorneioJogo }) {
  const v = jogo.veto!
  const mapa = MAPAS.find((m) => m.nome === jogo.mapa)
  const equipa = (e: 'A' | 'B') => (e === 'A' ? jogo.equipaA : jogo.equipaB)?.nome ?? e
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.035] p-4">
      <div className="flex items-center gap-3.5">
        <span className="mapa h-[56px] w-[92px] shrink-0 rounded-[10px] border border-laranja/60" style={{ backgroundImage: mapa ? `url(${mapa.imagem})` : undefined }} aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <Papel>{v.mapaStaff ? l('MAPA DEFINIDO PELA STAFF', 'MAP SET BY STAFF') : l('MAPA DO JOGO', 'MATCH MAP')}</Papel>
          <span className="truncate text-[22px] leading-none font-extrabold tracking-[-0.03em]">{jogo.mapa}</span>
          {v.ladoEquipa && v.ladoEscolha && (
            <span className="text-[12.5px] text-suave">
              <b className={cor(v.ladoEquipa)}>{equipa(v.ladoEquipa)}</b> {l(`começa a ${v.ladoEscolha === 'ataque' ? 'atacar' : 'defender'}`, `starts on ${v.ladoEscolha === 'ataque' ? 'attack' : 'defence'}`)}
            </span>
          )}
        </div>
      </div>
      {!v.mapaStaff && v.feitos.length > 0 && <Fila jogo={jogo} vez={v.feitos.length} />}
    </div>
  )
}

export function VetoJogo({ jogo, detalhe, meuId, aoMudar, podeComecar, cedo, abreEm }: {
  jogo: TorneioJogo; detalhe: TorneioDetalhe; meuId: string; aoMudar: () => void
  /** Os capitães (ou a staff) podem começar. */
  podeComecar: boolean; cedo: boolean; abreEm: number | null
}) {
  const acao = useAcao()
  const t = detalhe.torneio
  const v = jogo.veto
  const [aFazer, setAFazer] = useState<string | null>(null)
  const tentou = useRef(0)
  // Acerta o relógio pela hora do servidor, para a contagem não depender do relógio do computador.
  useEffect(() => { acertarRelogio(detalhe.agora) }, [detalhe.agora])
  const emCurso = jogo.estado === 'veto'
  const agora = useAgora(250, emCurso)
  // Enquanto os capitães vetam, relê o jogo de poucos em poucos segundos.
  useIntervalo(aoMudar, emCurso ? 3000 : null)

  const eqA = detalhe.equipas.find((e) => e.id === jogo.equipaA?.id)
  const eqB = detalhe.equipas.find((e) => e.id === jogo.equipaB?.id)
  const indice = v?.feitos.length ?? 0
  const vez = emCurso && v ? v.passos[indice] : undefined
  const eqVez = vez ? (vez.equipa === 'A' ? eqA : eqB) : undefined
  const capVez = eqVez?.membros.find((m) => m.capitao)
  const minhaVez = !!vez && (t.gerir || eqVez?.capitaoId === meuId)
  const prazo = v?.prazo ?? null

  // Passado o tempo da vez, qualquer pessoa com a página aberta pede ao servidor para jogar ao calhas.
  useEffect(() => {
    if (!emCurso || !prazo) return
    if (agora < new Date(prazo).getTime() + 700 || Date.now() - tentou.current < 4000) return
    tentou.current = Date.now()
    dados.torneioVetoAvancar(jogo.id).then((jogou) => { if (jogou) aoMudar() }).catch(() => {})
  }, [agora, emCurso, prazo, jogo.id, aoMudar])

  const usados = useMemo(() => new Set((v?.feitos ?? []).filter((f) => f.tipo !== 'lado').map((f) => f.valor)), [v?.feitos])
  if (!v || !jogo.equipaA || !jogo.equipaB) return null

  const jogar = async (valor: string) => {
    setAFazer(valor)
    await acao(async () => { await dados.torneioVetoAgir(jogo.id, valor); return true })
    setAFazer(null)
    aoMudar()
  }
  const comecar = async () => {
    setAFazer('comecar')
    await acao(async () => { await dados.torneioVetoIniciar(jogo.id); return true })
    setAFazer(null)
    aoMudar()
  }
  const staff = async (f: () => Promise<void>, msg: string) => {
    setAFazer('staff')
    await acao(async () => { await f(); return true }, msg)
    setAFazer(null)
    aoMudar()
  }

  const decidido = !!v.ladoEscolha || v.mapaStaff
  const formatoTexto = v.melhorDe === 1
    ? l('Os capitães banem mapas à vez até sobrar um; quem não baniu por último escolhe o lado.', 'Captains ban maps in turns until one is left; whoever did not make the last ban picks the side.')
    : v.melhorDe === 3
      ? l('Melhor de 3: um ban cada, cada equipa escolhe um mapa (a outra escolhe o lado nesse mapa), um ban cada e o que sobra é o decisivo.', 'Best of 3: one ban each, each team picks a map (the other picks the side on it), one ban each and the map left is the decider.')
      : l('Melhor de 5: um ban cada, depois cada equipa escolhe dois mapas (a outra escolhe o lado em cada um) e o que sobra é o decisivo.', 'Best of 5: one ban each, then each team picks two maps (the other picks the side on each) and the map left is the decider.')
  // O mapa a que se refere um pick ou um lado (o decisivo é o que sobra no fim).
  const mapaDoAlvo = (alvo?: number) => {
    if (!alvo) return null
    if (alvo < v.melhorDe) return v.feitos.filter((f) => f.tipo === 'pick')[alvo - 1]?.valor ?? null
    const sobra = v.pool.filter((m) => !usados.has(m))
    return sobra.length === 1 ? sobra[0] : null
  }

  // ---- Tudo decidido
  if (decidido && jogo.mapa) {
    return (
      <div className="flex flex-col gap-2.5">
        {jogo.mapas.length === 0 && <Resumo jogo={jogo} />}
        {t.gerir && !v.mapaStaff && (jogo.estado === 'agendado' || jogo.estado === 'pendente') && (
          <div><button type="button" className="btn btn-fantasma !h-9" disabled={aFazer === 'staff'} onClick={() => staff(() => dados.torneioVetoReiniciar(jogo.id), l('Picks e bans apagados.', 'Picks and bans cleared.'))}>{l('Refazer os picks e bans', 'Redo picks and bans')}</button></div>
        )}
      </div>
    )
  }
  // Jogo já a decorrer ou acabado sem mapa (não devia acontecer com picks e bans ligados): nada a mostrar.
  if (jogo.estado === 'a_decorrer' || jogo.estado === 'concluido') return jogo.mapa && jogo.mapas.length === 0 ? <Resumo jogo={jogo} /> : null

  // ---- Ainda não começaram
  if (!emCurso) {
    return (
      <section aria-label={l('Picks e bans de mapas', 'Map picks and bans')} className="flex flex-col gap-3 rounded-[14px] border border-white/8 bg-white/[0.035] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Papel>{l('PICKS E BANS DE MAPAS', 'MAP PICKS AND BANS')}</Papel>
          <Chip tom={v.melhorDe > 1 ? 'laranja' : 'neutro'}>{l(`Melhor de ${v.melhorDe}`, `Best of ${v.melhorDe}`)}</Chip>
        </div>
        <p className="m-0 text-[12.5px] leading-normal text-suave">
          {formatoTexto} {l(`Cada vez tem ${SEGUNDOS} segundos: passado o tempo, joga-se ao calhas.`, `Each turn lasts ${SEGUNDOS} seconds: when time runs out, a random move is played.`)}
        </p>
        <div className="flex flex-wrap gap-1.5" aria-label={l('Mapas em jogo', 'Maps in play')}>
          {v.pool.map((m) => <Chip key={m}>{m}</Chip>)}
        </div>
        {podeComecar ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" className="btn btn-primario" disabled={aFazer === 'comecar' || cedo} onClick={comecar}>{aFazer === 'comecar' ? l('A começar…', 'Starting…') : l('Começar picks e bans', 'Start picks and bans')}</button>
            {cedo && <span className="text-[12px] text-pessego">{abreEm ? `${l('Abrem às', 'Open at')} ${new Date(abreEm).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ${l('30 minutos antes da hora marcada.', '30 minutes before the scheduled time.')}` : l('A staff ainda não marcou a hora deste jogo.', 'Staff has not scheduled this match yet.')}</span>}
          </div>
        ) : (
          <p className="m-0 text-[12.5px] leading-normal text-mudo">{l('Um dos capitães começa os picks e bans 30 minutos antes do jogo; depois cria o grupo e abre o jogo.', 'One of the captains starts the picks and bans 30 minutes before the match, then creates the lobby and opens the match.')}</p>
        )}
      </section>
    )
  }

  // ---- A decorrer
  const livre = (nome: string) => !usados.has(nome)
  const eu = minhaVez
  const quem = capVez?.utilizador ?? eqVez?.nome
  const nSerie = v.melhorDe > 1
  const alvoNome = vez?.tipo === 'lado' ? mapaDoAlvo(vez.alvo) : null
  const titulo = !vez ? '' : eu
    ? vez.tipo === 'ban' ? l('Escolhe um mapa para banir', 'Pick a map to ban')
      : vez.tipo === 'pick' ? (nSerie ? l(`Escolhe o mapa ${vez.alvo} da série`, `Pick map ${vez.alvo} of the series`) : l('Escolhe o mapa do jogo', 'Pick the match map'))
        : l(`Escolhe o lado em que começas${alvoNome ? ` no ${alvoNome}` : ''}`, `Pick the side you start on${alvoNome ? ` on ${alvoNome}` : ''}`)
    : vez.tipo === 'ban' ? l(`${quem} está a banir um mapa`, `${quem} is banning a map`)
      : vez.tipo === 'pick' ? l(`${quem} está a escolher o mapa${nSerie ? ` ${vez.alvo}` : ''}`, nSerie ? `${quem} is picking map ${vez.alvo}` : `${quem} is picking the map`)
        : l(`${quem} está a escolher o lado${alvoNome ? ` no ${alvoNome}` : ''}`, `${quem} is picking the side${alvoNome ? ` on ${alvoNome}` : ''}`)
  const pool = MAPAS.filter((m) => v.pool.includes(m.nome))

  return (
    <section aria-label={l('Picks e bans de mapas', 'Map picks and bans')} className="flex flex-col gap-4 rounded-[14px] border border-laranja/30 bg-laranja/[0.04] p-4">
      <div className="flex items-center gap-4">
        <Relogio restante={emFalta(prazo, agora)} total={SEGUNDOS} tamanho={68} espessura={5} cor={vez?.equipa === 'A' ? '#ff5b1f' : '#e6e1da'} />
        <div className="flex min-w-0 flex-col gap-1">
          {vez && (
            <span className={`font-mono text-[11px] font-bold tracking-[0.14em] ${cor(vez.equipa)}`}>
              {tipoTexto(vez.tipo)} {indice + 1}/{v.passos.length} · {l('EQUIPA', 'TEAM')} {vez.equipa} · {eqVez?.nome?.toUpperCase()}
            </span>
          )}
          <h3 role="status" className="m-0 text-[clamp(17px,3vw,21px)] leading-tight font-extrabold tracking-[-0.02em]">{titulo}</h3>
          <span className="text-[12px] text-mudo">
            {t.gerir && eqVez?.capitaoId !== meuId ? l('Estás a jogar pela equipa, como staff. ', 'You are playing for the team, as staff. ') : ''}
            {formatoTexto}
          </span>
        </div>
      </div>

      <Fila jogo={jogo} vez={indice} />

      {vez?.tipo === 'lado' ? (
        <div className="flex flex-col gap-2.5">
          {alvoNome && (
            <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2.5">
              <span className="mapa h-[42px] w-[68px] shrink-0 rounded-[9px] border border-laranja/50" style={{ backgroundImage: `url(${MAPAS.find((m) => m.nome === alvoNome)?.imagem})` }} aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-mudo">{nSerie ? l(`MAPA ${vez.alvo}${vez.alvo === v.melhorDe ? ' · DECISIVO' : ''}`, `MAP ${vez.alvo}${vez.alvo === v.melhorDe ? ' · DECIDER' : ''}`) : l('MAPA DO JOGO', 'MATCH MAP')}</span>
                <b className="text-[16px] font-extrabold tracking-[-0.02em]">{alvoNome}</b>
              </span>
            </div>
          )}
        <div className="grid grid-cols-2 gap-2.5" role="group" aria-label={l('Escolha do lado', 'Side pick')}>
          {(['ataque', 'defesa'] as const).map((lado) => (
            <button
              key={lado}
              type="button"
              disabled={!eu || !!aFazer}
              onClick={() => jogar(lado)}
              className={`flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-[15px] font-extrabold tracking-[0.04em] uppercase transition-colors ${eu ? 'cursor-pointer border-laranja/55 bg-laranja/12 text-pessego-claro hover:bg-laranja hover:text-escuro-laranja' : 'cursor-default border-white/10 bg-white/[0.03] text-mudo'}`}
            >
              {lado === 'ataque' ? <Swords size={22} aria-hidden /> : <Shield size={22} aria-hidden />}
              {nomeLado(lado)}
              <span className="font-mono text-[10px] font-semibold tracking-[0.08em] opacity-80">{aFazer === lado ? l('A ESCOLHER…', 'PICKING…') : eu ? l('ESCOLHER', 'PICK') : ''}</span>
            </button>
          ))}
        </div>
        </div>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2.5 p-0" aria-label={l('Mapas em jogo', 'Maps in play')}>
          {pool.map((m) => {
            const feito = v.feitos.find((f) => f.tipo !== 'lado' && f.valor === m.nome)
            const banido = feito?.tipo === 'ban'
            const escolhido = feito?.tipo === 'pick'
            const podeClicar = eu && livre(m.nome) && !aFazer
            return (
              <li key={m.nome} className={`relative flex aspect-[4/3] min-w-0 flex-col justify-end overflow-hidden rounded-xl border ${escolhido ? 'border-laranja shadow-[0_18px_40px_-22px_rgba(255,91,31,0.8)]' : 'border-white/10'}`}>
                <span aria-hidden className="mapa absolute inset-0" style={{ backgroundImage: `url(${m.imagem})`, filter: banido ? 'grayscale(1) brightness(0.4)' : undefined }} />
                <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.35) 0%, rgba(9,9,11,0.05) 35%, rgba(9,9,11,0.9) 100%)' }} />
                {banido && (
                  <span aria-hidden className="absolute top-[34%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1">
                    <span className="grid size-8 place-items-center rounded-full border-2 border-white/70 bg-[rgba(9,9,11,0.4)] text-white"><Ban size={16} /></span>
                    <span className="font-mono text-[9.5px] font-extrabold tracking-[0.08em] whitespace-nowrap text-pessego-claro">{l('EQUIPA', 'TEAM')} {feito!.equipa}</span>
                  </span>
                )}
                <div className="relative flex flex-col gap-1.5 p-2">
                  <span className="truncate text-[14px] leading-none font-black tracking-[-0.02em] uppercase">{m.nome}</span>
                  {podeClicar ? (
                    <button
                      type="button"
                      onClick={() => jogar(m.nome)}
                      aria-label={`${vez?.tipo === 'pick' ? l('Escolher', 'Pick') : l('Banir', 'Ban')} ${m.nome}`}
                      className="flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-laranja/55 bg-laranja/18 text-[12px] font-extrabold tracking-[0.08em] text-pessego-claro transition-colors hover:bg-laranja hover:text-escuro-laranja"
                    >
                      {vez?.tipo === 'pick' ? <Check size={14} aria-hidden /> : <Ban size={14} aria-hidden />}
                      {vez?.tipo === 'pick' ? l('ESCOLHER', 'PICK') : l('BANIR', 'BAN')}
                    </button>
                  ) : (
                    <span className={`font-mono text-[9.5px] font-bold tracking-[0.1em] ${escolhido ? 'text-pessego' : 'text-mudo'}`}>
                      {escolhido ? (nSerie ? l(`MAPA ${v.feitos.filter((f) => f.tipo === 'pick').findIndex((f) => f.valor === m.nome) + 1} · EQUIPA ${feito!.equipa}`, `MAP ${v.feitos.filter((f) => f.tipo === 'pick').findIndex((f) => f.valor === m.nome) + 1} · TEAM ${feito!.equipa}`) : l('ESCOLHIDO', 'PICKED')) : banido ? l('BANIDO', 'BANNED') : aFazer === m.nome ? l('A BANIR…', 'BANNING…') : l('DISPONÍVEL', 'AVAILABLE')}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="m-0 text-[12px] leading-normal text-mudo">
        {l(`Se o tempo da vez acabar (${SEGUNDOS} s), joga-se ao calhas por quem não jogou. Os bots jogam logo.`, `If a turn runs out (${SEGUNDOS} s), a random move is played for whoever did not play. Bots play right away.`)}
      </p>
      {t.gerir && (
        <div className="flex flex-wrap gap-2 border-t border-white/8 pt-3">
          <button type="button" className="btn btn-fantasma !h-9" disabled={aFazer === 'staff'} onClick={() => staff(() => dados.torneioVetoConcluir(jogo.id), l('Picks e bans despachados ao calhas.', 'Picks and bans completed at random.'))}>{l('Despachar o resto ao calhas', 'Complete the rest at random')}</button>
          <button type="button" className="btn btn-fantasma !h-9" disabled={aFazer === 'staff'} onClick={() => staff(() => dados.torneioVetoReiniciar(jogo.id), l('Picks e bans reiniciados.', 'Picks and bans restarted.'))}>{l('Reiniciar', 'Restart')}</button>
        </div>
      )}
    </section>
  )
}
