-- =====================================================================
-- Migraatio: maalierät, kulujen jako ja liukuva keskihinta
--
-- Tausta:
--   varastotayennykset tiesi vain montako grammaa tuli lisää. Erän hintaa
--   ei tallennettu mihinkään, ja varit.ostohinta_per_kg oli yksi luku joka
--   ylikirjoitettiin - viimeisin ostohinta edusti koko varastoa, myös sitä
--   osaa joka oli ostettu halvemmalla.
--
--   Kilohinta riippuu myös erän koosta: iso tilaus jakaa rahdin useammalle
--   kilolle. Ilman erätietoa sitä ei voi laskea.
--
-- Ratkaisu:
--   Erä on oma tositteensa kuluineen. Kulut jaetaan riveille kukin omalla
--   perusteellaan, rivi kantaa oman hankintahintansa pysyvästi, ja värin
--   hinta on varaston liukuva keskihinta.
--
-- Edellytys: 20260911120000_lukittu_maalikustannus. Työn maalikustannus on
-- lukittu kulutushetkeen, joten hinnan muuttuminen ei kirjoita vanhoja
-- katteita uusiksi.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Erätaulu
-- ---------------------------------------------------------------------

create table if not exists public.maalierat (
  id uuid primary key default gen_random_uuid(),
  -- Valinnainen: erän voi syöttää käsin ilman kuittia.
  kuitti_id uuid references public.kuitit (id) on delete set null,
  toimittaja text,
  paivays date not null,

  -- Erän kulut kokonaisuudessaan. tavara_eur johdetaan riveiltä, jotta
  -- erän summa ja rivien summa eivät voi erkaantua.
  tavara_eur     numeric(12, 2) not null default 0,
  rahti_eur      numeric(12, 2) not null default 0,
  tulli_eur      numeric(12, 2) not null default 0,
  tuonti_alv_eur numeric(12, 2) not null default 0,

  -- Kesken = kaikki kulut eivät ole vielä tiedossa, tyypillisesti
  -- tullauspäätös puuttuu. Hinta on silloin arvio.
  tila text not null default 'kesken',
  muistiinpano text,
  luotu timestamptz not null default now(),
  luoja_id uuid references public.profiles (id) on delete set null
);

comment on table public.maalierat is
  'Maalin ostoerä kuluineen. Rivit ovat varastotayennykset-taulussa, ja erän kulut jaetaan niille.';
comment on column public.maalierat.tavara_eur is
  'Rivien tavarahintojen summa. Kanta laskee, ei syötetä käsin.';
comment on column public.maalierat.rahti_eur is
  'Erän rahti kokonaisuudessaan. Jaetaan riveille painon mukaan.';
comment on column public.maalierat.tulli_eur is
  'Tullimaksu tullauspäätökseltä. Kesken olevassa erässä arvio. Jaetaan arvon mukaan.';
comment on column public.maalierat.tuonti_alv_eur is
  'Tuonnin arvonlisävero tullauspäätökseltä. Kesken olevassa erässä arvio. Jaetaan arvon mukaan.';
comment on column public.maalierat.tila is
  'kesken = kulut vielä auki (tullauspäätös puuttuu), valmis = lopulliset luvut.';

alter table public.maalierat drop constraint if exists maalierat_tila_check;
alter table public.maalierat
  add constraint maalierat_tila_check check (tila in ('kesken', 'valmis'));

create index if not exists maalierat_paivays_idx on public.maalierat (paivays desc);
create index if not exists maalierat_tila_idx on public.maalierat (tila);

alter table public.maalierat enable row level security;

-- Erä on taloustietoa kuten kuitit: vain admin.
drop policy if exists "Admin hallinnoi maalieria" on public.maalierat;
create policy "Admin hallinnoi maalieria" on public.maalierat
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.maalierat from anon;


-- ---------------------------------------------------------------------
-- 2. Täydennys viittaa erään ja kantaa oman hankintahintansa
-- ---------------------------------------------------------------------

alter table public.varastotayennykset
  add column if not exists era_id                   uuid references public.maalierat (id) on delete cascade,
  add column if not exists tavara_eur               numeric(12, 2),
  add column if not exists hankintahinta_per_kg     numeric(12, 4),
  add column if not exists saldo_ennen_g            numeric(12, 2),
  add column if not exists keskihinta_ennen_per_kg  numeric(12, 4),
  add column if not exists keskihinta_jalkeen_per_kg numeric(12, 4);

comment on column public.varastotayennykset.era_id is
  'Erä johon täydennys kuuluu. Null = käsin kirjattu täydennys tai saldon korjaus ilman erätietoa.';
comment on column public.varastotayennykset.tavara_eur is
  'Rivin tavarahinta laskulta, ilman rahtia ja tulleja.';
comment on column public.varastotayennykset.hankintahinta_per_kg is
  'Tämän erän kilohinta kaikkine kuluineen. Kopio, ei viittaus: erän hinta ei muutu jälkikäteen.';
comment on column public.varastotayennykset.saldo_ennen_g is
  'Värin saldo ennen tätä täydennystä. Keskihinnan painotus tarvitsee sen, ja kesken olevan erän korjaus laskee samalla painolla kuin alkuperäinen.';
comment on column public.varastotayennykset.keskihinta_ennen_per_kg is
  'Värin liukuva keskihinta ennen tätä täydennystä.';
comment on column public.varastotayennykset.keskihinta_jalkeen_per_kg is
  'Värin liukuva keskihinta tämän täydennyksen jälkeen. Null = hintaa ei ole vielä laskettu.';

create index if not exists varastotayennykset_era_idx on public.varastotayennykset (era_id);

-- Saldo ennen täydennystä luetaan kirjaushetkellä. Se on ainoa hetki jolloin
-- luku on varmasti oikea: erän hinnoittelu voi tapahtua myöhemmin, ja siihen
-- mennessä saldo on jo ehtinyt muuttua kulutuksesta.
create or replace function public.varastotayennys_saldo_ennen()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.saldo_ennen_g is null then
    select saldo_g into new.saldo_ennen_g from public.varit where id = new.vari_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.varastotayennys_saldo_ennen() from public, anon, authenticated;

drop trigger if exists varastotayennys_saldo_ennen_trg on public.varastotayennykset;
create trigger varastotayennys_saldo_ennen_trg
  before insert on public.varastotayennykset
  for each row execute function public.varastotayennys_saldo_ennen();


-- ---------------------------------------------------------------------
-- 3. Värin hinta tulee eristä
-- ---------------------------------------------------------------------

alter table public.varit
  add column if not exists hinta_erista boolean not null default false;

comment on column public.varit.hinta_erista is
  'Värillä on vähintään yksi hinnoiteltu erä, joten ostohinta_per_kg on varaston liukuva keskihinta kaikkine kuluineen. Silloin tulleja ja rahtia ei enää lisätä prosenteilla - ne ovat hinnassa jo mukana.';

comment on column public.varit.ostohinta_per_kg is
  'Varaston liukuva keskihinta €/kg. Ei viimeisin ostohinta: täydennys päivittää tämän painotettuna keskiarvona. Kun hinta_erista on tosi, luku sisältää rahdin ja tullit.';


-- ---------------------------------------------------------------------
-- 4. Kulujen jako riveille
--
-- Eri kuluilla on eri jakoperuste, eikä tämä ole hiustenhalkomista:
-- Prismaticin laskulla rahti oli noin 16 % kokonaissummasta, joten väärä
-- jako vinouttaa kilohintoja molempiin suuntiin.
--
--   tavarahinta  rivin oma hinta
--   rahti        paino     - kansainvälinen rahti maksetaan painosta
--   tulli        arvo      - lasketaan tullausarvosta
--   tuonti-ALV   arvo      - lasketaan tullausarvosta ja tullista
--
-- Funktio on puhdas laskenta ilman tauluja, jotta esikatselu ja tallennus
-- käyttävät samaa kaavaa. Kaksi kaavaa erkaantuisi ennemmin tai myöhemmin.
-- ---------------------------------------------------------------------

create or replace function public.jaa_eran_kulut(
  p_rivit jsonb,
  p_rahti_eur numeric,
  p_tulli_eur numeric,
  p_tuonti_alv_eur numeric
)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with syote as (
    select
      t.ord,
      t.arvo,
      coalesce((t.arvo->>'maara_g')::numeric, 0) as maara_g,
      coalesce((t.arvo->>'tavara_eur')::numeric, 0) as tavara_eur
    from jsonb_array_elements(coalesce(p_rivit, '[]'::jsonb)) with ordinality as t(arvo, ord)
  ),
  summat as (
    select
      coalesce(sum(maara_g), 0) as paino_yht,
      coalesce(sum(tavara_eur), 0) as tavara_yht
    from syote
  ),
  jaettu as (
    select
      s.ord,
      s.arvo,
      s.maara_g,
      round(
        s.tavara_eur
        + case
            when m.paino_yht > 0 then coalesce(p_rahti_eur, 0) * s.maara_g / m.paino_yht
            else 0
          end
        + case
            when m.tavara_yht > 0
              then (coalesce(p_tulli_eur, 0) + coalesce(p_tuonti_alv_eur, 0))
                     * s.tavara_eur / m.tavara_yht
            else 0
          end,
        2
      ) as kulut_eur
    from syote s
    cross join summat m
  ),
  -- Pyöristysero suurimmalle riville, kuten valuuttamuunnoksessa: rivien
  -- summan on täsmättävä erän kuluihin senttiin asti.
  erotus as (
    select
      (select tavara_yht from summat)
        + coalesce(p_rahti_eur, 0) + coalesce(p_tulli_eur, 0) + coalesce(p_tuonti_alv_eur, 0)
        - coalesce(sum(j.kulut_eur), 0) as ero,
      (select j2.ord from jaettu j2 order by j2.kulut_eur desc, j2.ord limit 1) as isoin_ord
    from jaettu j
  ),
  lopulliset as (
    select
      j.ord,
      j.arvo,
      j.maara_g,
      j.kulut_eur + case when j.ord = e.isoin_ord then e.ero else 0 end as kulut_eur
    from jaettu j
    cross join erotus e
  )
  select coalesce(
    jsonb_agg(
      l.arvo || jsonb_build_object(
        'kulut_eur', l.kulut_eur,
        'hankintahinta_per_kg',
          case when l.maara_g > 0 then round(l.kulut_eur / (l.maara_g / 1000.0), 4) end
      )
      order by l.ord
    ),
    '[]'::jsonb
  )
  from lopulliset l;
$$;

comment on function public.jaa_eran_kulut(jsonb, numeric, numeric, numeric) is
  'Jakaa erän kulut riveille: rahti painon mukaan, tulli ja tuonti-ALV arvon mukaan. Palauttaa rivit kilohintoineen. Pyöristysero ohjataan suurimmalle riville.';

revoke execute on function public.jaa_eran_kulut(jsonb, numeric, numeric, numeric)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. Erän hinnoittelu ja liukuva keskihinta
--
-- Jauhemaali on sekoittuvaa tavaraa: kauhot laatikosta etkä tiedä mistä
-- erästä. FIFO vaatisi erien pitämistä erillään, joten se ei sovi tähän.
-- Liukuva keskihinta on myös kirjanpidollisesti hyväksytty menetelmä.
--
--   uusi = (vanha_saldo * vanha_hinta + erän_määrä * erän_hinta)
--          / (vanha_saldo + erän_määrä)
--
-- Päivitys koskee vain tulevaa kulutusta: aiemmat työt on lukittu
-- kulutushetkeensä eikä niihin kosketa.
-- ---------------------------------------------------------------------

create or replace function public.laske_eran_hinnat(p_era_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  e                  record;
  r                  record;
  v_rivit            jsonb;
  v_hinnat           jsonb;
  v_hankinta         numeric;
  v_vanha_keskihinta numeric;
  v_uusi_keskihinta  numeric;
  v_ennen            numeric;
  v_saldo            numeric;
begin
  select * into e from public.maalierat where id = p_era_id;
  if not found then
    return;
  end if;

  -- Erän tavarasumma on rivien summa määritelmän mukaan, joten se lasketaan
  -- tässä eikä luoteta syötettyyn lukuun.
  update public.maalierat
     set tavara_eur = coalesce(
           (select sum(coalesce(t.tavara_eur, 0))
              from public.varastotayennykset t where t.era_id = p_era_id),
           0
         )
   where id = p_era_id
  returning * into e;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'maara_g', t.maara_g,
        'tavara_eur', coalesce(t.tavara_eur, 0)
      ) order by t.luotu, t.id
    ),
    '[]'::jsonb
  )
  into v_rivit
  from public.varastotayennykset t
  where t.era_id = p_era_id;

  v_hinnat := public.jaa_eran_kulut(v_rivit, e.rahti_eur, e.tulli_eur, e.tuonti_alv_eur);

  -- Rivit käydään kirjausjärjestyksessä: keskihinta on ketju, jossa jokainen
  -- täydennys painottuu edellisen tulokseen.
  for r in
    select t.* from public.varastotayennykset t
     where t.era_id = p_era_id
     order by t.luotu, t.id
  loop
    select (h->>'hankintahinta_per_kg')::numeric
      into v_hankinta
      from jsonb_array_elements(v_hinnat) h
     where (h->>'id')::uuid = r.id;

    if v_hankinta is null then
      continue;
    end if;

    select ostohinta_per_kg into v_vanha_keskihinta from public.varit where id = r.vari_id;
    v_saldo := coalesce(r.saldo_ennen_g, 0);

    if r.keskihinta_jalkeen_per_kg is null then
      -- Ensimmäinen hinnoittelu.
      if v_saldo > 0 then
        v_uusi_keskihinta :=
          (v_saldo * coalesce(v_vanha_keskihinta, 0) + r.maara_g * v_hankinta)
          / (v_saldo + r.maara_g);
      else
        if v_saldo < 0 then
          raise warning 'Värin % saldo oli negatiivinen (% g) täydennyshetkellä; keskihinnaksi otetaan erän hinta.',
            r.vari_id, v_saldo;
        end if;
        v_uusi_keskihinta := v_hankinta;
      end if;
      v_ennen := v_vanha_keskihinta;
    else
      -- Uudelleenhinnoittelu: kesken ollut erä sai lopulliset kulut. Hintaa ei
      -- lasketa historiasta uusiksi vaan siirretään erotuksen verran samalla
      -- painolla kuin alkuperäinen laskenta - muu kulutus ja muut täydennykset
      -- jäävät koskematta.
      if v_saldo + r.maara_g > 0 then
        v_uusi_keskihinta := coalesce(v_vanha_keskihinta, 0)
          + r.maara_g * (v_hankinta - coalesce(r.hankintahinta_per_kg, 0))
            / (v_saldo + r.maara_g);
      else
        v_uusi_keskihinta := v_hankinta;
      end if;
      v_ennen := r.keskihinta_ennen_per_kg;
    end if;

    update public.varastotayennykset
       set hankintahinta_per_kg = v_hankinta,
           keskihinta_ennen_per_kg = v_ennen,
           keskihinta_jalkeen_per_kg = round(v_uusi_keskihinta, 4)
     where id = r.id;

    update public.varit
       set ostohinta_per_kg = round(v_uusi_keskihinta, 2),
           hinta_erista = true,
           updated_at = now()
     where id = r.vari_id;
  end loop;
end;
$$;

comment on function public.laske_eran_hinnat(uuid) is
  'Jakaa erän kulut riveille ja päivittää värien liukuvan keskihinnan. Uudelleen ajettuna korjaa aiemman arvion erotuksella, ei laske historiaa uusiksi.';

revoke execute on function public.laske_eran_hinnat(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 6. Kaksivaiheinen erä
--
-- Tuontierässä kaikki kulut eivät ole tiedossa kerralla: lasku saapuu ensin,
-- tullauspäätös päiviä myöhemmin. Erä luodaan tavarahinnalla ja rahdilla, ja
-- tullit arvioidaan värien prosenteilla. Saldo kasvaa heti - maali on
-- hyllyssä, vaikka kustannus olisi kesken.
--
-- EU-erässä tullia ja tuonti-ALV:tä ei ole, joten erä on valmis heti.
-- Saksalaisen toimittajan hinta sisältää Saksan ALV:n eikä sitä pureta: se on
-- osa tavarahintaa.
-- ---------------------------------------------------------------------

create or replace function public.arvioi_eran_tullit(p_rivit jsonb, p_rahti_eur numeric)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with syote as (
    select
      (arvo->>'vari_id')::uuid as vari_id,
      coalesce((arvo->>'maara_g')::numeric, 0) as maara_g,
      coalesce((arvo->>'tavara_eur')::numeric, 0) as tavara_eur
    from jsonb_array_elements(coalesce(p_rivit, '[]'::jsonb)) arvo
  ),
  paino as (select coalesce(sum(maara_g), 0) as yht from syote),
  -- Tullausarvo sisältää rahdin, joten arvio lasketaan samalta perustalta
  -- kuin vari_kokonaishinta_per_kg laskee prosenteilla.
  rivit as (
    select
      s.tavara_eur
        + case when p.yht > 0 then coalesce(p_rahti_eur, 0) * s.maara_g / p.yht else 0 end
        as perusta,
      case when v.alkupera = 'EU' then 0
           else coalesce(v.tullimaksu_prosentti, a.tullimaksu_prosentti_oletus) end as tulli_pros,
      case when v.alkupera = 'EU' then 0
           else coalesce(v.alv_prosentti, a.alv_prosentti_oletus) end as alv_pros
    from syote s
    cross join paino p
    join public.varit v on v.id = s.vari_id
    cross join public.asetukset a
  )
  select jsonb_build_object(
    'tulli_eur', round(coalesce(sum(perusta * tulli_pros / 100.0), 0), 2),
    'tuonti_alv_eur', round(
      coalesce(sum((perusta + perusta * tulli_pros / 100.0) * alv_pros / 100.0), 0), 2)
  )
  from rivit;
$$;

comment on function public.arvioi_eran_tullit(jsonb, numeric) is
  'Arvioi erän tullin ja tuonti-ALV:n värien prosenteilla, kun tullauspäätöstä ei vielä ole. Tullausarvo sisältää rahdin.';

revoke execute on function public.arvioi_eran_tullit(jsonb, numeric)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 7. Erän luonti, esikatselu ja viimeistely
-- ---------------------------------------------------------------------

-- Esikatselu vastaa kysymykseen "mikä kunkin värin kilohinnaksi tulee",
-- ennen kuin mitään on tallennettu. Sama laskenta kuin tallennuksessa.
create or replace function public.esikatsele_maaliera(
  p_rivit jsonb,
  p_rahti_eur numeric default 0,
  p_tulli_eur numeric default null,
  p_tuonti_alv_eur numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_arvio    jsonb;
  v_tulli    numeric;
  v_alv      numeric;
  v_hinnat   jsonb;
  h          jsonb;
  v_tulos    jsonb := '[]'::jsonb;
  v_vari     record;
  -- Sama väri voi esiintyä erässä kahdesti, joten keskihinta ketjutetaan.
  v_hinnat_nyt jsonb := '{}'::jsonb;
  v_saldot_nyt jsonb := '{}'::jsonb;
  v_vanha    numeric;
  v_saldo    numeric;
  v_uusi     numeric;
  v_maara    numeric;
  v_hankinta numeric;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi esikatsella eriä.';
  end if;

  v_arvio := public.arvioi_eran_tullit(p_rivit, p_rahti_eur);
  v_tulli := coalesce(p_tulli_eur, (v_arvio->>'tulli_eur')::numeric);
  v_alv := coalesce(p_tuonti_alv_eur, (v_arvio->>'tuonti_alv_eur')::numeric);

  v_hinnat := public.jaa_eran_kulut(p_rivit, p_rahti_eur, v_tulli, v_alv);

  for h in select * from jsonb_array_elements(v_hinnat)
  loop
    select v.id, v.nimi, v.valmistaja, v.saldo_g, v.ostohinta_per_kg
      into v_vari
      from public.varit v
     where v.id = (h->>'vari_id')::uuid;
    if not found then
      continue;
    end if;

    v_maara := coalesce((h->>'maara_g')::numeric, 0);
    v_hankinta := (h->>'hankintahinta_per_kg')::numeric;

    v_vanha := coalesce((v_hinnat_nyt->>(v_vari.id::text))::numeric, v_vari.ostohinta_per_kg);
    v_saldo := coalesce((v_saldot_nyt->>(v_vari.id::text))::numeric, v_vari.saldo_g);

    if v_hankinta is null then
      v_uusi := v_vanha;
    elsif v_saldo > 0 then
      v_uusi := (v_saldo * coalesce(v_vanha, 0) + v_maara * v_hankinta) / (v_saldo + v_maara);
    else
      v_uusi := v_hankinta;
    end if;

    v_hinnat_nyt := v_hinnat_nyt || jsonb_build_object(v_vari.id::text, round(v_uusi, 4));
    v_saldot_nyt := v_saldot_nyt || jsonb_build_object(v_vari.id::text, v_saldo + v_maara);

    v_tulos := v_tulos || jsonb_build_array(h || jsonb_build_object(
      'nimi', v_vari.nimi,
      'valmistaja', v_vari.valmistaja,
      'saldo_ennen_g', v_saldo,
      'keskihinta_ennen_per_kg', round(coalesce(v_vanha, 0), 4),
      'keskihinta_jalkeen_per_kg', round(v_uusi, 4)
    ));
  end loop;

  return jsonb_build_object(
    'rivit', v_tulos,
    'tulli_eur', v_tulli,
    'tuonti_alv_eur', v_alv,
    'tullit_arvioitu', p_tulli_eur is null or p_tuonti_alv_eur is null
  );
end;
$$;

comment on function public.esikatsele_maaliera(jsonb, numeric, numeric, numeric) is
  'Laskee erän kilohinnat ja niistä seuraavat keskihinnat tallentamatta mitään.';

revoke execute on function public.esikatsele_maaliera(jsonb, numeric, numeric, numeric) from public, anon;
grant execute on function public.esikatsele_maaliera(jsonb, numeric, numeric, numeric) to authenticated;


create or replace function public.luo_maaliera(p_era jsonb, p_rivit jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_era_id uuid;
  v_rivi   jsonb;
  v_arvio  jsonb;
  v_tulli  numeric;
  v_alv    numeric;
  v_annettu boolean;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi kirjata maalieriä.';
  end if;

  if jsonb_typeof(p_rivit) <> 'array' or jsonb_array_length(p_rivit) = 0 then
    raise exception 'Erässä on oltava vähintään yksi rivi.';
  end if;

  -- Tullit on annettu kun molemmat luvut tulevat kutsusta. Silloin erä on
  -- valmis; muuten ne arvioidaan ja erä jää odottamaan tullauspäätöstä.
  v_annettu := p_era->>'tulli_eur' is not null and p_era->>'tuonti_alv_eur' is not null;

  if v_annettu then
    v_tulli := (p_era->>'tulli_eur')::numeric;
    v_alv := (p_era->>'tuonti_alv_eur')::numeric;
  else
    v_arvio := public.arvioi_eran_tullit(p_rivit, coalesce((p_era->>'rahti_eur')::numeric, 0));
    v_tulli := (v_arvio->>'tulli_eur')::numeric;
    v_alv := (v_arvio->>'tuonti_alv_eur')::numeric;
  end if;

  insert into public.maalierat (
    kuitti_id, toimittaja, paivays, rahti_eur, tulli_eur, tuonti_alv_eur,
    muistiinpano, tila, luoja_id
  )
  values (
    nullif(p_era->>'kuitti_id', '')::uuid,
    nullif(btrim(coalesce(p_era->>'toimittaja', '')), ''),
    coalesce((p_era->>'paivays')::date, current_date),
    coalesce((p_era->>'rahti_eur')::numeric, 0),
    v_tulli,
    v_alv,
    nullif(btrim(coalesce(p_era->>'muistiinpano', '')), ''),
    -- EU-erässä arviokin on lopullinen: tullia ja tuonti-ALV:tä ei tule.
    case when v_annettu or (v_tulli = 0 and v_alv = 0) then 'valmis' else 'kesken' end,
    auth.uid()
  )
  returning id into v_era_id;

  for v_rivi in select * from jsonb_array_elements(p_rivit)
  loop
    if coalesce((v_rivi->>'maara_g')::numeric, 0) <= 0 then
      raise exception 'Erän rivin määrän on oltava suurempi kuin 0.';
    end if;

    insert into public.varastotayennykset (
      vari_id, maara_g, tyyppi, era_id, tavara_eur, kayttaja_id
    )
    values (
      (v_rivi->>'vari_id')::uuid,
      (v_rivi->>'maara_g')::numeric,
      'taydennys',
      v_era_id,
      coalesce((v_rivi->>'tavara_eur')::numeric, 0),
      auth.uid()
    );
  end loop;

  perform public.laske_eran_hinnat(v_era_id);
  return v_era_id;
end;
$$;

comment on function public.luo_maaliera(jsonb, jsonb) is
  'Kirjaa maalierän riveineen, jakaa kulut ja päivittää värien keskihinnan. Palauttaa erän tunnisteen.';

revoke execute on function public.luo_maaliera(jsonb, jsonb) from public, anon;
grant execute on function public.luo_maaliera(jsonb, jsonb) to authenticated;


create or replace function public.viimeistele_maaliera(
  p_era_id uuid,
  p_tulli_eur numeric,
  p_tuonti_alv_eur numeric
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi viimeistellä maalieriä.';
  end if;

  update public.maalierat
     set tulli_eur = coalesce(p_tulli_eur, 0),
         tuonti_alv_eur = coalesce(p_tuonti_alv_eur, 0),
         tila = 'valmis'
   where id = p_era_id;

  if not found then
    raise exception 'Erää ei löytynyt.';
  end if;

  perform public.laske_eran_hinnat(p_era_id);
end;
$$;

comment on function public.viimeistele_maaliera(uuid, numeric, numeric) is
  'Kirjaa tullauspäätöksen luvut kesken olleelle erälle ja korjaa kilohinnat ja keskihinnat niiden mukaan.';

revoke execute on function public.viimeistele_maaliera(uuid, numeric, numeric) from public, anon;
grant execute on function public.viimeistele_maaliera(uuid, numeric, numeric) to authenticated;


-- ---------------------------------------------------------------------
-- 8. Kokonaishinta ei laske kuluja kahteen kertaan
--
-- vari_kokonaishinta_per_kg lisää tullit, ALV:n ja toimituskulun
-- prosenteilla. Se on oikein niille väreille joilla ei ole erätietoa - eli
-- vanhalle datalle ja käsin syötetyille hinnoille.
--
-- Kun värillä on erä, keskihinta sisältää rahdin ja tullit jo valmiiksi.
-- Prosenttien soveltaminen sen päälle laskisi samat kulut kahteen kertaan,
-- joten hinta palautetaan sellaisenaan.
-- ---------------------------------------------------------------------

create or replace function public.vari_kokonaishinta_rajaamaton(p_vari_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when v.hinta_erista then round(v.ostohinta_per_kg, 2)
    else public.vari_kokonaishinta_per_kg(
      v.alkupera,
      v.ostohinta_per_kg,
      coalesce(v.tullimaksu_prosentti, a.tullimaksu_prosentti_oletus),
      coalesce(v.alv_prosentti, a.alv_prosentti_oletus),
      coalesce(
        v.toimituskulu_per_kg,
        case v.alkupera
          when 'EU' then a.toimituskulu_per_kg_eu_oletus
          when 'USA' then a.toimituskulu_per_kg_usa_oletus
          else a.toimituskulu_per_kg_muu_oletus
        end
      )
    )
  end
  from public.varit v, public.asetukset a
  where v.id = p_vari_id;
$$;

comment on function public.vari_kokonaishinta_rajaamaton(uuid) is
  'Värin kokonaishinta €/kg ilman roolitarkistusta. Erähinnoitellulle värille keskihinta sellaisenaan, muille prosenttikaava. Vain hinnan lukitukseen - ei kutsuoikeutta sovellukselle.';

revoke execute on function public.vari_kokonaishinta_rajaamaton(uuid)
  from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 9. Roolirajaus: erän hinnat eivät näy maalaajalle
--
-- Sama menetelmä kuin tyon_rivit-taulun lukituilla hinnoilla: SELECT
-- perutaan taululta ja myönnetään takaisin sarakkeittain. Sarakkeet
-- luetellaan nimeltä, jotta uusi hintasarake ei näy maalaajalle ennen kuin
-- se lisätään tähän.
--
-- Maalaaja näkee edelleen mitä ja milloin tuli lisää - vain hinta on
-- piilossa. maalierat-taulu on kokonaan admin-rajattu RLS:llä.
-- ---------------------------------------------------------------------

revoke select on public.varastotayennykset from authenticated;
grant select (
  id,
  vari_id,
  maara_g,
  tyyppi,
  kayttaja_id,
  luotu,
  era_id,
  saldo_ennen_g
) on public.varastotayennykset to authenticated;


-- ---------------------------------------------------------------------
-- 10. Tarkistus ajon jälkeen
-- ---------------------------------------------------------------------
-- select v.nimi, v.saldo_g, v.ostohinta_per_kg, v.hinta_erista,
--        t.maara_g, t.hankintahinta_per_kg, t.keskihinta_ennen_per_kg,
--        t.keskihinta_jalkeen_per_kg
--   from varastotayennykset t join varit v on v.id = t.vari_id
--  where t.era_id is not null
--  order by t.luotu;
--
-- Odotus: rivien kulut summautuvat erän kuluihin sentin tarkkuudella, ja
-- värin ostohinta_per_kg on viimeisimmän rivin keskihinta_jalkeen.
