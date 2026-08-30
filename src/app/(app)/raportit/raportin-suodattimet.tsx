"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const JAKSOT = [
  { arvo: "paiva", nimi: "Päivä" },
  { arvo: "viikko", nimi: "Viikko" },
  { arvo: "kuukausi", nimi: "Kuukausi" },
  { arvo: "vuosi", nimi: "Vuosi" },
];

interface Vaihtoehto {
  id: string;
  nimi: string;
}

export function RaportinSuodattimet({
  varit,
  osat,
}: {
  varit: Vaihtoehto[];
  osat: Vaihtoehto[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function paivitaParametri(avain: string, arvo: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (arvo) {
      params.set(avain, arvo);
    } else {
      params.delete(avain);
    }
    router.push(`/raportit?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Jaksotus</Label>
        <Select
          value={searchParams.get("jakso") ?? "kuukausi"}
          onValueChange={(v) => paivitaParametri("jakso", v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JAKSOT.map((j) => (
              <SelectItem key={j.arvo} value={j.arvo}>
                {j.nimi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Alkaen</Label>
        <Input
          type="date"
          defaultValue={searchParams.get("alkaen") ?? ""}
          className="w-40"
          onChange={(e) => paivitaParametri("alkaen", e.target.value || null)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Päättyen</Label>
        <Input
          type="date"
          defaultValue={searchParams.get("paattyen") ?? ""}
          className="w-40"
          onChange={(e) => paivitaParametri("paattyen", e.target.value || null)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Väri</Label>
        <Select
          value={searchParams.get("variId") ?? "kaikki"}
          onValueChange={(v) => paivitaParametri("variId", v === "kaikki" ? null : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kaikki">Kaikki värit</SelectItem>
            {varit.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.nimi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs text-muted-foreground">Osa</Label>
        <Select
          value={searchParams.get("osaId") ?? "kaikki"}
          onValueChange={(v) => paivitaParametri("osaId", v === "kaikki" ? null : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kaikki">Kaikki osat</SelectItem>
            {osat.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nimi}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
