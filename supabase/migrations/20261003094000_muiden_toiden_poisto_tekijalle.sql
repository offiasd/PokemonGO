-- =====================================================================
-- Migraatio: kesken olevan työn tekijä poistaa muita töitä
--
-- Tallennus korvaa työn muut työt kokonaan: vanhat pois, uudet tilalle.
-- Siksi tekijän on päästävä poistamaan omansa, ei vain adminin. Käytäntö
-- tulee admin-käytännön rinnalle, eivätkä käytännöt sulje toisiaan pois.
-- =====================================================================

create policy "Tekijä poistaa muita töitä" on public.tyon_muut_tyot
  for delete using (
    exists (
      select 1 from public.tyot t
      where t.id = tyo_id and public.saa_kasitella_tyon(t.tila, t.aloitti_id)
    )
  );


