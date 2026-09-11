-- Erähinnoittelu näkyviin sovellukselle.
--
-- Kaksi asiaa jäi edellisestä migraatiosta sovelluksen ulottumattomiin:
--
--   1. varit_nakyma luettelee sarakkeensa nimeltä, joten hinta_erista ei
--      näkynyt. Ilman sitä käyttöliittymä laskee tullit ja rahdin uudelleen
--      keskihinnan päälle - juuri se kaksinkertainen laskenta jota vastaan
--      hinta_erista on olemassa.
--
--   2. Erän hinnat perustuvat varastotayennykset-taulun sarakkeisiin, joiden
--      SELECT on peruttu maalaajalta sarakekohtaisesti. Peruutus koskee myös
--      adminia suorassa rajapintakutsussa, joten erähistoria tarvitsee oman
--      näkymänsä - sama ratkaisu kuin tyojen_talous lukituille kustannuksille.

create or replace view public.varit_nakyma as
select
  id,
  nimi,
  valmistaja,
  alkupera,
  case when is_admin() then ostohinta_per_kg end as ostohinta_per_kg,
  case when is_admin() then tullimaksu_prosentti end as tullimaksu_prosentti,
  case when is_admin() then alv_prosentti end as alv_prosentti,
  case when is_admin() then toimituskulu_per_kg end as toimituskulu_per_kg,
  myyja_linkki,
  kuva_url,
  ohjeet,
  ohje_tiedosto_url,
  saldo_g,
  halytysraja_g,
  aktiivinen,
  created_at,
  updated_at,
  kiiltoaste,
  tyyppi,
  vaatii_pohjavarin,
  pohjavari_kuvaus,
  case when is_admin() then alkuperainen_hinta end as alkuperainen_hinta,
  case when is_admin() then alkuperainen_valuutta end as alkuperainen_valuutta,
  case when is_admin() then alkuperainen_yksikko end as alkuperainen_yksikko,
  varattu_g,
  varisavy,
  vaatii_lakkauksen,
  kiiltotaso,
  hakusanat,
  taysiraja_g,
  -- Ei hintatieto vaan tieto siitä, mitä hinta tarkoittaa: kun tosi,
  -- ostohinta_per_kg sisältää jo rahdin ja tullit.
  hinta_erista
from varit v
where auth.role() = any (array['authenticated'::text, 'service_role'::text]);


-- Erähistoria: milloin, paljonko, millä kilohinnalla ja mikä keskihinta siitä
-- seurasi. Vastaa kysymykseen "miksi tämän värin hinta nousi".
create or replace view public.varin_erahistoria with (security_invoker = false) as
select
  t.id,
  t.vari_id,
  t.era_id,
  t.maara_g,
  t.tavara_eur,
  t.hankintahinta_per_kg,
  t.saldo_ennen_g,
  t.keskihinta_ennen_per_kg,
  t.keskihinta_jalkeen_per_kg,
  t.luotu,
  e.toimittaja,
  e.paivays,
  e.tila,
  e.rahti_eur,
  e.tulli_eur,
  e.tuonti_alv_eur
from public.varastotayennykset t
join public.maalierat e on e.id = t.era_id
where public.is_admin();

comment on view public.varin_erahistoria is
  'Värin erätäydennykset hintoineen. Vain adminille - muille tyhjä.';

revoke all on public.varin_erahistoria from anon;
grant select on public.varin_erahistoria to authenticated;
grant select on public.varin_erahistoria to service_role;
