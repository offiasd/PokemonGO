-- Yhdistetty haku korjattu: viittasi poistettuihin sarakkeisiin.
--
-- haku() luki osilta merkki- ja malli-sarakkeita, jotka korvattiin vapaalla
-- lisatiedot-kentällä ja poistettiin migraatiossa 20260902170000. Funktiota ei
-- päivitetty samalla, joten jokainen kutsu kaatui virheeseen
-- "column o.merkki does not exist". Sovellus ei kutsu funktiota (Värit- ja
-- Osat-sivut tekevät omat ilike-kyselynsä), joten vika ei näkynyt käyttäjälle -
-- mutta funktio olisi ollut rikki sinä päivänä kun sitä käytetään.
--
-- Samalla mukaan tulevat molempien hakusanat-kentät. Ne ovat olemassa juuri
-- löytämistä varten: osan synonyymit (20260902220000) ja värin alkuperäinen
-- tuoteotsikko (20260905160000), josta nimeksi jää usein pelkkä RAL-koodi.
-- Hakusanat eivät näy alaotsikossa - ne ovat hakuavaimia, eivät esitettävää
-- tietoa.

create or replace function public.haku(p_kysely text, p_raja integer default 25)
returns table (
  tyyppi text,
  id uuid,
  otsikko text,
  alaotsikko text,
  osuvuus real
)
language sql
stable
set search_path = public
as $$
  select * from (
    select
      'vari'::text as tyyppi,
      v.id,
      v.nimi as otsikko,
      coalesce(v.valmistaja, '') as alaotsikko,
      greatest(
        similarity(v.nimi, p_kysely),
        similarity(coalesce(v.valmistaja, ''), p_kysely),
        similarity(coalesce(v.hakusanat, ''), p_kysely)
      ) as osuvuus
    from varit v
    where v.aktiivinen
      and (v.nimi ilike '%' || p_kysely || '%'
        or coalesce(v.valmistaja, '') ilike '%' || p_kysely || '%'
        or coalesce(v.hakusanat, '') ilike '%' || p_kysely || '%'
        or v.nimi % p_kysely
        or coalesce(v.valmistaja, '') % p_kysely
        or coalesce(v.hakusanat, '') % p_kysely)

    union all

    select
      'osa'::text as tyyppi,
      o.id,
      o.nimi as otsikko,
      coalesce(o.lisatiedot, '') as alaotsikko,
      greatest(
        similarity(o.nimi, p_kysely),
        similarity(coalesce(o.lisatiedot, ''), p_kysely),
        similarity(coalesce(o.hakusanat, ''), p_kysely)
      ) as osuvuus
    from osat o
    where o.aktiivinen
      and (o.nimi ilike '%' || p_kysely || '%'
        or coalesce(o.lisatiedot, '') ilike '%' || p_kysely || '%'
        or coalesce(o.hakusanat, '') ilike '%' || p_kysely || '%'
        or o.nimi % p_kysely
        or coalesce(o.lisatiedot, '') % p_kysely
        or coalesce(o.hakusanat, '') % p_kysely)
  ) tulokset
  order by osuvuus desc nulls last
  limit p_raja;
$$;

-- create or replace säilyttää oikeudet, mutta varmistetaan silti: anon ei saa
-- hakea, kirjautunut saa.
revoke execute on function public.haku(text, integer) from anon;
grant execute on function public.haku(text, integer) to authenticated;
