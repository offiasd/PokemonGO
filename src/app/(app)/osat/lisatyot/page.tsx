import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { tyovaiheenNimi } from "@/lib/vakiot";
import type { LisatyoLuettelossa } from "@/lib/supabase/database.types";

import { Lisatyolista } from "./lisatyolista";
import { LisatyonLisays } from "./lisatyon-lisays";

export default async function LisatyotSivu() {
  // Ajat ja hinnat ovat hinnoittelutietoa: katalogin muokkaus on adminille.
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data: luettelo } = await supabase.rpc("lisatyoluettelo");
  const rivit = (luettelo ?? []) as LisatyoLuettelossa[];

  return (
    <div className="grid gap-4">
      {/* Paluulinkki omalle rivilleen kapealla ruudulla: otsikon vieressä se
          jäisi monirivisen kuvauksen kohdalla pystysuunnassa keskelle. */}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/osat">
              <ArrowLeft className="size-4" />
              Osat
            </Link>
          </Button>
        </div>
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-xl font-semibold">Lisätyöt</h1>
          <p className="text-sm text-muted-foreground">
            Tekstit, logot ja värijaot. Katalogi kertoo mitä, osa kertoo paljonko.
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Hinta on kiinteä ja asetetaan erikseen kahdelle kategorialle:{" "}
              <span className="font-medium text-foreground">perusväri</span> (Solid / RAL) ja{" "}
              <span className="font-medium text-foreground">erikoisväri</span> (kaikki muut).
              Kumpi on voimassa, ratkeaa lisätyölle valitusta väristä - sama logo maksaa eri
              verran RAL-sävyllä kuin candylla. {tyovaiheenNimi("teippaus")}- ja maalausajat
              kirjataan silti: ne eivät vaikuta hintaan, vaan niistä rakennetaan työjonon
              ajankäyttö. Pesu, maalinpoisto ja puhallus tehdään osalle kerran riippumatta
              väreistä - ne ovat osan työvaiheita, eivät lisätyön.
            </span>
          </p>
        </CardContent>
      </Card>

      <Lisatyolista rivit={rivit} />

      <LisatyonLisays seuraavaJarjestys={(rivit.at(-1)?.jarjestys ?? 0) + 10} />
    </div>
  );
}
