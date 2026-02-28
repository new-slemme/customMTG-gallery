const setSelect = document.getElementById("setSelect");
const searchInput = document.getElementById("searchInput");
const grid = document.getElementById("grid");
const emptyState = document.getElementById("emptyState");
const subtitle = document.getElementById("subtitle");

const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModal");

const modalImageWrap = document.getElementById("modalImageWrap");
const cardNameEl = document.getElementById("cardName");
const cardTypeEl = document.getElementById("cardType");
const cardManaEl = document.getElementById("cardMana");
const cardPTEl = document.getElementById("cardPT");
const cardRulesEl = document.getElementById("cardRules");
const copyTextBtn = document.getElementById("copyText");

const feedbackList = document.getElementById("feedbackList");
const feedbackForm = document.getElementById("feedbackForm");
const fbName = document.getElementById("fbName");
const fbRating = document.getElementById("fbRating");
const fbComment = document.getElementById("fbComment");
const fbStatus = document.getElementById("fbStatus");

let state = {
  sets: [],
  currentSet: null,
  cards: [],
  filtered: [],
  selectedCard: null
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed (${res.status})`);
  }
  return res.json();
}

function setEmpty(msg) {
  emptyState.textContent = msg;
  emptyState.classList.remove("hidden");
}
function clearEmpty() {
  emptyState.classList.add("hidden");
}

function renderGrid(cards) {
  grid.innerHTML = "";
  if (!cards.length) {
    setEmpty("No cards match your search.");
    return;
  }
  clearEmpty();

  for (const c of cards) {
    const tile = document.createElement("div");
    tile.className = "cardTile";
    tile.addEventListener("click", () => openCard(c.id));

    if (c.hasImage && c.imageUrl) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.loading = "lazy";
      img.src = c.imageUrl;
      img.alt = c.name;
      tile.appendChild(img);
    } else {
      const missing = document.createElement("div");
      missing.className = "thumbMissing";
      missing.textContent = "No image found\n\n(Still shows rules text)";
      tile.appendChild(missing);
    }

    const meta = document.createElement("div");
    meta.className = "tileMeta";

    const nm = document.createElement("div");
    nm.className = "tileName";
    nm.textContent = c.name;

    const ty = document.createElement("div");
    ty.className = "tileType";
    ty.textContent = c.type || "";

    meta.appendChild(nm);
    meta.appendChild(ty);
    tile.appendChild(meta);

    grid.appendChild(tile);
  }
}

function applySearch() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) {
    state.filtered = state.cards;
    renderGrid(state.filtered);
    return;
  }

  state.filtered = state.cards.filter((c) => {
    const hay = `${c.name}\n${c.type}\n${c.mana}\n${c.pt}\n${c.rules}`.toLowerCase();
    return hay.includes(q);
  });

  renderGrid(state.filtered);
}

async function loadSets() {
  const data = await api("/api/sets");
  state.sets = data.sets || [];

  setSelect.innerHTML = "";
  for (const s of state.sets) {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = `${s.title} (${s.cardsCount})`;
    setSelect.appendChild(opt);
  }

  if (!state.sets.length) {
    subtitle.textContent = "No sets found. Check your /sets mount.";
    setEmpty("No sets found in /sets. Make sure you mounted the right folder.");
    return;
  }

  subtitle.textContent = `${state.sets.length} set(s) found • pick one`;
  state.currentSet = state.sets[0].key;
  setSelect.value = state.currentSet;
  await loadCards(state.currentSet);
}

async function loadCards(setKey) {
  const data = await api(`/api/sets/${encodeURIComponent(setKey)}/cards`);
  state.cards = data.cards || [];
  state.filtered = state.cards;

  const setMeta = state.sets.find((s) => s.key === setKey);
  subtitle.textContent = setMeta
    ? `${setMeta.title} • ${setMeta.hasImagesCount}/${setMeta.cardsCount} images found`
    : `${setKey}`;

  searchInput.value = "";
  renderGrid(state.cards);
}

function openModal() {
  modalBackdrop.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  modalBackdrop.classList.add("hidden");
  document.body.style.overflow = "";
  state.selectedCard = null;
  fbStatus.textContent = "";
  feedbackList.innerHTML = "";
  feedbackForm.reset();
}

function formatCardText(c) {
  const lines = [];
  lines.push(c.name);
  if (c.mana) lines.push(c.mana);
  if (c.type) lines.push(c.type);
  if (c.pt) lines.push(c.pt);
  if (c.rules) lines.push("", c.rules);
  return lines.join("\n");
}

function renderFeedback(items) {
  feedbackList.innerHTML = "";
  if (!items.length) {
    const div = document.createElement("div");
    div.className = "status";
    div.textContent = "No feedback yet. Be the first to comment!";
    feedbackList.appendChild(div);
    return;
  }

  for (const it of items.slice().reverse()) {
    const wrap = document.createElement("div");
    wrap.className = "feedbackItem";

    const meta = document.createElement("div");
    meta.className = "feedbackMeta";
    const left = document.createElement("div");
    left.textContent = `${it.name}${it.rating ? ` • ${it.rating}/5` : ""}`;
    const right = document.createElement("div");
    const d = new Date(it.createdAt);
    right.textContent = isNaN(d.getTime()) ? it.createdAt : d.toLocaleString();
    meta.appendChild(left);
    meta.appendChild(right);

    const text = document.createElement("div");
    text.className = "feedbackText";
    text.textContent = it.comment;

    wrap.appendChild(meta);
    wrap.appendChild(text);
    feedbackList.appendChild(wrap);
  }
}

async function openCard(cardId) {
  const { card } = await api(`/api/cards/${encodeURIComponent(cardId)}`);
  state.selectedCard = card;

  cardNameEl.textContent = card.name;
  cardTypeEl.textContent = card.type || "";
  cardManaEl.textContent = card.mana || "";
  cardPTEl.textContent = card.pt || "";
  cardRulesEl.textContent = card.rules || "";

  modalImageWrap.innerHTML = "";
  if (card.hasImage && card.imageUrl) {
    const img = document.createElement("img");
    img.src = card.imageUrl;
    img.alt = card.name;
    modalImageWrap.appendChild(img);
  } else {
    const missing = document.createElement("div");
    missing.className = "thumbMissing";
    missing.style.borderRadius = "14px";
    missing.style.border = "1px solid var(--border)";
    missing.textContent = "No image found for this card.\n\n(You can still comment on the rules text.)";
    modalImageWrap.appendChild(missing);
  }

  const fb = await api(`/api/cards/${encodeURIComponent(cardId)}/feedback`);
  renderFeedback(fb.items || []);

  openModal();
}

copyTextBtn.addEventListener("click", async () => {
  if (!state.selectedCard) return;
  const txt = formatCardText(state.selectedCard);
  await navigator.clipboard.writeText(txt);
  fbStatus.textContent = "Copied card text to clipboard.";
  setTimeout(() => (fbStatus.textContent = ""), 1200);
});

feedbackForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.selectedCard) return;

  fbStatus.textContent = "Submitting…";
  try {
    await api(`/api/cards/${encodeURIComponent(state.selectedCard.id)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fbName.value,
        rating: fbRating.value,
        comment: fbComment.value
      })
    });

    const fb = await api(`/api/cards/${encodeURIComponent(state.selectedCard.id)}/feedback`);
    renderFeedback(fb.items || []);
    feedbackForm.reset();
    fbStatus.textContent = "Thanks! Feedback saved.";
    setTimeout(() => (fbStatus.textContent = ""), 1500);
  } catch (err) {
    fbStatus.textContent = `Error: ${err.message}`;
  }
});

setSelect.addEventListener("change", async () => {
  state.currentSet = setSelect.value;
  await loadCards(state.currentSet);
});

searchInput.addEventListener("input", applySearch);

closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

loadSets().catch((e) => {
  subtitle.textContent = "Failed to load sets.";
  setEmpty(`Error: ${e.message}`);
});
