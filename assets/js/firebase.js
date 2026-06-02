import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

let app, db, auth, oids;

try {
  const configEl = document.getElementById("firebase-config");
  if (!configEl?.textContent) {
    throw new Error("Firebase config element not found");
  }

  const data = JSON.parse(configEl.textContent);

  app = initializeApp(data.config);
  oids = {
    views: configEl.getAttribute("data-views"),
    likes: configEl.getAttribute("data-likes"),
  };

  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase initialization failed:", e.message);
  throw e;
}

const id = normalizeDocId(oids?.views);
const idLikes = normalizeDocId(oids?.likes);
let liked = false;
let authReady = false;

function normalizeDocId(value) {
  return String(value || "")
    .trim()
    .replaceAll("/", "-")
    .replace(/^-+|-+$/g, "");
}

function formatNumber(n) {
  return Number(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toggleLoaders(node) {
  const classesString = node.className;
  if (!classesString) return;

  const classes = classesString.split(" ");
  for (const className of classes) {
    node.classList.toggle(className);
  }
}

function getUTCDateBucket() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getUTCDayStartDate() {
  const now = new Date();
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
}

function getDailyDocId(baseId) {
  return `${baseId}_${getUTCDateBucket()}`;
}

async function ensureCounterDoc(ref, initialData) {
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, initialData);
  }
}

async function incrementDailyCounter(collectionName, baseId, fieldName, delta) {
  const day = getUTCDateBucket();
  const dailyId = getDailyDocId(baseId);
  const dailyRef = doc(db, collectionName, dailyId);

  await ensureCounterDoc(dailyRef, {
    key: baseId,
    date: day,
    bucketStart: Timestamp.fromDate(getUTCDayStartDate()),
    [fieldName]: 0,
    updatedAt: serverTimestamp(),
  });

  await updateDoc(dailyRef, {
    [fieldName]: increment(delta),
    updatedAt: serverTimestamp(),
  });
}

function updateDisplay(collection, nodeId) {
  const node = document.getElementById(nodeId);
  if (!node) return;

  const docId = normalizeDocId(nodeId);

  onSnapshot(
    doc(db, collection, docId),
    (snapshot) => {
      node.innerText = snapshot.exists() ? formatNumber(snapshot.data()?.[collection]) : "0";
      toggleLoaders(node);
    },
    (error) => {
      console.error("Firebase snapshot update failed:", error);
    }
  );
}

async function recordView(baseId) {
  if (!baseId || localStorage.getItem(baseId)) return;

  try {
    const ref = doc(db, "views", baseId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      await updateDoc(ref, { views: increment(1) });
    } else {
      await setDoc(ref, { views: 1 });
    }

    await incrementDailyCounter("views_daily", baseId, "views", 1);
    localStorage.setItem(baseId, "true");
  } catch (e) {
    console.error("Record view operation failed:", e.message);
  }
}

function updateButton(isLiked) {
  const hearts = document.querySelectorAll("span[id='button_likes_heart']");
  const empties = document.querySelectorAll("span[id='button_likes_emtpty_heart']");
  const texts = document.querySelectorAll("span[id='button_likes_text']");

  hearts.forEach((el) => {
    el.style.display = isLiked ? "" : "none";
  });

  empties.forEach((el) => {
    el.style.display = isLiked ? "none" : "";
  });

  texts.forEach((el) => {
    el.innerText = isLiked ? "" : "\xa0Like";
  });
}

async function toggleLike(add) {
  if (!idLikes || !authReady) return;

  try {
    const ref = doc(db, "likes", idLikes);
    const snap = await getDoc(ref);
    const delta = add ? 1 : -1;

    liked = add;
    if (add) {
      localStorage.setItem(idLikes, "true");
    } else {
      localStorage.removeItem(idLikes);
    }
    updateButton(add);

    if (snap.exists()) {
      await updateDoc(ref, { likes: increment(delta) });
    } else {
      await setDoc(ref, { likes: add ? 1 : 0 });
    }

    await incrementDailyCounter("likes_daily", idLikes, "likes", delta);
  } catch (e) {
    console.error("Like operation failed:", e.message);
    liked = !add;

    if (add) {
      localStorage.removeItem(idLikes);
    } else {
      localStorage.setItem(idLikes, "true");
    }

    updateButton(!add);
  }
}

signInAnonymously(auth)
  .then(() => {
    authReady = true;

    document.querySelectorAll("span[id^='views_']").forEach((node) => {
      if (node.id) updateDisplay("views", node.id);
    });

    document.querySelectorAll("span[id^='likes_']").forEach((node) => {
      if (node.id) updateDisplay("likes", node.id);
    });

    recordView(id);

    if (idLikes && localStorage.getItem(idLikes)) {
      liked = true;
      updateButton(true);
    }

    const likeButton = document.getElementById("button_likes");
    if (likeButton) {
      likeButton.addEventListener("click", () => {
        toggleLike(!liked);
      });
    }
  })
  .catch((error) => {
    console.error("Firebase anonymous sign-in failed:", error.message);
    authReady = false;
  });

window.process_article = () => toggleLike(!liked);