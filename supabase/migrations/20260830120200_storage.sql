-- Tallennustilat (Storage) väri- ja osakuville sekä ohjetiedostoille.
-- Julkisesti luettavissa (linkit näkyvät sovelluksessa kaikille kirjautuneille),
-- mutta vain admin saa ladata/poistaa tiedostoja.

insert into storage.buckets (id, name, public)
values
  ('vari-kuvat', 'vari-kuvat', true),
  ('vari-ohjeet', 'vari-ohjeet', true),
  ('osa-kuvat', 'osa-kuvat', true)
on conflict (id) do nothing;

create policy "Julkinen luku vari-kuvat"
  on storage.objects for select
  using (bucket_id = 'vari-kuvat');

create policy "Admin lataa vari-kuvat"
  on storage.objects for insert
  with check (bucket_id = 'vari-kuvat' and public.is_admin());

create policy "Admin poistaa vari-kuvat"
  on storage.objects for delete
  using (bucket_id = 'vari-kuvat' and public.is_admin());

create policy "Julkinen luku vari-ohjeet"
  on storage.objects for select
  using (bucket_id = 'vari-ohjeet');

create policy "Admin lataa vari-ohjeet"
  on storage.objects for insert
  with check (bucket_id = 'vari-ohjeet' and public.is_admin());

create policy "Admin poistaa vari-ohjeet"
  on storage.objects for delete
  using (bucket_id = 'vari-ohjeet' and public.is_admin());

create policy "Julkinen luku osa-kuvat"
  on storage.objects for select
  using (bucket_id = 'osa-kuvat');

create policy "Admin lataa osa-kuvat"
  on storage.objects for insert
  with check (bucket_id = 'osa-kuvat' and public.is_admin());

create policy "Admin poistaa osa-kuvat"
  on storage.objects for delete
  using (bucket_id = 'osa-kuvat' and public.is_admin());
