(function () {
  const USERS_KEY = 'ryw_users';
  const CURRENT_USER_KEY = 'ryw_current_user';
  const RATINGS_KEY = 'ryw_ratings';
  const FRIENDS_KEY = 'ryw_friends';

  const TMDB_API_KEY = '32335edf13a294b190f646c64e57bdf4';
  const TMDB_BASE = 'https://api.themoviedb.org/3';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() {
    return readJSON(USERS_KEY, {});
  }

  function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
  }

  function setCurrentUser(username) {
    if (!username) {
      localStorage.removeItem(CURRENT_USER_KEY);
      return;
    }
    localStorage.setItem(CURRENT_USER_KEY, username);
  }

  function getRatings() {
    const ratings = readJSON(RATINGS_KEY, []);
    return ratings.map((rating) => ({
      id: rating.id || `${rating.username}-${rating.title}-${rating.createdAt || Date.now()}`,
      ...rating,
    }));
  }

  function writeRatings(ratings) {
    writeJSON(RATINGS_KEY, ratings);
  }

  function upsertRating(rating) {
    const ratings = getRatings();
    const index = ratings.findIndex((item) => item.id === rating.id);
    if (index >= 0) {
      ratings[index] = rating;
    } else {
      ratings.unshift(rating);
    }
    writeRatings(ratings);
  }

  function deleteRating(id) {
    const ratings = getRatings().filter((rating) => rating.id !== id);
    writeRatings(ratings);
  }

  function getFriendMap() {
    return readJSON(FRIENDS_KEY, {});
  }

  function getFriendsForUser(username) {
    const map = getFriendMap();
    return map[username] || [];
  }

  function addFriendConnectionBidirectional(username, friendName) {
    const map = getFriendMap();

    const userFriends = new Set(map[username] || []);
    userFriends.add(friendName);
    map[username] = Array.from(userFriends);

    const friendFriends = new Set(map[friendName] || []);
    friendFriends.add(username);
    map[friendName] = Array.from(friendFriends);

    writeJSON(FRIENDS_KEY, map);
  }

  function showMessage(element, message, good) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.remove('good', 'bad');
    element.classList.add(good ? 'good' : 'bad');
  }

  function refreshSignedInStatus() {
    const user = getCurrentUser();
    document.querySelectorAll('[data-current-user]').forEach((node) => {
      node.textContent = user ? `Signed in as ${user}` : 'Not signed in';
    });
  }

  function tmdbUrl(path, paramsObj) {
    const params = new URLSearchParams({ api_key: TMDB_API_KEY, ...paramsObj });
    return `${TMDB_BASE}${path}?${params.toString()}`;
  }

  async function tmdbSearchMulti(query) {
    const response = await fetch(
      tmdbUrl('/search/multi', {
        query,
        include_adult: 'false',
        language: 'en-US',
        page: '1',
      })
    );
    if (!response.ok) {
      throw new Error(`TMDB search failed (${response.status})`);
    }
    const payload = await response.json();
    return payload.results || [];
  }

  async function tmdbRecommendations(mediaType, id) {
    const response = await fetch(
      tmdbUrl(`/${mediaType}/${id}/recommendations`, {
        language: 'en-US',
        page: '1',
      })
    );
    if (!response.ok) {
      throw new Error(`TMDB recommendations failed (${response.status})`);
    }
    const payload = await response.json();
    return payload.results || [];
  }

  function wireAuth() {
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-btn');
    const authState = document.getElementById('auth-state');
    const authNotice = document.getElementById('auth-notice');

    function refreshAuthState() {
      const user = getCurrentUser();
      refreshSignedInStatus();
      if (authState) {
        authState.textContent = user ? `Current account: ${user}` : 'No account signed in.';
      }
      if (logoutButton) {
        logoutButton.disabled = !user;
      }
    }

    if (registerForm) {
      registerForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(registerForm);
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '').trim();
        const users = getUsers();

        if (!username || !password) {
          showMessage(authNotice, 'Username and password are required.', false);
          return;
        }
        if (users[username]) {
          showMessage(authNotice, 'Username already exists. Try logging in.', false);
          return;
        }

        users[username] = { password };
        writeJSON(USERS_KEY, users);
        setCurrentUser(username);
        registerForm.reset();
        showMessage(authNotice, 'Account created and signed in.', true);
        refreshAuthState();
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const username = String(formData.get('username') || '').trim();
        const password = String(formData.get('password') || '').trim();
        const users = getUsers();

        if (!users[username] || users[username].password !== password) {
          showMessage(authNotice, 'Invalid username or password.', false);
          return;
        }

        setCurrentUser(username);
        loginForm.reset();
        showMessage(authNotice, 'Logged in successfully.', true);
        refreshAuthState();
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        setCurrentUser('');
        showMessage(authNotice, 'Logged out.', true);
        refreshAuthState();
      });
    }

    refreshAuthState();
  }

  function wireRatingPage() {
    const form = document.getElementById('rating-form');
    if (!form) {
      return;
    }

    const firestoreMode = form.dataset.firestoreMode === 'true';
    const scoreInput = document.getElementById('score');
    const scoreValue = document.getElementById('score-value');
    const ratingNotice = document.getElementById('rating-notice');
    const myRatings = document.getElementById('my-ratings');
    const communityRatings = document.getElementById('community-ratings');
    const searchInput = document.getElementById('title-search');
    const searchResultsList = document.getElementById('search-results-list');
    const searchResultsStatus = document.getElementById('search-results-status');
    const customTitleInput = document.getElementById('custom-title');

    let pendingSearchToken = 0;
    let searchDebounce;
    let latestResults = [];

    function setSelectedResult(item) {
      window.__RYW_SELECTED_TMDB_ITEM = item || null;
      if (!searchResultsList) {
        return;
      }
      searchResultsList.querySelectorAll('.search-result-item').forEach((button) => {
        const id = Number(button.dataset.tmdbId || 0);
        button.classList.toggle('active', Boolean(item && item.id === id));
      });
    }

    function getSelectedTitle() {
      if (customTitleInput && customTitleInput.value.trim()) {
        return customTitleInput.value.trim();
      }
      if (window.__RYW_SELECTED_TMDB_ITEM) {
        return window.__RYW_SELECTED_TMDB_ITEM.title || window.__RYW_SELECTED_TMDB_ITEM.name || '';
      }
      return '';
    }

    function renderSearchStatus(message) {
      if (searchResultsStatus) {
        searchResultsStatus.textContent = message;
      }
    }

    function optionLabelForTmdb(item) {
      const title = item.title || item.name || 'Untitled';
      const mediaType = item.media_type === 'tv' ? 'TV Show' : item.media_type === 'movie' ? 'Movie' : 'Title';
      const date = item.release_date || item.first_air_date || '';
      const year = date ? date.slice(0, 4) : '';
      return year ? `${title} (${mediaType}, ${year})` : `${title} (${mediaType})`;
    }

    function renderResultsList(results) {
      if (!searchResultsList) {
        return;
      }
      if (!results.length) {
        searchResultsList.innerHTML = '';
        return;
      }

      searchResultsList.innerHTML = results
        .map((item, idx) => {
          const title = item.title || item.name || '';
          const media = item.media_type || '';
          const poster = item.poster_path || '';
          const label = optionLabelForTmdb(item).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<button class="search-result-item" type="button" data-index="${idx}" data-tmdb-id="${item.id || ''}" data-media-type="${media}" data-poster-path="${poster}" data-title="${title.replace(/"/g, '&quot;')}">${label}</button>`;
        })
        .join('');
    }

    async function fetchTmdbResults(query, token) {
      const response = await fetch(
        tmdbUrl('/search/multi', {
          query,
          include_adult: 'false',
          language: 'en-US',
          page: '1',
        })
      );
      if (!response.ok) {
        throw new Error(`TMDB search failed (${response.status})`);
      }
      const payload = await response.json();
      if (token !== pendingSearchToken) {
        return;
      }

      latestResults = (payload.results || []).filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv'
      );
      window.__RYW_TMDB_RESULTS = latestResults;
      setSelectedResult(null);

      if (!latestResults.length) {
        renderResultsList([]);
        renderSearchStatus('No TMDB matches found. Use custom title below.');
        return;
      }

      renderResultsList(latestResults.slice(0, 10));
      setSelectedResult(null);
      window.dispatchEvent(new CustomEvent('ryw:selected-item-changed', { detail: null }));
      renderSearchStatus('Click a title below to select it.');
    }

    function renderRatings() {
      const ratings = getRatings();
      const currentUser = getCurrentUser();

      const mine = ratings.filter((rating) => rating.username === currentUser);
      myRatings.innerHTML = mine.length
        ? mine
            .map(
              (rating) =>
                `<li>
                  <div><strong>${rating.title}</strong> (${rating.type}) - ${rating.score}/5</div>
                  <div class="comment-row">Comment: <span>${rating.comment || '—'}</span></div>
                  <div class="item-actions">
                    <button class="btn btn-small" type="button" data-edit-rating="${rating.id}">Edit Comment</button>
                    <button class="btn btn-small btn-danger" type="button" data-delete-rating="${rating.id}">Delete</button>
                  </div>
                </li>`
            )
            .join('')
        : '<li>No saved ratings yet.</li>';

      const others = ratings.filter((rating) => rating.username !== currentUser);
      communityRatings.innerHTML = others.length
        ? others
            .slice(0, 12)
            .map(
              (rating) =>
                `<li><strong>${rating.username}</strong> rated <strong>${rating.title}</strong> ${rating.score}/5${
                  rating.comment ? ` - ${rating.comment}` : ''
                }</li>`
            )
            .join('')
        : '<li>No community ratings yet.</li>';
    }

    async function runTmdbSearch(query) {
      pendingSearchToken += 1;
      const token = pendingSearchToken;

      if (searchDebounce) {
        clearTimeout(searchDebounce);
      }

      if (!query) {
        latestResults = [];
        window.__RYW_TMDB_RESULTS = [];
        setSelectedResult(null);
        renderResultsList([]);
        renderSearchStatus('Type to search TMDB...');
        return;
      }

      setSelectedResult(null);
      renderResultsList([]);
      renderSearchStatus('Searching TMDB...');
      searchDebounce = setTimeout(async () => {
        try {
          await fetchTmdbResults(query, token);
        } catch (error) {
          if (token !== pendingSearchToken) {
            return;
          }
          renderSearchStatus('TMDB search failed. Use custom title below.');
        }
      }, 300);
    }

    function renderScoreValue() {
      scoreValue.textContent = Number(scoreInput.value).toFixed(1);
    }

    scoreInput.addEventListener('input', renderScoreValue);

    if (!firestoreMode) {
      myRatings.addEventListener('click', (event) => {
        const editId = event.target.getAttribute('data-edit-rating');
        const deleteId = event.target.getAttribute('data-delete-rating');

        if (editId) {
          const ratings = getRatings();
          const rating = ratings.find((item) => item.id === editId);
          if (!rating) {
            return;
          }
          const updated = window.prompt('Edit your comment:', rating.comment || '');
          if (updated === null) {
            return;
          }
          upsertRating({ ...rating, comment: updated.trim() });
          showMessage(ratingNotice, 'Comment updated.', true);
          renderRatings();
        }

        if (deleteId) {
          const confirmed = window.confirm('Delete this rating?');
          if (!confirmed) {
            return;
          }
          deleteRating(deleteId);
          showMessage(ratingNotice, 'Rating deleted.', true);
          renderRatings();
        }
      });
    }

    if (searchResultsList) {
      searchResultsList.addEventListener('click', (event) => {
        const button = event.target.closest('.search-result-item');
        if (!button) {
          return;
        }
        const idx = Number(button.dataset.index || -1);
        const picked = latestResults[idx] || null;
        if (!picked) {
          return;
        }
        setSelectedResult(picked);
        window.dispatchEvent(new CustomEvent('ryw:selected-item-changed', { detail: picked }));
      });
    }

    searchInput.addEventListener('input', () => {
      runTmdbSearch(searchInput.value.trim());
    });

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runTmdbSearch(searchInput.value.trim());
      }
    });

    if (customTitleInput) {
      customTitleInput.addEventListener('input', () => {
        if (customTitleInput.value.trim()) {
          setSelectedResult(null);
        }
      });
    }

    if (!firestoreMode) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const currentUser = getCurrentUser();

        if (!currentUser) {
          showMessage(ratingNotice, 'Please create or log into an account on Home before saving scores.', false);
          return;
        }

        const formData = new FormData(form);
        const title = getSelectedTitle();
        const type = String(formData.get('type') || '').trim();
        const score = Number(formData.get('score') || 0);
        const comment = String(formData.get('comment') || '').trim();

        if (!title) {
          showMessage(ratingNotice, 'Choose a search result or enter a custom title.', false);
          return;
        }

        upsertRating({
          id: `${currentUser}-${Date.now()}`,
          username: currentUser,
          title,
          type,
          score,
          comment,
          createdAt: new Date().toISOString(),
        });

        form.reset();
        scoreInput.value = '2.5';
        renderScoreValue();
        setSelectedResult(null);
        renderResultsList([]);
        renderSearchStatus('Type to search TMDB...');
        showMessage(ratingNotice, 'Rating saved to your account.', true);
        renderRatings();
      });
    }

    renderSearchStatus('Type to search TMDB...');
    renderScoreValue();
    if (!firestoreMode) {
      renderRatings();
    }
    refreshSignedInStatus();
  }

  function parseInvite(text) {
    const value = text.trim();
    if (!value) {
      return '';
    }
    if (value.includes('invite=')) {
      try {
        const parsed = new URL(value);
        const code = parsed.searchParams.get('invite') || '';
        return code.split('|')[0];
      } catch (error) {
        return '';
      }
    }
    return value.split('|')[0];
  }

  function wireFriendsPage() {
    const friendsRatings = document.getElementById('friends-ratings');
    if (!friendsRatings) {
      return;
    }

    const users = getUsers();
    const friendList = document.getElementById('friend-list');
    const inviteLink = document.getElementById('invite-link');
    const copyInviteBtn = document.getElementById('copy-invite-btn');
    const acceptInviteForm = document.getElementById('accept-invite-form');
    const acceptInviteInput = document.getElementById('accept-invite-input');
    const friendsNotice = document.getElementById('friends-notice');

    function userInviteCode(username) {
      return `${username}|invite`;
    }

    function renderFriends() {
      const currentUser = getCurrentUser();
      refreshSignedInStatus();

      if (!currentUser) {
        friendList.innerHTML = '<li>Sign in first to use invites and friends.</li>';
        friendsRatings.innerHTML = '<li>Sign in first to see friend ratings.</li>';
        inviteLink.value = '';
        return;
      }

      const code = userInviteCode(currentUser);
      inviteLink.value = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(code)}`;

      const friends = getFriendsForUser(currentUser).filter((name) => Boolean(users[name]));
      friendList.innerHTML = friends.length
        ? friends
            .map((name) => `<li>${name} <a class="inline-link" href="library.html?user=${encodeURIComponent(name)}">View library</a></li>`)
            .join('')
        : '<li>No friends added yet.</li>';

      const ratings = getRatings().filter((rating) => friends.includes(rating.username));
      friendsRatings.innerHTML = ratings.length
        ? ratings
            .map(
              (rating) =>
                `<li><strong>${rating.username}</strong>: <em>${rating.title}</em> (${rating.type}) - ${rating.score}/5${
                  rating.comment ? ` - ${rating.comment}` : ''
                }</li>`
            )
            .join('')
        : '<li>No friend ratings yet.</li>';
    }

    copyInviteBtn.addEventListener('click', async () => {
      if (!inviteLink.value) {
        showMessage(friendsNotice, 'Sign in to generate an invite link.', false);
        return;
      }
      try {
        await navigator.clipboard.writeText(inviteLink.value);
        showMessage(friendsNotice, 'Invite link copied.', true);
      } catch (error) {
        inviteLink.select();
        showMessage(friendsNotice, 'Copy failed. Select and copy manually.', false);
      }
    });

    acceptInviteForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const currentUser = getCurrentUser();
      if (!currentUser) {
        showMessage(friendsNotice, 'Sign in before adding friends.', false);
        return;
      }

      const friendName = parseInvite(acceptInviteInput.value);
      if (!friendName) {
        showMessage(friendsNotice, 'Invalid invite link or code.', false);
        return;
      }
      if (friendName === currentUser) {
        showMessage(friendsNotice, 'You cannot add yourself.', false);
        return;
      }
      if (!users[friendName]) {
        showMessage(friendsNotice, 'That user does not exist yet. Ask them to create an account first.', false);
        return;
      }

      addFriendConnectionBidirectional(currentUser, friendName);
      acceptInviteForm.reset();
      showMessage(friendsNotice, `Connected ${currentUser} and ${friendName} as friends.`, true);
      renderFriends();
    });

    const qsInvite = new URLSearchParams(window.location.search).get('invite');
    if (qsInvite && acceptInviteInput) {
      acceptInviteInput.value = qsInvite;
    }

    renderFriends();
  }

  function wireNextWatchPage() {
    const list = document.getElementById('recommendations-list');
    if (!list) {
      return;
    }

    const notice = document.getElementById('next-watch-notice');
    const refreshBtn = document.getElementById('refresh-recommendations');

    function renderRecommendationList(items) {
      if (!items.length) {
        list.innerHTML = '<li>No recommendations yet. Add ratings for you and your friends first.</li>';
        return;
      }
      list.innerHTML = items
        .map(
          (item) =>
            `<li>
              <strong>${item.title}</strong> (${item.mediaType})
              <div class="comment-row">Why: similar to ${item.reasons.join(', ')}</div>
              <div class="comment-row">Recommendation score: ${item.score.toFixed(2)}</div>
            </li>`
        )
        .join('');
    }

    async function resolveSeed(rating) {
      const query = rating.title;
      if (!query) {
        return null;
      }
      const expectedType = rating.type === 'TV Show' ? 'tv' : 'movie';
      const results = await tmdbSearchMulti(query);
      const media = results.find((item) => item.media_type === expectedType) || results.find((item) => item.media_type === 'movie' || item.media_type === 'tv');
      if (!media) {
        return null;
      }
      return {
        id: media.id,
        mediaType: media.media_type,
        title: media.title || media.name || rating.title,
        weight: Number(rating.score) || 0,
      };
    }

    async function buildRecommendations() {
      const currentUser = getCurrentUser();
      refreshSignedInStatus();

      if (!currentUser) {
        showMessage(notice, 'Sign in first to generate recommendations.', false);
        renderRecommendationList([]);
        return;
      }

      showMessage(notice, 'Building recommendations from ratings...', true);

      const friends = getFriendsForUser(currentUser);
      const ratings = getRatings();
      const candidateRatings = ratings
        .filter((rating) => rating.username === currentUser || friends.includes(rating.username))
        .filter((rating) => Number(rating.score) >= 3.5)
        .slice(0, 8);

      if (!candidateRatings.length) {
        renderRecommendationList([]);
        showMessage(notice, 'Need more ratings (3.5+) from you/friends to recommend titles.', false);
        return;
      }

      const seenTitles = new Set(
        ratings
          .filter((r) => r.username === currentUser || friends.includes(r.username))
          .map((r) => r.title.toLowerCase())
      );

      const seedCandidates = [];
      for (const rating of candidateRatings) {
        try {
          const seed = await resolveSeed(rating);
          if (seed) {
            seedCandidates.push(seed);
          }
        } catch (error) {
          // Skip failed seed resolution
        }
      }

      if (!seedCandidates.length) {
        renderRecommendationList([]);
        showMessage(notice, 'Could not map your rated titles to TMDB yet.', false);
        return;
      }

      const scoreMap = new Map();
      for (const seed of seedCandidates.slice(0, 5)) {
        try {
          const recs = await tmdbRecommendations(seed.mediaType, seed.id);
          recs.slice(0, 8).forEach((rec, idx) => {
            const recTitle = rec.title || rec.name;
            if (!recTitle || seenTitles.has(recTitle.toLowerCase())) {
              return;
            }
            const key = `${rec.media_type || seed.mediaType}:${rec.id}`;
            const current = scoreMap.get(key) || {
              title: recTitle,
              mediaType: rec.media_type === 'tv' ? 'TV Show' : 'Movie',
              score: 0,
              reasons: new Set(),
            };
            const rankWeight = 1 / (idx + 1);
            const popBoost = (Number(rec.popularity) || 0) / 1000;
            current.score += seed.weight * rankWeight + popBoost;
            current.reasons.add(seed.title);
            scoreMap.set(key, current);
          });
        } catch (error) {
          // Continue with remaining seeds
        }
      }

      const ranked = Array.from(scoreMap.values())
        .map((item) => ({ ...item, reasons: Array.from(item.reasons).slice(0, 3) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      renderRecommendationList(ranked);
      showMessage(notice, ranked.length ? 'Recommendations updated.' : 'No recommendations returned yet.', Boolean(ranked.length));
    }

    refreshBtn.addEventListener('click', () => {
      buildRecommendations();
    });

    buildRecommendations();
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireAuth();
    wireRatingPage();
    wireFriendsPage();
    wireNextWatchPage();
    refreshSignedInStatus();
  });
})();