-- Ajoneuvotyypit omaksi taulukseen, jotta admin voi hallita niitä itse.
--
-- Tyypit olivat kiinteä check-ehto ja koodissa oleva lista, joten uuden
-- tyypin lisääminen vaati muutoksen ja julkaisun. Nyt ne ovat rivejä, joita
-- admin muokkaa Asetukset-sivulla.
--
-- Avain säilyy tekstinä (osat.ajoneuvotyyppi ei muutu), koska sitä käytetään
-- osalistan suodattimen osoiteparametrina. Näin vanhat linkit toimivat ja
-- migraatio jää pieneksi. Nimi on erikseen, joten tyypin voi nimetä uudelleen
-- ilman että osien viittaukset muuttuvat.

create table ajoneuvotyypit (
  avain text primary key check (avain ~ '^[a-z0-9_]{1,40}$'),
  nimi text not null check (btrim(nimi) <> ''),
  jarjestys integer not null default 0
);

insert into ajoneuvotyypit (avain, nimi, jarjestys) values
  ('auto', 'Auto', 1),
  ('mopo', 'Mopo', 2),
  ('moottoripyora', 'Moottoripyörä', 3);

-- Check-ehto tilalle viite-eheys: tuntematonta tyyppiä ei voi tallentaa, mutta
-- sallitut arvot ovat nyt dataa eivätkä skeemaa.
alter table osat drop constraint osat_ajoneuvotyyppi_check;
alter table osat
  add constraint osat_ajoneuvotyyppi_fkey
  foreign key (ajoneuvotyyppi) references ajoneuvotyypit(avain) on update cascade;

comment on table ajoneuvotyypit is
  'Osille valittavat ajoneuvotyypit. Adminin hallinnoima lista; avain on osoiteparametri ja osien viittaus, nimi näytetään käyttöliittymässä.';

alter table ajoneuvotyypit enable row level security;

create policy "Kirjautuneet lukevat ajoneuvotyypit" on ajoneuvotyypit
  for select using (auth.role() = 'authenticated');
create policy "Admin hallinnoi ajoneuvotyyppejä" on ajoneuvotyypit
  for all using (public.is_admin()) with check (public.is_admin());
