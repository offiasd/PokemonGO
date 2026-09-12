<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.
This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

---

# Jauhemaalaamon hallintasovellus

Jauhemaalaamon toiminnanohjaus: värivarasto, osien hinnoittelu, työt ja
kuitit. Käyttäjiä on vähän — omistaja (admin) ja mahdollisesti
maalaaja.

## Pino

- Next.js 16, shadcn/ui, Tailwind v4
- Supabase: Postgres, Auth, RLS, Storage, Edge Functions
- Deploy: GitHub → Render (frontend), Supabase (tietokanta)
- Kuittien luku: Anthropic API, avain Supabasen salaisuudessa
  `ANTHROPIC_API_KEY`

## Kieli

**Kaikki suomeksi.** Käyttöliittymän tekstit, tietokannan taulu- ja
sarakenimet, funktiot, kommentit.

Nimet ilman ääkkösiä: `sailytettava_asti`, `kayttotarkoitus`,
`tyojen_talous`. Käyttöliittymän teksteissä ääkköset normaalisti.

## Yrityksen tilanne

Nämä ohjaavat oletuksia ja logiikkaa. Kaikki ovat asetuksia
`asetukset`-taulussa, älä kovakoodaa niitä:

- **Toiminimi**, ei osakeyhtiö
- **Ei ALV-rekisterissä** → ALV-sarakkeet piilossa, kulu on bruttohinta.
  ALV-tiedot silti poimitaan ja tallennetaan
- **Ei työntekijöitä** → luokkaa "Henkilökunnan tarjoilu" ei näytetä.
  Toiminimiyrittäjä ei ole oman itsensä työnantaja
- Ajoneuvo on yksityisvarallisuutta → ajoneuvokuluja ei käsitellä

## Periaatteet

**Sovellus ei tee verotuspäätöksiä.** Kuiteista kirjataan
käyttötarkoitus (mihin ostos meni), ei verokohtelua. Kirjanpitäjä
ratkaisee kohtelun. Vihjeet AVL-rajoituksista saa näyttää, mutta
selvästi vihjeinä.

**Verokannat luetaan kuitista**, ei päätellä tuoteryhmästä. Kannat
muuttuvat usein.

**Taloustiedot ovat admin-roolin takana.** Työntekijä ei näe
ostohintoja, tuntiveloituksia, katteita eikä kuitteja. Näkee värien
saldot, varastotäydennykset ja asiakkaalle asetetut hinnat.

RLS toimii riveillä, ei sarakkeilla — hintasarakkeet rajataan
sarakekohtaisilla oikeuksilla. Käyttöliittymän piilotus ei ole suoja.

**Historia ei saa muuttua takautuvasti.** Hinta lukitaan
kulutushetkellä työn riville. Näkymät lukevat valmiin luvun, eivät
laske hintaa uudelleen.

**Kuittien kuva tallennetaan muuttumattomana.** Luokittelu ja
muistiinpanot elävät erillään. Säilytysaika 6 vuotta sen
kalenterivuoden lopusta jona tilikausi päättyi (kirjanpitolaki 2:10 §).

## Mobiili on ensisijainen näkymä

Sovellusta käytetään puhelimella. **Tarkista jokainen
käyttöliittymämuutos 320 pikselin leveydellä** ennen kuin ilmoitat
olevasi valmis — sitä ei tarvitse erikseen pyytää.

Vaatimus: ei vaakavieritystä, ei näytön yli vuotavaa sisältöä, ei
päällekkäin meneviä elementtejä.

Tarkistuslista:

- Jokaisella flex-lapsella joka voi sisältää pitkää tekstiä on
  `min-width: 0`. Ilman sitä se ei kutistu sisältöään pienemmäksi,
  vaikka `overflow: hidden` olisi asetettu. Tämä on ylivoimaisesti
  yleisin syy ylivuotoon
- Pitkät tekstit katkaistaan. Tuotenimet kuten
  `PPS-11720 High Performance SC Clear` ja toimittajanimet ovat pitkiä
- Enintään kaksi saraketta rinnakkain. Kolmen sarakkeen taulukko ei
  mahdu puhelimeen — käytä korttiasettelua
- Ei kiinteitä pikselileveyksiä sisältöelementeille
- Luvut `tabular-nums`, jotta sarakkeet eivät hypi
- Pudotusvalikon sisältö ei saa olla valikkoa leveämpi

Kun muutat olemassa olevaa näkymää, tarkista myös ettei muutos riko
sen vieressä olevia.

## Työtapa

- **Lue toimeksiantotiedosto kokonaan** ennen kuin muutat mitään.
  Kerro suunnitelma ennen toteutusta
- Migraatiot omiksi tiedostoiksi `supabase/migrations/`, älä muuta
  tuotantoa suoraan
- Pidä tool call -hyväksynnät päällä, varsinkin DROP ja DELETE
- Älä laske samaa asiaa kahdessa paikassa. Jos trigger laskee sen,
  frontend ei laske
- Älä arvaa skeemaa — lue se kannasta

## Keskeiset taulut

- `varit` — maalit, saldot, hinnat, kiiltotasot, hakusanat
- `osat`, `osa_kategoriahinnat` — osat ja hinnoittelu maalityypeittäin
- `tyot`, `tyon_rivit` — työt ja rivit
- `kuitit`, `kuitin_rivit`, `kuitin_liitteet` — kuitit
- `kululuokat`, `kuittirivin_oppi` — luokittelu ja oppiminen
- `luovutukset`, `luovutuksen_loki` — kuukausiaineisto kirjanpitäjälle
- `asetukset` — yritysmuoto, ALV-rekisteri, rajat, oletusvärit

## Yksiköt ja valuutat

- Maalimäärät **grammoina** kannassa
- Prismatic Powders ilmoittaa paunoina ja dollareina.
  1 lb = 453,59237 g
- Vieraan valuutan kuitilla `loppusumma_valuutassa` on alkuperäinen.
  Euromäärä johdetaan `todellinen_eur`-kentästä (tililtä luettu
  veloitus) tai kurssista. **Älä arvaa kurssia**
- Pulverkönigin hinnat sisältävät Saksan ALV:n eikä sitä pureta
