const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json'); // À fournir par l'admin

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function purgeLegacyDocs(collectionName) {
  console.log(`Purging legacy encrypted documents in ${collectionName}...`);
  const snapshot = await db.collection(collectionName).get();
  let count = 0;
  
  const batch = db.batch();
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.payload) {
      batch.delete(doc.ref);
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Deleted ${count} legacy documents from ${collectionName}.`);
  } else {
    console.log(`No legacy documents found in ${collectionName}.`);
  }
}

async function main() {
  await purgeLegacyDocs('hazards');
  await purgeLegacyDocs('presence');
  console.log('Purge complete.');
}

main().catch(console.error);
