-- Raporttien "Kulutus jaksoittain" jäi tyhjäksi.
--
-- Raportti luki maalaustapahtumat_raportoituna-näkymää, joka katsoo vain
-- maalaustapahtumat-taulua. Kulutus kirjautuu nykyisin töiden kautta (työ
-- valmistuu -> tyo_valmistuu_paivita_saldo vähentää saldon), eikä
-- maalaustapahtumat-tauluun kirjoiteta enää mitään: se on tyhjä, joten
-- jaksoraportti näytti aina "Ei tapahtumia" ja yhteissummana 0 kg. Kuukauden
-- käytetyin väri oli jo aiemmin korjattu lukemaan myös töitä, mutta tämä
-- näkymä jäi päivittämättä.
--
-- Uusi näkymä lukee valmiiden töiden rivit ja säilyttää vanhat
-- maalaustapahtumat mukana, jos niitä joskus on kirjattu.
--
-- Yksi rivi per käytetty väri, ei per työn rivi: pohjaväri ja lakka ovat yhtä
-- lailla kulutettua maalia, ja omina riveinään ne osuvat myös värisuodattimeen
-- ja summautuvat kiloihin oikein. Vanhassa näkymässä toisen värin kulutus
-- laskettiin euroihin mutta ei kiloihin, joten kilomäärä oli alakanttiin.

create view maalinkulutus_raportoituna as
with kaytto as (
  -- Valmiin työn pääväri.
  select
    tr.id::text || ':paavari' as id,
    coalesce(t.valmistunut, t.aloitettu) as luotu,
    tr.osa_id,
    tr.vari_id,
    tr.kappalemaara,
    coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g) as kulutus_g,
    'paavari'::text as rooli,
    t.valmistui_id as kayttaja_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'

  union all
  -- Valmiin työn pohjaväri tai lakka.
  select
    tr.id::text || ':toinen',
    coalesce(t.valmistunut, t.aloitettu),
    tr.osa_id,
    tr.toinen_vari_id,
    tr.kappalemaara,
    coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
    coalesce(tr.toinen_vari_rooli, 'toinen'),
    t.valmistui_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null

  union all
  -- Vanhat maalaustapahtumat: taulu on tyhjä, mutta jos rivejä on, ne eivät saa
  -- kadota raportilta.
  select
    m.id::text || ':paavari',
    m.luotu,
    m.osa_id,
    m.vari_id,
    m.kappalemaara,
    m.toteutunut_kulutus_g,
    'paavari',
    m.kayttaja_id
  from maalaustapahtumat m

  union all
  select
    m.id::text || ':toinen',
    m.luotu,
    m.osa_id,
    m.toinen_vari_id,
    m.kappalemaara,
    coalesce(m.toinen_toteutunut_kulutus_g, 0),
    coalesce(m.toinen_vari_rooli, 'toinen'),
    m.kayttaja_id
  from maalaustapahtumat m
  where m.toinen_vari_id is not null
)
select
  k.id,
  k.luotu,
  date_trunc('day', k.luotu) as paiva,
  date_trunc('week', k.luotu) as viikko,
  date_trunc('month', k.luotu) as kuukausi,
  date_trunc('year', k.luotu) as vuosi,
  k.osa_id,
  o.nimi as osa_nimi,
  k.vari_id,
  v.nimi as vari_nimi,
  k.rooli,
  k.kappalemaara,
  k.kulutus_g as toteutunut_kulutus_g,
  k.kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  round(k.kulutus_g / 1000.0 * vari_kokonaishinta(k.vari_id), 2) as maalikustannus_eur,
  k.kayttaja_id
from kaytto k
join osat o on o.id = k.osa_id
join varit v on v.id = k.vari_id;

comment on view maalinkulutus_raportoituna is
  'Maalin kulutus raportointia varten: yksi rivi per käytetty väri valmiissa työssä (pääväri, pohjaväri, lakka) sekä vanhat maalaustapahtumat. Korvaa maalaustapahtumat_raportoituna-näkymän.';

alter view maalinkulutus_raportoituna set (security_invoker = true);
grant select on maalinkulutus_raportoituna to authenticated;

-- Vanha näkymä pois: se näytti aina tyhjää eikä sillä ole enää käyttäjiä.
drop view maalaustapahtumat_raportoituna;
