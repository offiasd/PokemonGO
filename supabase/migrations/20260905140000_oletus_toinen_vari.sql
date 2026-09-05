-- Oletuspohjaväri ja oletuslakka monikerrostöille.
--
-- Candy vaatii aina pohjavärin ja illusion aina lakan, ja lakkausta vaativa
-- metallic saman lakan. Käytännössä valinta on joka kerta sama, joten se
-- esitäytetään Uusi työ -lomakkeella. Ehdotus on vain ehdotus: värin voi aina
-- vaihtaa, samoin kuin lakkausvalinnan.
--
-- Väri talletetaan viittauksena eikä nimenä, jottei uudelleennimeäminen riko
-- esitäyttöä. Poistetun värin kohdalla viite nollautuu ja lomake palaa tyhjään
-- valintaan.

alter table public.asetukset
  add column if not exists oletus_pohjavari_id uuid references public.varit(id) on delete set null,
  add column if not exists oletus_lakka_id uuid references public.varit(id) on delete set null;

comment on column public.asetukset.oletus_pohjavari_id is
  'Esitäytetty pohjaväri candy-töille. Null = ei esitäyttöä.';
comment on column public.asetukset.oletus_lakka_id is
  'Esitäytetty lakka illusion-töille ja lakattaville metallicille. Null = ei esitäyttöä.';

-- Alkuarvot nykyisestä käytännöstä. Haetaan nimellä kerran tässä, jotta
-- migraatio ei sisällä kovakoodattuja tunnisteita; jos väriä ei löydy tai
-- asetus on jo asetettu, arvo jätetään rauhaan.
update public.asetukset
set oletus_pohjavari_id = (
  select v.id
  from public.varit v
  join public.vari_kategoriat k on k.vari_id = v.id and k.maali_tyyppi = 'pohjavari'
  where v.aktiivinen and v.nimi ilike 'Super Chrome%'
  order by v.nimi
  limit 1
)
where oletus_pohjavari_id is null;

update public.asetukset
set oletus_lakka_id = (
  select v.id
  from public.varit v
  join public.vari_kategoriat k on k.vari_id = v.id and k.maali_tyyppi = 'transparent'
  where v.aktiivinen and v.nimi ilike 'High Performance%Clear'
  order by v.nimi
  limit 1
)
where oletus_lakka_id is null;
