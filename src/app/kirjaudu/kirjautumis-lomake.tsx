"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Paintbrush } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { kirjaudu, type KirjautumisTila } from "./actions";

const alkutila: KirjautumisTila = { virhe: null };

export function KirjautumisLomake() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [tila, formAction, kaynnissa] = useActionState(kirjaudu, alkutila);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Paintbrush className="size-5" />
        </div>
        <CardTitle className="text-xl">Jauhemaalaamo</CardTitle>
        <CardDescription>Kirjaudu sisään jatkaaksesi</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">Sähköposti</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="salasana">Salasana</Label>
            <Input
              id="salasana"
              name="salasana"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {tila.virhe && (
            <p className="text-sm text-destructive" role="alert">
              {tila.virhe}
            </p>
          )}
          <Button type="submit" disabled={kaynnissa} className="w-full">
            {kaynnissa ? "Kirjaudutaan..." : "Kirjaudu"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
