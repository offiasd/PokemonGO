import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { luoOsa } from "../actions";
import { OsaLomake } from "../osa-lomake";

export default async function UusiOsaSivu() {
  await vaaditaanAdmin();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Lisää osa</h1>
        <p className="text-muted-foreground">Uuden maalattavan osan tiedot.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Osan tiedot</CardTitle>
        </CardHeader>
        <CardContent>
          <OsaLomake formAction={luoOsa} />
        </CardContent>
      </Card>
    </div>
  );
}
