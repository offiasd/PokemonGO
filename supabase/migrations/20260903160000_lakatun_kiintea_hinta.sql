-- Kiinteä hinta erikseen lakatulle työlle.
--
-- Perusvärin lakkaus on valinnainen lisä ja metallicille lakkaus tehdään aina
-- kun väri sitä vaatii. Molemmissa työ on kalliimpi kuin lakkaamaton: kaksi
-- värikerrosta ja lakan oma kulutus. Kiinteä kategoriahinta kattoi tähän asti
-- molemmat, joten lakkaus jäi veloittamatta silloin kun hinta oli lyöty
-- kiinni.
--
-- Tyhjänä lakattu työ käyttää edelleen kategorian omaa kiinteää hintaa, eli
-- vanhat osat toimivat kuten ennenkin.
alter table public.osa_kategoriahinnat
  add column if not exists hinta_lakattu numeric(12, 2);

comment on column public.osa_kategoriahinnat.hinta_lakattu is
  'Kiinteä asiakashinta kun työhön kuuluu lakkaus (solid + lakkaus, metallic + lakkaus). Null = käytä hinta-saraketta.';
