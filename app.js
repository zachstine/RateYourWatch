(function () {
  const USERS_KEY = 'ryw_users';
  const CURRENT_USER_KEY = 'ryw_current_user';
  const RATINGS_KEY = 'ryw_ratings';
  const FRIENDS_KEY = 'ryw_friends';

  const TMDB_API_KEY = '32335edf13a294b190f646c64e57bdf4';
  const TMDB_SEARCH_ENDPOINT = 'https://api.themoviedb.org/3/search/multi';

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

  function addFriendConnection(username, friendName) {
    const map = getFriendMap();
    const existing = new Set(map[username] || []);
    existing.add(friendName);
    map[username] = Array.from(existing);
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

    const scoreInput = document.getElementById('score');
    const scoreValue = document.getElementById('score-value');
    const ratingNotice = document.getElementById('rating-notice');
    const myRatings = document.getElementById('my-ratings');
    const communityRatings = document.getElementById('community-ratings');
    const searchInput = document.getElementById('title-search');
    const searchResults = document.getElementById('search-results');
    const customTitleInput = document.getElementById('custom-title');

    let pendingSearchToken = 0;
    let searchDebounce;

    function getSelectedTitle() {
      if (customTitleInput && customTitleInput.value.trim()) {
        return customTitleInput.value.trim();
      }
      if (searchResults && searchResults.value) {
        return searchResults.value;
      }
      return '';
    }

    function renderSearchStatus(message) {
      if (!searchResults) {
        return;
      }
      searchResults.innerHTML = `<option value="">${message}</option>`;
    }

    function optionLabelForTmdb(item) {
      const title = item.title || item.name || 'Untitled';
      const mediaType = item.media_type === 'tv' ? 'TV Show' : item.media_type === 'movie' ? 'Movie' : 'Title';
      const date = item.release_date || item.first_air_date || '';
      const year = date ? date.slice(0, 4) : '';
      return year ? `${title} (${mediaType}, ${year})` : `${title} (${mediaType})`;
    }

    async function fetchTmdbResults(query, token) {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        query,
        include_adult: 'false',
        language: 'en-US',
        page: '1',
      });

      const response = await fetch(`${TMDB_SEARCH_ENDPOINT}?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`TMDB request failed (${response.status})`);
      }

      const payload = await response.json();
      if (token !== pendingSearchToken) {
        return;
      }

      const results = (payload.results || []).filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv'
      );

      if (!results.length) {
        renderSearchStatus('No TMDB matches found. Use custom title below.');
        return;
      }

      searchResults.innerHTML = results
        .slice(0, 10)
        .map((item) => {
          const value = item.title || item.name || '';
          const label = optionLabelForTmdb(item).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<option value="${value}">${label}</option>`;
        })
        .join('');
      searchResults.selectedIndex = 0;
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
        renderSearchStatus('Type to search TMDB...');
        return;
      }

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

    searchInput.addEventListener('input', () => {
      runTmdbSearch(searchInput.value.trim());
    });

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runTmdbSearch(searchInput.value.trim());
      }
    });

    searchResults.addEventListener('change', () => {
      if (!customTitleInput.value.trim()) {
        customTitleInput.placeholder = `Selected: ${searchResults.value}`;
      }
    });

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
      renderSearchStatus('Type to search TMDB...');
      showMessage(ratingNotice, 'Rating saved to your account.', true);
      renderRatings();
    });

    renderSearchStatus('Type to search TMDB...');
    renderScoreValue();
    renderRatings();
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

      const friends = getFriendsForUser(currentUser);
      friendList.innerHTML = friends.length
        ? friends.map((name) => `<li>${name}</li>`).join('')
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

      addFriendConnection(currentUser, friendName);
      acceptInviteForm.reset();
      showMessage(friendsNotice, `Added ${friendName} as a friend.`, true);
      renderFriends();
    });

    const qsInvite = new URLSearchParams(window.location.search).get('invite');
    if (qsInvite && acceptInviteInput) {
      acceptInviteInput.value = qsInvite;
    }

    renderFriends();
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireAuth();
    wireRatingPage();
    wireFriendsPage();
    refreshSignedInStatus();
  });
})();