-- Maalaaja saa perua keskeneräisen työn.
--
-- Työn aloitus, muokkaus ja valmiiksi merkintä ovat jo kaikkien kirjautuneiden
-- käytettävissä, joten peruminenkin kuuluu samaan joukkoon: virheellisen työn
-- huomaa yleensä se joka sen kirjasi. Valmis työ on eri asia - sen maali on jo
-- kulutettu varastosta - joten ehto rajaa poiston keskeneräisiin.
--
-- Admin-käytäntö jää voimaan rinnalle. Postgres yhdistää saman komennon
-- käytännöt OR:lla, joten admin voi edelleen poistaa myös valmiin työn.

create policy "Kirjautuneet poistavat keskeneräisiä töitä" on tyot
  for delete using (auth.role() = 'authenticated' and tila <> 'valmis');

-- tyon_rivit-taulun poistokäytäntö jää ennalleen (vain admin): työn rivit
-- poistuvat kaskadina tyot-taulun kautta, eikä viite-eheyden kaskadi kulje
-- rivitason tietoturvakäytäntöjen läpi.
