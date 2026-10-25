# IRON — Training Framework (Oct 2026 → Jul 2027)

## Athlete snapshot
| | |
|---|---|
| Age / height / weight | 20 · 5'7" · ~160 lb |
| Muay Thai | 6 months, 3×/week, has sparred |
| Lifting | 5 years — squat 245, bench 225, deadlift 225 |
| Endurance | 5K ≈ 27:00, long run ≈ 5 mi, can swim 100 m, little open water, road bike (outdoor) |
| Gear / facilities | Garmin Forerunner 970, Strava, Weymouth Club (gym + pool) |
| Work | Sun 10–5 (every other week), Mon 9–8, Wed 12–8, Thu 9–5, Fri 9–6, Sat 9–6 · Tue off |
| Injury history | Torn meniscus (~4 yrs ago) |
| Sleep | ~6 h/night ⚠️ |

## Priorities (in this order)
1. **Win the amateur Muay Thai fight** (target: late March / early April 2027)
2. **Build muscle**
3. **Finish the NY 70.3** (July 2027) in an average time

The calendar happens to fit these priorities well: the fight comes first, and the triathlon is built after it. **We never peak for both at once.**

## Season map
Dates are computed from the fight and race dates in the app's Settings. These defaults assume a fight on **Sat Apr 3, 2027** and a race on **Sun Jul 11, 2027**.

| Block | Dates (default) | Main goal | Lifting | Muay Thai | Endurance |
|---|---|---|---|---|---|
| **1. Base / Hypertrophy** | Oct 26 → Dec 25 | Build muscle and an aerobic engine | 3× hypertrophy (8–10 reps) | 3× classes | Easy swim 2×, bike 1–2×, run 2× (Zone 2 only) |
| **2. Strength / Pre-camp** | Dec 26 → Feb 5 | Get strong, sharpen skills | 3× strength (4–6 reps) | 3× classes + 1 skills/pads | Maintain: swim 1–2×, bike 1×, run 2× |
| **3. Fight Camp** | Feb 6 → Mar 27 | Fight-ready conditioning, make weight | 2× power/maintenance | 4–5× (sparring, pads, clinch) | Run intervals as conditioning, easy swim/bike for recovery only |
| **4. Fight Week** | Mar 28 → Apr 3 | Sharp, fresh, on weight | Off or 1 light session | Light pads/technique | Light shakeouts |
| **5. Recovery** | Apr 4 → Apr 10 | Heal, celebrate | — | — | Easy movement |
| **6. Tri Build** | Apr 11 → Jun 19 | Swim/bike/run volume, open water | 2× maintenance | 2× (keep skills) | Swim 3×, bike 3×, run 3×, weekend bricks |
| **7. Peak** | Jun 20 → Jul 1 | Race-specific long sessions | 1–2× light | 1× | Longest brick, race-pace work |
| **8. Taper** | Jul 1 → Jul 11 | Fresh legs | 1× light | optional | Volume −40–60%, keep some intensity |

Every 4th week of a block is a **deload** (about 70% volume) — except fight week, which has its own taper.

## Weekly template (built around your work schedule)
Training windows: **early mornings** before 9 AM shifts, the **long Wednesday morning** (work starts at 12), **evenings after 5/6 PM** on Thu/Fri/Sat/working Sundays, and **Tuesday** plus off-Sundays as the big days. Muay Thai classes are assumed to be **Tue/Thu/Sat evenings**.

### Block 1 example
| Day | AM | PM |
|---|---|---|
| Mon (9–8) | Upper lift (60′) | — |
| Tue (off) | Long easy run | Muay Thai |
| Wed (12–8) | Lower lift + technique swim | — |
| Thu (9–5) | Easy bike (spin bike/trainer) | Muay Thai |
| Fri (9–6) | Swim (aerobic) | Full-body lift |
| Sat (9–6) | Easy run | Muay Thai |
| Sun work | Mobility / rest | — |
| Sun off | Long bike or swim + run | — |

The app generates every day of every block automatically.

## Intensity rules
- **80/20:** about 80% of endurance minutes are easy (Zone 2, conversational). Use the 970's heart-rate zones. Winning the fight depends on not frying your legs with junk miles.
- **No hard runs the day before hard sparring.**
- **Lift legs before a run, not after hard sparring.**
- **Knee (meniscus) protection:** run volume grows no more than about 10% per week, nothing over 13.1 mi before race day, and split squats/step-ups replace deep loaded flexion when the knee complains. A knee-pain score of 4+ in the app swaps runs for bike sessions automatically.

## How the plan adapts (implemented in the app)
1. **Missed workouts:** a missed *key* session can be moved with one tap to the next lightest day (usually Tuesday or an off-Sunday). Missed non-key sessions are just dropped. Never cram.
2. **Fatigue and effort:** each session is logged with RPE (1–10). Next week's endurance volume scales from last week's results:
   - completion < 70% or average RPE > 8.5 → **−15%**
   - completion ≥ 90% and average RPE ≤ 6.5 → **+5%**
   - otherwise → unchanged
3. **Lifting progression** (per lift, per rep scheme):
   - every rep hit at RPE ≤ 8 → **+5 lb** (lower body) / **+2.5 lb** (upper body)
   - missed reps → hold the weight. **2 misses in a row → −10%** and rebuild
4. **Daily readiness:** log sleep, energy, soreness and knee pain each morning.
   - Low readiness → hard sessions drop to moderate, about −25% duration
   - Very low readiness → technique/mobility only
   - Knee pain ≥ 4 → runs become bikes

## Nutrition
- **Protein:** about 1 g per lb of bodyweight every day (~160 g)
- **Fat:** about 0.35 g/lb
- **Carbs:** fill the rest, more on big training days
- **Calories:** about bodyweight × 15 plus training minutes × 9, adjusted by block:
  - Base / Strength: **+250** (lean bulk, target +0.25–0.5 lb/week)
  - Fight Camp: **−300**, but *only* if above fight-weight target (target loss ≤ 1 lb/week)
  - Tri Build/Peak: maintenance, fuel long sessions (60–90 g carbs per hour on rides over 90′)
- **Weight class:** decide with your coach early in Block 2. Aim to walk around within about 5% of your fight weight by fight week. **No extreme dehydration cuts.** Many amateur weigh-ins are close to fight time, and dehydration is dangerous for your health and your performance.

## Recovery: the biggest lever you have ⚠️
**Six hours of sleep is not enough for this workload.** Training three sports while working 50 hours a week on 6 hours of sleep is the fastest route to injury, illness and losing the fight. Target **7.5–8 hours**. If you start remote work, put the commute time back into sleep first. The app's readiness score weights sleep heavily for this reason.

## Open items to confirm
- [ ] Exact fight date and weight class (ask your coach)
- [ ] Exact race: the NY 70.3 in July is likely **IRONMAN 70.3 Musselman** (Geneva, NY, mid-July). Confirm and set the date in the app.
- [ ] Winter bike plan: a smart trainer or the club's spin bikes from Nov to Mar
- [ ] Open-water swims from May (lakes or ocean near Weymouth, never alone)
- [ ] Bike fit before the Tri Build block
- [ ] Get a doctor's sign-off for the fight medical
