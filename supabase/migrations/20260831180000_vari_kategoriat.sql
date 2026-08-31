-- Värille voi kuulua useampi kategoria (esim. kromiväri on sekä Metallic
-- että Pohjavärit - käytetään sellaisenaan ja candy-pohjana). varit.tyyppi
-- pysyy ensisijaisena/oletuskategoriana (ohjaa mm. vaatii_pohjavarin-
-- päättelyä ja "Hae tiedot" -automatiikkaa) - tämä taulu laajentaa sitä
-- lisäkategorioilla, joita käytetään Työt-sivun värivalintojen suodatukseen.

create table vari_kategoriat (
  id uuid primary key default gen_random_uuid(),
  vari_id uuid not null references varit(id) on delete cascade,
  maali_tyyppi text not null
    check (maali_tyyppi in ('solid', 'transparent', 'candy', 'illusion', 'metallic', 'pohjavari', 'muu')),
  unique (vari_id, maali_tyyppi)
);

comment on table vari_kategoriat is 'Värin kaikki kategoriat (ensisijainen varit.tyyppi + valinnaiset lisäkategoriat). Käytetään Työt-sivun värivalintojen suodatukseen.';

create index vari_kategoriat_vari_idx on vari_kategoriat (vari_id);
create index vari_kategoriat_tyyppi_idx on vari_kategoriat (maali_tyyppi);

alter table vari_kategoriat enable row level security;

create policy "Kirjautuneet lukevat värikategoriat" on vari_kategoriat
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi värikategorioita" on vari_kategoriat
  for all using (public.is_admin()) with check (public.is_admin());

-- Backfill: jokaiselle olemassa olevalle värille sen nykyinen ensisijainen tyyppi.
insert into vari_kategoriat (vari_id, maali_tyyppi)
select id, tyyppi from varit
on conflict (vari_id, maali_tyyppi) do nothing;
