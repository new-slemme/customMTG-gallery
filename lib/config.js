import path from 'path';

export const SETS_DIR = process.env.SETS_DIR || path.join(process.cwd(), 'sets');
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const DB_PATH = path.join(DATA_DIR, 'gallery.sqlite');
export const CACHE_TTL_MS = 15000;
