-- =============================================================================
-- Rangify: fotos de perfil.
--
-- As fotos ficam no Storage, no bucket público "avatars", cada utilizador na
-- sua pasta (avatars/<id da conta>/). O bucket só aceita PNG, JPG e WebP até
-- 1 MB, por isso GIFs e vídeos são recusados pelo próprio Supabase; o site
-- ainda recorta a imagem para 256x256 antes de a enviar.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatares: enviar para a própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatares: ver a própria pasta" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatares: apagar da própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Guarda o endereço da foto. Só aceita ficheiros da pasta do próprio utilizador;
-- null volta à foto do Discord.
create function public.definir_avatar(p_url text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _eu();
  if p_url is not null and p_url !~ (
    '^https?://[^/?#]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/[A-Za-z0-9._-]+\.(webp|png|jpe?g)$'
  ) then
    raise exception 'Imagem inválida. Só são permitidas imagens PNG, JPG ou WebP.';
  end if;
  update profiles set avatar_url = coalesce(
    p_url,
    (select u.raw_user_meta_data ->> 'avatar_url' from auth.users u where u.id = auth.uid())
  )
  where id = me.id returning * into me;
  return _perfil_json(me);
end $$;
