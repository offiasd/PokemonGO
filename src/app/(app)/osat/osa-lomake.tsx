"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TiedostoLataus } from "@/components/tiedosto-lataus";
import type { Database, MyytavaMaaliTyyppi } from "@/lib/supabase/database.types";
import { AJONEUVOTYYPIT, VARI_TYYPIT, TYO_VAIHEET, MYYTAVAT_MAALI_TYYPIT } from "@/lib/vakiot";

import type { OsaLomakeTila } from "./actions";

type OsaRow = Database["public"]["Tables"]["osat"]["Row"];
type TyovaiheRow = Database["public"]["Tables"]["osa_tyovaiheet"]["Row"];
type KategoriahintaRow = Database["public"]["Tables"]["osa_kategoriahinnat"]["Row"];

const TYHJA_OSA_TILA: OsaLomakeTila = { virhe: null };

interface OsaLomakeProps {
  osa?: OsaRow;
  tyovaiheet?: TyovaiheRow[];
  kategoriahinnat?: KategoriahintaRow[];
  formAction: (tila: OsaLomakeTila, formData: FormData) => Promise<OsaLomakeTila>;
}

function TallennaNappi({ uusi }: { uusi: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {uusi ? "Luo osa" : "Tallenna muutokset"}
    </Button>
  );
}

function VaiheRivi({
  vaihe,
  nimi,
  oletusTarvitaan,
  oletusKesto,
}: {
  vaihe: string;
  nimi: string;
  oletusTarvitaan: boolean;
  oletusKesto: number;
}) {
  const [tarvitaan, setTarvitaan] = useState(oletusTarvitaan);

  return (
    <div className="grid grid-cols-[auto_1fr_8rem] items-center gap-3">
      <Checkbox
        id={`vaihe_${vaihe}_tarvitaan`}
        name={`vaihe_${vaihe}_tarvitaan`}
        checked={tarvitaan}
        onCheckedChange={(v) => setTarvitaan(v === true)}
      />
      <Label htmlFor={`vaihe_${vaihe}_tarvitaan`} className="font-normal">
        {nimi}
      </Label>
      <Input
        name={`vaihe_${vaihe}_kesto`}
        type="number"
        min="0"
        step="1"
        placeholder="min"
        defaultValue={oletusKesto || ""}
        disabled={!tarvitaan}
      />
    </div>
  );
}

const TOINEN_KULUTUS_LABEL: Partial<Record<MyytavaMaaliTyyppi, string>> = {
  candy: "Pohjavärin kulutus (g)",
  illusion: "Lakan kulutus (g)",
};

function KategoriaRivi({
  arvo,
  nimi,
  oletusKaytossa,
  oletusHinta,
  oletusKulutus,
  oletusToinenKulutus,
}: {
  arvo: MyytavaMaaliTyyppi;
  nimi: string;
  oletusKaytossa: boolean;
  oletusHinta: number | null;
  oletusKulutus: number | null;
  oletusToinenKulutus: number | null;
}) {
  const [kaytossa, setKaytossa] = useState(oletusKaytossa);
  const toinenLabel = TOINEN_KULUTUS_LABEL[arvo];

  return (
    <div className="grid gap-3 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`kategoria_${arvo}_kaytossa`}
          name={`kategoria_${arvo}_kaytossa`}
          checked={kaytossa}
          onCheckedChange={(v) => setKaytossa(v === true)}
        />
        <Label htmlFor={`kategoria_${arvo}_kaytossa`} className="font-normal">
          {nimi}
        </Label>
      </div>
      {kaytossa && (
        <div className={toinenLabel ? "grid gap-3 sm:grid-cols-3" : "grid gap-3 sm:grid-cols-2"}>
          <div className="grid gap-1">
            <Label htmlFor={`kategoria_${arvo}_hinta`} className="text-xs text-muted-foreground">
              Hinta €
            </Label>
            <Input
              id={`kategoria_${arvo}_hinta`}
              name={`kategoria_${arvo}_hinta`}
              type="number"
              min="0"
              step="0.01"
              defaultValue={oletusHinta ?? ""}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`kategoria_${arvo}_kulutus`} className="text-xs text-muted-foreground">
              Maalinkulutus (g)
            </Label>
            <Input
              id={`kategoria_${arvo}_kulutus`}
              name={`kategoria_${arvo}_kulutus`}
              type="number"
              min="0"
              step="1"
              defaultValue={oletusKulutus ?? ""}
            />
          </div>
          {toinenLabel && (
            <div className="grid gap-1">
              <Label
                htmlFor={`kategoria_${arvo}_toinen_kulutus`}
                className="text-xs text-muted-foreground"
              >
                {toinenLabel}
              </Label>
              <Input
                id={`kategoria_${arvo}_toinen_kulutus`}
                name={`kategoria_${arvo}_toinen_kulutus`}
                type="number"
                min="0"
                step="1"
                defaultValue={oletusToinenKulutus ?? ""}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OsaLomake({ osa, tyovaiheet = [], kategoriahinnat = [], formAction }: OsaLomakeProps) {
  const [tila, kutsuAction] = useActionState(formAction, TYHJA_OSA_TILA);
  const [kuvaUrl, setKuvaUrl] = useState<string | null>(osa?.kuva_url ?? null);

  return (
    <form action={kutsuAction} className="grid gap-6">
      <input type="hidden" name="kuva_url" value={kuvaUrl ?? ""} />

      <div className="grid gap-2">
        <Label htmlFor="nimi">Osan nimi *</Label>
        <Input id="nimi" name="nimi" required defaultValue={osa?.nimi} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="ajoneuvotyyppi">Ajoneuvotyyppi</Label>
          <Select name="ajoneuvotyyppi" defaultValue={osa?.ajoneuvotyyppi ?? "auto"}>
            <SelectTrigger id="ajoneuvotyyppi">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AJONEUVOTYYPIT.map((t) => (
                <SelectItem key={t.arvo} value={t.arvo}>
                  {t.nimi}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="merkki">Merkki</Label>
          <Input id="merkki" name="merkki" defaultValue={osa?.merkki ?? ""} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="malli">Malli</Label>
          <Input id="malli" name="malli" defaultValue={osa?.malli ?? ""} />
        </div>
      </div>

      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="vari_tyyppi">Väri-/pintatyyppi</Label>
        <Select name="vari_tyyppi" defaultValue={osa?.vari_tyyppi ?? "yksivarinen"}>
          <SelectTrigger id="vari_tyyppi">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VARI_TYYPIT.map((t) => (
              <SelectItem key={t.arvo} value={t.arvo}>
                {t.nimi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label>Kuva osasta</Label>
        <TiedostoLataus
          bucket="osa-kuvat"
          arvo={kuvaUrl}
          onChange={setKuvaUrl}
          hyvaksy="image/*"
          esikatseluKuva
          label="Lataa kuva"
        />
      </div>

      <div className="grid gap-3 rounded-md border p-4">
        <Label className="font-medium">Työvaiheet</Label>
        <div className="grid gap-3">
          {TYO_VAIHEET.map(({ arvo, nimi }) => {
            const olemassaOleva = tyovaiheet.find((v) => v.vaihe === arvo);
            return (
              <VaiheRivi
                key={arvo}
                vaihe={arvo}
                nimi={nimi}
                oletusTarvitaan={olemassaOleva?.tarvitaan ?? false}
                oletusKesto={olemassaOleva?.arvioitu_kesto_min ?? 0}
              />
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border p-4">
        <div>
          <Label className="font-medium">Asiakashinta kategorioittain</Label>
          <p className="text-xs text-muted-foreground">
            Sama hinta koskee kaikkia kategorian värejä (ellei värille ole asetettu omaa
            hintalisä-%:a). Vain valitut kategoriat ovat myytävissä tälle osalle Työt-sivulla.
          </p>
        </div>
        <div className="grid gap-3">
          {MYYTAVAT_MAALI_TYYPIT.map(({ arvo, nimi }) => {
            const olemassaOleva = kategoriahinnat.find((k) => k.maali_tyyppi === arvo);
            return (
              <KategoriaRivi
                key={arvo}
                arvo={arvo}
                nimi={nimi}
                oletusKaytossa={Boolean(olemassaOleva)}
                oletusHinta={olemassaOleva?.hinta ?? null}
                oletusKulutus={olemassaOleva?.arvioitu_kulutus_g ?? null}
                oletusToinenKulutus={olemassaOleva?.toinen_arvioitu_kulutus_g ?? null}
              />
            );
          })}
        </div>
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 sm:max-w-md">
          <div className="grid gap-1">
            <Label htmlFor="lakkaus_lisahinta" className="text-xs text-muted-foreground">
              Valinnaisen lakkauksen lisähinta € (Solid/RAL, tyhjä = ei tarjota)
            </Label>
            <Input
              id="lakkaus_lisahinta"
              name="lakkaus_lisahinta"
              type="number"
              step="0.01"
              min="0"
              defaultValue={osa?.lakkaus_lisahinta ?? ""}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="lakkaus_kulutus_g" className="text-xs text-muted-foreground">
              Lakkauksen maalinkulutus (g)
            </Label>
            <Input
              id="lakkaus_kulutus_g"
              name="lakkaus_kulutus_g"
              type="number"
              step="1"
              min="0"
              defaultValue={osa?.lakkaus_kulutus_g ?? ""}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-md border p-4">
        <Label className="font-medium">Hinnoittelun ylikirjoitukset (valinnainen)</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="kate_prosentti" className="text-xs text-muted-foreground">
              Kate-% (tyhjä = oletus)
            </Label>
            <Input
              id="kate_prosentti"
              name="kate_prosentti"
              type="number"
              step="0.01"
              min="0"
              defaultValue={osa?.kate_prosentti ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="kate_kiintea" className="text-xs text-muted-foreground">
              Kiinteä lisä €
            </Label>
            <Input
              id="kate_kiintea"
              name="kate_kiintea"
              type="number"
              step="0.01"
              min="0"
              defaultValue={osa?.kate_kiintea ?? ""}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manuaalinen_hinta" className="text-xs text-muted-foreground">
              Manuaalinen hinta € (ohittaa laskennan)
            </Label>
            <Input
              id="manuaalinen_hinta"
              name="manuaalinen_hinta"
              type="number"
              step="0.01"
              min="0"
              defaultValue={osa?.manuaalinen_hinta ?? ""}
            />
          </div>
        </div>
      </div>

      {tila.virhe && (
        <p className="text-sm text-destructive" role="alert">
          {tila.virhe}
        </p>
      )}

      <div>
        <TallennaNappi uusi={!osa} />
      </div>
    </form>
  );
}
