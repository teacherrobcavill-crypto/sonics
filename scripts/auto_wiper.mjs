import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

const config = {
  apiKey: "AIzaSyC3lS45ktSv4Jou7cxv6Oi9gb8GKiNwN1Y",
  authDomain: "soniceq-96d91.firebaseapp.com",
  projectId: "soniceq-96d91",
  storageBucket: "soniceq-96d91.firebasestorage.app",
  messagingSenderId: "587742843893",
  appId: "1:587742843893:web:06182a8f05006f743246bc"
};

// Monday 19 October 2026 at 06:00:00 BST timestamp (1792386000000)
export const PRE_LAUNCH_WIPE_TIMESTAMP = 1792386000000;

const app = initializeApp(config);
const db = getFirestore(app);

let wipeCount = 0;

async function sweep() {
  const now = Date.now();
  if (now >= PRE_LAUNCH_WIPE_TIMESTAMP) {
    console.log(`[AutoWiper] Target cutoff reached (${new Date(PRE_LAUNCH_WIPE_TIMESTAMP).toISOString()}).`);
    console.log(`[AutoWiper] Launching real student session. Exiting wiper.`);
    process.exit(0);
  }

  try {
    const studentsSnap = await getDocs(collection(db, 'students'));
    if (studentsSnap.size > 0) {
      console.log(`[AutoWiper] Found ${studentsSnap.size} test student(s) to wipe:`);
      for (const d of studentsSnap.docs) {
        await deleteDoc(doc(db, 'students', d.id));
        console.log(`  - Wiped student document: ${d.id}`);
        wipeCount++;
      }
    }

    const scoresSnap = await getDocs(collection(db, 'scores'));
    if (scoresSnap.size > 0) {
      console.log(`[AutoWiper] Found ${scoresSnap.size} score record(s) to wipe:`);
      for (const d of scoresSnap.docs) {
        await deleteDoc(doc(db, 'scores', d.id));
        console.log(`  - Wiped score document: ${d.id}`);
        wipeCount++;
      }
    }
  } catch (err) {
    console.error('[AutoWiper] Error during sweep:', err);
  }
}

console.log(`[AutoWiper] Started continuous wipe process.`);
console.log(`[AutoWiper] Active until Monday 19 Oct 2026 06:00 BST (${PRE_LAUNCH_WIPE_TIMESTAMP}).`);
console.log(`[AutoWiper] Current time: ${new Date().toISOString()}`);

await sweep();

// Sweep every 15 seconds
setInterval(sweep, 15000);
