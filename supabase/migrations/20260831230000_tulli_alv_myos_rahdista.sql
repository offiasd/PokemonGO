-- Tulli ja maahantuonnin ALV lasketaan myös kuljetuskustannuksista, ei pelkästä
-- tavaran hinnasta: tullausarvoon kuuluu rahti EU:n rajalle, ja ALV lasketaan
-- tullausarvon ja tullin summasta.
--
-- Vanha kaava lisäsi toimituskulun vasta verojen jälkeen:
--   ostohinta * (1 + tulli) * (1 + alv) + toimituskulu
-- Uusi kaava verottaa myös rahdin:
--   (ostohinta + toimituskulu) * (1 + tulli) * (1 + alv)
--
-- EU-tuonnissa ei ole tullia eikä maahantuonnin ALV:tä, joten se säilyy
-- ennallaan: ostohinta + toimituskulu.

create or replace function public.vari_kokonaishinta_per_kg(
  p_alkupera text,
  p_ostohinta numeric,
  p_tullimaksu_prosentti numeric,
  p_alv_prosentti numeric,
  p_toimituskulu numeric
)
returns numeric
language sql
stable
as $$
  select case
    when p_alkupera = 'EU' then
      round(coalesce(p_ostohinta, 0) + coalesce(p_toimituskulu, 0), 2)
    else
      round(
        (coalesce(p_ostohinta, 0) + coalesce(p_toimituskulu, 0))
          * (1 + coalesce(p_tullimaksu_prosentti, 0) / 100.0)
          * (1 + coalesce(p_alv_prosentti, 0) / 100.0),
        2
      )
  end;
$$;

comment on function public.vari_kokonaishinta_per_kg(text, numeric, numeric, numeric, numeric) is 'Värin kokonaishinta €/kg. EU: ostohinta + toimituskulu. Muut: (ostohinta + toimituskulu) * tulli * ALV - tulli ja ALV lasketaan myös rahdista, koska rahti kuuluu tullausarvoon.';
