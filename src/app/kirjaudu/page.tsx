import { Suspense } from "react";

import { KirjautumisLomake } from "./kirjautumis-lomake";

export default function KirjauduSivu() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Suspense>
        <KirjautumisLomake />
      </Suspense>
    </main>
  );
}
