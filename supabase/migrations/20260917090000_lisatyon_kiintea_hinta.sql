-- =====================================================================
-- Migraatio: lisätyön hinta kiinteänä, kahdessa värikategoriassa
--
-- Tähän asti lisätyön hinta johdettiin ajasta: teippaus- ja
-- maalausminuutit kerrottuna tuntiveloituksella. Hinnoittelupolitiikka
-- muuttuu: hinta asetetaan kiinteänä ja erikseen kahdelle kategorialle,
--
--   perusväri   = värin tyyppi on 'solid' (Solid / RAL)
--   erikoisväri = kaikki muut värityypit
--
-- Kategoria ratkeaa lisätyölle valitusta väristä, ei osan kategoriasta:
-- sama logo maksaa eri verran sen mukaan millä värillä se maalataan.
--
-- Ajat jäävät tauluihin ja käyttöliittymään. Ne eivät enää määrää
-- hintaa, mutta niistä rakennetaan myöhemmin jonojärjestelmä ajankäytön
-- perusteella - siksi niitä ei poisteta vaan ylläpidetään edelleen.
--
-- Osa voi poiketa katalogin hinnasta samoin kuin se poikkeaa ajoista.
-- Ilman tätä politiikan vaihto veisi olemassa olevan mahdollisuuden:
-- osakohtainen aika tuotti tähän asti osakohtaisen hinnan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Hintasarakkeet
-- ---------------------------------------------------------------------

alter table public.lisatyot
  add column if not exists hinta_perusvari_eur numeric(10, 2) not null default 0
    check (hinta_perusvari_eur >= 0),
  add column if not exists hinta_erikoisvari_eur numeric(10, 2) not null default 0
    check (hinta_erikoisvari_eur >= 0);

comment on column public.lisatyot.hinta_perusvari_eur is
  'Kiinteä asiakashinta kun lisätyön väri on solid (Solid / RAL).';
comment on column public.lisatyot.hinta_erikoisvari_eur is
  'Kiinteä asiakashinta kun lisätyön väri on mikä tahansa muu kuin solid.';

comment on column public.lisatyot.teippaus_min is
  'Suojaukseen kuluva aika. Ei enää hinnan peruste - jää jonojärjestelmän ajankäyttöä varten.';
comment on column public.lisatyot.maalaus_min is
  'Maalaukseen kuluva aika. Ei enää hinnan peruste - jää jonojärjestelmän ajankäyttöä varten.';

-- null = peri katalogista, kuten aikojen ja lisäkulutuksen kohdalla.
alter table public.osa_lisatyot
  add column if not exists hinta_perusvari_eur numeric(10, 2)
    check (hinta_perusvari_eur >= 0),
  add column if not exists hinta_erikoisvari_eur numeric(10, 2)
    check (hinta_erikoisvari_eur >= 0);


-- ---------------------------------------------------------------------
-- 2. Nykyiset hinnat talteen ennen kuin laskentatapa katoaa
--
-- Molemmat kategoriat saavat aluksi saman, ajoista lasketun hinnan.
-- Näin yhdenkään lisätyön hinta ei muutu vaihdon hetkellä, ja
-- erikoisvärin korotus on omistajan oma päätös eikä migraation.
-- ---------------------------------------------------------------------

update public.lisatyot l
set hinta_perusvari_eur = public.lisatyon_hinta(l.teippaus_min, l.maalaus_min),
    hinta_erikoisvari_eur = public.lisatyon_hinta(l.teippaus_min, l.maalaus_min)
where l.hinta_perusvari_eur = 0 and l.hinta_erikoisvari_eur = 0;

-- Osan oma aika tuotti tähän asti osan oman hinnan. Se säilyy vain jos
-- poikkeus kirjataan nyt hintana - muuten osa putoaisi hiljaa takaisin
-- katalogin hintaan.
update public.osa_lisatyot ol
set hinta_perusvari_eur = public.lisatyon_hinta(
      coalesce(ol.teippaus_min, l.teippaus_min),
      coalesce(ol.maalaus_min, l.maalaus_min)
    ),
    hinta_erikoisvari_eur = public.lisatyon_hinta(
      coalesce(ol.teippaus_min, l.teippaus_min),
      coalesce(ol.maalaus_min, l.maalaus_min)
    )
from public.lisatyot l
where l.id = ol.lisatyo_id
  and (ol.teippaus_min is not null or ol.maalaus_min is not null);


-- ---------------------------------------------------------------------
-- 3. Kategorian ratkaisu yhdessä paikassa
-- ---------------------------------------------------------------------

create or replace function public.lisatyon_varikategoria(p_vari_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when (select v.tyyppi from public.varit v where v.id = p_vari_id) = 'solid'
              then 'perusvari' else 'erikoisvari' end;
$$;

comment on function public.lisatyon_varikategoria(uuid) is
  'Lisätyön hintakategoria väristä: solid on perusväri, kaikki muut erikoisväri.';

revoke execute on function public.lisatyon_varikategoria(uuid) from public, anon;
grant execute on function public.lisatyon_varikategoria(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 4. Luettelot palauttavat molemmat hinnat
-- ---------------------------------------------------------------------

drop function if exists public.osan_lisatyot(uuid);

create function public.osan_lisatyot(p_osa_id uuid)
returns table (
  lisatyo_id uuid,
  nimi text,
  ryhma text,
  on_jako boolean,
  jarjestys integer,
  valittu boolean,
  teippaus_min integer,
  maalaus_min integer,
  lisakulutus_g numeric,
  teippaus_oma boolean,
  maalaus_oma boolean,
  lisakulutus_oma boolean,
  hinta_perusvari_eur numeric,
  hinta_erikoisvari_eur numeric,
  hinta_perusvari_oma boolean,
  hinta_erikoisvari_oma boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id,
    l.nimi,
    l.ryhma,
    l.on_jako,
    l.jarjestys,
    ol.id is not null,
    coalesce(ol.teippaus_min, l.teippaus_min),
    coalesce(ol.maalaus_min, l.maalaus_min),
    coalesce(ol.lisakulutus_g, l.lisakulutus_g),
    ol.teippaus_min is not null,
    ol.maalaus_min is not null,
    ol.lisakulutus_g is not null,
    coalesce(ol.hinta_perusvari_eur, l.hinta_perusvari_eur),
    coalesce(ol.hinta_erikoisvari_eur, l.hinta_erikoisvari_eur),
    ol.hinta_perusvari_eur is not null,
    ol.hinta_erikoisvari_eur is not null
  from public.lisatyot l
  left join public.osa_lisatyot ol on ol.lisatyo_id = l.id and ol.osa_id = p_osa_id
  where l.aktiivinen
  order by l.jarjestys, l.nimi;
$$;

comment on function public.osan_lisatyot(uuid) is
  'Osan lisätyöt voimassa olevine arvoineen. *_oma erottaa osan oman arvon katalogista peritystä.';

revoke execute on function public.osan_lisatyot(uuid) from public, anon;
grant execute on function public.osan_lisatyot(uuid) to authenticated;


drop function if exists public.osien_lisatyot();

create function public.osien_lisatyot()
returns table (
  osa_id uuid,
  lisatyo_id uuid,
  nimi text,
  ryhma text,
  on_jako boolean,
  jarjestys integer,
  lisakulutus_g numeric,
  hinta_perusvari_eur numeric,
  hinta_erikoisvari_eur numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    ol.osa_id,
    l.id,
    l.nimi,
    l.ryhma,
    l.on_jako,
    l.jarjestys,
    coalesce(ol.lisakulutus_g, l.lisakulutus_g),
    coalesce(ol.hinta_perusvari_eur, l.hinta_perusvari_eur),
    coalesce(ol.hinta_erikoisvari_eur, l.hinta_erikoisvari_eur)
  from public.osa_lisatyot ol
  join public.lisatyot l on l.id = ol.lisatyo_id
  where l.aktiivinen
  order by ol.osa_id, l.jarjestys, l.nimi;
$$;

comment on function public.osien_lisatyot() is
  'Kaikkien osien rastitut lisätyöt voimassa olevine arvoineen työn lomaketta varten.';

revoke execute on function public.osien_lisatyot() from public, anon;
grant execute on function public.osien_lisatyot() to authenticated;


drop function if exists public.lisatyoluettelo();

create function public.lisatyoluettelo()
returns table (
  id uuid,
  nimi text,
  ryhma text,
  teippaus_min integer,
  maalaus_min integer,
  lisakulutus_g numeric,
  on_jako boolean,
  aktiivinen boolean,
  jarjestys integer,
  hinta_perusvari_eur numeric,
  hinta_erikoisvari_eur numeric,
  osia integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    l.id, l.nimi, l.ryhma, l.teippaus_min, l.maalaus_min, l.lisakulutus_g,
    l.on_jako, l.aktiivinen, l.jarjestys,
    l.hinta_perusvari_eur, l.hinta_erikoisvari_eur,
    (select count(*)::integer from public.osa_lisatyot ol where ol.lisatyo_id = l.id)
  from public.lisatyot l
  order by l.jarjestys, l.nimi;
$$;

comment on function public.lisatyoluettelo() is
  'Katalogi kiinteine hintoineen ja käyttömäärineen.';

revoke execute on function public.lisatyoluettelo() from public, anon;
grant execute on function public.lisatyoluettelo() to authenticated;


-- ---------------------------------------------------------------------
-- 5. Ajasta laskettu hinta pois
--
-- Funktion koko tarkoitus oli juuri se politiikka joka nyt korvataan.
-- Ajat säilyvät, mutta ne eivät enää tuota hintaa missään.
-- ---------------------------------------------------------------------

drop function if exists public.lisatyon_hinta(integer, integer);
