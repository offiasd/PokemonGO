-- Maalinkulutus vaihtelee maalityypin mukaan (esim. candy kuluttaa eri
-- verran kuin solid), joten yksittäinen osat.arvioitu_kulutus_g korvataan
-- kategoriakohtaisilla kulutusarvioilla osa_kategoriahinnat-taulussa.

alter table osat alter column arvioitu_kulutus_g drop not null;

comment on column osat.arvioitu_kulutus_g is 'Vanhentunut - korvattu osa_kategoriahinnat.arvioitu_kulutus_g:llä. Säilytetty taaksepäinyhteensopivuuden vuoksi (osa_maalikustannus-funktio).';

alter table osat
  add column lakkaus_kulutus_g numeric(12, 2);

comment on column osat.lakkaus_kulutus_g is 'Valinnaisen lakkauksen (solid-värin päälle) arvioitu maalinkulutus grammoina per kappale.';

alter table osa_kategoriahinnat
  add column arvioitu_kulutus_g numeric(12, 2) not null default 0,
  add column toinen_arvioitu_kulutus_g numeric(12, 2);

comment on column osa_kategoriahinnat.arvioitu_kulutus_g is 'Arvioitu maalinkulutus grammoina per kappale tälle kategorialle - eri kategorioilla eri kulutus.';
comment on column osa_kategoriahinnat.toinen_arvioitu_kulutus_g is 'Toisen värin (pohjaväri candylle, lakka illusionille) arvioitu kulutus grammoina per kappale.';

-- Vanha kate-pohjainen kustannuslaskenta toimii jatkossakin turvallisesti,
-- vaikka arvioitu_kulutus_g olisi null (uudet osat eivät välttämättä enää
-- täytä sitä - kategoriakohtaiset arviot ovat operatiivinen lähde Työt-sivulla).
create or replace function public.osa_maalikustannus(p_osa_id uuid, p_vari_id uuid)
returns numeric
language sql
stable
as $$
  select case when p_vari_id is null then 0 else
    round((coalesce(o.arvioitu_kulutus_g, 0) / 1000.0) * public.vari_kokonaishinta(p_vari_id), 2)
  end
  from osat o
  where o.id = p_osa_id;
$$;
