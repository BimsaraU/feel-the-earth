# Validation

Stage 1 done-criteria and their status. "Not run" means nobody has done it yet; do not mark it passed without doing it.

## Automated

| Check | How | Status |
|---|---|---|
| Border and coast events on known paths | `npm test` (src/geo/events.test.ts) | Passing |
| Loop generation deterministic, west-to-east | `npm test` (src/audio/loop.test.ts) | Passing |
| Mapping table round-trips, MAPPING.md in sync | `npm test` (src/audio/mapping.test.ts) | Passing |
| Spoken answers | `npm test` (src/assist/answers.test.ts) | Passing |
| Smoke: load, unlock audio, move, toggle layer, both answers | `npm run e2e` (headless Chromium) | See latest run |

## Manual (needs people and devices)

| Check | Status |
|---|---|
| Blindfold test (a) find a coastline, (b) cross a border and say so, (c) tell which of two regions is higher, (d) ask where, (e) step time and hear a change | Not run |
| Tutorial under 60 s | Not timed with real TTS (the app logs the duration to the console) |
| Loops gapless for 5 minutes, no clicks while moving | Not run |
| Four stacked layers distinguishable | Not run |
| Chrome desktop / Safari desktop / Chrome Android tablet / Safari iPadOS | Not run |
| Haptics on an Android phone | Not run |
| Offline after first visit | Not run on device (service worker precaches 108 files, about 8 MB) |
| Loudness about -14 LUFS | Not measured |
| Input-to-sound latency per device | Not measured |

## Blindfold test protocol

1. Fresh profile, headphones, volume set by the participant.
2. Participant presses any key, then T, and listens to the legend (under 60 s).
3. Eyes closed from here. Tasks, in order, each with a 2-minute limit:
   a. "Find a coastline." Pass: they stop on a coast event and say so.
   b. "Cross a border and tell me when you do." Pass: they announce it within 2 s of the clave ticks.
   c. Temperature on. Experimenter places the window over two regions in turn. "Which is warmer?" Pass: correct answer.
   d. "Where are you?" Pass: they press W (or the button) unprompted.
   e. "Go forward a month. Did anything change?" Pass: they hear the chime and describe a change.
4. Record pass or fail and time per task, device, browser, screen reader if any.

## Latency measurement

Record the device with an external microphone near the speaker and the key or screen. Input-to-sound latency is the
time from the key-click (or touch) transient to the onset of the event one-shot. One-shots start at
`Tone.immediate()`, so expected latency is the AudioContext output latency plus one render quantum.
