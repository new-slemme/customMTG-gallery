import fs from 'fs';
import path from 'path';
import { CACHE_TTL_MS, SETS_DIR } from './config';
import { slugify } from './slug';

const state = {
  lastScan: 0,
  data: { sets: [] },
  lastGood: { sets: [] }
};

function parseCardFiles(setDir, setSlug) {
  const jsonDir = path.join(setDir, 'cards_json');
  const imageDir = path.join(setDir, 'cards_images');
  const cards = [];

  if (!fs.existsSync(jsonDir)) return cards;

  const files = fs.readdirSync(jsonDir).filter((f) => f.toLowerCase().endsWith('.json'));

  for (const file of files) {
    const fullPath = path.join(jsonDir, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.cards) ? parsed.cards : null;
      if (!list) {
        console.warn(`[sets] Invalid JSON structure in ${fullPath}`);
        continue;
      }

      for (const entry of list) {
        if (!entry || typeof entry !== 'object' || !entry.name) {
          console.warn(`[sets] Skipping invalid card entry in ${fullPath}`);
          continue;
        }
        const name = String(entry.name);
        const cardId = entry.id ? String(entry.id) : slugify(name);
        const slug = slugify(name);

        const exactImage = `${name}.png`;
        const slugImage = `${slug}.png`;

        let imageFile = null;
        if (fs.existsSync(path.join(imageDir, exactImage))) imageFile = exactImage;
        else if (fs.existsSync(path.join(imageDir, slugImage))) imageFile = slugImage;

        cards.push({
          id: cardId,
          set_slug: setSlug,
          name,
          mana: entry.mana ? String(entry.mana) : '',
          type: entry.type ? String(entry.type) : '',
          pt: entry.pt ? String(entry.pt) : '',
          rules: entry.rules ? String(entry.rules) : '',
          rules_lines: entry.rules ? String(entry.rules).split(/\r?\n/).filter(Boolean) : [],
          image_url: imageFile ? `/sets/${setSlug}/cards_images/${encodeURIComponent(imageFile)}` : null
        });
      }
    } catch (err) {
      console.warn(`[sets] Failed to parse ${fullPath}:`, err.message);
    }
  }

  return cards;
}

function scanSets() {
  const sets = [];
  if (!fs.existsSync(SETS_DIR)) return { sets };

  for (const dirent of fs.readdirSync(SETS_DIR, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const setSlug = dirent.name;
    const setDir = path.join(SETS_DIR, setSlug);
    sets.push({
      set_slug: setSlug,
      set_name: setSlug,
      cards: parseCardFiles(setDir, setSlug)
    });
  }

  return { sets };
}

export function getSetsData(force = false) {
  const now = Date.now();
  if (!force && now - state.lastScan < CACHE_TTL_MS) return state.data;

  try {
    const scanned = scanSets();
    state.data = scanned;
    state.lastGood = scanned;
    state.lastScan = now;
  } catch (err) {
    console.warn('[sets] Scan failed, serving last known good data:', err.message);
    state.data = state.lastGood;
    state.lastScan = now;
  }
  return state.data;
}

export function getAllSets() {
  return getSetsData().sets.map(({ set_slug, set_name }) => ({ set_slug, set_name }));
}

export function getSetCards(setSlug) {
  const set = getSetsData().sets.find((s) => s.set_slug === setSlug);
  return set?.cards || null;
}

export function getCard(setSlug, cardId) {
  const cards = getSetCards(setSlug);
  if (!cards) return null;
  return cards.find((c) => c.id === cardId) || null;
}
