import { Activity, CircleCheck, Cpu, Database, Gauge, HardDrive, Hourglass, Lock, MemoryStick, ServerCrash, Timer, TriangleAlert, Users, Zap } from 'lucide-react'
import { useState } from 'react'
import { Carregando, Chip, Painel, Segmentado, TituloPainel, Vazio } from '@/components/ui'
import { useCarregar } from '@/hooks/useCarregar'
import { useIntervalo } from '@/hooks/useVisivel'
import { dados, type BatimentoSaude, type CenarioSaude, type EstadoSaude, type IncidenteSaude, type MonitorSaude, type MotivoSaude, type PeriodoSaude, type Saude } from '@/lib/data'
import { l as tx } from '@/lib/idioma'
import { MONITORES, NIVEL_SAUDE, corSaude, descreverMotivo, descricaoMonitor, fraseSaude, nomeMonitor, nomeSaude, tomSaude } from '@/lib/saude'
import { dataHora, haQuanto } from '@/lib/tempo'
import { GraficoSaude } from './GraficoSaude'

const PERIODOS: PeriodoSaude[] = ['1h', '24h', '7d', '30d']

/** "14 min", "2 h 5 min", "3 d 4 h". */
function duracao(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

const COR_BORDA = { vitoria: 'border-vitoria/25', ouro: 'border-ouro/40 bg-ouro/[0.03]', derrota: 'border-derrota/40 bg-derrota/[0.035]' } as const
const COR_TEXTO = { vitoria: 'text-vitoria', ouro: 'text-ouro', derrota: 'text-derrota' } as const
const COR_ICONE = { vitoria: 'border-vitoria/30 bg-vitoria/10 text-vitoria', ouro: 'border-ouro/35 bg-ouro/10 text-ouro', derrota: 'border-derrota/35 bg-derrota/10 text-derrota' } as const

const ICONE_ESTADO = { ok: CircleCheck, lento: Hourglass, sobrecarga: Gauge, em_baixo: ServerCrash } as const

/** O cartaz de cima: o estado de agora numa frase, desde quando e a que ponto está a confirmação. */
function Cartaz({ s }: { s: Saude }) {
  const tom = tomSaude(s.estado)
  const Icone = ICONE_ESTADO[s.estado]
  const legenda = s.aConfirmar
    ? tx('Uma verificação correu mal. A confirmar com a próxima antes de dar o alarme.', 'One check went wrong. Confirming with the next one before raising the alarm.')
    : s.aRecuperar
      ? tx('Já está melhor. A confirmar que a recuperação se mantém.', 'It is better now. Confirming the recovery holds.')
      : s.estado !== 'ok' && s.desde
        ? tx(`Desde ${haQuanto(s.desde)}.`, `Since ${haQuanto(s.desde)}.`)
        : s.amostraEm ? tx('Sem motivos de preocupação neste momento.', 'Nothing to worry about right now.') : tx('Ainda não há nenhuma verificação.', 'There are no checks yet.')
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-[16px] border p-5 ${COR_BORDA[tom]}`}>
      <span className={`grid size-14 shrink-0 place-items-center rounded-[16px] border ${COR_ICONE[tom]}`}><Icone size={28} aria-hidden /></span>
      <span className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className={`text-[clamp(22px,3vw,30px)] leading-tight font-extrabold tracking-[-0.03em] ${COR_TEXTO[tom]}`}>{fraseSaude(s.estado)}</span>
        <span className="text-[13.5px] text-suave">{legenda}</span>
      </span>
      <span className="flex flex-col items-start gap-1.5 sm:items-end">
        <Chip tom={tom}>{nomeSaude(s.estado)}</Chip>
        {s.amostraEm && <span className="font-mono text-[11.5px] text-mudo">{tx('última verificação', 'last check')} {haQuanto(s.amostraEm)}</span>}
      </span>
    </div>
  )
}

/** Um aviso por cima dos números, quando falta alguma coisa para o monitor funcionar como deve. */
function Aviso({ tom = 'laranja', titulo, children }: { tom?: 'laranja' | 'derrota'; titulo: string; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-[14px] border p-3.5 ${tom === 'derrota' ? 'border-derrota/35 bg-derrota/[0.04]' : 'border-laranja/30 bg-laranja/[0.05]'}`}>
      <TriangleAlert size={18} className={`mt-0.5 shrink-0 ${tom === 'derrota' ? 'text-derrota' : 'text-laranja'}`} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13.5px] font-bold">{titulo}</span>
        <span className="text-[12.5px] leading-[1.55] text-suave">{children}</span>
      </div>
    </div>
  )
}

function CartaoMotivo({ m }: { m: MotivoSaude }) {
  const t = descreverMotivo(m)
  const tom = m.nivel === 'lento' ? 'ouro' : 'derrota'
  return (
    <article className={`flex flex-col gap-2 rounded-[14px] border p-3.5 ${tom === 'ouro' ? 'border-ouro/30 bg-ouro/[0.03]' : 'border-derrota/30 bg-derrota/[0.035]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-[14.5px] font-bold">{t.titulo}</span>
        {t.valor && <span className={`font-mono text-[18px] leading-none font-semibold ${COR_TEXTO[tom]}`}>{t.valor}</span>}
      </div>
      {t.limite && <span className="font-mono text-[11px] text-mudo">{t.limite}</span>}
      {t.explicacao && <p className="m-0 text-[12.5px] leading-[1.55] text-suave">{t.explicacao}</p>}
      {t.pista && <p className="m-0 text-[12.5px] leading-[1.55] text-mudo"><span className="font-semibold text-pessego">{tx('Pista: ', 'Hint: ')}</span>{t.pista}</p>}
    </article>
  )
}

function Leitura({ icone, nome, valor, sub, parte, nivel }: { icone: React.ReactNode; nome: string; valor: string; sub?: string; parte?: number | null; nivel?: MotivoSaude['nivel'] }) {
  const tom = nivel === 'lento' ? 'ouro' : nivel ? 'derrota' : 'vitoria'
  return (
    <Painel as="div" className="flex flex-col gap-2.5 !rounded-[14px] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-laranja/32 bg-laranja/12 text-laranja">{icone}</span>
        <span className="flex min-w-0 flex-col">
          <span className="font-mono text-[20px] leading-none font-semibold">{valor}</span>
          <span className="truncate text-[12px] text-mudo">{nome}</span>
        </span>
      </div>
      {parte != null && (
        <span className="h-1.5 overflow-hidden rounded-full bg-white/8">
          <span className={`block h-full rounded-full ${tom === 'vitoria' ? 'bg-laranja' : tom === 'ouro' ? 'bg-ouro' : 'bg-derrota'}`} style={{ width: `${Math.min(100, Math.max(2, parte))}%` }} />
        </span>
      )}
      {sub && <span className="text-[11.5px] text-mudo">{sub}</span>}
    </Painel>
  )
}

const numero = (v: number | null | undefined, u = '') => (v === null || v === undefined ? '-' : `${Math.round(v * 10) / 10}${u}`)

function Leituras({ s, rtt }: { s: Saude; rtt: number | null }) {
  const a = s.agora
  if (!a) return null
  const nivel = (...codigos: string[]) => s.motivos.find((m) => codigos.includes(m.codigo))?.nivel
  const pct = a.ligacoes != null && a.ligacoesMax ? (a.ligacoes / a.ligacoesMax) * 100 : null
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-3">
      <Leitura icone={<Cpu size={17} aria-hidden />} nome={tx('CPU do servidor', 'Server CPU')} valor={numero(a.cpu, '%')} parte={a.cpu} nivel={nivel('cpu', 'carga')} sub={a.cpu === null ? tx('Precisa de duas leituras do servidor', 'Needs two server readings') : undefined} />
      <Leitura icone={<MemoryStick size={17} aria-hidden />} nome={tx('Memória', 'Memory')} valor={numero(a.ram, '%')} parte={a.ram} nivel={nivel('ram')} />
      <Leitura icone={<HardDrive size={17} aria-hidden />} nome={tx('Disco', 'Disk')} valor={numero(a.disco, '%')} parte={a.disco} nivel={nivel('disco')} />
      <Leitura icone={<Database size={17} aria-hidden />} nome={tx('Ligações à BD', 'DB connections')} valor={a.ligacoes != null ? `${a.ligacoes}/${a.ligacoesMax}` : '-'} parte={pct} nivel={nivel('ligacoes', 'pool_api')} />
      <Leitura icone={<Timer size={17} aria-hidden />} nome={tx('Consultas a correr', 'Running queries')} valor={numero(a.ativas)} nivel={nivel('consulta_lenta')} sub={a.maisLentaS != null ? tx(`a mais longa: ${numero(a.maisLentaS)} s`, `longest: ${numero(a.maisLentaS)} s`) : undefined} />
      <Leitura icone={<Lock size={17} aria-hidden />} nome={tx('À espera de bloqueios', 'Waiting on locks')} valor={numero(a.bloqueadas)} nivel={nivel('bloqueios')} />
      <Leitura icone={<Users size={17} aria-hidden />} nome={tx('Na fila agora', 'In the queue now')} valor={numero(a.fila)} sub={tx(`${numero(a.partidas)} partidas a decorrer, ${numero(a.partidasParadas)} paradas`, `${numero(a.partidas)} matches running, ${numero(a.partidasParadas)} stalled`)} nivel={nivel('partidas_paradas')} />
      <Leitura icone={<Zap size={17} aria-hidden />} nome={tx('Resposta até ti', 'Response to you')} valor={rtt === null ? '-' : `${rtt} ms`} sub={tx('Este pedido, do teu browser ao servidor', 'This request, from your browser to the server')} />
    </div>
  )
}

/** A barra de batimentos do Uptime Kuma: uma barra por verificação, as mais recentes à direita. */
function Batimentos({ lista, avisoMs }: { lista: BatimentoSaude[]; avisoMs: number }) {
  const vazios = Math.max(0, 60 - lista.length)
  return (
    <div className="flex h-8 w-full min-w-0 items-end gap-[3px]" role="img" aria-label={tx('Últimas 60 verificações', 'Last 60 checks')}>
      {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} className="h-full min-w-[2px] flex-1 rounded-[2px] bg-white/[0.06]" />)}
      {lista.map((b, i) => {
        const lento = b.ok && b.ms !== null && b.ms >= avisoMs
        return (
          <span
            key={i}
            title={`${dataHora(b.em)}: ${b.ok ? `${b.ms} ms` : tx('falhou', 'failed')}`}
            className={`h-full min-w-[2px] flex-1 rounded-[2px] ${!b.ok ? 'bg-derrota' : lento ? 'bg-ouro' : 'bg-vitoria'}`}
          />
        )
      })}
    </div>
  )
}

/** O estado de um monitor pelo último batimento; sem batimento recente (3 minutos) não se sabe. */
function estadoMonitor(m: MonitorSaude): EstadoSaude | 'sem_dados' {
  const ultimo = m.ultimos[m.ultimos.length - 1]
  if (!ultimo || (m.idadeS ?? 0) > 180) return 'sem_dados'
  if (!ultimo.ok) return 'em_baixo'
  return ultimo.ms !== null && ultimo.ms >= m.avisoMs ? 'lento' : 'ok'
}

function Monitores({ s }: { s: Saude }) {
  if (!s.monitores.length) return null
  return (
    <div className="flex flex-col gap-2.5">
      <TituloPainel eyebrow={tx('VERIFICAÇÕES', 'CHECKS')} titulo={tx('O que está a ser medido', 'What is being measured')} direita={<span className="text-[12px] text-mudo">{tx('De minuto a minuto, a partir do Supabase.', 'Every minute, from Supabase.')}</span>} />
      {MONITORES.map((id) => {
        const m = s.monitores.find((x) => x.id === id)
        if (!m) return null
        const estado = estadoMonitor(m)
        const ultimo = m.ultimos[m.ultimos.length - 1]
        return (
          <div key={id} className="grid grid-cols-1 items-center gap-x-5 gap-y-2.5 rounded-[14px] border border-white/8 bg-white/[0.02] p-3.5 lg:grid-cols-[minmax(0,230px)_minmax(0,1fr)_auto]">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2"><span className="text-[14.5px] font-bold">{nomeMonitor(id)}</span><Chip tom={estado === 'sem_dados' ? 'neutro' : tomSaude(estado)}>{estado === 'sem_dados' ? tx('Sem dados', 'No data') : nomeSaude(estado)}</Chip></span>
              <span className="text-[12px] text-mudo">{!ultimo?.ok && m.detalhe ? m.detalhe : descricaoMonitor(id)}</span>
            </span>
            <Batimentos lista={m.ultimos} avisoMs={m.avisoMs} />
            <span className="flex items-center gap-4 font-mono text-[12px] text-mudo">
              <span className="flex flex-col"><span className="text-[15px] font-semibold text-texto">{ultimo?.ms != null ? `${ultimo.ms} ms` : '-'}</span>{tx('agora', 'now')}</span>
              <span className="flex flex-col"><span className="text-[15px] font-semibold text-texto">{m.mediaMs != null ? `${m.mediaMs} ms` : '-'}</span>{tx('média 24 h', '24 h avg')}</span>
              <span className="flex flex-col"><span className="text-[15px] font-semibold text-texto">{m.disponibilidade24h != null ? `${m.disponibilidade24h}%` : '-'}</span>{tx('24 h', '24 h')} / {m.disponibilidade7d != null ? `${m.disponibilidade7d}%` : '-'} {tx('7 d', '7 d')}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Incidente({ i }: { i: IncidenteSaude }) {
  const tom = tomSaude(i.estado)
  const fim = i.fim ? Date.parse(i.fim) : Date.now()
  return (
    <article className="flex flex-col gap-2 rounded-[14px] border border-white/8 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Chip tom={tom}>{nomeSaude(i.estado)}</Chip>
        <span className="text-[13px] font-semibold">{dataHora(i.inicio)}</span>
        <span className="text-[12.5px] text-mudo">
          {i.fim ? tx(`durou ${duracao(fim - Date.parse(i.inicio))}`, `lasted ${duracao(fim - Date.parse(i.inicio))}`) : tx(`a decorrer há ${duracao(fim - Date.parse(i.inicio))}`, `ongoing for ${duracao(fim - Date.parse(i.inicio))}`)}
        </span>
        {!i.fim && <Chip tom="derrota">{tx('em curso', 'ongoing')}</Chip>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...i.motivos].sort((a, b) => NIVEL_SAUDE[b.nivel] - NIVEL_SAUDE[a.nivel]).map((m, k) => {
          const t = descreverMotivo(m)
          return <Chip key={k} tom={m.nivel === 'lento' ? 'ouro' : 'derrota'}>{t.titulo}{t.valor ? ` · ${t.valor}` : ''}</Chip>
        })}
      </div>
    </article>
  )
}

function Graficos({ s }: { s: Saude }) {
  const em = s.serie.map((p) => p.em)
  const estados = s.serie.map((p) => p.estado)
  const max = s.serie.find((p) => p.ligacoesMax)?.ligacoesMax ?? 60
  const sinal = (f: (p: Saude['serie'][number]) => number | null) => s.serie.map(f)
  const ouro = corSaude('lento')
  const vermelho = corSaude('sobrecarga')
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-3">
      <GraficoSaude
        eyebrow={tx('SERVIDOR', 'SERVER')} titulo={tx('CPU e memória (picos)', 'CPU and memory (peaks)')} periodo={s.periodo} em={em} estados={estados} maximo={100}
        series={[
          { chave: 'cpu', nome: 'CPU', cor: '#ff5b1f', valores: sinal((p) => p.cpu), unidade: '%' },
          { chave: 'ram', nome: tx('Memória', 'Memory'), cor: '#b4afa8', valores: sinal((p) => p.ram), unidade: '%' },
        ]}
        linhas={[{ valor: 70, rotulo: tx('aviso', 'warning'), cor: ouro }, { valor: 90, rotulo: tx('crítico', 'critical'), cor: vermelho }]}
        vazio={tx('O servidor não deu métricas neste período.', 'The server gave no metrics in this period.')}
      />
      <GraficoSaude
        eyebrow={tx('BASE DE DADOS', 'DATABASE')} titulo={tx('Ligações (picos)', 'Connections (peaks)')} periodo={s.periodo} em={em} estados={estados} maximo={max}
        series={[
          { chave: 'lig', nome: tx('Ligações', 'Connections'), cor: '#ff5b1f', valores: sinal((p) => p.ligacoes), unidade: '' },
          { chave: 'ativas', nome: tx('Consultas a correr', 'Running queries'), cor: '#5fe3d6', valores: sinal((p) => p.ativas), unidade: '' },
        ]}
        linhas={[{ valor: Math.round(max * 0.6), rotulo: tx('aviso', 'warning'), cor: ouro }, { valor: Math.round(max * 0.85), rotulo: tx('crítico', 'critical'), cor: vermelho }]}
      />
      <GraficoSaude
        className="md:col-span-2" eyebrow={tx('RESPOSTA', 'RESPONSE')} titulo={tx('Tempo de resposta (picos)', 'Response time (peaks)')} periodo={s.periodo} em={em} estados={estados}
        series={[
          { chave: 'api', nome: 'API', cor: '#ff5b1f', valores: sinal((p) => p.msApi), unidade: ' ms' },
          { chave: 'site', nome: 'Site', cor: '#b4afa8', valores: sinal((p) => p.msSite), unidade: ' ms' },
        ]}
        linhas={[{ valor: 800, rotulo: tx('lento (API)', 'slow (API)'), cor: ouro }]}
        vazio={tx('Sem verificações neste período.', 'No checks in this period.')}
      />
    </div>
  )
}

const cenarios = (): { valor: CenarioSaude; texto: string }[] => [
  { valor: 'normal', texto: tx('Normal', 'Normal') },
  { valor: 'lento', texto: nomeSaude('lento') },
  { valor: 'sobrecarga', texto: nomeSaude('sobrecarga') },
  { valor: 'em_baixo', texto: nomeSaude('em_baixo') },
]

/**
 * Staff > Estado: o estado do site ao jeito do Uptime Kuma. Uma frase com o estado, os motivos (o que está mal, com o
 * valor e o limite), as leituras de agora, as verificações com a barra de batimentos, os gráficos e o histórico de
 * incidentes. Tudo vem da base de dados (migração 0045); aqui só se mostra.
 */
export function EstadoDoSite() {
  const [periodo, setPeriodo] = useState<PeriodoSaude>('24h')
  const [cenario, setCenario] = useState<CenarioSaude | null>(() => dados.cenarioSaude?.() ?? null)
  const r = useCarregar(async () => {
    const inicio = performance.now()
    const s = await dados.saude(periodo)
    return { s, rtt: Math.round(performance.now() - inicio) }
  }, [periodo], [], { chave: `saude:${periodo}`, fresco: 15_000 })
  // Sem Realtime para isto: pergunta de meio em meio minuto enquanto o separador está à frente.
  useIntervalo(r.recarregar, 30_000)

  if (r.erro && !r.valor) return <Vazio icone={<Activity size={22} />} titulo={tx('Não foi possível ler o estado do site', 'Could not read the site status')} texto={r.erro} />
  if (!r.valor) return <Carregando />
  const { s, rtt } = r.valor
  const idade = s.idadeS ?? 0

  return (
    <div className="flex flex-col gap-4">
      <Cartaz s={s} />
      {s.semSondas && (
        <Aviso titulo={tx('As verificações automáticas ainda não começaram', 'The automatic checks have not started yet')}>
          {tx('Falta publicar a função saude-sondar no Supabase e acertar o cron (migração 0045). Enquanto isso só se vê o que a base de dados sabe de si. Os passos estão em docs/estado-do-site.md.', 'The saude-sondar function still needs to be published on Supabase, and the cron set up (migration 0045). Until then you only see what the database knows about itself. The steps are in docs/estado-do-site.md.')}
        </Aviso>
      )}
      {s.amostraEm && idade > 180 && (
        <Aviso tom="derrota" titulo={tx('O registo parou', 'Recording has stopped')}>
          {tx(`A última amostra tem ${duracao(idade * 1000)}. Se a base de dados está de pé, o cron do Supabase parou; se não está, é isso o problema.`, `The last sample is ${duracao(idade * 1000)} old. If the database is up, the Supabase cron stopped; if it is not, that is the problem.`)}
        </Aviso>
      )}
      {!s.semSondas && s.servidor && !s.servidor.ok && (
        <Aviso titulo={tx('Sem métricas do servidor', 'No server metrics')}>
          {tx(`A CPU, a memória e o disco não aparecem (${s.servidor.detalhe ?? 'sem resposta'}). A função saude-sondar lê-os da Metrics API do Supabase com a chave secreta do projeto; confirma que ela está disponível para a função.`, `CPU, memory and disk are not shown (${s.servidor.detalhe ?? 'no answer'}). The saude-sondar function reads them from the Supabase Metrics API using the project's secret key; make sure it is available to the function.`)}
        </Aviso>
      )}

      {s.motivos.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <TituloPainel eyebrow={tx('PORQUÊ', 'WHY')} titulo={tx('O que está a causar isto', 'What is causing this')} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-3">
            {[...s.motivos].sort((a, b) => NIVEL_SAUDE[b.nivel] - NIVEL_SAUDE[a.nivel]).map((m, i) => <CartaoMotivo key={`${m.codigo}${m.monitor ?? ''}${i}`} m={m} />)}
          </div>
        </div>
      ) : s.amostraEm && (
        <p className="m-0 text-[13px] text-mudo"><CircleCheck size={14} className="mr-1.5 inline text-vitoria" aria-hidden />{tx('Nada a assinalar: todos os valores abaixo dos limites.', 'Nothing to flag: every value is below its limits.')}</p>
      )}

      <Leituras s={s} rtt={rtt} />
      <Monitores s={s} />

      <div className="flex flex-col gap-2.5">
        <TituloPainel
          eyebrow={tx('HISTÓRICO', 'HISTORY')} titulo={tx('Como tem estado', 'How it has been')}
          direita={<Segmentado pequeno rotulo={tx('Período', 'Period')} valor={periodo} onChange={setPeriodo} opcoes={PERIODOS.map((p) => ({ valor: p, texto: p }))} />}
        />
        <Graficos s={s} />
      </div>

      <div className="flex flex-col gap-2.5">
        <TituloPainel eyebrow={tx('INCIDENTES', 'INCIDENTS')} titulo={tx('Quando esteve mal', 'When it was bad')} direita={<span className="text-[12px] text-mudo">{tx('Só conta depois de duas verificações más seguidas.', 'Only counts after two bad checks in a row.')}</span>} />
        {s.incidentes.length ? s.incidentes.map((i) => <Incidente key={i.id} i={i} />) : <Vazio icone={<CircleCheck size={22} />} titulo={tx('Nenhum incidente', 'No incidents')} texto={tx('Quando o site ficar lento, sobrecarregado ou em baixo, o incidente aparece aqui com os motivos.', 'When the site gets slow, overloaded or down, the incident shows up here with its reasons.')} />}
      </div>

      {cenario && dados.simularSaude && (
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed border-white/12 p-3.5">
          <span className="text-[12.5px] text-mudo">{tx('Modo demo: não há servidor a medir. Escolhe o que simular para ver cada ecrã.', 'Demo mode: there is no server to measure. Pick what to simulate to see each screen.')}</span>
          <Segmentado
            pequeno rotulo={tx('Cenário', 'Scenario')} valor={cenario} opcoes={cenarios()}
            onChange={(c) => { dados.simularSaude?.(c); setCenario(c); r.recarregar() }}
          />
        </div>
      )}
    </div>
  )
}
