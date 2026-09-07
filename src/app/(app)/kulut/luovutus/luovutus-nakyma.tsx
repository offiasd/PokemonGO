"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  LockOpen,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { muotoileEuro } from "@/lib/vakiot";
import {
  paketinKuvaus,
  RYHMITTELYT,
  TARKKUUDET,
  VIENTIMUODOT,
  type LuovutuksenTarkistukset,
  type Ryhmittely,
  type Tarkkuus,
  type Vientiasetukset,
  type Vientimuoto,
} from "@/lib/luovutus";

import { avaaLuovutus, lahetaLuovutus } from "./actions";

/**
 * Monivalintapilleri.
 *
 * Muodot ovat yhdisteltävissä, joten ne ovat erillisiä pillereitä eivätkä
 * ryhmä: useimmiten kirjanpitäjä haluaa kuvat ja erittelyn.
 */
function Pilleri({
  valittu,
  onClick,
  children,
}: {
  valittu: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={valittu}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        valittu
          ? "border-korostus bg-korostus/10 font-medium text-korostus"
          : "border-border text-muted-foreground hover:bg-accent/50"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Yksinvalintaryhmä.
 *
 * Ryhmittely ja tarkkuus ovat toisensa poissulkevia, joten ne näyttävät
 * ryhmältä: valinta liikkuu ryhmän sisällä eikä kytkeydy päälle ja pois.
 */
function Valintaryhma<T extends string>({
  vaihtoehdot,
  valittu,
  onValitse,
  nimi,
}: {
  vaihtoehdot: { arvo: T; nimi: string }[];
  valittu: T;
  onValitse: (arvo: T) => void;
  nimi: string;
}) {
  return (
    <div role="radiogroup" aria-label={nimi} className="flex flex-wrap gap-2">
      {vaihtoehdot.map((vaihtoehto) => (
        <button
          key={vaihtoehto.arvo}
          type="button"
          role="radio"
          aria-checked={valittu === vaihtoehto.arvo}
          onClick={() => onValitse(vaihtoehto.arvo)}
          className={cn(
            "flex-1 rounded-xl border px-4 py-2.5 text-sm whitespace-nowrap transition-colors",
            valittu === vaihtoehto.arvo
              ? "border-border bg-card font-medium text-foreground shadow-xs"
              : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
          )}
        >
          {vaihtoehto.nimi}
        </button>
      ))}
    </div>
  );
}

export function LuovutusNakyma({
  kausi,
  kaudenNimi,
  tarkistukset,
  lukittu,
  lahetetty,
  loki,
}: {
  kausi: string;
  kaudenNimi: string;
  tarkistukset: LuovutuksenTarkistukset;
  lukittu: boolean;
  lahetetty: string | null;
  loki: {
    id: string;
    tapahtuma: "lahetetty" | "avattu";
    aika: string;
    kuitteja: number;
    kuluina_eur: number;
    kuvaus: string | null;
  }[];
}) {
  const router = useRouter();
  const [asetukset, setAsetukset] = useState<Vientiasetukset>({
    muodot: ["pdf", "csv", "zip"],
    ryhmittely: "kuukausi",
    tarkkuus: "rivitaso",
    yksityisototMukaan: true,
  });
  const [kaynnissa, aloita] = useTransition();
  const [lataa, setLataa] = useState(false);
  const [puutteetAuki, setPuutteetAuki] = useState(false);

  const puutteelliset = tarkistukset.tarkistukset.filter((t) => !t.ok);
  const eiKuitteja = tarkistukset.kuitteja === 0;

  function vaihdaMuoto(muoto: Vientimuoto) {
    setAsetukset((v) => ({
      ...v,
      muodot: v.muodot.includes(muoto)
        ? v.muodot.filter((m) => m !== muoto)
        : [...v.muodot, muoto],
    }));
  }

  const latausOsoite = `/api/luovutus?kausi=${kausi}&muodot=${asetukset.muodot.join(",")}&ryhmittely=${asetukset.ryhmittely}&tarkkuus=${asetukset.tarkkuus}&yksityisotot=${asetukset.yksityisototMukaan ? "1" : "0"}`;

  async function lataaPaketti() {
    setLataa(true);
    try {
      const vastaus = await fetch(latausOsoite);
      if (!vastaus.ok) {
        const virhe = await vastaus.json().catch(() => null);
        toast.error(virhe?.virhe ?? "Paketin kokoaminen epäonnistui.");
        return;
      }
      // Nimi tulee palvelimelta, jotta tiedostonimi on sama kuin lokissa.
      const nimi =
        vastaus.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "kuitit.zip";
      const blob = await vastaus.blob();
      const osoite = URL.createObjectURL(blob);
      const linkki = document.createElement("a");
      linkki.href = osoite;
      linkki.download = nimi;
      linkki.click();
      URL.revokeObjectURL(osoite);
      toast.success(`${nimi} ladattu.`);
    } catch {
      toast.error("Paketin lataus epäonnistui.");
    } finally {
      setLataa(false);
    }
  }

  function laheta() {
    if (
      !window.confirm(
        `Merkitäänkö ${kaudenNimi} luovutetuksi? Kausi lukittuu, eikä sen kuitteja voi muuttaa ennen kuin avaat luovutuksen.`
      )
    ) {
      return;
    }
    aloita(async () => {
      const tulos = await lahetaLuovutus(kausi, asetukset);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success("Kausi merkitty luovutetuksi ja lukittu.");
      router.refresh();
    });
  }

  function avaa() {
    if (
      !window.confirm(
        "Avataanko kausi? Kirjanpitäjälle jo lähetettyä aineistoa ei voi perua - avaaminen tarkoittaa, että hänelle lähtee myöhemmin korjattu aineisto."
      )
    ) {
      return;
    }
    aloita(async () => {
      const tulos = await avaaLuovutus(kausi);
      if (!tulos.ok) {
        toast.error(tulos.virhe);
        return;
      }
      toast.success("Kausi avattu muokattavaksi.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {lukittu && (
        <Card className="border-korostus">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="size-4 text-korostus" />
              Kausi on luovutettu
            </CardTitle>
            <CardDescription>
              Lähetetty {lahetetty ? new Date(lahetetty).toLocaleString("fi-FI") : "-"}. Kauden
              kuitteja ei voi muuttaa ennen avaamista.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" disabled={kaynnissa} onClick={avaa}>
              {kaynnissa ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LockOpen className="size-4" />
              )}
              Avaa kausi
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Tarkistukset</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid">
            {tarkistukset.tarkistukset.map((tarkistus, jarjestys) => (
              <div
                key={tarkistus.avain}
                className={cn(
                  "flex items-center justify-between gap-3 py-3",
                  jarjestys > 0 && "border-t"
                )}
              >
                <span className="flex items-center gap-3">
                  {tarkistus.ok ? (
                    <CheckCircle2 className="size-5 shrink-0 text-tila-vihrea-teksti" />
                  ) : (
                    <AlertTriangle className="size-5 shrink-0 text-warning" />
                  )}
                  {tarkistus.nimi}
                </span>
                {!tarkistus.ok && (
                  <span className="shrink-0 text-sm text-warning">
                    {tarkistus.avain === "luokiteltu"
                      ? `${tarkistus.kuitit.length} ${tarkistus.kuitit.length === 1 ? "kuitti" : "kuittia"} kesken`
                      : tarkistus.avain === "tasmays"
                        ? `${tarkistus.kuitit.length} ${tarkistus.kuitit.length === 1 ? "kuitti" : "kuittia"} ei täsmää`
                        : `${tarkistus.kuitit.length} ${tarkistus.kuitit.length === 1 ? "kuitti" : "kuittia"}`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {eiKuitteja && (
            <p className="text-sm text-muted-foreground">
              Kaudella ei ole yhtään kuittia, joten luovutettavaa ei ole.
            </p>
          )}

          {puutteelliset.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setPuutteetAuki((auki) => !auki)}
                aria-expanded={puutteetAuki}
                className="rounded-lg bg-tila-keltainen-pinta px-4 py-3 text-sm font-medium text-tila-keltainen-teksti transition-opacity hover:opacity-90"
              >
                {puutteetAuki ? "Piilota puutteet" : "Korjaa puutteet"}
              </button>

              {puutteetAuki && (
                <div className="grid gap-3">
                  {puutteelliset.map((tarkistus) => (
                    <div key={tarkistus.avain} className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {tarkistus.nimi}
                      </span>
                      {tarkistus.kuitit.map((kuitti) => (
                        <Link
                          key={`${tarkistus.avain}-${kuitti.id}`}
                          href={`/kulut/${kuitti.id}`}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                        >
                          <span className="truncate">
                            {new Date(kuitti.paivays).toLocaleDateString("fi-FI")}{" "}
                            {kuitti.toimittaja ?? "Toimittaja puuttuu"}
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            {kuitti.syy}
                            <ArrowRight className="size-3" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Vientiasetukset</CardTitle>
          <CardDescription>
            Kun kirjanpitäjä vaihtuu, näitä säädetään - uutta koodia ei tarvita.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Muoto</span>
            <div className="flex flex-wrap gap-2">
              {VIENTIMUODOT.map((muoto) => (
                <Pilleri
                  key={muoto.arvo}
                  valittu={asetukset.muodot.includes(muoto.arvo)}
                  onClick={() => vaihdaMuoto(muoto.arvo)}
                >
                  {muoto.nimi}
                </Pilleri>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Ryhmittely</span>
            <Valintaryhma
              nimi="Ryhmittely"
              vaihtoehdot={RYHMITTELYT}
              valittu={asetukset.ryhmittely}
              onValitse={(arvo: Ryhmittely) => setAsetukset((v) => ({ ...v, ryhmittely: arvo }))}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm text-muted-foreground">Tarkkuus</span>
            <Valintaryhma
              nimi="Tarkkuus"
              vaihtoehdot={TARKKUUDET}
              valittu={asetukset.tarkkuus}
              onValitse={(arvo: Tarkkuus) => setAsetukset((v) => ({ ...v, tarkkuus: arvo }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <span>Yksityisotot mukaan</span>
            <Valintaryhma
              nimi="Yksityisotot mukaan"
              vaihtoehdot={[
                { arvo: "kylla", nimi: "Kyllä" },
                { arvo: "ei", nimi: "Ei" },
              ]}
              valittu={asetukset.yksityisototMukaan ? "kylla" : "ei"}
              onValitse={(arvo) =>
                setAsetukset((v) => ({ ...v, yksityisototMukaan: arvo === "kylla" }))
              }
            />
          </div>

          {!asetukset.yksityisototMukaan && (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
              Yksityisotot jäävät pois, jolloin kuitin loppusumma ei täsmää vietyihin riveihin.
              Asetus on sallittu, mutta kerro siitä kirjanpitäjälle.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">{paketinKuvaus(asetukset)}</p>

          <Button
            type="button"
            variant="outline"
            disabled={lataa || asetukset.muodot.length === 0 || eiKuitteja}
            onClick={lataaPaketti}
          >
            {lataa ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Lataa paketti
          </Button>

          <Button
            type="button"
            disabled={kaynnissa || !tarkistukset.kunnossa || lukittu}
            onClick={laheta}
          >
            {kaynnissa ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {lukittu
              ? "Kausi on jo luovutettu"
              : tarkistukset.kunnossa
                ? "Merkitse luovutetuksi"
                : "Korjaa puutteet ensin"}
          </Button>

          {!tarkistukset.kunnossa && !eiKuitteja && (
            <p className="text-xs text-muted-foreground">
              Paketin voi ladata jo nyt, mutta luovutetuksi merkitseminen odottaa korjauksia.
            </p>
          )}
        </CardContent>
      </Card>

      {loki.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Luovutusloki</CardTitle>
            <CardDescription>Mitä lähti, milloin ja millä asetuksilla.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {loki.map((tapahtuma) => (
              <div key={tapahtuma.id} className="grid gap-0.5 border-b pb-2 last:border-0 last:pb-0">
                <span className="flex items-center gap-2 text-sm">
                  {tapahtuma.tapahtuma === "lahetetty" ? (
                    <Lock className="size-3.5 text-korostus" />
                  ) : (
                    <LockOpen className="size-3.5 text-muted-foreground" />
                  )}
                  {tapahtuma.tapahtuma === "lahetetty" ? "Luovutettu" : "Avattu"}
                  <span className="text-muted-foreground">
                    {new Date(tapahtuma.aika).toLocaleString("fi-FI")}
                  </span>
                </span>
                {tapahtuma.tapahtuma === "lahetetty" && (
                  <span className="pl-5 text-xs text-muted-foreground">
                    {tapahtuma.kuitteja} kuittia · {muotoileEuro(tapahtuma.kuluina_eur)} kuluina
                    {tapahtuma.kuvaus ? ` · ${tapahtuma.kuvaus}` : ""}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
