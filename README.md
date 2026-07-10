# MAYIMTECH — Demo Apps

Two static web apps for the final demo, synchronized in real time:

- **patient.html** — runs on a **phone**. Emulates the smart wristband: simulates
  pulse, temperature, and movement, and shows the patient a large, plain status.
- **caregiver.html** — runs on a **laptop** (projected). Shows the patient's live
  readings, a trend, an event history, and a prominent alert when risk is detected.

Built with plain HTML + CSS + JavaScript and **Firebase Realtime Database (v8 compat CDN)**.
No build step, no framework.

## Run locally (no Firebase needed)
Serve this folder over http and open the two pages in two tabs/devices:

```bash
python3 -m http.server 8000
# patient:   http://localhost:8000/patient.html
# caregiver: http://localhost:8000/caregiver.html
```

With the placeholder keys in `firebase-config.js`, the apps run in **local demo mode**
(BroadcastChannel + localStorage) — the two tabs sync on the same machine.

## Enable real cross-device sync (for the class)
1. Create a free Firebase project → add a **Realtime Database** in **test mode**.
2. Register a Web app (`</>`), copy its `firebaseConfig`.
3. Paste the values into `firebase-config.js` (replace the `YOUR_…` placeholders).
4. Deploy to **GitHub Pages** and use the public `patient.html` / `caregiver.html` URLs.

## Files
| File | Purpose |
|------|---------|
| `patient.html` / `patient.js` | Phone app: simulate readings, force alert, auto mode |
| `caregiver.html` / `caregiver.js` | Laptop dashboard: live vitals, trend, history, alerts + chime |
| `styles.css` | Shared, deliberately plain styling |
| `firebase-config.js` | Firebase keys (or local-fallback when left as placeholders) |

## Risk logic (threshold comparison — no algorithm)
A reading is **Critical** if pulse ≥ 100 bpm, temperature ≥ 37.8 °C, or movement ≤ 30 %
(and always when "Send alert" is pressed); **Warning** when close to those limits; otherwise **Normal**.
