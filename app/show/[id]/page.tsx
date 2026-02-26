import Link from "next/link";
import { formatDatePtBr, isFutureShow, mockShows } from "@/lib/mock-shows";

export default function ShowDetailPage({ params }: { params: { id: string } }) {
  const show = mockShows.find((item) => item.id === params.id);

  if (!show) {
    return (
      <main className="page">
        <p className="muted">Show não encontrado.</p>
        <Link className="chip" href="/">
          VOLTAR
        </Link>
      </main>
    );
  }

  const future = isFutureShow(show.eventDate);

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="muted">
          ← Voltar
        </Link>
        <div className="avatarStub" aria-hidden />
      </header>

      <article className="card">
        <div className="cardImage">Imagem do show (placeholder)</div>
        <div style={{ padding: 16, background: "rgba(15, 31, 67, 0.95)" }}>
          <p className="ticketDate" style={{ marginTop: 0 }}>
            {formatDatePtBr(show.eventDate)}
          </p>
          <h1 style={{ margin: "0 0 8px", fontSize: 42, lineHeight: 1, fontWeight: 700 }}>{show.artist}</h1>
          <p className="ticketVenue" style={{ marginBottom: 16 }}>
            {show.venue}, {show.city}, {show.country}
          </p>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="chip">
              {future ? "EU VOU!" : "EU FUI!"}
            </button>
            <span className="muted">MVP: ação ainda sem persistência</span>
          </div>
        </div>
      </article>
    </main>
  );
}

