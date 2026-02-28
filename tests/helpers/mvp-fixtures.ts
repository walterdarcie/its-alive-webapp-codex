export const MOCK_SEARCH_SHOWS = [
  {
    id: "future-01",
    artist: "Red Hot Chilli Peppers",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDateIso: "2026-12-10",
    artistMbid: "mbid-rhcp"
  },
  {
    id: "future-02",
    artist: "System of a Down",
    venue: "Autódromo de Interlagos",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDateIso: "2026-12-12",
    artistMbid: "mbid-soad"
  },
  {
    id: "past-01",
    artist: "Metallica",
    venue: "Kia Forum",
    city: "Inglewood, CA",
    country: "USA",
    eventDateIso: "2025-06-29",
    artistMbid: "mbid-metallica"
  },
  {
    id: "past-02",
    artist: "Angra",
    venue: "Tokio Marine Hall",
    city: "São Paulo, SP",
    country: "Brasil",
    eventDateIso: "2025-03-03",
    artistMbid: "mbid-angra"
  }
];

export const MOCK_DETAIL_PAYLOAD = {
  id: "past-01",
  artist: "Metallica",
  venue: "Kia Forum",
  city: "Inglewood, CA",
  country: "USA",
  eventDateIso: "2025-06-29",
  artistMbid: "mbid-metallica",
  setlistUrl: "https://www.setlist.fm/setlist/example",
  tourName: "M72 World Tour",
  songNames: [
    "Creeping Death",
    "Harvester of Sorrow",
    "Hit the Lights",
    "King Nothing",
    "72 Seasons",
    "Fuel",
    "Sad but True",
    "One",
    "Master of Puppets",
    "Enter Sandman"
  ],
  setlistSections: [
    {
      label: "Main Set",
      songs: [
        "Creeping Death",
        "Harvester of Sorrow",
        "Hit the Lights",
        "King Nothing",
        "72 Seasons",
        "Fuel",
        "Sad but True",
        "One",
        "Master of Puppets",
        "Enter Sandman"
      ]
    }
  ]
};

export const MOCK_ARTIST_IMAGE = {
  imageUrl: "https://images.unsplash.com/photo-1501612780327-45045538702b",
  pageUrl: "https://wikipedia.org",
  source: "wikipedia"
} as const;
