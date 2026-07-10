// MAYIMTECH — Firebase configuration
// -----------------------------------------------------------------------------
// 1. Create a free Firebase project, add a Realtime Database in TEST mode.
// 2. Register a Web app (</>), copy its firebaseConfig, and paste it below.
// 3. Deploy patient.html + caregiver.html to GitHub Pages.
//
// If you leave the placeholder values below unchanged, both apps automatically
// fall back to a LOCAL demo mode (BroadcastChannel + localStorage) so you can
// test the two pages on the same machine without any Firebase setup.
const firebaseConfig = {
  apiKey: "AIzaSyDNiIS3YlXIoTVFxEWt6f78awEyLwJ3tUI",
  authDomain: "mayimtech-dc978.firebaseapp.com",
  databaseURL:
    "https://mayimtech-dc978-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mayimtech-dc978",
  storageBucket: "mayimtech-dc978.firebasestorage.app",
  messagingSenderId: "601240135362",
  appId: "1:601240135362:web:61f64c68d0f25571eabd5b",
  measurementId: "G-NZEZLNWHFN",
};

// True only when real keys have been pasted in (not the placeholders).
function isFirebaseConfigured() {
  return (
    !!firebaseConfig.databaseURL &&
    firebaseConfig.databaseURL.indexOf("your-app") === -1 &&
    !!firebaseConfig.apiKey &&
    firebaseConfig.apiKey.indexOf("YOUR_") === -1
  );
}
