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
let selectedItem = null;

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

  const ratingsQuery = query(
    collection(db, 'ratings'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

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

function syncSelectedItemFromDropdown() {
  const select = document.getElementById('search-results');
  if (!select || !select.selectedOptions.length) {
    selectedItem = null;
    return;
  }

  const option = select.selectedOptions[0];
  const tmdbId = option.getAttribute('data-tmdb-id');
  const title = option.value || option.textContent || '';
  const mediaTypeRaw = option.getAttribute('data-media-type') || '';
  const posterPath = option.getAttribute('data-poster-path') || '';

  selectedItem = {
    tmdbId: tmdbId ? Number(tmdbId) : null,
    title,
    mediaType: mediaTypeRaw === 'tv' ? 'TV Show' : mediaTypeRaw === 'movie' ? 'Movie' : 'Movie',
    posterUrl: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '',
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

  const searchResults = document.getElementById('search-results');
  if (searchResults) {
    searchResults.addEventListener('change', syncSelectedItemFromDropdown);
    searchResults.addEventListener('click', () => {
      requestAnimationFrame(syncSelectedItemFromDropdown);
    });
  }

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
      renderRatingsList(rows.filter((row) => row.uid === currentUser.uid));
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
      if (!selectedItem) {
        syncSelectedItemFromDropdown();
      }
      const customTitle = selectedTitleFromUI();
      const title = customTitle || (selectedItem && selectedItem.title) || '';
      if (!title) {
        throw new Error('Choose a search result or enter a custom title.');
      }

      await saveRating({
        tmdbId: selectedItem ? selectedItem.tmdbId : null,
        title,
        mediaType: selectedItem ? selectedItem.mediaType : String(data.get('type') || 'Movie'),
        rating: Number(data.get('score') || 0),
        notes: String(data.get('comment') || '').trim(),
        posterUrl: selectedItem ? selectedItem.posterUrl : '',
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