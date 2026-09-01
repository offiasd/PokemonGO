# Jauhemaalaamon seurantasovellus

Web-sovellus jauhemaalaamon värivaraston, osalistan ja kustannusten hallintaan.
Ks. `Jauhemaalaamon seurantasovellus – tekninen spesifikaatio (v2)` alkuperäiselle
vaatimusmäärittelylle.

**Teknologiapino**

- Next.js 16 (App Router, Turbopack), TypeScript, Tailwind v4, shadcn/ui-tyylinen
  komponentisto (kirjoitettu käsin, koska `ui.shadcn.com`-rekisteriin ei ollut
  verkkoyhteyttä kehitysympäristössä - katso `components.json` ja
  `src/components/ui/`)
- Supabase (Postgres, Auth, RLS, Storage, Edge Functions)
- Deploy: GitHub -> Render.com (käyttöliittymä), Supabase.com (tietokanta)

## Kehitys paikallisesti

1. Asenna riippuvuudet:

   ```bash
   npm install
   ```

2. Luo Supabase-projekti (https://supabase.com) ja aja migraatiot
   `supabase/migrations/`-hakemistosta joko Supabase CLI:llä

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   tai liittämällä tiedostot järjestyksessä Supabase Studion SQL-editoriin.

3. Julkaise Edge Functionit (`supabase/functions/hae-tuotetiedot`,
   `supabase/functions/varastohalytys`):

   ```bash
   npx supabase functions deploy hae-tuotetiedot
   npx supabase functions deploy varastohalytys
   ```

4. Kopioi `.env.example` -> `.env.local` ja täytä Supabase-projektin
   `Project Settings -> API`-arvot.

5. Luo ensimmäinen käyttäjä Supabase Studion Authentication-näkymästä (tai
   `/kirjaudu`-sivulla, jos `enable_signup` on päällä), ja aseta hänelle
   admin-rooli SQL-editorista:

   ```sql
   update public.profiles set role = 'admin' where id = '<käyttäjän-uuid>';
   ```

6. Käynnistä kehityspalvelin:

   ```bash
   npm run dev
   ```

   Sovellus löytyy osoitteesta http://localhost:3000.

Esimerkkidataa löytyy tiedostosta `supabase/seed.sql` (värit, osat, työvaiheet,
tuntiveloitukset - ei käyttäjiä, koska `auth.users`-rivit pitää luoda Authin
kautta).

## Projektirakenne

- `src/app/(app)/` - kirjautuneen käyttäjän näkymät (roolipohjainen navigaatio
  `sovellus-navigaatio.tsx`:ssä)
- `src/app/kirjaudu/` - kirjautumissivu
- `src/lib/supabase/` - Supabase-asiakkaat (selain/palvelin/proxy), tyypit,
  käyttäjä-/asetushelperit
- `src/proxy.ts` - istunnon päivitys ja pääsynhallinta (Next.js 16:ssa entinen
  `middleware.ts` on nimetty uudelleen `proxy.ts`:ksi)
- `supabase/migrations/` - tietokantarakenne, funktiot, triggerit, RLS
- `supabase/functions/` - Edge Functionit ("Hae tiedot" -haku, varastohälytys)

## Testaus ja laadunvarmistus

```bash
npm run lint
npm run build
```

CI (`.github/workflows/ci.yml`) ajaa nämä jokaisessa pushissa/PR:ssä.

Supabase-yhteyden ja kannan tilan voi tarkistaa yhdellä komennolla:

```bash
npm run testaa-supabase
```

Se kertoo mm. onko jokin migraatio ajamatta ja ovatko Edge Functionit
julkaistu. Ei kirjoita mitään.

## Supabase-yhteys Claude Codelle

Claude Code voi ajaa migraatiot ja julkaista Edge Functionit itse, kun sille
antaa pääsyn Supabasen Management APIin. Tunnus **ei kuulu ympäristö-
muuttujiin**: ne ovat luettavissa jokaisessa istunnossa, ja Claude Coden oma
lomake varoittaa siitä.

### 1. Ympäristömuuttuja (ei salainen)

Claude Coden ympäristöasetuksiin, kenttään Environment variables:

```
SUPABASE_PROJECT_REF=<project ref>
```

Project ref löytyy kohdasta Project Settings -> General. Se ei ole salaisuus:
sama tunnus on julkisen API-osoitteen aliverkkotunnuksena selainniputuksessa.

### 2. Access token (salainen)

Saman lomakkeen kohdasta **API credentials** (Environment variables -kentän
alapuolella) -> Add credential:

| Kenttä | Arvo |
|---|---|
| Name | `Supabase Management API` |
| Allowed websites | `api.supabase.com` |
| Credential type | Bearer |
| Custom headers | `Authorization`, prefix `Bearer`, value = personal access token |

Token luodaan osoitteessa supabase.com/dashboard/account/tokens.

Anthropicin agent proxy liittää tunnuksen pyyntöihin vasta sen jälkeen kun ne
ovat poistuneet istunnon virtuaalikoneelta, joten token ei näy Claudelle, sen
ajamille komennoille eikä ympäristömuuttujissa. Tallennettua arvoa ei voi
katsoa jälkikäteen - muutos tehdään poistamalla ja lisäämällä uudelleen.

Huomaa että personal access token on tilikohtainen: se antaa pääsyn kaikkiin
organisaation projekteihin, ei vain tähän. Luo siis oma token tätä varten ja
mitätöi se, kun sitä ei enää tarvita.

### 3. Käyttö istunnossa

Tunnus tulee mukaan automaattisesti, joten pyynnön voi tehdä ilman avainta:

```bash
# SQL (migraatiot)
curl -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "select 1"}'

# Edge Functionien listaus
curl "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/functions"
```

Muut käytössä olevat polut: `/database/migrations`, `/functions/deploy`,
`/types/typescript`, `/advisors/security`.

Migraatiot ajetaan Management APIn yli HTTPS:llä, koska suora Postgres-yhteys
(portti 5432) ei ole auki Claude Coden verkkoympäristössä edes Full-tason
verkko-oikeuksilla - `supabase db push` ja `psql` eivät siis toimi siellä.

### Vaihtoehto: MCP-palvelin

`.mcp.json` määrittää Supabasen virallisen MCP-palvelimen, joka tarjoaa samat
toiminnot valmiina työkaluina (`apply_migration`, `execute_sql`,
`deploy_edge_function`). Se lukee tunnuksen ympäristömuuttujasta
`SUPABASE_ACCESS_TOKEN`, eli token päätyy istunnon sisään - käytä tätä vain,
jos hyväksyt sen. Yllä kuvattu API credential on turvallisempi tapa.

## Deploy

- **Käyttöliittymä (Render.com)**: `render.yaml` määrittää Node-web-servicen.
  Yhdistä repo Renderiin ja aseta ympäristömuuttujat
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) Renderin dashboardista - niitä ei tallenneta
  `render.yaml`-tiedostoon.
- **Tietokanta (Supabase.com)**: migraatiot `supabase db push` tai Supabasen
  GitHub-integraation kautta.

## Roolit

| Rooli | Oikeudet |
|---|---|
| **admin** | Kaikki: värien/osien hallinta, hinnoitteluasetukset, raportit, käyttäjät |
| **maalaaja** | Kirjaa maalaustapahtumia, näkee saldot ja osalistan. Ei näe kilohintoja/tuntiveloitusta ellei admin salli (`asetukset.nayta_hinnat_maalaajalle`) |
