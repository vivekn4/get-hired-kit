# ASSETS.md — get-hired-kit

## Images

| File | Source | License |
|---|---|---|
| `assets/banner.jpg` | AI-generated original for this project (three-zone dojo/roaster/command-center art, "GET HIRED KIT" title, "VN" badge) | Original — free to use with the project |
| `public/favicon.svg` | Hand-made "GHK" monogram, red/gold/cyan gradient | Original — free to use with the project |

## Audio

No audio files — **all SFX are synthesized live with the WebAudio API** in `public/js/app.js`:
gong (layered low sines), drum hit, crowd cheer (filtered noise swell), sad trombone (descending sawtooth),
fire crackle (random noise bursts), stamp thud, fanfare arpeggio, cha-ching, UI blips, zap, error sting.
Zero assets, zero licensing issues. Mute toggle persisted in `localStorage`.

## Fonts

System font stack only — no webfont downloads, works offline.

## Third-party services (all free)

| Service | Use | Key needed? |
|---|---|---|
| Google Gemini (OpenAI-compatible endpoint) | Interview questions, scoring, roasts, rewrites | User's own free key (`GEMINI_API_KEY`) |
| Gumroad | Pro license sales ($29) | Seller sets up product separately; optional access token |
| Render | Hosting | Free tier; keys set in dashboard |
