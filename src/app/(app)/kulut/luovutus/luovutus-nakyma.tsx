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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

/** Valintapilleri. Sama ulkoasu muodoille, ryhmittelylle ja tarkkuudelle. */
function Valinta({
  valittu,
  onClick,
  disabled,
  children,
}: {
  valittu: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={valittu}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50",
        valittu
          ? "border-korostus bg-korostus/10 font-medium text-korostus"
          : "border-border text-muted-foreground hover:bg-accent/50"
      )}
    >
      {children}
    </button>
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

  const puutteita = tarkistukset.tarkistukset.filter((t) => !t.ok);
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
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
            <span>{kaudenNimi}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {tarkistukset.kuitteja} {tarkistukset.kuitteja === 1 ? "kuitti" : "kuittia"} ·{" "}
              {muotoileEuro(tarkistukset.kuluina_eur)} kuluina · yhteensä{" "}
              {muotoileEuro(tarkistukset.yhteensa_eur)}
            </span>
          </CardTitle>
        </CardHeader>
      </Card>

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
          <CardTitle className="text-base">Tarkistukset</CardTitle>
          <CardDescription>
            Nämä huomaavat puutteet ennen kirjanpitäjää. Lähetys on estetty kunnes ne on
            korjattu.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-0">
          {tarkistukset.tarkistukset.map((tarkistus, jarjestys) => (
            <div
              key={tarkistus.avain}
              className={cn("grid gap-2 py-3", jarjestys > 0 && "border-t")}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm">
                  {tarkistus.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-tila-vihrea-teksti" />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-warning" />
                  )}
                  {tarkistus.nimi}
                </span>
                {!tarkistus.ok && (
                  <span className="shrink-0 text-sm text-warning">
                    {tarkistus.kuitit.length}{" "}
                    {tarkistus.kuitit.length === 1 ? "kuitti" : "kuittia"}
                  </span>
                )}
              </div>

              {tarkistus.kuitit.length > 0 && (
                <div className="grid gap-1 pl-6">
                  {tarkistus.kuitit.map((kuitti) => (
                    <Link
                      key={`${tarkistus.avain}-${kuitti.id}`}
                      href={`/kulut/${kuitti.id}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent/50"
                    >
                      <span className="truncate">
                        {new Date(kuitti.paivays).toLocaleDateString("fi-FI")}{" "}
                        {kuitti.toimittaja ?? "Toimittaja puuttuu"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        {kuitti.syy}
                        <ArrowRight className="size-3" />
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {eiKuitteja && (
            <p className="border-t pt-3 text-sm text-muted-foreground">
              Kaudella ei ole yhtään kuittia, joten luovutettavaa ei ole.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vientiasetukset</CardTitle>
          <CardDescription>
            Kun kirjanpitäjä vaihtuu, näitä säädetään - uutta koodia ei tarvita.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <span className="text-xs text-muted-foreground">Muoto</span>
            <div className="flex flex-wrap gap-2">
              {VIENTIMUODOT.map((muoto) => (
                <Valinta
                  key={muoto.arvo}
                  valittu={asetukset.muodot.includes(muoto.arvo)}
                  onClick={() => vaihdaMuoto(muoto.arvo)}
                >
                  {muoto.nimi}
                </Valinta>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs text-muted-foreground">Ryhmittely</span>
            <div className="flex flex-wrap gap-2">
              {RYHMITTELYT.map((ryhmittely) => (
                <Valinta
                  key={ryhmittely.arvo}
                  valittu={asetukset.ryhmittely === ryhmittely.arvo}
                  onClick={() =>
                    setAsetukset((v) => ({ ...v, ryhmittely: ryhmittely.arvo as Ryhmittely }))
                  }
                >
                  {ryhmittely.nimi}
                </Valinta>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <span className="text-xs text-muted-foreground">Tarkkuus</span>
            <div className="flex flex-wrap gap-2">
              {TARKKUUDET.map((tarkkuus) => (
                <Valinta
                  key={tarkkuus.arvo}
                  valittu={asetukset.tarkkuus === tarkkuus.arvo}
                  onClick={() =>
                    setAsetukset((v) => ({ ...v, tarkkuus: tarkkuus.arvo as Tarkkuus }))
                  }
                >
                  {tarkkuus.nimi}
                </Valinta>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <Label htmlFor="yksityisotot" className="font-normal">
              Yksityisotot mukaan
            </Label>
            <Switch
              id="yksityisotot"
              checked={asetukset.yksityisototMukaan}
              onCheckedChange={(paalla) =>
                setAsetukset((v) => ({ ...v, yksityisototMukaan: paalla }))
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

          <div className="grid gap-2 sm:grid-cols-2">
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
          </div>

          {!tarkistukset.kunnossa && !eiKuitteja && (
            <p className="text-xs text-muted-foreground">
              {puutteita.length} {puutteita.length === 1 ? "tarkistus" : "tarkistusta"} kesken.
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
