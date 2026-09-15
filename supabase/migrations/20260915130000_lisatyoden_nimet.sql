-- =====================================================================
-- Migraatio: lisätöiden nimet ilman aikoja
--
-- Työlistalla rivin hinta sisältää lisätyöt, joten niiden on näyttävä
-- erittelynä - muuten hinnalle ei ole näkyvää perustetta. Nimet eivät
-- kuitenkaan saa tulla katalogitaulusta: sen lukuoikeus on adminilla,
-- koska rivillä ovat myös minuutit, ja minuutit yhdessä hinnan kanssa
-- paljastaisivat tuntiveloituksen.
--
-- Tämä funktio palauttaa pelkän nimen ja ryhmän, myös käytöstä
-- poistetuista lisätöistä: vanhan työn rivi viittaa niihin yhä.
-- =====================================================================

create or replace function public.lisatoiden_nimet()
returns table (id uuid, nimi text, ryhma text, on_jako boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select l.id, l.nimi, l.ryhma, l.on_jako
  from public.lisatyot l
  order by l.jarjestys, l.nimi;
$$;

comment on function public.lisatoiden_nimet() is
  'Lisätöiden nimet erittelyä varten. Ei aikoja eikä hintoja, joten kelpaa myös maalaajalle.';

revoke execute on function public.lisatoiden_nimet() from public, anon;
grant execute on function public.lisatoiden_nimet() to authenticated;
