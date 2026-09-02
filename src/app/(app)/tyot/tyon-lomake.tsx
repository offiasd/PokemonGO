"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  kategorianVarienMaara,
  muotoileEuro,
  myytavaMaaliTyypinNimi,
  PAKOLLINEN_TOINEN_VARI_ROOLI,
  TOINEN_VARI_ROOLIN_NIMI,
  VALINNAINEN_TOINEN_VARI_ROOLI,
} from "@/lib/vakiot";
import type { MaaliTyyppi, MyytavaMaaliTyyppi, ToinenVariRooli } from "@/lib/supabase/database.types";

import { aloitaTyo, paivitaTyo } from "./actions";

interface Osa {
  id: string;
  nimi: string;
  lisatiedot: string | null;
  lakkaus_kulutus_g: number | null;
  tyokustannusKerroksittain: number[];
  kateProsentti: number;
  kateKiintea: number;
  manuaalinen_hinta: number | null;
}

interface Vari {
  id: string;
  nimi: string;
  tyyppi: MaaliTyyppi;
  saldo_g: number;
  varattu_g: number;
  hintalisa_prosentti: number;
  vaatii_lakkauksen: boolean;
  kokonaishinta: number;
}

interface Kategoriahinta {
  osa_id: string;
  maali_tyyppi: MyytavaMaaliTyyppi;
  /** Adminin asettama kiinteä asiakashinta. Null = hinta lasketaan. */
  hinta: number | null;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

interface VariKategoria {
  vari_id: string;
  maali_tyyppi: MaaliTyyppi;
}

export interface KoriRivi {
  avain: string;
  osaNimi: string;
  variNimi: string;
  yksikkohintaEur: number;
  toinenVariNimi: string | null;
  osaId: string;
  variId: string;
  arvioituKulutusG: number;
  toinenVariId: string | null;
  toinenVariRooli: ToinenVariRooli | null;
  toinenArvioituKulutusG: number | null;
}

export function TyonLomake({
  osat,
  varit,
  kategoriahinnat,
  variKategoriat,
  muokattavaTyo,
}: {
  osat: Osa[];
  varit: Vari[];
  kategoriahinnat: Kategoriahinta[];
  variKategoriat: VariKategoria[];
  /** Annettuna lomake muokkaa olemassa olevaa keskeneräistä työtä. */
  muokattavaTyo?: { id: string; asiakas: string | null; rivit: KoriRivi[] };
}) {
  const router = useRouter();
  const [kaynnissa, aloita] = useTransition();
  // Muokkauksessa avaimet jatkuvat valmiiden rivien perästä, jottei uusi rivi
  // saa samaa avainta kuin jo korissa oleva.
  const seuraavaAvain = useRef(muokattavaTyo?.rivit.length ?? 0);

  const variKategoriaKartta = useMemo(() => {
    const kartta = new Map<string, Set<MaaliTyyppi>>();
    for (const { vari_id, maali_tyyppi } of variKategoriat) {
      const joukko = kartta.get(vari_id) ?? new Set<MaaliTyyppi>();
      joukko.add(maali_tyyppi);
      kartta.set(vari_id, joukko);
    }
    return kartta;
  }, [variKategoriat]);

  const [asiakas, setAsiakas] = useState(muokattavaTyo?.asiakas ?? "");
  const [kori, setKori] = useState<KoriRivi[]>(muokattavaTyo?.rivit ?? []);

  const [osaId, setOsaId] = useState("");
  const [kategoria, setKategoria] = useState<MyytavaMaaliTyyppi | "">("");
  const [variId, setVariId] = useState("");
  const [lakkausValittu, setLakkausValittu] = useState(false);
  const [toinenVariId, setToinenVariId] = useState("");

  const valittuOsa = useMemo(() => osat.find((o) => o.id === osaId), [osat, osaId]);
  const valittuVari = useMemo(() => varit.find((v) => v.id === variId), [varit, variId]);
  const valittuToinenVari = useMemo(
    () => varit.find((v) => v.id === toinenVariId),
    [varit, toinenVariId]
  );

  const osanKategoriat = useMemo(
    () => kategoriahinnat.filter((k) => k.osa_id === osaId),
    [kategoriahinnat, osaId]
  );
  const valittuKategoriahinta = useMemo(
    () => osanKategoriat.find((k) => k.maali_tyyppi === kategoria) ?? null,
    [osanKategoriat, kategoria]
  );
  const kategorianVarit = useMemo(
    () => (kategoria ? varit.filter((v) => variKategoriaKartta.get(v.id)?.has(kategoria)) : []),
    [varit, kategoria, variKategoriaKartta]
  );

  const pakollinenRooli = kategoria ? PAKOLLINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;
  const valinnainenRooli = kategoria ? VALINNAINEN_TOINEN_VARI_ROOLI[kategoria] : undefined;
  const toinenVariRooli = pakollinenRooli ?? (lakkausValittu ? valinnainenRooli : undefined);
  const toinenVariAktiivinen = Boolean(toinenVariRooli);
  const toisenVarinKategoria: MaaliTyyppi | undefined =
    toinenVariRooli === "pohjavari" ? "pohjavari" : toinenVariRooli === "lakka" ? "transparent" : undefined;
  const toisenVarinVaihtoehdot = useMemo(
    () =>
      varit.filter(
        (v) =>
          v.id !== variId &&
          (!toisenVarinKategoria || variKategoriaKartta.get(v.id)?.has(toisenVarinKategoria))
      ),
    [varit, variId, toisenVarinKategoria, variKategoriaKartta]
  );

  const arvioituKulutusG = valittuKategoriahinta?.arvioitu_kulutus_g ?? 0;
  const toinenArvioituKulutusG = pakollinenRooli
    ? (valittuKategoriahinta?.toinen_arvioitu_kulutus_g ?? 0)
    : (valittuOsa?.lakkaus_kulutus_g ?? 0);

  // Hinnoittelujärjestys on sama kuin osan omalla sivulla: adminin kategorialle
  // asettama kiinteä hinta ensin, sitten osan manuaalinen hinta, ja vasta jos
  // kumpaakaan ei ole asetettu, värin ostohinnasta + katteesta laskettu
  // suositushinta. Kiinteä hinta korvaa koko kustannuslaskennan, joten sitä ei
  // koroteta työkustannuksella eikä maalin hinnalla - vain värikohtaisella
  // hintalisällä, kuten laskettuakin hintaa.
  const yksikkohintaEur = useMemo(() => {
    if (!valittuKategoriahinta || !valittuVari || !valittuOsa) return null;
    // Maalaus ja suojaus tehdään jokaiselle värikerrokselle erikseen.
    const varienMaara = kategoria ? kategorianVarienMaara(kategoria, lakkausValittu) : 1;
    const tyokustannus =
      valittuOsa.tyokustannusKerroksittain[varienMaara - 1] ??
      valittuOsa.tyokustannusKerroksittain[0] ??
      0;
    let kustannus = (arvioituKulutusG / 1000) * valittuVari.kokonaishinta + tyokustannus;
    // Myös valinnainen lakkaus kuluttaa maalia: sen grammat varataan varastosta
    // (toinenArvioituKulutusG tallennetaan työriville), joten ne kuuluvat myös
    // kustannukseen. Aiemmin tämä laskettiin vain pakollisille pohjaväreille ja
    // lakoille, jolloin Työt-sivu antoi solid + lakkaus -työlle eri hinnan kuin
    // osan oma kustannusarvio.
    if (toinenVariAktiivinen && valittuToinenVari) {
      kustannus += (toinenArvioituKulutusG / 1000) * valittuToinenVari.kokonaishinta;
    }
    const kategorianHinta =
      valittuKategoriahinta.hinta ??
      valittuOsa.manuaalinen_hinta ??
      Math.round((kustannus * (1 + valittuOsa.kateProsentti / 100) + valittuOsa.kateKiintea) * 100) /
        100;
    const lisa = kategorianHinta * (valittuVari.hintalisa_prosentti / 100);
    return Math.round((kategorianHinta + lisa) * 100) / 100;
  }, [
    valittuKategoriahinta,
    valittuVari,
    valittuOsa,
    valittuToinenVari,
    toinenVariAktiivinen,
    arvioituKulutusG,
    toinenArvioituKulutusG,
    kategoria,
    lakkausValittu,
  ]);

  function vaihdaOsa(v: string) {
    setOsaId(v);
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
  }

  function vaihdaKategoria(v: string) {
    setKategoria(v as MyytavaMaaliTyyppi);
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
  }

  function tyhjennaRivilomake() {
    setOsaId("");
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
  }

  function lisaaKoriin() {
    if (!valittuOsa || !valittuVari || yksikkohintaEur === null) {
      toast.error("Valitse osa, kategoria ja väri.");
      return;
    }
    if (toinenVariAktiivinen && !toinenVariId) {
      toast.error(`Valitse ${(toinenVariRooli && TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]) ?? "toinen väri"}.`);
      return;
    }

    const rivi: KoriRivi = {
      avain: String(seuraavaAvain.current++),
      osaId: valittuOsa.id,
      osaNimi: valittuOsa.nimi,
      variId: valittuVari.id,
      variNimi: valittuVari.nimi,
      arvioituKulutusG,
      yksikkohintaEur,
      toinenVariId: toinenVariAktiivinen ? toinenVariId : null,
      toinenVariNimi: toinenVariAktiivinen ? (valittuToinenVari?.nimi ?? null) : null,
      toinenVariRooli: toinenVariAktiivinen ? (toinenVariRooli ?? null) : null,
      toinenArvioituKulutusG: toinenVariAktiivinen ? toinenArvioituKulutusG : null,
    };
    setKori((k) => [...k, rivi]);
    tyhjennaRivilomake();
  }

  function poistaKorista(avain: string) {
    setKori((k) => k.filter((r) => r.avain !== avain));
  }

  const koriYhteensa = kori.reduce((s, r) => s + r.yksikkohintaEur, 0);

  function kasitteleTallennus() {
    if (kori.length === 0) {
      toast.error(
        muokattavaTyo
          ? "Työssä pitää olla vähintään yksi osa."
          : "Lisää vähintään yksi osa koriin ennen aloitusta."
      );
      return;
    }
    const syotteet = kori.map((r) => ({
      osaId: r.osaId,
      variId: r.variId,
      kappalemaara: 1,
      arvioituKulutusG: r.arvioituKulutusG,
      yksikkohintaEur: r.yksikkohintaEur,
      toinenVariId: r.toinenVariId,
      toinenVariRooli: r.toinenVariRooli,
      toinenArvioituKulutusG: r.toinenArvioituKulutusG,
    }));

    aloita(async () => {
      try {
        if (muokattavaTyo) {
          await paivitaTyo(muokattavaTyo.id, asiakas.trim() || null, syotteet);
          toast.success("Työ päivitetty ja varaukset korjattu varastoon.");
        } else {
          await aloitaTyo(asiakas.trim() || null, syotteet);
          toast.success("Työ aloitettu ja maali varattu varastosta.");
        }
        router.push("/tyot");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : muokattavaTyo
              ? "Työn päivitys epäonnistui."
              : "Työn aloitus epäonnistui."
        );
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="asiakas">Asiakas (valinnainen)</Label>
        <Input
          id="asiakas"
          value={asiakas}
          onChange={(e) => setAsiakas(e.target.value)}
          placeholder="Nimi tai viite"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lisää osa koriin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="osa_id">Osa</Label>
              <Select value={osaId} onValueChange={vaihdaOsa}>
                <SelectTrigger id="osa_id">
                  <SelectValue placeholder="Valitse osa" />
                </SelectTrigger>
                <SelectContent>
                  {osat.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nimi}
                      {o.lisatiedot && (
                        <span className="text-muted-foreground"> - {o.lisatiedot}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="kategoria">Kategoria</Label>
              <Select value={kategoria} onValueChange={vaihdaKategoria} disabled={!osaId}>
                <SelectTrigger id="kategoria">
                  <SelectValue placeholder="Valitse kategoria" />
                </SelectTrigger>
                <SelectContent>
                  {osanKategoriat.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Osalle ei ole asetettu hintoja
                    </p>
                  )}
                  {osanKategoriat.map((k) => (
                    <SelectItem key={k.maali_tyyppi} value={k.maali_tyyppi}>
                      {myytavaMaaliTyypinNimi(k.maali_tyyppi)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kategoria && (
            <div className="grid gap-2">
              <Label htmlFor="vari_id">Väri</Label>
              <Select
                value={variId}
                onValueChange={(uusiId) => {
                  setVariId(uusiId);
                  // Lakkaus ei ole enää kategoriakohtainen pakko vaan
                  // värikohtainen tieto, joten se ehdotetaan valinnan
                  // yhteydessä. Käyttäjä voi ottaa sen pois - siksi ehdotus.
                  if (varit.find((v) => v.id === uusiId)?.vaatii_lakkauksen) {
                    setLakkausValittu(true);
                  }
                }}
              >
                <SelectTrigger id="vari_id" className="w-full">
                  <SelectValue placeholder="Valitse väri" />
                </SelectTrigger>
                <SelectContent>
                  {kategorianVarit.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi}
                      {v.hintalisa_prosentti > 0 && ` (+${v.hintalisa_prosentti} %)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {valinnainenRooli && !pakollinenRooli && kategoria && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="lakkaus_kytketty"
                checked={lakkausValittu}
                onCheckedChange={(t) => setLakkausValittu(t === true)}
              />
              <Label htmlFor="lakkaus_kytketty" className="font-normal">
                Lisää lakkaus (kirkas topcoat)
                {valittuVari?.vaatii_lakkauksen && (
                  <span className="text-muted-foreground"> - väri vaatii lakkauksen</span>
                )}
              </Label>
            </div>
          )}

          {toinenVariAktiivinen && toinenVariRooli && (
            <div className="grid gap-2 rounded-md border bg-muted/30 p-4">
              <Label htmlFor="toinen_vari_id">
                {TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli]}
                {pakollinenRooli ? " *" : ""}
              </Label>
              <Select value={toinenVariId} onValueChange={setToinenVariId}>
                <SelectTrigger id="toinen_vari_id" className="w-full">
                  <SelectValue
                    placeholder={`Valitse ${TOINEN_VARI_ROOLIN_NIMI[toinenVariRooli].toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  {toisenVarinVaihtoehdot.length === 0 && (
                    <p className="px-2 py-1.5 text-sm text-muted-foreground">
                      Ei värejä tässä kategoriassa - lisää lisäkategoria värille
                    </p>
                  )}
                  {toisenVarinVaihtoehdot.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nimi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kategoria && valittuVari && yksikkohintaEur !== null && (
            <p className="text-sm text-muted-foreground">
              Laskettu hinta:{" "}
              <span className="font-medium text-foreground">{muotoileEuro(yksikkohintaEur)}</span>
            </p>
          )}

          <div>
            <Button type="button" variant="outline" onClick={lisaaKoriin} disabled={!variId}>
              <Plus className="size-4" />
              Lisää koriin
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="size-4" />
            Kori ({kori.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {kori.length === 0 && (
            <p className="text-sm text-muted-foreground">Kori on tyhjä - lisää osia yllä.</p>
          )}
          {kori.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Osa</TableHead>
                  <TableHead>Väri</TableHead>
                  <TableHead>Pohjaväri / lakka</TableHead>
                  <TableHead>Hinta</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {kori.map((r) => (
                  <TableRow key={r.avain}>
                    <TableCell>{r.osaNimi}</TableCell>
                    <TableCell>{r.variNimi}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.toinenVariNimi ?? "-"}
                    </TableCell>
                    <TableCell>{muotoileEuro(r.yksikkohintaEur)}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => poistaKorista(r.avain)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {kori.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-sm text-muted-foreground">Yhteensä</span>
              <span className="text-lg font-semibold">{muotoileEuro(koriYhteensa)}</span>
            </div>
          )}
          <div>
            <Button
              type="button"
              onClick={kasitteleTallennus}
              disabled={kaynnissa || kori.length === 0}
            >
              {kaynnissa && <Loader2 className="size-4 animate-spin" />}
              {muokattavaTyo ? "Tallenna muutokset" : "Aloita työ"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
