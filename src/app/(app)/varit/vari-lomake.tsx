"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2, Palette, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TiedostoLataus } from "@/components/tiedosto-lataus";
import { createClient } from "@/lib/supabase/client";
import type { Alkupera, Database, MaaliTyyppi, Varisavy } from "@/lib/supabase/database.types";
import {
  MAALI_TYYPIT,
  muotoileEuro,
  paattelyVarisavy,
  VARISAVYN_VARIKOODI,
  varinLisavaatimus,
  VARISAVYT,
} from "@/lib/vakiot";

import type { VariLomakeTila } from "./actions";

const TYHJA_VARI_TILA: VariLomakeTila = { virhe: null, viesti: null };

type VariRow = Database["public"]["Tables"]["varit"]["Row"];

interface VariLomakeProps {
  vari?: VariRow;
  lisakategoriat?: MaaliTyyppi[];
  formAction: (tila: VariLomakeTila, formData: FormData) => Promise<VariLomakeTila>;
  asetuksetOletusHalytysraja: number;
  toimituskuluOletusEu: number;
  toimituskuluOletusUsa: number;
  toimituskuluOletusMuu: number;
  tullimaksuOletus: number;
  alvOletus: number;
}

function TallennaNappi({ uusi }: { uusi: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {uusi ? "Luo väri" : "Tallenna muutokset"}
    </Button>
  );
}

export function VariLomake({
  vari,
  lisakategoriat: alkuLisakategoriat = [],
  formAction,
  asetuksetOletusHalytysraja,
  toimituskuluOletusEu,
  toimituskuluOletusUsa,
  toimituskuluOletusMuu,
  tullimaksuOletus,
  alvOletus,
}: VariLomakeProps) {
  const [tila, kutsuAction] = useActionState(formAction, TYHJA_VARI_TILA);
  const [nimi, setNimi] = useState(vari?.nimi ?? "");
  const [valmistaja, setValmistaja] = useState(vari?.valmistaja ?? "");
  const [alkupera, setAlkupera] = useState<Alkupera>(vari?.alkupera ?? "EU");
  const [ostohintaPerKg, setOstohintaPerKg] = useState<string>(
    vari?.ostohinta_per_kg !== undefined && vari?.ostohinta_per_kg !== null
      ? String(vari.ostohinta_per_kg)
      : ""
  );
  const [kuvaUrl, setKuvaUrl] = useState<string | null>(vari?.kuva_url ?? null);
  const [ohjeTiedostoUrl, setOhjeTiedostoUrl] = useState<string | null>(
    vari?.ohje_tiedosto_url ?? null
  );
  const [kiiltoaste, setKiiltoaste] = useState(vari?.kiiltoaste ?? "");
  const [tyyppi, setTyyppi] = useState<MaaliTyyppi>(vari?.tyyppi ?? "solid");
  const [varisavy, setVarisavy] = useState<Varisavy | "">(vari?.varisavy ?? "");
  const [lisakategoriat, setLisakategoriat] = useState<MaaliTyyppi[]>(alkuLisakategoriat);
  const [alkuperainenHinta, setAlkuperainenHinta] = useState<number | null>(
    vari?.alkuperainen_hinta ?? null
  );
  const [alkuperainenValuutta, setAlkuperainenValuutta] = useState<string | null>(
    vari?.alkuperainen_valuutta ?? null
  );
  const [alkuperainenYksikko, setAlkuperainenYksikko] = useState<string | null>(
    vari?.alkuperainen_yksikko ?? null
  );
  const [myyjaLinkki, setMyyjaLinkki] = useState(vari?.myyja_linkki ?? "");
  const [haetaan, setHaetaan] = useState(false);
  const lomakeRef = useRef<HTMLFormElement>(null);

  // Uuden värin luonnin jälkeen nollataan koko lomake (kontrolloidut kentät tässä,
  // ei-kontrolloidut alla olevassa effektissä lomakkeen resetin kautta), jotta
  // seuraavan värin lisääminen onnistuu heti ilman sivun uudelleenlatausta.
  const [edellinenTila, setEdellinenTila] = useState(tila);
  if (tila !== edellinenTila) {
    setEdellinenTila(tila);
    if (!vari && tila.viesti) {
      setNimi("");
      setValmistaja("");
      setAlkupera("EU");
      setOstohintaPerKg("");
      setKuvaUrl(null);
      setOhjeTiedostoUrl(null);
      setKiiltoaste("");
      setTyyppi("solid");
      setVarisavy("");
      setLisakategoriat([]);
      setAlkuperainenHinta(null);
      setAlkuperainenValuutta(null);
      setAlkuperainenYksikko(null);
      setMyyjaLinkki("");
    }
  }

  useEffect(() => {
    if (!vari && tila.viesti) {
      toast.success(tila.viesti);
      lomakeRef.current?.reset();
    }
  }, [tila, vari]);

  const toimituskuluOletus =
    alkupera === "EU" ? toimituskuluOletusEu : alkupera === "USA" ? toimituskuluOletusUsa : toimituskuluOletusMuu;

  async function haeTiedot() {
    if (!myyjaLinkki) {
      toast.error("Anna ensin linkki myyjän tuotesivulle.");
      return;
    }
    setHaetaan(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("hae-tuotetiedot", {
        body: { url: myyjaLinkki },
      });

      if (error) {
        toast.error(`Haku epäonnistui: ${error.message}`);
        return;
      }
      if (data?.virhe) {
        toast.warning(data.virhe);
      }
      if (data?.nimi && !nimi) {
        setNimi(data.nimi);
      }
      if (data?.valmistaja && !valmistaja) {
        setValmistaja(data.valmistaja);
      }
      if (data?.kuva_url) {
        setKuvaUrl(data.kuva_url);
        toast.success("Kuva löytyi ja täytettiin.");
      }
      if (data?.ohje_tiedosto_url) {
        setOhjeTiedostoUrl(data.ohje_tiedosto_url);
        toast.success("Ohjetiedosto (datasheet) löytyi ja täytettiin.");
      }
      if (data?.kiiltoaste) {
        setKiiltoaste(data.kiiltoaste);
      }
      if (data?.tyyppi) {
        setTyyppi(data.tyyppi as MaaliTyyppi);
      }
      if (data?.varisavy) {
        setVarisavy(data.varisavy as Varisavy);
      }
      if (data?.alkupera) {
        setAlkupera(data.alkupera as Alkupera);
      }
      if (typeof data?.ostohinta_per_kg === "number") {
        setOstohintaPerKg(String(data.ostohinta_per_kg));
        toast.success(
          `Hinta muunnettu: ${data.ostohinta_per_kg} €/kg (lähde: ${data.alkuperainen_hinta} ${data.alkuperainen_valuutta}/${data.alkuperainen_yksikko}).`
        );
      }
      setAlkuperainenHinta(data?.alkuperainen_hinta ?? null);
      setAlkuperainenValuutta(data?.alkuperainen_valuutta ?? null);
      setAlkuperainenYksikko(data?.alkuperainen_yksikko ?? null);
    } catch {
      toast.error(
        "Haku epäonnistui - tarkista että Edge Function 'hae-tuotetiedot' on julkaistu Supabase-projektissa."
      );
    } finally {
      setHaetaan(false);
    }
  }

  return (
    <form ref={lomakeRef} action={kutsuAction} className="grid gap-6">
      <input type="hidden" name="kuva_url" value={kuvaUrl ?? ""} />
      <input type="hidden" name="ohje_tiedosto_url" value={ohjeTiedostoUrl ?? ""} />
      <input type="hidden" name="alkuperainen_hinta" value={alkuperainenHinta ?? ""} />
      <input type="hidden" name="alkuperainen_valuutta" value={alkuperainenValuutta ?? ""} />
      <input type="hidden" name="alkuperainen_yksikko" value={alkuperainenYksikko ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="nimi">Nimi *</Label>
          <Input
            id="nimi"
            name="nimi"
            required
            value={nimi}
            onChange={(e) => setNimi(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="valmistaja">Valmistaja</Label>
          <Input
            id="valmistaja"
            name="valmistaja"
            value={valmistaja}
            onChange={(e) => setValmistaja(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="kiiltoaste">Kiiltoaste (Gloss unit)</Label>
          <Input
            id="kiiltoaste"
            name="kiiltoaste"
            placeholder="esim. High Gloss (85+ GU)"
            value={kiiltoaste}
            onChange={(e) => setKiiltoaste(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tyyppi">Maalin tyyppi</Label>
          <Select
            name="tyyppi"
            value={tyyppi}
            onValueChange={(v) => {
              setTyyppi(v as MaaliTyyppi);
              setLisakategoriat((l) => l.filter((k) => k !== v));
            }}
          >
            <SelectTrigger id="tyyppi" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAALI_TYYPIT.map(({ arvo, nimi }) => (
                <SelectItem key={arvo} value={arvo}>
                  {nimi}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tyyppi !== "transparent" && (
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="varisavy">Värisävy (suodatusta varten)</Label>
          <div className="flex gap-2">
            <Select
              name="varisavy"
              value={varisavy || "ei_asetettu"}
              onValueChange={(v) => setVarisavy(v === "ei_asetettu" ? "" : (v as Varisavy))}
            >
              <SelectTrigger id="varisavy" className="w-full">
                <SelectValue placeholder="Ei asetettu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ei_asetettu">Ei asetettu</SelectItem>
                {VARISAVYT.map(({ arvo, nimi }) => (
                  <SelectItem key={arvo} value={arvo}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block size-3 rounded-full border"
                        style={{ backgroundColor: VARISAVYN_VARIKOODI[arvo] }}
                      />
                      {nimi}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const paatelty = paattelyVarisavy(nimi);
                if (paatelty) {
                  setVarisavy(paatelty);
                } else {
                  toast.warning("Värisävyä ei tunnistettu nimestä - valitse manuaalisesti.");
                }
              }}
            >
              <Palette className="size-4" />
              Tunnista nimestä
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2 rounded-md border p-4">
        <Label className="font-medium">Lisäkategoriat (valinnainen)</Label>
        <p className="text-xs text-muted-foreground">
          Käytä kun sama väri myydään useamman kategorian alla - esim. kromiväri on sekä Metallic
          että Pohjavärit (käytetään myös candyn pohjana). Työt-sivun värivalinnat suodattuvat
          näiden mukaan.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MAALI_TYYPIT.filter(({ arvo }) => arvo !== tyyppi).map(({ arvo, nimi }) => (
            <div key={arvo} className="flex items-center gap-2">
              <Checkbox
                id={`lisakategoria_${arvo}`}
                name={`lisakategoria_${arvo}`}
                checked={lisakategoriat.includes(arvo)}
                onCheckedChange={(v) =>
                  setLisakategoriat((l) =>
                    v === true ? [...l, arvo] : l.filter((k) => k !== arvo)
                  )
                }
              />
              <Label htmlFor={`lisakategoria_${arvo}`} className="font-normal">
                {nimi}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {varinLisavaatimus(tyyppi) && (
        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {varinLisavaatimus(tyyppi)} Tieto lisätään värin sivulle automaattisesti
          maalityypin perusteella.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="alkupera">Alkuperä</Label>
          <Select
            name="alkupera"
            value={alkupera}
            onValueChange={(v) => setAlkupera(v as Alkupera)}
          >
            <SelectTrigger id="alkupera">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EU">EU</SelectItem>
              <SelectItem value="USA">USA</SelectItem>
              <SelectItem value="muu">Muu</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ostohinta_per_kg">Ostohinta €/kg (netto) *</Label>
          <Input
            id="ostohinta_per_kg"
            name="ostohinta_per_kg"
            type="number"
            step="0.01"
            min="0"
            required
            value={ostohintaPerKg}
            onChange={(e) => setOstohintaPerKg(e.target.value)}
          />
          {alkuperainenHinta && (
            <p className="text-xs text-muted-foreground">
              Lähde: {alkuperainenHinta} {alkuperainenValuutta}/{alkuperainenYksikko} (haettu
              automaattisesti, muunnettu ja pyöristetty ylöspäin - tarkista).
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="hintalisa_prosentti">Asiakashinnan lisä-% (poikkeuksellisen kallis väri)</Label>
          <Input
            id="hintalisa_prosentti"
            name="hintalisa_prosentti"
            type="number"
            step="0.01"
            min="0"
            defaultValue={vari?.hintalisa_prosentti ?? 0}
          />
          <p className="text-xs text-muted-foreground">
            Kertautuu automaattisesti osan kategoriahintaan Työt-sivulla (esim. 50 = +50 %).
          </p>
        </div>
      </div>

      <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Toimituskulu{alkupera !== "EU" ? ", tullimaksu ja ALV lisätään" : " lisätään"} värin
        hintaan automaattisesti Asetukset-sivun arvojen mukaan ({alkupera}
        {": "}
        {muotoileEuro(toimituskuluOletus)}/kg
        {alkupera !== "EU" && `, tulli ${tullimaksuOletus} %, ALV ${alvOletus} %`}
        ).{" "}
        {alkupera !== "EU" &&
          "Tulli ja ALV lasketaan myös toimituskulusta, koska rahti kuuluu tullausarvoon. "}
        Muuta arvoja Asetukset-sivulla, niin muutos vaikuttaa kaikkiin väreihin.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="halytysraja_g">
            Hälytysraja (g) - tyhjä = oletus ({asetuksetOletusHalytysraja} g)
          </Label>
          <Input
            id="halytysraja_g"
            name="halytysraja_g"
            type="number"
            step="1"
            min="0"
            defaultValue={vari?.halytysraja_g ?? ""}
          />
        </div>
        {!vari && (
          <div className="grid gap-2">
            <Label htmlFor="saldo_g">Alkusaldo (g)</Label>
            <Input id="saldo_g" name="saldo_g" type="number" step="1" min="0" defaultValue={0} />
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="myyja_linkki">Linkki myyjän tuotesivulle</Label>
        <div className="flex gap-2">
          <Input
            id="myyja_linkki"
            name="myyja_linkki"
            type="url"
            placeholder="https://..."
            value={myyjaLinkki}
            onChange={(e) => setMyyjaLinkki(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={haeTiedot} disabled={haetaan}>
            {haetaan ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Hae tiedot
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Yrittää hakea nimen, valmistajan, kuvan, kiiltoasteen, tyypin, pohjavärivaatimuksen,
          tuotekohtaisen ohjetiedoston, hinnan (muunnettuna €/kg) ja alkuperän sivun julkisesta
          sisällöstä. Kaikki kentät ovat parhaan yrityksen arvioita - tarkista ja muokkaa
          tarvittaessa. Toimituskulua ei haeta automaattisesti, ks. Asetukset.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Kuva väristä</Label>
          <TiedostoLataus
            bucket="vari-kuvat"
            arvo={kuvaUrl}
            onChange={setKuvaUrl}
            hyvaksy="image/*"
            esikatseluKuva
            label="Lataa kuva"
          />
        </div>
        <div className="grid gap-2">
          <Label>Ohjetiedosto (PDF tms.)</Label>
          <TiedostoLataus
            bucket="vari-ohjeet"
            arvo={ohjeTiedostoUrl}
            onChange={setOhjeTiedostoUrl}
            hyvaksy=".pdf,.doc,.docx"
            esikatseluKuva={false}
            label="Lataa ohjetiedosto"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="ohjeet">Valmistajan maalausohjeet (teksti)</Label>
        <Textarea id="ohjeet" name="ohjeet" rows={4} defaultValue={vari?.ohjeet ?? ""} />
      </div>

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}

      <div>
        <TallennaNappi uusi={!vari} />
      </div>
    </form>
  );
}
