import Link from "next/link";
import { formatDatePtBr, isFutureShow, mockShows } from "@/lib/mock-shows";

function EventCard({
  artist,
  venue,
  city,
  country,
  eventDate
}: {
  artist: string;
  venue: string;
  city: string;
  country: string;
  eventDate: string;
}) {
  const daysAway = Math.ceil(
    (new Date(`${eventDate}T00:00:00`).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <article className="card">
      <div className="cardImage">Imagem do artista (placeholder)</div>
      <div className="cardBody">
        <div className="cardMeta">{daysAway > 0 ? `Faltam ${daysAway} dias!` : "Hoje!"}</div>
        <h3 className="cardTitle">{artist}</h3>
        <div className="cardVenue">
          {venue}, {city}, {country}
        </div>
      </div>
    </article>
  );
}

function TicketRow({
  id,
  artist,
  venue,
  city,
  country,
  eventDate
}: {
  id: string;
  artist: string;
  venue: string;
  city: string;
  country: string;
  eventDate: string;
}) {
  return (
    <article className="ticket">
      <div className="ticketThumb">Foto</div>
      <div className="ticketBody">
        <p className="ticketDate">{formatDatePtBr(eventDate)}</p>
        <h3 className="ticketName">{artist}</h3>
        <p className="ticketVenue">
          {venue}, {city}, {country}
        </p>
      </div>
      <div className="ticketAction">
        <Link className="chip" href={`/show/${id}`}>
          DETALHES
        </Link>
      </div>
    </article>
  );
}

export default function HomePage() {
  const futureShows = mockShows.filter((show) => isFutureShow(show.eventDate));
  const pastShows = mockShows.filter((show) => !isFutureShow(show.eventDate));

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <span>it&apos;s</span>
          <span className="brandTicket">alive</span>
        </div>
        <div className="avatarStub" aria-hidden />
      </header>

      <input className="search" placeholder="Encontre shows incríveis" disabled />

      <section className="section" aria-labelledby="shows-futuros">
        <h2 id="shows-futuros" className="sectionTitle">
          Eu vou!
        </h2>
        {futureShows.length ? (
          <div className="slider">
            {futureShows.map((show) => (
              <Link key={show.id} href={`/show/${show.id}`}>
                <EventCard {...show} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum show futuro marcado.</p>
        )}
      </section>

      <section className="section" aria-labelledby="shows-passados">
        <h2 id="shows-passados" className="sectionTitle">
          Eu fui!
        </h2>
        {pastShows.length ? (
          <div className="ticketList">
            {pastShows.map((show) => (
              <TicketRow key={show.id} {...show} />
            ))}
          </div>
        ) : (
          <p className="muted">Nenhum show passado na carteira.</p>
        )}
      </section>

      <p className="footerHint">
        Base inicial criada para destravar Vercel. Próximo passo: busca real via Setlist.fm + carteira persistida.
      </p>
    </main>
  );
}

