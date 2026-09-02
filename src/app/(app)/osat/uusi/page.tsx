import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { haeAjoneuvotyypit } from "@/lib/supabase/ajoneuvotyypit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { luoOsa } from "../actions";
import { OsaLomake } from "../osa-lomake";

export default async function UusiOsaSivu() {
  await vaaditaanAdmin();
  const ajoneuvotyypit = await haeAjoneuvotyypit();

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
          <OsaLomake formAction={luoOsa} ajoneuvotyypit={ajoneuvotyypit} />
        </CardContent>
      </Card>
    </div>
  );
}
