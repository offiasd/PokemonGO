-- =====================================================================
-- Migraatio: lisätyörivin toteutunut kulutus raportteihin
--
-- Lisätyörivi sai toteutunut_kulutus_g-sarakkeen, koska pohjaväri ja
-- lakka eivät ole enää työrivin toinen_vari-kentissä vaan omia
-- lisätyörivejään. Saldotrigger lukee jo uuden sarakkeen, joten
-- raporttinäkymien on luettava se samalla säännöllä - muuten maalaajan
-- korjaama menekki näkyisi varastossa mutta ei kulutusraportissa.
--
-- Näkymät luodaan uudelleen samoina kuin migraatiossa
-- 20260915110000_lisatyot_raportteihin.sql. Ainoa muutos on coalesce:
-- toteutunut ensin, arvio sen jälkeen.
-- =====================================================================


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
), lisatyot_kaikki as (
  select lt.tyon_rivi_id as rivi_id, lt.vari_id,
         coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0) as kulutus_g
  from public.tyon_rivin_lisatyot lt
  where lt.vari_id is not null
  union all
  select al.rivi_id, al.vari_id, coalesce(al.toteutunut_kulutus_g, al.kulutus_g, 0)
  from public.arkistoidut_rivin_lisatyot al
  where al.vari_id is not null
), lisatyot_riveittain as (
  select rivi_id,
         sum(kulutus_g) as kulutus_g,
         sum(kulutus_g / 1000.0 * public.vari_kokonaishinta(vari_id)) as kustannus_eur
  from lisatyot_kaikki
  group by rivi_id
), rivin_summat as (
  select r.tyo_id,
         r.yksikkohinta_eur * r.kappalemaara as myynti_eur,
         r.kulutus_g + r.toinen_kulutus_g
           + coalesce(l.kulutus_g, 0) + coalesce(lt.kulutus_g, 0) as kulutus_g,
         r.kulutus_g / 1000.0 * public.vari_kokonaishinta(r.vari_id)
           + case when r.toinen_vari_id is null then 0
                  else r.toinen_kulutus_g / 1000.0 * public.vari_kokonaishinta(r.toinen_vari_id)
             end
           + coalesce(l.kustannus_eur, 0)
           + coalesce(lt.kustannus_eur, 0) as maalikustannus_eur
  from rivit_kaikki r
  left join lisavarit_riveittain l on l.rivi_id = r.id
  left join lisatyot_riveittain lt on lt.rivi_id = r.id
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

comment on view public.tyojen_talous is
  'Valmiiden ja arkistoitujen töiden myynti, maalikustannus ja kate. Maalikustannuksessa ovat myös lisävärit ja lisätöiden värit, automaattinen pohjaväri ja lakka mukaan lukien.';

revoke all on public.tyojen_talous from anon;
grant select on public.tyojen_talous to authenticated;
grant select on public.tyojen_talous to service_role;


-- ---------------------------------------------------------------------
-- 2. Kulutusraportti tuntee lisätyön värin
--
-- Rooli kertoo mistä grammat tulivat: lisätyö, automaattinen pohjaväri
-- tai automaattinen lakka. Ilman erottelua raportti näyttäisi logon
-- pohjavärin tavallisena lisätyönä.
-- ---------------------------------------------------------------------

create or replace view public.maalinkulutus_raportoituna as
with kaytto as (
  select (tr.id::text || ':paavari') as id,
         coalesce(t.valmistunut, t.aloitettu) as luotu,
         tr.osa_id, tr.oma_kuvaus, tr.vari_id, tr.kappalemaara,
         coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g) as kulutus_g,
         'paavari'::text as rooli,
         t.valmistui_id as kayttaja_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select (tr.id::text || ':toinen'),
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, tr.toinen_vari_id, tr.kappalemaara,
         coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
         coalesce(tr.toinen_vari_rooli, 'toinen'),
         t.valmistui_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null
  union all
  select (l.id::text || ':lisavari'),
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, l.vari_id, tr.kappalemaara,
         coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
         'lisavari',
         t.valmistui_id
  from tyon_rivin_lisavarit l
  join tyon_rivit tr on tr.id = l.rivi_id
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select (lt.id::text || ':lisatyo'),
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, lt.vari_id, tr.kappalemaara,
         coalesce(lt.toteutunut_kulutus_g, lt.kulutus_g, 0),
         coalesce('lisatyo_' || lt.automaattinen, 'lisatyo'),
         t.valmistui_id
  from tyon_rivin_lisatyot lt
  join tyon_rivit tr on tr.id = lt.tyon_rivi_id
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and lt.vari_id is not null
  union all
  select (ar.id::text || ':paavari'),
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.vari_id, ar.kappalemaara,
         coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
         'paavari',
         at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id
  union all
  select (ar.id::text || ':toinen'),
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.toinen_vari_id, ar.kappalemaara,
         coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
         coalesce(ar.toinen_vari_rooli, 'toinen'),
         at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null
  union all
  select (al.id::text || ':lisavari'),
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, al.vari_id, ar.kappalemaara,
         coalesce(al.toteutunut_kulutus_g, al.arvioitu_kulutus_g),
         'lisavari',
         at.valmistui_id
  from arkistoidut_rivin_lisavarit al
  join arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  join arkistoidut_tyot at on at.id = ar.tyo_id
  union all
  select (alt.id::text || ':lisatyo'),
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, alt.vari_id, ar.kappalemaara,
         coalesce(alt.toteutunut_kulutus_g, alt.kulutus_g, 0),
         coalesce('lisatyo_' || alt.automaattinen, 'lisatyo'),
         at.valmistui_id
  from arkistoidut_rivin_lisatyot alt
  join arkistoidut_tyon_rivit ar on ar.id = alt.rivi_id
  join arkistoidut_tyot at on at.id = ar.tyo_id
  where alt.vari_id is not null
)
select k.id,
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
       (k.kulutus_g / 1000.0) as toteutunut_kulutus_kg,
       case when public.is_admin()
            then round((k.kulutus_g / 1000.0) * public.vari_kokonaishinta(k.vari_id), 2)
            else null::numeric
       end as maalikustannus_eur,
       k.kayttaja_id
from kaytto k
left join osat o on o.id = k.osa_id
join varit v on v.id = k.vari_id
where auth.role() = any (array['authenticated', 'service_role']);

revoke all on public.maalinkulutus_raportoituna from anon;
grant select on public.maalinkulutus_raportoituna to authenticated;
grant select on public.maalinkulutus_raportoituna to service_role;
