-- =====================================================================
-- Migraatio: poistolaskelma pysyy ajan tasalla triggerillä
--
-- Ongelma:
--   laske_poistolaskelmat ajettiin vain siirra_rivi_kalustoon-funktiosta ja
--   sovelluksen toiminnoista. Jos kalustoa muutettiin muuta kautta - suoralla
--   updatella, poistolla, tai kuitin poiston kaskadista - laskelma jäi
--   vanhaksi eikä mikään kertonut siitä. Poistettu 2 470 euron hankinta
--   olisi näkynyt yhä poistopohjassa.
--
-- Ratkaisu:
--   Trigger kalusto-taululle. Laskenta ei voi jäädä jälkeen riippumatta
--   siitä mitä kautta kalustoa muutetaan, eikä kutsujan tarvitse muistaa
--   ajaa sitä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Laskenta ilman roolitarkistusta
--
-- Trigger ajaa laskennan kirjoituksen yhteydessä, eikä roolitarkistus kuulu
-- sinne: oikeus kirjoittaa kalustoon on jo ratkaistu RLS:llä siinä vaiheessa
-- kun trigger laukeaa. Sama jako kuin vari_kokonaishinta_rajaamaton-
-- funktiossa - rajaamaton tekee työn, rajattu vartioi ovea.
--
-- Sisältö on sama kuin aiemman laske_poistolaskelmat-funktion, ilman
-- is_admin-tarkistusta.
-- ---------------------------------------------------------------------

create or replace function public.laske_poistoketju(p_tilikausi_paattyi date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ensimmainen int;
  v_viimeinen   int;
  v_vuosi       int;
  v_paattyi     date;
  v_alku        date;
  v_alussa      numeric := 0;
  v_hankinnat   numeric;
  v_luovutukset numeric;
  v_pohja       numeric;
  v_toteutunut  numeric;
  v_enintaan    numeric;
  v_kertapoisto boolean;
  v_lopussa     numeric;
begin
  -- Ketjun alku: aikaisin vuosi jolla on hankinta, laskelma tai joka on
  -- pyydetty. Loppu: myöhäisin olemassa oleva laskelma tai pyydetty vuosi,
  -- jotta käsin kirjattu poisto valuu eteenpäin koko ketjuun.
  select least(
           coalesce(min(extract(year from k.hankittu))::int, 2147483647),
           coalesce((select min(extract(year from p.tilikausi_paattyi))::int
                       from public.poistolaskelmat p), 2147483647),
           extract(year from p_tilikausi_paattyi)::int
         )
    into v_ensimmainen
    from public.kalusto k;

  select greatest(
           coalesce((select max(extract(year from p.tilikausi_paattyi))::int
                       from public.poistolaskelmat p), -2147483648),
           extract(year from p_tilikausi_paattyi)::int
         )
    into v_viimeinen;

  for v_vuosi in v_ensimmainen..v_viimeinen loop
    v_paattyi := make_date(v_vuosi, 12, 31);
    v_alku := make_date(v_vuosi, 1, 1);

    select coalesce(sum(k.hankintameno_eur), 0)
      into v_hankinnat
      from public.kalusto k
     where k.hankittu >= v_alku and k.hankittu <= v_paattyi;

    select coalesce(sum(k.luovutushinta_eur), 0)
      into v_luovutukset
      from public.kalusto k
     where k.luovutettu >= v_alku and k.luovutettu <= v_paattyi;

    v_pohja := round(v_alussa + v_hankinnat - v_luovutukset, 2);

    select p.poisto_toteutunut_eur
      into v_toteutunut
      from public.poistolaskelmat p
     where p.tilikausi_paattyi = v_paattyi;

    if v_pohja <= 0 then
      -- Luovutushinnat ylittivät pohjan. Poistoa ei ole, ja miinusmerkkinen
      -- jäännös on veronalaista tuloa - se näytetään, ei piiloteta nollaan.
      v_enintaan := 0;
      v_kertapoisto := false;
    elsif v_pohja <= 1200 then
      -- Pienen jäännöksen kertapoisto.
      v_enintaan := v_pohja;
      v_kertapoisto := true;
    else
      v_enintaan := round(v_pohja * 0.25, 2);
      v_kertapoisto := false;
    end if;

    v_lopussa := round(v_pohja - coalesce(v_toteutunut, v_enintaan), 2);

    insert into public.poistolaskelmat (
      tilikausi_paattyi, menojaannos_alussa_eur, hankinnat_eur, luovutushinnat_eur,
      poistopohja_eur, poisto_enintaan_eur, kertapoisto, menojaannos_lopussa_eur, laskettu
    )
    values (
      v_paattyi, v_alussa, v_hankinnat, v_luovutukset,
      v_pohja, v_enintaan, v_kertapoisto, v_lopussa, now()
    )
    on conflict (tilikausi_paattyi) do update
      set menojaannos_alussa_eur = excluded.menojaannos_alussa_eur,
          hankinnat_eur = excluded.hankinnat_eur,
          luovutushinnat_eur = excluded.luovutushinnat_eur,
          poistopohja_eur = excluded.poistopohja_eur,
          poisto_enintaan_eur = excluded.poisto_enintaan_eur,
          kertapoisto = excluded.kertapoisto,
          menojaannos_lopussa_eur = excluded.menojaannos_lopussa_eur,
          laskettu = now();

    v_alussa := v_lopussa;
  end loop;
end;
$$;

comment on function public.laske_poistoketju(date) is
  'Laskee poistoketjun ensimmäisestä hankintavuodesta annettuun tilikauteen ilman roolitarkistusta. Triggerin ja rajatun julkisivun käyttöön - ei kutsuoikeutta sovellukselle.';

revoke execute on function public.laske_poistoketju(date) from public, anon, authenticated;


-- Julkisivu sovellukselle: sama laskenta admin-portin takana.
create or replace function public.laske_poistolaskelmat(p_tilikausi_paattyi date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi laskea poistolaskelmia.';
  end if;
  perform public.laske_poistoketju(p_tilikausi_paattyi);
end;
$$;

comment on function public.laske_poistolaskelmat(date) is
  'Laskee poistoketjun. Kalusto laskee itsensä triggerillä, joten tätä tarvitaan vain kun laskelma halutaan luoda vuodelle jolla ei ole kalustotapahtumia.';

revoke execute on function public.laske_poistolaskelmat(date) from public, anon;
grant execute on function public.laske_poistolaskelmat(date) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Trigger
--
-- Laskenta ajetaan myöhäisimmällä koskettuneella vuodella, ei aikaisimmalla.
-- Funktio hakee ketjun alun itse - ensimmäisen hankintavuoden - ja parametri
-- määrää ketjun lopun. Aikaisempaan osuva kutsu ei siis loisi laskelmaa
-- lainkaan, jos hankintapäivä siirtyy eteenpäin vuoteen jolla laskelmaa ei
-- vielä ole.
--
-- Vuosiehdokkaat ovat OLD- ja NEW-rivin hankinta- ja luovutuspäivät, jolloin
-- päivän siirto vuodesta toiseen kattaa molemmat päät.
-- ---------------------------------------------------------------------

create or replace function public.kalusto_paivita_poistolaskelma()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_vuosi int;
begin
  select max(vuosi) into v_vuosi
  from (
    select extract(year from d)::int as vuosi
    from unnest(array[
      case when tg_op <> 'INSERT' then old.hankittu end,
      case when tg_op <> 'INSERT' then old.luovutettu end,
      case when tg_op <> 'DELETE' then new.hankittu end,
      case when tg_op <> 'DELETE' then new.luovutettu end
    ]) as d
    where d is not null
  ) as vuodet;

  if v_vuosi is not null then
    perform public.laske_poistoketju(make_date(v_vuosi, 12, 31));
  end if;

  return null;
end;
$$;

comment on function public.kalusto_paivita_poistolaskelma() is
  'Pitää poistolaskelman ajan tasalla riippumatta siitä mitä kautta kalustoa muutetaan.';

revoke execute on function public.kalusto_paivita_poistolaskelma() from public, anon, authenticated;

drop trigger if exists kalusto_poistolaskelma_trg on public.kalusto;
create trigger kalusto_poistolaskelma_trg
  after insert or update or delete on public.kalusto
  for each row execute function public.kalusto_paivita_poistolaskelma();


-- ---------------------------------------------------------------------
-- 3. Siirto kuitilta ei enää laske erikseen
--
-- Trigger hoitaa laskennan, joten funktion oma kutsu olisi sama laskenta
-- kahdessa paikassa.
-- ---------------------------------------------------------------------

create or replace function public.siirra_rivi_kalustoon(
  p_rivi_id uuid,
  p_nimi text default null,
  p_hankittu date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r        record;
  v_netto  numeric;
  v_id     uuid;
begin
  if not public.is_admin() then
    raise exception 'Vain admin voi siirtää hankintoja kalustoon.';
  end if;

  select kr.id, kr.teksti, kr.brutto_eur, kr.verokanta, kr.kuitti_id,
         k.paivays, k.toimittaja
    into r
    from public.kuitin_rivit kr
    join public.kuitit k on k.id = kr.kuitti_id
   where kr.id = p_rivi_id;

  if not found then
    raise exception 'Kuitin riviä ei löytynyt.';
  end if;

  if exists (select 1 from public.kalusto where kuitin_rivi_id = p_rivi_id) then
    raise exception 'Rivi on jo siirretty kalustoon.';
  end if;

  -- Hankintameno on ALV 0 %, ja rivillä oleva summa on brutto. Vero puretaan
  -- rivin omalla verokannalla samalla kaavalla kuin pienhankintojen katossa.
  v_netto := case
    when coalesce(r.verokanta, 0) > 0
      then round(r.brutto_eur / (1 + r.verokanta / 100.0), 2)
    else round(r.brutto_eur, 2)
  end;

  insert into public.kalusto (
    nimi, kuvaus, hankittu, hankintameno_eur, kuitti_id, kuitin_rivi_id, luoja_id
  )
  values (
    coalesce(nullif(btrim(p_nimi), ''), r.teksti),
    case when r.toimittaja is null then null else 'Kuitilta: ' || r.toimittaja end,
    coalesce(p_hankittu, r.paivays),
    v_netto,
    r.kuitti_id,
    r.id,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.siirra_rivi_kalustoon(uuid, text, date) is
  'Siirtää kuitin rivin kalustorekisteriin. Bruttosummasta puretaan vero rivin verokannalla, koska hankintameno on ALV 0 %. Poistolaskelman päivittää trigger.';

revoke execute on function public.siirra_rivi_kalustoon(uuid, text, date) from public, anon;
grant execute on function public.siirra_rivi_kalustoon(uuid, text, date) to authenticated;


-- Kuitilta siirretyn kalustorivin alkuperäinen bruttosumma näytetään
-- muokkauksessa vertailuksi, jotta nettona syötetty luku on tarkistettavissa.
comment on column public.kalusto.kuitti_id is
  'Kuitti josta hankinta on peräisin. Kalustorivin poisto ei poista kuittia eikä sen riviä.';
