// Minimal promise-wrapped IndexedDB helper. One database, four object stores, each keyed by `id`.
// This is the only place that touches the raw IndexedDB API — everything else builds on idbPut/idbGet/etc.

const DB_NAME = 'repolens';
// v2 added 'collections'. v3 added 'decisions'. v4 added 'snapshots'. v5 added
// 'scenes'. v6 added 'mastery' (the Knowledge Game signal). v7 added 'concepts'
// (the Knowledge-Graph concept substrate). Each upgrade is additive —
// onupgradeneeded creates any new store, so existing data survives.
const DB_VERSION = 7;
const STORES = [
  'repos',
  'nodes',
  'edges',
  'collections',
  'decisions',
  'snapshots',
  'scenes',
  'mastery',
  'concepts',
];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    let blockedTimer = null;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      dbPromise = null;
      reject(err);
    };
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      if (settled) return;
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      const db = req.result;
      // If a future build bumps DB_VERSION while this page is open, release the
      // old connection immediately. Without this, IndexedDB upgrades can be
      // blocked by stale output/library tabs, making saves and library loads hang.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onblocked = () => {
      blockedTimer = setTimeout(
        () => fail(new Error('IndexedDB upgrade blocked by another open RepoLens tab')),
        3000
      );
    };
    req.onerror = () => fail(req.error || new Error('Could not open IndexedDB'));
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const idbPut = (store, value) => run(store, 'readwrite', (os) => os.put(value));
export const idbGet = (store, id) => run(store, 'readonly', (os) => os.get(id));
export const idbGetAll = (store) => run(store, 'readonly', (os) => os.getAll());
export const idbDelete = (store, id) => run(store, 'readwrite', (os) => os.delete(id));
export const idbClear = (store) => run(store, 'readwrite', (os) => os.clear());
