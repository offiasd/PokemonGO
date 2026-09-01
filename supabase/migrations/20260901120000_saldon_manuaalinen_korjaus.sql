-- Saldon manuaalinen korjaus (inventaario-oikaisu) värin sivulta.
--
-- Korjaus kirjataan samaan varastotayennykset-tauluun kuin täydennys, jotta
-- saldon muutoksista jää yksi yhtenäinen historia eikä saldoa kirjoiteta
-- suoraan yli. Näin varit.saldo_g pysyy tapahtumien summana ja olemassa oleva
-- varastotayennys_saldo_trg hoitaa päivityksen.
--
-- Korjaus voi olla negatiivinen (hyllyssä on vähemmän kuin kirjanpidossa),
-- joten positiivisuusehto korvataan nollasta poikkeavuudella. Nolla ei ole
-- sallittu, koska se ei muuta mitään.

alter table varastotayennykset
  drop constraint varastotayennykset_maara_g_check;

alter table varastotayennykset
  add constraint varastotayennykset_maara_g_check check (maara_g <> 0);

alter table varastotayennykset
  add column tyyppi text not null default 'taydennys'
  constraint varastotayennykset_tyyppi_check check (tyyppi in ('taydennys', 'korjaus'));

comment on table varastotayennykset is
  'Varastosaldon muutokset: täydennykset ja manuaaliset korjaukset. Muuttavat värin saldoa triggerillä.';

comment on column varastotayennykset.tyyppi is
  'taydennys = varastoon lisätty erä; korjaus = manuaalinen saldon oikaisu, joka voi olla negatiivinen.';

-- Värin sivu hakee viimeisimmät muutokset yhdelle värille.
create index if not exists varastotayennykset_vari_luotu_idx
  on varastotayennykset (vari_id, luotu desc);
