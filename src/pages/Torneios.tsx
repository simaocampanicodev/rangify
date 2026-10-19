import { Crown, Medal, Settings2, Users } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ChipEstado, Contagem, dataLimite, formatoTexto } from '@/components/torneios/comum'
import { Cabecalho, Carregando, Chip, Esqueleto, Painel, Vazio } from '@/components/ui'
import { useAcao } from '@/contexts/Avisos'
import { useSessao } from '@/contexts/Sessao'
import { useCarregar } from '@/hooks/useCarregar'
import { useIntervalo } from '@/hooks/useVisivel'
import { dados, type ConviteTorneio, type TorneioResumo } from '@/lib/dados'
import { l } from '@/lib/idioma'
import { nomeFuncao } from '@/components/torneios/comum'

function Convite({ c }: { c: ConviteTorneio }) {
  const acao = useAcao()
  const navegar = useNavigate()
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-[14px] border border-laranja/35 bg-laranja/[0.06] px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-laranja text-[#170802]"><Users size={19} aria-hidden /></span>
      <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold"><span className="text-pessego">{c.equipaNome}</span> {l('convidou-te para', 'invited you as')} <b>{nomeFuncao(c.funcao).toLowerCase()}</b></span>
        <span className="text-[13px] text-suave">
          {c.torneioNome}{c.convidadoPor ? ` · ${l('convite de', 'invite from')} ${c.convidadoPor}` : ''} · {l('aceita até', 'accept by')} {dataLimite(c.inscricoesAte)}
        </span>
      </span>
      <span className="flex gap-2">
        <button type="button" className="btn btn-primario" onClick={async () => { const ok = await acao(async () => { await dados.torneioResponderConvite(c.equipaId, true); return true }, l('Entraste na equipa.', 'You joined the team.')); if (ok) navegar(`/torneios/${c.torneioId}`) }}>{l('Aceitar', 'Accept')}</button>
        <button type="button" className="btn btn-fantasma" onClick={() => acao(() => dados.torneioResponderConvite(c.equipaId, false))}>{l('Recusar', 'Decline')}</button>
      </span>
    </li>
  )
}

function Facto({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-mudo uppercase">{rotulo}</span>
      <span className="text-[14.5px] leading-snug font-bold">{children}</span>
    </span>
  )
}

function CartaoTorneio({ t, destaque }: { t: TorneioResumo; destaque: boolean }) {
  const aberto = t.estado === 'inscricoes' && t.inscricoesAbertas
  const ativo = t.estado === 'grupos' || t.estado === 'playoffs'
  const lugares = t.maxEquipas ?? Math.max(16, t.equipas)
  return (
    <Link to={`/torneios/${t.id}`} aria-label={t.nome} className={`painel flex min-w-0 flex-col gap-5 !rounded-[20px] p-6 text-texto no-underline transition-colors hover:!border-laranja/50 ${destaque ? '!border-laranja/35' : ''} ${t.estado === 'rascunho' ? '!border-dashed !bg-transparent' : ''}`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <ChipEstado t={t} />
        <span className="flex items-center gap-1.5">
          {t.teste && <Chip tom="laranja">{l('TESTE', 'TEST')}</Chip>}
          {!t.publico && t.estado !== 'rascunho' && <Chip>{l('FECHADO', 'PRIVATE')}</Chip>}
        </span>
      </span>
      <span className="flex flex-col gap-2">
        <span className={`${destaque ? 'text-[clamp(26px,3.4vw,34px)]' : 'text-[24px]'} leading-[1.05] font-extrabold tracking-[-0.04em]`}>{t.nome}</span>
        {t.descricao && <span className="line-clamp-3 text-[14px] leading-normal text-suave">{t.descricao}</span>}
      </span>
      {t.campeao && (
        <span className="flex items-center gap-3 rounded-[14px] border border-ouro/30 bg-ouro/[0.07] px-3.5 py-3">
          <Crown size={20} className="text-ouro" aria-hidden />
          <span className="flex flex-col"><span className="font-mono text-[10px] tracking-[0.16em] text-ouro">{l('CAMPEÃO', 'CHAMPION')}</span><span className="text-[16px] font-extrabold">{t.campeao.nome}</span></span>
        </span>
      )}
      {(aberto || ativo || t.estado === 'inscricoes') && (
        <span className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-3.5 border-y border-white/7 py-4">
          <Facto rotulo={l('EQUIPAS', 'TEAMS')}><span className="font-mono">{t.equipas}<span className="text-[12px] font-medium text-mudo"> / {lugares}</span></span></Facto>
          {aberto
            ? <Facto rotulo={l('FECHAM EM', 'CLOSES IN')}><span className="font-mono"><Contagem ate={t.inscricoesAte} vazio="—" /></span></Facto>
            : <Facto rotulo={l('INSCRIÇÕES', 'REGISTRATION')}>{l('Fechadas', 'Closed')}</Facto>}
          <Facto rotulo={l('FORMATO', 'FORMAT')}><span className="text-[13px]">{formatoTexto(t)}</span></Facto>
          {t.finalPresencial && <Facto rotulo="FINAL"><span className="text-[13px] text-pessego">{l('Presencial', 'In person')}</span></Facto>}
        </span>
      )}
      {aberto && (
        <span className="flex flex-col gap-2">
          <span className="h-1.5 overflow-hidden rounded-full bg-white/8"><span className="block h-full bg-gradient-to-r from-laranja to-pessego" style={{ width: `${Math.min(100, (t.equipas / lugares) * 100)}%` }} /></span>
          <span className="flex justify-between text-[12px] text-mudo"><span>{t.equipas} {l('equipas inscritas', 'teams registered')}, {t.completas} {l('completas', 'complete')}</span><span>{l('fecham a', 'closes')} {dataLimite(t.inscricoesAte)}</span></span>
        </span>
      )}
      {t.minhaEquipa ? (
        <span className="flex items-center gap-3.5 rounded-[14px] border border-white/8 bg-white/[0.035] px-4 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] border border-laranja/40 bg-laranja/18 text-[13px] font-extrabold text-pessego">{t.minhaEquipa.nome.slice(0, 2).toUpperCase()}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[14px] font-bold">{l('A tua equipa', 'Your team')}: {t.minhaEquipa.nome}</span><span className="text-[12px] text-mudo">{nomeFuncao(t.minhaEquipa.funcao)}{t.minhaEquipa.capitao ? ` · ${l('capitão', 'captain')}` : ''}</span></span>
          <span className="btn btn-primario">{l('Abrir', 'Open')}</span>
        </span>
      ) : t.convites > 0 ? (
        <span className="rounded-[14px] border border-laranja/35 bg-laranja/[0.06] px-4 py-3 text-[13.5px] font-semibold text-pessego-claro">{l(`Tens ${t.convites} convite(s) para uma equipa deste torneio`, `You have ${t.convites} invite(s) to a team in this tournament`)}</span>
      ) : aberto ? (
        <span className="btn btn-primario self-start">{l('Inscrever uma equipa', 'Register a team')}</span>
      ) : null}
    </Link>
  )
}

export function Torneios() {
  const { perfil } = useSessao()
  const visivel = useCarregar(() => dados.torneiosVisivel(), [perfil?.id, perfil?.funcao], ['torneios', 'staff'])
  const lista = useCarregar(() => dados.torneiosLista(), [perfil?.id], ['torneios', 'staff'], { chave: 'torneios:lista', minimo: 250 })
  const convites = useCarregar(() => dados.meusConvitesTorneio(), [perfil?.id], ['torneios'], { chave: 'torneios:convites' })
  useIntervalo(() => { lista.recarregar(); convites.recarregar() }, 60_000)
  const staff = perfil?.funcao === 'owner' || perfil?.funcao === 'dev'
  const area = useCarregar(() => (staff ? dados.torneiosAreaAberta() : Promise.resolve(true)), [perfil?.id, staff], ['torneios', 'staff'], { chave: 'torneios:area' })
  if (!perfil || visivel.carregando) return <Carregando />
  if (!visivel.valor) return <Navigate to="/" replace />
  const torneios = lista.valor ?? []
  const meusConvites = convites.valor ?? []
  const [primeiro, ...resto] = torneios

  return (
    <>
      <Cabecalho
        migalhas={[l('Comunidade', 'Community'), l('Torneios', 'Tournaments')]}
        titulo={l('Torneios', 'Tournaments')}
        descricao={l('Monta a tua equipa, inscreve-te e joga até à final. Os resultados são lidos da API da Riot: ninguém os escreve à mão.', 'Build your team, register and play to the final. Results are read from the Riot API: nobody types them in by hand.')}
        acoes={perfil.funcao === 'owner' || perfil.funcao === 'dev'
          ? <Link to="/admin?aba=torneios" className="btn btn-fantasma no-underline"><Settings2 size={16} aria-hidden />{l('Gerir na Staff', 'Manage in Staff')}</Link>
          : undefined}
      />
      {staff && area.valor === false && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-laranja/30 bg-laranja/[0.05] px-4 py-3 text-[13px] leading-normal text-suave">
          <b className="text-pessego">{l('A área está fechada.', 'The area is closed.')}</b>
          {l('Só tu e quem convidares (para uma equipa ou a testar) veem este separador.', 'Only you and whoever you invite (to a team or to test) see this tab.')}
          <Link to="/admin?aba=torneios" className="font-semibold text-pessego-claro">{l('Abrir a toda a gente', 'Open to everyone')}</Link>
        </p>
      )}
      {meusConvites.length > 0 && (
        <Painel aria-label={l('Convites', 'Invites')} className="flex flex-col gap-3 p-[18px]">
          <ul className="m-0 flex list-none flex-col gap-3 p-0">{meusConvites.map((c) => <Convite key={`${c.equipaId}`} c={c} />)}</ul>
        </Painel>
      )}
      {lista.carregando ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4" aria-busy>
          <Esqueleto className="h-[320px] rounded-[20px]" /><Esqueleto className="h-[320px] rounded-[20px]" />
        </div>
      ) : torneios.length === 0 ? (
        <Painel className="p-[22px]">
          <Vazio
            icone={<Medal size={22} />}
            titulo={l('Ainda não há torneios', 'No tournaments yet')}
            texto={perfil.funcao === 'owner' || perfil.funcao === 'dev'
              ? l('Cria o primeiro na Staff › Torneios (podes começar por um de teste, com bots).', 'Create the first one in Staff › Tournaments (you can start with a test one, with bots).')
              : l('Quando houver um torneio aberto, aparece aqui.', 'When a tournament is open, it shows up here.')}
            acao={perfil.funcao === 'owner' || perfil.funcao === 'dev' ? <Link to="/admin?aba=torneios" className="btn btn-primario no-underline">{l('Criar um torneio', 'Create a tournament')}</Link> : undefined}
          />
        </Painel>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
          <CartaoTorneio t={primeiro} destaque />
          {resto.length > 0 && <div className="flex min-w-0 flex-col gap-4">{resto.map((t) => <CartaoTorneio key={t.id} t={t} destaque={false} />)}</div>}
        </div>
      )}
    </>
  )
}
