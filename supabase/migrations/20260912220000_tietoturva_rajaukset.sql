-- =====================================================================
-- Migraatio: tietoturvarajaukset
--
-- Perustuu Supabasen Security Advisorin havaintoihin. Lähtötilanne:
-- seitsemäätoista SECURITY DEFINER -funktiota saattoi kutsua anon-roolilla
-- REST-rajapinnan kautta. Anon-avain on julkinen - se on selaimen
-- lähdekoodissa - joten nuo funktiot olivat avoimia internetiin.
--
-- Neljältä puuttui sisäinen is_admin-tarkistus kokonaan. Vakavin oli
-- tallenna_poiminta, joka ottaa kuitin tunnisteen ja JSON-datan: ulkopuolinen
-- olisi voinut ylikirjoittaa minkä tahansa kuitin rivit.
--
-- Ennen perumista tarkistettiin mistä kutakin kutsutaan:
--   - sovellus (src/) ei kutsu yhtäkään neljästä
--   - lue-kuitti-funktio kutsuu tallenna_poiminta- ja
--     merkitse_poiminta_virheeksi-funktioita vain palvelinavaimella
--     (if (jonokutsu) -haara), ei käyttäjän tunnuksilla
--   - kuittijonon_ajo ja kokoa_edellisen_kuukauden_paketti ajetaan
--     pg_cronista postgres-käyttäjänä
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Neljä funktiota ilman sisäistä tarkistusta
--
-- Nämä on tarkoitettu Edge Functionin ja ajastuksen kutsuttaviksi
-- palvelinavaimella. service_role säilyttää oikeuden, joten ne toimivat
-- kuten ennen.
-- ---------------------------------------------------------------------

revoke execute on function public.tallenna_poiminta(uuid, jsonb) from anon, authenticated;
revoke execute on function public.merkitse_poiminta_virheeksi(uuid, text) from anon, authenticated;
revoke execute on function public.kuittijonon_ajo(integer) from anon, authenticated;
revoke execute on function public.kokoa_edellisen_kuukauden_paketti() from anon, authenticated;

-- Jonon avaimen asetus ei ole sovelluksen käytössä lainkaan.
revoke execute on function public.aseta_kuittijonon_avain(text, text) from anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Triggerifunktiot pois rajapinnasta
--
-- Näitä ei ole tarkoitettu kutsuttaviksi lainkaan - ne ovat rajapinnassa
-- vain siksi että ne ovat public-skeemassa. Triggerit toimivat silti:
-- Postgres ei tarkista EXECUTE-oikeutta triggerin lauetessa, vaan vasta
-- create trigger -hetkellä.
-- ---------------------------------------------------------------------

revoke execute on function public.paivita_kuitin_ensimmainen_liite() from public, anon, authenticated;
revoke execute on function public.rivin_lisavari_varaa_saldo() from public, anon, authenticated;
revoke execute on function public.aseta_tositenumero_norm() from public, anon, authenticated;
revoke execute on function public.esta_kuitin_poisto() from public, anon, authenticated;
revoke execute on function public.esta_lukitun_kauden_muutos() from public, anon, authenticated;
revoke execute on function public.esta_lukitun_kauden_rivimuutos() from public, anon, authenticated;
revoke execute on function public.kuitit_valuutta_trg() from public, anon, authenticated;
revoke execute on function public.kuitin_rivin_valuutta_trg() from public, anon, authenticated;
revoke execute on function public.varit_aseta_kiiltotaso() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Anon pois lopuiltakin
--
-- Näissä on sisäinen is_admin-tarkistus, mutta kaksi suojakerrosta on
-- parempi kuin yksi: sovellus kutsuu näitä kirjautuneena, joten anon ei
-- tarvitse niitä mihinkään.
--
-- is_admin, current_user_role ja kausi_lukittu jäävät tarkoituksella
-- koskematta, ja syy on konkreettinen eikä varovaisuutta: yhdeksän
-- storage.objects-politiikkaa kutsuu is_admin-funktiota roolilla public,
-- johon anon kuuluu. Jos anon menettää kutsuoikeuden, anonyymi pyyntö
-- kuittitiedostoihin kaatuu virheeseen sen sijaan että se torjuttaisiin
-- siististi - lopputulos on sama mutta virheilmoitus kertoo enemmän kuin
-- tyhjä vastaus.
--
-- Anonyymille nämä eivät paljasta mitään: is_admin palauttaa epätoden ja
-- current_user_role tyhjän, koska kirjautumatta ei ole profiilia.
-- ---------------------------------------------------------------------

revoke execute on function public.avaa_luovutus(date) from anon;
revoke execute on function public.kokoa_luovutus(date) from anon;
revoke execute on function public.laheta_luovutus(date, jsonb) from anon;
revoke execute on function public.luo_kuittiera(integer) from anon;
revoke execute on function public.luovutuksen_tarkistukset(date) from anon;
revoke execute on function public.poista_kuitti_pysyvasti(uuid) from anon;
revoke execute on function public.poista_kuittiera(uuid) from anon;

-- Puhtaat apufunktiot: eivät vuoda mitään, mutta eivät kuulu anonille.
revoke execute on function public.ral_koodi(text) from anon;
revoke execute on function public.ral_varisavy(text) from anon;
revoke execute on function public.kiiltotaso_paattele(text) from anon;
revoke execute on function public.normalisoi_tositenumero(text) from anon;
revoke execute on function public.normalisoi_toimittaja(text) from anon;
revoke execute on function public.etsi_toimittaja(text) from anon;
revoke execute on function public.kuitin_kaksoiskappaleet(uuid) from anon;
revoke execute on function public.paivita_kuitin_eurot(uuid) from anon;
revoke execute on function public.saa_jattaa_tyon(uuid) from anon;
revoke execute on function public.saa_kasitella_tyon(text, uuid) from anon;


-- ---------------------------------------------------------------------
-- 4. Anonin taulukohtaiset oikeudet pois
--
-- Tämä ei ollut Advisorin listalla mutta on suurin yksittäinen parannus.
-- Anon-roolilla oli Supabasen oletusten mukaisesti täydet
-- SELECT/INSERT/UPDATE/DELETE-oikeudet kaikkiin public-skeeman tauluihin,
-- myös kuitteihin, profiileihin ja asetuksiin.
--
-- Käytännössä RLS piti: anon näki nolla riviä eikä voinut kirjoittaa. Mutta
-- silloin RLS on ainoa este, ja yksi liian salliva politiikka avaisi kannan.
-- Kirjautuminen ei lue public-skeemaa lainkaan - se kulkee auth-skeeman
-- kautta - joten anon ei tarvitse tauluihin mitään.
--
-- Oletusoikeudet perutaan myös tulevilta tauluilta, jottei sama palaa
-- seuraavan migraation mukana.
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;


-- ---------------------------------------------------------------------
-- 5. Puuttuva search_path
--
-- Ilman asetusta funktio käyttää kutsujan search_path-arvoa, jolloin
-- hyökkääjä voi ohjata sen kutsumaan omaa versiotaan käytetystä
-- funktiosta. Muut funktiot kannassa käyttävät tätä jo.
-- ---------------------------------------------------------------------

alter function public.esta_lukitun_kauden_rivimuutos() set search_path to 'public';
alter function public.ral_koodi(text) set search_path to 'public';
alter function public.ral_varisavy(text) set search_path to 'public';
alter function public.kiiltotaso_paattele(text) set search_path to 'public';
alter function public.varit_aseta_kiiltotaso() set search_path to 'public';
alter function public.normalisoi_tositenumero(text) set search_path to 'public';
alter function public.normalisoi_toimittaja(text) set search_path to 'public';


-- ---------------------------------------------------------------------
-- 6. Hälytystaulut: politiikka puuttui
--
-- RLS oli päällä ilman yhtäkään politiikkaa. Tila oli turvallinen mutta
-- epäselvä. Taustatehtävä kirjoittaa näihin postgres-käyttäjänä ja ohittaa
-- RLS:n, joten politiikka ei muuta sen toimintaa.
--
-- Taulukohtaisia oikeuksia ei anneta authenticated-roolille: admin lukee
-- lokin halytys_ilmoitusten_loki-funktion kautta, jossa on is_admin-
-- tarkistus. Politiikka on siis toinen kerros siltä varalta että oikeudet
-- joskus annetaan, ei avain rajapintaan.
-- ---------------------------------------------------------------------

drop policy if exists "Admin lukee halytyslokia" on public.halytys_ilmoitus_loki;
create policy "Admin lukee halytyslokia" on public.halytys_ilmoitus_loki
  for select using (public.is_admin());

drop policy if exists "Admin lukee halytystilaa" on public.halytys_ilmoitus_tila;
create policy "Admin lukee halytystilaa" on public.halytys_ilmoitus_tila
  for select using (public.is_admin());


-- ---------------------------------------------------------------------
-- 7. pg_trgm jätetään public-skeemaan
--
-- Advisor suosittaa siirtoa omaan skeemaansa. Sitä ei tehdä, ja syy on
-- kirjattu tähän jottei sitä tarvitse päätellä uudelleen:
--
-- Jokainen tämän kannan SECURITY DEFINER -funktio on kiinnitetty
-- search_path = public, mikä on nimenomaan edellisen kohdan vaatimus. Jos
-- pg_trgm siirtyy skeemaan extensions, similarity() lakkaa löytymästä
-- niiden sisältä - haku, kuittirivien täsmäytys väreihin ja toimittajahaku
-- hajoaisivat, eikä mikään kertoisi siitä käännösaikana.
--
-- Korjaus vaatisi neljän gin_trgm_ops-indeksin uudelleenluonnin ja
-- search_pathin muuttamisen jokaisessa laajennusta käyttävässä funktiossa.
-- Riski on käytännöllinen, hyöty teoreettinen: laajennuksen funktiot ovat
-- puhtaita eivätkä koske dataan.
-- ---------------------------------------------------------------------
