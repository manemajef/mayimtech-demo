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
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  databaseURL: "https://your-app-default-rtdb.firebaseio.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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
