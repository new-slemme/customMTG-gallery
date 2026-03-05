/**
 * gen-art-crops.js
 *
 * For every image in a set's cards_images/ directory, produces a cropped
 * version in cards_art_crop/ by extracting the art box region:
 *   left: 0, top: 395, width: 2187, height: 1246
 *
 * Usage:
 *   node scripts/gen-art-crops.js [--sets-dir <path>] [--force]
 *
 *   --sets-dir   Path to the sets directory (default: ./sets)
 *   --force      Re-generate crops that already exist
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const CROP_LEFT = 0;
const CROP_TOP = 395;
const CROP_WIDTH = 2187;
const CROP_HEIGHT = 1246;

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  let setsDir = path.resolve(__dirname, "../sets");
  let force = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sets-dir" && args[i + 1]) setsDir = path.resolve(args[++i]);
    else if (args[i] === "--force") force = true;
  }
  return { setsDir, force };
}

async function getSetFolders(setsDir) {
  const entries = await fsp.readdir(setsDir, { withFileTypes: true });
  const folders = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      folders.push(e.name);
    } else {
      try {
        const st = await fsp.stat(path.join(setsDir, e.name));
        if (st.isDirectory()) folders.push(e.name);
      } catch { /* skip */ }
    }
  }
  return folders;
}

async function processSet(setDir, force) {
  const imagesDir = path.join(setDir, "cards_images");
  const cropDir = path.join(setDir, "cards_art_crop");

  let imageEntries;
  try {
    imageEntries = await fsp.readdir(imagesDir, { withFileTypes: true });
  } catch {
    return { skipped: 0, created: 0, errors: 0 };
  }

  await fsp.mkdir(cropDir, { recursive: true });

  const images = imageEntries.filter(
    (e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase())
  );

  let created = 0, skipped = 0, errors = 0;

  for (const entry of images) {
    const srcPath = path.join(imagesDir, entry.name);
    const destPath = path.join(cropDir, entry.name);

    if (!force) {
      try {
        await fsp.access(destPath, fs.constants.R_OK);
        skipped++;
        continue;
      } catch { /* doesn't exist yet, proceed */ }
    }

    try {
      const meta = await sharp(srcPath).metadata();
      const left = CROP_LEFT;
      const top = CROP_TOP;
      const width = Math.min(CROP_WIDTH, (meta.width ?? CROP_WIDTH) - left);
      const height = Math.min(CROP_HEIGHT, (meta.height ?? CROP_HEIGHT + CROP_TOP) - top);

      if (width <= 0 || height <= 0) {
        console.warn(`  [skip] ${entry.name}: image too small (${meta.width}x${meta.height})`);
        skipped++;
        continue;
      }

      await sharp(srcPath)
        .extract({ left, top, width, height })
        .toFile(destPath);

      console.log(`  [ok]   ${entry.name}`);
      created++;
    } catch (err) {
      console.error(`  [err]  ${entry.name}: ${err.message}`);
      errors++;
    }
  }

  return { created, skipped, errors };
}

async function main() {
  const { setsDir, force } = parseArgs();

  console.log(`Sets dir : ${setsDir}`);
  console.log(`Force    : ${force}`);
  console.log();

  let setFolders;
  try {
    setFolders = await getSetFolders(setsDir);
  } catch (err) {
    console.error(`Failed to read sets dir: ${err.message}`);
    process.exit(1);
  }

  let totalCreated = 0, totalSkipped = 0, totalErrors = 0;

  for (const setName of setFolders) {
    console.log(`Set: ${setName}`);
    const { created, skipped, errors } = await processSet(
      path.join(setsDir, setName),
      force
    );
    console.log(`  created: ${created}, skipped: ${skipped}, errors: ${errors}\n`);
    totalCreated += created;
    totalSkipped += skipped;
    totalErrors += errors;
  }

  console.log(`Done. Total — created: ${totalCreated}, skipped: ${totalSkipped}, errors: ${totalErrors}`);
  if (totalErrors > 0) process.exit(1);
}

main();
