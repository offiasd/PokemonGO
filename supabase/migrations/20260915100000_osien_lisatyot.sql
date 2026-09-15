-- =====================================================================
-- Migraatio: lisätyöt työn lomakkeelle
--
-- Kaksi korjausta edelliseen migraatioon.
--
-- 1. Työn lomake tarvitsee kaikkien osien lisätyöt yhdellä kertaa. Ilman
--    tätä funktiota lomake joutuisi kutsumaan osan_lisatyot-funktiota
--    kerran jokaiselle osalle, ja periytymissääntö - osan arvo jos on,
--    muuten katalogin - päätyisi toiseen paikkaan asiakkaalle.
--
-- 2. Edellisen migraation oikeudet jäivät vajaiksi kahdella tavalla.
--
--    vaiheen_tuntiveloitus jäi authenticated-roolin kutsuttavaksi. Se on
--    security definer, joten maalaaja olisi saanut siitä teippauksen ja
--    maalauksen tuntihinnan suoraan - tuntiveloitukset ovat taloustietoa
--    eivätkä kuulu maalaajalle. Sisäiset kutsujat (osa_tyokustannus,
--    lisatyon_hinta) ovat itse security definer ja ajavat omistajan
--    oikeuksin, joten oikeuden poisto ei katkaise niitä.
--
--    Lisäksi pelkkä "revoke ... from anon" ei riittänyt: Postgres antaa
--    uudelle funktiolle execute-oikeuden PUBLIC-roolille, ja anon perii
--    sen. Tarkistettu kannasta: proacl-sarakkeessa oli rivi "=X/postgres".
--    Oikeus on siis poistettava myös PUBLIC-roolilta, muuten funktio on
--    kirjautumattoman kutsuttavissa PostgRESTin kautta.
-- =====================================================================


revoke execute on function public.vaiheen_tuntiveloitus(text) from public, anon, authenticated;

-- Loput edellisen migraation funktiot: PUBLIC pois, authenticated jää.
revoke execute on function public.lisatyon_hinta(integer, integer) from public;
revoke execute on function public.osan_lisatyot(uuid) from public;
revoke execute on function public.lisatyoluettelo() from public;

comment on function public.vaiheen_tuntiveloitus(text) is
  'Työvaiheen tuntiveloitus: vaiheen oma hinta, muuten asetusten yleinen tuntihinta. Vain muiden funktioiden sisäiseen käyttöön - tuntihinta on taloustietoa.';


-- ---------------------------------------------------------------------
-- Kaikkien osien valitut lisätyöt yhdessä kutsussa
--
-- Palauttaa vain rastitut rivit: työn lomakkeella näytetään vain tälle
-- osalle määritellyt lisätyöt, ei valikkoa jossa on kaikki mahdolliset.
--
-- Hinta tulee lisatyon_hinta-funktiosta eikä lomakkeen laskennasta.
-- hinta_eur on asiakashinta, jonka maalaajakin saa nähdä; ajat ja
-- tuntiveloitus eivät tule mukaan.
-- ---------------------------------------------------------------------

create or replace function public.osien_lisatyot()
returns table (
  osa_id uuid,
  lisatyo_id uuid,
  nimi text,
  ryhma text,
  on_jako boolean,
  jarjestys integer,
  lisakulutus_g numeric,
  hinta_eur numeric
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
    public.lisatyon_hinta(
      coalesce(ol.teippaus_min, l.teippaus_min),
      coalesce(ol.maalaus_min, l.maalaus_min)
    )
  from public.osa_lisatyot ol
  join public.lisatyot l on l.id = ol.lisatyo_id
  where l.aktiivinen
  order by ol.osa_id, l.jarjestys, l.nimi;
$$;

comment on function public.osien_lisatyot() is
  'Kaikkien osien rastitut lisätyöt voimassa olevine arvoineen työn lomaketta varten.';

revoke execute on function public.osien_lisatyot() from public, anon;
grant execute on function public.osien_lisatyot() to authenticated;
