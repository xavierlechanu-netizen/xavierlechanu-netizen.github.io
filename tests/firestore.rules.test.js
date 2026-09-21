/**
 * @jest-environment node
 */
const fs = require('fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

let testEnv;

beforeAll(async () => {
  // Load rules from firestore.rules
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  
  testEnv = await initializeTestEnvironment({
    projectId: "mon50ccetmoi-test",
    firestore: {
      rules: rules,
      host: "127.0.0.1",
      port: 8080
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe("Tests des Règles de Sécurité Firestore (Zero-Trust)", () => {
  
  it("Devrait empêcher un utilisateur non connecté de lire les users", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection("users").doc("some-uid").get());
  });

  it("Devrait permettre à un utilisateur de lire son propre profil", async () => {
    const myAuthDb = testEnv.authenticatedContext("user123").firestore();
    await assertSucceeds(myAuthDb.collection("users").doc("user123").get());
  });

  it("Devrait empêcher un utilisateur de modifier le profil d'un autre (Zero-Trust)", async () => {
    const hackerDb = testEnv.authenticatedContext("hacker999").firestore();
    await assertFails(hackerDb.collection("users").doc("user123").update({
      role: "admin"
    }));
  });

  it("Devrait empêcher l'écriture de compteurs sans auth", async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthedDb.collection("counters").doc("stats").get());
  });
});
