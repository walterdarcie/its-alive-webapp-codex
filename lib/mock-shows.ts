export type ShowRecord = {
  id: string;
  artist: string;
  venue: string;
  city: string;
  country: string;
  eventDate: string; // YYYY-MM-DD
  attendeesPreview?: number;
};

const now = new Date();
const year = now.getUTCFullYear();

export const mockShows: ShowRecord[] = [
  {
    id: "rhcp-kia-forum",
    artist: "Red Hot Chili Peppers",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDate: `${year + 1}-06-20`,
    attendeesPreview: 124
  },
  {
    id: "soad-interlagos",
    artist: "System of a Down",
    venue: "Autódromo de Interlagos",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDate: `${year + 1}-09-14`,
    attendeesPreview: 340
  },
  {
    id: "metallica-forum",
    artist: "Metallica",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDate: `${year - 1}-06-29`,
    attendeesPreview: 999
  },
  {
    id: "slayer-sp",
    artist: "Slayer",
    venue: "Allianz Parque",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDate: `${year - 2}-12-08`,
    attendeesPreview: 420
  }
];

export function isFutureShow(dateIso: string) {
  const showDate = new Date(`${dateIso}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return showDate >= today;
}

export function formatDatePtBr(dateIso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  })
    .format(new Date(`${dateIso}T00:00:00`))
    .replace(".", "")
    .toUpperCase();
}

