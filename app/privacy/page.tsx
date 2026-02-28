import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="page legalPage">
      <h1 className="sectionTitle">Privacidade</h1>
      <p className="muted">
        Seu acesso é feito via Google OAuth. Nesta fase, os dados salvos são usados apenas para manter sua carteira de shows sincronizada entre dispositivos.
      </p>
      <p className="muted">Não compartilhamos dados pessoais com terceiros fora dos serviços essenciais de autenticação e infraestrutura.</p>
      <Link href="/login" className="chip chipGhost">
        Voltar
      </Link>
    </main>
  );
}
