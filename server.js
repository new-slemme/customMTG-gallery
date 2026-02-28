import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";

const PORT = parseInt(process.env.PORT || "3000", 10);
const SETS_DIR = process.env.SETS_DIR || "/sets";
const DATA_DIR = process.env.DATA_DIR || "/data";
const SCAN_INTERVAL_SECONDS = parseInt(process.env.SCAN_INTERVAL_SECONDS || "10", 10);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(process.cwd(), "public")));

function shaId(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function safeJoin(base, ...parts) {
  const p = path.resolve(base, ...parts);
  if (!p.startsWith(path.resolve(base))) {
    throw new Error("Path traversal blocked");
  }
  return p;
}

function titleFromFolder(name) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseCardTypeLine(typeLine) {
  const raw = String(typeLine || "").trim();
  if (!raw) return { types: [], subtypes: [] };

  // Type lines are usually `Type — Subtype`.
  // We accept em/en dashes (`—`/`–`) with optional spaces, plus spaced hyphen (` - `)
  // for custom files that cannot easily enter a true dash character.
  // We intentionally do NOT split on bare `-` so subtype tokens like `Assembly-Worker`
  // remain intact.
  const delimiterMatch = raw.match(/\s*[—–]\s*|\s-\s/);
  const delimiterIndex = delimiterMatch?.index ?? -1;
  const leftSide = delimiterIndex >= 0 ? raw.slice(0, delimiterIndex).trim() : raw;
  const rightSide = delimiterIndex >= 0 ? raw.slice(delimiterIndex + delimiterMatch[0].length).trim() : "";

  // Split on one-or-more whitespace runs so custom cards with extra spacing still parse
  // into normalized tokens.
  const toTokens = (value) =>
    value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);

  return {
    types: toTokens(leftSide),
    subtypes: toTokens(rightSide)
  };
}

function normalizeCard(obj) {
  // Keep your fields, just normalize known ones for display
  const card = { ...obj };
  card.name = String(card.name || "").trim();
  card.mana = card.mana != null ? String(card.mana) : "";
  card.type = card.type != null ? String(card.type) : "";
  const parsedType = parseCardTypeLine(card.type);
  card.types = parsedType.types;
  card.subtypes = parsedType.subtypes;
  card.pt = card.pt != null ? String(card.pt) : "";
  card.rules = card.rules != null ? String(card.rules) : "";
  return card;
}

function candidateImageNames(cardName) {
  // Try a few likely filename conventions
  const raw = cardName;
  const noQuotes = raw.replace(/[“”"]/g, "");
  const cleaned = noQuotes.replace(/[<>:"/\\|?*\u0000-\u001F]/g, ""); // windows-illegal
  const underscored = cleaned.replace(/\s+/g, "_");
  const dashed = cleaned.replace(/\s+/g, "-");
  const noPunct = cleaned.replace(/[.,!?'’]/g, "");
  const noPunctUnderscore = noPunct.replace(/\s+/g, "_");
  const noPunctDash = noPunct.replace(/\s+/g, "-");

  const bases = Array.from(
    new Set([raw, noQuotes, cleaned, underscored, dashed, noPunct, noPunctUnderscore, noPunctDash].filter(Boolean))
  );

  const exts = [".png", ".jpg", ".jpeg", ".webp"];
  const out = [];
  for (const b of bases) {
    for (const e of exts) out.push(`${b}${e}`);
  }
  return out;
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(p) {
  const txt = await fsp.readFile(p, "utf8");
  return JSON.parse(txt);
}

async function loadCardsFromCardsJsonDir(cardsJsonDir) {
  let entries = [];
  try {
    entries = await fsp.readdir(cardsJsonDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => path.join(cardsJsonDir, e.name));

  const allCards = [];
  for (const file of jsonFiles) {
    let data;
    try {
      data = await readJsonFile(file);
    } catch {
      // Skip malformed files
      continue;
    }

    let cards = [];
    if (Array.isArray(data)) cards = data;
    else if (data && Array.isArray(data.cards)) cards = data.cards;
    else if (data && typeof data === "object" && data.name) cards = [data];

    for (const c of cards) {
      const card = normalizeCard(c);
      if (!card.name) continue;
      allCards.push(card);
    }
  }
  return allCards;
}

async function tryLoadSetMeta(setDir) {
  const metaPath = path.join(setDir, "set.json");
  if (!(await fileExists(metaPath))) return null;
  try {
    const meta = await readJsonFile(metaPath);
    if (!meta || typeof meta !== "object") return null;
    return meta;
  } catch {
    return null;
  }
}

let scanCache = {
  scannedAt: 0,
  sets: [], // [{ key, title, description, cardsCount, hasImagesCount }]
  cardsBySet: new Map(), // setKey -> [cards]
  cardById: new Map() // cardId -> card
};

async function scanSets() {
  let dirents = [];
  try {
    dirents = await fsp.readdir(SETS_DIR, { withFileTypes: true });
  } catch (e) {
    console.error(`[scan] Failed to read SETS_DIR ${SETS_DIR}:`, e.message);
    scanCache = { scannedAt: Date.now(), sets: [], cardsBySet: new Map(), cardById: new Map() };
    return;
  }

  const setFolders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

  const sets = [];
  const cardsBySet = new Map();
  const cardById = new Map();

  for (const setKey of setFolders) {
    const setDir = path.join(SETS_DIR, setKey);
    const cardsJsonDir = path.join(setDir, "cards_json");
    const imagesDir = path.join(setDir, "cards_images");

    const meta = await tryLoadSetMeta(setDir);
    const title = meta?.title ? String(meta.title) : titleFromFolder(setKey);
    const description = meta?.description ? String(meta.description) : "";

    const cards = await loadCardsFromCardsJsonDir(cardsJsonDir);

    let hasImagesCount = 0;
    const hydrated = [];

    for (const card of cards) {
      const id = shaId(`${setKey}|${card.name}`);
      let imageFile = null;

      // 1) if JSON explicitly provides an image filename, try it first
      const hinted = card.image || card.imageFile || card.image_filename;
      if (hinted) {
        const hintPath = path.join(imagesDir, String(hinted));
        if (await fileExists(hintPath)) imageFile = String(hinted);
      }

      // 2) otherwise try common filename candidates
      if (!imageFile) {
        const candidates = candidateImageNames(card.name);
        for (const c of candidates) {
          const p = path.join(imagesDir, c);
          if (await fileExists(p)) {
            imageFile = c;
            break;
          }
        }
      }

      const hasImage = Boolean(imageFile);
      if (hasImage) hasImagesCount += 1;

      const cardRecord = {
        ...card,
        id,
        set: setKey,
        hasImage,
        imageUrl: hasImage ? `/api/sets/${encodeURIComponent(setKey)}/images/${encodeURIComponent(imageFile)}` : null
      };

      hydrated.push(cardRecord);
      cardById.set(id, cardRecord);
    }

    // Stable sort by name
    hydrated.sort((a, b) => a.name.localeCompare(b.name));

    sets.push({
      key: setKey,
      title,
      description,
      cardsCount: hydrated.length,
      hasImagesCount
    });
    cardsBySet.set(setKey, hydrated);
  }

  // Stable sort sets by title
  sets.sort((a, b) => a.title.localeCompare(b.title));

  scanCache = { scannedAt: Date.now(), sets, cardsBySet, cardById };
  console.log(`[scan] Found ${sets.length} set(s), ${scanCache.cardById.size} card(s).`);
}

// Feedback storage (single-process serialized writes)
async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}
const FEEDBACK_PATH = path.join(DATA_DIR, "feedback.json");
let feedbackWriteQueue = Promise.resolve();

async function readFeedback() {
  await ensureDataDir();
  try {
    const txt = await fsp.readFile(FEEDBACK_PATH, "utf8");
    const obj = JSON.parse(txt);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

async function writeFeedbackAtomic(obj) {
  await ensureDataDir();
  const tmp = `${FEEDBACK_PATH}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fsp.rename(tmp, FEEDBACK_PATH);
}

function enqueueFeedbackUpdate(fn) {
  feedbackWriteQueue = feedbackWriteQueue
    .then(fn)
    .catch((e) => console.error("[feedback] update failed:", e));
  return feedbackWriteQueue;
}

// --- API ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, scannedAt: scanCache.scannedAt, setsDir: SETS_DIR });
});

app.get("/api/sets", (req, res) => {
  res.json({ sets: scanCache.sets, scannedAt: scanCache.scannedAt });
});

app.get("/api/sets/:setKey/cards", (req, res) => {
  const setKey = req.params.setKey;
  const cards = scanCache.cardsBySet.get(setKey);
  if (!cards) return res.status(404).json({ error: "Set not found" });

  // Lightweight list for grid
  const list = cards.map((c) => ({
    id: c.id,
    name: c.name,
    mana: c.mana,
    type: c.type,
    types: c.types,
    subtypes: c.subtypes,
    pt: c.pt,
    rules: c.rules,
    hasImage: c.hasImage,
    imageUrl: c.imageUrl
  }));

  res.json({ set: setKey, cards: list, scannedAt: scanCache.scannedAt });
});

app.get("/api/cards/:cardId", (req, res) => {
  const card = scanCache.cardById.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "Card not found" });
  res.json({ card });
});

app.get("/api/cards/:cardId/feedback", async (req, res) => {
  const card = scanCache.cardById.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "Card not found" });

  const all = await readFeedback();
  const items = Array.isArray(all[card.id]) ? all[card.id] : [];
  res.json({ cardId: card.id, items });
});

app.post("/api/cards/:cardId/feedback", async (req, res) => {
  const card = scanCache.cardById.get(req.params.cardId);
  if (!card) return res.status(404).json({ error: "Card not found" });

  const name = String(req.body?.name || "").trim().slice(0, 40);
  const comment = String(req.body?.comment || "").trim().slice(0, 2000);
  const ratingRaw = req.body?.rating;

  let rating = null;
  if (ratingRaw !== undefined && ratingRaw !== null && `${ratingRaw}`.length) {
    const n = Number(ratingRaw);
    if (Number.isFinite(n)) rating = Math.max(1, Math.min(5, Math.round(n)));
  }

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!comment) return res.status(400).json({ error: "Comment is required" });

  const entry = {
    id: crypto.randomUUID(),
    name,
    rating,
    comment,
    createdAt: new Date().toISOString()
  };

  await enqueueFeedbackUpdate(async () => {
    const all = await readFeedback();
    if (!Array.isArray(all[card.id])) all[card.id] = [];
    all[card.id].push(entry);
    await writeFeedbackAtomic(all);
  });

  res.status(201).json({ ok: true, entry });
});

// Serve images only from cards_images, with traversal protection
app.get("/api/sets/:setKey/images/:filename", async (req, res) => {
  const { setKey, filename } = req.params;
  const setDir = safeJoin(SETS_DIR, setKey);
  const imgDir = safeJoin(setDir, "cards_images");
  const imgPath = safeJoin(imgDir, filename);

  if (!(await fileExists(imgPath))) return res.status(404).send("Not found");
  res.sendFile(imgPath);
});

// Kick off scan + periodic rescans
await scanSets();
setInterval(() => {
  scanSets().catch((e) => console.error("[scan] error:", e));
}, Math.max(5, SCAN_INTERVAL_SECONDS) * 1000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`custom-mtg-gallery listening on :${PORT}`);
});
