import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="page legalPage">
      <h1 className="sectionTitle">Termos de Uso</h1>
      <p className="muted">
        Esta versão está em evolução contínua. Ao usar o It&apos;s Alive, você concorda em utilizar a plataforma de forma respeitosa e responsável.
      </p>
      <p className="muted">
        Em breve publicaremos os termos completos com regras de comunidade, conteúdo e moderação para a fase social do produto.
      </p>
      <Link href="/login" className="chip chipGhost">
        Voltar
      </Link>
    </main>
  );
}
