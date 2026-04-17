import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  const q = query(collection(db, 'documents'), orderBy('updatedAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  console.log("Found:", snap.size);
  snap.forEach(d => {
    const data = d.data();
    if (data.title && data.title.includes('Kinesio')) {
      console.log(`FOUND: ${d.id} | ${data.title} | ${data.state} | ${data.progress}% | ${data.version}`);
    }
  });
  console.log("Done");
  process.exit(0);
}
check();
