/**
 * Persistent Audio Storage using browser IndexedDB.
 * Stores user-uploaded custom reference tracks so they survive page refreshes,
 * source switching, and browser restarts without data loss.
 */

const DB_NAME = 'sonics_audio_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'custom_audio_store';
const RECORD_KEY = 'active_custom_track';

export interface StoredAudioRecord {
  name: string;
  type: string;
  data: ArrayBuffer;
  size: number;
  updatedAt: number;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open audio IndexedDB'));
  });
}

/**
 * Persists an uploaded audio file and its raw ArrayBuffer to IndexedDB.
 */
export async function saveCustomAudioToStorage(
  fileName: string,
  mimeType: string,
  buffer: ArrayBuffer
): Promise<void> {
  try {
    const db = await openAudioDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Make an independent copy of the ArrayBuffer to avoid detached buffer issues
    const copiedBuffer = buffer.slice(0);

    const record: StoredAudioRecord = {
      name: fileName,
      type: mimeType || 'audio/wav',
      data: copiedBuffer,
      size: copiedBuffer.byteLength,
      updatedAt: Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const putRequest = store.put(record, RECORD_KEY);
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error || new Error('Failed to write audio record'));
    });
  } catch (err) {
    console.warn('Notice: Failed persisting custom audio to IndexedDB:', err);
  }
}

/**
 * Loads the active custom audio record from IndexedDB, if present.
 */
export async function getCustomAudioFromStorage(): Promise<StoredAudioRecord | null> {
  try {
    const db = await openAudioDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return await new Promise<StoredAudioRecord | null>((resolve, reject) => {
      const getRequest = store.get(RECORD_KEY);
      getRequest.onsuccess = () => {
        const result = getRequest.result as StoredAudioRecord | undefined;
        resolve(result || null);
      };
      getRequest.onerror = () => reject(getRequest.error || new Error('Failed to read audio record'));
    });
  } catch (err) {
    console.warn('Notice: Failed reading custom audio from IndexedDB:', err);
    return null;
  }
}

/**
 * Deletes the stored custom audio from IndexedDB.
 */
export async function clearCustomAudioFromStorage(): Promise<void> {
  try {
    const db = await openAudioDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const delRequest = store.delete(RECORD_KEY);
      delRequest.onsuccess = () => resolve();
      delRequest.onerror = () => reject(delRequest.error || new Error('Failed to delete audio record'));
    });
  } catch (err) {
    console.warn('Notice: Failed clearing custom audio from IndexedDB:', err);
  }
}
