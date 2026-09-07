-- Taloustietojen rajaus työntekijältä.
--
-- Ostohinnat, tuntiveloitukset ja työkohtaiset katteet olivat kaikkien
-- kirjautuneiden luettavissa. Käyttöliittymä piilotti ne osin, mutta
-- rajapintaa voi kutsua suoraan, joten rajaus tehdään kantaan.
--
-- Supabasessa sekä admin että maalaaja ovat samaa tietokantaroolia
-- (authenticated), joten pelkkä sarakekohtainen GRANT sulkisi ostohinnat myös
-- adminilta. Siksi jako on kaksiosainen:
--
--   1. varit-taulun hintasarakkeet perutaan authenticated-roolilta kokonaan.
--      Suora kutsu /rest/v1/varit?select=ostohinta_per_kg epäonnistuu.
--   2. Sovellus lukee värit näkymästä varit_nakyma, joka palauttaa
--      hintasarakkeet vain adminille ja muille NULLina.
--
-- Rivien näkyvyys ei muutu: väririvit ovat edelleen kaikkien kirjautuneiden
-- luettavissa, koska maalaaja tarvitsee ne työn tekemiseen.

-- ---------------------------------------------------------------------------
-- 1. varit: hintasarakkeet pois authenticated-roolilta
-- ---------------------------------------------------------------------------

revoke select on public.varit from authenticated;

-- Sallitut sarakkeet luetellaan nimeltä: uusi sarake ei näy maalaajalle
-- ennen kuin se lisätään tähän, mikä on oikea oletus hintatiedolle.
grant select (
  id,
  nimi,
  valmistaja,
  alkupera,
  myyja_linkki,
  kuva_url,
  ohjeet,
  ohje_tiedosto_url,
  saldo_g,
  varattu_g,
  halytysraja_g,
  taysiraja_g,
  aktiivinen,
  created_at,
  updated_at,
  kiiltoaste,
  kiiltotaso,
  tyyppi,
  varisavy,
  hakusanat,
  vaatii_pohjavarin,
  pohjavari_kuvaus,
  vaatii_lakkauksen
) on public.varit to authenticated;

-- ---------------------------------------------------------------------------
-- 2. varit_nakyma: sovelluksen lukulähde
-- ---------------------------------------------------------------------------

-- security_invoker jätetään pois tarkoituksella: näkymä ajetaan omistajan
-- oikeuksin, jotta se pääsee hintasarakkeisiin. Suojaus on is_admin()-ehdossa
-- sarakkeissa, ei RLS:ssä. Rivit vastaavat varit-taulun nykyistä politiikkaa
-- (kaikki kirjautuneet lukevat kaikki rivit); jos rivinäkyvyyttä joskus
-- rajataan, ehto on toistettava tässä.
create view public.varit_nakyma with (security_invoker = false) as
select
  v.id,
  v.nimi,
  v.valmistaja,
  v.alkupera,
  case when public.is_admin() then v.ostohinta_per_kg end as ostohinta_per_kg,
  case when public.is_admin() then v.tullimaksu_prosentti end as tullimaksu_prosentti,
  case when public.is_admin() then v.alv_prosentti end as alv_prosentti,
  case when public.is_admin() then v.toimituskulu_per_kg end as toimituskulu_per_kg,
  v.myyja_linkki,
  v.kuva_url,
  v.ohjeet,
  v.ohje_tiedosto_url,
  v.saldo_g,
  v.halytysraja_g,
  v.aktiivinen,
  v.created_at,
  v.updated_at,
  v.kiiltoaste,
  v.tyyppi,
  v.vaatii_pohjavarin,
  v.pohjavari_kuvaus,
  case when public.is_admin() then v.alkuperainen_hinta end as alkuperainen_hinta,
  case when public.is_admin() then v.alkuperainen_valuutta end as alkuperainen_valuutta,
  case when public.is_admin() then v.alkuperainen_yksikko end as alkuperainen_yksikko,
  v.varattu_g,
  v.varisavy,
  v.vaatii_lakkauksen,
  v.kiiltotaso,
  v.hakusanat,
  v.taysiraja_g
from public.varit v
-- Näkymä ajetaan omistajan oikeuksin, joten varit-taulun RLS ei rajaa sitä.
-- Kirjautumisvaatimus on siksi kirjoitettava tähän.
where auth.role() in ('authenticated', 'service_role');

comment on view public.varit_nakyma is
  'Värit sovellukselle: hintasarakkeet vain adminille, muille NULL.';

revoke all on public.varit_nakyma from anon;
grant select on public.varit_nakyma to authenticated;
grant select on public.varit_nakyma to service_role;

-- ---------------------------------------------------------------------------
-- 3. varit_halytykset ilman hintasarakkeita
-- ---------------------------------------------------------------------------

-- Hälytyslista on maalaajan työkalu, ja se luetaan kutsujan oikeuksin. Ilman
-- hintasarakkeiden poistoa koko näkymä kaatuisi maalaajalla oikeusvirheeseen.
drop view if exists public.varit_halytykset;

create view public.varit_halytykset with (security_invoker = true) as
select
  v.id,
  v.nimi,
  v.valmistaja,
  v.alkupera,
  v.myyja_linkki,
  v.kuva_url,
  v.ohjeet,
  v.ohje_tiedosto_url,
  v.saldo_g,
  v.varattu_g,
  v.halytysraja_g,
  v.taysiraja_g,
  v.aktiivinen,
  v.kiiltoaste,
  v.kiiltotaso,
  v.tyyppi,
  v.varisavy,
  v.vaatii_pohjavarin,
  v.pohjavari_kuvaus,
  v.vaatii_lakkauksen,
  v.hakusanat,
  v.created_at,
  v.updated_at,
  public.vari_halytysraja(v.id) as efektiivinen_halytysraja_g
from public.varit v
where v.aktiivinen
  and (v.saldo_g - v.varattu_g) <= public.vari_halytysraja(v.id);

revoke all on public.varit_halytykset from anon;
grant select on public.varit_halytykset to authenticated;
grant select on public.varit_halytykset to service_role;

-- ---------------------------------------------------------------------------
-- 4. tuntiveloitukset: vain admin
-- ---------------------------------------------------------------------------

drop policy if exists "Kirjautuneet lukevat tuntiveloitukset" on public.tuntiveloitukset;

-- ---------------------------------------------------------------------------
-- 5. tyojen_talous: vain admin
-- ---------------------------------------------------------------------------

-- Näkymä oli security_invoker, mutta taustataulu tyot sallii luvun kaikille
-- kirjautuneille - joten kate ja maalikustannus vuotivat. Nyt näkymä ajetaan
-- omistajan oikeuksin ja rajaus tehdään is_admin()-ehdolla: maalaajalle se
-- palauttaa nolla riviä.
drop view if exists public.tyojen_talous;

create view public.tyojen_talous with (security_invoker = false) as
with tyot_kaikki as (
  select t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id,
         t.alennus_prosentti, false as arkistoitu
  from public.tyot t
  where t.tila = 'valmis'
  union all
  select a.id, a.asiakas, a.aloitettu, a.valmistunut, a.aloitti_id, a.valmistui_id,
         a.alennus_prosentti, true
  from public.arkistoidut_tyot a
), rivit_kaikki as (
  select r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur, r.vari_id, r.toinen_vari_id,
         coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g) as kulutus_g,
         coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0) as toinen_kulutus_g
  from public.tyon_rivit r
  union all
  select r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur, r.vari_id, r.toinen_vari_id,
         coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g),
         coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0)
  from public.arkistoidut_tyon_rivit r
), lisavarit_kaikki as (
  select l.rivi_id, l.vari_id, coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g) as kulutus_g
  from public.tyon_rivin_lisavarit l
  union all
  select l.rivi_id, l.vari_id, coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)
  from public.arkistoidut_rivin_lisavarit l
), lisavarit_riveittain as (
  select rivi_id,
         sum(kulutus_g) as kulutus_g,
         sum(kulutus_g / 1000.0 * public.vari_kokonaishinta(vari_id)) as kustannus_eur
  from lisavarit_kaikki
  group by rivi_id
), rivin_summat as (
  select r.tyo_id,
         r.yksikkohinta_eur * r.kappalemaara as myynti_eur,
         r.kulutus_g + r.toinen_kulutus_g + coalesce(l.kulutus_g, 0) as kulutus_g,
         r.kulutus_g / 1000.0 * public.vari_kokonaishinta(r.vari_id)
           + case when r.toinen_vari_id is null then 0
                  else r.toinen_kulutus_g / 1000.0 * public.vari_kokonaishinta(r.toinen_vari_id)
             end
           + coalesce(l.kustannus_eur, 0) as maalikustannus_eur
  from rivit_kaikki r
  left join lisavarit_riveittain l on l.rivi_id = r.id
), tyon_summat as (
  select t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id,
         t.arkistoitu, t.alennus_prosentti,
         coalesce(sum(s.myynti_eur), 0) as valisumma_eur,
         coalesce(sum(s.maalikustannus_eur), 0) as maalikustannus_raaka,
         coalesce(sum(s.kulutus_g), 0) as kulutus_g,
         count(s.tyo_id) as riveja
  from tyot_kaikki t
  left join rivin_summat s on s.tyo_id = t.id
  group by t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id,
           t.arkistoitu, t.alennus_prosentti
)
select
  id as tyo_id,
  asiakas,
  aloitettu,
  valmistunut,
  coalesce(valmistunut, aloitettu) as ajankohta,
  date_trunc('month', coalesce(valmistunut, aloitettu)) as kuukausi,
  date_trunc('year', coalesce(valmistunut, aloitettu)) as vuosi,
  aloitti_id,
  valmistui_id,
  arkistoitu,
  riveja,
  alennus_prosentti,
  round(valisumma_eur, 2) as valisumma_eur,
  round(valisumma_eur * alennus_prosentti / 100.0, 2) as alennus_eur,
  round(valisumma_eur - round(valisumma_eur * alennus_prosentti / 100.0, 2), 2) as loppusumma_eur,
  round(maalikustannus_raaka, 2) as maalikustannus_eur,
  round(valisumma_eur - round(valisumma_eur * alennus_prosentti / 100.0, 2) - maalikustannus_raaka, 2) as kate_eur,
  kulutus_g,
  kulutus_g / 1000.0 as kulutus_kg
from tyon_summat s
where public.is_admin();

revoke all on public.tyojen_talous from anon;
grant select on public.tyojen_talous to authenticated;
grant select on public.tyojen_talous to service_role;

comment on view public.tyojen_talous is
  'Töiden myynti, maalikustannus ja kate. Vain adminille - muille tyhjä.';

-- ---------------------------------------------------------------------------
-- 6. maalinkulutus_raportoituna: kulutus kaikille, kustannus vain adminille
-- ---------------------------------------------------------------------------

-- Maalaaja saa nähdä paljonko maalia on kulunut; kustannus on hintatietoa.
-- Rivit siis säilyvät, mutta maalikustannus_eur on NULL muille kuin adminille.
drop view if exists public.maalinkulutus_raportoituna;

create view public.maalinkulutus_raportoituna with (security_invoker = false) as
with kaytto as (
  select tr.id::text || ':paavari' as id,
         coalesce(t.valmistunut, t.aloitettu) as luotu,
         tr.osa_id, tr.oma_kuvaus, tr.vari_id, tr.kappalemaara,
         coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g) as kulutus_g,
         'paavari' as rooli,
         t.valmistui_id as kayttaja_id
  from public.tyon_rivit tr
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select tr.id::text || ':toinen',
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, tr.toinen_vari_id, tr.kappalemaara,
         coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
         coalesce(tr.toinen_vari_rooli, 'toinen'),
         t.valmistui_id
  from public.tyon_rivit tr
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null
  union all
  select l.id::text || ':lisavari',
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, l.vari_id, tr.kappalemaara,
         coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
         'lisavari',
         t.valmistui_id
  from public.tyon_rivin_lisavarit l
  join public.tyon_rivit tr on tr.id = l.rivi_id
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select ar.id::text || ':paavari',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.vari_id, ar.kappalemaara,
         coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
         'paavari',
         at.valmistui_id
  from public.arkistoidut_tyon_rivit ar
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
  union all
  select ar.id::text || ':toinen',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.toinen_vari_id, ar.kappalemaara,
         coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
         coalesce(ar.toinen_vari_rooli, 'toinen'),
         at.valmistui_id
  from public.arkistoidut_tyon_rivit ar
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null
  union all
  select al.id::text || ':lisavari',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, al.vari_id, ar.kappalemaara,
         coalesce(al.toteutunut_kulutus_g, al.arvioitu_kulutus_g),
         'lisavari',
         at.valmistui_id
  from public.arkistoidut_rivin_lisavarit al
  join public.arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
  union all
  select m.id::text || ':paavari',
         m.luotu, m.osa_id, null::text, m.vari_id, m.kappalemaara,
         m.toteutunut_kulutus_g, 'paavari', m.kayttaja_id
  from public.maalaustapahtumat m
  union all
  select m.id::text || ':toinen',
         m.luotu, m.osa_id, null::text, m.toinen_vari_id, m.kappalemaara,
         coalesce(m.toinen_toteutunut_kulutus_g, 0),
         coalesce(m.toinen_vari_rooli, 'toinen'), m.kayttaja_id
  from public.maalaustapahtumat m
  where m.toinen_vari_id is not null
)
select
  k.id,
  k.luotu,
  date_trunc('day', k.luotu) as paiva,
  date_trunc('week', k.luotu) as viikko,
  date_trunc('month', k.luotu) as kuukausi,
  date_trunc('year', k.luotu) as vuosi,
  k.osa_id,
  coalesce(o.nimi, k.oma_kuvaus) as osa_nimi,
  k.vari_id,
  v.nimi as vari_nimi,
  k.rooli,
  k.kappalemaara,
  k.kulutus_g as toteutunut_kulutus_g,
  k.kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  case when public.is_admin()
       then round(k.kulutus_g / 1000.0 * public.vari_kokonaishinta(k.vari_id), 2)
  end as maalikustannus_eur,
  k.kayttaja_id
from kaytto k
left join public.osat o on o.id = k.osa_id
join public.varit v on v.id = k.vari_id
-- Kuten varit_nakyma: omistajan oikeuksin ajettu näkymä ei peri RLS:ää.
where auth.role() in ('authenticated', 'service_role');

revoke all on public.maalinkulutus_raportoituna from anon;
grant select on public.maalinkulutus_raportoituna to authenticated;
grant select on public.maalinkulutus_raportoituna to service_role;

comment on view public.maalinkulutus_raportoituna is
  'Maalinkulutus raporteille. Kustannussarake vain adminille.';

-- ---------------------------------------------------------------------------
-- 7. Hintaa laskevat funktiot pois authenticated-roolilta
-- ---------------------------------------------------------------------------

-- Funktiot ovat security invoker, joten ne kaatuisivat maalaajalla joka
-- tapauksessa oikeusvirheeseen. EXECUTE perutaan silti: virhe on selvempi ja
-- suoja ei jää kiinni siitä miten funktio on kirjoitettu. Näkymät kutsuvat
-- näitä omistajan oikeuksin, joten raportit toimivat edelleen.
revoke execute on function public.vari_kokonaishinta(uuid) from authenticated;
revoke execute on function public.vari_kokonaishinta_per_kg(text, numeric, numeric, numeric, numeric) from authenticated;
revoke execute on function public.osa_maalikustannus(uuid, uuid) from authenticated;
revoke execute on function public.osa_kustannusarvio(uuid, uuid) from authenticated;
revoke execute on function public.osa_suositushinta(uuid, uuid) from authenticated;
revoke execute on function public.osan_kate(uuid, uuid, uuid) from authenticated;
revoke execute on function public.osa_tyokustannus(uuid) from authenticated;
