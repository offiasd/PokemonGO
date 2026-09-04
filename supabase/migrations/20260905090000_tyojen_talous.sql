-- Työkohtainen talousnäkymä etusivun ja raporttien yhteenvetoihin.
--
-- Työn hinta asiakkaalle syntyy riveiltä (yksikköhinta x kappalemäärä) ja työn
-- omasta alennusprosentista, maalikustannus taas jokaisesta käytetystä väristä:
-- pääväri, mahdollinen pohjaväri tai lakka ja custom-työn lisävärit. Sama
-- laskenta oli tähän asti vain työsivun TypeScriptissä, joten yhteenvetoja ei
-- saanut ilman että koko työkanta rivit mukaan lukien haetaan selaimeen.
--
-- Näkymä lukee myös arkiston, joten arkistoitu työ pysyy laskutuksessa mukana
-- samalla tavalla kuin kulutusraportissa.

create or replace view public.tyojen_talous as
with tyot_kaikki as (
  select
    id, asiakas, aloitettu, valmistunut, aloitti_id, valmistui_id,
    alennus_prosentti, false as arkistoitu
  from tyot
  where tila = 'valmis'

  union all

  select
    id, asiakas, aloitettu, valmistunut, aloitti_id, valmistui_id,
    alennus_prosentti, true
  from arkistoidut_tyot
),
rivit_kaikki as (
  select
    id, tyo_id, kappalemaara, yksikkohinta_eur, vari_id, toinen_vari_id,
    coalesce(toteutunut_kulutus_g, arvioitu_kulutus_g) as kulutus_g,
    coalesce(toinen_toteutunut_kulutus_g, toinen_arvioitu_kulutus_g, 0) as toinen_kulutus_g
  from tyon_rivit

  union all

  select
    id, tyo_id, kappalemaara, yksikkohinta_eur, vari_id, toinen_vari_id,
    coalesce(toteutunut_kulutus_g, arvioitu_kulutus_g),
    coalesce(toinen_toteutunut_kulutus_g, toinen_arvioitu_kulutus_g, 0)
  from arkistoidut_tyon_rivit
),
lisavarit_kaikki as (
  select rivi_id, vari_id, coalesce(toteutunut_kulutus_g, arvioitu_kulutus_g) as kulutus_g
  from tyon_rivin_lisavarit

  union all

  select rivi_id, vari_id, coalesce(toteutunut_kulutus_g, arvioitu_kulutus_g)
  from arkistoidut_rivin_lisavarit
),
lisavarit_riveittain as (
  select
    rivi_id,
    sum(kulutus_g) as kulutus_g,
    sum(kulutus_g / 1000.0 * vari_kokonaishinta(vari_id)) as kustannus_eur
  from lisavarit_kaikki
  group by rivi_id
),
rivin_summat as (
  select
    r.tyo_id,
    r.yksikkohinta_eur * r.kappalemaara as myynti_eur,
    r.kulutus_g + r.toinen_kulutus_g + coalesce(l.kulutus_g, 0) as kulutus_g,
    r.kulutus_g / 1000.0 * vari_kokonaishinta(r.vari_id)
      + case
          when r.toinen_vari_id is null then 0
          else r.toinen_kulutus_g / 1000.0 * vari_kokonaishinta(r.toinen_vari_id)
        end
      + coalesce(l.kustannus_eur, 0) as maalikustannus_eur
  from rivit_kaikki r
  left join lisavarit_riveittain l on l.rivi_id = r.id
),
tyon_summat as (
  select
    t.id,
    t.asiakas,
    t.aloitettu,
    t.valmistunut,
    t.aloitti_id,
    t.valmistui_id,
    t.arkistoitu,
    t.alennus_prosentti,
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
  s.id as tyo_id,
  s.asiakas,
  s.aloitettu,
  s.valmistunut,
  coalesce(s.valmistunut, s.aloitettu) as ajankohta,
  date_trunc('month', coalesce(s.valmistunut, s.aloitettu)) as kuukausi,
  date_trunc('year', coalesce(s.valmistunut, s.aloitettu)) as vuosi,
  s.aloitti_id,
  s.valmistui_id,
  s.arkistoitu,
  s.riveja,
  s.alennus_prosentti,
  round(s.valisumma_eur, 2) as valisumma_eur,
  -- Alennus pyöristetään ennen vähennystä, jotta summa täsmää työsivun kanssa.
  round(s.valisumma_eur * s.alennus_prosentti / 100.0, 2) as alennus_eur,
  round(s.valisumma_eur - round(s.valisumma_eur * s.alennus_prosentti / 100.0, 2), 2)
    as loppusumma_eur,
  round(s.maalikustannus_raaka, 2) as maalikustannus_eur,
  round(
    s.valisumma_eur - round(s.valisumma_eur * s.alennus_prosentti / 100.0, 2)
      - s.maalikustannus_raaka,
    2
  ) as kate_eur,
  s.kulutus_g,
  s.kulutus_g / 1000.0 as kulutus_kg
from tyon_summat s;

alter view public.tyojen_talous set (security_invoker = true);
grant select on public.tyojen_talous to authenticated;
