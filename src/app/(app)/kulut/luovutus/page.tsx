import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { KUUKAUDEN_NIMI } from "@/lib/vakiot";
import {
  paketinKuvaus,
  type LuovutuksenTarkistukset,
  type Vientiasetukset,
} from "@/lib/luovutus";

import { KuukaudenValinta } from "../kuukauden-valinta";
import { KulutValilehdet } from "../valilehdet";
import { LuovutusNakyma } from "./luovutus-nakyma";

/**
 * Kuukauden luovutus kirjanpitäjälle.
 *
 * Sivu kokoaa kauden joka avauksella: tarkistukset lasketaan tuoreina, jotta
 * äsken korjattu kuitti näkyy heti eikä vasta seuraavan automaattiajon
 * jälkeen. Kokoaminen tallentaa saman tuloksen kantaan, joten automaatti ja
 * käyttöliittymä näyttävät samaa tilaa.
 */
export default async function LuovutusSivu({
  searchParams,
}: {
  searchParams: Promise<{ kk?: string; vuosi?: string }>;
}) {
  await vaaditaanAdmin();
  const parametrit = await searchParams;
  const supabase = await createClient();

  const nyt = new Date();
  const vuosi = Number(parametrit.vuosi) || nyt.getUTCFullYear();
  const kuukausi = Number.isInteger(Number(parametrit.kk))
    ? Math.min(Math.max(Number(parametrit.kk), 0), 11)
    : nyt.getUTCMonth();
  const kausi = `${vuosi}-${String(kuukausi + 1).padStart(2, "0")}-01`;

  const { data: koottu, error } = await supabase.rpc("kokoa_luovutus", { p_kausi: kausi });
  const tarkistukset = (koottu ?? {
    kausi,
    kuitteja: 0,
    kuluina_eur: 0,
    yhteensa_eur: 0,
    tarkistukset: [],
    kunnossa: false,
  }) as LuovutuksenTarkistukset;

  const { data: luovutus } = await supabase
    .from("luovutukset")
    .select("id, tila, lahetetty_at")
    .eq("kausi", kausi)
    .maybeSingle();

  const { data: lokiRivit } = luovutus
    ? await supabase
        .from("luovutuksen_loki")
        .select("id, tapahtuma, aika, kuitteja, kuluina_eur, asetukset")
        .eq("luovutus_id", luovutus.id)
        .order("aika", { ascending: false })
    : { data: [] };

  const loki = (lokiRivit ?? []).map((rivi) => ({
    id: rivi.id,
    tapahtuma: rivi.tapahtuma,
    aika: rivi.aika,
    kuitteja: rivi.kuitteja,
    kuluina_eur: rivi.kuluina_eur,
    // Asetukset tallennettiin lähetyshetkellä; sama kuvaus kuin painikkeen yllä.
    kuvaus: rivi.asetukset ? paketinKuvaus(rivi.asetukset as Vientiasetukset) : null,
  }));

  return (
    <div className="grid gap-4">
      <KulutValilehdet />

      <KuukaudenValinta vuosi={vuosi} kuukausi={kuukausi} />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Kauden kokoaminen epäonnistui: {error.message}
        </p>
      )}

      <LuovutusNakyma
        kausi={kausi}
        kaudenNimi={`${KUUKAUDEN_NIMI[kuukausi]} ${vuosi}`}
        tarkistukset={tarkistukset}
        lukittu={luovutus?.tila === "lahetetty"}
        lahetetty={luovutus?.lahetetty_at ?? null}
        loki={loki}
      />
    </div>
  );
}
