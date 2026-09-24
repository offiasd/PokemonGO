-- =====================================================================
-- Migraatio: arkistoidun lisätyörivin sarakeoikeudet
--
-- Työhistoria näyttää nyt myös arkistoidut lisätyöt, jotta pohjaväri ja
-- lakka eivät katoa arkistoidusta työstä. Samalla paljastui, että
-- arkistoidut_rivin_lisatyot on ainoa työn taulu jossa ajat ja
-- kustannukset ovat kirjautuneen luettavissa - tyon_rivin_lisatyot,
-- tyon_rivit ja niiden arkistoversiot rajaavat ne pois.
--
-- RLS toimii riveillä, ei sarakkeilla, joten rajaus tehdään
-- sarakeoikeuksilla. Admin lukee luvut talousnäkymien kautta, jotka
-- ajetaan omistajan oikeuksin.
-- =====================================================================

revoke select (teippaus_min, maalaus_min, vari_hinta_per_kg, maalikustannus_eur, hinta_lukittu_at)
  on public.arkistoidut_rivin_lisatyot from authenticated;
