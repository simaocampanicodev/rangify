-- Torneios: equipas de 5 + coach + 2 suplentes, fase de grupos, playoffs de eliminação simples e resultados
-- detetados pela API da Riot (como as partidas normais do hub).
--
-- Quem vê o quê (a área nasce FECHADA, como a loja e a divulgação):
--   * Owner e Dev veem e gerem tudo.
--   * "Abrir a toda a gente" em Staff › Torneios (config.torneios_public) abre a área: o separador Torneios
--     aparece a todos e cada um vê os torneios já publicados que estejam marcados como abertos (torneios.publico).
--   * Com a área fechada, só veem o separador (e o torneio) quem foi convidado para uma equipa, quem a staff
--     convidou a testar (torneio_acessos) e os membros de uma equipa. Um rascunho nunca aparece a ninguém.
--   * Só Owner e Dev criam, sorteiam, marcam datas e resolvem jogos à mão.
--   * Nenhuma equipa insere resultados: vêm da API (processar-torneio) ou da staff.
--
-- Fluxo: rascunho > inscrições (equipas, convites por nome, o convidado aceita) > sorteio dos grupos >
-- jogos de grupo (todos contra todos) > playoffs (quem perde está fora) > concluído.
-- A final pode ser presencial: então é a staff que põe o resultado.
--
-- Picks e bans de mapas: antes de cada jogo os capitães das duas equipas vetam os mapas à vez. O formato do
-- jogo é "melhor de 1, 3 ou 5" (o do torneio, que a staff muda jogo a jogo):
--   * melhor de 1: banem à vez até sobrar um mapa; quem não baniu por último escolhe o lado (como no hub).
--   * melhor de 3: ban, ban, pick, lado, pick, lado, ban, ban e o que sobra é o decisivo.
--   * melhor de 5: ban, ban, pick, lado, pick, lado, pick, lado, pick, lado e o que sobra é o decisivo.
--   Quem escolhe um mapa (pick) deixa a outra equipa escolher o lado nesse mapa; no decisivo escolhe o lado
--   quem não fez a última jogada de mapa. A equipa A começa. Cada jogada tem 90 s: se passar, joga-se ao
--   calhas (cron + quem tiver a página aberta). Capitães bots jogam logo. A staff pode fixar o mapa de um
--   jogo à melhor de 1. Numa série cada mapa é um jogo personalizado: o resultado de cada um é lido da API.
--
-- Os torneios não mexem nos pontos, no rank nem nas estatísticas do hub.
--
-- Torneios de teste (torneios.teste): Owner e Dev têm ferramentas com bots (equipas de bots, preencher a
-- equipa com bots, simular jogos). Estas funções recusam-se a correr num torneio a sério.
--
-- Corre depois de 0001 a 0030. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.torneios (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(trim(nome)) between 3 and 60),
  descricao text check (descricao is null or char_length(descricao) <= 600),
  estado text not null default 'rascunho' check (estado in ('rascunho', 'inscricoes', 'grupos', 'playoffs', 'concluido', 'cancelado')),
  publico boolean not null default false,
  teste boolean not null default false,
  tamanho_grupo int not null default 4 check (tamanho_grupo between 3 and 6),
  passam_por_grupo int not null default 2 check (passam_por_grupo between 1 and 3),
  final_presencial boolean not null default false,
  -- Picks e bans de mapas antes de cada jogo (veja o cabeçalho). pool_mapas vazio = a rotação do hub na altura.
  -- melhor_de: o formato de cada jogo (1, 3 ou 5 mapas); a staff muda-o jogo a jogo.
  veto_mapas boolean not null default true,
  melhor_de int not null default 1 check (melhor_de in (1, 3, 5)),
  pool_mapas text[] check (pool_mapas is null or array_length(pool_mapas, 1) between 3 and 13),
  -- Quantos jogadores têm de estar na partida da API para a darmos como deste jogo (nos de teste pode ser menos).
  min_jogadores int not null default 8 check (min_jogadores between 1 and 10),
  inscricoes_ate timestamptz not null,
  inicio timestamptz,
  max_equipas int check (max_equipas is null or max_equipas between 2 and 64),
  sorteio_seed double precision,
  sorteado_em timestamptz,
  campeao_id uuid,
  criado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (passam_por_grupo < tamanho_grupo)
);
alter table public.torneios enable row level security;

create table if not exists public.torneio_equipas (
  id uuid primary key default gen_random_uuid(),
  torneio_id uuid not null references public.torneios (id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 2 and 32),
  capitao_id uuid not null references public.profiles (id) on delete cascade,
  estado text not null default 'inscrita' check (estado in ('inscrita', 'desqualificada')),
  grupo int,
  ordem_sorteio int,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create unique index if not exists torneio_equipas_nome on public.torneio_equipas (torneio_id, lower(trim(nome)));
create index if not exists torneio_equipas_capitao on public.torneio_equipas (capitao_id);
alter table public.torneio_equipas enable row level security;

do $$
begin
  alter table public.torneios add constraint torneios_campeao_fk foreign key (campeao_id) references public.torneio_equipas (id) on delete set null;
exception when duplicate_object then null;
end $$;

create table if not exists public.torneio_membros (
  equipa_id uuid not null references public.torneio_equipas (id) on delete cascade,
  perfil_id uuid not null references public.profiles (id) on delete cascade,
  torneio_id uuid not null references public.torneios (id) on delete cascade,
  funcao text not null check (funcao in ('jogador', 'coach', 'suplente')),
  estado text not null default 'convidado' check (estado in ('convidado', 'aceite')),
  convidado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  primary key (equipa_id, perfil_id)
);
-- Cada pessoa só está (aceite) numa equipa por torneio; convites pendentes pode ter vários.
create unique index if not exists torneio_membros_um_aceite on public.torneio_membros (torneio_id, perfil_id) where estado = 'aceite';
create index if not exists torneio_membros_perfil on public.torneio_membros (perfil_id);
alter table public.torneio_membros enable row level security;

create table if not exists public.torneio_acessos (
  torneio_id uuid not null references public.torneios (id) on delete cascade,
  perfil_id uuid not null references public.profiles (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (torneio_id, perfil_id)
);
alter table public.torneio_acessos enable row level security;

create table if not exists public.torneio_jogos (
  id uuid primary key default gen_random_uuid(),
  torneio_id uuid not null references public.torneios (id) on delete cascade,
  fase text not null check (fase in ('grupo', 'playoff')),
  grupo int,
  ronda int not null,
  ordem int not null,
  rotulo text not null,
  equipa_a uuid references public.torneio_equipas (id) on delete set null,
  equipa_b uuid references public.torneio_equipas (id) on delete set null,
  origem_a jsonb,
  origem_b jsonb,
  seguinte_id uuid references public.torneio_jogos (id) on delete set null,
  seguinte_lado text check (seguinte_lado in ('a', 'b')),
  agendado_para timestamptz,
  mapa text,
  -- O mapa foi posto pela staff (então não há picks e bans) e não pelos capitães.
  mapa_staff boolean not null default false,
  presencial boolean not null default false,
  estado text not null default 'pendente' check (estado in ('pendente', 'agendado', 'veto', 'a_decorrer', 'concluido')),
  -- Os picks e bans: o que estava em jogo quando começaram, de quem é a vez até quando e o lado escolhido.
  pool_mapas text[],
  -- Formato do jogo: 1, 3 ou 5 mapas (null = o do torneio); veto_melhor_de = o que valia quando os picks e bans começaram.
  melhor_de int check (melhor_de is null or melhor_de in (1, 3, 5)),
  veto_melhor_de int check (veto_melhor_de is null or veto_melhor_de in (1, 3, 5)),
  -- Mapas ganhos por cada equipa (só conta nos jogos à melhor de 3 ou 5; "mapa" passa a ser o que se joga agora).
  serie_a int not null default 0,
  serie_b int not null default 0,
  veto_prazo timestamptz,
  lado_equipa text check (lado_equipa is null or lado_equipa in ('A', 'B')),
  lado_escolha text check (lado_escolha is null or lado_escolha in ('ataque', 'defesa')),
  comecou_em timestamptz,
  terminou_em timestamptz,
  score_a int,
  score_b int,
  vencedor_id uuid references public.torneio_equipas (id) on delete set null,
  como text check (como in ('api', 'staff', 'simulado', 'walkover', 'bye')),
  riot_match_id text,
  api_checked_at timestamptz,
  tem_stats boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index if not exists torneio_jogos_torneio on public.torneio_jogos (torneio_id, fase, ronda, ordem);
create index if not exists torneio_jogos_a_decorrer on public.torneio_jogos (estado) where estado = 'a_decorrer';
create index if not exists torneio_jogos_veto on public.torneio_jogos (veto_prazo) where estado = 'veto';
alter table public.torneio_jogos enable row level security;

create table if not exists public.torneio_jogo_jogadores (
  jogo_id uuid not null references public.torneio_jogos (id) on delete cascade,
  -- Em que mapa da série (sempre 1 num jogo à melhor de 1).
  mapa_ordem int not null default 1,
  perfil_id uuid not null references public.profiles (id) on delete cascade,
  equipa_id uuid not null references public.torneio_equipas (id) on delete cascade,
  agente text,
  kills int, deaths int, assists int, acs int, first_bloods int, trades int, hs_pct int, kast_pct int,
  primary key (jogo_id, mapa_ordem, perfil_id)
);
alter table public.torneio_jogo_jogadores enable row level security;

-- O código do grupo só aparece aos jogadores das duas equipas (e à staff).
create table if not exists public.torneio_jogo_segredos (
  jogo_id uuid primary key references public.torneio_jogos (id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-Z0-9]{6}$')
);
alter table public.torneio_jogo_segredos enable row level security;

-- Os mapas de uma série à melhor de 3 ou 5, na ordem em que se jogam (saem dos picks e bans).
create table if not exists public.torneio_jogo_mapas (
  jogo_id uuid not null references public.torneio_jogos (id) on delete cascade,
  ordem int not null check (ordem between 1 and 5),
  mapa text not null,
  -- Quem escolheu o mapa (A ou B) ou 'decisivo' (o que sobrou).
  escolhida_por text not null check (escolhida_por in ('A', 'B', 'decisivo')),
  lado_equipa text check (lado_equipa is null or lado_equipa in ('A', 'B')),
  lado_escolha text check (lado_escolha is null or lado_escolha in ('ataque', 'defesa')),
  estado text not null default 'pendente' check (estado in ('pendente', 'a_decorrer', 'concluido')),
  comecou_em timestamptz,
  terminou_em timestamptz,
  score_a int,
  score_b int,
  vencedor_id uuid references public.torneio_equipas (id) on delete set null,
  como text check (como is null or como in ('api', 'staff', 'simulado')),
  riot_match_id text,
  tem_stats boolean not null default false,
  primary key (jogo_id, ordem)
);
alter table public.torneio_jogo_mapas enable row level security;

-- Os picks e bans de cada jogo, por ordem: ban e pick levam o nome do mapa, lado leva "ataque" ou "defesa".
create table if not exists public.torneio_jogo_vetos (
  jogo_id uuid not null references public.torneio_jogos (id) on delete cascade,
  ordem int not null,
  tipo text not null check (tipo in ('ban', 'pick', 'lado')),
  valor text not null,
  equipa text not null check (equipa in ('A', 'B')),
  por uuid references public.profiles (id) on delete set null,
  auto boolean not null default false,
  criado_em timestamptz not null default now(),
  primary key (jogo_id, ordem)
);
alter table public.torneio_jogo_vetos enable row level security;

-- ---------------------------------------------------------------- quem vê o quê

-- A área de torneios aberta a toda a gente? (Staff › Torneios › Abrir a toda a gente)
alter table public.config add column if not exists torneios_public boolean not null default false;

create or replace function public._torneio_area_aberta() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select torneios_public from config where id), false)
$$;

create or replace function public._torneio_staff(p public.profiles) returns boolean
language sql immutable as $$ select p.role in ('owner', 'dev') $$;

create or replace function public._torneio_visivel(t public.torneios, p public.profiles) returns boolean
language sql stable security definer set search_path = public as $$
  select p.role in ('owner', 'dev')
    or (t.estado <> 'rascunho' and (
      (t.publico and _torneio_area_aberta())
      or exists (select 1 from torneio_acessos a where a.torneio_id = t.id and a.perfil_id = p.id)
      or exists (select 1 from torneio_membros m where m.torneio_id = t.id and m.perfil_id = p.id)
    ))
$$;

/** O torneio, se existir e eu o puder ver (senão dá o mesmo erro, para não revelar rascunhos). */
create or replace function public._torneio_ver(p_torneio uuid, p public.profiles) returns public.torneios
language plpgsql stable security definer set search_path = public as $$
declare t torneios;
begin
  select * into t from torneios where id = p_torneio;
  if not found or not _torneio_visivel(t, p) then raise exception 'Torneio não encontrado.'; end if;
  return t;
end $$;

create or replace function public._torneio_inscricoes_abertas(t public.torneios) returns boolean
language sql stable as $$ select t.estado = 'inscricoes' and now() < t.inscricoes_ate $$;

/** Os mapas em jogo: os que a staff escolheu para o torneio ou, se não escolheu, a rotação do hub. Pela ordem do jogo. */
create or replace function public._torneio_veto_pool(t public.torneios) returns text[]
language sql stable security definer set search_path = public as $$
  select array(select x from unnest(_mapas()) x where x = any (coalesce(t.pool_mapas, _pool_ativa())))
$$;

/** O formato do jogo: 1, 3 ou 5 mapas (os picks e bans já começados guardam o que valia na altura). */
create or replace function public._torneio_melhor_de(j public.torneio_jogos, t public.torneios) returns int
language sql immutable as $$ select coalesce(j.veto_melhor_de, j.melhor_de, t.melhor_de) $$;

/**
 * A ordem dos picks e bans de um jogo à melhor de p_melhor_de com p_n mapas (a equipa A começa), como
 * [{"tipo": "ban"|"pick"|"lado", "equipa": "A"|"B", "alvo": n.º do mapa}]. O lado do decisivo é sempre o último passo.
 */
create or replace function public._torneio_veto_passos(p_melhor_de int, p_n int) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  v_picks int := greatest(p_melhor_de - 1, 0);
  v_bans int := greatest(p_n - p_melhor_de, 0);
  v_antes int;
  v_depois int;
  v_eq text;
  v_ultima text := 'B';
  i int;
begin
  -- Melhor de 1: só bans. Melhor de 3 ou 5: dois bans, os picks (cada um com a escolha do lado da outra equipa)
  -- e, se sobrarem mapas, mais bans; o que fica é o decisivo.
  if p_melhor_de = 1 then v_antes := v_bans; v_depois := 0; else v_antes := least(2, v_bans); v_depois := v_bans - v_antes; end if;
  for i in 1..v_antes loop
    v_eq := case when i % 2 = 1 then 'A' else 'B' end;
    v := v || jsonb_build_array(jsonb_build_object('tipo', 'ban', 'equipa', v_eq));
    v_ultima := v_eq;
  end loop;
  for i in 1..v_picks loop
    v_eq := case when i % 2 = 1 then 'A' else 'B' end;
    v := v || jsonb_build_array(jsonb_build_object('tipo', 'pick', 'equipa', v_eq, 'alvo', i));
    v := v || jsonb_build_array(jsonb_build_object('tipo', 'lado', 'equipa', case when v_eq = 'A' then 'B' else 'A' end, 'alvo', i));
    v_ultima := v_eq;
  end loop;
  for i in 1..v_depois loop
    v_eq := case when i % 2 = 1 then 'A' else 'B' end;
    v := v || jsonb_build_array(jsonb_build_object('tipo', 'ban', 'equipa', v_eq));
    v_ultima := v_eq;
  end loop;
  -- O decisivo: o lado escolhe-o quem não fez a última jogada de mapa.
  return v || jsonb_build_array(jsonb_build_object('tipo', 'lado', 'equipa', case when v_ultima = 'A' then 'B' else 'A' end, 'alvo', p_melhor_de));
end $$;

/** O passo que falta ({"tipo", "equipa", "ordem"}) ou null se os picks e bans acabaram. */
create or replace function public._torneio_veto_vez(j public.torneio_jogos) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when n.feitos < jsonb_array_length(n.passos) then (n.passos -> n.feitos) || jsonb_build_object('ordem', n.feitos + 1) end
  from (
    select _torneio_veto_passos(_torneio_melhor_de(j, t), coalesce(array_length(coalesce(j.pool_mapas, _torneio_veto_pool(t)), 1), 0)) as passos,
           (select count(*)::int from torneio_jogo_vetos v where v.jogo_id = j.id) as feitos
    from torneios t where t.id = j.torneio_id
  ) n
$$;

/** O jogador de carne e osso tem de ter o Riot ID ligado: é por ele que a API reconhece as partidas. */
create or replace function public._torneio_perfil_valido(p public.profiles) returns boolean
language sql immutable as $$ select p.is_bot or p.riot_id is not null $$;

-- ---------------------------------------------------------------- procurar pessoas pelo nome

/**
 * Procura um jogador pelo Riot ID completo (Nome#TAG), pelo utilizador ou pelo nome antes do "#".
 * Dá erro se houver mais do que um com esse nome, para ninguém convidar a pessoa errada.
 */
create or replace function public._torneio_achar_jogador(p_nome text, p_bots boolean default false) returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  v text := lower(trim(coalesce(p_nome, '')));
  r profiles;
  n int;
begin
  if char_length(v) < 2 then raise exception 'Escreve o nome do jogador (Riot ID, por exemplo Nome#TAG).'; end if;
  select * into r from profiles where lower(riot_id) = v and (p_bots or not is_bot);
  if found then return r; end if;
  select count(*) into n from profiles where (lower(username) = v or lower(split_part(riot_id, '#', 1)) = v) and (p_bots or not is_bot);
  if n = 0 then raise exception 'Não encontrei ninguém chamado "%". Confirma o nome (ou usa o Riot ID completo).', trim(p_nome); end if;
  if n > 1 then raise exception 'Há mais de um jogador chamado "%". Usa o Riot ID completo (Nome#TAG).', trim(p_nome); end if;
  select * into r from profiles where (lower(username) = v or lower(split_part(riot_id, '#', 1)) = v) and (p_bots or not is_bot);
  return r;
end $$;

/** Sugestões enquanto se escreve: só quem tem o Riot ID ligado (o resto nem pode jogar torneios). */
create or replace function public.torneio_procurar_jogadores(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := _eu();
  v text := replace(replace(lower(trim(coalesce(p_q, ''))), '%', '\%'), '_', '\_');
begin
  if not exists (select 1 from torneios t where _torneio_visivel(t, me)) then return '[]'::jsonb; end if;
  if char_length(v) < 2 then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('perfilId', p.id, 'utilizador', _nome(p), 'riotId', p.riot_id, 'avatarUrl', p.avatar_url) order by p.username)
    from (
      select * from profiles
      where not is_bot and riot_id is not null and id <> me.id and (lower(riot_id) like '%' || v || '%' or username like '%' || v || '%')
      order by (lower(riot_id) like v || '%') desc, username limit 8
    ) p
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- classificação dos grupos

/**
 * A tabela de cada grupo. Ordem: vitórias, confronto direto (só quando duas equipas empatam em vitórias),
 * diferença de rondas, rondas ganhas e, no fim, a ordem do sorteio.
 */
create or replace function public._torneio_classificacao(p_torneio uuid)
returns table (grupo int, equipa_id uuid, nome text, jogos int, vitorias int, derrotas int, rondas_ganhas int, rondas_perdidas int, diferenca int, posicao int)
language sql stable security definer set search_path = public as $$
  with eq as (
    select e.id, e.nome, e.grupo, e.ordem_sorteio from torneio_equipas e where e.torneio_id = p_torneio and e.grupo is not null
  ), res as (
    select j.equipa_a as eq, j.equipa_b as adv, j.score_a as rg, j.score_b as rp, j.vencedor_id = j.equipa_a as venceu
    from torneio_jogos j where j.torneio_id = p_torneio and j.fase = 'grupo' and j.estado = 'concluido'
    union all
    select j.equipa_b, j.equipa_a, j.score_b, j.score_a, j.vencedor_id = j.equipa_b
    from torneio_jogos j where j.torneio_id = p_torneio and j.fase = 'grupo' and j.estado = 'concluido'
  ), tot as (
    select eq.id, eq.nome, eq.grupo, eq.ordem_sorteio,
      count(res.eq)::int as jogos,
      (count(*) filter (where res.venceu))::int as v,
      (count(*) filter (where not res.venceu))::int as d,
      coalesce(sum(res.rg), 0)::int as rg,
      coalesce(sum(res.rp), 0)::int as rp
    from eq left join res on res.eq = eq.id
    group by eq.id, eq.nome, eq.grupo, eq.ordem_sorteio
  ), emp as (
    select tot.*, count(*) over (partition by tot.grupo, tot.v) as empatadas from tot
  ), h2h as (
    select emp.*,
      case when emp.empatadas = 2 and exists (
        select 1 from res join emp o on o.id = res.adv and o.grupo = emp.grupo and o.v = emp.v
        where res.eq = emp.id and res.venceu
      ) then 1 else 0 end as h
    from emp
  )
  select h2h.grupo, h2h.id, h2h.nome, h2h.jogos, h2h.v, h2h.d, h2h.rg, h2h.rp, (h2h.rg - h2h.rp),
    (row_number() over (partition by h2h.grupo order by h2h.v desc, h2h.h desc, (h2h.rg - h2h.rp) desc, h2h.rg desc, h2h.ordem_sorteio asc))::int
  from h2h
$$;

-- ---------------------------------------------------------------- JSON para o site

create or replace function public._torneio_json(t public.torneios, p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id, 'nome', t.nome, 'descricao', t.descricao, 'estado', t.estado, 'publico', t.publico, 'teste', t.teste,
    'tamanhoGrupo', t.tamanho_grupo, 'passamPorGrupo', t.passam_por_grupo, 'finalPresencial', t.final_presencial,
    'vetoMapas', t.veto_mapas, 'melhorDe', t.melhor_de, 'poolMapas', to_jsonb(t.pool_mapas), 'poolEfetiva', to_jsonb(_torneio_veto_pool(t)),
    'minJogadores', t.min_jogadores, 'inscricoesAte', t.inscricoes_ate, 'inicio', t.inicio, 'maxEquipas', t.max_equipas,
    'sorteadoEm', t.sorteado_em,
    'inscricoesAbertas', _torneio_inscricoes_abertas(t),
    'equipas', (select count(*) from torneio_equipas e where e.torneio_id = t.id and e.estado = 'inscrita'),
    'completas', (select count(*) from torneio_equipas e where e.torneio_id = t.id and e.estado = 'inscrita'
      and (select count(*) from torneio_membros m where m.equipa_id = e.id and m.estado = 'aceite' and m.funcao = 'jogador') >= 5),
    'campeao', (select jsonb_build_object('id', e.id, 'nome', e.nome) from torneio_equipas e where e.id = t.campeao_id),
    'minhaEquipa', (
      select jsonb_build_object('id', e.id, 'nome', e.nome, 'funcao', m.funcao, 'capitao', e.capitao_id = p.id)
      from torneio_membros m join torneio_equipas e on e.id = m.equipa_id
      where m.torneio_id = t.id and m.perfil_id = p.id and m.estado = 'aceite'
    ),
    'convites', (select count(*) from torneio_membros m where m.torneio_id = t.id and m.perfil_id = p.id and m.estado = 'convidado'),
    'gerir', p.role in ('owner', 'dev')
  )
$$;

create or replace function public._torneio_equipa_json(e public.torneio_equipas, p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'capitaoId', e.capitao_id, 'estado', e.estado, 'grupo', e.grupo, 'ordem', e.ordem_sorteio,
    'completa', (select count(*) from torneio_membros m where m.equipa_id = e.id and m.estado = 'aceite' and m.funcao = 'jogador') >= 5,
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', pr.id, 'utilizador', _nome(pr), 'riotId', pr.riot_id, 'avatarUrl', pr.avatar_url, 'bot', pr.is_bot,
        'funcao', m.funcao, 'estado', m.estado, 'capitao', pr.id = e.capitao_id
      ) order by case m.funcao when 'jogador' then 0 when 'suplente' then 1 else 2 end, (pr.id = e.capitao_id) desc, m.criado_em)
      from torneio_membros m join profiles pr on pr.id = m.perfil_id
      where m.equipa_id = e.id and (m.estado = 'aceite' or p.role in ('owner', 'dev') or e.capitao_id = p.id or m.perfil_id = p.id)
    ), '[]'::jsonb)
  )
$$;

create or replace function public._torneio_jogo_json(j public.torneio_jogos, p public.profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'fase', j.fase, 'grupo', j.grupo, 'ronda', j.ronda, 'ordem', j.ordem, 'rotulo', j.rotulo,
    'equipaA', (select jsonb_build_object('id', e.id, 'nome', e.nome) from torneio_equipas e where e.id = j.equipa_a),
    'equipaB', (select jsonb_build_object('id', e.id, 'nome', e.nome) from torneio_equipas e where e.id = j.equipa_b),
    'origemA', j.origem_a, 'origemB', j.origem_b,
    'agendadoPara', j.agendado_para, 'mapa', j.mapa, 'presencial', j.presencial, 'estado', j.estado,
    'melhorDe', (select _torneio_melhor_de(j, t) from torneios t where t.id = j.torneio_id),
    'serieA', j.serie_a, 'serieB', j.serie_b,
    'mapas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ordem', m.ordem, 'mapa', m.mapa, 'escolhidaPor', m.escolhida_por, 'ladoEquipa', m.lado_equipa, 'ladoEscolha', m.lado_escolha,
        'estado', m.estado, 'scoreA', m.score_a, 'scoreB', m.score_b, 'vencedorId', m.vencedor_id, 'como', m.como,
        'comecouEm', m.comecou_em, 'terminouEm', m.terminou_em
      ) order by m.ordem)
      from torneio_jogo_mapas m where m.jogo_id = j.id
    ), '[]'::jsonb),
    'veto', (
      select case when t.veto_mapas and not j.presencial then jsonb_build_object(
        'melhorDe', _torneio_melhor_de(j, t),
        'pool', to_jsonb(coalesce(j.pool_mapas, _torneio_veto_pool(t))),
        'passos', _torneio_veto_passos(_torneio_melhor_de(j, t), coalesce(array_length(coalesce(j.pool_mapas, _torneio_veto_pool(t)), 1), 0)),
        'feitos', coalesce((
          select jsonb_agg(jsonb_build_object('ordem', v.ordem, 'tipo', v.tipo, 'valor', v.valor, 'equipa', v.equipa, 'auto', v.auto) order by v.ordem)
          from torneio_jogo_vetos v where v.jogo_id = j.id
        ), '[]'::jsonb),
        'prazo', j.veto_prazo, 'ladoEquipa', j.lado_equipa, 'ladoEscolha', j.lado_escolha, 'mapaStaff', j.mapa_staff
      ) end
      from torneios t where t.id = j.torneio_id
    ),
    'comecouEm', j.comecou_em, 'terminouEm', j.terminou_em,
    'scoreA', j.score_a, 'scoreB', j.score_b, 'vencedorId', j.vencedor_id, 'como', j.como,
    'semResultadoAuto', j.estado = 'a_decorrer' and j.comecou_em < now() - interval '60 minutes',
    'codigo', case when p.role in ('owner', 'dev') or exists (
        select 1 from torneio_membros m
        where m.estado = 'aceite' and m.perfil_id = p.id and m.equipa_id in (j.equipa_a, j.equipa_b)
      ) then (select s.codigo from torneio_jogo_segredos s where s.jogo_id = j.id) end,
    'jogadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', x.perfil_id, 'equipaId', x.equipa_id, 'mapaOrdem', x.mapa_ordem, 'utilizador', _nome(pr), 'agente', x.agente,
        'kills', x.kills, 'deaths', x.deaths, 'assists', x.assists, 'acs', x.acs, 'firstBloods', x.first_bloods,
        'trades', x.trades, 'hsPct', x.hs_pct, 'kastPct', x.kast_pct
      ) order by x.mapa_ordem, x.equipa_id = j.equipa_a desc, x.acs desc nulls last)
      from torneio_jogo_jogadores x join profiles pr on pr.id = x.perfil_id where x.jogo_id = j.id
    ), '[]'::jsonb)
  )
$$;

/** Tudo o que a página de um torneio mostra, num só pedido. */
create or replace function public.torneio_detalhe(p_torneio uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles := _eu();
  t torneios := _torneio_ver(p_torneio, me);
begin
  return jsonb_build_object(
    'torneio', _torneio_json(t, me) || case when me.role in ('owner', 'dev') then jsonb_build_object('seed', t.sorteio_seed) else '{}'::jsonb end,
    'equipas', coalesce((
      select jsonb_agg(_torneio_equipa_json(e, me) order by e.grupo nulls last, e.ordem_sorteio nulls last, e.criada_em)
      from torneio_equipas e where e.torneio_id = t.id
    ), '[]'::jsonb),
    'jogos', coalesce((
      select jsonb_agg(_torneio_jogo_json(j, me) order by case j.fase when 'grupo' then 0 else 1 end, j.grupo nulls last, j.ronda, j.ordem)
      from torneio_jogos j where j.torneio_id = t.id
    ), '[]'::jsonb),
    'classificacao', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', g.grupo, 'equipas', g.linhas) order by g.grupo)
      from (
        select c.grupo, jsonb_agg(jsonb_build_object(
          'equipaId', c.equipa_id, 'nome', c.nome, 'jogos', c.jogos, 'vitorias', c.vitorias, 'derrotas', c.derrotas,
          'rondasGanhas', c.rondas_ganhas, 'rondasPerdidas', c.rondas_perdidas, 'diferenca', c.diferenca, 'posicao', c.posicao,
          'passa', c.posicao <= t.passam_por_grupo
        ) order by c.posicao) as linhas
        from _torneio_classificacao(t.id) c group by c.grupo
      ) g
    ), '[]'::jsonb),
    'agora', now()
  );
end $$;

/** A lista de torneios que eu posso ver (a staff vê também os rascunhos). */
create or replace function public.torneios_lista() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _eu();
begin
  return coalesce((
    select jsonb_agg(_torneio_json(t, me) order by
      case t.estado when 'inscricoes' then 0 when 'grupos' then 1 when 'playoffs' then 1 when 'rascunho' then 2 when 'concluido' then 3 else 4 end,
      t.inscricoes_ate desc)
    from torneios t where _torneio_visivel(t, me)
  ), '[]'::jsonb);
end $$;

/** A área aparece no menu a Owner e Dev, a toda a gente quando está aberta e a quem já tem um torneio para ver (convidado para uma equipa ou a testar). */
create or replace function public.torneios_visivel() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where auth_id = auth.uid();
  if not found then return false; end if;
  return me.role in ('owner', 'dev') or _torneio_area_aberta() or exists (select 1 from torneios t where _torneio_visivel(t, me));
end $$;

/** A área está aberta a toda a gente? (Para o botão da staff.) */
create or replace function public.torneio_area_aberta() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  return _torneio_area_aberta();
end $$;

/** Abrir a área de torneios a toda a gente, ou voltar a fechá-la (só Owner e Dev). */
create or replace function public.torneio_definir_area(p_aberta boolean) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  update config set torneios_public = coalesce(p_aberta, false), updated_at = now(), updated_by = me.id where id;
  return _torneio_area_aberta();
end $$;

/** Os convites para equipas que ainda posso aceitar (as inscrições têm de estar abertas). */
create or replace function public.meus_convites_torneio() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _eu();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'equipaId', e.id, 'equipaNome', e.nome, 'torneioId', t.id, 'torneioNome', t.nome, 'funcao', m.funcao,
      'convidadoPor', (select _nome(c) from profiles c where c.id = m.convidado_por), 'inscricoesAte', t.inscricoes_ate, 'em', m.criado_em
    ) order by m.criado_em desc)
    from torneio_membros m join torneio_equipas e on e.id = m.equipa_id join torneios t on t.id = m.torneio_id
    where m.perfil_id = me.id and m.estado = 'convidado' and _torneio_inscricoes_abertas(t)
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- equipas

/** Os lugares de uma equipa: 5 jogadores, 1 coach e 2 suplentes (convites pendentes contam). */
create or replace function public._torneio_lugar_livre(p_equipa uuid, p_funcao text) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from torneio_membros m where m.equipa_id = p_equipa and m.funcao = p_funcao)
    < case p_funcao when 'jogador' then 5 when 'coach' then 1 when 'suplente' then 2 else 0 end
$$;

create or replace function public._torneio_funcao_valida(p_funcao text) returns void
language plpgsql immutable as $$
begin
  if p_funcao is null or p_funcao not in ('jogador', 'coach', 'suplente') then raise exception 'A função tem de ser jogador, coach ou suplente.'; end if;
end $$;

/**
 * Quem pode mexer na equipa: o capitão, enquanto as inscrições estão abertas, e a staff sempre
 * (até o torneio acabar). Dá o torneio e a equipa para a função seguir.
 */
create or replace function public._torneio_editar_equipa(p_equipa uuid, p public.profiles) returns public.torneio_equipas
language plpgsql stable security definer set search_path = public as $$
declare
  e torneio_equipas;
  t torneios;
begin
  select * into e from torneio_equipas where id = p_equipa;
  if not found then raise exception 'Equipa não encontrada.'; end if;
  select * into t from torneios where id = e.torneio_id;
  if not _torneio_visivel(t, p) then raise exception 'Equipa não encontrada.'; end if;
  if t.estado in ('concluido', 'cancelado') then raise exception 'Este torneio já acabou.'; end if;
  if p.role in ('owner', 'dev') then return e; end if;
  if e.capitao_id <> p.id then raise exception 'Só o capitão pode mudar a equipa.'; end if;
  if not _torneio_inscricoes_abertas(t) then raise exception 'As inscrições já fecharam: já não se pode mudar a equipa.'; end if;
  return e;
end $$;

create or replace function public.torneio_criar_equipa(p_torneio uuid, p_nome text, p_funcao text default 'jogador') returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  t torneios := _torneio_ver(p_torneio, me);
  v_nome text := trim(coalesce(p_nome, ''));
  v_id uuid;
begin
  if p_funcao not in ('jogador', 'coach') then raise exception 'Quem cria a equipa entra como jogador ou como coach.'; end if;
  if not _torneio_inscricoes_abertas(t) and not me.role in ('owner', 'dev') then raise exception 'As inscrições deste torneio não estão abertas.'; end if;
  if t.estado not in ('inscricoes', 'rascunho') then raise exception 'As inscrições deste torneio não estão abertas.'; end if;
  if not _torneio_perfil_valido(me) then raise exception 'Liga o teu Riot ID no perfil antes de te inscreveres.'; end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 32 then raise exception 'O nome da equipa tem entre 2 e 32 letras.'; end if;
  if exists (select 1 from torneio_membros where torneio_id = t.id and perfil_id = me.id and estado = 'aceite') then
    raise exception 'Já estás numa equipa deste torneio.';
  end if;
  if t.max_equipas is not null and (select count(*) from torneio_equipas where torneio_id = t.id) >= t.max_equipas then
    raise exception 'O torneio já tem o máximo de equipas.';
  end if;
  if exists (select 1 from torneio_equipas where torneio_id = t.id and lower(trim(nome)) = lower(v_nome)) then
    raise exception 'Já existe uma equipa com esse nome neste torneio.';
  end if;
  insert into torneio_equipas (torneio_id, nome, capitao_id) values (t.id, v_nome, me.id) returning id into v_id;
  -- Os convites que eu tinha neste torneio deixam de fazer sentido.
  delete from torneio_membros where torneio_id = t.id and perfil_id = me.id and estado = 'convidado';
  insert into torneio_membros (equipa_id, perfil_id, torneio_id, funcao, estado, convidado_por, respondido_em)
  values (v_id, me.id, t.id, p_funcao, 'aceite', me.id, now());
  return v_id;
end $$;

create or replace function public.torneio_renomear_equipa(p_equipa uuid, p_nome text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
  v_nome text := trim(coalesce(p_nome, ''));
begin
  if char_length(v_nome) < 2 or char_length(v_nome) > 32 then raise exception 'O nome da equipa tem entre 2 e 32 letras.'; end if;
  if exists (select 1 from torneio_equipas where torneio_id = e.torneio_id and id <> e.id and lower(trim(nome)) = lower(v_nome)) then
    raise exception 'Já existe uma equipa com esse nome neste torneio.';
  end if;
  update torneio_equipas set nome = v_nome, atualizada_em = now() where id = e.id;
end $$;

/** Convida pelo nome: a pessoa tem de aceitar. Devolve quem foi convidado. */
create or replace function public.torneio_convidar(p_equipa uuid, p_nome text, p_funcao text default 'jogador') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
  alvo profiles;
  v_msg text;
begin
  perform _torneio_funcao_valida(p_funcao);
  alvo := _torneio_achar_jogador(p_nome);
  if not _torneio_perfil_valido(alvo) then raise exception 'Esse jogador ainda não ligou o Riot ID, por isso não pode jogar torneios.'; end if;
  if exists (select 1 from torneio_membros where torneio_id = e.torneio_id and perfil_id = alvo.id and estado = 'aceite') then
    raise exception 'Esse jogador já está numa equipa deste torneio.';
  end if;
  if exists (select 1 from torneio_membros where equipa_id = e.id and perfil_id = alvo.id) then
    raise exception 'Já convidaste esse jogador.';
  end if;
  if not _torneio_lugar_livre(e.id, p_funcao) then
    v_msg := case p_funcao when 'jogador' then 'A equipa já tem os 5 jogadores (contando os convites por aceitar).'
      when 'coach' then 'A equipa já tem coach.' else 'A equipa já tem os 2 suplentes.' end;
    raise exception '%', v_msg;
  end if;
  insert into torneio_membros (equipa_id, perfil_id, torneio_id, funcao, estado, convidado_por)
  values (e.id, alvo.id, e.torneio_id, p_funcao, 'convidado', me.id);
  update torneio_equipas set atualizada_em = now() where id = e.id;
  return jsonb_build_object('perfilId', alvo.id, 'utilizador', _nome(alvo), 'riotId', alvo.riot_id);
end $$;

/** A staff mete alguém na equipa sem convite (para emendar à última hora e para testes). */
create or replace function public.torneio_staff_adicionar(p_equipa uuid, p_nome text, p_funcao text default 'jogador') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
  alvo profiles;
begin
  perform _torneio_funcao_valida(p_funcao);
  alvo := _torneio_achar_jogador(p_nome, (select teste from torneios where id = e.torneio_id));
  if not _torneio_perfil_valido(alvo) then raise exception 'Esse jogador ainda não ligou o Riot ID.'; end if;
  if exists (select 1 from torneio_membros where torneio_id = e.torneio_id and perfil_id = alvo.id and estado = 'aceite') then
    raise exception 'Esse jogador já está numa equipa deste torneio.';
  end if;
  delete from torneio_membros where equipa_id = e.id and perfil_id = alvo.id;
  if not _torneio_lugar_livre(e.id, p_funcao) then raise exception 'Essa equipa já não tem lugar para essa função.'; end if;
  insert into torneio_membros (equipa_id, perfil_id, torneio_id, funcao, estado, convidado_por, respondido_em)
  values (e.id, alvo.id, e.torneio_id, p_funcao, 'aceite', me.id, now());
  delete from torneio_membros where torneio_id = e.torneio_id and perfil_id = alvo.id and estado = 'convidado';
  update torneio_equipas set atualizada_em = now() where id = e.id;
  return jsonb_build_object('perfilId', alvo.id, 'utilizador', _nome(alvo), 'riotId', alvo.riot_id);
end $$;

create or replace function public.torneio_responder_convite(p_equipa uuid, p_aceitar boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  m torneio_membros;
  t torneios;
begin
  select * into m from torneio_membros where equipa_id = p_equipa and perfil_id = me.id and estado = 'convidado';
  if not found then raise exception 'Esse convite já não existe.'; end if;
  select * into t from torneios where id = m.torneio_id;
  if not coalesce(p_aceitar, false) then
    delete from torneio_membros where equipa_id = m.equipa_id and perfil_id = me.id;
    return;
  end if;
  if not _torneio_inscricoes_abertas(t) then raise exception 'As inscrições já fecharam: já não podes aceitar este convite.'; end if;
  if not _torneio_perfil_valido(me) then raise exception 'Liga o teu Riot ID no perfil antes de aceitares.'; end if;
  if exists (select 1 from torneio_membros where torneio_id = t.id and perfil_id = me.id and estado = 'aceite') then
    raise exception 'Já estás numa equipa deste torneio.';
  end if;
  update torneio_membros set estado = 'aceite', respondido_em = now() where equipa_id = m.equipa_id and perfil_id = me.id;
  -- Aceitar uma equipa apaga os outros convites deste torneio.
  delete from torneio_membros where torneio_id = t.id and perfil_id = me.id and estado = 'convidado';
  update torneio_equipas set atualizada_em = now() where id = m.equipa_id;
end $$;

create or replace function public.torneio_remover_membro(p_equipa uuid, p_perfil uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
begin
  if p_perfil = e.capitao_id then raise exception 'O capitão não sai da equipa: apaga a equipa ou pede à staff.'; end if;
  delete from torneio_membros where equipa_id = e.id and perfil_id = p_perfil;
  if not found then raise exception 'Esse jogador não está na equipa.'; end if;
  update torneio_equipas set atualizada_em = now() where id = e.id;
end $$;

create or replace function public.torneio_mudar_funcao(p_equipa uuid, p_perfil uuid, p_funcao text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
  m torneio_membros;
begin
  perform _torneio_funcao_valida(p_funcao);
  select * into m from torneio_membros where equipa_id = e.id and perfil_id = p_perfil;
  if not found then raise exception 'Esse jogador não está na equipa.'; end if;
  if m.funcao = p_funcao then return; end if;
  if p_perfil = e.capitao_id and p_funcao = 'suplente' then raise exception 'O capitão joga ou é o coach.'; end if;
  if not _torneio_lugar_livre(e.id, p_funcao) then raise exception 'Já não há lugar para essa função na equipa.'; end if;
  update torneio_membros set funcao = p_funcao where equipa_id = e.id and perfil_id = p_perfil;
  update torneio_equipas set atualizada_em = now() where id = e.id;
end $$;

create or replace function public.torneio_sair_equipa(p_equipa uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas;
  t torneios;
begin
  select * into e from torneio_equipas where id = p_equipa;
  if not found then raise exception 'Equipa não encontrada.'; end if;
  select * into t from torneios where id = e.torneio_id;
  if e.capitao_id = me.id then raise exception 'O capitão não sai da equipa: apaga a equipa ou pede à staff.'; end if;
  if not _torneio_inscricoes_abertas(t) then raise exception 'As inscrições já fecharam: pede à staff para mudar a equipa.'; end if;
  delete from torneio_membros where equipa_id = e.id and perfil_id = me.id;
  if not found then raise exception 'Não estás nessa equipa.'; end if;
  update torneio_equipas set atualizada_em = now() where id = e.id;
end $$;

create or replace function public.torneio_apagar_equipa(p_equipa uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  e torneio_equipas := _torneio_editar_equipa(p_equipa, me);
  t torneios;
begin
  select * into t from torneios where id = e.torneio_id;
  if t.estado not in ('rascunho', 'inscricoes') then raise exception 'O sorteio já foi feito: pede à staff (um jogo perdido por falta de comparência resolve-se na Staff).'; end if;
  delete from torneio_equipas where id = e.id;
end $$;

-- ---------------------------------------------------------------- staff: o torneio

/** A lista de mapas dos dados do site ("poolMapas": ["Ascent", ...]); vazia ou ausente = a rotação do hub (null). */
create or replace function public._torneio_pool_dos_dados(p jsonb) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare v text[];
begin
  if p -> 'poolMapas' is null or jsonb_typeof(p -> 'poolMapas') <> 'array' or jsonb_array_length(p -> 'poolMapas') = 0 then return null; end if;
  select array_agg(distinct x) into v from jsonb_array_elements_text(p -> 'poolMapas') x;
  if exists (select 1 from unnest(v) x where not (x = any (_mapas()))) then raise exception 'Há um mapa que não existe no Valorant.'; end if;
  if array_length(v, 1) < 3 then raise exception 'A lista de mapas do torneio precisa de pelo menos 3 mapas.'; end if;
  return array(select x from unnest(_mapas()) x where x = any (v));
end $$;

create or replace function public.torneio_criar(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  v_id uuid;
  v_teste boolean := coalesce((p ->> 'teste')::boolean, false);
  v_pool text[] := _torneio_pool_dos_dados(p);
  v_melhor int := coalesce((p ->> 'melhorDe')::int, 1);
begin
  if char_length(trim(coalesce(p ->> 'nome', ''))) < 3 then raise exception 'O torneio precisa de um nome (pelo menos 3 letras).'; end if;
  if p ->> 'inscricoesAte' is null then raise exception 'Falta a data limite das inscrições.'; end if;
  if v_melhor not in (1, 3, 5) then raise exception 'Escolhe melhor de 1, 3 ou 5.'; end if;
  if v_melhor > 1 and not coalesce((p ->> 'vetoMapas')::boolean, true) then raise exception 'Os jogos à melhor de 3 ou 5 precisam dos picks e bans de mapas: liga-os ou deixa os jogos à melhor de 1.'; end if;
  if v_melhor > coalesce(array_length(coalesce(v_pool, _pool_ativa()), 1), 0) then
    raise exception 'Para jogar à melhor de % são precisos pelo menos % mapas em jogo (há %).', v_melhor, v_melhor, coalesce(array_length(coalesce(v_pool, _pool_ativa()), 1), 0);
  end if;
  insert into torneios (nome, descricao, tamanho_grupo, passam_por_grupo, final_presencial, veto_mapas, melhor_de, pool_mapas, min_jogadores, inscricoes_ate, inicio, max_equipas, teste, publico, criado_por)
  values (
    trim(p ->> 'nome'), nullif(trim(coalesce(p ->> 'descricao', '')), ''),
    coalesce((p ->> 'tamanhoGrupo')::int, 4), coalesce((p ->> 'passamPorGrupo')::int, 2),
    coalesce((p ->> 'finalPresencial')::boolean, false),
    coalesce((p ->> 'vetoMapas')::boolean, true), v_melhor, v_pool,
    coalesce((p ->> 'minJogadores')::int, case when v_teste then 2 else 8 end),
    (p ->> 'inscricoesAte')::timestamptz, nullif(p ->> 'inicio', '')::timestamptz,
    nullif(p ->> 'maxEquipas', '')::int, v_teste, coalesce((p ->> 'publico')::boolean, false), me.id
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.torneio_editar(p_torneio uuid, p jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios;
begin
  select * into t from torneios where id = p_torneio for update;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  if t.estado in ('concluido', 'cancelado') then raise exception 'Este torneio já acabou.'; end if;
  if t.estado not in ('rascunho', 'inscricoes') and (p ? 'tamanhoGrupo' or p ? 'passamPorGrupo') then
    raise exception 'O formato dos grupos já não se muda depois do sorteio.';
  end if;
  if coalesce((p ->> 'melhorDe')::int, t.melhor_de) not in (1, 3, 5) then raise exception 'Escolhe melhor de 1, 3 ou 5.'; end if;
  if coalesce((p ->> 'melhorDe')::int, t.melhor_de) > 1 and not coalesce((p ->> 'vetoMapas')::boolean, t.veto_mapas) then raise exception 'Os jogos à melhor de 3 ou 5 precisam dos picks e bans de mapas: liga-os ou deixa os jogos à melhor de 1.'; end if;
  if coalesce((p ->> 'melhorDe')::int, t.melhor_de) > coalesce(array_length(coalesce(case when p ? 'poolMapas' then _torneio_pool_dos_dados(p) else t.pool_mapas end, _pool_ativa()), 1), 0) then
    raise exception 'Para jogar à melhor de % são precisos pelo menos % mapas em jogo (há %).', coalesce((p ->> 'melhorDe')::int, t.melhor_de), coalesce((p ->> 'melhorDe')::int, t.melhor_de),
      coalesce(array_length(coalesce(case when p ? 'poolMapas' then _torneio_pool_dos_dados(p) else t.pool_mapas end, _pool_ativa()), 1), 0);
  end if;
  update torneios set
    nome = coalesce(nullif(trim(p ->> 'nome'), ''), nome),
    descricao = case when p ? 'descricao' then nullif(trim(coalesce(p ->> 'descricao', '')), '') else descricao end,
    tamanho_grupo = coalesce((p ->> 'tamanhoGrupo')::int, tamanho_grupo),
    passam_por_grupo = coalesce((p ->> 'passamPorGrupo')::int, passam_por_grupo),
    final_presencial = coalesce((p ->> 'finalPresencial')::boolean, final_presencial),
    veto_mapas = coalesce((p ->> 'vetoMapas')::boolean, veto_mapas),
    melhor_de = coalesce((p ->> 'melhorDe')::int, melhor_de),
    pool_mapas = case when p ? 'poolMapas' then _torneio_pool_dos_dados(p) else pool_mapas end,
    min_jogadores = coalesce((p ->> 'minJogadores')::int, min_jogadores),
    inscricoes_ate = coalesce((p ->> 'inscricoesAte')::timestamptz, inscricoes_ate),
    inicio = case when p ? 'inicio' then nullif(p ->> 'inicio', '')::timestamptz else inicio end,
    max_equipas = case when p ? 'maxEquipas' then nullif(p ->> 'maxEquipas', '')::int else max_equipas end,
    publico = coalesce((p ->> 'publico')::boolean, publico),
    atualizado_em = now()
  where id = p_torneio;
  -- A final presencial vale para os playoffs que já existam.
  if p ? 'finalPresencial' then
    update torneio_jogos set presencial = coalesce((p ->> 'finalPresencial')::boolean, false)
    where torneio_id = p_torneio and fase = 'playoff' and rotulo = 'final' and estado in ('pendente', 'agendado');
  end if;
end $$;

/** Publicar (rascunho > inscrições), voltar a rascunho (sem equipas) ou cancelar. */
create or replace function public.torneio_mudar_estado(p_torneio uuid, p_estado text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios;
begin
  select * into t from torneios where id = p_torneio for update;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  if p_estado = 'inscricoes' then
    if t.estado <> 'rascunho' then raise exception 'Só um rascunho se publica.'; end if;
  elsif p_estado = 'rascunho' then
    if t.estado <> 'inscricoes' then raise exception 'Só se volta a rascunho antes do sorteio.'; end if;
    if exists (select 1 from torneio_equipas where torneio_id = t.id) then raise exception 'Já há equipas inscritas: apaga-as primeiro.'; end if;
  elsif p_estado = 'cancelado' then
    if t.estado in ('concluido', 'cancelado') then raise exception 'Este torneio já acabou.'; end if;
  else
    raise exception 'Estado inválido.';
  end if;
  update torneios set estado = p_estado, atualizado_em = now() where id = t.id;
end $$;

create or replace function public.torneio_apagar(p_torneio uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios;
begin
  select * into t from torneios where id = p_torneio;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  if not (t.estado in ('rascunho', 'cancelado') or t.teste) then
    raise exception 'Um torneio a sério não se apaga: cancela-o.';
  end if;
  delete from torneios where id = t.id;
end $$;

/** Dá (ou tira) a um jogador o acesso a um torneio que ainda não está aberto a todos. */
create or replace function public.torneio_acesso(p_torneio uuid, p_nome text, p_dar boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios;
  alvo profiles;
begin
  select * into t from torneios where id = p_torneio;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  alvo := _torneio_achar_jogador(p_nome);
  if coalesce(p_dar, true) then
    insert into torneio_acessos (torneio_id, perfil_id) values (t.id, alvo.id) on conflict do nothing;
  else
    delete from torneio_acessos where torneio_id = t.id and perfil_id = alvo.id;
  end if;
  return jsonb_build_object('perfilId', alvo.id, 'utilizador', _nome(alvo), 'riotId', alvo.riot_id);
end $$;

create or replace function public.torneio_acessos_lista(p_torneio uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('perfilId', p.id, 'utilizador', _nome(p), 'riotId', p.riot_id, 'avatarUrl', p.avatar_url) order by p.username)
    from torneio_acessos a join profiles p on p.id = a.perfil_id where a.torneio_id = p_torneio
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- staff: sorteio e calendário

/** A menor potência de 2 que chega para n (1, 2, 4, 8...). */
create or replace function public._torneio_proximo_pot(n int) returns int
language plpgsql immutable as $$
declare v int := 1;
begin
  while v < n loop v := v * 2; end loop;
  return v;
end $$;

/** Todos contra todos num grupo (método do círculo): uma jornada por ronda, cada equipa joga uma vez por jornada. */
create or replace function public._torneio_calendario_grupo(p_torneio uuid, p_grupo int, p_equipas uuid[]) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v uuid[] := p_equipas;
  n int;
  r int; i int; k int;
  a uuid; b uuid;
begin
  if array_length(v, 1) % 2 = 1 then v := array_append(v, null::uuid); end if;
  n := array_length(v, 1);
  for r in 1..(n - 1) loop
    k := 0;
    for i in 1..(n / 2) loop
      a := v[i]; b := v[n + 1 - i];
      if a is not null and b is not null then
        k := k + 1;
        insert into torneio_jogos (torneio_id, fase, grupo, ronda, ordem, rotulo, equipa_a, equipa_b)
        values (p_torneio, 'grupo', p_grupo, r, k, 'jornada', a, b);
      end if;
    end loop;
    -- O primeiro fica parado e os outros rodam.
    v := array_cat(array_append(array[v[1]], v[n]), v[2:n - 1]);
  end loop;
end $$;

/**
 * O sorteio: só entram equipas completas (5 jogadores aceites). Fecha as inscrições e reparte as equipas
 * por grupos do tamanho certo. Pode repetir-se enquanto nenhum jogo tiver começado. Com a mesma seed
 * (p_seed) dá sempre o mesmo resultado, que fica guardado para se poder provar.
 */
create or replace function public.torneio_sortear(p_torneio uuid, p_seed double precision default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios;
  v_ids uuid[];
  v_n int;
  v_g int;
  v_seed double precision;
  v_i int;
  v_min int;
  v_j int;
  v_tmp uuid;
  v_grupo uuid[];
begin
  select * into t from torneios where id = p_torneio for update;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  if t.estado not in ('inscricoes', 'grupos') then raise exception 'O torneio não está na fase de inscrições nem de grupos.'; end if;
  if exists (select 1 from torneio_jogos where torneio_id = t.id and estado in ('a_decorrer', 'concluido')) then
    raise exception 'Já há jogos a decorrer ou terminados: já não se pode repetir o sorteio.';
  end if;

  select coalesce(array_agg(e.id order by e.id), '{}') into v_ids
  from torneio_equipas e
  where e.torneio_id = t.id and e.estado = 'inscrita'
    and (select count(*) from torneio_membros m where m.equipa_id = e.id and m.estado = 'aceite' and m.funcao = 'jogador') >= 5;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n < 4 then raise exception 'São precisas pelo menos 4 equipas completas (5 jogadores aceites) e há %.', v_n; end if;
  v_g := ceil(v_n::numeric / t.tamanho_grupo)::int;
  v_min := v_n / v_g;
  if v_min <= t.passam_por_grupo then raise exception 'Com % equipas os grupos ficavam demasiado pequenos para passarem % de cada. Muda o formato.', v_n, t.passam_por_grupo; end if;

  v_seed := coalesce(p_seed, (random() * 2 - 1));
  if v_seed < -1 or v_seed > 1 then raise exception 'A seed fica entre -1 e 1.'; end if;
  perform setseed(v_seed);

  -- Recomeça: apaga os jogos e os grupos do sorteio anterior.
  delete from torneio_jogos where torneio_id = t.id;
  update torneio_equipas set grupo = null, ordem_sorteio = null where torneio_id = t.id;

  -- Fisher-Yates sobre as equipas ordenadas por id: com a mesma seed sai sempre a mesma ordem.
  for v_i in reverse v_n..2 loop
    v_j := 1 + floor(random() * v_i)::int;
    v_tmp := v_ids[v_i]; v_ids[v_i] := v_ids[v_j]; v_ids[v_j] := v_tmp;
  end loop;
  for v_i in 1..v_n loop
    update torneio_equipas set grupo = ((v_i - 1) % v_g) + 1, ordem_sorteio = ((v_i - 1) / v_g) + 1, atualizada_em = now() where id = v_ids[v_i];
  end loop;

  for v_i in 1..v_g loop
    select array_agg(e.id order by e.ordem_sorteio) into v_grupo from torneio_equipas e where e.torneio_id = t.id and e.grupo = v_i;
    perform _torneio_calendario_grupo(t.id, v_i, v_grupo);
  end loop;

  update torneios set estado = 'grupos', inscricoes_ate = least(inscricoes_ate, now()), sorteio_seed = v_seed, sorteado_em = now(),
    campeao_id = null, atualizado_em = now() where id = t.id;
  return jsonb_build_object('grupos', v_g, 'equipas', v_n, 'seed', v_seed);
end $$;

create or replace function public._torneio_recalcular_estado(p_jogo uuid) returns void
language sql volatile security definer set search_path = public as $$
  update torneio_jogos set estado = case when equipa_a is not null and equipa_b is not null and agendado_para is not null then 'agendado' else 'pendente' end,
    atualizado_em = now()
  where id = p_jogo and estado in ('pendente', 'agendado')
$$;

create or replace function public.torneio_agendar(p_jogo uuid, p_quando timestamptz, p_mapa text default null, p_presencial boolean default null, p_melhor_de int default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
  t torneios;
  v_atual int;
  v_n int;
  v_mapa boolean := p_mapa is not null and trim(p_mapa) <> '';
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if j.estado in ('a_decorrer', 'concluido') then raise exception 'Este jogo já começou.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if v_mapa and not (trim(p_mapa) = any (_mapas())) then raise exception 'Mapa desconhecido: %.', p_mapa; end if;
  if p_melhor_de is not null and p_melhor_de not in (1, 3, 5) then raise exception 'Escolhe melhor de 1, 3 ou 5.'; end if;
  v_atual := coalesce(j.melhor_de, t.melhor_de);
  v_n := coalesce(p_melhor_de, v_atual);
  if p_melhor_de > 1 and not t.veto_mapas then raise exception 'Os jogos à melhor de 3 ou 5 precisam dos picks e bans de mapas: liga-os ou deixa os jogos à melhor de 1.'; end if;
  if j.serie_a + j.serie_b > 0 and (v_mapa or v_n <> v_atual) then
    raise exception 'A série já começou: desfaz o jogo para mudares o formato ou o mapa.';
  end if;
  if v_n <> v_atual then
    if j.estado = 'veto' or j.lado_escolha is not null then raise exception 'Reinicia primeiro os picks e bans deste jogo para mudares o formato.'; end if;
    if v_n > coalesce(array_length(_torneio_veto_pool(t), 1), 0) then
      raise exception 'Para jogar à melhor de % são precisos pelo menos % mapas em jogo (há %).', v_n, v_n, coalesce(array_length(_torneio_veto_pool(t), 1), 0);
    end if;
  end if;
  if v_mapa and v_n > 1 then
    raise exception 'Num jogo à melhor de % os mapas saem dos picks e bans: muda o jogo para melhor de 1 para fixares o mapa.', v_n;
  end if;
  update torneio_jogos set agendado_para = p_quando, presencial = coalesce(p_presencial, presencial), atualizado_em = now()
  where id = p_jogo;
  -- Mudar o formato (null = como o torneio). Numa série o mapa fixado à mão cai: os mapas saem dos picks e bans.
  if p_melhor_de is not null then
    update torneio_jogos set melhor_de = case when p_melhor_de = t.melhor_de then null else p_melhor_de end,
      mapa = case when p_melhor_de > 1 and mapa_staff then null else mapa end,
      mapa_staff = case when p_melhor_de > 1 then false else mapa_staff end
    where id = p_jogo;
  end if;
  -- O mapa só muda se vier (null = deixar como está; vazio = tirar o que a staff pôs). Pôr um mapa à mão dispensa os picks e bans.
  if v_mapa then
    delete from torneio_jogo_vetos where jogo_id = j.id;
    update torneio_jogos set mapa = trim(p_mapa), mapa_staff = true, pool_mapas = null, veto_melhor_de = null, veto_prazo = null,
      lado_equipa = null, lado_escolha = null, estado = case when estado = 'veto' then 'pendente' else estado end where id = j.id;
  elsif p_mapa is not null and j.mapa_staff then
    update torneio_jogos set mapa = null, mapa_staff = false where id = j.id;
  end if;
  perform _torneio_recalcular_estado(p_jogo);
end $$;

/** Vários de uma vez: [{ "jogo": uuid, "quando": iso|null, "mapa": text|null, "presencial": bool|null, "melhorDe": 1|3|5|null }]. */
create or replace function public.torneio_agendar_varios(p_itens jsonb) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  x jsonb;
  n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    perform torneio_agendar((x ->> 'jogo')::uuid, nullif(x ->> 'quando', '')::timestamptz, x ->> 'mapa', (x ->> 'presencial')::boolean, (x ->> 'melhorDe')::int);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- picks e bans de mapas

/**
 * Faz o passo que falta (ban, escolha de mapa ou lado). No último passo (o lado do decisivo) os picks e bans
 * fecham: ficam os mapas da série e o jogo volta a "agendado", pronto para o capitão criar o grupo. Num melhor
 * de 1 o mapa fica à vista logo que acabam os bans (falta só o lado).
 */
create or replace function public._torneio_veto_fazer(p_jogo uuid, p_valor text, p_por uuid, p_auto boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  v_vez jsonb;
  v_tipo text;
  v_equipa text;
  v_ordem int;
  v_total int;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found or j.estado <> 'veto' then raise exception 'Os picks e bans deste jogo não estão a decorrer.'; end if;
  v_vez := _torneio_veto_vez(j);
  if v_vez is null then raise exception 'Os picks e bans já acabaram.'; end if;
  v_tipo := v_vez ->> 'tipo';
  v_equipa := v_vez ->> 'equipa';
  v_ordem := (v_vez ->> 'ordem')::int;
  v_total := jsonb_array_length(_torneio_veto_passos(j.veto_melhor_de, array_length(j.pool_mapas, 1)));
  if v_tipo = 'lado' then
    if p_valor is null or p_valor not in ('ataque', 'defesa') then raise exception 'Escolhe Ataque ou Defesa.'; end if;
  elsif p_valor is null or not (p_valor = any (j.pool_mapas))
    or exists (select 1 from torneio_jogo_vetos v where v.jogo_id = j.id and v.tipo in ('ban', 'pick') and v.valor = p_valor) then
    raise exception 'Esse mapa já não está disponível.';
  end if;
  insert into torneio_jogo_vetos (jogo_id, ordem, tipo, valor, equipa, por, auto) values (j.id, v_ordem, v_tipo, p_valor, v_equipa, p_por, coalesce(p_auto, false));
  if v_ordem = v_total then
    perform _torneio_veto_fechar(j.id);
  else
    update torneio_jogos set veto_prazo = now() + interval '90 seconds', atualizado_em = now(),
      mapa = case when j.veto_melhor_de = 1 and v_ordem = v_total - 1 then (
        select m from unnest(j.pool_mapas) m
        where not exists (select 1 from torneio_jogo_vetos v where v.jogo_id = j.id and v.tipo in ('ban', 'pick') and v.valor = m) limit 1
      ) else mapa end
    where id = j.id;
  end if;
end $$;

/**
 * Acabaram os picks e bans: os mapas escolhidos (e o decisivo, o que sobrou) ficam na ordem de jogo, cada um com o
 * lado de quem o escolheu. Num melhor de 1 fica só o mapa do jogo. O jogo passa a jogar o primeiro mapa.
 */
create or replace function public._torneio_veto_fechar(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  r record;
  v_mapas text[] := '{}';
  v_por text[] := '{}';
  v_lado_eq text[] := '{}';
  v_lado text[] := '{}';
  v_decisivo text;
  i int;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  for r in select * from torneio_jogo_vetos where jogo_id = j.id order by ordem loop
    if r.tipo = 'pick' then
      v_mapas := v_mapas || r.valor;
      v_por := v_por || r.equipa;
    elsif r.tipo = 'lado' then
      v_lado_eq := v_lado_eq || r.equipa;
      v_lado := v_lado || r.valor;
    end if;
  end loop;
  select m into v_decisivo from unnest(j.pool_mapas) m
  where not exists (select 1 from torneio_jogo_vetos v where v.jogo_id = j.id and v.tipo in ('ban', 'pick') and v.valor = m) limit 1;
  v_mapas := v_mapas || v_decisivo;
  v_por := v_por || 'decisivo'::text;
  delete from torneio_jogo_mapas where jogo_id = j.id;
  if j.veto_melhor_de > 1 then
    for i in 1..array_length(v_mapas, 1) loop
      insert into torneio_jogo_mapas (jogo_id, ordem, mapa, escolhida_por, lado_equipa, lado_escolha)
      values (j.id, i, v_mapas[i], v_por[i], v_lado_eq[i], v_lado[i]);
    end loop;
  end if;
  update torneio_jogos set mapa = v_mapas[1], lado_equipa = v_lado_eq[1], lado_escolha = v_lado[1], veto_prazo = null,
    serie_a = 0, serie_b = 0, estado = case when agendado_para is not null then 'agendado' else 'pendente' end, atualizado_em = now()
  where id = j.id;
end $$;

/** Joga o passo que falta ao calhas (tempo esgotado, capitão bot ou a staff a despachar). */
create or replace function public._torneio_veto_auto(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  v_vez jsonb := null;
  v_valor text;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found or j.estado <> 'veto' then return; end if;
  v_vez := _torneio_veto_vez(j);
  if v_vez is null then return; end if;
  if v_vez ->> 'tipo' = 'lado' then
    v_valor := (array['ataque', 'defesa'])[1 + floor(random() * 2)::int];
  else
    select m into v_valor from unnest(j.pool_mapas) m
    where not exists (select 1 from torneio_jogo_vetos v where v.jogo_id = j.id and v.tipo in ('ban', 'pick') and v.valor = m)
    order by random() limit 1;
  end if;
  perform _torneio_veto_fazer(p_jogo, v_valor, null, true);
end $$;

/** Enquanto for a vez de uma equipa cujo capitão é um bot, o bot joga (só há bots em torneios de teste). */
create or replace function public._torneio_veto_bots(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  v_vez jsonb;
  v_bot boolean;
  k int := 0;
begin
  loop
    select * into j from torneio_jogos where id = p_jogo;
    exit when not found or j.estado <> 'veto' or k >= 30;
    v_vez := _torneio_veto_vez(j);
    exit when v_vez is null;
    select pr.is_bot into v_bot from torneio_equipas e join profiles pr on pr.id = e.capitao_id
    where e.id = case when v_vez ->> 'equipa' = 'A' then j.equipa_a else j.equipa_b end;
    exit when not coalesce(v_bot, false);
    perform _torneio_veto_auto(p_jogo);
    k := k + 1;
  end loop;
end $$;

/** Arranca os picks e bans de um jogo (já validado): apaga o que houvesse e deixa os bots jogar. */
create or replace function public._torneio_veto_comecar(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
  v_pool text[];
  v_n int;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  select * into t from torneios where id = j.torneio_id;
  v_n := coalesce(j.melhor_de, t.melhor_de);
  v_pool := _torneio_veto_pool(t);
  if coalesce(array_length(v_pool, 1), 0) < 3 then raise exception 'A lista de mapas do torneio precisa de pelo menos 3 mapas.'; end if;
  if array_length(v_pool, 1) < v_n then
    raise exception 'Este jogo é à melhor de % e só há % mapas em jogo: junta mais mapas ao torneio.', v_n, array_length(v_pool, 1);
  end if;
  delete from torneio_jogo_vetos where jogo_id = j.id;
  delete from torneio_jogo_mapas where jogo_id = j.id;
  update torneio_jogos set estado = 'veto', pool_mapas = v_pool, veto_melhor_de = v_n, veto_prazo = now() + interval '90 seconds',
    mapa = null, mapa_staff = false, lado_equipa = null, lado_escolha = null, serie_a = 0, serie_b = 0, atualizado_em = now() where id = j.id;
  perform _torneio_veto_bots(j.id);
end $$;

/** Despacha os picks e bans todos ao calhas (staff, ou a simulação). Se ainda não tinham começado, começa-os. */
create or replace function public._torneio_veto_completar(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
  k int := 0;
begin
  select * into j from torneio_jogos where id = p_jogo;
  select * into t from torneios where id = j.torneio_id;
  if not t.veto_mapas or j.presencial or j.mapa_staff or j.equipa_a is null or j.equipa_b is null then return; end if;
  if j.estado in ('a_decorrer', 'concluido') then return; end if;
  if j.estado <> 'veto' then
    if j.lado_escolha is not null then return; end if;
    perform _torneio_veto_comecar(p_jogo);
  end if;
  loop
    select * into j from torneio_jogos where id = p_jogo;
    exit when j.estado <> 'veto' or k >= 30;
    perform _torneio_veto_auto(p_jogo);
    k := k + 1;
  end loop;
end $$;

/** A cada minuto: os picks e bans em que a vez passou do prazo jogam ao calhas. */
create or replace function public._torneio_veto_tick() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
  n int := 0;
begin
  for v_id in select id from torneio_jogos where estado = 'veto' and veto_prazo < now() loop
    perform _torneio_veto_auto(v_id);
    perform _torneio_veto_bots(v_id);
    n := n + 1;
  end loop;
  return n;
end $$;

/** Os capitães das duas equipas (ou a staff) começam os picks e bans, 30 minutos antes da hora marcada. */
create or replace function public.torneio_veto_iniciar(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  j torneio_jogos;
  t torneios;
  v_staff boolean := me.role in ('owner', 'dev');
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if not _torneio_visivel(t, me) then raise exception 'Jogo não encontrado.'; end if;
  if t.estado not in ('grupos', 'playoffs') then raise exception 'O torneio não está a decorrer.'; end if;
  if not t.veto_mapas then raise exception 'Este torneio não tem picks e bans de mapas.'; end if;
  if j.presencial then raise exception 'Este jogo é presencial: o mapa é a staff que o define.'; end if;
  if j.equipa_a is null or j.equipa_b is null then raise exception 'Este jogo ainda não tem as duas equipas.'; end if;
  if j.estado = 'veto' then raise exception 'Os picks e bans já começaram.'; end if;
  if j.estado in ('a_decorrer', 'concluido') then raise exception 'Este jogo já começou.'; end if;
  if j.mapa_staff then raise exception 'A staff já definiu o mapa deste jogo.'; end if;
  if j.lado_escolha is not null then raise exception 'Os picks e bans deste jogo já acabaram.'; end if;
  if not (v_staff or exists (select 1 from torneio_equipas e where e.id in (j.equipa_a, j.equipa_b) and e.capitao_id = me.id)) then
    raise exception 'Só os capitães das duas equipas começam os picks e bans.';
  end if;
  if not (v_staff or t.teste) and (j.agendado_para is null or now() < j.agendado_para - interval '30 minutes') then
    raise exception 'Ainda é cedo: os picks e bans abrem 30 minutos antes da hora marcada.';
  end if;
  perform _torneio_veto_comecar(p_jogo);
end $$;

/** O capitão da equipa da vez escolhe (mapa para banir ou escolher, ou o lado). A staff joga por qualquer uma. */
create or replace function public.torneio_veto_agir(p_jogo uuid, p_valor text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  j torneio_jogos;
  t torneios;
  v_vez jsonb;
  v_cap uuid;
  v_outro uuid;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if not _torneio_visivel(t, me) then raise exception 'Jogo não encontrado.'; end if;
  if j.estado <> 'veto' then raise exception 'Os picks e bans deste jogo não estão a decorrer.'; end if;
  v_vez := _torneio_veto_vez(j);
  if v_vez is null then raise exception 'Os picks e bans já acabaram.'; end if;
  select e.capitao_id into v_cap from torneio_equipas e where e.id = case when v_vez ->> 'equipa' = 'A' then j.equipa_a else j.equipa_b end;
  select e.capitao_id into v_outro from torneio_equipas e where e.id = case when v_vez ->> 'equipa' = 'A' then j.equipa_b else j.equipa_a end;
  if not (me.role in ('owner', 'dev') or me.id = v_cap) then
    if me.id = v_outro then raise exception 'Não é a tua vez: espera pela outra equipa.'; end if;
    raise exception 'Só os capitães das duas equipas escolhem os mapas.';
  end if;
  perform _torneio_veto_fazer(p_jogo, trim(coalesce(p_valor, '')), me.id, false);
  perform _torneio_veto_bots(p_jogo);
end $$;

/** Passou o tempo da vez? Joga ao calhas por quem não jogou. Qualquer pessoa com a página aberta o pode pedir. */
create or replace function public.torneio_veto_avancar(p_jogo uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  j torneio_jogos;
  t torneios;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if not _torneio_visivel(t, me) then raise exception 'Jogo não encontrado.'; end if;
  if j.estado <> 'veto' or j.veto_prazo is null or j.veto_prazo > now() then return false; end if;
  perform _torneio_veto_auto(p_jogo);
  perform _torneio_veto_bots(p_jogo);
  return true;
end $$;

/** Staff: joga ao calhas o que falta dos picks e bans (se ainda não tinham começado, começa-os). */
create or replace function public.torneio_veto_concluir(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
  t torneios;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if not t.veto_mapas then raise exception 'Este torneio não tem picks e bans de mapas.'; end if;
  if j.presencial then raise exception 'Este jogo é presencial: o mapa é a staff que o define.'; end if;
  if j.equipa_a is null or j.equipa_b is null then raise exception 'Este jogo ainda não tem as duas equipas.'; end if;
  if j.estado in ('a_decorrer', 'concluido') then raise exception 'Este jogo já começou.'; end if;
  if j.mapa_staff then raise exception 'O mapa deste jogo foi posto pela staff.'; end if;
  perform _torneio_veto_completar(p_jogo);
end $$;

/** Staff: apaga os picks e bans do jogo (e o mapa que saiu deles) para se fazerem de novo. */
create or replace function public.torneio_veto_reiniciar(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if j.estado in ('a_decorrer', 'concluido') then raise exception 'Este jogo já começou.'; end if;
  if j.serie_a + j.serie_b > 0 then raise exception 'A série já começou: desfaz o jogo para refazeres os picks e bans.'; end if;
  delete from torneio_jogo_vetos where jogo_id = j.id;
  delete from torneio_jogo_mapas where jogo_id = j.id;
  update torneio_jogos set pool_mapas = null, veto_melhor_de = null, veto_prazo = null, lado_equipa = null, lado_escolha = null,
    mapa = case when mapa_staff then mapa else null end,
    estado = case when equipa_a is not null and equipa_b is not null and agendado_para is not null then 'agendado' else 'pendente' end,
    atualizado_em = now()
  where id = j.id;
end $$;

-- ---------------------------------------------------------------- o jogo

/**
 * O capitão de uma das equipas (ou a staff) diz que o grupo está criado e partilha o código: o jogo passa a
 * decorrer e o resultado é detetado na API. Pode voltar a chamar-se para trocar o código.
 */
create or replace function public.torneio_abrir_jogo(p_jogo uuid, p_codigo text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  j torneio_jogos;
  t torneios;
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id;
  if not _torneio_visivel(t, me) then raise exception 'Jogo não encontrado.'; end if;
  if t.estado not in ('grupos', 'playoffs') then raise exception 'O torneio não está a decorrer.'; end if;
  if j.equipa_a is null or j.equipa_b is null then raise exception 'Este jogo ainda não tem as duas equipas.'; end if;
  if j.presencial then raise exception 'Este jogo é presencial: o resultado é posto pela staff.'; end if;
  if j.estado = 'concluido' then raise exception 'Este jogo já tem resultado.'; end if;
  if not (me.role in ('owner', 'dev') or exists (
    select 1 from torneio_equipas e where e.id in (j.equipa_a, j.equipa_b) and e.capitao_id = me.id
  )) then raise exception 'Só os capitães das duas equipas abrem o jogo.'; end if;
  if j.estado = 'veto' then raise exception 'Os picks e bans ainda não acabaram.'; end if;
  if t.veto_mapas and j.mapa is null then raise exception 'Faltam os picks e bans de mapas: começa-os antes de abrir o jogo.'; end if;
  if not (me.role in ('owner', 'dev') or t.teste) and j.serie_a + j.serie_b = 0 and (j.agendado_para is null or now() < j.agendado_para - interval '30 minutes') then
    raise exception 'Ainda é cedo: o jogo abre 30 minutos antes da hora marcada.';
  end if;
  if v_codigo !~ '^[A-Z0-9]{6}$' then raise exception 'O código do grupo tem 6 letras ou números.'; end if;
  insert into torneio_jogo_segredos (jogo_id, codigo) values (j.id, v_codigo)
  on conflict (jogo_id) do update set codigo = excluded.codigo;
  update torneio_jogos set estado = 'a_decorrer', comecou_em = coalesce(comecou_em, now()), api_checked_at = null, atualizado_em = now() where id = j.id;
  -- Numa série, o mapa que se joga agora é o seguinte ao último que acabou.
  update torneio_jogo_mapas set estado = 'a_decorrer', comecou_em = coalesce(comecou_em, now())
  where jogo_id = j.id and ordem = j.serie_a + j.serie_b + 1;
end $$;

-- ---------------------------------------------------------------- resultados

/** Guarda as estatísticas de um mapa (substitui as que houvesse desse mapa). */
create or replace function public._torneio_guardar_stats(p_jogo uuid, p_ordem int, p_stats jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  x jsonb;
begin
  select * into j from torneio_jogos where id = p_jogo;
  delete from torneio_jogo_jogadores where jogo_id = p_jogo and mapa_ordem = p_ordem;
  for x in select * from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) loop
    insert into torneio_jogo_jogadores (jogo_id, mapa_ordem, perfil_id, equipa_id, agente, kills, deaths, assists, acs, first_bloods, trades, hs_pct, kast_pct)
    select j.id, p_ordem, m.perfil_id, m.equipa_id, x ->> 'agente', (x ->> 'kills')::int, (x ->> 'deaths')::int, (x ->> 'assists')::int,
      (x ->> 'acs')::int, (x ->> 'firstBloods')::int, (x ->> 'trades')::int, (x ->> 'hsPct')::int, (x ->> 'kastPct')::int
    from torneio_membros m
    where m.equipa_id in (j.equipa_a, j.equipa_b) and m.estado = 'aceite' and m.perfil_id = (x ->> 'perfilId')::uuid
    on conflict do nothing;
  end loop;
end $$;

/** O jogo (ou a série) acabou com este vencedor: fecha-o, sobe o vencedor na chave e fecha o torneio na final. */
create or replace function public._torneio_fechar_jogo(p_jogo uuid, p_vencedor uuid, p_como text, p_riot_match text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  select * into t from torneios where id = j.torneio_id for update;
  update torneio_jogos set estado = 'concluido', vencedor_id = p_vencedor, como = p_como,
    terminou_em = now(), comecou_em = coalesce(comecou_em, now()), riot_match_id = p_riot_match,
    tem_stats = exists (select 1 from torneio_jogo_jogadores x where x.jogo_id = j.id), atualizado_em = now()
  where id = j.id;
  if j.fase = 'playoff' then
    if j.seguinte_id is not null then
      update torneio_jogos set
        equipa_a = case when j.seguinte_lado = 'a' then p_vencedor else equipa_a end,
        equipa_b = case when j.seguinte_lado = 'b' then p_vencedor else equipa_b end,
        atualizado_em = now()
      where id = j.seguinte_id;
      perform _torneio_recalcular_estado(j.seguinte_id);
    else
      update torneios set campeao_id = p_vencedor, estado = 'concluido', atualizado_em = now() where id = t.id;
    end if;
  elsif not exists (select 1 from torneio_jogos where torneio_id = t.id and fase = 'grupo' and estado <> 'concluido') then
    perform _torneio_gerar_playoffs(t.id);
  end if;
end $$;

/**
 * Chega um resultado. Num jogo à melhor de 1 é o resultado do jogo. Numa série online é o resultado do mapa que se
 * joga agora (o jogo só acaba quando uma equipa chega aos mapas precisos; senão passa ao mapa seguinte). Numa série
 * presencial a staff põe os mapas ganhos de cada equipa. Falta de comparência: a equipa que apareceu ganha a série.
 */
create or replace function public._torneio_aplicar_resultado(p_jogo uuid, p_a int, p_b int, p_stats jsonb, p_como text, p_riot_match text default null) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
  v_n int;
  v_precisa int;
  v_k int;
  v_vencedor uuid;
  v_erro text;
  v_prox torneio_jogo_mapas;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if j.estado = 'concluido' then raise exception 'Este jogo já tem resultado.'; end if;
  if j.equipa_a is null or j.equipa_b is null then raise exception 'Este jogo ainda não tem as duas equipas.'; end if;
  select * into t from torneios where id = j.torneio_id for update;
  if t.estado not in ('grupos', 'playoffs') then raise exception 'O torneio não está a decorrer.'; end if;
  v_n := _torneio_melhor_de(j, t);
  v_precisa := (v_n + 1) / 2;

  -- Falta de comparência numa série: a equipa que apareceu ganha todos os mapas precisos por 13-0.
  if v_n > 1 and p_como = 'walkover' then
    v_vencedor := case when p_a > p_b then j.equipa_a else j.equipa_b end;
    update torneio_jogos set
      serie_a = case when v_vencedor = equipa_a then v_precisa else 0 end, serie_b = case when v_vencedor = equipa_b then v_precisa else 0 end,
      score_a = case when v_vencedor = equipa_a then 13 * v_precisa else 0 end, score_b = case when v_vencedor = equipa_b then 13 * v_precisa else 0 end
    where id = j.id;
    perform _torneio_fechar_jogo(j.id, v_vencedor, p_como, null);
    return;
  end if;

  -- Série presencial: a staff põe os mapas ganhos (o vencedor tem os precisos, o outro menos).
  if v_n > 1 and j.presencial then
    if p_a is null or p_b is null or greatest(p_a, p_b) <> v_precisa or least(p_a, p_b) < 0 or least(p_a, p_b) >= v_precisa then
      raise exception 'Num jogo à melhor de % o vencedor ganha % mapas e o outro menos do que isso.', v_n, v_precisa;
    end if;
    v_vencedor := case when p_a > p_b then j.equipa_a else j.equipa_b end;
    update torneio_jogos set serie_a = p_a, serie_b = p_b, score_a = p_a, score_b = p_b where id = j.id;
    perform _torneio_fechar_jogo(j.id, v_vencedor, p_como, null);
    return;
  end if;

  -- Série online: o resultado de um mapa.
  if v_n > 1 then
    v_erro := _resultado_invalido(p_a, p_b);
    if v_erro is not null then raise exception '%', v_erro; end if;
    if not exists (select 1 from torneio_jogo_mapas where jogo_id = j.id) then
      -- Ainda sem picks e bans (um resultado posto à mão): despacham-se ao calhas.
      perform _torneio_veto_completar(j.id);
      select * into j from torneio_jogos where id = p_jogo for update;
      if not exists (select 1 from torneio_jogo_mapas where jogo_id = j.id) then
        raise exception 'Este jogo é à melhor de % e ainda não tem mapas: faz primeiro os picks e bans.', v_n;
      end if;
    end if;
    v_k := j.serie_a + j.serie_b + 1;
    v_vencedor := case when p_a > p_b then j.equipa_a else j.equipa_b end;
    perform _torneio_guardar_stats(j.id, v_k, p_stats);
    update torneio_jogo_mapas set estado = 'concluido', score_a = p_a, score_b = p_b, vencedor_id = v_vencedor, como = p_como,
      comecou_em = coalesce(comecou_em, now()), terminou_em = now(), riot_match_id = p_riot_match,
      tem_stats = coalesce(jsonb_array_length(p_stats), 0) > 0
    where jogo_id = j.id and ordem = v_k;
    update torneio_jogos set
      serie_a = serie_a + case when v_vencedor = equipa_a then 1 else 0 end, serie_b = serie_b + case when v_vencedor = equipa_b then 1 else 0 end,
      score_a = coalesce(score_a, 0) + p_a, score_b = coalesce(score_b, 0) + p_b, atualizado_em = now()
    where id = j.id returning * into j;
    if j.serie_a >= v_precisa or j.serie_b >= v_precisa then
      perform _torneio_fechar_jogo(j.id, case when j.serie_a >= v_precisa then j.equipa_a else j.equipa_b end, p_como, p_riot_match);
    else
      -- Segue-se o mapa seguinte, com o grupo do Valorant que já existe.
      select * into v_prox from torneio_jogo_mapas where jogo_id = j.id and ordem = v_k + 1;
      update torneio_jogos set mapa = v_prox.mapa, lado_equipa = v_prox.lado_equipa, lado_escolha = v_prox.lado_escolha,
        estado = case when agendado_para is not null then 'agendado' else 'pendente' end,
        comecou_em = null, terminou_em = null, riot_match_id = null, api_checked_at = null, tem_stats = false, atualizado_em = now()
      where id = j.id;
    end if;
    return;
  end if;

  -- Melhor de 1.
  if p_como = 'walkover' then
    null;
  elsif j.presencial and p_como = 'staff' then
    if p_a is null or p_b is null or p_a < 0 or p_b < 0 or p_a = p_b then raise exception 'Põe um resultado com vencedor (não há empates).'; end if;
  else
    v_erro := _resultado_invalido(p_a, p_b);
    if v_erro is not null then raise exception '%', v_erro; end if;
  end if;
  v_vencedor := case when p_a > p_b then j.equipa_a else j.equipa_b end;
  update torneio_jogos set score_a = p_a, score_b = p_b where id = j.id;
  perform _torneio_guardar_stats(j.id, 1, p_stats);
  perform _torneio_fechar_jogo(j.id, v_vencedor, p_como, p_riot_match);
end $$;

/**
 * Os playoffs: passam os melhores de cada grupo e quem perde está fora. Com 2 a passar e um número de grupos
 * potência de 2, o 1.º de um grupo apanha o 2.º do grupo vizinho e as equipas do mesmo grupo só se cruzam na
 * final. Nos outros casos usa a ordem da fase de grupos (melhores posições, vitórias, diferença de rondas)
 * e dá folga aos primeiros.
 */
create or replace function public._torneio_gerar_playoffs(p_torneio uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  t torneios;
  v_g int;
  v_q jsonb;
  v_nq int;
  v_slots jsonb := '[]'::jsonb;
  v_s int := 1;
  v_r int := 0;
  v_ordem int[];
  v_p int;
  k int; i int; r int;
  ga int; gb int;
  sa int; sb int;
  ea uuid; eb uuid;
  oa jsonb; ob jsonb;
  slot jsonb;
  g record;
begin
  select * into t from torneios where id = p_torneio for update;
  if not found or t.estado <> 'grupos' then return; end if;
  if exists (select 1 from torneio_jogos where torneio_id = t.id and fase = 'playoff') then return; end if;
  if exists (select 1 from torneio_jogos where torneio_id = t.id and fase = 'grupo' and estado <> 'concluido') then
    raise exception 'Ainda há jogos de grupo por jogar.';
  end if;

  select count(distinct e.grupo) into v_g from torneio_equipas e where e.torneio_id = t.id and e.grupo is not null;
  select coalesce(jsonb_agg(jsonb_build_object('equipa', c.equipa_id, 'grupo', c.grupo, 'posicao', c.posicao, 'v', c.vitorias, 'd', c.diferenca, 'rg', c.rondas_ganhas)
    order by c.grupo, c.posicao), '[]'::jsonb)
  into v_q from _torneio_classificacao(t.id) c where c.posicao <= t.passam_por_grupo;
  v_nq := jsonb_array_length(v_q);
  if v_nq < 2 then raise exception 'Não há equipas suficientes para os playoffs.'; end if;

  if t.passam_por_grupo = 2 and v_g >= 1 and (v_g & (v_g - 1)) = 0 then
    -- Cruzamentos entre grupos vizinhos.
    if v_g = 1 then
      v_slots := jsonb_build_array(jsonb_build_object(
        'a', (select (x ->> 'equipa') from jsonb_array_elements(v_q) x where (x ->> 'grupo')::int = 1 and (x ->> 'posicao')::int = 1),
        'b', (select (x ->> 'equipa') from jsonb_array_elements(v_q) x where (x ->> 'grupo')::int = 1 and (x ->> 'posicao')::int = 2),
        'oa', jsonb_build_object('tipo', 'grupo', 'grupo', 1, 'posicao', 1), 'ob', jsonb_build_object('tipo', 'grupo', 'grupo', 1, 'posicao', 2)));
    else
      v_p := v_g / 2;
      for k in 0..1 loop
        for i in 0..(v_p - 1) loop
          ga := 2 * i + 1; gb := 2 * i + 2;
          if k = 1 then ga := 2 * i + 2; gb := 2 * i + 1; end if;
          v_slots := v_slots || jsonb_build_array(jsonb_build_object(
            'a', (select (x ->> 'equipa') from jsonb_array_elements(v_q) x where (x ->> 'grupo')::int = ga and (x ->> 'posicao')::int = 1),
            'b', (select (x ->> 'equipa') from jsonb_array_elements(v_q) x where (x ->> 'grupo')::int = gb and (x ->> 'posicao')::int = 2),
            'oa', jsonb_build_object('tipo', 'grupo', 'grupo', ga, 'posicao', 1), 'ob', jsonb_build_object('tipo', 'grupo', 'grupo', gb, 'posicao', 2)));
        end loop;
      end loop;
    end if;
    v_s := jsonb_array_length(v_slots) * 2;
  else
    -- Cabeças de série pela fase de grupos e folga para os primeiros.
    v_s := _torneio_proximo_pot(v_nq);
    v_ordem := _torneio_ordem_chaves(v_s);
    for k in 1..(v_s / 2) loop
      sa := v_ordem[2 * k - 1]; sb := v_ordem[2 * k];
      v_slots := v_slots || jsonb_build_array(jsonb_build_object(
        'a', (select x ->> 'equipa' from (
          select x, row_number() over (order by (x ->> 'posicao')::int, (x ->> 'v')::int desc, (x ->> 'd')::int desc, (x ->> 'rg')::int desc, (x ->> 'grupo')::int) as seed
          from jsonb_array_elements(v_q) x) s where s.seed = sa),
        'b', (select x ->> 'equipa' from (
          select x, row_number() over (order by (x ->> 'posicao')::int, (x ->> 'v')::int desc, (x ->> 'd')::int desc, (x ->> 'rg')::int desc, (x ->> 'grupo')::int) as seed
          from jsonb_array_elements(v_q) x) s where s.seed = sb),
        'oa', (select jsonb_build_object('tipo', 'grupo', 'grupo', (x ->> 'grupo')::int, 'posicao', (x ->> 'posicao')::int) from (
          select x, row_number() over (order by (x ->> 'posicao')::int, (x ->> 'v')::int desc, (x ->> 'd')::int desc, (x ->> 'rg')::int desc, (x ->> 'grupo')::int) as seed
          from jsonb_array_elements(v_q) x) s where s.seed = sa),
        'ob', (select jsonb_build_object('tipo', 'grupo', 'grupo', (x ->> 'grupo')::int, 'posicao', (x ->> 'posicao')::int) from (
          select x, row_number() over (order by (x ->> 'posicao')::int, (x ->> 'v')::int desc, (x ->> 'd')::int desc, (x ->> 'rg')::int desc, (x ->> 'grupo')::int) as seed
          from jsonb_array_elements(v_q) x) s where s.seed = sb)));
    end loop;
  end if;

  v_r := 0;
  k := 1;
  while k < v_s loop k := k * 2; v_r := v_r + 1; end loop;
  for r in 1..v_r loop
    for i in 1..(v_s / power(2, r)::int) loop
      if r = 1 then
        slot := v_slots -> (i - 1);
        ea := nullif(slot ->> 'a', '')::uuid; eb := nullif(slot ->> 'b', '')::uuid;
        oa := slot -> 'oa'; ob := slot -> 'ob';
        if oa = 'null'::jsonb then oa := null; end if;
        if ob = 'null'::jsonb then ob := null; end if;
      else
        ea := null; eb := null;
        oa := jsonb_build_object('tipo', 'vencedor', 'ronda', r - 1, 'ordem', 2 * i - 1);
        ob := jsonb_build_object('tipo', 'vencedor', 'ronda', r - 1, 'ordem', 2 * i);
      end if;
      insert into torneio_jogos (torneio_id, fase, ronda, ordem, rotulo, equipa_a, equipa_b, origem_a, origem_b, presencial)
      values (t.id, 'playoff', r, i,
        case v_r - r when 0 then 'final' when 1 then 'meias' when 2 then 'quartos' when 3 then 'oitavos' else 'ronda' end,
        ea, eb, oa, ob, (v_r - r = 0 and t.final_presencial));
    end loop;
  end loop;

  -- Cada jogo aponta para o seguinte: o vencedor do 1.º e do 2.º vão para o 1.º da ronda seguinte, e assim por diante.
  update torneio_jogos j set seguinte_id = n.id, seguinte_lado = case when j.ordem % 2 = 1 then 'a' else 'b' end
  from torneio_jogos n
  where j.torneio_id = t.id and j.fase = 'playoff' and n.torneio_id = t.id and n.fase = 'playoff' and n.ronda = j.ronda + 1 and n.ordem = (j.ordem + 1) / 2;

  -- Folgas: quem não tem adversário passa logo à ronda seguinte.
  for g in select * from torneio_jogos where torneio_id = t.id and fase = 'playoff' and ronda = 1 and (equipa_a is null) <> (equipa_b is null) order by ordem loop
    update torneio_jogos set estado = 'concluido', como = 'bye', vencedor_id = coalesce(g.equipa_a, g.equipa_b), terminou_em = now(), atualizado_em = now() where id = g.id;
    if g.seguinte_id is not null then
      update torneio_jogos set
        equipa_a = case when g.seguinte_lado = 'a' then coalesce(g.equipa_a, g.equipa_b) else equipa_a end,
        equipa_b = case when g.seguinte_lado = 'b' then coalesce(g.equipa_a, g.equipa_b) else equipa_b end
      where id = g.seguinte_id;
    end if;
  end loop;

  update torneios set estado = 'playoffs', atualizado_em = now() where id = t.id;
end $$;

create or replace function public._torneio_ordem_chaves(p_tamanho int) returns int[]
language plpgsql immutable as $$
declare
  v int[] := array[1];
  n int := 1;
  novo int[];
  x int;
begin
  while n < p_tamanho loop
    novo := '{}';
    foreach x in array v loop
      novo := array_append(novo, x);
      novo := array_append(novo, 2 * n + 1 - x);
    end loop;
    v := novo;
    n := n * 2;
  end loop;
  return v;
end $$;

create or replace function public.torneio_gerar_playoffs(p_torneio uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  perform _torneio_gerar_playoffs(p_torneio);
end $$;

/** Desfaz o resultado de um jogo (enganos). Só se o jogo seguinte ainda não começou. */
create or replace function public._torneio_desfazer(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  n torneio_jogos;
  t torneios;
begin
  select * into j from torneio_jogos where id = p_jogo for update;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  select * into t from torneios where id = j.torneio_id for update;
  if j.como = 'bye' then raise exception 'Uma folga não se desfaz.'; end if;
  if j.estado = 'concluido' then
    if j.fase = 'grupo' and t.estado <> 'grupos' then
      raise exception 'Os playoffs já foram gerados: não se mexe nos resultados dos grupos.';
    end if;
    if j.fase = 'playoff' and j.seguinte_id is not null then
      select * into n from torneio_jogos where id = j.seguinte_id for update;
      if n.estado in ('a_decorrer', 'concluido') then raise exception 'O jogo seguinte já começou.'; end if;
      update torneio_jogos set
        equipa_a = case when j.seguinte_lado = 'a' then null else equipa_a end,
        equipa_b = case when j.seguinte_lado = 'b' then null else equipa_b end
      where id = n.id;
      perform _torneio_recalcular_estado(n.id);
    elsif j.fase = 'playoff' then
      update torneios set campeao_id = null, estado = 'playoffs', atualizado_em = now() where id = t.id;
    end if;
  end if;
  delete from torneio_jogo_jogadores where jogo_id = j.id;
  delete from torneio_jogo_segredos where jogo_id = j.id;
  update torneio_jogos set score_a = null, score_b = null, serie_a = 0, serie_b = 0, vencedor_id = null, como = null, riot_match_id = null, tem_stats = false,
    comecou_em = null, terminou_em = null, api_checked_at = null, estado = 'pendente', atualizado_em = now() where id = j.id;
  -- Numa série os mapas voltam a estar por jogar e o jogo volta ao primeiro.
  if exists (select 1 from torneio_jogo_mapas where jogo_id = j.id) then
    update torneio_jogo_mapas set estado = 'pendente', score_a = null, score_b = null, vencedor_id = null, como = null, riot_match_id = null,
      comecou_em = null, terminou_em = null, tem_stats = false where jogo_id = j.id;
    update torneio_jogos x set mapa = m.mapa, lado_equipa = m.lado_equipa, lado_escolha = m.lado_escolha
    from torneio_jogo_mapas m where m.jogo_id = j.id and m.ordem = 1 and x.id = j.id;
  end if;
  perform _torneio_recalcular_estado(j.id);
end $$;

create or replace function public.torneio_desfazer_jogo(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  perform _torneio_desfazer(p_jogo);
end $$;

/** A staff põe o resultado (final presencial, disputa, falha da API). Se já havia um, substitui-o. */
create or replace function public.torneio_resolver_jogo(p_jogo uuid, p_a int, p_b int) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
begin
  select * into j from torneio_jogos where id = p_jogo;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if j.estado = 'concluido' then perform _torneio_desfazer(p_jogo); end if;
  perform _torneio_aplicar_resultado(p_jogo, p_a, p_b, null, 'staff');
end $$;

/** Falta de comparência: ganha a equipa que apareceu, por 13-0. */
create or replace function public.torneio_walkover(p_jogo uuid, p_vencedor uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
begin
  select * into j from torneio_jogos where id = p_jogo;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if p_vencedor is distinct from j.equipa_a and p_vencedor is distinct from j.equipa_b then raise exception 'Essa equipa não joga este jogo.'; end if;
  if j.estado = 'concluido' then perform _torneio_desfazer(p_jogo); end if;
  perform _torneio_aplicar_resultado(p_jogo, case when p_vencedor = j.equipa_a then 13 else 0 end, case when p_vencedor = j.equipa_b then 13 else 0 end, null, 'walkover');
end $$;

-- ---------------------------------------------------------------- para a Edge Function

/** Quem joga o jogo e como o reconhecer na API (só a service role). */
create or replace function public._torneio_jogo_dados(p_jogo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
begin
  select * into j from torneio_jogos where id = p_jogo;
  if not found then return null; end if;
  select * into t from torneios where id = j.torneio_id;
  return jsonb_build_object(
    'estado', j.estado, 'mapa', j.mapa, 'comecouEm', j.comecou_em, 'minJogadores', t.min_jogadores, 'torneioId', t.id,
    'jogadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', p.id, 'authId', p.auth_id, 'equipa', case when m.equipa_id = j.equipa_a then 'A' else 'B' end,
        'riot_id', p.riot_id, 'riot_puuid', p.riot_puuid, 'region', p.region, 'funcao', m.funcao, 'capitao', p.id = e.capitao_id
      ))
      from torneio_membros m join profiles p on p.id = m.perfil_id join torneio_equipas e on e.id = m.equipa_id
      where m.estado = 'aceite' and m.equipa_id in (j.equipa_a, j.equipa_b) and m.funcao in ('jogador', 'suplente', 'coach') and not p.is_bot
    ), '[]'::jsonb),
    'usadas', coalesce((
      select jsonb_agg(u.id) from (
        select x.riot_match_id as id from torneio_jogos x where x.torneio_id = t.id and x.riot_match_id is not null
        union
        select m.riot_match_id from torneio_jogo_mapas m join torneio_jogos x on x.id = m.jogo_id where x.torneio_id = t.id and m.riot_match_id is not null
      ) u
    ), '[]'::jsonb)
  );
end $$;

/** Reserva uma consulta à API: no máximo uma por jogo a cada p_segundos (devolve se a conseguiu). */
create or replace function public._torneio_reservar_consulta(p_jogo uuid, p_segundos int default 60) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  update torneio_jogos set api_checked_at = now()
  where id = p_jogo and estado = 'a_decorrer' and (api_checked_at is null or api_checked_at < now() - make_interval(secs => p_segundos))
  returning id into v_id;
  return v_id is not null;
end $$;

/** Os jogos que já podem ter acabado: pelo menos 8 minutos desde que abriram. */
create or replace function public._torneio_jogos_a_verificar() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(j.id order by j.comecou_em), '[]'::jsonb)
  from torneio_jogos j where j.estado = 'a_decorrer' and j.comecou_em < now() - interval '8 minutes'
$$;

/** A cada minuto (pg_cron) pede à Edge Function que veja se os jogos a decorrer já acabaram. */
create or replace function public._torneio_processar_pedir() returns void
language plpgsql volatile security definer set search_path = public as $$
declare c discord_config;
begin
  if not exists (select 1 from torneio_jogos where estado = 'a_decorrer' and comecou_em < now() - interval '8 minutes') then return; end if;
  select * into c from discord_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url := regexp_replace(c.url, '/[^/]*$', '/processar-torneio'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-rangify-segredo', c.segredo),
    timeout_milliseconds := 25000
  );
exception when others then
  raise warning 'Torneios: não foi possível pedir o processamento: %', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rangify-torneios', '* * * * *', 'select public._torneio_processar_pedir()');
  perform cron.schedule('rangify-torneios-veto', '* * * * *', 'select public._torneio_veto_tick()');
exception when others then
  raise notice 'pg_cron indisponível: os jogos dos torneios só são verificados quando alguém abre a página do jogo.';
end $$;

-- ---------------------------------------------------------------- testes com bots (só torneios de teste)

create or replace function public._torneio_so_teste(p_torneio uuid) returns public.torneios
language plpgsql stable security definer set search_path = public as $$
declare t torneios;
begin
  select * into t from torneios where id = p_torneio;
  if not found then raise exception 'Torneio não encontrado.'; end if;
  if not t.teste then raise exception 'Isto só existe em torneios de teste.'; end if;
  return t;
end $$;

/** Bots livres (que não estão em nenhuma equipa deste torneio), criando os que faltarem. */
create or replace function public._torneio_bots(p_torneio uuid, p_n int) returns uuid[]
language plpgsql volatile security definer set search_path = public as $$
declare
  v uuid[];
  v_novo uuid;
  k int;
begin
  select coalesce(array_agg(id), '{}') into v from (
    select p.id from profiles p
    where p.is_bot and not exists (select 1 from torneio_membros m where m.torneio_id = p_torneio and m.perfil_id = p.id)
    order by random() limit p_n
  ) b;
  k := coalesce(array_length(v, 1), 0);
  while k < p_n loop
    insert into profiles (username, riot_id, region, official_tier, is_bot, game_role, tour_seen_at)
    values (
      'bot_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8),
      'Bot' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4)) || '#BOT',
      'eu', 6 + floor(random() * 18)::int, true,
      (array['Duelista', 'Controlador', 'Iniciador', 'Sentinela'])[1 + floor(random() * 4)::int], now()
    ) returning id into v_novo;
    v := array_append(v, v_novo);
    k := k + 1;
  end loop;
  return v;
end $$;

/** Equipas de bots completas (5 jogadores cada), para encher um torneio de teste. */
create or replace function public.torneio_teste_equipas(p_torneio uuid, p_n int) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios := _torneio_so_teste(p_torneio);
  nomes text[] := array['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa'];
  v_feitas int := 0;
  v_i int := 0;
  v_nome text;
  v_eq uuid;
  v_bots uuid[];
  b uuid;
begin
  if t.estado not in ('rascunho', 'inscricoes') then raise exception 'Só se juntam equipas antes do sorteio.'; end if;
  if p_n is null or p_n < 1 or p_n > 32 then raise exception 'Entre 1 e 32 equipas.'; end if;
  while v_feitas < p_n loop
    v_i := v_i + 1;
    v_nome := 'Bots ' || nomes[1 + (v_i - 1) % array_length(nomes, 1)] || case when v_i > array_length(nomes, 1) then ' ' || ((v_i - 1) / array_length(nomes, 1) + 1) else '' end;
    if exists (select 1 from torneio_equipas where torneio_id = t.id and lower(nome) = lower(v_nome)) then continue; end if;
    if t.max_equipas is not null and (select count(*) from torneio_equipas where torneio_id = t.id) >= t.max_equipas then exit; end if;
    v_bots := _torneio_bots(t.id, 5);
    insert into torneio_equipas (torneio_id, nome, capitao_id) values (t.id, v_nome, v_bots[1]) returning id into v_eq;
    foreach b in array v_bots loop
      insert into torneio_membros (equipa_id, perfil_id, torneio_id, funcao, estado, convidado_por, respondido_em)
      values (v_eq, b, t.id, 'jogador', 'aceite', me.id, now());
    end loop;
    v_feitas := v_feitas + 1;
    if v_i > 200 then exit; end if;
  end loop;
  return v_feitas;
end $$;

/** Enche a equipa com bots até ter 5 jogadores (e, se pedido, também coach e 2 suplentes). */
create or replace function public.torneio_teste_preencher(p_equipa uuid, p_completo boolean default false) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  e torneio_equipas;
  t torneios;
  v_bots uuid[];
  v_add int := 0;
  v_falta int;
  f text;
  b uuid;
begin
  select * into e from torneio_equipas where id = p_equipa;
  if not found then raise exception 'Equipa não encontrada.'; end if;
  t := _torneio_so_teste(e.torneio_id);
  if t.estado not in ('rascunho', 'inscricoes') then raise exception 'Só se muda a equipa antes do sorteio.'; end if;
  foreach f in array array['jogador', 'coach', 'suplente'] loop
    continue when f <> 'jogador' and not coalesce(p_completo, false);
    v_falta := case f when 'jogador' then 5 when 'coach' then 1 else 2 end
      - (select count(*) from torneio_membros where equipa_id = e.id and funcao = f);
    if v_falta > 0 then
      v_bots := _torneio_bots(t.id, v_falta);
      foreach b in array v_bots loop
        insert into torneio_membros (equipa_id, perfil_id, torneio_id, funcao, estado, convidado_por, respondido_em)
        values (e.id, b, t.id, f, 'aceite', me.id, now());
        v_add := v_add + 1;
      end loop;
    end if;
  end loop;
  update torneio_equipas set atualizada_em = now() where id = e.id;
  return v_add;
end $$;

/** Um resultado inventado mas válido (de vez em quando com prolongamento) e estatísticas de mentira. */
create or replace function public._torneio_simular(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  j torneio_jogos;
  t torneios;
  v_n int;
  v_precisa int;
  v_a boolean;
  v_perde int;
  v_ganha int;
  v_stats jsonb;
  k int := 0;
begin
  perform _torneio_veto_completar(p_jogo);
  loop
    select * into j from torneio_jogos where id = p_jogo;
    exit when j.estado = 'concluido' or k >= 6;
    select * into t from torneios where id = j.torneio_id;
    v_n := _torneio_melhor_de(j, t);
    v_precisa := (v_n + 1) / 2;
    v_a := random() < 0.5;
    if v_n > 1 and j.presencial then
      -- Presencial à melhor de 3 ou 5: a série acaba logo, com os mapas ganhos.
      v_perde := floor(random() * v_precisa)::int;
      perform _torneio_aplicar_resultado(p_jogo, case when v_a then v_precisa else v_perde end, case when v_a then v_perde else v_precisa end, null, 'simulado');
    else
      v_ganha := 13;
      if random() < 0.15 then
        v_ganha := 14 + floor(random() * 3)::int;
        v_perde := v_ganha - 2;
      else
        v_perde := floor(random() * 12)::int;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'perfilId', m.perfil_id,
        'agente', (array['Jett', 'Sage', 'Omen', 'Sova', 'Reyna', 'Killjoy', 'Brimstone', 'Fade'])[1 + floor(random() * 8)::int],
        'kills', 6 + floor(random() * 20)::int, 'deaths', 4 + floor(random() * 16)::int, 'assists', floor(random() * 12)::int,
        'acs', 120 + floor(random() * 230)::int, 'firstBloods', floor(random() * 6)::int, 'trades', floor(random() * 5)::int,
        'hsPct', 10 + floor(random() * 35)::int, 'kastPct', 55 + floor(random() * 35)::int
      )), '[]'::jsonb) into v_stats
      from torneio_membros m where m.equipa_id in (j.equipa_a, j.equipa_b) and m.estado = 'aceite' and m.funcao = 'jogador';
      perform _torneio_aplicar_resultado(p_jogo, case when v_a then v_ganha else v_perde end, case when v_a then v_perde else v_ganha end, v_stats, 'simulado');
    end if;
    k := k + 1;
  end loop;
end $$;

create or replace function public.torneio_teste_simular(p_jogo uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  j torneio_jogos;
begin
  select * into j from torneio_jogos where id = p_jogo;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  perform _torneio_so_teste(j.torneio_id);
  if j.estado = 'concluido' then raise exception 'Este jogo já tem resultado.'; end if;
  if j.equipa_a is null or j.equipa_b is null then raise exception 'Este jogo ainda não tem as duas equipas.'; end if;
  perform _torneio_simular(p_jogo);
end $$;

/** Simula tudo o que já se pode jogar, jogo a jogo, até aos playoffs ou até ao campeão. */
create or replace function public.torneio_teste_simular_tudo(p_torneio uuid, p_so_grupos boolean default false) returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios := _torneio_so_teste(p_torneio);
  v_n int := 0;
  v_id uuid;
begin
  loop
    select id into v_id from torneio_jogos
    where torneio_id = p_torneio and estado <> 'concluido' and equipa_a is not null and equipa_b is not null
      and (not coalesce(p_so_grupos, false) or fase = 'grupo')
    order by case fase when 'grupo' then 0 else 1 end, ronda, ordem limit 1;
    exit when v_id is null or v_n >= 300;
    perform _torneio_simular(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/** Volta o torneio de teste às inscrições (apaga grupos, jogos e resultados, mantém as equipas). */
create or replace function public.torneio_teste_reiniciar(p_torneio uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  t torneios := _torneio_so_teste(p_torneio);
begin
  delete from torneio_jogos where torneio_id = t.id;
  update torneio_equipas set grupo = null, ordem_sorteio = null, atualizada_em = now() where torneio_id = t.id;
  update torneios set estado = 'inscricoes', campeao_id = null, sorteio_seed = null, sorteado_em = null,
    inscricoes_ate = greatest(inscricoes_ate, now() + interval '1 day'), atualizado_em = now() where id = t.id;
end $$;

-- ---------------------------------------------------------------- permissões

do $$
declare f record;
begin
  -- Tudo o que começa por "_torneio" é interno: só a service role.
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '\_torneio%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
  end loop;
  -- As funções para o site: só quem tem sessão.
  for f in
    select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'torneio\_%' or p.proname in ('torneios_lista', 'torneios_visivel', 'meus_convites_torneio'))
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;
