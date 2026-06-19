/* db.js — DiaryWell persistence layer.
   Pure IndexedDB. Single database, three object stores:
     - entries: keyed by date (YYYY-MM-DD)
     - meta:    settings / preferences / pin hash / install state
     - tags:    user-defined symptoms, triggers, meds
   All async. Returns Promises. No external deps.
*/

(function (global) {
  'use strict';

  const DB_NAME = 'diarywell';
  const DB_VERSION = 1;
  const STORE_ENTRIES = 'entries';
  const STORE_META = 'meta';
  const STORE_TAGS = 'tags';

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (ev) {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          const s = db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' });
          s.createIndex('by_updated', 'updatedAt');
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_TAGS)) {
          const t = db.createObjectStore(STORE_TAGS, { keyPath: 'id' });
          t.createIndex('by_kind', 'kind');
        }
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
      req.onblocked = function () { reject(new Error('Database upgrade blocked. Close other tabs and try again.')); };
    });
  }

  function tx(stores, mode) {
    return open().then(function (db) {
      const t = db.transaction(stores, mode || 'readonly');
      return t;
    });
  }

  function asPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- Entries ---------- */

  function putEntry(entry) {
    if (!entry || !entry.date) return Promise.reject(new Error('Entry requires a date.'));
    entry.updatedAt = Date.now();
    if (!entry.createdAt) entry.createdAt = entry.updatedAt;
    return tx([STORE_ENTRIES], 'readwrite').then(function (t) {
      const s = t.objectStore(STORE_ENTRIES);
      return asPromise(s.put(entry));
    });
  }

  function getEntry(date) {
    return tx([STORE_ENTRIES]).then(function (t) {
      return asPromise(t.objectStore(STORE_ENTRIES).get(date));
    });
  }

  function getAllEntries() {
    return tx([STORE_ENTRIES]).then(function (t) {
      return asPromise(t.objectStore(STORE_ENTRIES).getAll());
    }).then(function (rows) {
      rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      return rows;
    });
  }

  function getEntriesInRange(fromDate, toDate) {
    return tx([STORE_ENTRIES]).then(function (t) {
      const s = t.objectStore(STORE_ENTRIES);
      const range = IDBKeyRange.bound(fromDate, toDate);
      return asPromise(s.getAll(range));
    }).then(function (rows) {
      rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      return rows;
    });
  }

  function deleteEntry(date) {
    return tx([STORE_ENTRIES], 'readwrite').then(function (t) {
      return asPromise(t.objectStore(STORE_ENTRIES).delete(date));
    });
  }

  /* ---------- Meta (settings + state) ---------- */

  function setMeta(key, value) {
    return tx([STORE_META], 'readwrite').then(function (t) {
      return asPromise(t.objectStore(STORE_META).put({ key: key, value: value }));
    });
  }

  function getMeta(key, fallback) {
    return tx([STORE_META]).then(function (t) {
      return asPromise(t.objectStore(STORE_META).get(key));
    }).then(function (row) {
      if (!row) return fallback === undefined ? null : fallback;
      return row.value;
    });
  }

  function getAllMeta() {
    return tx([STORE_META]).then(function (t) {
      return asPromise(t.objectStore(STORE_META).getAll());
    });
  }

  /* ---------- Tags ---------- */

  function uid() {
    return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function addTag(kind, name, color) {
    const tag = {
      id: uid(),
      kind: kind,             // 'symptom' | 'trigger' | 'med'
      name: String(name || '').trim().slice(0, 60),
      color: color || 'violet',
      enabled: true,
      createdAt: Date.now()
    };
    if (!tag.name) return Promise.reject(new Error('Tag name is required.'));
    return tx([STORE_TAGS], 'readwrite').then(function (t) {
      return asPromise(t.objectStore(STORE_TAGS).put(tag));
    }).then(function () { return tag; });
  }

  function updateTag(tag) {
    return tx([STORE_TAGS], 'readwrite').then(function (t) {
      return asPromise(t.objectStore(STORE_TAGS).put(tag));
    });
  }

  function deleteTag(id) {
    return tx([STORE_TAGS], 'readwrite').then(function (t) {
      return asPromise(t.objectStore(STORE_TAGS).delete(id));
    });
  }

  function getTagsByKind(kind) {
    return tx([STORE_TAGS]).then(function (t) {
      const idx = t.objectStore(STORE_TAGS).index('by_kind');
      return asPromise(idx.getAll(kind));
    }).then(function (rows) {
      rows.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
      return rows;
    });
  }

  function getAllTags() {
    return tx([STORE_TAGS]).then(function (t) {
      return asPromise(t.objectStore(STORE_TAGS).getAll());
    });
  }

  /* ---------- Backup ---------- */

  function exportAll() {
    return Promise.all([getAllEntries(), getAllMeta(), getAllTags()])
      .then(function (parts) {
        return {
          app: 'DiaryWell',
          version: 1,
          exportedAt: new Date().toISOString(),
          entries: parts[0],
          meta: parts[1],
          tags: parts[2]
        };
      });
  }

  function importAll(payload, opts) {
    opts = opts || {};
    const merge = !!opts.merge;
    if (!payload || payload.app !== 'DiaryWell') {
      return Promise.reject(new Error("This file isn't a DiaryWell backup."));
    }
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction([STORE_ENTRIES, STORE_META, STORE_TAGS], 'readwrite');
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
        if (!merge) {
          t.objectStore(STORE_ENTRIES).clear();
          t.objectStore(STORE_META).clear();
          t.objectStore(STORE_TAGS).clear();
        }
        (payload.entries || []).forEach(function (e) {
          if (e && e.date) t.objectStore(STORE_ENTRIES).put(e);
        });
        (payload.meta || []).forEach(function (m) {
          if (m && m.key) t.objectStore(STORE_META).put(m);
        });
        (payload.tags || []).forEach(function (g) {
          if (g && g.id) t.objectStore(STORE_TAGS).put(g);
        });
      });
    });
  }

  function clearAll() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const t = db.transaction([STORE_ENTRIES, STORE_META, STORE_TAGS], 'readwrite');
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
        t.objectStore(STORE_ENTRIES).clear();
        t.objectStore(STORE_META).clear();
        t.objectStore(STORE_TAGS).clear();
      });
    });
  }

  /* ---------- Crypto helpers (PIN) ---------- */

  function sha256(str) {
    const buf = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', buf).then(function (h) {
      const arr = Array.from(new Uint8Array(h));
      return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    });
  }

  function hashPin(pin, salt) {
    return sha256(salt + ':' + pin);
  }

  function randomSalt() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return Array.from(a).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  global.DiaryDB = {
    open: open,
    putEntry: putEntry,
    getEntry: getEntry,
    getAllEntries: getAllEntries,
    getEntriesInRange: getEntriesInRange,
    deleteEntry: deleteEntry,
    setMeta: setMeta,
    getMeta: getMeta,
    getAllMeta: getAllMeta,
    addTag: addTag,
    updateTag: updateTag,
    deleteTag: deleteTag,
    getTagsByKind: getTagsByKind,
    getAllTags: getAllTags,
    exportAll: exportAll,
    importAll: importAll,
    clearAll: clearAll,
    hashPin: hashPin,
    randomSalt: randomSalt
  };
})(window);
