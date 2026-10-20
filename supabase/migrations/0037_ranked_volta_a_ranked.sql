-- Quem aceita uma partida ranked que cai volta à fila ranked (e não à aberta).
--
-- Quando alguém não aceitava a partida, os outros voltavam à fila "com o mesmo lugar", mas entravam sempre na fila
-- aberta (a coluna queue_entries.fila tem 'aberta' por omissão) e o emparelhamento também só olhava para a aberta.
-- Agora voltam à fila da partida (aberta ou ranked) e é nessa fila que se tenta formar outra partida.
--
-- Corre depois de 0001 a 0036. Pode correr outra vez sem estragar nada.

create or replace function public._falhou_confirmacao(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  update profiles set cooldown_until = now() + interval '5 minutes'
  where not is_bot and id in (select profile_id from match_players where match_id = p_match and not accepted);
  -- Quem aceitou volta à fila da partida (aberta ou ranked) com o lugar que tinha (as simulações não voltam).
  if not m.simulated then
    insert into queue_entries (profile_id, region, joined_at, fila)
    select mp.profile_id, m.region, coalesce(mp.queued_since, now()), m.fila
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.accepted and not p.is_bot
    on conflict do nothing;
  end if;
  update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
  if not m.simulated then perform _emparelhar(m.region, m.fila); end if;
end $$;
