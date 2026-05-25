"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n-context";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <main className="page legalPage">
      <h1 className="sectionTitle">{t.privacy.title}</h1>
      <p className="muted">{t.privacy.body1}</p>
      <p className="muted">{t.privacy.body2}</p>
      <Link href="/login" className="chip chipGhost">
        {t.privacy.back}
      </Link>
    </main>
  );
}
