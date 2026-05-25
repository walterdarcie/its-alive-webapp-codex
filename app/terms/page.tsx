"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n-context";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <main className="page legalPage">
      <h1 className="sectionTitle">{t.terms.title}</h1>
      <p className="muted">{t.terms.body1}</p>
      <p className="muted">{t.terms.body2}</p>
      <Link href="/login" className="chip chipGhost">
        {t.terms.back}
      </Link>
    </main>
  );
}
