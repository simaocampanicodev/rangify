-- Rangify, migração 0045: estado do site (sobrecarga), ao jeito do Uptime Kuma.
--
-- De minuto a minuto, a Edge Function saude-sondar mede o tempo de resposta do site, da API, do login e das Edge
-- Functions e lê o uso de CPU, memória e disco do servidor (a Metrics API do Supabase). Entrega isso a _saude_registar(),
-- que junta o que a base de dados sabe de si (ligações, consultas lentas, bloqueios, partidas paradas, falhas do cron e
-- dos pedidos da própria base de dados), decide o estado e escreve uma amostra. A página Staff > Estado lê tudo daqui.
--
-- Estados, do melhor para o pior: ok, lento, sobrecarga, em_baixo. Cada amostra traz os motivos com o valor e os limites
-- (é o motivo que diz porquê, o cliente só traduz o código). Os limites estão todos em _saude_registar.
--
-- Como o Uptime Kuma, só confirma depois de duas amostras más seguidas (uma só fica "a confirmar", para não haver
-- alarmes falsos) e só dá por recuperado depois de três boas seguidas. O que passa de "ok" para outro estado abre um
-- incidente; a recuperação fecha-o. O histórico de incidentes fica guardado; as amostras 30 dias e as sondas 7 dias.
--
-- Se a Edge Function não responder (ou ainda não estiver publicada), o cron regista na mesma as amostras só com o que a
-- base de dados sabe, e a falta de sondas aparece como motivo (depois de já ter havido sondas).
--
-- Corre uma vez no SQL Editor, depois da 0044. É seguro correr outra vez. Precisa de pg_cron e pg_net (já usados pelas
-- outras funções) e da linha de discord_config (ver docs/discord.md); sem elas as amostras só existem se chamares
-- _saude_registar() à mão. Depois publica a função: npx supabase functions deploy saude-sondar --no-verify-jwt

-- ------------------------------------------------------------ tabelas
create table if not exists public.saude_sondas (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  monitor text not null check (monitor in ('site', 'api', 'auth', 'funcoes', 'servidor')),
  ok boolean not null,
  ms int check (ms is null or ms >= 0),
  detalhe text,
  -- No monitor "servidor": os contadores brutos de CPU e as percentagens lidas da Metrics API.
  extra jsonb
);
create index if not exists saude_sondas_monitor_em on public.saude_sondas (monitor, em desc);
create index if not exists saude_sondas_em on public.saude_sondas (em);

create table if not exists public.saude_amostras (
  id bigint generated always as identity primary key,
  em timestamptz not null,
  -- O estado confirmado (o que se mostra) e o do instante (antes de confirmar).
  estado text not null check (estado in ('ok', 'lento', 'sobrecarga', 'em_baixo')),
  estado_instante text not null check (estado_instante in ('ok', 'lento', 'sobrecarga', 'em_baixo')),
  ok_seguidas int not null default 0,
  motivos jsonb not null default '[]'::jsonb,
  cpu numeric(5, 1), ram numeric(5, 1), disco numeric(5, 1), carga numeric(6, 2), pool_espera int,
  ligacoes int, ligacoes_max int, ativas int, mais_lenta_s numeric(8, 1), bloqueadas int,
  fila int, partidas int, partidas_paradas int,
  erros_http numeric(5, 1),
  -- Tempo de resposta de cada sonda nesta amostra: {"site": 120, "api": 80, ...}
  ms jsonb not null default '{}'::jsonb
);

create table if not exists public.saude_incidentes (
  id bigint generated always as identity primary key,
  inicio timestamptz not null,
  fim timestamptz,
  -- O pior estado durante o incidente e, por código, o pior valor de cada motivo.
  estado text not null check (estado in ('lento', 'sobrecarga', 'em_baixo')),
  motivos jsonb not null default '[]'::jsonb
);
create index if not exists saude_amostras_em on public.saude_amostras (em desc);
create index if not exists saude_incidentes_inicio on public.saude_incidentes (inicio desc);

alter table public.saude_sondas enable row level security;
alter table public.saude_amostras enable row level security;
alter table public.saude_incidentes enable row level security;
revoke all on public.saude_sondas, public.saude_amostras, public.saude_incidentes from public, anon, authenticated;

-- ------------------------------------------------------------ peças pequenas
create or replace function public._saude_nivel(p text) returns int
language sql immutable as $$
  select case p when 'ok' then 0 when 'lento' then 1 when 'sobrecarga' then 2 when 'em_baixo' then 3 else 0 end
$$;

create or replace function public._saude_pior(a text, b text) returns text
language sql immutable as $$
  select case when public._saude_nivel(b) > public._saude_nivel(a) then b else a end
$$;

-- Um motivo, se o valor chegou ao limite de aviso ("lento") ou ao crítico ("sobrecarga"); senão null.
create or replace function public._saude_avaliar(p_codigo text, p_valor numeric, p_aviso numeric, p_critico numeric, p_monitor text default null)
returns jsonb language sql immutable as $$
  select case
    when p_valor is null or p_valor < p_aviso then null
    else jsonb_strip_nulls(jsonb_build_object(
      'codigo', p_codigo, 'monitor', p_monitor, 'valor', p_valor, 'aviso', p_aviso, 'critico', p_critico,
      'nivel', case when p_valor >= p_critico then 'sobrecarga' else 'lento' end))
  end
$$;

-- A partir de que tempo de resposta (ms) cada sonda é "lenta". É crítica ao triplo.
create or replace function public._saude_limite_ms(p_monitor text) returns int
language sql immutable as $$
  select case p_monitor when 'site' then 1500 when 'funcoes' then 1500 else 800 end
$$;

-- Para a Edge Function medir o caminho até à base de dados.
create or replace function public._saude_ping() returns int
language sql stable as $$ select 1 $$;

-- ------------------------------------------------------------ a amostra
create or replace function public._saude_registar(p_sondas jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  agora timestamptz := clock_timestamp();
  s jsonb;
  v_mon text;
  ult record;
  ant record;
  v_motivos jsonb[] := '{}';
  v_json jsonb;
  v_nivel int;
  v_inst text;
  v_conf text;
  v_oks int;
  p_conf text := 'ok';
  p_inst text := 'ok';
  p_oks int := 0;
  p_em timestamptz;
  v_cpu numeric; v_ram numeric; v_disco numeric; v_carga numeric; v_pool int;
  v_dt numeric; v_di numeric;
  v_lig int; v_max int; v_ativas int; v_lenta numeric; v_bloq int;
  v_fila int; v_partidas int; v_paradas int;
  v_cron int := 0;
  v_http int := 0; v_http_erros int := 0; v_erros_http numeric;
  v_ms jsonb := '{}'::jsonb;
  v_viu_sondas boolean;
  v_inc bigint;
  v_mudou text;
  v_inicio timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('rangify-saude'));

  -- 1. Guarda as sondas que chegaram (o cron, sem sondas, só mede o que a base de dados sabe).
  if jsonb_typeof(p_sondas) = 'array' then
    for s in select * from jsonb_array_elements(p_sondas) loop
      continue when jsonb_typeof(s) is distinct from 'object';
      continue when coalesce(s->>'monitor', '') not in ('site', 'api', 'auth', 'funcoes', 'servidor');
      continue when jsonb_typeof(s->'ok') is distinct from 'boolean';
      insert into saude_sondas (em, monitor, ok, ms, detalhe, extra)
      values (
        agora, s->>'monitor', (s->>'ok')::boolean,
        case when jsonb_typeof(s->'ms') = 'number' then least(greatest((s->>'ms')::numeric, 0), 600000)::int end,
        left(s->>'detalhe', 200),
        case when jsonb_typeof(s->'extra') = 'object' then s->'extra' end
      );
    end loop;
  end if;

  -- 2. O que dizem as sondas dos últimos 150 segundos.
  foreach v_mon in array array['site', 'api', 'auth', 'funcoes'] loop
    select * into ult from saude_sondas where monitor = v_mon and em > agora - interval '150 seconds' order by em desc limit 1;
    continue when not found;
    if ult.ms is not null then v_ms := v_ms || jsonb_build_object(v_mon, ult.ms); end if;
    if not ult.ok then
      v_motivos := v_motivos || jsonb_build_object('codigo', 'monitor_em_baixo', 'monitor', v_mon, 'nivel', 'em_baixo', 'detalhe', ult.detalhe);
    else
      v_motivos := v_motivos || public._saude_avaliar('resposta_lenta', ult.ms, public._saude_limite_ms(v_mon), public._saude_limite_ms(v_mon) * 3, v_mon);
    end if;
  end loop;

  -- Já houve sondas mas pararam de chegar: a Edge Function não está a responder.
  v_viu_sondas := exists (select 1 from saude_sondas where em > agora - interval '7 days');
  if v_viu_sondas and not exists (select 1 from saude_sondas where em > agora - interval '150 seconds') then
    v_motivos := v_motivos || jsonb_build_object('codigo', 'sondas_em_falta', 'nivel', 'sobrecarga');
  end if;

  -- 3. O servidor (CPU, memória, disco): a CPU precisa de dois pontos, porque o servidor só dá contadores.
  select * into ult from saude_sondas where monitor = 'servidor' and em > agora - interval '150 seconds' order by em desc limit 1;
  if found and ult.ok and ult.extra is not null then
    v_ram := (ult.extra->>'ram')::numeric;
    v_disco := (ult.extra->>'disco')::numeric;
    v_carga := (ult.extra->>'carga')::numeric;
    v_pool := (ult.extra->>'poolEspera')::numeric::int;
    select * into ant from saude_sondas
      where monitor = 'servidor' and ok and extra is not null and em < ult.em and em > ult.em - interval '5 minutes'
      order by em desc limit 1;
    if found then
      v_dt := (ult.extra->>'cpuTotal')::numeric - (ant.extra->>'cpuTotal')::numeric;
      v_di := (ult.extra->>'cpuOcioso')::numeric - (ant.extra->>'cpuOcioso')::numeric;
      if v_dt > 0 and v_di >= 0 then v_cpu := least(100, greatest(0, 100 * (1 - v_di / v_dt))); end if;
    end if;
  end if;

  -- 4. A base de dados por dentro (só contagens: nunca o texto das consultas).
  select count(*) filter (where backend_type = 'client backend'),
         count(*) filter (where backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()),
         coalesce(max(extract(epoch from clock_timestamp() - query_start)) filter (where backend_type = 'client backend' and state = 'active' and pid <> pg_backend_pid()), 0),
         count(*) filter (where backend_type = 'client backend' and wait_event_type = 'Lock')
    into v_lig, v_ativas, v_lenta, v_bloq
    from pg_stat_activity where datname = current_database();
  v_max := current_setting('max_connections')::int;

  -- 5. O jogo: fila, partidas a decorrer e partidas paradas (os mesmos prazos da área Staff: 10 min nas fases de
  --    preparação, 3 horas em jogo).
  select count(*) into v_fila from queue_entries;
  select count(*) filter (where state not in ('COMPLETED', 'CANCELLED')),
         count(*) filter (where state not in ('COMPLETED', 'CANCELLED', 'DISPUTE') and (
           (state in ('IN_PROGRESS', 'RESULT_SUBMISSION') and updated_at < agora - interval '3 hours')
           or (state not in ('IN_PROGRESS', 'RESULT_SUBMISSION') and updated_at < agora - interval '10 minutes')))
    into v_partidas, v_paradas from matches;

  -- 6. Falhas do cron e dos pedidos que a base de dados faz às Edge Functions (só existem no Supabase).
  if to_regclass('cron.job_run_details') is not null then
    execute $q$ select count(*) from cron.job_run_details where start_time > now() - interval '15 minutes' and status = 'failed' $q$ into v_cron;
  end if;
  if to_regclass('net._http_response') is not null then
    execute $q$ select count(*), count(*) filter (where timed_out or status_code is null or status_code >= 400)
                from net._http_response where created > now() - interval '15 minutes' $q$ into v_http, v_http_erros;
  end if;
  -- Com poucos pedidos a percentagem não quer dizer nada. E enquanto a função saude-sondar não existir (nunca chegou uma
  -- sonda) o próprio cron lhe faz um pedido por minuto que falha com 404: esses não contam como um problema do site.
  if v_http >= 8 and v_viu_sondas then v_erros_http := round(100.0 * v_http_erros / v_http, 1); end if;

  -- 7. Os limites. Cada um dá um motivo se for atingido (aviso: "lento"; crítico: "sobrecarga").
  v_motivos := v_motivos || array_remove(array[
    public._saude_avaliar('cpu', v_cpu, 70, 90),
    public._saude_avaliar('ram', v_ram, 85, 95),
    public._saude_avaliar('disco', v_disco, 80, 92),
    public._saude_avaliar('carga', v_carga, 1, 2),
    public._saude_avaliar('pool_api', v_pool, 1, 5),
    public._saude_avaliar('ligacoes', round(100.0 * v_lig / nullif(v_max, 0), 1), 60, 85),
    public._saude_avaliar('consulta_lenta', v_lenta, 5, 30),
    public._saude_avaliar('bloqueios', v_bloq, 3, 10),
    public._saude_avaliar('partidas_paradas', v_paradas, 3, 10),
    public._saude_avaliar('erros_http', v_erros_http, 25, 60),
    public._saude_avaliar('cron_falhas', v_cron, 1, 5)
  ], null);

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_json from unnest(v_motivos) x where x is not null;
  select coalesce(max(public._saude_nivel(x->>'nivel')), 0) into v_nivel from jsonb_array_elements(v_json) x;
  v_inst := (array['ok', 'lento', 'sobrecarga', 'em_baixo'])[v_nivel + 1];

  -- 8. Confirmar (como as tentativas do Uptime Kuma).
  select estado, estado_instante, ok_seguidas, em into p_conf, p_inst, p_oks, p_em from saude_amostras order by em desc, id desc limit 1;
  if not found then p_conf := 'ok'; p_inst := 'ok'; p_oks := 0; p_em := null; end if;
  -- Depois de uma pausa longa (cron parado) recomeça-se sem memória do instante anterior.
  if p_em is not null and p_em < agora - interval '10 minutes' then p_inst := 'ok'; end if;
  v_oks := case when v_inst = 'ok' then p_oks + 1 else 0 end;
  if v_inst <> 'ok' then
    if p_conf <> 'ok' then v_conf := v_inst;                                          -- já há incidente: acompanha
    elsif p_inst <> 'ok' then v_conf := public._saude_pior(v_inst, p_inst);           -- 2.ª má seguida: confirma
    else v_conf := 'ok'; end if;                                                      -- 1.ª má: a confirmar
  else
    v_conf := case when p_conf <> 'ok' and v_oks < 3 then p_conf else 'ok' end;       -- recupera depois de 3 boas
  end if;

  insert into saude_amostras (em, estado, estado_instante, ok_seguidas, motivos, cpu, ram, disco, carga, pool_espera, ligacoes, ligacoes_max, ativas,
                              mais_lenta_s, bloqueadas, fila, partidas, partidas_paradas, erros_http, ms)
  values (agora, v_conf, v_inst, v_oks, v_json, v_cpu, v_ram, v_disco, v_carga, v_pool, v_lig, v_max, v_ativas,
          v_lenta, v_bloq, v_fila, v_partidas, v_paradas, v_erros_http, v_ms);

  -- 9. Incidentes: abre quando deixa de estar ok, fecha quando recupera.
  select id into v_inc from saude_incidentes where fim is null order by inicio desc limit 1;
  if p_conf = 'ok' and v_conf <> 'ok' then
    v_inicio := case when p_inst <> 'ok' and p_em is not null then p_em else agora end;
    insert into saude_incidentes (inicio, estado, motivos) values (v_inicio, v_conf, v_json) returning id into v_inc;
    v_mudou := 'abriu';
  elsif p_conf <> 'ok' and v_conf = 'ok' then
    update saude_incidentes set fim = agora where id = v_inc;
    v_mudou := 'fechou';
  elsif v_conf <> 'ok' then
    if v_inc is null then
      insert into saude_incidentes (inicio, estado, motivos) values (agora, v_conf, v_json) returning id into v_inc;
    else
      update saude_incidentes set
        estado = public._saude_pior(estado, v_conf),
        motivos = (
          select coalesce(jsonb_agg(x.motivo), '[]'::jsonb) from (
            select distinct on (e.motivo->>'codigo', coalesce(e.motivo->>'monitor', '')) e.motivo
            from jsonb_array_elements(saude_incidentes.motivos || v_json) as e(motivo)
            order by e.motivo->>'codigo', coalesce(e.motivo->>'monitor', ''), (e.motivo->>'valor')::numeric desc nulls last
          ) x
        )
      where id = v_inc;
    end if;
    if public._saude_nivel(v_conf) > public._saude_nivel(p_conf) then v_mudou := 'piorou';
    elsif public._saude_nivel(v_conf) < public._saude_nivel(p_conf) then v_mudou := 'melhorou'; end if;
  end if;

  -- 10. Limpeza ao acaso, para as tabelas não crescerem sem fim.
  if random() < 0.02 then
    delete from saude_sondas where em < agora - interval '7 days';
    delete from saude_amostras where em < agora - interval '30 days';
  end if;

  select inicio into v_inicio from saude_incidentes where id = v_inc and fim is null;
  return jsonb_build_object('estado', v_conf, 'anterior', p_conf, 'mudou', v_mudou, 'motivos', v_json, 'desde', v_inicio, 'incidente', v_inc);
end $$;
revoke all on function public._saude_registar(jsonb) from public, anon, authenticated;
grant execute on function public._saude_registar(jsonb) to service_role;
revoke all on function public._saude_ping() from public, anon, authenticated;
grant execute on function public._saude_ping() to service_role;
revoke all on function public._saude_nivel(text), public._saude_pior(text, text), public._saude_avaliar(text, numeric, numeric, numeric, text), public._saude_limite_ms(text)
  from public, anon, authenticated;

-- ------------------------------------------------------------ ler (só Owner e Dev)
create or replace function public.saude(p_periodo text default '24h') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_horas int := case p_periodo when '1h' then 1 when '7d' then 168 when '30d' then 720 else 24 end;
  v_passo int := case p_periodo when '1h' then 60 when '7d' then 1800 when '30d' then 7200 else 300 end;
  a saude_amostras;
  v_desde timestamptz;
begin
  perform _exigir_owner_dev();
  perform _limitar('saude', 60, 60);
  select * into a from saude_amostras order by em desc, id desc limit 1;
  select inicio into v_desde from saude_incidentes where fim is null order by inicio desc limit 1;

  return jsonb_build_object(
    'periodo', case when p_periodo in ('1h', '7d', '30d') then p_periodo else '24h' end,
    'estado', coalesce(a.estado, 'ok'),
    'aConfirmar', coalesce(a.estado_instante <> 'ok' and a.estado = 'ok', false),
    'aRecuperar', coalesce(a.estado_instante = 'ok' and a.estado <> 'ok', false),
    'desde', v_desde,
    'amostraEm', a.em,
    'idadeS', case when a.em is null then null else round(extract(epoch from clock_timestamp() - a.em)) end,
    'semSondas', not exists (select 1 from saude_sondas where em > now() - interval '7 days'),
    'motivos', coalesce(a.motivos, '[]'::jsonb),
    'agora', case when a.em is null then null else jsonb_build_object(
      'cpu', a.cpu, 'ram', a.ram, 'disco', a.disco, 'carga', a.carga, 'poolEspera', a.pool_espera,
      'ligacoes', a.ligacoes, 'ligacoesMax', a.ligacoes_max, 'ativas', a.ativas, 'maisLentaS', a.mais_lenta_s, 'bloqueadas', a.bloqueadas,
      'fila', a.fila, 'partidas', a.partidas, 'partidasParadas', a.partidas_paradas, 'errosHttp', a.erros_http
    ) end,
    -- A última leitura das métricas do servidor (CPU, memória, disco): se falhar, o ecrã diz porquê.
    'servidor', (select jsonb_build_object('ok', s.ok, 'detalhe', s.detalhe, 'idadeS', round(extract(epoch from clock_timestamp() - s.em)))
                 from saude_sondas s where s.monitor = 'servidor' order by s.em desc limit 1),
    'monitores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'avisoMs', public._saude_limite_ms(m.id),
        'ultimos', (select coalesce(jsonb_agg(jsonb_build_object('em', s.em, 'ok', s.ok, 'ms', s.ms) order by s.em), '[]'::jsonb)
                    from (select em, ok, ms from saude_sondas where monitor = m.id order by em desc limit 60) s),
        'detalhe', (select detalhe from saude_sondas where monitor = m.id order by em desc limit 1),
        'idadeS', (select round(extract(epoch from clock_timestamp() - max(em))) from saude_sondas where monitor = m.id),
        'disponibilidade24h', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from saude_sondas where monitor = m.id and em > now() - interval '24 hours'),
        'disponibilidade7d', (select round(100.0 * count(*) filter (where ok) / nullif(count(*), 0), 2) from saude_sondas where monitor = m.id and em > now() - interval '7 days'),
        'mediaMs', (select round(avg(ms)) from saude_sondas where monitor = m.id and ok and em > now() - interval '24 hours')
      ) order by m.ordem), '[]'::jsonb)
      from (values ('site', 1), ('api', 2), ('auth', 3), ('funcoes', 4)) m(id, ordem)
      where exists (select 1 from saude_sondas where monitor = m.id)
    ),
    'serie', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'em', b.t, 'estado', b.estado, 'cpu', b.cpu, 'ram', b.ram, 'ligacoes', b.ligacoes, 'ligacoesMax', b.ligacoes_max,
        'ativas', b.ativas, 'msApi', b.ms_api, 'msSite', b.ms_site
      ) order by b.t), '[]'::jsonb)
      from (
        select to_timestamp(floor(extract(epoch from em) / v_passo) * v_passo) as t,
               (array['ok', 'lento', 'sobrecarga', 'em_baixo'])[max(public._saude_nivel(estado)) + 1] as estado,
               max(cpu) as cpu, max(ram) as ram, max(ligacoes) as ligacoes, max(ligacoes_max) as ligacoes_max, max(ativas) as ativas,
               max((ms->>'api')::numeric) as ms_api, max((ms->>'site')::numeric) as ms_site
        from saude_amostras where em > now() - make_interval(hours => v_horas)
        group by 1
      ) b
    ),
    'incidentes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'inicio', i.inicio, 'fim', i.fim, 'estado', i.estado, 'motivos', i.motivos) order by i.inicio desc), '[]'::jsonb)
      from (select * from saude_incidentes order by inicio desc limit 20) i
    )
  );
end $$;

-- Só o essencial, para o aviso no menu (vai sendo pedido de minuto a minuto).
create or replace function public.saude_resumo() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a saude_amostras;
begin
  perform _exigir_owner_dev();
  perform _limitar('saude_resumo', 60, 60);
  select * into a from saude_amostras order by em desc, id desc limit 1;
  return jsonb_build_object(
    'estado', coalesce(a.estado, 'ok'),
    'aConfirmar', coalesce(a.estado_instante <> 'ok' and a.estado = 'ok', false),
    'motivos', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('codigo', x->>'codigo', 'monitor', x->>'monitor', 'nivel', x->>'nivel')))
                         from jsonb_array_elements(a.motivos) x), '[]'::jsonb)
  );
end $$;
revoke all on function public.saude(text), public.saude_resumo() from public, anon;
grant execute on function public.saude(text), public.saude_resumo() to authenticated, service_role;

-- ------------------------------------------------------------ o relógio (de minuto a minuto)
-- Pede à Edge Function as sondas. Se não houver nenhuma amostra nos últimos 150 segundos, regista-a sem elas.
create or replace function public._saude_ciclo() returns void
language plpgsql volatile security definer set search_path = public as $$
declare c discord_config;
begin
  begin
    select * into c from discord_config where id = 1;
    if found then
      perform net.http_post(
        url := regexp_replace(c.url, '/[^/]*$', '/saude-sondar'),
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-rangify-segredo', c.segredo),
        timeout_milliseconds := 20000
      );
    end if;
  exception when others then
    raise warning 'Estado do site: não foi possível pedir as sondas: %', sqlerrm;
  end;
  if not exists (select 1 from saude_amostras where em > clock_timestamp() - interval '150 seconds') then
    perform public._saude_registar(null);
  end if;
end $$;
revoke all on function public._saude_ciclo() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rangify-saude', '* * * * *', 'select public._saude_ciclo()');
exception when others then
  raise notice 'pg_cron indisponível: o estado do site só se regista quando _saude_registar() for chamada.';
end $$;
