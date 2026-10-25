# IRON 🥊🏋️🏊🚴🏃

A personal hybrid-training project: **first amateur Muay Thai fight (Mar/Apr 2027) → build muscle → finish the NY 70.3 (Jul 2027).**

- **[FRAMEWORK.md](FRAMEWORK.md)**: the season plan, weekly structure, and adaptation rules
- **`index.html` + `app.js`**: a phone-friendly web app that generates each day's workouts and adapts them to what you log

## Using the app
1. Turn on GitHub Pages: repo **Settings → Pages → Deploy from branch → `main` / root**.
2. Open the Pages URL on your phone, then **Share → Add to Home Screen**.
3. Each morning, log sleep, energy, soreness and knee pain. Then log each session (Done/Skipped, RPE, lift weights) and your food and bodyweight.

It adapts automatically: weekly volume follows completion and RPE, lift weights progress or deload, low readiness scales the day down, knee pain swaps runs for bike sessions, and key sessions you miss can be rescheduled.

Data is stored **only in your phone's browser**. Use Settings → Export for backups.

## Claude coach 🤖
The **Coach** tab sends your last 2 weeks of logs and the next 10 days of the plan to Claude for a weekly review or any question you ask. Claude replies with advice and suggested changes, and nothing changes until you tap **Apply**.

- Get an API key at console.anthropic.com and paste it into **Settings → Claude coach**.
- The key is stored only in this browser. It is **never committed to the repo** and is left out of exports.
- The app calls the API straight from your phone, so it's for personal use only. Don't share your hosted link with the key saved on someone else's device.
- Each request costs a few cents. Set a monthly spend limit in the Anthropic console.

## Possible next steps
- Automatic Strava/Garmin import (needs a small backend for OAuth)
- Heart-rate zones from a field test
- Fight-camp sparring log
