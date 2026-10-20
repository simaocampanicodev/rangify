import { ArrowRight, Ban, ChevronsUp, Lock, LoaderCircle, LogOut, RefreshCw, Timer, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSessao } from '@/contexts/Sessao'
import { useAgora } from '@/hooks/useAgora'
import { useCarregar } from '@/hooks/useCarregar'
import { useDiscordFila } from '@/hooks/useDiscordFila'
import { IconeDiscord } from '@/pages/Entrar'
import { useFila } from '@/hooks/useFila'
import { dados, type FilaTipo } from '@/lib/data'
import { ROTACAO_PADRAO } from '@/lib/mapas'
import { TIER_MINIMO_RANKED, corRank, nomeRank, siglaRank } from '@/lib/ranks'
import { SEGUNDOS_CONFIRMAR } from '@/lib/regras'
import { agoraCerto, relogio, textoDuracaoBan } from '@/lib/tempo'
import { l } from '@/lib/idioma'

export const nomeFila = (tipo: FilaTipo) => (tipo === 'ranked' ? 'ranked' : l('aberta', 'open'))
export const nomeTabela = (tipo: FilaTipo) => (tipo === 'ranked' ? 'Ranked' : l('Aberta', 'Open'))

/** O estado de uma das filas já pronto a mostrar: lugares ocupados, tempo de espera, castigo e se a podes usar. */
export function useVistaFila(tipo: FilaTipo = 'aberta') {
  const { fila, ocupado, alternar } = useFila()
  const { perfil } = useSessao()
  const naFila = !!fila?.naFila && fila.fila === tipo
  // Só se pode estar numa fila de cada vez: com a outra aberta, esta fica à espera.
  const naOutra = !!fila?.naFila && !naFila
  const bloqueada = tipo === 'ranked' && fila?.rankedPermitido === false
  // Fechada por Owner ou Dev (por exemplo, enquanto se corrige um problema): ninguém entra.
  const fechada = !!fila?.filasFechadas?.[tipo]
  const motivoFecho = fila?.filasFechadas?.motivo ?? null
  // O ban da staff ganha ao castigo dos 5 minutos. Um ban com a data passada deixa de contar.
  const ban = fila?.ban && (fila.ban.permanente || !fila.ban.ate || new Date(fila.ban.ate).getTime() > agoraCerto()) ? fila.ban : null
  // Só conta os segundos na fila, durante um castigo ou até acabar um ban; fora disso o painel não se redesenha.
  const comCastigo = !ban && !!fila?.cooldownAte && new Date(fila.cooldownAte).getTime() > agoraCerto()
  const agora = useAgora(1000, naFila || comCastigo || (!!ban && !ban.permanente))
  const lugares = tipo === 'ranked' ? fila?.contagemRanked : fila?.contagemAberta
  return {
    tipo,
    naFila,
    naOutra,
    bloqueada,
    fechada,
    motivoFecho,
    ocupado,
    alternar: () => alternar(tipo),
    ban,
    contagem: Math.min(10, lugares ?? fila?.contagem ?? 0),
    regiao: (fila?.regiao ?? perfil?.regiao ?? 'eu').toUpperCase(),
    espera: naFila && fila?.desde ? Math.max(0, (agora - new Date(fila.desde).getTime()) / 1000) : 0,
    castigo: !ban && fila?.cooldownAte ? Math.max(0, (new Date(fila.cooldownAte).getTime() - agora) / 1000) : 0,
  }
}

/** Entrar, sair ou a contagem do castigo. */
export function BotaoFila({ tipo = 'aberta', grande = false }: { tipo?: FilaTipo; grande?: boolean }) {
  const { naFila, naOutra, bloqueada, fechada, motivoFecho, ocupado, alternar, castigo, ban } = useVistaFila(tipo)
  const discord = useDiscordFila()
  const tamanho = grande ? '!h-[50px] !rounded-xl !px-6 !text-[15px] !font-extrabold' : ''
  const fantasma = `btn btn-fantasma ${grande ? '!h-[50px] !rounded-xl !px-5' : ''}`
  // Fila fechada pela equipa: nada de entrar, e o motivo à vista se houver.
  if (!naFila && fechada) {
    return (
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <button type="button" disabled className={fantasma}>
          <Lock size={16} aria-hidden />{l('Fila fechada', 'Queue closed')}
        </button>
        {motivoFecho && <span className="text-[12.5px] leading-snug text-mudo">{motivoFecho}</span>}
      </span>
    )
  }
  // Banido pela staff: nada de entrar, e a razão à vista.
  if (!naFila && ban) {
    return (
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <button type="button" disabled className={fantasma}>
          <Ban size={16} className="text-derrota" aria-hidden />{l('Banido da fila', 'Banned from the queue')}
        </button>
        <span className="text-[12.5px] leading-snug text-mudo">
          {textoDuracaoBan(ban)}{ban.mensagem ? ` · ${ban.mensagem}` : ''}
        </span>
      </span>
    )
  }
  // O rank oficial ainda não chega para a ranked.
  if (!naFila && bloqueada) {
    return (
      <button type="button" disabled className={fantasma}>
        <Lock size={16} aria-hidden />{l('Precisas de Ascendente 1', 'You need Ascendant 1')}
      </button>
    )
  }
  // Uma fila de cada vez.
  if (naOutra) {
    return (
      <button type="button" disabled className={fantasma}>
        {tipo === 'ranked' ? l('Estás na fila aberta', 'You are in the open queue') : l('Estás na fila ranked', 'You are in the ranked queue')}
      </button>
    )
  }
  // A staff exige o servidor de Discord e o bot não te encontrou lá: primeiro o convite.
  if (!naFila && discord.bloqueado) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {discord.convite && (
          <a href={discord.convite} target="_blank" rel="noreferrer" className={`btn btn-primario no-underline ${tamanho}`}>
            <IconeDiscord tamanho={18} />{l('Entrar no Discord', 'Join the Discord')}
          </a>
        )}
        <button type="button" className={fantasma} disabled={discord.aVerificar} onClick={discord.verificar}>
          {discord.aVerificar ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} className="text-laranja" aria-hidden />}
          {l('Já entrei', 'I joined')}
        </button>
        <span className="basis-full text-[12.5px] text-mudo">{l('Para entrares na fila tens de estar no servidor de Discord do Rangify, com a conta com que entraste no site.', 'To join the queue you have to be in the Rangify Discord server, with the account you signed in with.')}</span>
      </span>
    )
  }
  if (naFila) {
    return (
      <button type="button" className={fantasma} disabled={ocupado} onClick={alternar}>
        {ocupado ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : <LogOut size={16} className="text-laranja" aria-hidden />}
        {l('Sair da fila', 'Leave queue')}
      </button>
    )
  }
  return (
    <button type="button" className={`btn btn-primario ${tamanho}`} disabled={ocupado || castigo > 0} onClick={alternar}>
      {castigo > 0
        ? <><Timer size={16} aria-hidden />{relogio(castigo)}</>
        : <>{tipo === 'ranked' ? l('Entrar na fila ranked', 'Join the ranked queue') : l('Entrar na fila aberta', 'Join the open queue')}<ArrowRight size={16} aria-hidden /></>}
    </button>
  )
}

/** O interruptor do Painel entre as duas filas, cada uma com os lugares já ocupados. */
export function SeletorFila({ valor, onChange, contagemAberta, contagemRanked, rankedBloqueada }: {
  valor: FilaTipo; onChange: (f: FilaTipo) => void; contagemAberta: number; contagemRanked: number; rankedBloqueada: boolean
}) {
  const opcoes: { tipo: FilaTipo; texto: string; icone: ReactNode; contagem: number }[] = [
    { tipo: 'aberta', texto: l('Aberta', 'Open'), icone: <Users size={14} aria-hidden />, contagem: contagemAberta },
    { tipo: 'ranked', texto: 'Ranked', icone: <ChevronsUp size={14} strokeWidth={2.4} aria-hidden />, contagem: contagemRanked },
  ]
  return (
    <div role="group" aria-label={l('Fila', 'Queue')} className="inline-flex gap-1 rounded-[14px] border border-white/9 bg-white/[0.03] p-1">
      {opcoes.map((o) => {
        const ativo = o.tipo === valor
        return (
          <button
            key={o.tipo}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.tipo)}
            className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-4 text-[14px] font-bold transition-colors ${ativo ? 'border-laranja/50 bg-laranja/14 text-pessego-claro' : 'border-transparent bg-transparent text-suave hover:text-texto'}`}
          >
            {o.icone}{o.texto}
            <span className={`inline-flex items-center rounded-full px-2 py-px font-mono text-[11px] font-semibold ${ativo ? 'bg-laranja/24' : 'bg-white/8'}`}>
              {o.tipo === 'ranked' && rankedBloqueada ? <Lock size={11} aria-label={l('Bloqueada', 'Locked')} /> : `${o.contagem}/10`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Dez segmentos à volta da contagem, um por lugar na sala. */
export function AnelFila({ tamanho = 200, contagem, naFila, legenda, modo = 'livre' }: {
  tamanho?: number; contagem: number; naFila: boolean; legenda: string
  /** `bloqueada`: sem rank para esta fila (cadeado, sem contagem). `ocupada`: estás na outra fila (anel apagado). */
  modo?: 'livre' | 'bloqueada' | 'ocupada'
}) {
  const c = tamanho / 2
  // A espessura acompanha o tamanho, e o espaço entre segmentos conta com as pontas redondas (que
  // avançam meia espessura para cada lado): num anel pequeno, um espaço fixo em graus fazia-os fundir.
  const espessura = Math.max(7, Math.round(tamanho * 0.058))
  const r = c - espessura / 2 - 8
  const vazio = ((espessura + 6) / r) * (180 / Math.PI) // graus entre o fim de um segmento e o início do seguinte
  const segmentos = Array.from({ length: 10 }, (_, i) => {
    const a0 = ((-90 + i * 36 + vazio / 2) * Math.PI) / 180
    const a1 = ((-90 + (i + 1) * 36 - vazio / 2) * Math.PI) / 180
    const d = `M ${(c + r * Math.cos(a0)).toFixed(1)} ${(c + r * Math.sin(a0)).toFixed(1)} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a1)).toFixed(1)} ${(c + r * Math.sin(a1)).toFixed(1)}`
    const cor = modo === 'bloqueada' ? 'rgba(255,255,255,0.06)'
      : i >= contagem ? 'rgba(255,255,255,0.08)'
      : modo === 'ocupada' ? 'rgba(255,255,255,0.26)'
      : naFila && i === 0 ? '#ffb592' : '#ff5b1f'
    return <path key={i} d={d} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round" style={{ transition: 'stroke .4s' }} />
  })
  const brilho = modo === 'livre'
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label={modo === 'bloqueada' ? l('Fila bloqueada', 'Queue locked') : l(`${contagem} de 10 lugares preenchidos`, `${contagem} of 10 spots filled`)} style={{ overflow: 'visible', filter: brilho ? 'drop-shadow(0 0 14px rgba(255,91,31,0.35))' : 'none' }}>
        {segmentos}
      </svg>
      {naFila && (
        <svg aria-hidden className="fila-gira absolute inset-0" width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} style={{ overflow: 'visible' }}>
          <circle cx={c} cy={c} r={r - 18} fill="none" stroke="rgba(255,181,146,0.35)" strokeWidth={1.5} strokeDasharray="3 9" />
        </svg>
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        {modo === 'bloqueada'
          ? <Lock size={Math.round(tamanho * 0.15)} className="text-mudo" aria-hidden />
          : (
            <span className={`font-mono leading-none font-semibold tracking-[-0.05em] ${modo === 'ocupada' ? 'text-mudo' : ''}`} style={{ fontSize: tamanho * 0.22 }}>
              {contagem}<span className="text-mudo" style={{ fontSize: tamanho * 0.095 }}>/10</span>
            </span>
          )}
        <span className={`font-mono text-[10.5px] tracking-[0.1em] ${naFila ? 'respira text-pessego' : 'text-mudo'}`}>{legenda}</span>
      </span>
    </div>
  )
}

/** As brasas pequenas que sobem no cartão da ranked: `e` é a posição, `d` os segundos, `a` o atraso, `x` a deriva; as de `so` só aparecem na fila. */
const BRASAS = [
  { e: 12, g: true, x: 10, d: 10, a: -2 }, { e: 29, g: false, x: -12, d: 12, a: -7 }, { e: 46, g: true, x: 14, d: 11, a: -4 },
  { e: 63, g: false, x: -10, d: 13, a: -9 }, { e: 78, g: true, x: 12, d: 10.5, a: -5.5 }, { e: 91, g: false, x: -8, d: 12.5, a: -1 },
  { e: 20, g: true, x: -10, d: 8, a: -3, so: true }, { e: 38, g: false, x: 12, d: 9, a: -6, so: true },
  { e: 55, g: true, x: -14, d: 8.5, a: -1.5, so: true }, { e: 84, g: false, x: 8, d: 9.5, a: -4.5, so: true },
]

/**
 * A moldura da fila ranked: cantos nos quatro lados, uma linha de luz no topo, um calor discreto no fundo
 * e umas brasas pequenas a subir (mais na fila). Fechada, os cantos, o calor e as brasas apagam-se.
 */
export function MoldeRanked({ bloqueada = false, naFila = false, linhas, children, ...resto }: {
  bloqueada?: boolean; naFila?: boolean; children: ReactNode
  /** Com um número, o cartão ocupa essa quantidade de linhas da grelha do pai e reparte-as com os filhos (subgrelha). */
  linhas?: number
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...resto} className="ranked-moldura" data-bloqueada={bloqueada ? '' : undefined} style={linhas ? { display: 'grid', gridTemplateRows: 'subgrid', gridRow: `span ${linhas}` } : undefined}>
      <span aria-hidden className="ranked-canto ranked-canto-a" />
      <span aria-hidden className="ranked-canto ranked-canto-b" />
      <span aria-hidden className="ranked-canto ranked-canto-c" />
      <span aria-hidden className="ranked-canto ranked-canto-d" />
      <div className="ranked-cartao" style={linhas ? { display: 'grid', gridTemplateRows: 'subgrid', gridRow: '1 / -1', rowGap: 20 } : undefined}>
        <span aria-hidden className="ranked-topo" />
        <span aria-hidden className="ranked-calor" />
        {!bloqueada && (
          <span aria-hidden className="ranked-brasas">
            {BRASAS.filter((b) => !b.so || naFila).map((b) => (
              <span
                key={b.e}
                className={`ranked-brasa ${b.g ? 'ranked-brasa-g' : 'ranked-brasa-p'}`}
                style={{ left: `${b.e}%`, ['--dx' as string]: `${b.x}px`, animationDuration: `${b.d}s`, animationDelay: `${b.a}s` }}
              />
            ))}
          </span>
        )}
        {linhas
          ? <div className="relative" style={{ display: 'grid', gridTemplateRows: 'subgrid', gridRow: '1 / -1', rowGap: 20 }}>{children}</div>
          : <div className="relative flex flex-1 flex-col gap-5">{children}</div>}
      </div>
    </section>
  )
}

/** O tier de cada casa da escada: Ferro 1, Bronze 1... Ascendente 1, Imortal 1, Radiante. */
const CASAS = [3, 6, 9, 12, 15, 18, 21, 24, 27]

/**
 * A escada de ranks que aparece nos dois cartões: onde estás e que ranks a fila abrange. A aberta abrange todos;
 * a ranked só do Ascendente 1 para cima, e quem ainda não lá chega vê quantas divisões lhe faltam.
 */
export function EscadaRanks({ tier, tipo }: { tier: number; tipo: FilaTipo }) {
  const ranked = tipo === 'ranked'
  const sem = tier < 3
  const casa = sem ? -1 : tier >= 27 ? 8 : Math.floor((tier - 3) / 3)
  const faltam = TIER_MINIMO_RANKED - tier
  const inicio = ranked ? CASAS.indexOf(TIER_MINIMO_RANKED) : 0 // a ranked começa no Ascendente 1 (casa 6); a aberta na primeira
  const corMoldura = ranked ? '#ff5b1f' : 'rgba(255,255,255,0.38)'
  let texto: ReactNode
  if (sem) {
    texto = ranked
      ? l('Ainda não tens rank oficial no Valorant. A ranked começa em Ascendente 1.', 'You have no official Valorant rank yet. Ranked starts at Ascendant 1.')
      : l('Ainda não tens rank oficial no Valorant, mas a fila aberta é para todos: podes jogar já.', 'You have no official Valorant rank yet, but the open queue is for everyone: you can play now.')
  } else if (ranked && faltam > 0) {
    texto = <>{l('Estás a', 'You are')} <strong className="text-texto">{faltam} {faltam === 1 ? l('divisão', 'division') : l('divisões', 'divisions')}</strong> {l('da ranked', 'away from ranked')}: {nomeRank(tier)} → {nomeRank(TIER_MINIMO_RANKED)}.</>
  } else if (ranked) {
    texto = <>{l('Estás em', 'You are')} <strong className="text-texto">{nomeRank(tier)}</strong>: {l('já podes jogar na ranked.', 'you can play ranked.')}</>
  } else {
    texto = <>{l('Estás em', 'You are')} <strong className="text-texto">{nomeRank(tier)}</strong>: {l('a aberta é para todos os ranks, por isso podes jogar já.', 'the open queue is for every rank, so you can play now.')}</>
  }
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-white/7 bg-white/[0.03] p-3.5">
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1.5 font-mono text-[10px] tracking-[0.14em] text-mudo">
        <span>{l('O TEU RANK OFICIAL', 'YOUR OFFICIAL RANK')}</span>
        <span>{ranked ? l('A RANKED COMEÇA EM ASC 1', 'RANKED STARTS AT ASC 1') : l('A ABERTA ABRANGE TODOS OS RANKS', 'OPEN COVERS EVERY RANK')}</span>
      </div>
      <div className="grid grid-cols-9 gap-1 font-mono text-[10px] font-semibold tracking-[0.04em]" style={{ gridTemplateRows: 'auto auto auto' }}>
        {casa >= 0 && (
          <span className="mb-1 justify-self-center rounded bg-laranja px-1.5 py-0.5 text-[9.5px] font-bold text-escuro-laranja" style={{ gridRow: 1, gridColumn: casa + 1 }}>{l('TU', 'YOU')}</span>
        )}
        {CASAS.map((t, i) => {
          const cor = corRank(t)
          const aqui = i === casa
          const dentro = i >= inicio
          return (
            <span
              key={t}
              className="grid h-[34px] place-items-center rounded-lg"
              style={{
                gridRow: 2, gridColumn: i + 1, color: cor,
                border: `${aqui ? 1.5 : 1}px solid ${aqui ? cor : dentro ? `${cor}8c` : 'rgba(255,255,255,0.08)'}`,
                background: aqui ? `${cor}29` : dentro ? `${cor}24` : 'rgba(255,255,255,0.03)',
              }}
            >
              {siglaRank(t).slice(0, 3)}
            </span>
          )
        })}
        <span aria-hidden className="mt-0.5 h-1.5 rounded-b border-[1.5px] border-t-0" style={{ gridRow: 3, gridColumn: `${inicio + 1} / span ${CASAS.length - inicio}`, borderColor: corMoldura }} />
      </div>
      <p className="m-0 text-[13px] leading-normal text-suave">{texto}</p>
    </div>
  )
}

/**
 * O cartão de uma fila, igual no Painel e na página Jogar: anel com os lugares, o que a fila é, a escada de ranks, o botão e,
 * por baixo, o `rodape` se houver.
 * A aberta é um cartão normal; a ranked tem a moldura laranja. Os dois têm a escada de ranks e o botão encostado ao fundo,
 * por isso, lado a lado, ficam com a mesma altura e o botão à mesma altura nos dois.
 */
export function CartaoFila({ tipo, rodape, id, alinhada = false }: {
  tipo: FilaTipo; rodape?: ReactNode; id: string
  /** Dentro de uma grelha com dois cartões: cada bloco (título, escada, etiquetas, botão) fica na mesma linha nos dois, seja qual for o texto. */
  alinhada?: boolean
}) {
  const v = useVistaFila(tipo)
  const { perfil } = useSessao()
  const rotacao = useCarregar(() => dados.poolMapas(), [], ['staff'], { chave: 'pool_mapas', fresco: 300_000 })
  const ranked = tipo === 'ranked'
  const linhas = alinhada ? 5 + (rodape ? 1 : 0) : undefined
  const faltam = 10 - v.contagem
  const fechada = v.fechada && !v.naFila
  const modo = v.bloqueada || fechada ? 'bloqueada' : v.naOutra ? 'ocupada' : 'livre'
  const chip = 'inline-flex h-[30px] items-center rounded-[9px] border border-white/8 bg-white/[0.035] px-3 text-[12.5px] text-[#d0cbc4]'

  let legenda = l('À ESPERA DE TI', 'WAITING FOR YOU')
  if (v.naFila) legenda = `${l('NA FILA', 'IN QUEUE')} ${relogio(v.espera)}`
  else if (fechada) legenda = l('FECHADA', 'CLOSED')
  else if (v.bloqueada) legenda = l('BLOQUEADA', 'LOCKED')
  else if (v.naOutra) legenda = l('NOUTRA FILA', 'IN OTHER QUEUE')
  else if (v.ban) legenda = l('BANIDO', 'BANNED')
  else if (v.castigo > 0) legenda = `${l('CASTIGO', 'COOLDOWN')} ${relogio(v.castigo)}`

  let descricao: string
  if (fechada) {
    descricao = l(`A fila ${ranked ? 'ranked' : 'aberta'} está fechada de momento.${v.motivoFecho ? ` ${v.motivoFecho}` : ' Volta daqui a pouco.'}`, `The ${ranked ? 'ranked' : 'open'} queue is closed for now.${v.motivoFecho ? ` ${v.motivoFecho}` : ' Check back soon.'}`)
  } else if (v.ban && !v.bloqueada) {
    descricao = l(`Estás banido da fila ${textoDuracaoBan(v.ban)}.${v.ban.mensagem ? ` Motivo: ${v.ban.mensagem}` : ''}`, `You are banned from the queue ${textoDuracaoBan(v.ban)}.${v.ban.mensagem ? ` Reason: ${v.ban.mensagem}` : ''}`)
  } else if (v.castigo > 0 && !v.bloqueada && !v.naOutra) {
    descricao = l(`Não aceitaste a última partida. Podes voltar à fila daqui a ${relogio(v.castigo)}.`, `You did not accept the last match. You can queue again in ${relogio(v.castigo)}.`)
  } else if (v.naFila) {
    descricao = l(`Faltam ${faltam} ${faltam === 1 ? 'jogador' : 'jogadores'} da tua região. Podes andar pelo site: quando a sala encher, ouves um som e aparece o alerta para aceitar.`, `${faltam} ${faltam === 1 ? 'player' : 'players'} from your region to go. You can browse the site: when the lobby fills, you hear a sound and the accept alert shows up.`)
  } else if (v.naOutra) {
    descricao = l('Estás noutra fila neste momento. Uma fila de cada vez.', 'You are in the other queue right now. One queue at a time.')
  } else if (v.bloqueada) {
    descricao = l('Só Ascendente 1 ou mais. Precisas de subir o rank oficial para entrares. Até lá, joga na fila aberta.', 'Ascendant 1 or higher only. You need to climb your official rank to join. Until then, play the open queue.')
  } else if (ranked) {
    descricao = l('Só Ascendente 1 ou mais. Partidas entre jogadores de topo, com os pontos na Tabela Ranked.', 'Ascendant 1 or higher only. Matches between top players, with points on the Ranked leaderboard.')
  } else {
    descricao = l('Qualquer rank, de Ferro a Radiante. Sem requisitos: entra e joga com quem estiver à espera. Os pontos vão para a Tabela Aberta.', 'Any rank, from Iron to Radiant. No requirements: join and play with whoever is waiting. Points go to the Open leaderboard.')
  }

  let ajuda: string
  if (v.naFila) ajuda = l(`Tens ${SEGUNDOS_CONFIRMAR} segundos para aceitar quando a sala encher.`, `You have ${SEGUNDOS_CONFIRMAR} seconds to accept when the lobby fills.`)
  else if (fechada) ajuda = ranked ? l('Podes jogar na fila aberta, se estiver aberta.', 'You can play the open queue, if it is open.') : l('Podes jogar na fila ranked, se estiver aberta e tiveres o rank.', 'You can play the ranked queue, if it is open and you have the rank.')
  else if (v.bloqueada) ajuda = l('O rank vem da Riot e atualiza depois de cada partida.', 'The rank comes from Riot and updates after each match.')
  else if (v.naOutra) ajuda = l('Sai da outra fila para entrares aqui.', 'Leave the other queue to join this one.')
  else ajuda = l(`${v.contagem} ${v.contagem === 1 ? 'jogador está' : 'jogadores estão'} à espera.`, `${v.contagem} ${v.contagem === 1 ? 'player is' : 'players are'} waiting.`)

  const corpo = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="eyebrow">{ranked ? l('FILA RANKED', 'RANKED QUEUE') : l('FILA ABERTA', 'OPEN QUEUE')} · {v.regiao}</span>
        {ranked
          ? <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full border border-laranja/45 bg-laranja/14 px-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-pessego-claro"><ChevronsUp size={13} strokeWidth={2.6} aria-hidden />ASC 1+</span>
          : <span className="inline-flex h-[26px] items-center rounded-full border border-white/12 bg-white/[0.04] px-2.5 font-mono text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap text-[#d0cbc4]">{l('TODOS OS RANKS', 'ALL RANKS')}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-[26px] gap-y-5">
        <AnelFila tamanho={168} contagem={v.contagem} naFila={v.naFila} legenda={legenda} modo={modo} />
        <div className="flex min-w-[min(180px,100%)] flex-1 flex-col gap-2.5">
          <h2 id={id} className="m-0 text-[30px] leading-[1.05] font-extrabold tracking-[-0.035em]">{ranked ? l('Fila ranked', 'Ranked queue') : l('Fila aberta', 'Open queue')}</h2>
          <p className="m-0 text-[14px] leading-[1.55] text-suave">{descricao}</p>
        </div>
      </div>

      {perfil ? <EscadaRanks tier={perfil.tier} tipo={tipo} /> : alinhada ? <div aria-hidden /> : null}

      <div className="flex flex-wrap gap-2">
        <span className={chip}>{SEGUNDOS_CONFIRMAR} s {l('para aceitar', 'to accept')}</span>
        <span className={chip}>{l('2 capitães', '2 captains')} · {(rotacao.valor ?? ROTACAO_PADRAO).length} {l('mapas', 'maps')}</span>
        <span className="inline-flex h-[30px] items-center rounded-[9px] border border-laranja/32 bg-laranja/12 px-3 text-[12.5px] text-pessego-claro">{l(`Pontos na Tabela ${nomeTabela(tipo)}`, `Points on the ${nomeTabela(tipo)} leaderboard`)}</span>
      </div>

      {/* O texto vai sempre por baixo do botão, com duas linhas de altura reservadas: assim o botão fica à mesma altura nos dois cartões. */}
      <div className="mt-auto flex flex-col items-start gap-2.5 pt-1">
        <BotaoFila tipo={tipo} grande />
        <span className="min-h-[38px] text-[13px] leading-[1.45] text-mudo">{ajuda}</span>
      </div>
      {rodape}
    </>
  )

  if (ranked) {
    return <MoldeRanked aria-labelledby={id} bloqueada={v.bloqueada || fechada} naFila={v.naFila} linhas={linhas}>{corpo}</MoldeRanked>
  }
  return (
    <section
      aria-labelledby={id}
      className={`painel p-[26px] ${linhas ? '' : 'flex flex-1 flex-col gap-5'} ${v.naFila ? '!border-laranja/50 shadow-[0_24px_70px_-34px_rgba(255,91,31,0.55)]' : ''}`}
      style={linhas ? { display: 'grid', gridTemplateRows: 'subgrid', gridRow: `span ${linhas}`, rowGap: 20 } : undefined}
    >
      {corpo}
    </section>
  )
}
