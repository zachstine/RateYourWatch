(function () {
  const USERS_KEY = 'ryw_users';
  const CURRENT_USER_KEY = 'ryw_current_user';
  const RATINGS_KEY = 'ryw_ratings';

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
    return readJSON(RATINGS_KEY, []);
  }

  function saveRating(rating) {
    const ratings = getRatings();
    ratings.unshift(rating);
    writeJSON(RATINGS_KEY, ratings);
  }

  function showMessage(element, message, good) {
    if (!element) {
      return;
    }
    element.textContent = message;
    element.classList.remove('good', 'bad');
    element.classList.add(good ? 'good' : 'bad');
  }

  function wireAuth() {
    const registerForm = document.getElementById('register-form');
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-btn');
    const authState = document.getElementById('auth-state');
    const authNotice = document.getElementById('auth-notice');

    function refreshAuthState() {
      const user = getCurrentUser();
      const currentUserPill = document.querySelectorAll('[data-current-user]');
      currentUserPill.forEach((node) => {
        node.textContent = user ? `Signed in as ${user}` : 'Not signed in';
      });
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

        users[username] = { password: password };
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

    function renderRatings() {
      const ratings = getRatings();
      const currentUser = getCurrentUser();

      if (myRatings) {
        const mine = ratings.filter((rating) => rating.username === currentUser);
        myRatings.innerHTML = mine.length
          ? mine
              .map(
                (rating) =>
                  `<li><strong>${rating.title}</strong> (${rating.type}) - ${rating.score}/5${
                    rating.comment ? ` - ${rating.comment}` : ''
                  }</li>`
              )
              .join('')
          : '<li>No saved ratings yet.</li>';
      }

      if (communityRatings) {
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
    }

    function renderScoreValue() {
      if (scoreValue && scoreInput) {
        scoreValue.textContent = Number(scoreInput.value).toFixed(1);
      }
    }

    scoreInput.addEventListener('input', renderScoreValue);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const currentUser = getCurrentUser();

      if (!currentUser) {
        showMessage(ratingNotice, 'Please create or log into an account on Home before saving scores.', false);
        return;
      }

      const formData = new FormData(form);
      const title = String(formData.get('title') || '').trim();
      const type = String(formData.get('type') || '').trim();
      const score = Number(formData.get('score') || 0);
      const comment = String(formData.get('comment') || '').trim();

      if (!title) {
        showMessage(ratingNotice, 'Title is required.', false);
        return;
      }

      saveRating({
        username: currentUser,
        title,
        type,
        score,
        comment,
        createdAt: new Date().toISOString(),
      });

      form.reset();
      if (scoreInput) {
        scoreInput.value = '2.5';
      }
      renderScoreValue();
      showMessage(ratingNotice, 'Rating saved to your account.', true);
      renderRatings();
    });

    renderScoreValue();
    renderRatings();
  }

  function wireFriendsPage() {
    const friendsRatings = document.getElementById('friends-ratings');
    if (!friendsRatings) {
      return;
    }

    const ratings = getRatings();
    const currentUser = getCurrentUser();

    const list = ratings.filter((rating) => rating.username !== currentUser);
    friendsRatings.innerHTML = list.length
      ? list
          .map(
            (rating) =>
              `<li><strong>${rating.username}</strong>: <em>${rating.title}</em> (${rating.type}) - ${rating.score}/5${
                rating.comment ? ` - ${rating.comment}` : ''
              }</li>`
          )
          .join('')
      : '<li>No friend ratings available yet. Ask a friend to rate something!</li>';
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireAuth();
    wireRatingPage();
    wireFriendsPage();
  });
})();