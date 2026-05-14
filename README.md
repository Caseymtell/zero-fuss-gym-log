# Zero Fuss Gym Log

A small local-first workout PWA for personal gym planning and logging.

> **UI:** Liquid-glass mobile theme (dark by default). All visual tokens live at the top of `src/styles.css` (`:root { --bg-0, --accent-green, --r-xl, … }`) so retheming is a one-file change. Data model, local-storage key (`zero-fuss-gym-log-v1`), service worker and import/export behaviour are unchanged.

## What it does

- Pick a day: today, tomorrow, next Tuesday, or a specific date.
- Create reusable workout templates such as Push, Pull, Lower, Upper, Cardio.
- Add a saved template to a day.
- Edit the actual workout on the day: reps, weight, done sets, cardio distance, time and calories.
- Add ad-hoc exercises while training.
- Choose from simple Upper, Lower and Cardio exercise lists, or type your own exercise name.
- View basic exercise progress from logged actual values.
- Export/import a JSON backup.
- Runs as a PWA with a manifest and service worker.

## Important data note

This version is local-first. Data is stored in the browser's local storage on the device/browser you use. Use **Data → Export backup** before changing phones, clearing browser data, or moving the app to a different URL.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

This repo includes `.github/workflows/deploy.yml`.

1. Create a new GitHub repo.
2. Push this project to the `main` branch.
3. In GitHub, go to **Settings → Pages**.
4. Set **Source** to **GitHub Actions**.
5. The workflow will build the app and publish the `dist` folder.

GitHub Pages serves sites over HTTPS, which is needed for normal PWA install behaviour.

## Install on phone

After deployment, open the HTTPS URL on your phone:

- iPhone: open in Safari, tap **Share**, then **Add to Home Screen**.
- Android: open in Chrome, use **Install app** or **Add to Home screen**.

## Files to hand to Claude Design

The main UI is in:

- `src/App.tsx`
- `src/styles.css`

Tell Claude Design not to change the data model or local-storage behaviour unless you explicitly ask it to.
