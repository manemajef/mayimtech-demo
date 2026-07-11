# MAYIMTECH — Demo Apps

Two static web apps for the final demo, synchronized in real time:

- **patient.html** — runs on a **phone**. Emulates the smart wristband: simulates
  pulse, temperature, and movement, and shows the patient a large, plain status.
- **caregiver.html** — runs on a **laptop** (projected). Shows the patient's live
  readings, a trend, an event history, and a prominent alert when risk is detected.

Built with plain HTML + CSS + JavaScript and **Firebase Realtime Database (v8 compat CDN)**.
No build step, no framework.

## The live web apps

- [Pateint Mobile App](https://manemajef.github.io/mayimtech-demo/patient.html)
- [Caregiver Dashboard](https://manemajef.github.io/mayimtech-demo/caregiver.html)
- [Web app entry point](https://manemajef.github.io/mayimtech-demo)

## Files

| File                              | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `patient.html` / `patient.js`     | Phone app: simulate readings, force alert, auto mode          |
| `caregiver.html` / `caregiver.js` | Laptop dashboard: live vitals, trend, history, alerts + chime |
| `styles.css`                      | Shared, deliberately plain styling                            |
| `firebase-config.js`              | Firebase keys (or local-fallback when left as placeholders)   |

## Risk logic 

A reading is **Critical** if pulse $\geq$  100 bpm, temperature $\geq$ 37.8 °C, or movement $\leq$ 30 % 
(and always when "Send alert" is pressed); **Warning** when close to those limits; otherwise **Normal**.


