-- "Muu" työrivi: maalattava kohde, jota ei ole osaluettelossa.
--
-- Maalaamoon tulee kertaluontoisia kappaleita - oma venekoppa, yksittäinen
-- kaide - joita ei kannata perustaa osaksi, koska osa on hinnasto ja
-- kustannusmalli eikä muistilista. Tällaiselle riville kirjoitetaan vapaa
-- kuvaus, ja se elää vain työn rivillä. Osaluetteloon ei synny mitään.
--
-- Rivillä on siis joko osa tai kuvaus, ei koskaan molempia eikä kumpaakaan.

alter table tyon_rivit
  alter column osa_id drop not null,
  add column oma_kuvaus text;

alter table tyon_rivit
  add constraint tyon_rivit_osa_tai_oma_kuvaus check (
    (osa_id is not null) <> (oma_kuvaus is not null)
    and (oma_kuvaus is null or btrim(oma_kuvaus) <> '')
  );

comment on column tyon_rivit.oma_kuvaus is
  'Osaluettelon ulkopuolisen kohteen kuvaus, esim. "oma venekoppa". Asetettuna osa_id on null.';

alter table arkistoidut_tyon_rivit
  alter column osa_id drop not null,
  add column oma_kuvaus text;

alter table arkistoidut_tyon_rivit
  add constraint arkistoidut_tyon_rivit_osa_tai_oma_kuvaus check (
    (osa_id is not null) <> (oma_kuvaus is not null)
    and (oma_kuvaus is null or btrim(oma_kuvaus) <> '')
  );

-- ---------------------------------------------------------------------------
-- Rivien kirjoitus
-- ---------------------------------------------------------------------------
create or replace function public.korvaa_tyon_rivit(p_tyo_id uuid, p_rivit jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tyo tyot%rowtype;
  v_rivi jsonb;
  v_rivi_id uuid;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila = 'valmis' then
    raise exception 'Valmiin työn rivejä ei voi muokata.';
  end if;
  if not (public.is_admin() or (v_tyo.tila = 'vaiheessa' and v_tyo.aloitti_id = auth.uid())) then
    raise exception 'Työ on toisen tekijän hallussa.';
  end if;
  if p_rivit is null or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Työssä pitää olla vähintään yksi osa.';
  end if;

  delete from tyon_rivit where tyo_id = p_tyo_id;

  for v_rivi in select * from jsonb_array_elements(p_rivit) loop
    insert into tyon_rivit (
      tyo_id, osa_id, oma_kuvaus, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
      toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g, kommentti, custom
    )
    values (
      p_tyo_id,
      nullif(v_rivi->>'osa_id', '')::uuid,
      nullif(btrim(coalesce(v_rivi->>'oma_kuvaus', '')), ''),
      (v_rivi->>'vari_id')::uuid,
      coalesce((v_rivi->>'kappalemaara')::integer, 1),
      (v_rivi->>'arvioitu_kulutus_g')::numeric,
      (v_rivi->>'yksikkohinta_eur')::numeric,
      nullif(v_rivi->>'toinen_vari_id', '')::uuid,
      nullif(v_rivi->>'toinen_vari_rooli', ''),
      nullif(v_rivi->>'toinen_arvioitu_kulutus_g', '')::numeric,
      nullif(btrim(coalesce(v_rivi->>'kommentti', '')), ''),
      coalesce((v_rivi->>'custom')::boolean, false)
    )
    returning id into v_rivi_id;

    insert into tyon_rivin_lisavarit (rivi_id, vari_id, arvioitu_kulutus_g, jarjestys)
    select
      v_rivi_id,
      (lisa->>'vari_id')::uuid,
      (lisa->>'arvioitu_kulutus_g')::numeric,
      (lisa_nro - 1)::integer
    from jsonb_array_elements(coalesce(v_rivi->'lisavarit', '[]'::jsonb))
      with ordinality as t(lisa, lisa_nro);
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Arkistointi
-- ---------------------------------------------------------------------------
create or replace function public.arkistoi_tyo(p_tyo_id uuid, p_automaattinen boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tyo tyot%rowtype;
begin
  select * into v_tyo from tyot where id = p_tyo_id for update;

  if v_tyo.id is null then
    raise exception 'Työtä ei löytynyt.';
  end if;
  if v_tyo.tila <> 'valmis' then
    raise exception 'Vain valmiin työn voi arkistoida.';
  end if;

  insert into arkistoidut_tyot (
    id, asiakas, aloitti_id, aloitettu, valmistui_id, valmistunut, alennus_prosentti,
    arkistoi_id, automaattinen
  )
  values (
    v_tyo.id, v_tyo.asiakas, v_tyo.aloitti_id, v_tyo.aloitettu, v_tyo.valmistui_id,
    v_tyo.valmistunut, v_tyo.alennus_prosentti,
    case when p_automaattinen then null else auth.uid() end,
    p_automaattinen
  );

  insert into arkistoidut_tyon_rivit (
    id, tyo_id, osa_id, oma_kuvaus, vari_id, kappalemaara, arvioitu_kulutus_g, yksikkohinta_eur,
    toteutunut_kulutus_g, toinen_vari_id, toinen_vari_rooli, toinen_arvioitu_kulutus_g,
    toinen_toteutunut_kulutus_g, kommentti, custom
  )
  select
    r.id, r.tyo_id, r.osa_id, r.oma_kuvaus, r.vari_id, r.kappalemaara, r.arvioitu_kulutus_g,
    r.yksikkohinta_eur, r.toteutunut_kulutus_g, r.toinen_vari_id, r.toinen_vari_rooli,
    r.toinen_arvioitu_kulutus_g, r.toinen_toteutunut_kulutus_g, r.kommentti, r.custom
  from tyon_rivit r
  where r.tyo_id = p_tyo_id;

  insert into arkistoidut_rivin_lisavarit (
    id, rivi_id, vari_id, arvioitu_kulutus_g, toteutunut_kulutus_g, jarjestys
  )
  select l.id, l.rivi_id, l.vari_id, l.arvioitu_kulutus_g, l.toteutunut_kulutus_g, l.jarjestys
  from tyon_rivin_lisavarit l
  join tyon_rivit r on r.id = l.rivi_id
  where r.tyo_id = p_tyo_id;

  delete from tyot where id = p_tyo_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Kulutusraportti
-- ---------------------------------------------------------------------------
-- Osa haetaan nyt left joinilla: sisäjoin pudottaisi "Muu"-rivin raportilta
-- kokonaan, jolloin maalia olisi kulunut varastosta mutta kulutus ei näkyisi
-- missään. Rivin nimenä on osan nimi tai, sen puuttuessa, oma kuvaus.
create or replace view public.maalinkulutus_raportoituna as
with kaytto as (
  -- Valmiin työn pääväri.
  select
    tr.id::text || ':paavari' as id,
    coalesce(t.valmistunut, t.aloitettu) as luotu,
    tr.osa_id,
    tr.oma_kuvaus,
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
    tr.oma_kuvaus,
    tr.toinen_vari_id,
    tr.kappalemaara,
    coalesce(tr.toinen_toteutunut_kulutus_g, tr.toinen_arvioitu_kulutus_g, 0),
    coalesce(tr.toinen_vari_rooli, 'toinen'),
    t.valmistui_id
  from tyon_rivit tr
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis' and tr.toinen_vari_id is not null

  union all
  -- Custom-työn kolmas ja sitä seuraavat värit.
  select
    l.id::text || ':lisavari',
    coalesce(t.valmistunut, t.aloitettu),
    tr.osa_id,
    tr.oma_kuvaus,
    l.vari_id,
    tr.kappalemaara,
    coalesce(l.toteutunut_kulutus_g, l.arvioitu_kulutus_g),
    'lisavari',
    t.valmistui_id
  from tyon_rivin_lisavarit l
  join tyon_rivit tr on tr.id = l.rivi_id
  join tyot t on t.id = tr.tyo_id
  where t.tila = 'valmis'

  union all
  -- Arkistoidun työn pääväri. Rivit säilyttävät alkuperäiset id:nsä, joten
  -- raporttirivin tunniste ei muutu arkistoinnissa.
  select
    ar.id::text || ':paavari',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    ar.oma_kuvaus,
    ar.vari_id,
    ar.kappalemaara,
    coalesce(ar.toteutunut_kulutus_g, ar.arvioitu_kulutus_g),
    'paavari',
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id

  union all
  -- Arkistoidun työn pohjaväri tai lakka.
  select
    ar.id::text || ':toinen',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    ar.oma_kuvaus,
    ar.toinen_vari_id,
    ar.kappalemaara,
    coalesce(ar.toinen_toteutunut_kulutus_g, ar.toinen_arvioitu_kulutus_g, 0),
    coalesce(ar.toinen_vari_rooli, 'toinen'),
    at.valmistui_id
  from arkistoidut_tyon_rivit ar
  join arkistoidut_tyot at on at.id = ar.tyo_id
  where ar.toinen_vari_id is not null

  union all
  -- Arkistoidun custom-työn lisävärit.
  select
    al.id::text || ':lisavari',
    coalesce(at.valmistunut, at.aloitettu),
    ar.osa_id,
    ar.oma_kuvaus,
    al.vari_id,
    ar.kappalemaara,
    coalesce(al.toteutunut_kulutus_g, al.arvioitu_kulutus_g),
    'lisavari',
    at.valmistui_id
  from arkistoidut_rivin_lisavarit al
  join arkistoidut_tyon_rivit ar on ar.id = al.rivi_id
  join arkistoidut_tyot at on at.id = ar.tyo_id

  union all
  -- Vanhat maalaustapahtumat: taulu on tyhjä, mutta jos rivejä on, ne eivät saa
  -- kadota raportilta.
  select
    m.id::text || ':paavari',
    m.luotu,
    m.osa_id,
    null::text,
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
    null::text,
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
  coalesce(o.nimi, k.oma_kuvaus) as osa_nimi,
  k.vari_id,
  v.nimi as vari_nimi,
  k.rooli,
  k.kappalemaara,
  k.kulutus_g as toteutunut_kulutus_g,
  k.kulutus_g / 1000.0 as toteutunut_kulutus_kg,
  round(k.kulutus_g / 1000.0 * vari_kokonaishinta(k.vari_id), 2) as maalikustannus_eur,
  k.kayttaja_id
from kaytto k
left join osat o on o.id = k.osa_id
join varit v on v.id = k.vari_id;

alter view public.maalinkulutus_raportoituna set (security_invoker = true);
grant select on public.maalinkulutus_raportoituna to authenticated;
