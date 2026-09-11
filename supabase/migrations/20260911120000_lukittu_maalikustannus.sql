-- Työn maalikustannus lukitaan siihen hetkeen, jolloin maali käytettiin.
--
-- tyojen_talous kutsui vari_kokonaishinta(vari_id) joka kerta kun näkymä
-- luettiin. Funktio hakee värin *tämänhetkisen* kilohinnan ja kertoo sen
-- kulutetuilla grammoilla, joten työn kustannusta ei ollut tallennettu
-- mihinkään - se laskettiin uudelleen aina kun etusivu avattiin.
--
-- Seuraus: kun kilohinta muuttui, kaikkien vanhojen töiden maalikustannus ja
-- kate muuttuivat takautuvasti. Myös arkistoitujen, myös jo laskutettujen.
-- Syyskuun kate ei ollut kiinteä luku.
--
-- Korjaus: rivi kantaa oman kilohintansa. Hinta kopioidaan riville kun maali
-- on oikeasti mennyt, eikä sitä sen jälkeen päivitetä automaattisesti
-- missään tilanteessa. Tämä on samalla edellytys liukuvalle keskihinnalle:
-- ilman lukitusta historia kirjoittuisi uusiksi jokaisen maalitilauksen
-- yhteydessä, noin parikymmentä kertaa vuodessa.

-- ---------------------------------------------------------------------------
-- 1. Rajaamaton hintafunktio lukitusta varten
-- ---------------------------------------------------------------------------

-- vari_kokonaishinta palauttaa muille kuin adminille NULLin (ks.
-- 20260907091000_hintafunktiot_adminille). Se on oikein hinnan *näyttämiseen*,
-- mutta lukitus tapahtuu maalaajan istunnossa - maalaaja kirjaa kulutuksen -
-- joten trigger saisi käsiinsä NULLin ja kustannus jäisi nollaksi.
--
-- Sama kaava siis erotetaan omaksi funktiokseen ilman roolitarkistusta.
-- Sitä ei myönnetä kenellekään: vain omistajan oikeuksin ajettavat triggerit
-- ja vari_kokonaishinta kutsuvat sitä, eikä hinta pääse tätä kautta
-- rajapintaan.
create or replace function public.vari_kokonaishinta_rajaamaton(p_vari_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.vari_kokonaishinta_per_kg(
    v.alkupera,
    v.ostohinta_per_kg,
    coalesce(v.tullimaksu_prosentti, a.tullimaksu_prosentti_oletus),
    coalesce(v.alv_prosentti, a.alv_prosentti_oletus),
    coalesce(
      v.toimituskulu_per_kg,
      case v.alkupera
        when 'EU' then a.toimituskulu_per_kg_eu_oletus
        when 'USA' then a.toimituskulu_per_kg_usa_oletus
        else a.toimituskulu_per_kg_muu_oletus
      end
    )
  )
  from varit v, asetukset a
  where v.id = p_vari_id;
$$;

comment on function public.vari_kokonaishinta_rajaamaton(uuid) is
  'Värin kokonaishinta €/kg ilman roolitarkistusta. Vain hinnan lukitukseen - ei kutsuoikeutta sovellukselle.';

revoke execute on function public.vari_kokonaishinta_rajaamaton(uuid)
  from public, anon, authenticated;

-- Näytettävä hinta on sama kaava roolitarkistuksen takana. Kaava on nyt
-- yhdessä paikassa, jotta lukittu ja näytetty hinta eivät voi erkaantua.
create or replace function public.vari_kokonaishinta(p_vari_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_admin() then public.vari_kokonaishinta_rajaamaton(p_vari_id) end;
$$;

comment on function public.vari_kokonaishinta(uuid) is
  'Värin kokonaishinta €/kg. NULL muille kuin adminille.';

-- ---------------------------------------------------------------------------
-- 2. Sarakkeet
-- ---------------------------------------------------------------------------

-- Kustannus tallennetaan riville, koska kulutus on rivillä. Rivillä on kaksi
-- omaa väriä (pääväri + pohjaväri tai lakka), joten molemmat tarvitsevat oman
-- hintansa.
alter table public.tyon_rivit
  add column if not exists vari_hinta_per_kg        numeric(12,4),
  add column if not exists toinen_vari_hinta_per_kg numeric(12,4),
  add column if not exists maalikustannus_eur       numeric(12,2),
  add column if not exists hinta_lukittu_at         timestamptz;

comment on column public.tyon_rivit.vari_hinta_per_kg is
  'Päävärin kokonaishinta €/kg lukitushetkellä. Kopio, ei viittaus: värin hinta muuttuu, tämän työn kustannus ei.';
comment on column public.tyon_rivit.toinen_vari_hinta_per_kg is
  'Pohjavärin tai lakan kokonaishinta €/kg lukitushetkellä. Kopio samasta syystä kuin vari_hinta_per_kg.';
comment on column public.tyon_rivit.maalikustannus_eur is
  'Rivin maalikustannus lukituilla hinnoilla. tyojen_talous lukee tämän eikä laske hintaa uudelleen.';
comment on column public.tyon_rivit.hinta_lukittu_at is
  'Milloin hinta lukittiin - samalla merkki siitä, että rivi on lukittu eikä hintaa enää haeta.';

-- Custom-työn kolmas ja sitä seuraavat värit ovat omassa taulussaan, ja ne
-- kuluttavat maalia siinä missä rivin kaksi omaa väriä. Ilman lukitusta
-- tyojen_talous joutuisi laskemaan niiden osuuden edelleen nykyhinnalla.
alter table public.tyon_rivin_lisavarit
  add column if not exists vari_hinta_per_kg  numeric(12,4),
  add column if not exists maalikustannus_eur numeric(12,2),
  add column if not exists hinta_lukittu_at   timestamptz;

comment on column public.tyon_rivin_lisavarit.vari_hinta_per_kg is
  'Lisävärin kokonaishinta €/kg lukitushetkellä. Kopio, ei viittaus.';
comment on column public.tyon_rivin_lisavarit.maalikustannus_eur is
  'Lisävärin maalikustannus lukitulla hinnalla.';
comment on column public.tyon_rivin_lisavarit.hinta_lukittu_at is
  'Milloin hinta lukittiin. Lisävärille se on työn valmistumishetki - erillistä toteutunutta kulutusta ei kirjata.';

-- Arkisto kantaa lukitun hinnan mukanaan. Muuten arkistointi pyyhkisi juuri
-- sen tiedon, jonka takia tämä migraatio tehdään.
alter table public.arkistoidut_tyon_rivit
  add column if not exists vari_hinta_per_kg        numeric(12,4),
  add column if not exists toinen_vari_hinta_per_kg numeric(12,4),
  add column if not exists maalikustannus_eur       numeric(12,2),
  add column if not exists hinta_lukittu_at         timestamptz;

alter table public.arkistoidut_rivin_lisavarit
  add column if not exists vari_hinta_per_kg  numeric(12,4),
  add column if not exists maalikustannus_eur numeric(12,2),
  add column if not exists hinta_lukittu_at   timestamptz;

comment on column public.arkistoidut_tyon_rivit.maalikustannus_eur is
  'Rivin maalikustannus lukituilla hinnoilla, kopioitu arkistoitaessa tyon_rivit-taulusta.';
comment on column public.arkistoidut_rivin_lisavarit.maalikustannus_eur is
  'Lisävärin maalikustannus lukitulla hinnalla, kopioitu arkistoitaessa.';

-- ---------------------------------------------------------------------------
-- 3. Lukitus: kun kulutus kirjataan
-- ---------------------------------------------------------------------------

-- Hinta lukitaan kun toteutunut_kulutus_g saa arvon. Se on hetki jolloin maali
-- on oikeasti mennyt. Ei työn luonnissa - silloin kulutus on vielä arvio eikä
-- maalia ole otettu hyllystä.
--
-- hinta_lukittu_at:n asettaminen suoraan on toinen tapa pyytää lukitus. Sitä
-- käyttävät työn valmistuminen (kohta 4) ja backfill (kohta 6): ne tietävät
-- että maali on mennyt, mutta eivät koske kulutuslukuihin.
create or replace function public.tyon_rivi_lukitse_maalikustannus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Kulutusta ei ole kirjattu eikä lukitusta pyydetty: rivi jää auki.
  if new.toteutunut_kulutus_g is null and new.hinta_lukittu_at is null then
    new.vari_hinta_per_kg := null;
    new.toinen_vari_hinta_per_kg := null;
    new.maalikustannus_eur := null;
    return new;
  end if;

  -- Hinta haetaan vain kerran. Lukitun rivin UPDATEssa vanha hinta tulee
  -- sarakkeessa mukana, joten tämä haara ohittuu eikä nykyhinta pääse
  -- takaisin sisään. Väri ei vaihdu lukitulla rivillä: rivien muokkaus kulkee
  -- korvaa_tyon_rivit-funktion kautta, joka poistaa ja lisää rivit uudelleen,
  -- eikä valmiin työn rivejä muokata lainkaan.
  if new.vari_hinta_per_kg is null then
    new.vari_hinta_per_kg := public.vari_kokonaishinta_rajaamaton(new.vari_id);
  end if;
  if new.toinen_vari_id is null then
    new.toinen_vari_hinta_per_kg := null;
  elsif new.toinen_vari_hinta_per_kg is null then
    new.toinen_vari_hinta_per_kg := public.vari_kokonaishinta_rajaamaton(new.toinen_vari_id);
  end if;
  new.hinta_lukittu_at := coalesce(new.hinta_lukittu_at, now());

  -- Kustannus lasketaan aina uudelleen, mutta lukitulla hinnalla: jälkikäteen
  -- korjattu kulutus muuttaa määrän, hinta pysyy sinä mikä se oli.
  --
  -- Kulutus luetaan samalla varalla kuin tyojen_talous ja varaston purku ovat
  -- aina lukeneet: toteutunut, ja sen puuttuessa arvio. Näin lukittu luku on
  -- sama kuin näkymän aiemmin laskema.
  new.maalikustannus_eur := round(
    coalesce(new.toteutunut_kulutus_g, new.arvioitu_kulutus_g, 0) / 1000.0
      * coalesce(new.vari_hinta_per_kg, 0)
    + case
        when new.toinen_vari_id is null then 0
        else coalesce(new.toinen_toteutunut_kulutus_g, new.toinen_arvioitu_kulutus_g, 0) / 1000.0
               * coalesce(new.toinen_vari_hinta_per_kg, 0)
      end,
    2
  );
  return new;
end;
$$;

comment on function public.tyon_rivi_lukitse_maalikustannus() is
  'Lukitsee työrivin maalin kilohinnan kulutuksen kirjaushetkeen ja laskee rivin maalikustannuksen lukitulla hinnalla.';

revoke execute on function public.tyon_rivi_lukitse_maalikustannus()
  from public, anon, authenticated;

drop trigger if exists tyon_rivi_lukitse_maalikustannus_trg on public.tyon_rivit;
create trigger tyon_rivi_lukitse_maalikustannus_trg
  before insert or update on public.tyon_rivit
  for each row execute function public.tyon_rivi_lukitse_maalikustannus();

-- Sama lisäväreille. Yksi väri per rivi, muuten identtinen.
create or replace function public.rivin_lisavari_lukitse_maalikustannus()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.toteutunut_kulutus_g is null and new.hinta_lukittu_at is null then
    new.vari_hinta_per_kg := null;
    new.maalikustannus_eur := null;
    return new;
  end if;

  if new.vari_hinta_per_kg is null then
    new.vari_hinta_per_kg := public.vari_kokonaishinta_rajaamaton(new.vari_id);
  end if;
  new.hinta_lukittu_at := coalesce(new.hinta_lukittu_at, now());

  new.maalikustannus_eur := round(
    coalesce(new.toteutunut_kulutus_g, new.arvioitu_kulutus_g, 0) / 1000.0
      * coalesce(new.vari_hinta_per_kg, 0),
    2
  );
  return new;
end;
$$;

comment on function public.rivin_lisavari_lukitse_maalikustannus() is
  'Lukitsee lisävärin kilohinnan ja laskee sen maalikustannuksen lukitulla hinnalla.';

revoke execute on function public.rivin_lisavari_lukitse_maalikustannus()
  from public, anon, authenticated;

drop trigger if exists rivin_lisavari_lukitse_maalikustannus_trg on public.tyon_rivin_lisavarit;
create trigger rivin_lisavari_lukitse_maalikustannus_trg
  before insert or update on public.tyon_rivin_lisavarit
  for each row execute function public.rivin_lisavari_lukitse_maalikustannus();

-- ---------------------------------------------------------------------------
-- 4. Lukitus viimeistään työn valmistuessa
-- ---------------------------------------------------------------------------

-- Työrivin hinta lukittuu jo kun maalaaja kirjaa toteutuneen kulutuksen. Kaksi
-- tapausta jää silti kiinni tästä:
--
--   * Lisäväreille ei kirjata toteutunutta kulutusta lainkaan - ne kuluvat
--     arviollaan. Tämä on niiden ainoa lukitushetki.
--   * Rivi, jonka toteutunut kulutus jäi jostain syystä kirjaamatta, kuluu
--     silti varastosta arviollaan kun työ valmistuu.
--
-- Valmistuminen on tarkalleen se hetki jolloin saldo vähenee (ks.
-- tyo_valmistuu_paivita_saldo), joten se on oikea hetki myös hinnalle.
create or replace function public.tyo_valmistuu_lukitse_hinnat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.tila = 'valmis' and old.tila is distinct from 'valmis' then
    -- Rivien omat triggerit hakevat hinnat ja laskevat kustannuksen; tässä
    -- riittää merkitä hetki. Jo lukittuihin riveihin ei kosketa.
    update tyon_rivit
    set hinta_lukittu_at = now()
    where tyo_id = new.id and hinta_lukittu_at is null;

    update tyon_rivin_lisavarit l
    set hinta_lukittu_at = now()
    from tyon_rivit r
    where r.id = l.rivi_id and r.tyo_id = new.id and l.hinta_lukittu_at is null;
  end if;
  return null;
end;
$$;

comment on function public.tyo_valmistuu_lukitse_hinnat() is
  'Lukitsee työn rivien ja lisävärien maalihinnat viimeistään siinä hetkessä, jolloin maali vähenee varastosta.';

revoke execute on function public.tyo_valmistuu_lukitse_hinnat()
  from public, anon, authenticated;

drop trigger if exists tyo_valmistuu_lukitse_hinnat_trg on public.tyot;
create trigger tyo_valmistuu_lukitse_hinnat_trg
  after update on public.tyot
  for each row execute function public.tyo_valmistuu_lukitse_hinnat();

-- ---------------------------------------------------------------------------
-- 5. Arkistointi kopioi lukitut hinnat
-- ---------------------------------------------------------------------------

create or replace function public.arkistoi_tyo(p_tyo_id uuid, p_automaattinen boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  delete from tyot where id = p_tyo_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Backfill
-- ---------------------------------------------------------------------------

-- Vanhoille riveille ei ole historiallista hintaa missään, joten backfill
-- käyttää nykyistä hintaa. Tämä ei tee vanhoista luvuista tarkempia - ne ovat
-- sama likiarvo kuin ennen tätä migraatiota - mutta siitä eteenpäin ne eivät
-- enää muutu.
--
-- Lukitaan rivit joilla kulutus on kirjattu sekä rivit jotka kuuluvat jo
-- valmiiseen työhön: niidenkin maali on mennyt varastosta. Keskeneräisen työn
-- kirjaamaton rivi jää auki, niin kuin sen kuuluukin.
--
-- Hinnan ja kustannuksen täyttää rivin oma trigger, joten tässä asetetaan vain
-- lukitushetki.
update public.tyon_rivit r
set hinta_lukittu_at = now()
where r.hinta_lukittu_at is null
  and (
    r.toteutunut_kulutus_g is not null
    or exists (select 1 from public.tyot t where t.id = r.tyo_id and t.tila = 'valmis')
  );

update public.tyon_rivin_lisavarit l
set hinta_lukittu_at = now()
from public.tyon_rivit r
where r.id = l.rivi_id
  and l.hinta_lukittu_at is null
  and (
    l.toteutunut_kulutus_g is not null
    or exists (select 1 from public.tyot t where t.id = r.tyo_id and t.tila = 'valmis')
  );

-- Arkistoiduilla riveillä ei ole triggeriä - arkisto on historiaa, johon ei
-- kirjoiteta muuta kuin arkistoitaessa - joten hinta ja kustannus lasketaan
-- tässä suoraan. Kaikki arkistoidut rivit ovat valmiista töistä.
update public.arkistoidut_tyon_rivit r
set vari_hinta_per_kg = public.vari_kokonaishinta_rajaamaton(r.vari_id),
    toinen_vari_hinta_per_kg = case
      when r.toinen_vari_id is null then null
      else public.vari_kokonaishinta_rajaamaton(r.toinen_vari_id)
    end,
    maalikustannus_eur = round(
      coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g, 0) / 1000.0
        * coalesce(public.vari_kokonaishinta_rajaamaton(r.vari_id), 0)
      + case
          when r.toinen_vari_id is null then 0
          else coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0) / 1000.0
                 * coalesce(public.vari_kokonaishinta_rajaamaton(r.toinen_vari_id), 0)
        end,
      2
    ),
    hinta_lukittu_at = now()
where r.hinta_lukittu_at is null;

update public.arkistoidut_rivin_lisavarit l
set vari_hinta_per_kg = public.vari_kokonaishinta_rajaamaton(l.vari_id),
    maalikustannus_eur = round(
      coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g, 0) / 1000.0
        * coalesce(public.vari_kokonaishinta_rajaamaton(l.vari_id), 0),
      2
    ),
    hinta_lukittu_at = now()
where l.hinta_lukittu_at is null;

-- ---------------------------------------------------------------------------
-- 7. tyojen_talous lukee valmiin luvun
-- ---------------------------------------------------------------------------

-- Näkymä ei enää kutsu vari_kokonaishinta-funktiota lainkaan. Kaksi hyötyä:
-- luvut ovat kiinteitä, ja etusivu nopeutuu - ennen jokainen avaus laski
-- hinnan uudelleen jokaiselle työlle, myös arkistoiduille.
--
-- Kulutusgrammat luetaan entiseen tapaan, koska kulutusraportti ei muutu;
-- vain kustannus tulee nyt lukitusta sarakkeesta.
--
-- Pyöristys siirtyy riville: ennen näkymä summasi pyöristämättömät rivit ja
-- pyöristi lopuksi, nyt jokainen rivi on jo senteissä. Ero on korkeintaan
-- muutama sentti työtä kohti, ja se on lukitun luvun hinta: kustannus on
-- kannassa sellaisena kuin se raportoidaan.
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
  select r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur,
         coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g) as kulutus_g,
         coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0) as toinen_kulutus_g,
         coalesce(r.maalikustannus_eur, 0) as maalikustannus_eur
  from public.tyon_rivit r
  union all
  select r.id, r.tyo_id, r.kappalemaara, r.yksikkohinta_eur,
         coalesce(r.toteutunut_kulutus_g, r.arvioitu_kulutus_g),
         coalesce(r.toinen_toteutunut_kulutus_g, r.toinen_arvioitu_kulutus_g, 0),
         coalesce(r.maalikustannus_eur, 0)
  from public.arkistoidut_tyon_rivit r
), lisavarit_kaikki as (
  select l.rivi_id,
         coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g) as kulutus_g,
         coalesce(l.maalikustannus_eur, 0) as maalikustannus_eur
  from public.tyon_rivin_lisavarit l
  union all
  select l.rivi_id,
         coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
         coalesce(l.maalikustannus_eur, 0)
  from public.arkistoidut_rivin_lisavarit l
), lisavarit_riveittain as (
  select rivi_id,
         sum(kulutus_g) as kulutus_g,
         sum(maalikustannus_eur) as kustannus_eur
  from lisavarit_kaikki
  group by rivi_id
), rivin_summat as (
  select r.tyo_id,
         r.yksikkohinta_eur * r.kappalemaara as myynti_eur,
         r.kulutus_g + r.toinen_kulutus_g + coalesce(l.kulutus_g, 0) as kulutus_g,
         r.maalikustannus_eur + coalesce(l.kustannus_eur, 0) as maalikustannus_eur
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
  -- Alennus pyöristetään ennen vähennystä, jotta summa täsmää työsivun kanssa.
  round(valisumma_eur * alennus_prosentti / 100.0, 2) as alennus_eur,
  round(valisumma_eur - round(valisumma_eur * alennus_prosentti / 100.0, 2), 2) as loppusumma_eur,
  round(maalikustannus_raaka, 2) as maalikustannus_eur,
  -- Kate käyttää samaa lukittua kustannusta kuin maalikustannus_eur.
  round(valisumma_eur - round(valisumma_eur * alennus_prosentti / 100.0, 2) - maalikustannus_raaka, 2)
    as kate_eur,
  kulutus_g,
  kulutus_g / 1000.0 as kulutus_kg
from tyon_summat s
where public.is_admin();

revoke all on public.tyojen_talous from anon;
grant select on public.tyojen_talous to authenticated;
grant select on public.tyojen_talous to service_role;

comment on view public.tyojen_talous is
  'Töiden myynti, lukittu maalikustannus ja kate. Vain adminille - muille tyhjä.';

-- ---------------------------------------------------------------------------
-- 8. Roolirajaus
-- ---------------------------------------------------------------------------

-- Uudet sarakkeet ovat taloustietoa, eikä työntekijä saa lukea niitä. Sama
-- menetelmä kuin varit.ostohinta_per_kg -sarakkeella: SELECT perutaan
-- taululta ja myönnetään takaisin sarakkeittain. Sarakkeet luetellaan
-- nimeltä, jotta uusi sarake ei näy maalaajalle ennen kuin se lisätään tähän.
--
-- Rajaus koskee myös adminia suorassa rajapintakutsussa: lukittu kustannus
-- luetaan tyojen_talous-näkymästä, joka ajetaan omistajan oikeuksin ja
-- tarkistaa roolin itse. Erillistä hintanäkymää ei siis tarvita.
--
-- Työntekijä näkee yhä rivin yksikkohinta_eur-kentän eli asiakkaalle asetetun
-- hinnan. Vain maalin kustannus on piilossa.

revoke select on public.tyon_rivit from authenticated;
grant select (
  id,
  tyo_id,
  osa_id,
  oma_kuvaus,
  vari_id,
  toinen_vari_id,
  toinen_vari_rooli,
  kappalemaara,
  arvioitu_kulutus_g,
  toinen_arvioitu_kulutus_g,
  toteutunut_kulutus_g,
  toinen_toteutunut_kulutus_g,
  varaus_purettu,
  yksikkohinta_eur,
  kommentti,
  custom
) on public.tyon_rivit to authenticated;

revoke select on public.tyon_rivin_lisavarit from authenticated;
grant select (
  id,
  rivi_id,
  vari_id,
  arvioitu_kulutus_g,
  toteutunut_kulutus_g,
  varaus_purettu,
  jarjestys
) on public.tyon_rivin_lisavarit to authenticated;

revoke select on public.arkistoidut_tyon_rivit from authenticated;
grant select (
  id,
  tyo_id,
  osa_id,
  oma_kuvaus,
  vari_id,
  toinen_vari_id,
  toinen_vari_rooli,
  kappalemaara,
  arvioitu_kulutus_g,
  toinen_arvioitu_kulutus_g,
  toteutunut_kulutus_g,
  toinen_toteutunut_kulutus_g,
  yksikkohinta_eur,
  kommentti,
  custom
) on public.arkistoidut_tyon_rivit to authenticated;

revoke select on public.arkistoidut_rivin_lisavarit from authenticated;
grant select (
  id,
  rivi_id,
  vari_id,
  arvioitu_kulutus_g,
  toteutunut_kulutus_g,
  jarjestys
) on public.arkistoidut_rivin_lisavarit to authenticated;
