-- =====================================================================
-- Migraatio: maalikuitti ehdottaa varastotäydennystä
--
-- Periaate: ehdotus, ei automaatti. Kuitilla lukee tuotenimi ja kannassa
-- on väri; niiden yhdistäminen on arvausta. Väärä osuma päätyisi suoraan
-- varastosaldoihin ja kilohintoihin, ja väärä kilohinta vääristäisi
-- kaikkien tulevien töiden katteen. Kuitti siis ehdottaa erää, jonka
-- admin käy läpi ja hyväksyy.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Toimittajarekisteri
--
-- Sama toimittaja tulee nimillä NIC INDUSTRIES, Prismatic Powders ja
-- PRISMATIC POWDERS LLC. Ilman normalisointia ne ovat kolme eri
-- toimittajaa - ja samalla kolme eri kaksoiskappaletarkistusta.
-- ---------------------------------------------------------------------

create table if not exists public.toimittajat (
  id uuid primary key default gen_random_uuid(),
  nimi text not null,
  -- Muut kirjoitusasut joilla sama toimittaja esiintyy kuiteilla.
  aliakset text[] not null default '{}',
  alkupera text,
  on_maalitoimittaja boolean not null default false,
  oletus_valuutta text,
  aktiivinen boolean not null default true,
  luotu timestamptz not null default now()
);

comment on table public.toimittajat is
  'Toimittajat ja niiden kirjoitusasut. Kuitin oma toimittaja-teksti jää sellaisenaan - tämä kertoo ketä se tarkoittaa.';
comment on column public.toimittajat.aliakset is
  'Muut nimet joilla sama toimittaja esiintyy kuiteilla. Täsmäytys tehdään normalisoituna.';
comment on column public.toimittajat.on_maalitoimittaja is
  'Tältä toimittajalta tuleva kuitti ehdottaa varastotäydennystä.';

create index if not exists toimittajat_maali_idx on public.toimittajat (on_maalitoimittaja)
  where aktiivinen;

alter table public.toimittajat enable row level security;

drop policy if exists "Kirjautuneet lukevat toimittajia" on public.toimittajat;
create policy "Kirjautuneet lukevat toimittajia" on public.toimittajat
  for select using (auth.role() = 'authenticated');
drop policy if exists "Admin hallinnoi toimittajia" on public.toimittajat;
create policy "Admin hallinnoi toimittajia" on public.toimittajat
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.toimittajat from anon;

-- "Prismatic Powders LLC" ja "PRISMATIC POWDERS, LLC." ovat sama nimi.
-- Sama menetelmä kuin tositenumeron normalisoinnissa: vertailu tehdään
-- muodosta josta välimerkit ja kirjainkoko on poistettu.
create or replace function public.normalisoi_toimittaja(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;

comment on function public.normalisoi_toimittaja(text) is
  'Toimittajan nimi vertailumuotoon: pienet kirjaimet, välimerkit pois.';

create or replace function public.etsi_toimittaja(p_nimi text)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select t.id
  from public.toimittajat t
  where t.aktiivinen
    and (
      public.normalisoi_toimittaja(t.nimi) = public.normalisoi_toimittaja(p_nimi)
      or exists (
        select 1 from unnest(t.aliakset) a
        where public.normalisoi_toimittaja(a) = public.normalisoi_toimittaja(p_nimi)
      )
    )
  limit 1;
$$;

comment on function public.etsi_toimittaja(text) is
  'Toimittaja nimen tai aliaksen perusteella. Null jos tuntematon.';

-- Tunnetut maalitoimittajat. Nämä ovat yrityksen omat, eivät yleinen
-- rekisteri: Prismatic tulee laskuilla emoyhtiönsä nimellä.
insert into public.toimittajat (nimi, aliakset, alkupera, on_maalitoimittaja, oletus_valuutta)
select * from (values
  ('Prismatic Powders',
   array['NIC INDUSTRIES', 'PRISMATIC POWDERS LLC', 'Prismatic', 'NIC Industries Inc'],
   'USA', true, 'USD'),
  ('Pulverkönig',
   array['Pulverkoenig', 'Pulverkonig', 'Pulverkönig GmbH'],
   'EU', true, 'EUR')
) as v(nimi, aliakset, alkupera, on_maalitoimittaja, oletus_valuutta)
where not exists (
  select 1 from public.toimittajat t
  where public.normalisoi_toimittaja(t.nimi) = public.normalisoi_toimittaja(v.nimi)
);


-- ---------------------------------------------------------------------
-- 2. Kuitin ja värin uudet kentät
-- ---------------------------------------------------------------------

-- Toimeksianto ehdotti sarakkeeksi era_id, mutta se on jo varattu: se
-- osoittaa kuittierään eli monen kuitin latauserään. Maalierä tarvitsee
-- oman nimensä, tai viiteavain osoittaisi väärään tauluun.
alter table public.kuitit
  add column if not exists on_maaliostos boolean not null default false,
  add column if not exists maaliera_id uuid references public.maalierat (id) on delete set null,
  add column if not exists toimittaja_id uuid references public.toimittajat (id) on delete set null;

comment on column public.kuitit.on_maaliostos is
  'Käsin merkitty maaliostokseksi. Tunnettu maalitoimittaja tai Maalit ja lakat -kululuokka riittää muutenkin.';
comment on column public.kuitit.maaliera_id is
  'Kuitista luotu maalierä. Estää saman kuitin käsittelyn kahdesti. Eri asia kuin era_id, joka on kuittien latauserä.';
comment on column public.kuitit.toimittaja_id is
  'Tunnistettu toimittaja. Alkuperäinen toimittaja-teksti jää sellaisenaan: se on se mitä kuitissa luki.';

create index if not exists kuitit_toimittaja_idx on public.kuitit (toimittaja_id);
create index if not exists kuitit_maaliera_idx on public.kuitit (maaliera_id);

alter table public.varit
  add column if not exists tuotekoodi text;

comment on column public.varit.tuotekoodi is
  'Valmistajan tuotekoodi, esim. PMS-2569. Paras tunniste kuittiriville: se ei muutu eikä käänny.';

create unique index if not exists varit_tuotekoodi_uniikki
  on public.varit (lower(tuotekoodi)) where tuotekoodi is not null;

-- Toimittaja tunnistetaan kirjaushetkellä eikä kerran migraatiossa: muuten
-- rekisteri auttaisi vain niitä kuitteja jotka olivat olemassa silloin.
-- Liitos täydennetään myös jälkikäteen, koska toimittaja on voitu lisätä
-- rekisteriin vasta kuitin jälkeen.
create or replace function public.kuitti_tunnista_toimittaja()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT'
     or new.toimittaja is distinct from old.toimittaja
     or new.toimittaja_id is null then
    new.toimittaja_id := public.etsi_toimittaja(new.toimittaja);
  end if;
  return new;
end;
$$;

revoke execute on function public.kuitti_tunnista_toimittaja() from public, anon, authenticated;

drop trigger if exists kuitit_tunnista_toimittaja on public.kuitit;
create trigger kuitit_tunnista_toimittaja
  before insert or update of toimittaja, toimittaja_id on public.kuitit
  for each row execute function public.kuitti_tunnista_toimittaja();

-- Olemassa olevat kuitit liitetään rekisteriin.
update public.kuitit k
   set toimittaja_id = public.etsi_toimittaja(k.toimittaja)
 where k.toimittaja_id is null
   and public.etsi_toimittaja(k.toimittaja) is not null;


-- ---------------------------------------------------------------------
-- 3. Opitut parit
--
-- Kun admin yhdistää rivitekstin väriin kerran, seuraava kerta on
-- esitäytetty. Oma taulunsa eikä kuittirivin_oppi-laajennus: ne vastaavat
-- eri kysymykseen - toinen mihin ostos meni, toinen mikä väri tämä on -
-- ja yhteen tauluun puristettuna kumpikin sarake olisi puolet ajasta
-- tyhjä.
-- ---------------------------------------------------------------------

create table if not exists public.maalirivin_oppi (
  teksti text primary key,
  vari_id uuid not null references public.varit (id) on delete cascade,
  paivitetty timestamptz not null default now()
);

comment on table public.maalirivin_oppi is
  'Muistetut väriosumat rivin tekstin perusteella. Avain on normalisoitu teksti, kuten kuittirivin_oppi-taulussa.';

alter table public.maalirivin_oppi enable row level security;

drop policy if exists "Admin hallinnoi maalirivin oppia" on public.maalirivin_oppi;
create policy "Admin hallinnoi maalirivin oppia" on public.maalirivin_oppi
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.maalirivin_oppi from anon;


-- ---------------------------------------------------------------------
-- 4. Rivien täsmäytys väreihin
--
-- Järjestys: opittu pari, tuotekoodi, RAL-koodi, nimihaku. Opittu on
-- ensimmäisenä vaikka toimeksianto luettelee tuotekoodin ensin - opittu
-- pari on ihmisen tekemä korjaus, eikä koodiosuma saa kumota sitä. Juuri
-- sen korjaamiseen oppiminen on olemassa.
--
-- Ilman osumaa ehdotusta ei anneta: tyhjä valinta pakottaa katsomaan,
-- arvaus ei.
-- ---------------------------------------------------------------------

create or replace function public.ehdota_maalirivit(p_kuitti_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r           record;
  v_tulos     jsonb := '[]'::jsonb;
  v_normi     text;
  v_ral       text;
  v_vari_id   uuid;
  v_nimi      text;
  v_peruste   text;
  v_osuvuus   numeric;
  v_on_rahti  boolean;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi ehdottaa varastotäydennystä.';
  end if;

  for r in
    select * from public.kuitin_rivit where kuitti_id = p_kuitti_id order by jarjestys, id
  loop
    v_normi := btrim(lower(regexp_replace(coalesce(r.teksti, ''), '\s+', ' ', 'g')));
    v_vari_id := null;
    v_nimi := null;
    v_peruste := null;
    v_osuvuus := null;

    -- Rahtirivi tunnistetaan tekstistä, mutta admin vahvistaa: väärin
    -- tunnistettu rahti päätyisi väriksi tai päinvastoin.
    v_on_rahti := v_normi ~ '(shipping|freight|rahti|toimituskul|versandkost|postikul|handling)';

    -- 1. Opittu pari
    select o.vari_id into v_vari_id from public.maalirivin_oppi o where o.teksti = v_normi;
    if v_vari_id is not null then
      v_peruste := 'opittu';
    end if;

    -- 2. Tuotekoodi. Pisin osuma ensin, jottei PMS-25 vie PMS-2569:n paikkaa.
    if v_vari_id is null then
      select v.id into v_vari_id
        from public.varit v
       where v.aktiivinen
         and v.tuotekoodi is not null
         and position(lower(v.tuotekoodi) in v_normi) > 0
       order by length(v.tuotekoodi) desc
       limit 1;
      if v_vari_id is not null then
        v_peruste := 'tuotekoodi';
      end if;
    end if;

    -- 3. RAL-koodi
    v_ral := public.ral_koodi(r.teksti);

    if v_vari_id is null and v_ral is not null then
      select v.id into v_vari_id
        from public.varit v
       where v.aktiivinen
         and (
           public.ral_koodi(v.nimi) = v_ral
           or public.ral_koodi(coalesce(v.hakusanat, '')) = v_ral
         )
       limit 1;
      if v_vari_id is not null then
        v_peruste := 'ral';
      end if;
    end if;

    -- 4. Nimihaku, ja vain kun rivillä ei ole RAL-koodia. "RAL 4008" ja
    -- "RAL 3011" ovat merkkijonoina lähes samat mutta eri värit, joten
    -- samankaltaisuus on juuri tässä vaarallisin: jos koodille ei löydy
    -- väriä, oikea vastaus on tyhjä eikä lähin arvaus. Kynnys on muutenkin
    -- korkeahko - heikko osuma on arvaus, ja arvaus päätyisi saldoihin.
    if v_vari_id is null and v_ral is null and not v_on_rahti and v_normi <> '' then
      select v.id,
             greatest(
               similarity(lower(v.nimi), v_normi),
               similarity(lower(coalesce(v.hakusanat, '')), v_normi)
             )
        into v_vari_id, v_osuvuus
        from public.varit v
       where v.aktiivinen
       order by 2 desc
       limit 1;

      if v_osuvuus is null or v_osuvuus < 0.3 then
        v_vari_id := null;
        v_osuvuus := null;
      else
        v_peruste := 'nimi';
      end if;
    end if;

    if v_vari_id is not null then
      select v.nimi into v_nimi from public.varit v where v.id = v_vari_id;
    end if;

    -- Grammamuunnos tehdään sovelluksessa (muunnaGrammoiksi), koska admin voi
    -- korjata puuttuvan yksikön vasta hyväksyntänäkymässä. Kahdessa paikassa
    -- laskettuna ne erkaantuisivat.
    v_tulos := v_tulos || jsonb_build_array(jsonb_build_object(
      'rivi_id', r.id,
      'teksti', r.teksti,
      'maara', r.maara,
      'yksikko', r.yksikko,
      'brutto_eur', r.brutto_eur,
      'brutto_valuutassa', r.brutto_valuutassa,
      'ehdotus_vari_id', v_vari_id,
      'ehdotus_nimi', v_nimi,
      'peruste', v_peruste,
      'osuvuus', v_osuvuus,
      'on_rahti', v_on_rahti
    ));
  end loop;

  return v_tulos;
end;
$$;

comment on function public.ehdota_maalirivit(uuid) is
  'Ehdottaa kuitin riveille värit: opittu pari, tuotekoodi, RAL-koodi, nimihaku. Ilman osumaa ehdotusta ei anneta.';

revoke execute on function public.ehdota_maalirivit(uuid) from public, anon;
grant execute on function public.ehdota_maalirivit(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. Erän luonti kuitista
--
-- Hintalaskentaa ei kirjoiteta uudelleen: tämä kokoaa rivit ja kutsuu
-- luo_maaliera-funktiota, joka jakaa kulut ja päivittää keskihinnat.
-- Tulli ja tuonti-ALV jäävät sen arvioitaviksi - ne tulevat erillisellä
-- tullauspäätöksellä eivätkä ole kuitilla.
-- ---------------------------------------------------------------------

create or replace function public.luo_maaliera_kuitista(
  p_kuitti_id uuid,
  p_rivit jsonb,
  p_rahti_eur numeric default 0,
  p_muistiinpano text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  k          record;
  v_era_id   uuid;
  v_rivi     jsonb;
  v_eran_rivit jsonb := '[]'::jsonb;
  v_luokka   uuid;
  v_teksti   text;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi luoda varastotäydennyksen kuitista.';
  end if;

  select * into k from public.kuitit where id = p_kuitti_id;
  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  -- Sama kuitti kahdesti kasvattaisi saldon kahteen kertaan.
  if k.maaliera_id is not null then
    raise exception 'Kuitista on jo luotu erä.';
  end if;

  -- Vieraan valuutan kuitti ilman vahvistettua euromäärää: kilohinta olisi
  -- väärä. Sama sääntö kuin kuukausisummissa ja luovutuksen tarkistuksessa.
  if k.valuutta <> 'EUR' and k.kurssin_lahde is null then
    raise exception 'Kuitin euromäärä on vahvistamatta. Syötä tililtä luettu veloitus ensin.';
  end if;

  if jsonb_typeof(p_rivit) <> 'array' or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Valitse vähintään yksi väririvi.';
  end if;

  for v_rivi in select * from jsonb_array_elements(p_rivit)
  loop
    if coalesce((v_rivi->>'maara_g')::numeric, 0) <= 0 then
      raise exception 'Rivin määrän on oltava suurempi kuin 0. Tarkista yksikkö.';
    end if;

    v_eran_rivit := v_eran_rivit || jsonb_build_array(jsonb_build_object(
      'vari_id', v_rivi->>'vari_id',
      'maara_g', (v_rivi->>'maara_g')::numeric,
      'tavara_eur', coalesce((v_rivi->>'tavara_eur')::numeric, 0)
    ));
  end loop;

  v_era_id := public.luo_maaliera(
    jsonb_build_object(
      'toimittaja', k.toimittaja,
      'paivays', k.paivays,
      'rahti_eur', coalesce(p_rahti_eur, 0),
      'kuitti_id', p_kuitti_id::text,
      'muistiinpano', p_muistiinpano
    ),
    v_eran_rivit
  );

  update public.kuitit
     set maaliera_id = v_era_id,
         on_maaliostos = true,
         toimittaja_id = coalesce(toimittaja_id, public.etsi_toimittaja(k.toimittaja)),
         updated_at = now()
   where id = p_kuitti_id;

  select id into v_luokka from public.kululuokat where lower(nimi) = 'maalit ja lakat' limit 1;

  for v_rivi in select * from jsonb_array_elements(p_rivit)
  loop
    select btrim(lower(regexp_replace(coalesce(teksti, ''), '\s+', ' ', 'g')))
      into v_teksti
      from public.kuitin_rivit
     where id = (v_rivi->>'rivi_id')::uuid;

    -- Ihmisen tekemä valinta muistetaan: seuraava kerta on esitäytetty.
    if v_teksti is not null and v_teksti <> '' then
      insert into public.maalirivin_oppi (teksti, vari_id, paivitetty)
      values (v_teksti, (v_rivi->>'vari_id')::uuid, now())
      on conflict (teksti) do update
        set vari_id = excluded.vari_id, paivitetty = now();
    end if;

    -- Luokittelu on sama tieto kahdesti kirjattuna, jos sen joutuu
    -- tekemään erikseen. Jo luokiteltuun riviin ei kosketa.
    update public.kuitin_rivit
       set kayttotarkoitus = coalesce(kayttotarkoitus, 'yrityksen_tarvike'),
           kululuokka_id = coalesce(kululuokka_id, v_luokka)
     where id = (v_rivi->>'rivi_id')::uuid;
  end loop;

  return v_era_id;
end;
$$;

comment on function public.luo_maaliera_kuitista(uuid, jsonb, numeric, text) is
  'Luo kuitista maalierän riveineen, muistaa väriosumat ja luokittelee rivit. Estää saman kuitin käsittelyn kahdesti.';

revoke execute on function public.luo_maaliera_kuitista(uuid, jsonb, numeric, text) from public, anon;
grant execute on function public.luo_maaliera_kuitista(uuid, jsonb, numeric, text) to authenticated;
