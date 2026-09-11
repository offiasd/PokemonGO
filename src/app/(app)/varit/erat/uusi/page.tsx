import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { vaaditaanAdmin } from "@/lib/supabase/kayttaja";
import { Button } from "@/components/ui/button";

import { EraLomake, type ValittavaVari } from "../era-lomake";

export default async function UusiEraSivu() {
  // Erä on taloustietoa: kilohinnat, rahdit ja tullit eivät kuulu maalaajalle.
  await vaaditaanAdmin();
  const supabase = await createClient();

  const { data: varit } = await supabase
    .from("varit")
    .select("id, nimi, valmistaja, alkupera")
    .eq("aktiivinen", true)
    .order("nimi");

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/varit/erat">
            <ArrowLeft className="size-4" />
            Erät
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Uusi maalierä</h1>
      </div>

      <EraLomake varit={(varit ?? []) as ValittavaVari[]} />
    </div>
  );
}
