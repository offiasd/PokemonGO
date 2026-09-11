-- =====================================================================
-- Migraatio: poiminta lukee valuutassa, euro jää johdetuksi
--
-- Tausta:
--   Poiminnan JSON puhui yhä euroista: kentät olivat loppusumma_eur ja
--   brutto_eur, vaikka luvut ovat laskun omassa valuutassa. Nimi ohjaa
--   sekä mallia että lukijaa, ja väärä nimi on se kohta josta dollarit
--   päätyivät euro-sarakkeeseen.
--
--   Lisäksi euro-sarakkeisiin jäi vieraalla valuutalla valuutassa oleva
--   luku silloin kun muunnosta ei voitu tehdä. Se näyttää oikealta ja
--   summautuu kuukauden kuluihin väärin.
--
-- Ratkaisu:
--   Poiminta kirjoittaa *_valuutassa-kentät. Euromäärä on joko johdettu
--   tai nolla - ei koskaan luku toisessa valuutassa.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tuntematon euromäärä on nolla, ei vanha luku
-- ---------------------------------------------------------------------

create or replace function public.paivita_kuitin_eurot(p_kuitti_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  k              record;
  v_eur_yhteensa numeric(12,2);
  v_kurssi       numeric(20,10);
  v_summa        numeric(12,2);
  v_erotus       numeric(12,2);
  v_isoin_id     uuid;
begin
  select * into k from public.kuitit where id = p_kuitti_id;
  if not found then
    return;
  end if;

  -- EUR-kuitti: ei muunnosta, sarakkeet ovat sama luku. Kumpi niistä kertoo
  -- summan, riippuu kirjoittajasta: lomake kirjoittaa euron, mutta valuutan
  -- vaihdon jälkeen luku on valuuttasarakkeessa ja euro on nollattu. Nollaa ei
  -- siis oteta totuudeksi, vaan tyhjä täydennetään toisesta sarakkeesta.
  if k.valuutta = 'EUR' then
    update public.kuitit
       set loppusumma_eur = coalesce(nullif(loppusumma_eur, 0), loppusumma_valuutassa, 0),
           loppusumma_valuutassa = coalesce(nullif(loppusumma_eur, 0), loppusumma_valuutassa, 0),
           kurssin_lahde = 'sama',
           todellinen_eur = null,
           valuuttakurssi = null
     where id = p_kuitti_id
       and (loppusumma_valuutassa is distinct from loppusumma_eur
            or kurssin_lahde is distinct from 'sama'
            or todellinen_eur is not null
            or valuuttakurssi is not null);

    update public.kuitin_rivit
       set brutto_eur = coalesce(nullif(brutto_eur, 0), brutto_valuutassa, 0),
           brutto_valuutassa = coalesce(nullif(brutto_eur, 0), brutto_valuutassa, 0)
     where kuitti_id = p_kuitti_id
       and brutto_valuutassa is distinct from brutto_eur;
    return;
  end if;

  -- Vieras valuutta ilman alkuperäistä summaa tai ilman veloitusta ja
  -- kurssia: euromäärää ei voi johtaa. Euro-sarakkeet nollataan sen sijaan
  -- että niihin jäisi valuutassa oleva luku - 643,09 dollaria euroina on
  -- juuri se virhe, jonka takia valuutta ylipäätään tallennetaan.
  if k.loppusumma_valuutassa is null
     or k.loppusumma_valuutassa = 0
     or (k.todellinen_eur is null and k.valuuttakurssi is null) then
    -- Myös kurssin lähde nollataan: ilman sitä tililtä syötetyn veloituksen
    -- poistaminen jättäisi kuitin näyttämään vahvistetulta, vaikka euromäärä
    -- on jälleen nolla.
    update public.kuitit
       set loppusumma_eur = 0,
           kurssin_lahde = null
     where id = p_kuitti_id
       and (loppusumma_eur <> 0 or kurssin_lahde is not null);

    update public.kuitin_rivit
       set brutto_eur = 0
     where kuitti_id = p_kuitti_id
       and brutto_eur <> 0;
    return;
  end if;

  -- Pankin veloitus voittaa lasketun kurssin
  if k.todellinen_eur is not null then
    v_eur_yhteensa := k.todellinen_eur;
    update public.kuitit set kurssin_lahde = 'pankki' where id = p_kuitti_id;
  else
    v_eur_yhteensa := round(k.loppusumma_valuutassa * k.valuuttakurssi, 2);
    update public.kuitit set kurssin_lahde = 'kurssi' where id = p_kuitti_id;
  end if;

  v_kurssi := v_eur_yhteensa::numeric / k.loppusumma_valuutassa::numeric;

  update public.kuitit
     set loppusumma_eur = v_eur_yhteensa
   where id = p_kuitti_id;

  update public.kuitin_rivit
     set brutto_eur = round(coalesce(brutto_valuutassa, 0) * v_kurssi, 2)
   where kuitti_id = p_kuitti_id;

  -- Pyöristysero suurimmalle riville, jotta rivit summautuvat
  -- loppusummaan ja täsmäytys menee läpi
  select coalesce(sum(brutto_eur), 0) into v_summa
    from public.kuitin_rivit where kuitti_id = p_kuitti_id;

  v_erotus := v_eur_yhteensa - v_summa;

  if v_erotus <> 0 then
    select id into v_isoin_id
      from public.kuitin_rivit
     where kuitti_id = p_kuitti_id
     order by abs(brutto_eur) desc nulls last
     limit 1;

    if v_isoin_id is not null then
      update public.kuitin_rivit
         set brutto_eur = brutto_eur + v_erotus
       where id = v_isoin_id;
    end if;
  end if;
end;
$$;

comment on function public.paivita_kuitin_eurot(uuid) is
  'Laskee kuitin ja sen rivien euromäärät. Pankin todellinen veloitus on ensisijainen, laskettu kurssi varalla. Ilman kumpaakaan euromäärä on nolla, ei valuutassa oleva luku. Pyöristysero ohjataan suurimmalle riville jotta täsmäytys menee läpi.';


-- ---------------------------------------------------------------------
-- 2. Poiminta kirjoittaa valuutassa
--
-- Malli lukee kuitin luvut sellaisina kuin ne kuitissa ovat, joten kenttien
-- nimissä lukee valuutta eikä euro. Euromäärän kirjoittaa vain EUR-laskulla
-- - vieraalla valuutalla sen johtaa paivita_kuitin_eurot, kun veloitus tai
-- kurssi tiedetään.
-- ---------------------------------------------------------------------

create or replace function public.tallenna_poiminta(p_kuitti_id uuid, p_poiminta jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rivi jsonb;
  v_jarjestys integer := 0;
  v_kayttotarkoitus text;
  v_kululuokka uuid;
  v_valuutta text;
  v_lopullinen text;
  v_summa numeric;
  v_brutto numeric;
begin
  v_valuutta := upper(nullif(btrim(coalesce(p_poiminta->>'valuutta', '')), ''));
  if v_valuutta !~ '^[A-Z]{3}$' then
    v_valuutta := null;
  end if;
  v_summa := (p_poiminta->>'loppusumma_valuutassa')::numeric;

  update public.kuitit
  set toimittaja = coalesce(nullif(p_poiminta->>'toimittaja', ''), toimittaja),
      paivays = coalesce((p_poiminta->>'paivays')::date, paivays),
      maksupaiva = coalesce((p_poiminta->>'maksupaiva')::date, maksupaiva),
      valuutta = coalesce(v_valuutta, valuutta),
      loppusumma_valuutassa = coalesce(v_summa, loppusumma_valuutassa),
      loppusumma_eur = case
        when coalesce(v_valuutta, valuutta) = 'EUR' then coalesce(v_summa, loppusumma_eur)
        else loppusumma_eur
      end,
      tositenumero = coalesce(nullif(p_poiminta->>'tositenumero', ''), tositenumero),
      tositetyyppi = coalesce(
        nullif(p_poiminta->>'tositetyyppi', ''),
        tositetyyppi
      ),
      alv_erittely = case
        when jsonb_typeof(p_poiminta->'alv_erittely') = 'array' then p_poiminta->'alv_erittely'
        else alv_erittely
      end,
      updated_at = now()
  where id = p_kuitti_id
  returning valuutta into v_lopullinen;

  if not found then
    raise exception 'Kuittia ei löytynyt.';
  end if;

  delete from public.kuitin_rivit where kuitti_id = p_kuitti_id;

  for v_rivi in select * from jsonb_array_elements(coalesce(p_poiminta->'rivit', '[]'::jsonb))
  loop
    -- Avain normalisoidaan samalla tavalla kuin sovelluksessa: pienet
    -- kirjaimet ja yhdet välilyönnit.
    v_kayttotarkoitus := null;
    v_kululuokka := null;
    select o.kayttotarkoitus, o.kululuokka_id
    into v_kayttotarkoitus, v_kululuokka
    from public.kuittirivin_oppi o
    where o.teksti = btrim(lower(regexp_replace(coalesce(v_rivi->>'teksti', ''), '\s+', ' ', 'g')));

    v_brutto := coalesce((v_rivi->>'brutto_valuutassa')::numeric, 0);

    insert into public.kuitin_rivit (
      kuitti_id, teksti, maara, yksikko, brutto_eur, brutto_valuutassa, verokanta,
      kayttotarkoitus, kululuokka_id, jarjestys
    )
    values (
      p_kuitti_id,
      coalesce(nullif(btrim(v_rivi->>'teksti'), ''), 'Rivi'),
      (v_rivi->>'maara')::numeric,
      nullif(btrim(coalesce(v_rivi->>'yksikko', '')), ''),
      case when v_lopullinen = 'EUR' then v_brutto else 0 end,
      v_brutto,
      (v_rivi->>'verokanta')::numeric,
      v_kayttotarkoitus,
      v_kululuokka,
      v_jarjestys
    );

    v_jarjestys := v_jarjestys + 1;
  end loop;

  -- Rivit kirjoitettiin vasta nyt, joten euromäärät lasketaan tässä eikä
  -- kuitin triggerissä.
  perform public.paivita_kuitin_eurot(p_kuitti_id);

  -- Luettu kuitti odottaa aina ihmisen silmää: poiminta on ehdotus, ei totuus.
  update public.kuitit
  set tila = 'tarkistettava',
      poiminnan_tila = 'luettu',
      poiminnan_virhe = null,
      updated_at = now()
  where id = p_kuitti_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Backfill: vahvistamaton euromäärä nollaksi
-- ---------------------------------------------------------------------

update public.kuitit
   set loppusumma_eur = 0
 where valuutta <> 'EUR'
   and kurssin_lahde is null
   and loppusumma_eur <> 0;

update public.kuitin_rivit r
   set brutto_eur = 0
  from public.kuitit k
 where k.id = r.kuitti_id
   and k.valuutta <> 'EUR'
   and k.kurssin_lahde is null
   and r.brutto_eur <> 0;


-- ---------------------------------------------------------------------
-- 4. Tarkistus ajon jälkeen
-- ---------------------------------------------------------------------
-- select toimittaja, valuutta, loppusumma_valuutassa, loppusumma_eur,
--        todellinen_eur, kurssin_lahde
--   from kuitit where valuutta <> 'EUR';
--
-- Odotus: NIC INDUSTRIES -> loppusumma_valuutassa 643.09, loppusumma_eur 0.
