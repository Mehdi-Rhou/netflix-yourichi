// ===== APP LOGIC =====
const app = {
  currentModalData: null,
  currentType: 'movie',
  currentSourceIndex: 0,
  controlsTimeout: null,
  playerMediaInfo: null,

  init() {
    this.setupListeners();
    this.setupPlayerListeners();
    this.loadGenres();
    this.loadHome();
  },

  setupListeners() {
    // Navbar Scroll
    window.addEventListener('scroll', () => {
      document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
    });

    // Search Toggle
    document.getElementById('searchBtn').addEventListener('click', () => {
      const wrap = document.getElementById('searchWrap');
      wrap.classList.toggle('open');
      if (wrap.classList.contains('open')) document.getElementById('searchInput').focus();
    });

    // Search Input
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const q = e.target.value.trim();
      searchTimeout = setTimeout(() => {
        if (q.length > 2) this.performSearch(q);
        else if (q.length === 0) this.showHome();
      }, 500);
    });

    // Modals
    document.getElementById('modalBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modalBackdrop') this.closeModal();
    });
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('videoPlayerOverlay');
        if (overlay.classList.contains('open')) {
          this.closeVideoPlayer();
        } else {
          this.closeModal();
        }
      }
    });
  },

  setupPlayerListeners() {
    document.getElementById('playerBackBtn').addEventListener('click', () => this.closeVideoPlayer());

    document.getElementById('playerFullscreenBtn').addEventListener('click', () => {
      const overlay = document.getElementById('videoPlayerOverlay');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        overlay.requestFullscreen().catch(() => { });
      }
    });
  },

  // ===== DATA LOADING =====
  async loadGenres() {
    try {
      const res = await window.tmdb.movieGenres();
      const container = document.getElementById('genreBar');
      container.innerHTML = `<button class="genre-chip active" onclick="app.filterGenre('all', this)">All</button>`;
      res.genres.slice(0, 15).forEach(g => {
        container.innerHTML += `<button class="genre-chip" onclick="app.filterGenre(${g.id}, this)">${g.name}</button>`;
      });
    } catch (err) { console.error('Failed to load genres', err); }
  },

  async loadHome() {
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('searchPage').classList.remove('visible');

    try {
      const trending = await window.tmdb.trending();
      // Pick a random movie from the top 10 trending to make it dynamic
      const validHeroes = trending.results.slice(0, 10).filter(m => m.backdrop_path);
      const heroMovie = validHeroes[Math.floor(Math.random() * validHeroes.length)] || trending.results[0];
      this.renderHero(heroMovie);

      const rowsContainer = document.getElementById('rowsContainer');
      rowsContainer.innerHTML = '';

      const [pop, tr, now, popTv] = await Promise.all([
        window.tmdb.popular(),
        window.tmdb.topRated(),
        window.tmdb.nowPlaying(),
        window.tmdb.popularTV()
      ]);

      this.renderRow('Trending Now', pop.results, rowsContainer, true);
      this.renderRow('Top Rated Movies', tr.results, rowsContainer);
      this.renderRow('Popular TV Shows', popTv.results, rowsContainer, false, 'tv');
      this.renderRow('In Theaters', now.results, rowsContainer);

    } catch (err) {
      this.showToast('Failed to load content. Please try again.');
      console.error(err);
    }
  },

  async filterGenre(id, btn) {
    document.querySelectorAll('.genre-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (id === 'all') return this.loadHome();

    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('searchPage').classList.remove('visible');

    try {
      const rowsContainer = document.getElementById('rowsContainer');
      rowsContainer.innerHTML = '<div class="loading-text"><div class="loading-spinner"></div>Loading genre...</div>';

      const res = await window.tmdb.moviesByGenre(id);
      rowsContainer.innerHTML = '';
      this.renderRow('Results', res.results, rowsContainer);
    } catch (err) { console.error(err); }
  },

  async performSearch(query) {
    document.getElementById('mainContent').style.display = 'none';
    const sp = document.getElementById('searchPage');
    const grid = document.getElementById('searchGrid');
    sp.classList.add('visible');
    document.querySelector('#searchPage h2').textContent = 'Search Results for "' + query + '"';
    grid.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const res = await window.tmdb.search(query);
      const items = res.results.filter(i => i.poster_path && (i.media_type === 'movie' || i.media_type === 'tv'));

      if (items.length === 0) {
        grid.innerHTML = '<p class="subtitle">No results found for "' + query + '".</p>';
        return;
      }

      grid.innerHTML = items.map(i => this.createCardHTML(i, i.media_type)).join('');
    } catch (err) {
      grid.innerHTML = '<p class="subtitle">Search failed.</p>';
    }
  },

  showHome(event) {
    if (event) {
      document.querySelectorAll('#navLinks a').forEach(a => a.classList.remove('active'));
      event.target.classList.add('active');
    } else {
      // Set Home as active if no event provided (e.g. from logo click)
      document.querySelectorAll('#navLinks a').forEach(a => a.classList.remove('active'));
      const homeLink = document.querySelector('#navLinks a:nth-child(1)');
      if (homeLink) homeLink.classList.add('active');
    }
    document.getElementById('searchInput').value = '';
    document.getElementById('searchWrap').classList.remove('open');
    document.getElementById('searchPage').classList.remove('visible');
    document.getElementById('mainContent').style.display = 'block';

    // Refresh home to potentially get a new hero
    this.loadHome();
  },

  async filterType(type, event) {
    if (event) {
      document.querySelectorAll('#navLinks a').forEach(a => a.classList.remove('active'));
      event.target.classList.add('active');
    }

    document.getElementById('mainContent').style.display = 'none';
    const sp = document.getElementById('searchPage');
    const grid = document.getElementById('searchGrid');
    sp.classList.add('visible');
    grid.innerHTML = '<div class="loading-spinner"></div>';

    try {
      // Fetch popular items of the requested type (fetch 3 pages = 60 items)
      const fetches = [];
      for (let i = 1; i <= 3; i++) {
        if (type === 'anime') fetches.push(window.tmdb.anime(i));
        else if (type === 'tv') fetches.push(window.tmdb.popularTV(i));
        else fetches.push(window.tmdb.popular(i));
      }
      const results = await Promise.all(fetches);
      const items = results.flatMap(r => r.results).filter(i => i.poster_path);

      let title = 'Popular Movies';
      if (type === 'tv') title = 'Popular Series';
      if (type === 'anime') title = 'Popular Anime';

      document.querySelector('#searchPage h2').textContent = title;

      grid.innerHTML = '';
      items.forEach(item => {
        // Anime uses the TV show endpoints in TMDB
        item.media_type = type === 'anime' ? 'tv' : type;
        grid.innerHTML += this.createCardHTML(item, item.media_type);
      });
    } catch (err) {
      grid.innerHTML = '<p class="subtitle">Failed to load content.</p>';
      console.error(err);
    }
  },

  // ===== RENDERING =====
  renderHero(m) {
    const isTv = m.media_type === 'tv' || m.name;
    const title = m.title || m.name;
    const year = (m.release_date || m.first_air_date || '').split('-')[0];
    const bgUrl = window.tmdb.backdrop(m.backdrop_path);

    document.getElementById('heroBg').style.backgroundImage = `url('${bgUrl}')`;
    document.getElementById('heroTitle').textContent = title;
    document.getElementById('heroOverview').textContent = m.overview;

    let metaHTML = `<span class="match">${Math.round(m.vote_average * 10)}% Match</span><span>${year}</span>`;
    if (isTv) metaHTML += `<span class="tag-badge">TV</span>`;
    document.getElementById('heroMeta').innerHTML = metaHTML;

    const watchBtn = document.getElementById('heroWatchBtn');
    watchBtn.onclick = () => this.openModal(m.id, isTv ? 'tv' : 'movie');
  },

  renderRow(title, items, container, isTop10 = false, forcedType = null) {
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'content-section';

    const rowId = 'row-' + Math.random().toString(36).substr(2, 9);

    let innerHTML = `
      <div class="section-header">
        <div class="section-title">${title} <span class="section-see-all">Explore All</span></div>
      </div>
      <div class="row-container">
        <button class="scroll-arrow left" onclick="app.scrollRow('${rowId}', -1)">&#8249;</button>
        <div class="content-row" id="${rowId}">
    `;

    if (isTop10) {
      items.slice(0, 10).forEach((item, i) => {
        const type = forcedType || item.media_type || (item.name ? 'tv' : 'movie');
        const img = window.tmdb.poster(item.poster_path);
        innerHTML += `
          <div class="top10-card" onclick="app.openModal(${item.id}, '${type}')">
            <div class="top10-rank">${i + 1}</div>
            <div class="top10-poster"><img src="${img}" loading="lazy"></div>
          </div>
        `;
      });
    } else {
      items.forEach(item => {
        const type = forcedType || item.media_type || (item.name ? 'tv' : 'movie');
        innerHTML += this.createCardHTML(item, type);
      });
    }

    innerHTML += `
        </div>
        <button class="scroll-arrow right" onclick="app.scrollRow('${rowId}', 1)">&#8250;</button>
      </div>
    `;

    section.innerHTML = innerHTML;
    container.appendChild(section);
  },

  createCardHTML(item, type) {
    if (!item.poster_path) return '';
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const img = window.tmdb.poster(item.poster_path);
    const vote = Math.round(item.vote_average * 10) + '%';

    return `
      <div class="card" onclick="app.openModal(${item.id}, '${type}')">
        <div class="card-inner">
          <img src="${img}" alt="${title}" loading="lazy">
          <div class="card-overlay">
            <div class="card-actions">
              <div class="card-btn play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
              <div class="card-btn"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></div>
            </div>
            <div class="card-title">${title}</div>
            <div class="card-meta"><span class="rating">${vote} Match</span><span>${year}</span></div>
          </div>
        </div>
      </div>
    `;
  },

  scrollRow(id, dir) {
    const el = document.getElementById(id);
    if (el) el.scrollBy({ left: dir * (window.innerWidth * 0.6), behavior: 'smooth' });
  },

  // ===== MODAL & DETAILS =====
  async openModal(id, type) {
    this.currentType = type;
    this.closeVideoPlayer();
    document.getElementById('streamsSection').classList.remove('visible');
    document.getElementById('episodesSection').style.display = 'none';
    document.getElementById('modalDetails').innerHTML = '';

    const backdrop = document.getElementById('modalBackdrop');
    backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
      const data = type === 'tv' ? await window.tmdb.tvDetails(id) : await window.tmdb.movieDetails(id);
      this.currentModalData = data;

      const title = data.title || data.name;
      const year = (data.release_date || data.first_air_date || '').split('-')[0];
      const duration = type === 'movie' && data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : (data.number_of_seasons ? `${data.number_of_seasons} Seasons` : '');
      const bgUrl = window.tmdb.backdrop(data.backdrop_path);

      document.getElementById('modalBannerImg').src = bgUrl;
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalOverview').textContent = data.overview;

      let metaHtml = `<span style="color:var(--green);font-weight:700">${Math.round(data.vote_average * 10)}% Match</span>`;
      if (year) metaHtml += `<span>${year}</span>`;
      if (duration) metaHtml += `<span>${duration}</span>`;
      document.getElementById('modalMeta').innerHTML = metaHtml;

      const cast = data.credits && data.credits.cast ? data.credits.cast.slice(0, 5).map(c => c.name).join(', ') : 'Unknown';
      const genres = data.genres ? data.genres.map(g => g.name).join(', ') : '';
      document.getElementById('modalDetails').innerHTML = `
        <p><span class="label">Cast: </span><span>${cast}</span></p>
        <p><span class="label">Genres: </span><span>${genres}</span></p>
      `;

      // Main Watch Button
      const watchBtn = document.getElementById('modalWatchBtn');
      if (type === 'tv') {
        watchBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" style="fill:black"><path d="M8 5v14l11-7z"/></svg> View Episodes';
        watchBtn.onclick = () => {
          document.getElementById('episodesSection').scrollIntoView({ behavior: 'smooth' });
        };
        this.renderSeasons(data);
      } else {
        watchBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" style="fill:black"><path d="M8 5v14l11-7z"/></svg> Fetch Streams';
        // Check root imdb_id first, then external_ids
        const movieImdbId = data.imdb_id || data.external_ids?.imdb_id;
        watchBtn.onclick = () => this.fetchStreams(movieImdbId);
      }

    } catch (err) {
      this.showToast('Failed to load details.');
      console.error(err);
    }
  },

  closeModal() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.body.style.overflow = '';
    this.closeVideoPlayer();
  },

  // ===== TV SHOW LOGIC =====
  renderSeasons(data) {
    if (!data.seasons || data.seasons.length === 0) return;

    document.getElementById('episodesSection').style.display = 'block';
    const tabs = document.getElementById('seasonTabs');
    tabs.innerHTML = '';

    const validSeasons = data.seasons.filter(s => s.season_number > 0);

    validSeasons.forEach((s, i) => {
      const btn = document.createElement('button');
      btn.className = `season-tab ${i === 0 ? 'active' : ''}`;
      btn.textContent = s.name;
      btn.onclick = (e) => {
        document.querySelectorAll('.season-tab').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.loadSeasonEpisodes(data.id, s.season_number);
      };
      tabs.appendChild(btn);
    });

    if (validSeasons.length > 0) {
      this.loadSeasonEpisodes(data.id, validSeasons[0].season_number);
    }
  },

  async loadSeasonEpisodes(showId, seasonNum) {
    const list = document.getElementById('episodesList');
    list.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';
    document.getElementById('streamsSection').classList.remove('visible');

    try {
      const data = await window.tmdb.tvSeason(showId, seasonNum);
      list.innerHTML = '';

      data.episodes.forEach((ep, index) => {
        const isUnaired = ep.air_date && new Date(ep.air_date) > new Date();
        const img = ep.still_path ? window.tmdb.poster(ep.still_path) : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNjAiIGhlaWdodD0iMTQ2IiBmaWxsPSIjMmIyYjJiIj48cmVjdCB3aWR0aD0iMjYwIiBoZWlnaHQ9IjE0NiIvPjwvc3ZnPg==';
        const div = document.createElement('div');
        div.className = 'episode-item';

        // Anime like One Piece use absolute episode numbers (e.g., 1160) but Torrentio expects relative (e.g. S23E5)
        const relativeEpNum = ep.episode_number > data.episodes.length + 50 ? index + 1 : ep.episode_number;

        if (isUnaired) {
          div.style.opacity = '0.5';
          div.style.pointerEvents = 'none';
        } else {
          div.onclick = () => this.fetchStreams(
            this.currentModalData.external_ids?.imdb_id,
            seasonNum,
            relativeEpNum,
            ep.episode_number
          );
        }

        div.innerHTML = `
          <div class="ep-num">${ep.episode_number}</div>
          <div class="ep-thumb"><img src="${img}" loading="lazy"></div>
          <div class="ep-info">
            <div class="ep-title">${ep.name} <span style="font-weight:400;color:#777;font-size:0.75rem;margin-left:8px">${ep.runtime || '--'}m</span></div>
            <div class="ep-overview">${isUnaired ? `<strong style="color:var(--primary)">Airs on: ${ep.air_date}</strong>` : (ep.overview || 'No overview available.')}</div>
          </div>
          <div class="ep-play" style="${isUnaired ? 'display:none;' : ''}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        `;
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = '<p class="text-muted">Failed to load episodes.</p>';
      console.error(err);
    }
  },

  // ===== STREAM FETCHING (TORRENTIO) =====
  async fetchStreams(imdbId, season = null, episode = null, tmdbEpisode = null) {
    if (!imdbId) {
      this.showToast('IMDB ID missing for this title.', true);
      return;
    }

    const section = document.getElementById('streamsSection');
    const list = document.getElementById('streamsList');

    section.classList.add('visible');
    list.innerHTML = '<div class="loading-text"><div class="loading-spinner"></div>Searching Torrentio...</div>';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      let type = this.currentType === 'tv' ? 'series' : 'movie';
      const streams = await window.torrentio.getStreams(type, imdbId, season, episode);

      if (!streams || streams.length === 0) {
        list.innerHTML = '<div class="loading-text" style="color:var(--primary)">No streams found.</div>';
        return;
      }

      // Build the streams list with clean Magnet links
      list.innerHTML = '';

      // Add "Play in Browser" quick button (opens the 11 web players)
      const quickPlay = document.createElement('div');
      quickPlay.className = 'stream-quick-play';
      quickPlay.innerHTML = `
        <button class="btn btn-primary" id="quickPlayBtn">
          <svg width="20" height="20" viewBox="0 0 24 24" style="fill:black;margin-right:8px"><path d="M8 5v14l11-7z"/></svg>
          Play in Browser
        </button>
        <span class="quick-play-hint">Watch instantly with 11 ad-free players</span>
      `;
      list.appendChild(quickPlay);

      document.getElementById('quickPlayBtn').onclick = () => {
        const title = this.currentModalData?.title || this.currentModalData?.name || 'Video';
        this.openVideoPlayer({
          tmdbId: this.currentModalData?.id,
          imdbId: imdbId,
          type: this.currentType === 'tv' ? 'tv' : 'movie',
          season: season,
          episode: tmdbEpisode || episode,
          isAnime: this.currentType === 'anime',
          title: season ? `${title} — S${season}E${tmdbEpisode || episode}` : title,
        });
      };

      streams.forEach(s => {
        const magnet = window.torrentio.magnetURI(s.infoHash, s.filename);
        const qClass = window.torrentio.qualityClass(s.quality);

        const div = document.createElement('div');
        div.className = 'stream-item';
        div.innerHTML = `
          <div class="stream-quality ${qClass}">${s.quality}</div>
          <div class="stream-details">
            <div class="stream-filename" title="${s.filename}">${s.filename || 'Unknown File'}</div>
            <div class="stream-meta-line">
              <span class="source">${s.source || s.name}</span>
              ${s.size ? `<span class="size">${s.size}</span>` : ''}
              ${s.seeds ? `<span class="seeds">👤 ${s.seeds}</span>` : ''}
            </div>
          </div>
          <div class="stream-buttons">
            <button class="btn btn-red btn-xs" onclick="event.stopPropagation(); window.open('https://webtor.io/#/show?magnet=' + encodeURIComponent('${magnet.replace(/'/g, "\\'")}'), '_blank')">⬇ Download</button>
          </div>
        `;
        list.appendChild(div);
      });

    } catch (err) {
      list.innerHTML = '<div class="loading-text" style="color:var(--primary)">Error fetching streams. Torrentio might be down.</div>';
      console.error(err);
    }
  },

  playMagnet(magnet, filename) {
    this.openVideoPlayer({
      title: filename || "Torrent Stream",
      magnet: magnet,
      isTorrent: true
    });
  },

  // ===== FULLSCREEN VIDEO PLAYER (EMBED) =====
  openVideoPlayer(mediaInfo) {
    this.playerMediaInfo = mediaInfo;
    this.currentSourceIndex = 0;

    const overlay = document.getElementById('videoPlayerOverlay');
    const titleEl = document.getElementById('playerTitleText');
    const loading = document.getElementById('playerLoading');

    titleEl.textContent = mediaInfo.title || 'Playing...';
    loading.classList.remove('hidden');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    this.buildSourceTabs();

    // Auto-select Direct Stream if it's a torrent request
    if (mediaInfo.isTorrent) {
      const directIndex = window.embedSources.findIndex(s => s.isCustom);
      this.switchSource(directIndex !== -1 ? directIndex : 0);
    } else {
      this.switchSource(0);
    }
  },

  buildSourceTabs() {
    const container = document.getElementById('sourceTabs');
    container.innerHTML = '';

    window.embedSources.forEach((src, i) => {
      const tab = document.createElement('button');
      tab.className = `source-tab ${i === 0 ? 'active' : ''}`;
      tab.innerHTML = `<span class="source-icon">${src.icon}</span>${src.name}`;
      tab.onclick = () => this.switchSource(i);
      container.appendChild(tab);
    });
  },

  switchSource(index) {
    this.currentSourceIndex = index;
    const info = this.playerMediaInfo;
    const src = window.embedSources[index];
    if (!src || !info) return;

    document.querySelectorAll('.source-tab').forEach((tab, i) => {
      tab.classList.toggle('active', i === index);
    });

    const iframe = document.getElementById('playerIframe');
    const loading = document.getElementById('playerLoading');
    loading.classList.remove('hidden');

    // Switch to iframe player
    iframe.classList.remove('hidden');
    iframe.src = "";

    const tempErr = document.getElementById('tempError');
    if (tempErr) tempErr.remove();
    let url;
    if (info.type === 'tv' || info.type === 'series') {
      const s = info.season || 1;
      const e = info.episode || 1;

      // If it's an anime and source has specialized anime logic
      if (info.isAnime) {
        url = src.tvUrl(info.tmdbId, s, e);
      } else {
        url = src.tvUrl(info.tmdbId, s, e);
      }
    } else {
      url = src.movieUrl(info.tmdbId);
    }

    setTimeout(() => { iframe.src = url; }, 100);
    iframe.onload = () => {
      setTimeout(() => loading.classList.add('hidden'), 600);
    };

    // Fallback: hide loading after 5s even if onload doesn't fire
    setTimeout(() => loading.classList.add('hidden'), 5000);
  },

  closeVideoPlayer() {
    const overlay = document.getElementById('videoPlayerOverlay');
    if (!overlay) return;
    const iframe = document.getElementById('playerIframe');
    const customPlayer = document.getElementById('customVideoPlayer');

    // Stop custom player
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (customPlayer) {
      customPlayer.pause();
      customPlayer.src = "";
      customPlayer.load();
    }

    const tempErr = document.getElementById('tempError');
    if (tempErr) tempErr.remove();

    overlay.classList.remove('open');
    overlay.classList.remove('hide-controls');
    document.body.style.overflow = '';

    setTimeout(() => { iframe.src = 'about:blank'; }, 400);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { });
    }

    this.playerMediaInfo = null;
    clearTimeout(this.controlsTimeout);
  },

  // ===== UTILS =====
  showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    if (isError) t.classList.add('error'); else t.classList.remove('error');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }
};

window.onload = () => app.init();
