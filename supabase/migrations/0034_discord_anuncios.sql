-- Avisos no Discord: um canal onde o bot publica as mensagens que a staff escreve em Staff › Discord.
--
-- O canal é criado pelo bot na primeira vez que se publica (ou ao carregar em "Criar o canal"),
-- visível para o cargo Member e só de leitura. O ID fica aqui para as mensagens seguintes irem
-- para o mesmo canal. Se apagares o canal no Discord, o site cria outro sozinho.
--
-- Corre depois de 0001 a 0033. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists discord_anuncios_canal text;
