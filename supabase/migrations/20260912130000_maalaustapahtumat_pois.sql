-- =====================================================================
-- Migraatio: maalaustapahtumat-taulu pois
--
-- Tausta:
--   Taulu oli alkuperäinen tapa kirjata maalaus: yksi rivi per maalauskerta,
--   ja trigger vähensi värin saldoa. Kulutus kulkee nykyään töiden kautta -
--   tyot-taulun valmistuminen kirjaa tyon_rivit-rivien kulutuksen - joten
--   sama asia oli toteutettu kahdesti.
--
--   Taulussa on nolla riviä eikä siihen kirjoiteta mistään: sovelluskoodissa
--   ei ole yhtään lukua tai kirjoitusta, vieraita avaimia siihen ei osoita, ja
--   ainoa kannan riippuvuus on maalinkulutus_raportoituna-näkymän kaksi
--   union-haaraa jotka palauttavat aina tyhjän.
--
--   Käyttämätön trigger joka koskee saldoihin on riski: se ei näy missään
--   ennen kuin joku kirjoittaa tauluun ohi töiden, ja silloin saldo muuttuu
--   ilman että yksikään työ kertoo miksi.
--
-- Järjestys on tarkoituksellinen: trigger ensin, jotta saldot eivät voi
-- muuttua kesken poiston, sitten näkymä irti taulusta, ja taulu vasta
-- viimeisenä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Saldotrigger pois ensin
-- ---------------------------------------------------------------------

drop trigger if exists maalaustapahtuma_saldo_trg on public.maalaustapahtumat;
drop trigger if exists maalaustapahtuma_esitaytto_trg on public.maalaustapahtumat;


-- ---------------------------------------------------------------------
-- 2. Näkymä irti taulusta
--
-- Muutos on kahden union-haaran poisto. Sarakkeet, oikeudet ja muut haarat
-- pysyvät ennallaan, joten create or replace riittää eikä grantteja tarvitse
-- kirjoittaa uusiksi.
-- ---------------------------------------------------------------------

create or replace view public.maalinkulutus_raportoituna with (security_invoker = false) as
with kaytto as (
  select tr.id::text || ':paavari' as id,
         coalesce(t.valmistunut, t.aloitettu) as luotu,
         tr.osa_id, tr.oma_kuvaus, tr.vari_id, tr.kappalemaara,
         coalesce(tr.toteutunut_kulutus_g, tr.arvioitu_kulutus_g) as kulutus_g,
         'paavari' as rooli,
         t.valmistui_id as kayttaja_id
  from public.tyon_rivit tr
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select tr.id::text || ':toinen',
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, tr.toinen_vari_id, tr.kappalemaara,
         coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
         coalesce(tr.toinen_vari_rooli, 'toinen'),
         t.valmistui_id
  from public.tyon_rivit tr
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null
  union all
  select l.id::text || ':lisavari',
         coalesce(t.valmistunut, t.aloitettu),
         tr.osa_id, tr.oma_kuvaus, l.vari_id, tr.kappalemaara,
         coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
         'lisavari',
         t.valmistui_id
  from public.tyon_rivin_lisavarit l
  join public.tyon_rivit tr on tr.id = l.rivi_id
  join public.tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'
  union all
  select ar.id::text || ':paavari',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.vari_id, ar.kappalemaara,
         coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
         'paavari',
         at.valmistui_id
  from public.arkistoidut_tyon_rivit ar
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
  union all
  select ar.id::text || ':toinen',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, ar.toinen_vari_id, ar.kappalemaara,
         coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
         coalesce(ar.toinen_vari_rooli, 'toinen'),
         at.valmistui_id
  from public.arkistoidut_tyon_rivit ar
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null
  union all
  select al.id::text || ':lisavari',
         coalesce(at.valmistunut, at.aloitettu),
         ar.osa_id, ar.oma_kuvaus, al.vari_id, ar.kappalemaara,
         coalesce(al.toteutunut_kulutus_g, al.arvioitu_kulutus_g),
         'lisavari',
         at.valmistui_id
  from public.arkistoidut_rivin_lisavarit al
  join public.arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  join public.arkistoidut_tyot at on at.id = ar.tyo_id
)
select
  k.id,
  k.luotu,
  date_trunc('day', k.luotu) as paiva,
  date_trunc('week', k.luotu) as viikko,
  date_trunc('month', k.luotu) as kuukausi,
  date_trunc('year', k.luotu) as vuosi,
  k.osa_id,
  coalesce(o.nimi, k.oma_kuvaus) as osa_nimi,
  k.vari_id,
  v.nimi as vari_nimi,
  k.rooli,
  k.kappalemaara,
  k.kulutus_g as toteutunut_kulutus_g,
  k.kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  case when public.is_admin()
       then round(k.kulutus_g / 1000.0 * public.vari_kokonaishinta(k.vari_id), 2)
  end as maalikustannus_eur,
  k.kayttaja_id
from kaytto k
left join public.osat o on o.id = k.osa_id
join public.varit v on v.id = k.vari_id
-- Kuten varit_nakyma: omistajan oikeuksin ajettu näkymä ei peri RLS:ää.
where auth.role() in ('authenticated', 'service_role');

comment on view public.maalinkulutus_raportoituna is
  'Maalinkulutus raporteille töistä ja arkistosta. Kustannussarake vain adminille.';


-- ---------------------------------------------------------------------
-- 3. Taulu ja sen triggerifunktiot
-- ---------------------------------------------------------------------

drop table if exists public.maalaustapahtumat;

drop function if exists public.maalaustapahtuma_paivita_saldo();
drop function if exists public.maalaustapahtuma_esitaytto();
