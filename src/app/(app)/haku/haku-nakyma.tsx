"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Paintbrush, Search, Wrench } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface Tulos {
  tyyppi: "vari" | "osa";
  id: string;
  otsikko: string;
  alaotsikko: string;
  osuvuus: number;
}

export function HakuNakyma() {
  const [kysely, setKysely] = useState("");
  const [tulokset, setTulokset] = useState<Tulos[]>([]);
  const [lataa, setLataa] = useState(false);
  const [haettu, setHaettu] = useState(false);
  useEffect(() => {
    const ajastin = setTimeout(async () => {
      const trimmattu = kysely.trim();
      if (trimmattu.length < 2) {
        setTulokset([]);
        setHaettu(false);
        return;
      }

      setLataa(true);
      const supabase = createClient();
      const { data } = await supabase.rpc("haku", { p_kysely: trimmattu });
      setTulokset((data as Tulos[]) ?? []);
      setHaettu(true);
      setLataa(false);
    }, 300);

    return () => clearTimeout(ajastin);
  }, [kysely]);

  const varit = tulokset.filter((t) => t.tyyppi === "vari");
  const osat = tulokset.filter((t) => t.tyyppi === "osa");

  return (
    <div className="grid gap-6">
      <div className="relative max-w-lg">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        {lataa && (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        <Input
          autoFocus
          placeholder="Hae väriä tai osaa (nimi, valmistaja, merkki, malli)..."
          value={kysely}
          onChange={(e) => setKysely(e.target.value)}
          className="pl-9"
        />
      </div>

      {haettu && tulokset.length === 0 && (
        <p className="text-muted-foreground">Ei osumia haulle &quot;{kysely}&quot;.</p>
      )}

      {varit.length > 0 && (
        <div className="grid gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Paintbrush className="size-4" />
            Värit
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {varit.map((t) => (
              <Link key={t.id} href={`/varit/${t.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-2 py-4">
                    <div>
                      <p className="font-medium">{t.otsikko}</p>
                      {t.alaotsikko && (
                        <p className="text-sm text-muted-foreground">{t.alaotsikko}</p>
                      )}
                    </div>
                    <Badge variant="outline">Väri</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {osat.length > 0 && (
        <div className="grid gap-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wrench className="size-4" />
            Osat
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {osat.map((t) => (
              <Link key={t.id} href={`/osat/${t.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-2 py-4">
                    <div>
                      <p className="font-medium">{t.otsikko}</p>
                      {t.alaotsikko && (
                        <p className="text-sm text-muted-foreground">{t.alaotsikko}</p>
                      )}
                    </div>
                    <Badge variant="outline">Osa</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
