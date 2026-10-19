-- Fora a loja e todos os cosméticos.
--
-- Apaga a loja de Rangify Coins por inteiro: os itens, o inventário, o que cada jogador tinha equipado, a rotação
-- diária, as funções (loja, comprar_item, equipar_item, cosmeticos...) e as colunas profiles.avatar_gif e
-- config.shop_public. O site deixou de usar tudo isto: a página Loja, as bordas, os efeitos, os banners, os títulos,
-- as animações de MVP e a foto em GIF já não existem.
--
-- ATENÇÃO: apagar as tabelas apaga também o que as pessoas compraram e equiparam. Não há volta atrás (a não ser com
-- uma cópia de segurança do projeto).
--
-- O que fica: o registo de coins dos convites (coin_ledger, só com os movimentos "convite"), porque a divulgação
-- (Staff › Divulgação) continua a pagar coins a quem convida. Sem loja, essas coins só ficam guardadas.
--
-- Corre depois de 0001 a 0034. Pode correr outra vez sem estragar nada.

-- ---------------------------------------------------------------- funções

drop function if exists public.loja();
drop function if exists public.loja_visivel();
drop function if exists public.comprar_item(text);
drop function if exists public.equipar_item(text);
drop function if exists public.desequipar_item(text);
drop function if exists public.definir_avatar_gif(text);
drop function if exists public.cosmeticos(uuid[]);
drop function if exists public.definir_loja_publica(boolean);
drop function if exists public.loja_resetar();
drop function if exists public.loja_moedas_teste(int);
drop function if exists public.loja_devolver(text);
drop function if exists public._loja_hoje(boolean);
drop function if exists public._loja_visivel(public.profiles);
drop function if exists public._loja_staff(public.profiles);
drop function if exists public._loja_disponivel(text);
drop function if exists public._dar_conquistas(uuid);
drop function if exists public._sortear_item(text[], text[], text[]);
drop function if exists public._dia_loja();
drop function if exists public._moedas(uuid);
drop function if exists public._moedas_ganhas(uuid);

-- ---------------------------------------------------------------- tabelas

drop table if exists public.shop_rotation;
drop table if exists public.shop_equipped;
drop table if exists public.shop_inventory;

-- O registo de coins deixa de apontar para itens da loja; os movimentos de compra, devolução e teste desaparecem com ela.
do $$
begin
  if to_regclass('public.coin_ledger') is not null then
    delete from public.coin_ledger where reason <> 'convite';
    alter table public.coin_ledger drop column if exists item_id;
    alter table public.coin_ledger drop constraint if exists coin_ledger_reason_check;
    alter table public.coin_ledger add constraint coin_ledger_reason_check check (reason = 'convite');
  end if;
end $$;

drop table if exists public.shop_items;

-- ---------------------------------------------------------------- colunas

alter table public.profiles drop column if exists avatar_gif;
alter table public.config drop column if exists shop_public;
