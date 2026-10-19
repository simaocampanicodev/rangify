-- O que a migração 0031 (torneios) deixou na base de dados na sua primeira versão (picks e bans com
-- "veto_formato", sem séries): só as tabelas e as duas funções cujos argumentos mudaram depois.
-- Serve a scripts/testar-migracao-torneios.mjs, que corre a 0031 atual por cima disto.

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
  veto_mapas boolean not null default true,
  veto_formato text not null default 'bans' check (veto_formato in ('bans', 'ban_pick')),
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
  veto_formato text check (veto_formato is null or veto_formato in ('bans', 'ban_pick')),
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
  perfil_id uuid not null references public.profiles (id) on delete cascade,
  equipa_id uuid not null references public.torneio_equipas (id) on delete cascade,
  agente text,
  kills int, deaths int, assists int, acs int, first_bloods int, trades int, hs_pct int, kast_pct int,
  primary key (jogo_id, perfil_id)
);
alter table public.torneio_jogo_jogadores enable row level security;

-- O código do grupo só aparece aos jogadores das duas equipas (e à staff).
create table if not exists public.torneio_jogo_segredos (
  jogo_id uuid primary key references public.torneio_jogos (id) on delete cascade,
  codigo text not null check (codigo ~ '^[A-Z0-9]{6}$')
);
alter table public.torneio_jogo_segredos enable row level security;

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

create function public._torneio_veto_passos(p_formato text, p_n int) returns jsonb
language sql immutable as $$ select '[]'::jsonb $$;

create function public.torneio_agendar(p_jogo uuid, p_quando timestamptz, p_mapa text default null, p_presencial boolean default null)
returns void language plpgsql as $$ begin raise exception 'versão anterior'; end $$;
