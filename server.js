import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";

const PORT = parseInt(process.env.PORT || "3000", 10);
const SETS_DIR = process.env.SETS_DIR || "/sets";
const DATA_DIR = process.env.DATA_DIR || "/data";
const SCAN_INTERVAL_SECONDS = parseInt(process.env.SCAN_INTERVAL_SECONDS || "10", 10);
const PAGE_SIZE = 175; // Matches Scryfall's cards-per-page default

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(process.cwd(), "public")));

// --- Utilities ---

function shaId(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function safeJoin(base, ...parts) {
  const p = path.resolve(base, ...parts);
  if (!p.startsWith(path.resolve(base))) throw new Error("Path traversal blocked");
  return p;
}

function titleFromFolder(name) {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseCardTypeLine(typeLine) {
  const raw = String(typeLine || "").trim();
  if (!raw) return { types: [], subtypes: [] };
  const delimiterMatch = raw.match(/\s*[—–]\s*|\s-\s/);
  const delimiterIndex = delimiterMatch?.index ?? -1;
  const leftSide = delimiterIndex >= 0 ? raw.slice(0, delimiterIndex).trim() : raw;
  const rightSide =
    delimiterIndex >= 0 ? raw.slice(delimiterIndex + delimiterMatch[0].length).trim() : "";
  const toSingleToken = (v) => {
    const t = v.trim();
    return t ? [t] : [];
  };
  const toTokens = (v) =>
    v
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
  return { types: toSingleToken(leftSide), subtypes: toTokens(rightSide) };
}

// Compute CMC/mana value from a mana cost string.
// Handles Scryfall notation ({1}{R}{W}) and common custom shorthand (1RW, 3UU).
function computeCmc(manaCost) {
  if (!manaCost) return 0;
  const s = String(manaCost).trim();
  if (!s) return 0;

  if (s.includes("{")) {
    let total = 0;
    for (const t of s.match(/\{[^}]+\}/g) || []) {
      const inner = t.slice(1, -1).toUpperCase();
      if (/^\d+$/.test(inner)) total += parseInt(inner, 10);
      else if (/^[XYZ]$/.test(inner)) { /* X/Y/Z = 0 */ } else total += 1;
    }
    return total;
  }

  // Custom shorthand: digits = generic, WUBRG letters = 1 each, X/Y/Z = 0
  let total = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\d/.test(ch)) {
      let num = "";
      while (i < s.length && /\d/.test(s[i])) num += s[i++];
      total += parseInt(num, 10);
    } else if (/[XYZ]/i.test(ch)) {
      i++;
    } else if (/[WUBRG]/i.test(ch)) {
      total += 1;
      i++;
    } else {
      i++;
    }
  }
  return total;
}

const WUBRG = ["W", "U", "B", "R", "G"];

function extractColors(manaCost) {
  if (!manaCost) return [];
  const s = String(manaCost).toUpperCase();
  const found = new Set();
  if (s.includes("{")) {
    for (const t of s.match(/\{[^}]+\}/g) || []) {
      const inner = t.slice(1, -1);
      for (const c of WUBRG) if (inner.includes(c)) found.add(c);
    }
  } else {
    for (const ch of s) if (WUBRG.includes(ch)) found.add(ch);
  }
  return WUBRG.filter((c) => found.has(c));
}

function extractColorIdentity(manaCost, oracleText) {
  const found = new Set(extractColors(manaCost));
  if (oracleText) {
    for (const t of (String(oracleText).toUpperCase().match(/\{[^}]+\}/g) || [])) {
      const inner = t.slice(1, -1);
      for (const c of WUBRG) if (inner.includes(c)) found.add(c);
    }
  }
  return WUBRG.filter((c) => found.has(c));
}

const KEYWORD_ABILITIES = [
  "Deathtouch", "Defender", "Double strike", "First strike", "Flash", "Flying",
  "Haste", "Hexproof", "Indestructible", "Lifelink", "Menace", "Prowess", "Reach",
  "Shroud", "Trample", "Vigilance", "Ward", "Absorb", "Affinity", "Annihilator",
  "Banding", "Battle cry", "Bestow", "Bloodthirst", "Bushido", "Cascade", "Champion",
  "Changeling", "Cipher", "Conspire", "Convoke", "Cumulative upkeep", "Cycling",
  "Dash", "Delve", "Dethrone", "Devoid", "Devour", "Dredge", "Echo", "Emerge",
  "Embalm", "Entwine", "Escalate", "Eternalize", "Evoke", "Evolve", "Exploit",
  "Exalted", "Extort", "Fabricate", "Fading", "Fear", "Flanking", "Graft", "Haunt",
  "Hideaway", "Improvise", "Infect", "Intimidate", "Kicker", "Landwalk", "Level up",
  "Living weapon", "Madness", "Manifest", "Megamorph", "Meld", "Miracle", "Modular",
  "Morph", "Multikicker", "Myriad", "Ninjutsu", "Overload", "Partner", "Persist",
  "Phasing", "Populate", "Provoke", "Prowl", "Rampage", "Rebound", "Reinforce",
  "Renown", "Replicate", "Scavenge", "Shadow", "Skulk", "Soulbond", "Soulshift",
  "Storm", "Sunburst", "Surge", "Suspend", "Totem armor", "Transfigure", "Transmute",
  "Tribute", "Undaunted", "Undying", "Unearth", "Unleash", "Vanishing", "Wither",
];

function extractKeywords(oracleText) {
  if (!oracleText) return [];
  const text = String(oracleText);
  const found = [];
  for (const kw of KEYWORD_ABILITIES) {
    if (new RegExp(`(?:^|[\\s,;(])${kw}(?:[{\\s,;:.]|$)`, "i").test(text)) found.push(kw);
  }
  return found;
}

function normalizeCard(obj) {
  const card = { ...obj };

  card.object = "card";
  card.name = String(card.name || "").trim();

  // mana_cost — accept both Scryfall-style ({1}{R}) and custom shorthand (1R)
  const rawMana = card.mana_cost ?? card.mana ?? "";
  card.mana_cost = String(rawMana);
  delete card.mana;

  // type_line — alias: type
  const rawType = card.type_line ?? card.type ?? "";
  card.type_line = String(rawType);
  delete card.type;

  // oracle_text — alias: rules
  const rawRules = card.oracle_text ?? card.rules ?? "";
  card.oracle_text = String(rawRules);
  delete card.rules;

  // power / toughness — split from pt, or use directly if already present
  if (card.power === undefined && card.toughness === undefined) {
    const ptRaw = card.pt != null ? String(card.pt).trim() : "";
    if (ptRaw.includes("/")) {
      const slashIdx = ptRaw.indexOf("/");
      card.power = ptRaw.slice(0, slashIdx).trim();
      card.toughness = ptRaw.slice(slashIdx + 1).trim();
    } else {
      card.power = ptRaw || null;
      card.toughness = null;
    }
  }
  delete card.pt;

  // Structured type/subtype access (our extension)
  const parsedType = parseCardTypeLine(card.type_line);
  card.types = parsedType.types;
  card.subtypes = parsedType.subtypes;

  // Computed fields
  card.cmc = computeCmc(card.mana_cost);
  card.colors = extractColors(card.mana_cost);
  card.color_identity = extractColorIdentity(card.mana_cost, card.oracle_text);
  card.keywords = extractKeywords(card.oracle_text);

  return card;
}

function candidateImageNames(cardName) {
  const raw = cardName;
  const noQuotes = raw.replace(/["""]/g, "");
  const cleaned = noQuotes.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "");
  const underscored = cleaned.replace(/\s+/g, "_");
  const dashed = cleaned.replace(/\s+/g, "-");
  const noPunct = cleaned.replace(/[.,!?'']/g, "");
  const noPunctUnderscore = noPunct.replace(/\s+/g, "_");
  const noPunctDash = noPunct.replace(/\s+/g, "-");
  const bases = Array.from(
    new Set([raw, noQuotes, cleaned, underscored, dashed, noPunct, noPunctUnderscore, noPunctDash].filter(Boolean))
  );
  const exts = [".png", ".jpg", ".jpeg", ".webp"];
  const out = [];
  for (const b of bases) for (const e of exts) out.push(`${b}${e}`);
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

const THUMBS_DIR = path.join(DATA_DIR, "thumbs");
const THUMB_WIDTH = 280;

async function getOrCreateThumb(setKey, filename, srcPath) {
  const thumbDir = path.join(THUMBS_DIR, setKey);
  const thumbPath = path.join(thumbDir, `${filename}.webp`);
  if (await fileExists(thumbPath)) return thumbPath;
  await fsp.mkdir(thumbDir, { recursive: true });
  const { default: sharp } = await import("sharp");
  await sharp(srcPath)
    .resize(THUMB_WIDTH, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbPath);
  return thumbPath;
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
  sets: [],           // [SetObject]
  cardsBySet: new Map(), // code -> [CardObject]
  cardById: new Map(),   // id -> CardObject
};

async function scanSets() {
  let dirents = [];
  try {
    dirents = await fsp.readdir(SETS_DIR, { withFileTypes: true });
  } catch (e) {
    console.error(`[scan] Failed to read SETS_DIR "${SETS_DIR}": ${e.code} – ${e.message}`);
    scanCache = { scannedAt: Date.now(), sets: [], cardsBySet: new Map(), cardById: new Map() };
    return;
  }

  console.log(`[scan] SETS_DIR="${SETS_DIR}" entries (${dirents.length}):`,
    dirents.map((d) => `${d.name}[${d.isDirectory() ? "dir" : d.isFile() ? "file" : "other"}]`).join(", ") || "(none)");

  const setFolders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  const sets = [];
  const cardsBySet = new Map();
  const cardById = new Map();

  for (const setKey of setFolders) {
    const setDir = path.join(SETS_DIR, setKey);
    const cardsJsonDir = path.join(setDir, "cards_json");
    const imagesDir = path.join(setDir, "cards_images");

    const meta = await tryLoadSetMeta(setDir);
    const name = meta?.title ? String(meta.title) : titleFromFolder(setKey);
    const description = meta?.description ? String(meta.description) : "";

    const cards = await loadCardsFromCardsJsonDir(cardsJsonDir);
    let imageCount = 0;
    const hydrated = [];

    for (const card of cards) {
      const id = shaId(`${setKey}|${card.name}`);
      let imageFile = null;

      const hinted = card.image || card.imageFile || card.image_filename;
      if (hinted) {
        const hintPath = path.join(imagesDir, String(hinted));
        if (await fileExists(hintPath)) imageFile = String(hinted);
      }

      if (!imageFile) {
        for (const c of candidateImageNames(card.name)) {
          if (await fileExists(path.join(imagesDir, c))) {
            imageFile = c;
            break;
          }
        }
      }

      if (imageFile) imageCount += 1;

      const cardRecord = {
        ...card,
        id,
        set: setKey,
        // image_status mirrors Scryfall's field; image_uris mirrors Scryfall's structure
        image_status: imageFile ? "highres_scan" : "missing",
        image_uris: imageFile
          ? {
              normal: `/api/sets/${encodeURIComponent(setKey)}/images/${encodeURIComponent(imageFile)}`,
              small: `/api/sets/${encodeURIComponent(setKey)}/thumbnails/${encodeURIComponent(imageFile)}`,
            }
          : null,
      };

      hydrated.push(cardRecord);
      cardById.set(id, cardRecord);
    }

    hydrated.sort((a, b) => a.name.localeCompare(b.name));

    // Scryfall-shaped set object
    sets.push({
      object: "set",
      code: setKey,
      name,
      set_type: "custom",
      description,
      card_count: hydrated.length,
      image_count: imageCount,
      search_uri: `/api/cards/search?q=set%3A${encodeURIComponent(setKey)}&order=name`,
    });

    cardsBySet.set(setKey, hydrated);
  }

  sets.sort((a, b) => a.name.localeCompare(b.name));
  scanCache = { scannedAt: Date.now(), sets, cardsBySet, cardById };
  console.log(`[scan] Found ${sets.length} set(s), ${scanCache.cardById.size} card(s).`);
}

// --- Feedback storage (single-process serialized writes) ---

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

// --- Response helpers ---

// Scryfall-style error object
function apiError(res, status, code, details) {
  return res.status(status).json({ object: "error", status, code, details });
}

// Scryfall-style list object (non-paginated)
function apiList(data) {
  return { object: "list", total_cards: data.length, has_more: false, data };
}

// Scryfall-style list object (paginated, PAGE_SIZE cards per page)
function apiPagedList(allData, page) {
  const start = (page - 1) * PAGE_SIZE;
  const pageData = allData.slice(start, start + PAGE_SIZE);
  const hasMore = start + PAGE_SIZE < allData.length;
  const result = { object: "list", total_cards: allData.length, has_more: hasMore, data: pageData };
  if (hasMore) {
    result.next_page = `/api/cards/search`; // caller adds query params
  }
  return result;
}

// --- Search helpers ---

// Parse a Scryfall-compatible search query into structured filters.
// Supports: plain text, set:code, t:type, type:type, c:W, color:W, cmc:N, mv:N, -negation
function parseSearchQuery(q) {
  const filters = { text: [], set: null, types: [], colors: [], cmc: null };
  for (const token of String(q || "").trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(/^(-?)([\w]+):(.+)$/);
    if (m) {
      const negate = m[1] === "-";
      const key = m[2].toLowerCase();
      const value = m[3];
      switch (key) {
        case "set": filters.set = { value: value.toLowerCase(), negate }; break;
        case "t": case "type": filters.types.push({ value: value.toLowerCase(), negate }); break;
        case "c": case "color": filters.colors.push({ value: value.toUpperCase(), negate }); break;
        case "cmc": case "mv": {
          const n = parseInt(value, 10);
          if (Number.isFinite(n)) filters.cmc = { value: n, negate };
          break;
        }
        default: filters.text.push({ value: token.toLowerCase(), negate: false });
      }
    } else {
      filters.text.push({ value: token.toLowerCase(), negate: false });
    }
  }
  return filters;
}

function cardMatchesFilters(card, filters) {
  for (const { value, negate } of filters.text) {
    const hay = `${card.name} ${card.oracle_text} ${card.type_line}`.toLowerCase();
    const match = hay.includes(value);
    if (negate ? match : !match) return false;
  }
  if (filters.set) {
    const match = card.set.toLowerCase() === filters.set.value;
    if (filters.set.negate ? match : !match) return false;
  }
  for (const { value, negate } of filters.types) {
    const match = card.type_line.toLowerCase().includes(value);
    if (negate ? match : !match) return false;
  }
  for (const { value, negate } of filters.colors) {
    const colorless = value === "C" || value === "COLORLESS";
    const match = colorless
      ? card.colors.length === 0
      : [...value].some((c) => card.colors.includes(c));
    if (negate ? match : !match) return false;
  }
  if (filters.cmc !== null) {
    const match = card.cmc === filters.cmc.value;
    if (filters.cmc.negate ? match : !match) return false;
  }
  return true;
}

function sortCards(cards, order, dir) {
  const copy = [...cards];
  const dirMul = dir === "desc" ? -1 : 1;
  switch (order) {
    case "cmc":
      copy.sort((a, b) => dirMul * (a.cmc - b.cmc) || a.name.localeCompare(b.name));
      break;
    case "set":
      copy.sort((a, b) => dirMul * a.set.localeCompare(b.set) || a.name.localeCompare(b.name));
      break;
    case "name":
    default:
      copy.sort((a, b) => dirMul * a.name.localeCompare(b.name));
  }
  return copy;
}

// --- API Routes ---

app.get("/api/health", (req, res) => {
  res.json({ ok: true, scannedAt: scanCache.scannedAt, setsDir: SETS_DIR });
});

// GET /api/sets  — Scryfall-style list of all set objects
app.get("/api/sets", (req, res) => {
  res.json(apiList(scanCache.sets));
});

// GET /api/sets/:code  — single set object
app.get("/api/sets/:code", (req, res) => {
  const set = scanCache.sets.find((s) => s.code === req.params.code);
  if (!set) return apiError(res, 404, "not_found", `Set '${req.params.code}' not found`);
  res.json(set);
});

// GET /api/sets/:code/cards  — list of all cards in a set
app.get("/api/sets/:code/cards", (req, res) => {
  const cards = scanCache.cardsBySet.get(req.params.code);
  if (!cards) return apiError(res, 404, "not_found", `Set '${req.params.code}' not found`);
  res.json(apiList(cards));
});

// GET /api/cards/search  — full-text search with pagination
// Query params: q, page (default 1), order (name|cmc|set), dir (asc|desc|auto)
app.get("/api/cards/search", (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return apiError(res, 422, "bad_request", "Search query 'q' is required");

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const order = ["name", "cmc", "set"].includes(req.query.order) ? req.query.order : "name";
  const dir = req.query.dir === "desc" ? "desc" : "asc";

  const filters = parseSearchQuery(q);
  const allCards = [...scanCache.cardById.values()];
  const matched = allCards.filter((c) => cardMatchesFilters(c, filters));
  const sorted = sortCards(matched, order, dir);

  if (sorted.length === 0) return apiError(res, 404, "not_found", "Your search query didn't match any cards");

  const result = apiPagedList(sorted, page);
  if (result.has_more) {
    const nextQ = new URLSearchParams({ q, page: String(page + 1), order, dir });
    result.next_page = `/api/cards/search?${nextQ}`;
  }
  res.json(result);
});

// GET /api/cards/autocomplete  — returns up to 20 card name suggestions
// Mirrors Scryfall's catalog object response
app.get("/api/cards/autocomplete", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ object: "catalog", uri: "/api/cards/autocomplete", total_values: 0, data: [] });

  const names = [];
  for (const card of scanCache.cardById.values()) {
    if (card.name.toLowerCase().startsWith(q)) names.push(card.name);
  }
  names.sort((a, b) => a.localeCompare(b));
  const data = [...new Set(names)].slice(0, 20);
  res.json({
    object: "catalog",
    uri: `/api/cards/autocomplete?q=${encodeURIComponent(q)}`,
    total_values: data.length,
    data,
  });
});

// GET /api/cards/:id  — single card object (Scryfall: returns card directly, no wrapper)
app.get("/api/cards/:id", (req, res) => {
  const card = scanCache.cardById.get(req.params.id);
  if (!card) return apiError(res, 404, "not_found", `Card '${req.params.id}' not found`);
  res.json(card);
});

// GET /api/cards/:id/feedback
app.get("/api/cards/:id/feedback", async (req, res) => {
  const card = scanCache.cardById.get(req.params.id);
  if (!card) return apiError(res, 404, "not_found", `Card '${req.params.id}' not found`);
  const all = await readFeedback();
  const items = Array.isArray(all[card.id]) ? all[card.id] : [];
  res.json({ cardId: card.id, items });
});

// POST /api/cards/:id/feedback
app.post("/api/cards/:id/feedback", async (req, res) => {
  const card = scanCache.cardById.get(req.params.id);
  if (!card) return apiError(res, 404, "not_found", `Card '${req.params.id}' not found`);

  const name = String(req.body?.name || "").trim().slice(0, 40);
  const comment = String(req.body?.comment || "").trim().slice(0, 2000);
  const ratingRaw = req.body?.rating;
  let rating = null;
  if (ratingRaw !== undefined && ratingRaw !== null && `${ratingRaw}`.length) {
    const n = Number(ratingRaw);
    if (Number.isFinite(n)) rating = Math.max(1, Math.min(5, Math.round(n)));
  }

  if (!name) return apiError(res, 422, "bad_request", "Name is required");
  if (!comment) return apiError(res, 422, "bad_request", "Comment is required");

  const entry = { id: crypto.randomUUID(), name, rating, comment, createdAt: new Date().toISOString() };

  await enqueueFeedbackUpdate(async () => {
    const all = await readFeedback();
    if (!Array.isArray(all[card.id])) all[card.id] = [];
    all[card.id].push(entry);
    await writeFeedbackAtomic(all);
  });

  res.status(201).json({ ok: true, entry });
});

// Serve resized WebP thumbnails (cached in DATA_DIR/thumbs)
app.get("/api/sets/:setKey/thumbnails/:filename", async (req, res) => {
  const { setKey, filename } = req.params;
  const imgPath = safeJoin(safeJoin(SETS_DIR, setKey), "cards_images", filename);
  if (!(await fileExists(imgPath))) return res.status(404).send("Not found");
  try {
    const thumbPath = await getOrCreateThumb(setKey, filename, imgPath);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.sendFile(thumbPath);
  } catch (err) {
    console.error("[thumb] generation failed, falling back to original:", err.message);
    res.sendFile(imgPath);
  }
});

// Serve full-resolution images
app.get("/api/sets/:setKey/images/:filename", async (req, res) => {
  const { setKey, filename } = req.params;
  const imgPath = safeJoin(safeJoin(SETS_DIR, setKey), "cards_images", filename);
  if (!(await fileExists(imgPath))) return res.status(404).send("Not found");
  res.sendFile(imgPath);
});

// --- Startup ---

console.log(`[startup] SETS_DIR=${SETS_DIR}  DATA_DIR=${DATA_DIR}  PORT=${PORT}`);
await scanSets();
setInterval(() => {
  scanSets().catch((e) => console.error("[scan] error:", e));
}, Math.max(5, SCAN_INTERVAL_SECONDS) * 1000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`custom-mtg-gallery listening on :${PORT}`);
});
