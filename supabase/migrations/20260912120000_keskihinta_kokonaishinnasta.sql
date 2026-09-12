-- =====================================================================
-- Migraatio: liukuva keskihinta laskee yhdestä hintaperusteesta
--
-- Ongelma:
--   Painotettu keskiarvo summasi kaksi eri asiaa. Kun värillä ei vielä ole
--   erää, varit.ostohinta_per_kg on raakahinta ilman rahtia, tullia ja
--   ALV:tä - ne lisätään vasta vari_kokonaishinta_per_kg-funktiossa
--   asetusten prosenteilla. Erän hankintahinta_per_kg taas sisältää kulut
--   valmiiksi.
--
--   Kaava siis painotti raakahintaisen vanhan saldon kuluineen lasketulla
--   uudella erällä. Tulos alitti todellisen kustannuksen, ja esikatselun
--   "keskihinta ennen" näytti liian pienen luvun.
--
-- Korjaus:
--   Vanha saldo arvostetaan kokonaishinnalla ensimmäisellä kerralla.
--   vari_kokonaishinta_rajaamaton tekee juuri tämän valinnan jo nyt:
--   erähinnoitellulle värille keskihinta sellaisenaan, muille
--   prosenttikaava. Sitä kutsutaan, eikä haaraa kirjoiteta toiseen kertaan.
--
--   Rajaamatonta versiota, koska vari_kokonaishinta palauttaa NULLin muille
--   kuin adminille. Laskenta ajetaan security definer -kontekstissa, jossa
--   roolitarkistus ei kuulu asiaan.
--
--   Ensimmäisen erän jälkeen hinta_erista on tosi ja ostohinta_per_kg
--   sisältää kulut, joten seuraavat erät laskevat oikein ilman
--   erikoiskäsittelyä - sama funktio palauttaa silloin sarakkeen sellaisenaan.
--
-- Backfill:
--   Ei tarvita. Kannassa ei ole yhtään erää eikä yhtään erähinnoiteltua
--   väriä, joten väärää lukua ei ole ehtinyt kirjautua mihinkään.
--
-- varastotilannekuvat lukee hinnan jo vari_kokonaishinta_rajaamaton-
-- funktiosta eikä sarakkeesta suoraan, joten se on oikein eikä muutu tässä.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tallentava laskenta
--
-- Muutos on yksi rivi: vanha keskihinta luetaan funktiosta, ei sarakkeesta.
-- Sama luku kirjautuu varastotayennykset.keskihinta_ennen_per_kg-sarakkeeseen,
-- joten audit-tieto vastaa laskennassa käytettyä arvoa.
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

    -- Vanha saldo samalla perusteella kuin erän hinta: kuluineen. Ennen
    -- ensimmäistä erää sarakkeessa on raakahinta, ja sen painottaminen
    -- kuluineen laskettua erää vastaan alittaisi todellisen kustannuksen.
    v_vanha_keskihinta := public.vari_kokonaishinta_rajaamaton(r.vari_id);
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
      -- jäävät koskematta. Väri on tässä vaiheessa jo erähinnoiteltu, joten
      -- funktio palauttaa keskihinnan sellaisenaan.
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
  'Jakaa erän kulut riveille ja päivittää värien liukuvan keskihinnan. Vanha saldo arvostetaan vari_kokonaishinta_rajaamaton-funktiolla, jotta painotettavat luvut ovat samalla perusteella. Uudelleen ajettuna korjaa aiemman arvion erotuksella, ei laske historiaa uusiksi.';

revoke execute on function public.laske_eran_hinnat(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Esikatselu lukee saman luvun
--
-- Esikatselun tarkoitus on näyttää mitä tallennus tekee. Jos se lukee eri
-- lähteestä kuin laskenta, se näyttää väärän luvun juuri siinä kohdassa
-- jossa virhe pitäisi huomata.
-- ---------------------------------------------------------------------

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
    -- Kokonaishinta funktiosta, sama kuin laske_eran_hinnat käyttää.
    select v.id, v.nimi, v.valmistaja, v.saldo_g,
           public.vari_kokonaishinta_rajaamaton(v.id) as kokonaishinta_per_kg
      into v_vari
      from public.varit v
     where v.id = (h->>'vari_id')::uuid;
    if not found then
      continue;
    end if;

    v_maara := coalesce((h->>'maara_g')::numeric, 0);
    v_hankinta := (h->>'hankintahinta_per_kg')::numeric;

    v_vanha := coalesce((v_hinnat_nyt->>(v_vari.id::text))::numeric, v_vari.kokonaishinta_per_kg);
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
  'Laskee erän kilohinnat ja niistä seuraavat keskihinnat tallentamatta mitään. Keskihinta ennen luetaan samasta funktiosta kuin tallennuksessa, jotta näyttö ja laskenta eivät eroa.';

revoke execute on function public.esikatsele_maaliera(jsonb, numeric, numeric, numeric) from public, anon;
grant execute on function public.esikatsele_maaliera(jsonb, numeric, numeric, numeric) to authenticated;
