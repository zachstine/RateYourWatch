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

function hasFirebaseConfig(config) {
  return config.apiKey && config.projectId;
}

let db;
let auth;
let currentUser;

export async function saveRating({ tmdbId, title, mediaType, rating, notes, posterUrl }) {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }

  const payload = {
    uid: currentUser.uid,
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

export async function loadRatings() {
  if (!db || !currentUser) {
    throw new Error('Firebase not ready or user not signed in yet.');
  }

  const ratingsQuery = query(
    collection(db, 'ratings'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  const snapshot = await getDocs(ratingsQuery);
  const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
      return `<li><strong>${row.title}</strong> (${media}) - ${score}/5${notes}</li>`;
    })
    .join('');
}

function selectedTitleFromUI() {
  const custom = document.getElementById('custom-title');
  const select = document.getElementById('search-results');
  if (custom && custom.value.trim()) {
    return custom.value.trim();
  }
  if (select && select.value) {
    return select.value;
  }
  return '';
}

function selectedTmdbIdFromUI() {
  const select = document.getElementById('search-results');
  if (!select || !select.selectedOptions.length) {
    return null;
  }
  const val = select.selectedOptions[0].getAttribute('data-tmdb-id');
  return val ? Number(val) : null;
}

async function wireFirestoreRatePage() {
  const form = document.getElementById('rating-form');
  const notice = document.getElementById('rating-notice');
  if (!form) {
    return;
  }

  const refresh = async () => {
    try {
      const rows = await loadRatings();
      renderRatingsList(rows.filter((row) => row.uid === currentUser.uid));
    } catch (error) {
      console.error('[firebase-init] load fail', error);
      if (notice) {
        notice.textContent = 'Load failed. Check Firestore rules/config.';
        notice.className = 'notice bad';
      }
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      const data = new FormData(form);
      const title = selectedTitleFromUI();
      if (!title) {
        throw new Error('Choose a search result or enter a custom title.');
      }

      await saveRating({
        tmdbId: selectedTmdbIdFromUI(),
        title,
        mediaType: String(data.get('type') || 'Movie'),
        rating: Number(data.get('score') || 0),
        notes: String(data.get('comment') || '').trim(),
        posterUrl: '',
      });

      if (notice) {
        notice.textContent = 'Saved to Firestore.';
        notice.className = 'notice good';
      }

      console.log('[firebase-init] save success via form submit');
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

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      console.log('[firebase-init] auth state user', user.uid);
    }
  });

  await wireFirestoreRatePage();
}

window.__FIREBASE_RATING_MODE__ = true;
bootFirebase();