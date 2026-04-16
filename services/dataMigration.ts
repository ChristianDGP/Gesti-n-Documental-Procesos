import { db } from './firebaseConfig';
import { collection, query, getDocs, updateDoc, doc } from 'firebase/firestore';

export async function migrateUserIds() {
  // Add mappings here as you identify them
  const mapping: Record<string, string> = {
    'user-cvalenzuelaugpssmsocl': '85aZlzVMETT7OPTObjl5FohiuF2',
  };

  const notificationsRef = collection(db, 'notifications');
  const snapshot = await getDocs(notificationsRef);

  let updatedCount = 0;
  for (const document of snapshot.docs) {
    const data = document.data();
    if (mapping[data.userId]) {
      await updateDoc(doc(db, 'notifications', document.id), {
        userId: mapping[data.userId]
      });
      updatedCount++;
    }
  }
  return updatedCount;
}
