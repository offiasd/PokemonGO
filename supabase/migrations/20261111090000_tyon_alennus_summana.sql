-- Työlle voi antaa alennuksen myös euroina, ei vain prosentteina.
--
-- "Kymmenen prosenttia ja vielä kaksikymppiä alas" on tavallinen kauppa, eikä
-- sitä pidä joutua laskemaan prosenteiksi. Kentät ovat rinnakkaiset: prosentti
-- lasketaan aina välisummasta eikä euroalennuksella pienennetystä summasta,
-- jolloin kirjausjärjestys ei muuta loppusummaa.
--
-- Yhteensä alennus ei voi ylittää välisummaa: ylimenevä osa jää antamatta eikä
-- työstä tule negatiivista laskua. Sama raja on sovelluksen puolella
-- src/lib/alennus.ts-moduulissa, jota lomake ja listat käyttävät.
alter table public.tyot
  add column if not exists alennus_summa_eur numeric not null default 0
    check (alennus_summa_eur >= 0);

alter table public.arkistoidut_tyot
  add column if not exists alennus_summa_eur numeric not null default 0
    check (alennus_summa_eur >= 0);

comment on column public.tyot.alennus_summa_eur is
  'Kiinteä euroalennus. Tulee alennus_prosentin päälle, ei sen tilalle.';
comment on column public.arkistoidut_tyot.alennus_summa_eur is
  'Kiinteä euroalennus. Tulee alennus_prosentin päälle, ei sen tilalle.';

-- Näkymän alennus_eur on edelleen alennus yhteensä euroina - nyt siinä on
-- prosenttiosuuden lisäksi kiinteä summa. Uusi sarake alennus_summa_eur on
-- viimeisenä, koska create or replace view sallii vain lisäykset loppuun.
create or replace view public.tyojen_talous as
with tyot_kaikki as (
  select
    t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id,
    t.alennus_prosentti, t.alennus_summa_eur, false as arkistoitu
  from tyot t
  where t.tila = 'valmis'
  union all
  select
    a.id, a.asiakas, a.aloitettu, a.valmistunut, a.aloitti_id, a.valmistui_id,
    a.alennus_prosentti, a.alennus_summa_eur, true
  from arkistoidut_tyot a
), rivit_kaikki as (
  select
    r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur, r.vari_id, r.toinen_vari_id,
    coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g) as kulutus_g,
    coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0) as toinen_kulutus_g
  from tyon_rivit r
  union all
  select
    r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur, r.vari_id, r.toinen_vari_id,
    coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g),
    coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0)
  from arkistoidut_tyon_rivit r
), lisavarit_kaikki as (
  select l.rivi_id, l.vari_id, coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g) as kulutus_g
  from tyon_rivin_lisavarit l
  union all
  select l.rivi_id, l.vari_id, coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g)
  from arkistoidut_rivin_lisavarit l
), lisavarit_riveittain as (
  select
    rivi_id,
    sum(kulutus_g) as kulutus_g,
    sum(kulutus_g / 1000.0 * vari_kokonaishinta(vari_id)) as kustannus_eur
  from lisavarit_kaikki
  group by rivi_id
), lisatyot_kaikki as (
  select lt.tyon_rivi_id as rivi_id, lt.vari_id,
         coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0) as kulutus_g
  from tyon_rivin_lisatyot lt
  where lt.vari_id is not null
  union all
  select al.rivi_id, al.vari_id, coalesce(al.toteutunut_kulutus_g, al.kulutus_g, 0)
  from arkistoidut_rivin_lisatyot al
  where al.vari_id is not null
), lisatyot_riveittain as (
  select
    rivi_id,
    sum(kulutus_g) as kulutus_g,
    sum(kulutus_g / 1000.0 * vari_kokonaishinta(vari_id)) as kustannus_eur
  from lisatyot_kaikki
  group by rivi_id
), muut_tyot_kaikki as (
  select mt.tyo_id, mt.hinta_eur from tyon_muut_tyot mt
  union all
  select amt.tyo_id, amt.hinta_eur from arkistoidut_muut_tyot amt
), muut_tyoittain as (
  select tyo_id, sum(hinta_eur) as myynti_eur
  from muut_tyot_kaikki
  group by tyo_id
), rivin_summat as (
  select
    r.tyo_id,
    r.yksikkohinta_eur * r.kappalemaara::numeric as myynti_eur,
    r.kulutus_g + r.toinen_kulutus_g + coalesce(l.kulutus_g, 0) + coalesce(lt.kulutus_g, 0)
      as kulutus_g,
    r.kulutus_g / 1000.0 * vari_kokonaishinta(r.vari_id)
      + case
          when r.toinen_vari_id is null then 0
          else r.toinen_kulutus_g / 1000.0 * vari_kokonaishinta(r.toinen_vari_id)
        end
      + coalesce(l.kustannus_eur, 0) + coalesce(lt.kustannus_eur, 0) as maalikustannus_eur
  from rivit_kaikki r
  left join lisavarit_riveittain l on l.rivi_id = r.id
  left join lisatyot_riveittain lt on lt.rivi_id = r.id
), tyon_summat as (
  select
    t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id, t.arkistoitu,
    t.alennus_prosentti, t.alennus_summa_eur,
    coalesce(sum(s.myynti_eur), 0) + coalesce(m.myynti_eur, 0) as valisumma_eur,
    coalesce(sum(s.maalikustannus_eur), 0) as maalikustannus_raaka,
    coalesce(sum(s.kulutus_g), 0) as kulutus_g,
    count(s.tyo_id) as riveja
  from tyot_kaikki t
  left join rivin_summat s on s.tyo_id = t.id
  left join muut_tyoittain m on m.tyo_id = t.id
  group by t.id, t.asiakas, t.aloitettu, t.valmistunut, t.aloitti_id, t.valmistui_id,
           t.arkistoitu, t.alennus_prosentti, t.alennus_summa_eur, m.myynti_eur
), alennetut as (
  -- Alennus lasketaan kerran: prosenttiosuus välisummasta + kiinteä summa,
  -- enintään välisumman verran.
  select
    s.*,
    round(s.valisumma_eur, 2) as valisumma_pyoristetty,
    least(
      round(s.valisumma_eur * s.alennus_prosentti / 100.0, 2) + s.alennus_summa_eur,
      round(s.valisumma_eur, 2)
    ) as alennus_yhteensa_eur
  from tyon_summat s
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
  valisumma_pyoristetty as valisumma_eur,
  alennus_yhteensa_eur as alennus_eur,
  round(valisumma_pyoristetty - alennus_yhteensa_eur, 2) as loppusumma_eur,
  round(maalikustannus_raaka, 2) as maalikustannus_eur,
  round(valisumma_pyoristetty - alennus_yhteensa_eur - maalikustannus_raaka, 2) as kate_eur,
  kulutus_g,
  kulutus_g / 1000.0 as kulutus_kg,
  alennus_summa_eur
from alennetut
where is_admin();
