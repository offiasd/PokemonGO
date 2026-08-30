-- Esimerkkidata paikalliseen kehitykseen (supabase db reset).
-- Ei sisällä auth.users-rivejä: luo käyttäjät kirjautumissivun kautta tai
-- Supabase Studiosta, ja aseta ensimmäinen admin-rooli käsin:
--   update public.profiles set role = 'admin' where id = '<user-uuid>';

insert into varit (nimi, valmistaja, alkupera, ostohinta_per_kg, tullimaksu_prosentti, alv_prosentti, toimituskulu_per_kg, saldo_g, halytysraja_g)
values
  ('Musta matta', 'Tiger Coatings', 'EU', 12.50, null, null, 0.80, 8500, 1000),
  ('Valkoinen kiiltävä', 'IGP Powder Coatings', 'EU', 13.90, null, null, 0.80, 400, 1000),
  ('Candy Red', 'Prismatic Powders', 'USA', 24.00, 4, 25.5, 3.50, 2200, 500),
  ('Metallic Silver', 'Cardinal Powder Coatings', 'USA', 19.50, 4, 25.5, 3.50, 6000, 500);

insert into osat (nimi, ajoneuvotyyppi, merkki, malli, vari_tyyppi, arvioitu_kulutus_g)
values
  ('Etupuskuri', 'auto', 'Volkswagen', 'Golf', 'yksivarinen', 450),
  ('Vanne 17"', 'auto', 'BMW', '3-sarja', 'metallic', 180),
  ('Runko', 'mopo', 'Piaggio', 'Vespa', 'candy', 900),
  ('Tankki', 'moottoripyora', 'Yamaha', 'MT-07', 'illusion', 350);

insert into osa_tyovaiheet (osa_id, vaihe, tarvitaan, arvioitu_kesto_min)
select id, 'pesu', true, 10 from osat where nimi = 'Etupuskuri'
union all select id, 'maalinpoisto', false, 0 from osat where nimi = 'Etupuskuri'
union all select id, 'puhallus', true, 15 from osat where nimi = 'Etupuskuri'
union all select id, 'teippaus', true, 10 from osat where nimi = 'Etupuskuri'
union all select id, 'maalaus', true, 25 from osat where nimi = 'Etupuskuri'
union all select id, 'pesu', true, 5 from osat where nimi = 'Vanne 17"'
union all select id, 'puhallus', true, 10 from osat where nimi = 'Vanne 17"'
union all select id, 'maalaus', true, 15 from osat where nimi = 'Vanne 17"';

insert into tuntiveloitukset (vaihe, tuntihinta)
values
  ('pesu', 35),
  ('puhallus', 40),
  ('teippaus', 40),
  ('maalinpoisto', 45),
  ('maalaus', 55);
