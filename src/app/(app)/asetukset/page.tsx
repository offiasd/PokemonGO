import { vaaditaanKayttaja } from "@/lib/supabase/kayttaja";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { OmatTiedotLomake } from "./omat-tiedot-lomake";

export default async function OmatTiedotSivu() {
  const kayttaja = await vaaditaanKayttaja();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Omat tiedot</CardTitle>
        <CardDescription>
          Sähköpostia ja roolia ei voi vaihtaa itse - ne muuttaa admin Käyttäjät-sivulta.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3 text-sm sm:max-w-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Sähköposti</span>
            <span className="min-w-0 break-all">{kayttaja.email ?? "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Rooli</span>
            <Badge variant="secondary">
              {kayttaja.role === "admin" ? "Admin" : "Maalaaja"}
            </Badge>
          </div>
        </div>

        <OmatTiedotLomake nimi={kayttaja.fullName ?? ""} />
      </CardContent>
    </Card>
  );
}
