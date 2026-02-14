import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

console.log('[firebase-init] script loaded');

const firebaseConfig = {
  apiKey: 'AIzaSyCYP6f3DyEdwIZgTNDwFCfGIESTOgWZYEI',
  authDomain: 'rateyourwatch-3a60a.firebaseapp.com',
  projectId: 'rateyourwatch-3a60a',
  storageBucket: 'rateyourwatch-3a60a.firebasestorage.app',
  messagingSenderId: '292422810983',
  appId: '1:292422810983:web:07605d1d9bffc7b6eb43c2',
  measurementId: 'G-FNTK2TKE9T',
};

const CURRENT_USER_KEY = 'ryw_current_user';
const FRIENDS_KEY = 'ryw_friends';

let db;
let auth;
let currentUser;
let selectedItem = null;

function hasFirebaseConfig(config) {
  return config.apiKey && config.projectId;
}

function getCurrentAppUsername() {
  return localStorage.getItem(CURRENT_USER_KEY) || '';
}

function getFriendMap() {
  try {
    return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '{}');
  } catch (error) {
    return {};
  }
}


function setCurrentAppUsername(username) {
  if (username) {
    localStorage.setItem(CURRENT_USER_KEY, username);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

function refreshSignedInPills() {
  const username = getCurrentAppUsername();
  document.querySelectorAll('[data-current-user]').forEach((node) => {
    node.textContent = username ? `Signed in as ${username}` : 'Not signed in';
  });
}

async function registerAccount(username, password) {
  const ref = doc(db, 'accounts', username);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    throw new Error('Username already exists. Try logging in.');
  }
  await setDoc(ref, {
    appUsername: username,
    password,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

async function loginAccount(username, password) {
  const ref = doc(db, 'accounts', username);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Account not found.');
  }
  const data = snap.data() || {};
  if (String(data.password || '') !== password) {
    throw new Error('Invalid password.');
  }
}

function wireDatabaseAccountAuth() {
  const registerForm = document.getElementById('register-form');
  const loginForm = document.getElementById('login-form');
  const logoutButton = document.getElementById('logout-btn');
  const authState = document.getElementById('auth-state');
  const authNotice = document.getElementById('auth-notice');
  if (!registerForm && !loginForm && !logoutButton) {
    return;
  }

  const render = () => {
    const username = getCurrentAppUsername();
    refreshSignedInPills();
    if (authState) {
      authState.textContent = username ? `Current account: ${username}` : 'No account signed in.';
    }
    if (logoutButton) {
      logoutButton.disabled = !username;
    }
  };

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const username = String(formData.get('username') || '').trim();
      const password = String(formData.get('password') || '').trim();
      if (!username || !password) {
        if (authNotice) {
          authNotice.textContent = 'Username and password are required.';
          authNotice.className = 'notice bad';
        }
        return;
      }
      try {
        await registerAccount(username, password);
        setCurrentAppUsername(username);
        await ensureAccountRecord();
        if (authNotice) {
          authNotice.textContent = 'Account created and logged in.';
          authNotice.className = 'notice good';
        }
        registerForm.reset();
        render();
      } catch (error) {
        console.error('[firebase-init] register fail', error);
        if (authNotice) {
          authNotice.textContent = `Register failed: ${error.message}`;
          authNotice.className = 'notice bad';
        }
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const username = String(formData.get('username') || '').trim();
      const password = String(formData.get('password') || '').trim();
      try {
        await loginAccount(username, password);
        setCurrentAppUsername(username);
        await ensureAccountRecord();
        if (authNotice) {
          authNotice.textContent = 'Logged in successfully.';
          authNotice.className = 'notice good';
        }
        loginForm.reset();
        render();
      } catch (error) {
        console.error('[firebase-init] login fail', error);
        if (authNotice) {
          authNotice.textContent = `Login failed: ${error.message}`;
          authNotice.className = 'notice bad';
        }
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      setCurrentAppUsername('');
      if (authNotice) {
        authNotice.textContent = 'Logged out.';
        authNotice.className = 'notice good';
      }
      render();
    });
  }

  render();
}

async function ensureAccountRecord() {
  const appUsername = getCurrentAppUsername();
  if (!db || !currentUser || !appUsername) {
    return;
  }

  await setDoc(
    doc(db, 'accounts', appUsername),
    {
      appUsername,
      uid: currentUser.uid,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  console.log('[firebase-init] account synced', appUsername);
}

export async function saveRating({ tmdbId, title, mediaType, rating, notes, posterUrl }) {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }

  const payload = {
    uid: currentUser.uid,
    appUsername: getCurrentAppUsername(),
    tmdbId: tmdbId || null,
    title: title || 'Untitled',
    mediaType: mediaType || 'Movie',
    rating: Number(rating),
    notes: notes || '',
    posterUrl: posterUrl || '',
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'ratings'), payload);
  console.log('[firebase-init] save success', ref.id, payload);
  return ref.id;
}

async function updateRating(id, updates) {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }
  await updateDoc(doc(db, 'ratings', id), updates);
  console.log('[firebase-init] edit success', id, updates);
}

async function removeRating(id) {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }
  await deleteDoc(doc(db, 'ratings', id));
  console.log('[firebase-init] delete success', id);
}

export async function loadRatings() {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }

  const ratingsQuery = query(collection(db, 'ratings'), orderBy('createdAt', 'desc'), limit(100));
  const snapshot = await getDocs(ratingsQuery);
  const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  console.log('[firebase-init] load success', rows.length, 'rows');
  return rows;
}

function renderRatingsList(rows) {
  const list = document.getElementById('my-ratings');
  if (!list) {
    return;
  }

  if (!rows.length) {
    list.innerHTML = '<li>No saved ratings yet.</li>';
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const media = row.mediaType || 'Movie';
      const score = Number(row.rating || 0).toFixed(1);
      const notes = row.notes ? ` - ${row.notes}` : '';
      return `<li>
        <div><strong>${row.title}</strong> (${media}) - ${score}/5${notes}</div>
        <div class="item-actions">
          <button class="btn btn-small" type="button" data-edit-id="${row.id}">Edit</button>
          <button class="btn btn-small btn-danger" type="button" data-delete-id="${row.id}">Delete</button>
        </div>
      </li>`;
    })
    .join('');
}

function selectedTitleFromUI() {
  const custom = document.getElementById('custom-title');
  if (custom && custom.value.trim()) {
    return custom.value.trim();
  }
  return '';
}

function syncSelectedItemFromEvent(detail) {
  if (!detail) {
    selectedItem = null;
    return;
  }

  selectedItem = {
    tmdbId: detail.id ? Number(detail.id) : null,
    title: detail.title || detail.name || '',
    mediaType: detail.media_type === 'tv' ? 'TV Show' : 'Movie',
    posterUrl: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : '',
  };
  console.log('[firebase-init] selected item', selectedItem);
}

async function wireFirestoreRatePage() {
  const form = document.getElementById('rating-form');
  const notice = document.getElementById('rating-notice');
  const myRatingsList = document.getElementById('my-ratings');

  if (!form) {
    return;
  }

  window.addEventListener('ryw:selected-item-changed', (event) => {
    syncSelectedItemFromEvent(event.detail);
  });

  const searchInput = document.getElementById('title-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      selectedItem = null;
    });
  }

  const customTitleInput = document.getElementById('custom-title');
  if (customTitleInput) {
    customTitleInput.addEventListener('input', () => {
      if (customTitleInput.value.trim()) {
        selectedItem = null;
      }
    });
  }

  const refresh = async () => {
    try {
      const rows = await loadRatings();
      const mine = rows.filter((row) => row.appUsername === getCurrentAppUsername());
      renderRatingsList(mine);
    } catch (error) {
      console.error('[firebase-init] load fail', error);
      if (notice) {
        notice.textContent = 'Load failed. Check Firestore rules/config.';
        notice.className = 'notice bad';
      }
    }
  };

  if (myRatingsList) {
    myRatingsList.addEventListener('click', async (event) => {
      const editId = event.target.getAttribute('data-edit-id');
      const deleteId = event.target.getAttribute('data-delete-id');

      if (editId) {
        const updatedNotes = window.prompt('Update your notes/comment:');
        if (updatedNotes === null) {
          return;
        }
        try {
          await updateRating(editId, { notes: updatedNotes.trim() });
          if (notice) {
            notice.textContent = 'Rating updated.';
            notice.className = 'notice good';
          }
          await refresh();
        } catch (error) {
          console.error('[firebase-init] edit fail', error);
          if (notice) {
            notice.textContent = `Edit failed: ${error.message}`;
            notice.className = 'notice bad';
          }
        }
      }

      if (deleteId) {
        const confirmed = window.confirm('Delete this rating?');
        if (!confirmed) {
          return;
        }
        try {
          await removeRating(deleteId);
          if (notice) {
            notice.textContent = 'Rating deleted.';
            notice.className = 'notice good';
          }
          await refresh();
        } catch (error) {
          console.error('[firebase-init] delete fail', error);
          if (notice) {
            notice.textContent = `Delete failed: ${error.message}`;
            notice.className = 'notice bad';
          }
        }
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = new FormData(form);
      const customTitle = selectedTitleFromUI();
      const fallbackSelected = window.__RYW_SELECTED_TMDB_ITEM || null;
      const effectiveSelected = selectedItem || (fallbackSelected
        ? {
            tmdbId: fallbackSelected.id ? Number(fallbackSelected.id) : null,
            title: fallbackSelected.title || fallbackSelected.name || '',
            mediaType: fallbackSelected.media_type === 'tv' ? 'TV Show' : 'Movie',
            posterUrl: fallbackSelected.poster_path ? `https://image.tmdb.org/t/p/w500${fallbackSelected.poster_path}` : '',
          }
        : null);

      const title = customTitle || (effectiveSelected && effectiveSelected.title) || '';
      if (!title) {
        throw new Error('Choose a search result or enter a custom title.');
      }

      await saveRating({
        tmdbId: effectiveSelected ? effectiveSelected.tmdbId : null,
        title,
        mediaType: effectiveSelected ? effectiveSelected.mediaType : String(data.get('type') || 'Movie'),
        rating: Number(data.get('score') || 0),
        notes: String(data.get('comment') || '').trim(),
        posterUrl: effectiveSelected ? effectiveSelected.posterUrl : '',
      });

      if (notice) {
        notice.textContent = 'Saved to Firestore.';
        notice.className = 'notice good';
      }

      console.log('[firebase-init] save success via form submit');
      selectedItem = null;
      await refresh();
    } catch (error) {
      console.error('[firebase-init] save fail', error);
      if (notice) {
        notice.textContent = `Save failed: ${error.message}`;
        notice.className = 'notice bad';
      }
    }
  });

  await refresh();
}

async function wireLibraryPage() {
  const list = document.getElementById('library-list');
  if (!list) {
    return;
  }

  const notice = document.getElementById('library-notice');
  const heading = document.getElementById('library-heading');
  const filterType = document.getElementById('library-filter-type');
  const filterRating = document.getElementById('library-filter-rating');
  const filterSort = document.getElementById('library-filter-sort');

  const params = new URLSearchParams(window.location.search);
  const requestedUser = params.get('user');
  const viewer = getCurrentAppUsername();

  const canViewRequested = () => {
    if (!requestedUser || requestedUser === viewer) {
      return true;
    }
    const map = getFriendMap();
    return (map[viewer] || []).includes(requestedUser);
  };

  if (!canViewRequested()) {
    notice.textContent = 'You can only view your own library or a connected friend library.';
    notice.className = 'notice bad';
    list.innerHTML = '<li>Access denied.</li>';
    return;
  }

  const libraryOwner = requestedUser || viewer;
  if (heading) {
    heading.textContent = libraryOwner === viewer ? 'Your saved titles' : `${libraryOwner}'s saved titles`;
  }

  const render = async () => {
    try {
      const rows = await loadRatings();
      let items = rows.filter((row) => row.appUsername === libraryOwner);

      const typeValue = filterType.value;
      const minRating = Number(filterRating.value || 0);
      const sortValue = filterSort.value;

      if (typeValue !== 'all') {
        items = items.filter((row) => (row.mediaType || '') === typeValue);
      }
      items = items.filter((row) => Number(row.rating || 0) >= minRating);

      if (sortValue === 'highest') {
        items.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
      } else if (sortValue === 'title') {
        items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      }

      if (!items.length) {
        list.innerHTML = '<li>No library titles found for this filter.</li>';
        notice.textContent = '';
        return;
      }

      list.innerHTML = items
        .map((row) => `<li><strong>${row.title}</strong> (${row.mediaType || 'Movie'}) - ${Number(row.rating || 0).toFixed(1)}/5${row.notes ? ` - ${row.notes}` : ''}</li>`)
        .join('');
      notice.textContent = `Loaded ${items.length} title(s).`;
      notice.className = 'notice good';
    } catch (error) {
      console.error('[firebase-init] library load fail', error);
      notice.textContent = 'Library load failed.';
      notice.className = 'notice bad';
      list.innerHTML = '<li>Unable to load library right now.</li>';
    }
  };

  [filterType, filterRating, filterSort].forEach((el) => {
    el.addEventListener('change', render);
  });

  await render();
}

async function bootFirebase() {
  if (!hasFirebaseConfig(firebaseConfig)) {
    console.warn('[firebase-init] missing firebaseConfig values. Paste config in firebase-init.js');
    return;
  }

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  try {
    const analyticsSupported = await isSupported();
    if (analyticsSupported) {
      getAnalytics(app);
      console.log('[firebase-init] analytics initialized');
    } else {
      console.log('[firebase-init] analytics not supported in this browser context');
    }
  } catch (error) {
    console.warn('[firebase-init] analytics init skipped', error);
  }

  try {
    const cred = await signInAnonymously(auth);
    currentUser = cred.user;
    console.log('[firebase-init] signed in anonymously', currentUser.uid);
  } catch (error) {
    console.error('[firebase-init] anonymous sign-in failed', error);
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      console.log('[firebase-init] auth state user', user.uid);
      await ensureAccountRecord();
    }
  });

  await ensureAccountRecord();
  wireDatabaseAccountAuth();
  await wireFirestoreRatePage();
  await wireLibraryPage();
}

window.__FIREBASE_RATING_MODE__ = true;
window.__USE_DB_AUTH = true;
bootFirebase();