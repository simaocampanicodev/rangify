-- Os pontos deixam de depender do rank oficial: só se avalia o que se joga.
--
--   pontos da partida = vitória +20 / derrota -20  +  desempenho (Rangify Score, de -6 a +6)
--
-- Antes, o rank oficial do jogador era comparado com a média da equipa adversária
-- (3 pontos por divisão, entre -8 e +10). Isso sai. O rank continua a existir no perfil e
-- na "média da equipa", mas já não conta para a pontuação.
--
-- _pontos mantém os mesmos parâmetros (o rank do jogador e dos adversários) para as
-- funções que a chamam (_fechar e _recalcular) não precisarem de mudar; agora ignora-os.
--
-- A missão "Contra os favoritos" (ganhar a equipas com rank acima do teu) também sai:
-- fica desativada, mas quem já a tinha completado mantém o XP.
--
-- Os pontos das partidas que já foram jogadas só mudam quando as recarregares na Staff
-- (Staff › API › Recarregar os dados de uma partida): cada jogador recebe só a diferença.
--
-- Corre depois de 0001 a 0018. Pode correr outra vez sem estragar nada.

create or replace function public._pontos(p_tier int, p_adversarios int[], p_venceu boolean) returns int
language sql immutable as $$
  select case when p_venceu then 20 else -20 end
$$;

update public.quests set active = false where id = 'm-acima';
-- Sai também da rotação semanal em curso (o progresso que já houver fica guardado).
update public.quest_rotations set quest_ids = array_remove(quest_ids, 'm-acima') where 'm-acima' = any (quest_ids);
