// Tiny promise wrapper around IndexedDB — the on-phone copy of everything.
const DB_NAME = 'pomodoro';
const VERSION = 1;
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('kv');
      db.createObjectStore('babies', { keyPath: 'id' }).createIndex('family', 'familyId');
      db.createObjectStore('entries', { keyPath: 'id' }).createIndex('family', 'familyId');
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const idb = {
  async get(name, key) { return wrap((await store(name)).get(key)); },
  async put(name, value, key) { return wrap((await store(name, 'readwrite')).put(value, key)); },
  async del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); },
  async all(name) { return wrap((await store(name)).getAll()); },
  async byFamily(name, familyId) { return wrap((await store(name)).index('family').getAll(familyId)); },
  async putMany(name, values) {
    if (!values.length) return;
    const db = await open();
    const tx = db.transaction(name, 'readwrite');
    const s = tx.objectStore(name);
    values.forEach((v) => s.put(v));
    return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  },
  async clearAll() {
    const db = await open();
    const names = ['kv', 'babies', 'entries', 'outbox'];
    const tx = db.transaction(names, 'readwrite');
    names.forEach((n) => tx.objectStore(n).clear());
    return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  }
};
