// Caché local de datos del panel en IndexedDB.
//
// Supabase no tiene un equivalente a la persistencia offline de Firestore: el cliente JS habla
// HTTP contra PostgREST y sin red simplemente falla. Para que el profesional pueda mirar su
// agenda del día en el sillón aunque se le caiga la señal, guardamos acá la última respuesta
// buena de cada consulta y la servimos mientras la red no conteste.
//
// IndexedDB y no localStorage porque una semana de reservas con sus items pasa cómodo los 5 MB
// que garantiza localStorage, y porque escribir ahí bloquea el hilo principal.

const DB_NAME = 'agenda-offline';
const STORE = 'cache';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null); // Safari en modo privado puede negar el acceso
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

// Toda la API devuelve promesas que nunca rechazan: la caché es una mejora, jamás un motivo para
// romper la vista. Si IndexedDB no está disponible, readCache devuelve null y writeCache no hace
// nada.
export async function readCache(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCache(key, value) {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ value, savedAt: Date.now() }, key);
  } catch {
    // cuota llena o base cerrada: seguir sin caché es aceptable
  }
}

// Al cerrar sesión hay que vaciarla: los datos guardados son de clientes y reservas del salón y
// no tienen por qué sobrevivir en el teléfono de alguien que ya no tiene acceso.
export async function clearCache() {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).clear();
  } catch {
    // nada que hacer
  }
}
