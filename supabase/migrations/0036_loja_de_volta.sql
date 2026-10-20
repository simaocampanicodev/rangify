-- A loja de Rangify Coins e os cosméticos voltam.
--
-- A 0035 tinha-os apagado. Esta migração volta a criar tudo, tal como estava antes: as tabelas (itens, inventário,
-- equipados, rotação), as funções (loja, comprar_item, equipar_item, cosmeticos...), as colunas profiles.avatar_gif e
-- config.shop_public e as contas de coins. Quem não correu a 0035 não perde nada: tudo o que isto cria já existe e
-- nada é apagado.
--
-- ATENÇÃO: o que as pessoas tinham comprado antes da 0035 já não existe (foi apagado por ela) e não volta. As coins
-- ganhas a jogar (níveis, missões, MVPs) voltam, porque se calculam a partir do que já foi jogado.
--
-- Corre depois de 0001 a 0035. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists shop_public boolean not null default false;
alter table public.profiles add column if not exists avatar_gif text;

create table if not exists public.shop_items (
  id text primary key,
  category text not null check (category in ('borda', 'efeito', 'gif', 'placa', 'banner', 'titulo', 'cartao', 'linha', 'mvp')),
  rarity text not null check (rarity in ('comum', 'raro', 'epico', 'lendario')),
  price int not null check (price >= 0),
  achievement boolean not null default false,
  sort int not null default 0
);

create table if not exists public.shop_inventory (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null references public.shop_items (id) on delete cascade,
  source text not null default 'compra' check (source in ('compra', 'conquista')),
  acquired_at timestamptz not null default now(),
  primary key (profile_id, item_id)
);

create table if not exists public.shop_equipped (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  item_id text not null references public.shop_items (id) on delete cascade,
  primary key (profile_id, category)
);

-- Cada movimento de coins que não vem do Experience.
create table if not exists public.coin_ledger (
  id bigserial primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('compra', 'devolucao', 'teste')),
  item_id text references public.shop_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_perfil on public.coin_ledger (profile_id);

create table if not exists public.shop_rotation (
  day date primary key,
  diarios text[] not null,
  semanais text[] not null,
  destaque text,
  semana date not null,
  bloco int not null,
  created_at timestamptz not null default now()
);

-- Só as funções lhes mexem.
alter table public.shop_items enable row level security;
alter table public.shop_inventory enable row level security;
alter table public.shop_equipped enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.shop_rotation enable row level security;

-- ---------------------------------------------------------------- catálogo
-- Gerado a partir de src/lib/loja.ts (node scripts/gerar-loja-sql.mjs). Não editar à mão.
-- loja:itens:inicio
insert into public.shop_items (id, category, rarity, price, achievement, sort) values
  ('b-aro', 'borda', 'comum', 300, false, 1),
  ('b-marfim', 'borda', 'comum', 300, false, 2),
  ('b-tracejado', 'borda', 'comum', 350, false, 3),
  ('b-duplo', 'borda', 'comum', 400, false, 4),
  ('b-cantos', 'borda', 'raro', 600, false, 5),
  ('b-mira', 'borda', 'raro', 650, false, 6),
  ('b-hex', 'borda', 'raro', 700, false, 7),
  ('b-sol', 'borda', 'raro', 750, false, 8),
  ('b-chama', 'borda', 'epico', 1000, false, 9),
  ('b-radar', 'borda', 'epico', 1100, false, 10),
  ('b-pulso', 'borda', 'epico', 1150, false, 11),
  ('b-dentes', 'borda', 'epico', 1250, false, 12),
  ('b-ouro', 'borda', 'lendario', 1600, false, 13),
  ('b-eclipse', 'borda', 'lendario', 1800, false, 14),
  ('b-plasma', 'borda', 'lendario', 2000, false, 15),
  ('b-prisma', 'borda', 'lendario', 2200, false, 16),
  ('e-halo', 'efeito', 'comum', 350, false, 17),
  ('e-brilho', 'efeito', 'comum', 400, false, 18),
  ('e-bate', 'efeito', 'comum', 450, false, 19),
  ('e-faiscas', 'efeito', 'raro', 700, false, 20),
  ('e-orbita', 'efeito', 'raro', 750, false, 21),
  ('e-ondas', 'efeito', 'raro', 800, false, 22),
  ('e-brasas', 'efeito', 'raro', 850, false, 23),
  ('e-duas', 'efeito', 'epico', 1100, false, 24),
  ('e-raios', 'efeito', 'epico', 1200, false, 25),
  ('e-cintila', 'efeito', 'epico', 1250, false, 26),
  ('e-fumo', 'efeito', 'lendario', 1700, false, 27),
  ('e-aura', 'efeito', 'lendario', 2000, false, 28),
  ('gif', 'gif', 'lendario', 2000, false, 29),
  ('p-cinza', 'placa', 'comum', 300, false, 30),
  ('p-pixel', 'placa', 'comum', 400, false, 31),
  ('p-riscas', 'placa', 'comum', 400, false, 32),
  ('p-grelha', 'placa', 'comum', 450, false, 33),
  ('p-brasa', 'placa', 'raro', 750, false, 34),
  ('p-fios', 'placa', 'raro', 800, false, 35),
  ('p-sol', 'placa', 'raro', 850, false, 36),
  ('p-topo', 'placa', 'raro', 900, false, 37),
  ('p-circuito', 'placa', 'epico', 1100, false, 38),
  ('p-neon', 'placa', 'epico', 1150, false, 39),
  ('p-solido', 'placa', 'epico', 1200, false, 40),
  ('p-calor', 'placa', 'epico', 1250, false, 41),
  ('p-supernova', 'placa', 'lendario', 1800, false, 42),
  ('p-aurora', 'placa', 'lendario', 1900, false, 43),
  ('p-constelacao', 'placa', 'lendario', 2000, false, 44),
  ('p-ouro', 'placa', 'lendario', 2200, false, 45),
  ('bn-grad', 'banner', 'comum', 400, false, 46),
  ('bn-riscas', 'banner', 'comum', 400, false, 47),
  ('bn-grelha', 'banner', 'comum', 450, false, 48),
  ('bn-fios', 'banner', 'raro', 800, false, 49),
  ('bn-sol', 'banner', 'raro', 850, false, 50),
  ('bn-dunas', 'banner', 'raro', 900, false, 51),
  ('bn-infinita', 'banner', 'epico', 1200, false, 52),
  ('bn-cidade', 'banner', 'epico', 1250, false, 53),
  ('bn-estrelas', 'banner', 'epico', 1300, false, 54),
  ('bn-eclipse', 'banner', 'lendario', 1800, false, 55),
  ('bn-supernova', 'banner', 'lendario', 2000, false, 56),
  ('bn-ouro', 'banner', 'lendario', 2200, false, 57),
  ('t-recruta', 'titulo', 'comum', 300, false, 58),
  ('t-fila', 'titulo', 'comum', 350, false, 59),
  ('t-fiel', 'titulo', 'comum', 350, false, 60),
  ('t-equipa', 'titulo', 'comum', 400, false, 61),
  ('t-clutch', 'titulo', 'raro', 650, false, 62),
  ('t-entry', 'titulo', 'raro', 700, false, 63),
  ('t-capitao', 'titulo', 'raro', 750, false, 64),
  ('t-ferro', 'titulo', 'raro', 800, false, 65),
  ('t-ace', 'titulo', 'epico', 1100, false, 66),
  ('t-piedade', 'titulo', 'epico', 1200, false, 67),
  ('t-lotus', 'titulo', 'epico', 1250, false, 68),
  ('t-mvp', 'titulo', 'epico', 0, true, 69),
  ('t-lenda', 'titulo', 'lendario', 1800, false, 70),
  ('t-imparavel', 'titulo', 'lendario', 2000, false, 71),
  ('t-primeiro', 'titulo', 'lendario', 0, true, 72),
  ('t-topo', 'titulo', 'lendario', 0, true, 73),
  ('c-riscas', 'cartao', 'comum', 500, false, 74),
  ('c-grelha', 'cartao', 'comum', 500, false, 75),
  ('c-faixa', 'cartao', 'comum', 550, false, 76),
  ('c-brasa', 'cartao', 'raro', 800, false, 77),
  ('c-cantos', 'cartao', 'raro', 850, false, 78),
  ('c-dupla', 'cartao', 'raro', 900, false, 79),
  ('c-assinatura', 'cartao', 'epico', 1200, false, 80),
  ('c-ponto', 'cartao', 'epico', 1250, false, 81),
  ('c-holo', 'cartao', 'epico', 1300, false, 82),
  ('c-noite', 'cartao', 'lendario', 1800, false, 83),
  ('c-supernova', 'cartao', 'lendario', 1900, false, 84),
  ('c-ouro', 'cartao', 'lendario', 2100, false, 85),
  ('l-contorno', 'linha', 'comum', 400, false, 86),
  ('l-riscas', 'linha', 'comum', 400, false, 87),
  ('l-sub', 'linha', 'comum', 450, false, 88),
  ('l-varredura', 'linha', 'raro', 700, false, 89),
  ('l-brasa', 'linha', 'raro', 750, false, 90),
  ('l-vivo', 'linha', 'raro', 800, false, 91),
  ('l-ouro', 'linha', 'epico', 1000, false, 92),
  ('l-neon', 'linha', 'epico', 1150, false, 93),
  ('l-chama', 'linha', 'epico', 1300, false, 94),
  ('l-holofote', 'linha', 'lendario', 1700, false, 95),
  ('l-supernova', 'linha', 'lendario', 1900, false, 96),
  ('l-coroa', 'linha', 'lendario', 2100, false, 97),
  ('m-classica', 'mvp', 'comum', 300, false, 98),
  ('m-carimbo', 'mvp', 'comum', 400, false, 99),
  ('m-brilho', 'mvp', 'comum', 450, false, 100),
  ('m-rodar', 'mvp', 'raro', 700, false, 101),
  ('m-varre', 'mvp', 'raro', 750, false, 102),
  ('m-faiscas', 'mvp', 'raro', 850, false, 103),
  ('m-explosao', 'mvp', 'epico', 1100, false, 104),
  ('m-confetes', 'mvp', 'epico', 1200, false, 105),
  ('m-coroa', 'mvp', 'epico', 1300, false, 106),
  ('m-cometa', 'mvp', 'lendario', 1800, false, 107),
  ('m-chamas', 'mvp', 'lendario', 2000, false, 108),
  ('m-ouro', 'mvp', 'lendario', 2200, false, 109)
on conflict (id) do update set category = excluded.category, rarity = excluded.rarity, price = excluded.price, achievement = excluded.achievement, sort = excluded.sort;
delete from public.shop_items where id not in ('b-aro', 'b-marfim', 'b-tracejado', 'b-duplo', 'b-cantos', 'b-mira', 'b-hex', 'b-sol', 'b-chama', 'b-radar', 'b-pulso', 'b-dentes', 'b-ouro', 'b-eclipse', 'b-plasma', 'b-prisma', 'e-halo', 'e-brilho', 'e-bate', 'e-faiscas', 'e-orbita', 'e-ondas', 'e-brasas', 'e-duas', 'e-raios', 'e-cintila', 'e-fumo', 'e-aura', 'gif', 'p-cinza', 'p-pixel', 'p-riscas', 'p-grelha', 'p-brasa', 'p-fios', 'p-sol', 'p-topo', 'p-circuito', 'p-neon', 'p-solido', 'p-calor', 'p-supernova', 'p-aurora', 'p-constelacao', 'p-ouro', 'bn-grad', 'bn-riscas', 'bn-grelha', 'bn-fios', 'bn-sol', 'bn-dunas', 'bn-infinita', 'bn-cidade', 'bn-estrelas', 'bn-eclipse', 'bn-supernova', 'bn-ouro', 't-recruta', 't-fila', 't-fiel', 't-equipa', 't-clutch', 't-entry', 't-capitao', 't-ferro', 't-ace', 't-piedade', 't-lotus', 't-mvp', 't-lenda', 't-imparavel', 't-primeiro', 't-topo', 'c-riscas', 'c-grelha', 'c-faixa', 'c-brasa', 'c-cantos', 'c-dupla', 'c-assinatura', 'c-ponto', 'c-holo', 'c-noite', 'c-supernova', 'c-ouro', 'l-contorno', 'l-riscas', 'l-sub', 'l-varredura', 'l-brasa', 'l-vivo', 'l-ouro', 'l-neon', 'l-chama', 'l-holofote', 'l-supernova', 'l-coroa', 'm-classica', 'm-carimbo', 'm-brilho', 'm-rodar', 'm-varre', 'm-faiscas', 'm-explosao', 'm-confetes', 'm-coroa', 'm-cometa', 'm-chamas', 'm-ouro');
-- loja:itens:fim

-- ---------------------------------------------------------------- coins

/** As coins que o Experience já deu: 150 por nível, +500 em cada 5.º nível, 40 por semanal, 25 por MVP. */
create or replace function public._moedas_ganhas(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel int := ((_nivel(_xp(p_perfil)))->>'nivel')::int;
  v_semanais int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'weekly');
  v_mvps int := (select count(*) from match_players mp join matches m on m.id = mp.match_id
                  where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic);
begin
  return jsonb_build_object(
    'nivel', v_nivel,
    'porNivel', 150 * greatest(0, v_nivel - 1),
    'porMarcos', 500 * (v_nivel / 5),
    'porSemanais', 40 * v_semanais,
    'porMvp', 25 * v_mvps
  );
end $$;

create or replace function public._moedas(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select (g->>'porNivel')::int + (g->>'porMarcos')::int + (g->>'porSemanais')::int + (g->>'porMvp')::int
    + coalesce((select sum(delta) from coin_ledger where profile_id = p_perfil), 0)::int
  from (select _moedas_ganhas(p_perfil) as g) x
$$;

-- ---------------------------------------------------------------- rotação

create or replace function public._dia_loja() returns date
language sql stable as $$ select (now() at time zone 'Europe/Lisbon')::date $$;

/** Um item ao calhas, com mais peso nos comuns: 52% comum, 32% raro, 16% épico. */
create or replace function public._sortear_item(p_categorias text[], p_raridades text[], p_fora text[]) returns text
language sql volatile security definer set search_path = public as $$
  select id from shop_items
  where category = any (p_categorias) and rarity = any (p_raridades) and not achievement and id <> 'gif'
    and not (id = any (coalesce(p_fora, '{}')))
  order by -ln(greatest(random(), 1e-9)) / case rarity when 'comum' then 52 when 'raro' then 32 when 'epico' then 16 else 10 end
  limit 1
$$;

/**
 * A loja de hoje. Nasce no primeiro pedido do dia; com p_forcar sorteia tudo de novo
 * (Owner e Dev, para testar). Os semanais duram a semana e o destaque 3 dias.
 */
create or replace function public._loja_hoje(p_forcar boolean default false) returns public.shop_rotation
language plpgsql volatile security definer set search_path = public as $$
declare
  v_dia date := _dia_loja();
  v_semana date := date_trunc('week', v_dia)::date;
  v_bloco int := (v_dia - date '2026-01-01') / 3;
  r shop_rotation;
  ant shop_rotation;
  v_recentes text[];
  v_semanais text[] := '{}';
  v_destaque text;
  v_diarios text[] := '{}';
  v_cat text;
  v_item text;
begin
  select * into r from shop_rotation where day = v_dia;
  if found and not p_forcar then return r; end if;
  perform pg_advisory_xact_lock(hashtext('rangify_loja'));
  select * into r from shop_rotation where day = v_dia;
  if found and not p_forcar then return r; end if;

  v_recentes := array(select distinct x from shop_rotation s, unnest(s.diarios || s.semanais || array[s.destaque]) x
                      where s.day >= v_dia - 13 and s.day < v_dia and x is not null);
  select * into ant from shop_rotation where day < v_dia order by day desc limit 1;

  -- Semanais: dois épicos de categorias diferentes, os mesmos a semana toda.
  if not p_forcar and ant.day is not null and ant.semana = v_semana then
    v_semanais := ant.semanais;
  else
    for i in 1..2 loop
      v_item := _sortear_item(array(select distinct category from shop_items where category <> 'gif'
                                     and not (category = any (array(select category from shop_items where id = any (v_semanais))))),
                              array['epico'], v_recentes || v_semanais);
      if v_item is null then v_item := _sortear_item(array(select distinct category from shop_items), array['epico'], v_semanais); end if;
      if v_item is not null then v_semanais := v_semanais || v_item; end if;
    end loop;
  end if;

  -- Destaque: um lendário, o mesmo durante 3 dias.
  if not p_forcar and ant.day is not null and ant.bloco = v_bloco then
    v_destaque := ant.destaque;
  else
    v_destaque := coalesce(_sortear_item(array(select distinct category from shop_items), array['lendario'], v_recentes),
                           _sortear_item(array(select distinct category from shop_items), array['lendario'], '{}'));
  end if;

  -- Diários: um de cada categoria (sem lendários), fora dos que saíram nos últimos 14 dias.
  foreach v_cat in array array['borda', 'efeito', 'placa', 'banner', 'titulo', 'cartao', 'linha', 'mvp'] loop
    v_item := coalesce(_sortear_item(array[v_cat], array['comum', 'raro', 'epico'], v_recentes || v_semanais),
                       _sortear_item(array[v_cat], array['comum', 'raro', 'epico'], v_semanais));
    if v_item is not null then v_diarios := v_diarios || v_item; end if;
  end loop;

  insert into shop_rotation (day, diarios, semanais, destaque, semana, bloco)
  values (v_dia, v_diarios, v_semanais, v_destaque, v_semana, v_bloco)
  on conflict (day) do update set diarios = excluded.diarios, semanais = excluded.semanais, destaque = excluded.destaque,
    semana = excluded.semana, bloco = excluded.bloco, created_at = now()
  returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------- inventário

create or replace function public._loja_staff(p profiles) returns boolean
language sql stable as $$ select p.role in ('owner', 'dev') $$;

create or replace function public._loja_visivel(p profiles) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select shop_public from config where id), false) or coalesce(p.role in ('owner', 'dev'), false)
$$;

/** Os títulos que se ganham a jogar entram no inventário assim que a condição se cumpre. */
create or replace function public._dar_conquistas(p_perfil uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if (select count(*) from match_players mp join matches m on m.id = mp.match_id
      where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic) >= 10 then
    insert into shop_inventory (profile_id, item_id, source) values (p_perfil, 't-mvp', 'conquista') on conflict do nothing;
  end if;
  if p_perfil in (select id from profiles where not is_bot order by created_at, id limit 100) then
    insert into shop_inventory (profile_id, item_id, source) values (p_perfil, 't-primeiro', 'conquista') on conflict do nothing;
  end if;
  if p_perfil = (select id from profiles where not is_bot and riot_id is not null order by points desc, wins desc, username limit 1) then
    insert into shop_inventory (profile_id, item_id, source) values (p_perfil, 't-topo', 'conquista') on conflict do nothing;
  end if;
end $$;

create or replace function public._loja_disponivel(p_item text) returns boolean
language sql volatile security definer set search_path = public as $$
  select p_item = 'gif' or exists (
    select 1 from (select _loja_hoje() as r) h where p_item = any ((h.r).diarios || (h.r).semanais || array[(h.r).destaque])
  )
$$;

-- ---------------------------------------------------------------- RPCs

/** Tudo o que a página da loja precisa. Para quem não a pode ver: { visivel: false }. */
create or replace function public.loja() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  h shop_rotation;
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  if not _loja_visivel(me) then return jsonb_build_object('visivel', false); end if;
  perform _dar_conquistas(me.id);
  h := _loja_hoje();
  return jsonb_build_object(
    'visivel', true,
    'publica', coalesce((select shop_public from config where id), false),
    'staff', _loja_staff(me),
    'moedas', _moedas(me.id),
    'ganhas', _moedas_ganhas(me.id) || jsonb_build_object('testes', coalesce((select sum(delta) from coin_ledger where profile_id = me.id and reason = 'teste'), 0)),
    'hoje', jsonb_build_object(
      'dia', h.day,
      'diarios', to_jsonb(h.diarios),
      'semanais', to_jsonb(h.semanais),
      'destaque', h.destaque,
      'mudaEm', ((h.day + 1)::timestamp at time zone 'Europe/Lisbon'),
      'semanaisAte', ((h.semana + 7)::timestamp at time zone 'Europe/Lisbon'),
      'destaqueAte', ((date '2026-01-01' + (h.bloco + 1) * 3)::timestamp at time zone 'Europe/Lisbon')
    ),
    'inventario', coalesce((select jsonb_agg(item_id order by acquired_at) from shop_inventory where profile_id = me.id), '[]'),
    'equipados', coalesce((select jsonb_object_agg(category, item_id) from shop_equipped where profile_id = me.id), '{}'),
    'avatarGif', me.avatar_gif
  );
end $$;

create or replace function public.comprar_item(p_item text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  it shop_items;
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  if not _loja_visivel(me) then raise exception 'A loja ainda não está aberta.'; end if;
  select * into it from shop_items where id = p_item;
  if not found then raise exception 'Este item não existe.'; end if;
  perform pg_advisory_xact_lock(hashtext('rangify_coins_' || me.id));
  if exists (select 1 from shop_inventory where profile_id = me.id and item_id = p_item) then raise exception 'Já tens este item.'; end if;
  -- Owner e Dev compram qualquer item, para testar. Os outros só o que está hoje na loja.
  if not _loja_staff(me) then
    if it.achievement then raise exception 'Este item não se compra: ganha-se a jogar.'; end if;
    if not _loja_disponivel(p_item) then raise exception 'Este item já não está na loja hoje.'; end if;
  end if;
  if _moedas(me.id) < it.price then raise exception 'Não tens coins suficientes.'; end if;
  if it.price > 0 then insert into coin_ledger (profile_id, delta, reason, item_id) values (me.id, -it.price, 'compra', p_item); end if;
  insert into shop_inventory (profile_id, item_id) values (me.id, p_item);
  -- O que se compra fica logo equipado (a GIF só quando tiver um link).
  if it.category <> 'gif' or me.avatar_gif is not null then
    insert into shop_equipped (profile_id, category, item_id) values (me.id, it.category, p_item)
    on conflict (profile_id, category) do update set item_id = excluded.item_id;
  end if;
  return loja();
end $$;

create or replace function public.equipar_item(p_item text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v_cat text;
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  if not _loja_visivel(me) then raise exception 'A loja ainda não está aberta.'; end if;
  select category into v_cat from shop_items where id = p_item;
  if v_cat is null then raise exception 'Este item não existe.'; end if;
  if not exists (select 1 from shop_inventory where profile_id = me.id and item_id = p_item) then raise exception 'Ainda não tens este item.'; end if;
  if v_cat = 'gif' and me.avatar_gif is null then raise exception 'Põe primeiro o link da tua GIF.'; end if;
  insert into shop_equipped (profile_id, category, item_id) values (me.id, v_cat, p_item)
  on conflict (profile_id, category) do update set item_id = excluded.item_id;
  return loja();
end $$;

create or replace function public.desequipar_item(p_categoria text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _eu();
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  delete from shop_equipped where profile_id = me.id and category = p_categoria;
  return loja();
end $$;

/** O link da GIF de perfil (precisa da "Foto em GIF"). null tira-a. */
create or replace function public.definir_avatar_gif(p_url text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _eu();
  v text := nullif(trim(coalesce(p_url, '')), '');
begin
  if me.id is null then raise exception 'Tens de entrar na tua conta.'; end if;
  if v is null then
    update profiles set avatar_gif = null where id = me.id;
    delete from shop_equipped where profile_id = me.id and category = 'gif';
    return loja();
  end if;
  if not exists (select 1 from shop_inventory where profile_id = me.id and item_id = 'gif') then raise exception 'Compra primeiro a Foto em GIF na loja.'; end if;
  if length(v) > 500 or v !~* '^https://[^\s"''<>]+$'
     or not (v ~* '\.(gif|webp)(\?\S*)?$' or v ~* '^https://(media[0-9]*\.giphy\.com|i\.giphy\.com|media\.tenor\.com|c\.tenor\.com|cdn\.discordapp\.com|media\.discordapp\.net)/') then
    raise exception 'O link tem de ser https e acabar em .gif ou .webp (ou ser do Giphy, Tenor ou Discord).';
  end if;
  update profiles set avatar_gif = v where id = me.id;
  insert into shop_equipped (profile_id, category, item_id) values (me.id, 'gif', 'gif')
  on conflict (profile_id, category) do update set item_id = excluded.item_id;
  return loja();
end $$;

/**
 * O que cada jogador tem equipado, para desenhar as decorações no site.
 * Enquanto a loja não for pública, só Owner e Dev as veem.
 */
create or replace function public.cosmeticos(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _eu();
begin
  if me.id is null or not _loja_visivel(me) or coalesce(array_length(p_ids, 1), 0) = 0 then return '{}'::jsonb; end if;
  if array_length(p_ids, 1) > 200 then raise exception 'Demasiados jogadores de uma vez.'; end if;
  return coalesce((
    select jsonb_object_agg(x.profile_id::text, x.o) from (
      select e.profile_id, jsonb_object_agg(e.category, case when e.category = 'gif' then to_jsonb(p.avatar_gif) else to_jsonb(e.item_id) end) as o
      from shop_equipped e join profiles p on p.id = e.profile_id
      where e.profile_id = any (p_ids) and (e.category <> 'gif' or p.avatar_gif is not null)
      group by e.profile_id
    ) x
  ), '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------- staff (testes)

create or replace function public.definir_loja_publica(p_publica boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  update config set shop_public = coalesce(p_publica, false), updated_at = now(), updated_by = me.id where id;
  return loja();
end $$;

/** Sorteia a loja de hoje outra vez: diários, semanais e destaque. */
create or replace function public.loja_resetar() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform _exigir_owner_dev();
  perform _loja_hoje(true);
  return loja();
end $$;

/** Coins de teste para o próprio Owner ou Dev (negativo tira). */
create or replace function public.loja_moedas_teste(p_quantidade int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me profiles := _exigir_owner_dev();
begin
  if p_quantidade is null or p_quantidade = 0 or abs(p_quantidade) > 100000 then raise exception 'Escolhe uma quantidade entre 1 e 100 000.'; end if;
  insert into coin_ledger (profile_id, delta, reason) values (me.id, p_quantidade, 'teste');
  return loja();
end $$;

/** Devolve um item (ou todos, com null): sai do inventário e as coins voltam. */
create or replace function public.loja_devolver(p_item text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  r record;
begin
  perform pg_advisory_xact_lock(hashtext('rangify_coins_' || me.id));
  for r in select i.item_id, s.price from shop_inventory i join shop_items s on s.id = i.item_id
           where i.profile_id = me.id and (p_item is null or i.item_id = p_item) and i.source = 'compra' loop
    if r.price > 0 then insert into coin_ledger (profile_id, delta, reason, item_id) values (me.id, r.price, 'devolucao', r.item_id); end if;
  end loop;
  -- Os títulos ganhos a jogar ficam.
  delete from shop_equipped e where e.profile_id = me.id and (p_item is null or e.item_id = p_item)
    and exists (select 1 from shop_inventory i where i.profile_id = me.id and i.item_id = e.item_id and i.source = 'compra');
  delete from shop_inventory where profile_id = me.id and (p_item is null or item_id = p_item) and source = 'compra';
  if not exists (select 1 from shop_inventory where profile_id = me.id and item_id = 'gif') then
    update profiles set avatar_gif = null where id = me.id;
    delete from shop_equipped where profile_id = me.id and category = 'gif';
  end if;
  return loja();
end $$;

revoke all on function public._moedas_ganhas(uuid), public._moedas(uuid), public._sortear_item(text[], text[], text[]),
  public._loja_hoje(boolean), public._dar_conquistas(uuid), public._loja_disponivel(text), public._loja_visivel(profiles)
  from public, anon, authenticated;
grant execute on function public.loja(), public.comprar_item(text), public.equipar_item(text), public.desequipar_item(text),
  public.definir_avatar_gif(text), public.cosmeticos(uuid[]), public.definir_loja_publica(boolean), public.loja_resetar(),
  public.loja_moedas_teste(int), public.loja_devolver(text) to authenticated;

/** Para o menu: se quem pergunta pode ver a loja (sem sortear nada). */
create or replace function public.loja_visivel() returns boolean
language sql stable security definer set search_path = public as $$ select _loja_visivel(_eu()) $$;
grant execute on function public.loja_visivel() to authenticated;


-- ---------------------------------------------------------------- coins: as missões diárias e o registo dos convites

-- O registo de coins volta a poder apontar para itens da loja, e a aceitar compras, devoluções e testes.
alter table public.coin_ledger add column if not exists item_id text references public.shop_items (id) on delete set null;
alter table public.coin_ledger drop constraint if exists coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check check (reason in ('compra', 'devolucao', 'teste', 'convite'));

create or replace function public._moedas_ganhas(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel int := ((_nivel(_xp(p_perfil)))->>'nivel')::int;
  v_diarias int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'daily');
  v_semanais int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'weekly');
  v_mvps int := (select count(*) from match_players mp join matches m on m.id = mp.match_id
                  where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic);
begin
  return jsonb_build_object(
    'nivel', v_nivel,
    'porNivel', 120 * greatest(0, v_nivel - 1),
    'porMarcos', 400 * (v_nivel / 5),
    'porDiarias', 15 * v_diarias,
    'porSemanais', 40 * v_semanais,
    'porMvp', 25 * v_mvps
  );
end $$;

create or replace function public._moedas(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select (g->>'porNivel')::int + (g->>'porMarcos')::int + (g->>'porDiarias')::int + (g->>'porSemanais')::int + (g->>'porMvp')::int
    + coalesce((select sum(delta) from coin_ledger where profile_id = p_perfil), 0)::int
  from (select _moedas_ganhas(p_perfil) as g) x
$$;

-- A mesma conta, com o que vieram dos convites à parte (só para mostrar).
create or replace function public._moedas_ganhas(p_perfil uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nivel int := ((_nivel(_xp(p_perfil)))->>'nivel')::int;
  v_diarias int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'daily');
  v_semanais int := (select count(*) from quest_completions c join quests q on q.id = c.quest_id where c.profile_id = p_perfil and q.scope = 'weekly');
  v_mvps int := (select count(*) from match_players mp join matches m on m.id = mp.match_id
                  where mp.profile_id = p_perfil and mp.mvp and m.state = 'COMPLETED' and not m.automatic);
begin
  return jsonb_build_object(
    'nivel', v_nivel,
    'porNivel', 120 * greatest(0, v_nivel - 1),
    'porMarcos', 400 * (v_nivel / 5),
    'porDiarias', 15 * v_diarias,
    'porSemanais', 40 * v_semanais,
    'porMvp', 25 * v_mvps,
    -- Já está dentro da soma do registo de coins (_moedas); isto é só para o mostrar à parte.
    'porConvites', coalesce((select sum(delta) from coin_ledger where profile_id = p_perfil and reason = 'convite'), 0)
  );
end $$;

revoke all on function public._moedas_ganhas(uuid), public._moedas(uuid) from public, anon, authenticated;
grant execute on function public._moedas_ganhas(uuid), public._moedas(uuid) to service_role;
