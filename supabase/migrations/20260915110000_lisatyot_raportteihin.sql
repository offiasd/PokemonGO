-- =====================================================================
-- Migraatio: lisätyöt arkistoon, talouteen ja raportteihin
--
-- Edellinen migraatio loi lisätyörivit ja niiden saldovaraukset, mutta
-- kulutus ja kustannus jäivät näkymien ulkopuolelle. Seuraus olisi ollut
-- hiljainen: lisätöiden maali olisi varattu ja kulutettu varastosta,
-- mutta työn kate olisi näyttänyt sen verran liian suurelta eikä
-- kulutusraportti olisi tuntenut lisätyön väriä lainkaan.
--
-- Arkistointi olisi vienyt tiedon kokonaan: arkistoi_tyo poistaa työn
-- riveineen, ja lisätyörivit olisivat kadonneet kaskadissa ilman omaa
-- arkistotauluaan.
--
-- Työn myyntihinta on rivin yksikkohinta_eur, johon lisätöiden hinnat ja
-- lakkauslisä sisältyvät. tyon_rivin_lisatyot.hinta_eur on erittely
-- samasta summasta - sitä ei lasketa myyntiin toiseen kertaan, jotta
-- lisätyö näkyy omana rivinään ilman että se kertaantuu loppusummassa.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Arkistotaulu
--
-- Sarakkeet kuten tyon_rivin_lisatyot ilman varaus_purettu-lippua:
-- arkistoitu työ on valmis ja sen varaus on jo purettu kulutukseksi.
-- ---------------------------------------------------------------------

create table if not exists public.arkistoidut_rivin_lisatyot (
  id uuid primary key,
  rivi_id uuid not null references public.arkistoidut_tyon_rivit (id) on delete cascade,
  lisatyo_id uuid references public.lisatyot (id),
  vari_id uuid references public.varit (id),
  maara integer not null default 1,
  osuus_prosentti numeric(5, 2),
  teippaus_min integer,
  maalaus_min integer,
  kulutus_g numeric(10, 2),
  hinta_eur numeric(10, 2),
  vari_hinta_per_kg numeric(12, 4),
  maalikustannus_eur numeric(12, 2),
  hinta_lukittu_at timestamptz,
  automaattinen text,
  jarjestys integer not null default 0
);

comment on table public.arkistoidut_rivin_lisatyot is
  'Arkistoidun työrivin lisätyöt. Ajat, kulutus ja hinnat ovat kopioita kulutushetkeltä eivätkä muutu enää.';

create index if not exists arkistoidut_rivin_lisatyot_rivi_idx
  on public.arkistoidut_rivin_lisatyot (rivi_id);

alter table public.arkistoidut_rivin_lisatyot enable row level security;

create policy "Kirjautuneet lukevat arkistoidut lisätyöt" on public.arkistoidut_rivin_lisatyot
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi arkistoituja lisätöitä" on public.arkistoidut_rivin_lisatyot
  for all using (public.is_admin()) with check (public.is_admin());

-- RLS rajaa rivit, ei sarakkeita. Kustannuskentät ovat taloustietoa samoin
-- kuin arkistoidulla työrivillä, joten SELECT annetaan sarakkeittain.
-- hinta_eur on asiakashinta ja kuuluu myös maalaajalle.
--
-- Myös teippaus_min ja maalaus_min jäävät pois: hinta jaettuna ajalla on
-- tuntiveloitus, joten minuutit yhdessä hinnan kanssa paljastaisivat sen
-- vaikka itse tuntihinta on maalaajalta suljettu.
revoke all on public.arkistoidut_rivin_lisatyot from anon;
grant insert, update, delete on public.arkistoidut_rivin_lisatyot to authenticated;
grant select (
  id, rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti,
  kulutus_g, hinta_eur, automaattinen, jarjestys
) on public.arkistoidut_rivin_lisatyot to authenticated;
grant all on public.arkistoidut_rivin_lisatyot to service_role;


-- ---------------------------------------------------------------------
-- 1b. Sama rajaus elävään lisätyöriviin ja katalogiin
--
-- Edellinen migraatio jätti minuutit maalaajan luettaviksi sekä
-- tyon_rivin_lisatyot-taulussa että lisatyot-katalogissa. Katalogi ja
-- osan valinnat luetaan käyttöliittymässä aina security definer
-- -funktioiden (lisatyoluettelo, osan_lisatyot, osien_lisatyot) kautta,
-- joten taulujen oma lukuoikeus voidaan rajata adminille ilman että
-- mikään näkymä menettää tietonsa.
-- ---------------------------------------------------------------------

revoke select (teippaus_min, maalaus_min) on public.tyon_rivin_lisatyot from authenticated;

drop policy if exists "Lisätyöt näkyvät kirjautuneille" on public.lisatyot;
drop policy if exists "Osan lisätyöt näkyvät kirjautuneille" on public.osa_lisatyot;


-- ---------------------------------------------------------------------
-- 2. Arkistointi ottaa lisätyöt mukaan
-- ---------------------------------------------------------------------

create or replace function public.arkistoi_tyo(p_tyo_id uuid, p_automaattinen boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tyo tyot%rowtype;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila <> 'valmis' then
    raise exception 'Vain valmiin työn voi arkistoida.';
  end if;

  insert into arkistoidut_tyot (
    id, asiakas, aloitti_id, aloitettu, valmistui_id, valmistunut, alennus_prosentti,
    arkistoi_id, automaattinen
  )
  values (
    v_tyo.id, v_tyo.asiakas, v_tyo.aloitti_id, v_tyo.aloitettu, v_tyo.valmistui_id,
    v_tyo.valmistunut, v_tyo.alennus_prosentti,
    case when p_automaattinen then null else auth.uid() end,
    p_automaattinen
  );

  insert into arkistoidut_tyon_rivit (
    id, tyo_id, osa_id, oma_kuvaus, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toteutunut_kulutus_g, toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g,
    toinen_toteutunut_kulutus_g, kommentti, custom,
    vari_hinta_per_kg, toinen_vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at
  )
  select
    r.id, r.tyo_id, r.osa_id, r.oma_kuvaus, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g, r.kommentti, r.custom,
    r.vari_hinta_per_kg, r.toinen_vari_hinta_per_kg, r.maalikustannus_eur, r.hinta_lukittu_at
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  insert into arkistoidut_rivin_lisavarit (
    id, rivi_id, vari_id, arvioitu_kulutus_g, toteutunut_kulutus_g, jarjestys,
    vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at
  )
  select l.id, l.rivi_id, l.vari_id, l.arvioitu_kulutus_g, l.toteutunut_kulutus_g, l.jarjestys,
         l.vari_hinta_per_kg, l.maalikustannus_eur, l.hinta_lukittu_at
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id;

  insert into arkistoidut_rivin_lisatyot (
    id, rivi_id, lisatyo_id, vari_id, maara, osuus_prosentti, teippaus_min, maalaus_min,
    kulutus_g, hinta_eur, vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at,
    automaattinen, jarjestys
  )
  select
    lt.id, lt.tyon_rivi_id, lt.lisatyo_id, lt.vari_id, lt.maara, lt.osuus_prosentti,
    lt.teippaus_min, lt.maalaus_min, lt.kulutus_g, lt.hinta_eur, lt.vari_hinta_per_kg,
    lt.maalikustannus_eur, lt.hinta_lukittu_at, lt.automaattinen, lt.jarjestys
  from tyon_rivin_lisatyot lt
  join tyon_rivit r on r.id = lt.tyon_rivi_id
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$$;

revoke all on function public.arkistoi_tyo(uuid, boolean) from public, anon;
grant execute on function public.arkistoi_tyo(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------
-- 3. tyojen_talous: lisätöiden maali kustannukseen ja kulutukseen
--
-- Myynti tulee yhä rivin yksikkohinta_eur-kentästä, johon lisätöiden
-- hinnat sisältyvät. Vain kustannus ja grammat kasvavat.
-- ---------------------------------------------------------------------

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
  select lt.tyon_rivi_id as rivi_id, lt.vari_id, coalesce(lt.kulutus_g, 0) as kulutus_g
  from public.tyon_rivin_lisatyot lt
  where lt.vari_id is not null
  union all
  select al.rivi_id, al.vari_id, coalesce(al.kulutus_g, 0)
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
-- 4. Kulutusraportti tuntee lisätyön värin
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
         coalesce(lt.kulutus_g, 0),
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
         coalesce(alt.kulutus_g, 0),
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


-- ---------------------------------------------------------------------
-- 5. Värin käyttökerrat: lisätyön väri on käytetty väri
-- ---------------------------------------------------------------------

create or replace view public.varien_suosio as
select v.id as vari_id,
       count(r.tyo_id) as kayttokerrat
from varit v
left join (
  select tyo_id, vari_id from tyon_rivit
  union all
  select tyo_id, toinen_vari_id from tyon_rivit where toinen_vari_id is not null
  union all
  select tr.tyo_id, l.vari_id
  from tyon_rivin_lisavarit l join tyon_rivit tr on tr.id = l.rivi_id
  union all
  select tr.tyo_id, lt.vari_id
  from tyon_rivin_lisatyot lt join tyon_rivit tr on tr.id = lt.tyon_rivi_id
  where lt.vari_id is not null
  union all
  select tyo_id, vari_id from arkistoidut_tyon_rivit
  union all
  select tyo_id, toinen_vari_id from arkistoidut_tyon_rivit where toinen_vari_id is not null
  union all
  select ar.tyo_id, al.vari_id
  from arkistoidut_rivin_lisavarit al join arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  union all
  select ar.tyo_id, alt.vari_id
  from arkistoidut_rivin_lisatyot alt join arkistoidut_tyon_rivit ar on ar.id = alt.rivi_id
  where alt.vari_id is not null
) r on r.vari_id = v.id
group by v.id;
