import { Ban, Check, Lightbulb, Shield, Swords } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAcao } from '@/contexts/Avisos'
import { usePartida } from '@/contexts/Partida'
import { useAgora } from '@/hooks/useAgora'
import { dados, type JogadorPartida, type Lado, type Partida } from '@/lib/data'
import { MAPAS, equipaDoBan, mapasDaPool, totalBans } from '@/lib/mapas'
import { capitao, nomeJogador, vezDe } from '@/lib/partida'
import { SEGUNDOS_BAN, SEGUNDOS_LADO } from '@/lib/regras'
import { emFalta } from '@/lib/tempo'
import { Relogio } from './Relogio'
import { Iniciais } from './comum'
import { l } from '@/lib/idioma'

export const nomeLado = (lado: Lado) => (lado === 'ataque' ? l('Ataque', 'Attack') : l('Defesa', 'Defence'))

/** Quem da equipa sugeriu este mapa (ou lado): as caras pequenas, por cima do cartão. */
function Sugeridos({ quem }: { quem: JogadorPartida[] }) {
  if (!quem.length) return null
  return (
    <span className="absolute top-3 right-3 z-[2] inline-flex items-center gap-1 rounded-full border border-laranja/50 bg-[rgba(9,9,11,0.78)] py-0.5 pr-2 pl-0.5" title={quem.map(nomeJogador).join(', ')}>
      <span className="flex -space-x-1.5">{quem.slice(0, 3).map((j) => <Iniciais key={j.perfilId} nome={nomeJogador(j)} equipa={j.equipa} tamanho={20} url={j.avatarUrl} />)}</span>
      <span className="font-mono text-[10.5px] font-bold text-pessego">{quem.length}</span>
      <span className="so-leitores">{l(`${quem.length} sugestões`, `${quem.length} suggestions`)}</span>
    </span>
  )
}

/** O botão de um cartão: BANIR/ESCOLHER para o capitão, SUGERIR para os colegas. */
function BotaoCartao({ onClick, icone, texto, ativo = false, aria }: { onClick: () => void; icone: ReactNode; texto: string; ativo?: boolean; aria: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={aria}
      aria-pressed={ativo}
      className={`flex h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border text-[14px] font-extrabold tracking-[0.08em] transition-colors ${ativo ? 'border-laranja bg-laranja text-escuro-laranja' : 'border-laranja/55 bg-laranja/18 text-pessego-claro hover:bg-laranja hover:text-escuro-laranja'}`}
    >
      {icone}{texto}
    </button>
  )
}

export function Mapas({ p, eu }: { p: Partida; eu: string }) {
  const acao = useAcao()
  const { atualizar } = usePartida()
  const agora = useAgora(250)
  const [aFazer, setAFazer] = useState<string | null>(null)
  const ladoAgora = !!p.mapa && !!p.lado && !p.lado.escolha
  const vez = vezDe(p) ?? 'A'
  const cap = capitao(p, vez)
  const souCapitao = cap?.perfilId === eu && !p.automatica
  const minha = p.jogadores.find((j) => j.perfilId === eu)
  // Os colegas do capitão que está a decidir podem sugerir; a outra equipa só vê.
  const possoSugerir = !p.automatica && !souCapitao && minha?.equipa === vez
  const n = p.bans.length
  // Só entram nos bans os mapas que estavam na rotação quando a partida nasceu.
  const pool = mapasDaPool(p.pool)
  const bans = totalBans(p.pool)
  const sugeridoPor = (valor: string) => p.sugestoes.filter((s) => s.valor === valor).map((s) => p.jogadores.find((j) => j.perfilId === s.perfilId)).filter((j): j is JogadorPartida => !!j)
  const minhaSugestao = p.sugestoes.find((s) => s.perfilId === eu)?.valor ?? null

  const fazer = async (chave: string, f: () => Promise<void>) => {
    setAFazer(chave)
    await acao(f)
    await atualizar()
    setAFazer(null)
  }
  const nomeCap = cap ? nomeJogador(cap) : l('O capitão', 'The captain')
  const decisivo = p.mapa ? MAPAS.find((m) => m.nome === p.mapa) : null

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-labelledby="rg-ban-titulo" className="painel flex flex-col gap-[18px] px-[22px] py-5">
        <div className="flex min-w-0 items-center gap-[18px]">
          <Relogio restante={emFalta(p.prazoFase, agora)} total={ladoAgora ? SEGUNDOS_LADO : SEGUNDOS_BAN} tamanho={84} cor={vez === 'A' ? '#ff5b1f' : '#e6e1da'} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={`font-mono text-[11px] font-bold tracking-[0.16em] ${vez === 'A' ? 'text-laranja' : 'text-marfim'}`}>
              {ladoAgora ? l(`LADO · EQUIPA ${vez} · ${p.mapa?.toUpperCase()}`, `SIDE · TEAM ${vez} · ${p.mapa?.toUpperCase()}`) : l(`BAN ${n + 1} DE ${bans} · EQUIPA ${vez}`, `BAN ${n + 1} OF ${bans} · TEAM ${vez}`)}
            </span>
            <h1 id="rg-ban-titulo" className="m-0 text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em]">
              {ladoAgora
                ? souCapitao ? l('Escolhe o lado em que começas', 'Pick the side you start on') : l(`${nomeCap} está a escolher o lado`, `${nomeCap} is picking the side`)
                : souCapitao ? l('Escolhe um mapa para banir', 'Pick a map to ban') : l(`${nomeCap} está a banir um mapa`, `${nomeCap} is banning a map`)}
            </h1>
            <span className="text-[13.5px] text-[#a6a19a]">
              {ladoAgora
                ? l('A equipa que não fez o último ban escolhe se começa a atacar ou a defender.', 'The team that did not make the last ban picks whether it starts on attack or defence.')
                : l('Os capitães banem à vez. O mapa que sobrar é o da partida.', 'The captains ban in turns. The map left over is the match map.')}
              {' '}
              {souCapitao && l('A tua equipa pode sugerir; tu decides.', 'Your team can suggest; you decide.')}
              {possoSugerir && l(`Sugere ao ${nomeCap}: ele vê as sugestões da equipa. Se o tempo acabar, vale a mais votada.`, `Suggest to ${nomeCap}: they see the team's suggestions. If time runs out, the most voted goes.`)}
            </span>
          </div>
        </div>
        <div role="list" aria-label={l('Ordem dos bans', 'Ban order')} className="flex flex-wrap gap-1.5 border-t border-white/7 pt-4">
          {Array.from({ length: bans + 1 }, (_, i) => {
            const b = p.bans[i]
            const ehDecisivo = i === bans
            const mapa = b ? MAPAS.find((m) => m.nome === b.mapa) : ehDecisivo ? decisivo : null
            const atual = i === n && !ladoAgora
            return (
              <div key={i} role="listitem" className="flex w-[58px] flex-col items-center gap-1.5">
                <span
                  className="mapa relative grid h-[38px] w-[58px] place-items-center overflow-hidden rounded-[8px] border font-mono text-[11px] font-bold"
                  style={{
                    backgroundImage: mapa ? `url(${mapa.imagem})` : undefined,
                    borderColor: atual ? '#ff5b1f' : ehDecisivo ? 'rgba(255,91,31,0.6)' : 'rgba(255,255,255,0.1)',
                    filter: mapa && !ehDecisivo ? 'grayscale(1) brightness(0.55)' : undefined,
                    borderStyle: mapa || atual ? 'solid' : 'dashed',
                  }}
                >
                  {!mapa && <span className={atual ? 'text-pessego' : 'text-mudo'}>{ehDecisivo ? '?' : equipaDoBan(i)}</span>}
                </span>
                <span className={`max-w-full truncate font-mono text-[9px] tracking-[0.06em] ${atual || (ehDecisivo && mapa) ? 'text-pessego' : 'text-mudo'}`}>
                  {ehDecisivo ? (mapa ? mapa.nome.toUpperCase() : l('DECISIVO', 'DECIDER')) : mapa ? mapa.nome.toUpperCase() : `BAN ${i + 1}`}
                </span>
              </div>
            )
          })}
          <div role="listitem" className="flex w-[58px] flex-col items-center gap-1.5">
            <span className={`grid h-[38px] w-[58px] place-items-center rounded-[8px] border ${ladoAgora ? 'border-laranja text-pessego' : 'border-dashed border-white/10 text-mudo'}`}>
              <Swords size={15} aria-hidden />
            </span>
            <span className={`font-mono text-[9px] tracking-[0.06em] ${ladoAgora ? 'text-pessego' : 'text-mudo'}`}>{l('LADO', 'SIDE')}</span>
          </div>
        </div>
      </section>

      {ladoAgora ? (
        <section aria-label={l('Escolha do lado', 'Side pick')} className="ban-linha">
          {(['ataque', 'defesa'] as const).map((lado) => {
            const quem = sugeridoPor(lado)
            const ativo = souCapitao || possoSugerir
            return (
              <div key={lado} className={`ban-cartao ${ativo ? 'ban-livre' : 'ban-banido'}`}>
                {decisivo && <span aria-hidden className="ban-fundo mapa" style={{ backgroundImage: `url(${decisivo.imagem})`, filter: lado === 'defesa' ? 'grayscale(0.6) brightness(0.8)' : undefined }} />}
                <span aria-hidden className="absolute inset-0" style={{ background: lado === 'ataque' ? 'linear-gradient(180deg, rgba(255,91,31,0.35) 0%, rgba(9,9,11,0.2) 40%, rgba(9,9,11,0.94) 100%)' : 'linear-gradient(180deg, rgba(230,225,218,0.22) 0%, rgba(9,9,11,0.2) 40%, rgba(9,9,11,0.94) 100%)' }} />
                <Sugeridos quem={quem} />
                <span aria-hidden className="absolute top-[38%] left-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white/60 bg-[rgba(9,9,11,0.45)] text-white">
                  {lado === 'ataque' ? <Swords size={26} /> : <Shield size={26} />}
                </span>
                <span aria-hidden className="ban-vertical">{nomeLado(lado)}</span>
                <div className="ban-aberto">
                  <span className="max-w-full truncate text-[clamp(20px,2.2vw,30px)] leading-[0.95] font-black tracking-[-0.03em] uppercase">{nomeLado(lado)}</span>
                  <span className="font-mono text-[10.5px] font-bold tracking-[0.12em] text-pessego">
                    {l(`A EQUIPA ${vez} COMEÇA A ${lado === 'ataque' ? 'ATACAR' : 'DEFENDER'}`, `TEAM ${vez} STARTS ON ${lado === 'ataque' ? 'ATTACK' : 'DEFENCE'}`)}
                  </span>
                  {souCapitao && (
                    <BotaoCartao onClick={() => fazer(lado, () => dados.escolherLado(p.id, lado))} icone={<Check size={16} aria-hidden />} texto={aFazer === lado ? l('A ESCOLHER…', 'PICKING…') : l('ESCOLHER', 'PICK')} aria={`${l('Escolher', 'Pick')} ${nomeLado(lado)}`} />
                  )}
                  {possoSugerir && (
                    <BotaoCartao onClick={() => fazer(lado, () => dados.sugerirMapa(p.id, lado))} ativo={minhaSugestao === lado} icone={<Lightbulb size={16} aria-hidden />} texto={minhaSugestao === lado ? l('SUGERIDO', 'SUGGESTED') : l('SUGERIR', 'SUGGEST')} aria={`${l('Sugerir', 'Suggest')} ${nomeLado(lado)}`} />
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ) : (
        <section aria-label={l('Mapas da rotação', 'Maps in rotation')} className="ban-linha">
          {pool.map((m) => {
            const ban = p.bans.find((b) => b.mapa === m.nome)
            const ehDecisivo = !!p.mapa && p.mapa === m.nome
            const livre = !ban && !ehDecisivo
            const classe = ehDecisivo ? 'ban-decisivo' : ban ? 'ban-banido' : 'ban-livre'
            const quem = livre ? sugeridoPor(m.nome) : []
            return (
              <div key={m.nome} className={`ban-cartao ${classe}`}>
                <span aria-hidden className="ban-fundo mapa" style={{ backgroundImage: `url(${m.imagem})` }} />
                <span aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.45) 0%, rgba(9,9,11,0.08) 32%, rgba(9,9,11,0.35) 60%, rgba(9,9,11,0.94) 100%)' }} />
                <span className="ban-locais absolute top-3 left-3 inline-flex h-6 items-center rounded-[7px] border border-white/16 bg-[rgba(9,9,11,0.62)] px-2 font-mono text-[10.5px] font-semibold text-marfim">{m.locais}</span>
                <Sugeridos quem={quem} />
                {ban && (
                  <span aria-hidden className="absolute top-[40%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                    <span className="grid size-10 place-items-center rounded-full border-2 border-white/70 bg-[rgba(9,9,11,0.4)] text-white"><Ban size={20} /></span>
                    <span className="font-mono text-[10px] font-extrabold tracking-[0.08em] whitespace-nowrap text-pessego-claro">{l('EQUIPA', 'TEAM')} {ban.equipa}</span>
                  </span>
                )}
                <span aria-hidden className="ban-vertical">{m.nome}</span>
                <div className="ban-aberto">
                  <span className="max-w-full truncate text-[clamp(20px,2.2vw,30px)] leading-[0.95] font-black tracking-[-0.03em] uppercase">{m.nome}</span>
                  <span className={`font-mono text-[10.5px] font-bold tracking-[0.12em] ${ban ? 'text-mudo' : 'text-pessego'}`}>
                    {ehDecisivo ? l('MAPA DA PARTIDA', 'MATCH MAP') : ban ? l(`BANIDO PELA EQUIPA ${ban.equipa}`, `BANNED BY TEAM ${ban.equipa}`) : souCapitao ? l('É A TUA VEZ', 'YOUR TURN') : l('DISPONÍVEL', 'AVAILABLE')}
                  </span>
                  {livre && souCapitao && !aFazer && (
                    <BotaoCartao onClick={() => fazer(m.nome, () => dados.banirMapa(p.id, m.nome))} icone={<Ban size={16} aria-hidden />} texto={l('BANIR', 'BAN')} aria={`${l('Banir', 'Ban')} ${m.nome}`} />
                  )}
                  {livre && souCapitao && aFazer === m.nome && <span className="font-mono text-[12px] font-bold text-pessego">{l('A BANIR…', 'BANNING…')}</span>}
                  {livre && possoSugerir && (
                    <BotaoCartao onClick={() => fazer(m.nome, () => dados.sugerirMapa(p.id, m.nome))} ativo={minhaSugestao === m.nome} icone={<Lightbulb size={16} aria-hidden />} texto={minhaSugestao === m.nome ? l('SUGERIDO', 'SUGGESTED') : l('SUGERIR BAN', 'SUGGEST BAN')} aria={`${l('Sugerir banir', 'Suggest banning')} ${m.nome}`} />
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}
      <p className="m-0 text-[13px] text-mudo">
        {ladoAgora
          ? l('Se o tempo acabar, vale o lado mais sugerido pela equipa, ou um ao calhas.', 'If time runs out, the side most suggested by the team goes, or a random one.')
          : <>{(souCapitao || possoSugerir) && <span className="so-hover">{l('Para o rato num mapa para o abrir. ', 'Hover a map to open it. ')}</span>}{l('Os mapas banidos ficam a cinzento; o que sobrar é o da partida.', 'Banned maps turn grey; the one left over is the match map.')}</>}
      </p>
    </div>
  )
}
