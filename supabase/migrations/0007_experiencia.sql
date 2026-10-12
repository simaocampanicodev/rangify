-- Rangify Experience: missões diárias, rotação de missões e XP com níveis.
--
-- * Cada âmbito tem um catálogo maior do que o que aparece: as diárias mostram
--   4 de 10 e as semanais 8 de 15. A rotação muda sozinha no início de cada dia
--   e de cada semana (UTC), e Owner e Dev podem sorteá-la de novo a qualquer
--   momento. O progresso de uma rotação conta a partir do momento em que nasceu.
-- * Completar uma missão dá XP uma vez por rotação (as de temporada, uma vez por
--   temporada). O XP total decide o nível e o ranking de nível.
-- * Remover uma partida volta a avaliar as missões dos jogadores dela: o XP das
--   missões que deixam de estar completas sai.
--
-- Corre depois de 0001 a 0006. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- catálogo

alter table public.quests drop constraint if exists quests_kind_check;
alter table public.quests add constraint quests_kind_check check (kind in (
  'jogos', 'vitorias', 'vitorias_acima', 'first_bloods', 'mvp', 'sequencia', 'acs', 'pontos',
  'kills', 'assists', 'trades', 'capitao', 'vitorias_capitao', 'mapas'
));
alter table public.quests drop constraint if exists quests_scope_check;
alter table public.quests add constraint quests_scope_check check (scope in ('daily', 'weekly', 'season'));
alter table public.quests add column if not exists xp int not null default 100 check (xp between 0 and 5000);

insert into public.quests (id, title, description, kind, target, scope, sort, xp) values
  ('d-jogar', 'Aquecimento', 'Joga 1 partida hoje.', 'jogos', 1, 'daily', 101, 100),
  ('d-vitoria', 'Primeira vitória', 'Ganha 1 partida hoje.', 'vitorias', 1, 'daily', 102, 150),
  ('d-tres', 'Sessão completa', 'Joga 3 partidas hoje.', 'jogos', 3, 'daily', 103, 200),
  ('d-kills', 'Mão quente', 'Faz 20 kills hoje.', 'kills', 20, 'daily', 104, 120),
  ('d-fb', 'Abrir caminho', 'Faz 3 first bloods hoje.', 'first_bloods', 3, 'daily', 105, 120),
  ('d-assist', 'Espírito de equipa', 'Faz 8 assistências hoje.', 'assists', 8, 'daily', 106, 100),
  ('d-duas', 'Dose dupla', 'Ganha 2 partidas hoje.', 'vitorias', 2, 'daily', 107, 220),
  ('d-capitao', 'Capitão do dia', 'Joga 1 partida como capitão hoje.', 'capitao', 1, 'daily', 108, 120),
  ('d-trades', 'Troca justa', 'Faz 4 trades hoje.', 'trades', 4, 'daily', 109, 100),
  ('d-acs', 'Bom jogo', 'Acaba uma partida hoje com 250 de ACS ou mais.', 'acs', 250, 'daily', 110, 150),

  ('m-jogos', 'Rotina de competição', 'Joga 10 partidas esta semana.', 'jogos', 10, 'weekly', 1, 400),
  ('m-vitorias', 'Cinco vitórias', 'Ganha 5 partidas esta semana.', 'vitorias', 5, 'weekly', 2, 450),
  ('m-acima', 'Contra os favoritos', 'Ganha 2 partidas contra uma equipa com rank oficial médio acima do teu.', 'vitorias_acima', 2, 'weekly', 3, 400),
  ('m-fb', 'Primeiro sangue', 'Faz 15 first bloods esta semana.', 'first_bloods', 15, 'weekly', 4, 350),
  ('m-mvp', 'Jogador da partida', 'Sê MVP em 2 partidas esta semana.', 'mvp', 2, 'weekly', 5, 400),
  ('s-serie', 'Em forma', 'Ganha 3 partidas seguidas esta semana.', 'sequencia', 3, 'weekly', 6, 450),
  ('s-kills', 'Ceifeiro', 'Faz 100 kills esta semana.', 'kills', 100, 'weekly', 7, 350),
  ('s-assist', 'Suporte de ouro', 'Faz 40 assistências esta semana.', 'assists', 40, 'weekly', 8, 300),
  ('s-lider', 'Liderança', 'Ganha 2 partidas como capitão esta semana.', 'vitorias_capitao', 2, 'weekly', 9, 400),
  ('s-mapas', 'Volta aos mapas', 'Joga em 4 mapas diferentes esta semana.', 'mapas', 4, 'weekly', 10, 300),
  ('s-trades', 'Rei das trocas', 'Faz 15 trades esta semana.', 'trades', 15, 'weekly', 11, 300),
  ('s-acs', 'Grande jogo', 'Acaba uma partida esta semana com 270 de ACS ou mais.', 'acs', 270, 'weekly', 12, 400),
  ('s-maratona', 'Maratonista', 'Joga 20 partidas esta semana.', 'jogos', 20, 'weekly', 13, 600),
  ('s-imparavel', 'Imparável', 'Ganha 10 partidas esta semana.', 'vitorias', 10, 'weekly', 14, 700),
  ('s-capitao', 'Capitão de serviço', 'Joga 4 partidas como capitão esta semana.', 'capitao', 4, 'weekly', 15, 350),

  ('m-seq', 'Em série', 'Ganha 4 partidas seguidas nesta temporada.', 'sequencia', 4, 'season', 21, 800),
  ('m-acs', 'Noite inspirada', 'Acaba uma partida com 300 de ACS ou mais.', 'acs', 300, 'season', 22, 600),
  ('m-pontos', 'Rumo aos 1200', 'Chega aos 1200 pontos nesta temporada.', 'pontos', 1200, 'season', 23, 1000),
  ('t-veterano', 'Veterano', 'Joga 50 partidas nesta temporada.', 'jogos', 50, 'season', 24, 1000)
on conflict (id) do update set
  title = excluded.title, description = excluded.description, kind = excluded.kind, target = excluded.target,
  scope = excluded.scope, sort = excluded.sort, xp = excluded.xp;

-- ---------------------------------------------------------------- rotações e XP

create table if not exists public.quest_rotations (
  id bigserial primary key,
  scope text not null check (scope in ('daily', 'weekly')),
  started_at timestamptz not null default now(),
  quest_ids text[] not null
);

-- period_key: o id da rotação (diárias e semanais) ou 'temporada'.
create table if not exists public.quest_completions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  quest_id text not null references public.quests (id) on delete cascade,
  period_key text not null,
  xp int not null,
  completed_at timestamptz not null default now(),
  primary key (profile_id, quest_id, period_key)
);
create index if not exists quest_completions_quando on public.quest_completions (completed_at);

-- Só as funções lhes mexem.
alter table public.quest_rotations enable row level security;
alter table public.quest_completions enable row level security;

/** Quantas missões de cada âmbito aparecem por rotação. */
create or replace function public._missoes_por_rotacao(p_scope text) returns int
language sql immutable as $$
  select case p_scope when 'daily' then 4 else 8 end
$$;

create or replace function public._inicio_periodo(p_scope text) returns timestamptz
language sql stable as $$
  select case p_scope
    when 'daily' then date_trunc('day', now() at time zone 'utc') at time zone 'utc'
    else date_trunc('week', now() at time zone 'utc') at time zone 'utc'
  end
$$;

/** Sorteia uma rotação nova, preferindo missões que não estavam na anterior. */
create or replace function public._nova_rotacao(p_scope text, p_inicio timestamptz) returns public.quest_rotations
language plpgsql security definer set search_path = public as $$
declare
  v_antes text[] := coalesce((select quest_ids from quest_rotations where scope = p_scope order by id desc limit 1), '{}');
  r quest_rotations;
begin
  insert into quest_rotations (scope, started_at, quest_ids)
  values (p_scope, p_inicio, array(
    select id from quests where scope = p_scope and active
    order by id = any(v_antes), random() limit _missoes_por_rotacao(p_scope)
  ))
  returning * into r;
  return r;
end $$;

/** A rotação em vigor; nasce uma nova quando o dia ou a semana mudam. */
create or replace function public._rotacao(p_scope text) returns public.quest_rotations
language plpgsql security definer set search_path = public as $$
declare
  v_inicio timestamptz := _inicio_periodo(p_scope);
  r quest_rotations;
begin
  select * into r from quest_rotations where scope = p_scope order by id desc limit 1;
  if found and r.started_at >= v_inicio then return r; end if;
  perform pg_advisory_xact_lock(hashtext('rangify_rotacao_' || p_scope));
  select * into r from quest_rotations where scope = p_scope order by id desc limit 1;
  if found and r.started_at >= v_inicio then return r; end if;
  return _nova_rotacao(p_scope, v_inicio);
end $$;

/** Nível a partir do XP: passar do nível N para o N+1 custa 400 + 100 x N. */
create or replace function public._nivel(p_xp int) returns jsonb
language plpgsql immutable as $$
declare
  n int := 1;
  resto int := greatest(0, coalesce(p_xp, 0));
begin
  while resto >= 400 + 100 * n loop
    resto := resto - (400 + 100 * n);
    n := n + 1;
  end loop;
  return jsonb_build_object('nivel', n, 'xpNoNivel', resto, 'xpParaProximo', 400 + 100 * n);
end $$;

create or replace function public._xp(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(xp), 0)::int from quest_completions where profile_id = p_perfil
$$;

-- ---------------------------------------------------------------- progresso

create or replace function public._progresso_missao(p_perfil uuid, p_tipo text, p_desde timestamptz) returns int
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.finished_at, m.map, mp.profile_id in (m.captain_a, m.captain_b) as foi_capitao,
      (select round(avg(_divisao(o.tier_snapshot))) from match_players o where o.match_id = m.id and o.team is not null and o.team <> mp.team) as div_adv
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null and m.finished_at >= p_desde
  )
  select (case p_tipo
    when 'jogos' then (select count(*) from minhas)
    when 'vitorias' then (select count(*) from minhas where team = winner)
    when 'vitorias_acima' then (select count(*) from minhas where team = winner and div_adv > _divisao(tier_snapshot))
    when 'first_bloods' then (select coalesce(sum(first_bloods), 0) from minhas)
    when 'mvp' then (select count(*) from minhas where mvp)
    when 'acs' then (select coalesce(max(acs), 0) from minhas)
    when 'pontos' then (select points from profiles where id = p_perfil)
    when 'kills' then (select coalesce(sum(kills), 0) from minhas)
    when 'assists' then (select coalesce(sum(assists), 0) from minhas)
    when 'trades' then (select coalesce(sum(trades), 0) from minhas)
    when 'capitao' then (select count(*) from minhas where foi_capitao)
    when 'vitorias_capitao' then (select count(*) from minhas where foi_capitao and team = winner)
    when 'mapas' then (select count(distinct map) from minhas)
    when 'sequencia' then (
      select coalesce(max(c), 0) from (
        select count(*) as c from (
          select team = winner as ganhou, sum(case when team = winner then 0 else 1 end) over (order by finished_at) as grupo from minhas
        ) s where ganhou group by grupo
      ) t)
    else 0 end)::int
$$;

/**
 * As missões em vigor de um jogador, com o progresso e a chave do período.
 * Usada por missoes() e por _atualizar_missoes().
 */
create or replace function public._missoes_ativas(p_perfil uuid)
returns table (id text, title text, description text, kind text, target int, scope text, sort int, xp int, chave text, progresso int)
language plpgsql security definer set search_path = public as $$
declare
  d quest_rotations := _rotacao('daily');
  w quest_rotations := _rotacao('weekly');
begin
  return query
    select q.id, q.title, q.description, q.kind, q.target, q.scope, q.sort, q.xp, a.chave,
      _progresso_missao(p_perfil, q.kind, a.desde)
    from (
      select unnest(d.quest_ids) as qid, d.id::text as chave, d.started_at as desde
      union all select unnest(w.quest_ids), w.id::text, w.started_at
      union all select s.id, 'temporada', _inicio_temporada() from quests s where s.scope = 'season' and s.active
    ) a join quests q on q.id = a.qid;
end $$;

/**
 * Dá o XP das missões que ficaram completas. Com p_rever também tira o das que
 * deixaram de o estar (depois de remover uma partida).
 */
create or replace function public._atualizar_missoes(p_perfil uuid, p_rever boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_perfil is null or exists (select 1 from profiles where id = p_perfil and is_bot) then return; end if;
  with s as (
    select a.id, a.chave, a.xp, a.progresso >= a.target as feita from _missoes_ativas(p_perfil) a
  ), tirar as (
    delete from quest_completions c using s
    where p_rever and c.profile_id = p_perfil and c.quest_id = s.id and c.period_key = s.chave and not s.feita
  )
  insert into quest_completions (profile_id, quest_id, period_key, xp)
  select p_perfil, s.id, s.chave, s.xp from s where s.feita
  on conflict do nothing;
end $$;

-- Quando uma partida termina, os 10 jogadores ganham o XP das missões que fecharam.
create or replace function public._tg_missoes_partida() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select profile_id from match_players where match_id = new.id and team is not null loop
    perform _atualizar_missoes(r.profile_id, false);
  end loop;
  return null;
end $$;

drop trigger if exists missoes_ao_terminar on public.matches;
create trigger missoes_ao_terminar after update of state on public.matches
for each row when (new.state = 'COMPLETED' and old.state is distinct from 'COMPLETED')
execute function public._tg_missoes_partida();

-- ---------------------------------------------------------------- RPCs

drop function if exists public.missoes();
create function public.missoes() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := (_eu()).id;
begin
  perform _atualizar_missoes(me, false);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'titulo', a.title, 'descricao', a.description, 'tipo', a.kind, 'alvo', a.target, 'xp', a.xp,
      'ambito', case a.scope when 'daily' then 'diaria' when 'weekly' then 'semanal' else 'temporada' end,
      'progresso', least(a.target, a.progresso), 'concluida', a.progresso >= a.target
    ) order by case a.scope when 'daily' then 0 when 'weekly' then 1 else 2 end, a.sort), '[]'::jsonb)
    from _missoes_ativas(me) a
  );
end $$;

/** XP, nível e lugar no ranking de nível (o próprio, ou de outro jogador). */
create or replace function public.experiencia(p_perfil uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_perfil, eu());
  v_xp int := _xp(v_id);
begin
  if v_id is null then raise exception 'Entra na tua conta primeiro.'; end if;
  return _nivel(v_xp) || jsonb_build_object(
    'xp', v_xp,
    'xpSemana', (select coalesce(sum(xp), 0) from quest_completions where profile_id = v_id and completed_at >= _inicio_periodo('weekly')),
    'posicao', 1 + (select count(*) from profiles p where not p.is_bot and p.riot_id is not null and p.id <> v_id and _xp(p.id) > v_xp),
    'total', (select count(*) from profiles p where not p.is_bot and p.riot_id is not null)
  );
end $$;

create or replace function public.ranking_nivel(p_limite int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('posicao', x.pos, 'perfil', _perfil_json(x.p), 'xp', x.xp) || _nivel(x.xp) order by x.pos), '[]'::jsonb)
  from (
    select p, t.xp, row_number() over (order by t.xp desc, p.points desc, p.username) as pos
    from profiles p cross join lateral (select _xp(p.id) as xp) t
    where not p.is_bot and p.riot_id is not null
    order by t.xp desc, p.points desc, p.username
    limit least(100, greatest(1, p_limite))
  ) x
$$;

/** Owner e Dev: sorteia já diárias e semanais novas. O XP ganho fica. */
create or replace function public.resetar_missoes() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_owner_dev();
  perform pg_advisory_xact_lock(hashtext('rangify_rotacao_daily'));
  perform pg_advisory_xact_lock(hashtext('rangify_rotacao_weekly'));
  perform _nova_rotacao('daily', now());
  perform _nova_rotacao('weekly', now());
  return missoes();
end $$;

-- Remover uma partida também tira o XP das missões que ela tinha completado.
create or replace function public.remover_partida(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_jogadores uuid[];
  v_id uuid;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('COMPLETED', 'CANCELLED') then raise exception 'Cancela a partida antes de a remover.'; end if;
  v_jogadores := array(select profile_id from match_players where match_id = p_match and team is not null);
  if m.state = 'COMPLETED' and m.points_applied then
    for r in select profile_id, team, points_delta from match_players where match_id = p_match and team is not null and points_delta is not null loop
      update profiles set
        points = points - r.points_delta,
        wins = greatest(0, wins - case when r.team = m.winner then 1 else 0 end),
        losses = greatest(0, losses - case when r.team = m.winner then 0 else 1 end)
      where id = r.profile_id;
    end loop;
  end if;
  delete from matches where id = p_match;
  foreach v_id in array v_jogadores loop
    perform _atualizar_missoes(v_id, true);
  end loop;
end $$;

revoke all on function public._nova_rotacao(text, timestamptz), public._rotacao(text), public._xp(uuid),
  public._missoes_ativas(uuid), public._atualizar_missoes(uuid, boolean), public._tg_missoes_partida() from public, anon, authenticated;
grant execute on function public.missoes(), public.experiencia(uuid), public.ranking_nivel(int), public.resetar_missoes() to authenticated;
