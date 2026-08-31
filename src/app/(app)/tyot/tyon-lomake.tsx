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
import { muotoileEuro } from "@/lib/vakiot";
import type { MaaliTyyppi, MyytavaMaaliTyyppi, ToinenVariRooli } from "@/lib/supabase/database.types";

import { aloitaTyo } from "./actions";

interface Osa {
  id: string;
  nimi: string;
  merkki: string | null;
  malli: string | null;
  lakkaus_lisahinta: number | null;
  lakkaus_kulutus_g: number | null;
}

interface Vari {
  id: string;
  nimi: string;
  tyyppi: MaaliTyyppi;
  saldo_g: number;
  varattu_g: number;
  hintalisa_prosentti: number;
}

interface Kategoriahinta {
  osa_id: string;
  maali_tyyppi: MyytavaMaaliTyyppi;
  hinta: number;
  arvioitu_kulutus_g: number;
  toinen_arvioitu_kulutus_g: number | null;
}

interface VariKategoria {
  vari_id: string;
  maali_tyyppi: MaaliTyyppi;
}

interface KoriRivi {
  avain: string;
  osaNimi: string;
  variNimi: string;
  kappalemaara: number;
  yksikkohintaEur: number;
  toinenVariNimi: string | null;
  osaId: string;
  variId: string;
  arvioituKulutusG: number;
  toinenVariId: string | null;
  toinenVariRooli: ToinenVariRooli | null;
  toinenArvioituKulutusG: number | null;
}

const KATEGORIA_NIMET: Record<MyytavaMaaliTyyppi, string> = {
  solid: "Solid / RAL",
  metallic: "Metallic",
  candy: "Candy",
  illusion: "Illusion",
};

const PAKOLLINEN_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  candy: "pohjavari",
  illusion: "lakka",
};
const VALINNAINEN_ROOLI: Partial<Record<MyytavaMaaliTyyppi, ToinenVariRooli>> = {
  solid: "lakka",
};
const ROOLIN_NIMI: Record<ToinenVariRooli, string> = {
  pohjavari: "Pohjaväri",
  lakka: "Lakka",
};

export function TyonLomake({
  osat,
  varit,
  kategoriahinnat,
  variKategoriat,
}: {
  osat: Osa[];
  varit: Vari[];
  kategoriahinnat: Kategoriahinta[];
  variKategoriat: VariKategoria[];
}) {
  const router = useRouter();
  const [kaynnissa, aloita] = useTransition();
  const seuraavaAvain = useRef(0);

  const variKategoriaKartta = useMemo(() => {
    const kartta = new Map<string, Set<MaaliTyyppi>>();
    for (const { vari_id, maali_tyyppi } of variKategoriat) {
      const joukko = kartta.get(vari_id) ?? new Set<MaaliTyyppi>();
      joukko.add(maali_tyyppi);
      kartta.set(vari_id, joukko);
    }
    return kartta;
  }, [variKategoriat]);

  const [asiakas, setAsiakas] = useState("");
  const [kori, setKori] = useState<KoriRivi[]>([]);

  const [osaId, setOsaId] = useState("");
  const [kategoria, setKategoria] = useState<MyytavaMaaliTyyppi | "">("");
  const [variId, setVariId] = useState("");
  const [kappalemaara, setKappalemaara] = useState("1");
  const [lakkausValittu, setLakkausValittu] = useState(false);
  const [toinenVariId, setToinenVariId] = useState("");
  const [toinenArvioituYlikirjoitus, setToinenArvioituYlikirjoitus] = useState<string | null>(
    null
  );

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

  const pakollinenRooli = kategoria ? PAKOLLINEN_ROOLI[kategoria] : undefined;
  const valinnainenRooli = kategoria ? VALINNAINEN_ROOLI[kategoria] : undefined;
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

  const maara = Number(kappalemaara) || 0;
  const arvioituKulutusG = valittuKategoriahinta
    ? Math.round(valittuKategoriahinta.arvioitu_kulutus_g * maara)
    : 0;
  const toinenArvioituOletus = pakollinenRooli
    ? Math.round((valittuKategoriahinta?.toinen_arvioitu_kulutus_g ?? 0) * maara)
    : Math.round((valittuOsa?.lakkaus_kulutus_g ?? 0) * maara);
  const toinenArvioituKulutusG =
    toinenArvioituYlikirjoitus !== null ? Number(toinenArvioituYlikirjoitus) : toinenArvioituOletus;

  const yksikkohintaEur = useMemo(() => {
    if (!valittuKategoriahinta || !valittuVari) return null;
    const kategorianHinta = valittuKategoriahinta.hinta;
    const lisa = kategorianHinta * (valittuVari.hintalisa_prosentti / 100);
    const lakkausLisa =
      kategoria === "solid" && lakkausValittu ? (valittuOsa?.lakkaus_lisahinta ?? 0) : 0;
    return Math.round((kategorianHinta + lisa + lakkausLisa) * 100) / 100;
  }, [valittuKategoriahinta, valittuVari, kategoria, lakkausValittu, valittuOsa]);

  function vaihdaOsa(v: string) {
    setOsaId(v);
    setKategoria("");
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
    setToinenArvioituYlikirjoitus(null);
  }

  function vaihdaKategoria(v: string) {
    setKategoria(v as MyytavaMaaliTyyppi);
    setVariId("");
    setLakkausValittu(false);
    setToinenVariId("");
    setToinenArvioituYlikirjoitus(null);
  }

  function tyhjennaRivilomake() {
    setOsaId("");
    setKategoria("");
    setVariId("");
    setKappalemaara("1");
    setLakkausValittu(false);
    setToinenVariId("");
    setToinenArvioituYlikirjoitus(null);
  }

  function lisaaKoriin() {
    if (!valittuOsa || !valittuVari || yksikkohintaEur === null) {
      toast.error("Valitse osa, kategoria ja väri.");
      return;
    }
    if (toinenVariAktiivinen && !toinenVariId) {
      toast.error(`Valitse ${(toinenVariRooli && ROOLIN_NIMI[toinenVariRooli]) ?? "toinen väri"}.`);
      return;
    }

    const rivi: KoriRivi = {
      avain: String(seuraavaAvain.current++),
      osaId: valittuOsa.id,
      osaNimi: valittuOsa.nimi,
      variId: valittuVari.id,
      variNimi: valittuVari.nimi,
      kappalemaara: Number(kappalemaara) || 1,
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

  const koriYhteensa = kori.reduce((s, r) => s + r.yksikkohintaEur * r.kappalemaara, 0);

  function kasitteleAloitus() {
    if (kori.length === 0) {
      toast.error("Lisää vähintään yksi osa koriin ennen aloitusta.");
      return;
    }
    aloita(async () => {
      try {
        await aloitaTyo(
          asiakas.trim() || null,
          kori.map((r) => ({
            osaId: r.osaId,
            variId: r.variId,
            kappalemaara: r.kappalemaara,
            arvioituKulutusG: r.arvioituKulutusG,
            yksikkohintaEur: r.yksikkohintaEur,
            toinenVariId: r.toinenVariId,
            toinenVariRooli: r.toinenVariRooli,
            toinenArvioituKulutusG: r.toinenArvioituKulutusG,
          }))
        );
        toast.success("Työ aloitettu ja maali varattu varastosta.");
        router.push("/tyot");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Työn aloitus epäonnistui.");
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
                      {(o.merkki || o.malli) &&
                        ` (${[o.merkki, o.malli].filter(Boolean).join(" ")})`}
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
                      {KATEGORIA_NIMET[k.maali_tyyppi]} - {muotoileEuro(k.hinta)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kategoria && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="vari_id">Väri</Label>
                <Select value={variId} onValueChange={setVariId}>
                  <SelectTrigger id="vari_id">
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
              <div className="grid gap-2">
                <Label htmlFor="kappalemaara">Kappalemäärä</Label>
                <Input
                  id="kappalemaara"
                  type="number"
                  min="1"
                  step="1"
                  value={kappalemaara}
                  onChange={(e) => {
                    setKappalemaara(e.target.value);
                    setToinenArvioituYlikirjoitus(null);
                  }}
                />
              </div>
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
                {valittuOsa?.lakkaus_lisahinta
                  ? ` - +${muotoileEuro(valittuOsa.lakkaus_lisahinta)}`
                  : ""}
              </Label>
            </div>
          )}

          {toinenVariAktiivinen && toinenVariRooli && (
            <div className="grid gap-4 rounded-md border bg-muted/30 p-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="toinen_vari_id">
                  {ROOLIN_NIMI[toinenVariRooli]}
                  {pakollinenRooli ? " *" : ""}
                </Label>
                <Select value={toinenVariId} onValueChange={setToinenVariId}>
                  <SelectTrigger id="toinen_vari_id">
                    <SelectValue
                      placeholder={`Valitse ${ROOLIN_NIMI[toinenVariRooli].toLowerCase()}`}
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
              <div className="grid gap-2">
                <Label htmlFor="toinen_arvioitu">Arvioitu kulutus (g)</Label>
                <Input
                  id="toinen_arvioitu"
                  type="number"
                  min="0"
                  step="1"
                  value={toinenArvioituKulutusG}
                  onChange={(e) => setToinenArvioituYlikirjoitus(e.target.value)}
                />
              </div>
            </div>
          )}

          {kategoria && valittuVari && yksikkohintaEur !== null && (
            <p className="text-sm text-muted-foreground">
              Laskettu hinta: <span className="font-medium text-foreground">
                {muotoileEuro(yksikkohintaEur)}
              </span>{" "}
              / kpl - arvioitu maalinkulutus {arvioituKulutusG.toLocaleString("fi-FI")} g
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
                  <TableHead>Kpl</TableHead>
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
                    <TableCell>{r.kappalemaara}</TableCell>
                    <TableCell>{muotoileEuro(r.yksikkohintaEur * r.kappalemaara)}</TableCell>
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
            <Button type="button" onClick={kasitteleAloitus} disabled={kaynnissa || kori.length === 0}>
              {kaynnissa && <Loader2 className="size-4 animate-spin" />}
              Aloita työ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
