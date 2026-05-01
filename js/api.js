// ===== CONFIGURATION =====
const TMDB_API_KEY = '2dca580c2a14b55200e784d157207b4d';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_URL = 'https://image.tmdb.org/t/p/original';

// ===== TMDB API HELPER =====
const tmdb = {
  fetch: async (path, params = '') => {
    const res = await fetch(`${TMDB_BASE_URL}${path}?api_key=${TMDB_API_KEY}&${params}`);
    return await res.json();
  },
  trending: (page = 1) => tmdb.fetch('/trending/all/day', `page=${page}`),
  popular: (page = 1) => tmdb.fetch('/movie/popular', `page=${page}`),
  popularTV: (page = 1) => tmdb.fetch('/tv/popular', `page=${page}`),
  topRated: (page = 1) => tmdb.fetch('/movie/top_rated', `page=${page}`),
  nowPlaying: (page = 1) => tmdb.fetch('/movie/now_playing', `page=${page}`),
  movieGenres: () => tmdb.fetch('/genre/movie/list'),
  moviesByGenre: (id, page = 1) => tmdb.fetch('/discover/movie', `with_genres=${id}&page=${page}`),
  search: (query) => tmdb.fetch('/search/multi', `query=${encodeURIComponent(query)}`),
  movieDetails: (id) => tmdb.fetch(`/movie/${id}`, 'append_to_response=credits,videos,external_ids'),
  tvDetails: (id) => tmdb.fetch(`/tv/${id}`, 'append_to_response=credits,videos,external_ids'),
  tvSeason: (id, seasonNum) => tmdb.fetch(`/tv/${id}/season/${seasonNum}`),
  anime: (page = 1) => tmdb.fetch('/discover/tv', `with_genres=16&with_keywords=210024&page=${page}`),
  poster: (path) => path ? `${TMDB_IMG_URL}${path}` : 'https://via.placeholder.com/500x750?text=No+Image',
  backdrop: (path) => path ? `${TMDB_BACKDROP_URL}${path}` : 'https://via.placeholder.com/1920x1080?text=No+Image'
};

// ===== EMBED PLAYER SOURCES =====
const embedSources = [
  {
    name: 'VidLink (Elite)',
    icon: '💎',
    movieUrl: (tmdbId) => `https://vidlink.pro/movie/${tmdbId}?primaryColor=E50914&secondaryColor=990000&autoplay=true&title=false`,
    tvUrl: (tmdbId, s, e) => `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?primaryColor=E50914&secondaryColor=990000&autoplay=true&title=false`,
  },
  {
    name: 'MoviesAPI',
    icon: '🎬',
    movieUrl: (tmdbId) => `https://moviesapi.club/movie/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://moviesapi.club/tv/${tmdbId}-${s}-${e}`,
  },
  {
    name: 'NontonGo',
    icon: '🌏',
    movieUrl: (tmdbId) => `https://www.nontongo.win/embed/movie/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://www.nontongo.win/embed/tv/${tmdbId}/${s}/${e}`,
  },
  {
    name: 'VidSrc.cc',
    icon: '🔤',
    movieUrl: (tmdbId) => `https://vidsrc.cc/v2/embed/movie/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://vidsrc.cc/v2/embed/tv/${tmdbId}/${s}/${e}`,
  },
  {
    name: 'SmashyStream',
    icon: '💥',
    movieUrl: (tmdbId) => `https://player.smashy.stream/movie/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://player.smashy.stream/tv/${tmdbId}?s=${s}&e=${e}`,
  },
  {
    name: 'AutoEmbed',
    icon: '🚀',
    movieUrl: (tmdbId) => `https://autoembed.co/movie/tmdb/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://autoembed.co/tv/tmdb/${tmdbId}-${s}-${e}`,
  },
  {
    name: '2embed',
    icon: '🎯',
    movieUrl: (tmdbId) => `https://www.2embed.cc/embed/${tmdbId}`,
    tvUrl: (tmdbId, s, e) => `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}`,
  }
];

// ===== TORRENTIO STREAM PARSER =====
// Torrentio packs everything into s.title (e.g. "1080p\n👤 42 Peers\n💾 2.1 GB\n⚙️ YTS")
// This parser extracts quality, filename, size, seeds, and source from that string.
function parseTorrentioStream(s) {
  const raw = s.title || '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  // Default quality
  let quality = 'SD';
  const firstLine = lines[0] || '';
  const fullText = raw.toLowerCase();

  // Smart Quality Extraction
  if (fullText.includes('2160') || fullText.includes('4k') || fullText.includes('uhd')) quality = '4K';
  else if (fullText.includes('1080')) quality = '1080p';
  else if (fullText.includes('720')) quality = '720p';
  else if (fullText.includes('480')) quality = '480p';
  else if (firstLine.length <= 10) quality = firstLine; // Use short tags like 'WEB-DL'

  // Filename: try to get a clean name
  let filename = s.behaviorHints?.filename || s.name || '';
  if (!filename || filename.length < 5) {
    filename = lines.find(l => l.includes('.') && l.length > 10) || lines[0];
  }

  // Extract size (just the number and unit)
  const sizeMatch = raw.match(/(\d+(\.\d+)?\s*(GB|MB))/i);
  const size = sizeMatch ? sizeMatch[0] : '';

  // Extract seeds
  const seedMatch = raw.match(/(👤|Seeds:|👤)\s*(\d+)/i);
  const seeds = seedMatch ? seedMatch[2] : (raw.match(/\d+(?=\s*Peers)/i)?.[0] || '');

  // Extract provider (clean)
  const sourceMatch = raw.match(/(⚙️|Source:)\s*([^\n👤💾]+)/i);
  const source = sourceMatch ? sourceMatch[2].trim() : (s.name || '');

  return { quality, filename, size, seeds, source };
}

// ===== TORRENTIO API HELPER =====
const torrentio = {
  getStreams: async (type, imdbId, season, episode) => {
    if (!imdbId) return [];

    // FIX 1: Removed dead provider 'rarbg' (shut down 2023)
    // FIX 2: Correct URL format — providers= comes before |sort=
    const providers = 'yts,eztv,1337x,thepiratebay,kickasstorrents,torrent9,nyaasi,tgx,nyaa';
    let id = imdbId;
    if (type === 'series') id = `${imdbId}:${season}:${episode}`;

    const url = `https://torrentio.strem.fun/providers=${providers}|sort=qualitysize/stream/${type}/${id}.json`;
    console.log("Torrentio Search:", url);

    try {
      const res = await fetch(url);
      const data = await res.json();
      const streams = data.streams || [];

      // Attach parsed fields directly onto each stream object so app.js can use them
      return streams.map(s => {
        const parsed = parseTorrentioStream(s);
        return {
          ...s,
          quality: parsed.quality,
          filename: parsed.filename,
          size: parsed.size,
          seeds: parsed.seeds,
          source: parsed.source,
        };
      });
    } catch (err) {
      console.error("Torrentio Error:", err);
      return [];
    }
  },

  magnetURI: (infoHash, filename) =>
    `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(filename)}&tr=udp://tracker.opentrackr.org:1337/announce`,

  qualityClass: (quality) => {
    if (!quality) return 'q-sd';
    const q = quality.toLowerCase();
    if (q.includes('2160') || q.includes('4k')) return 'q-4k';
    if (q.includes('1080')) return 'q-1080';
    if (q.includes('720')) return 'q-720';
    return 'q-sd';
  }
};

// Expose to window
window.tmdb = tmdb;
window.TMDB_API_KEY = TMDB_API_KEY;
window.embedSources = embedSources;
window.torrentio = torrentio;