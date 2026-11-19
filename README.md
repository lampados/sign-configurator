# Ciao, a WYSIWYG Sign Configurator

Design a 3D light sign in the browser: type a word, pick a font and a size, then download the STL
files to print it yourself or send a request. Live at [ciao.lighting](https://ciao.lighting).

## WLED

The signs are driven by ESP32 controllers running [WLED](https://kno.wled.ge/), the open-source
firmware for addressable LEDs: colours and effects are set from the WLED interface. Ciao is an
independent project and is not affiliated with or endorsed by WLED.

## Run it locally

You need [Node.js](https://nodejs.org/) 22 or newer and git.

```
git clone https://github.com/lampados/sign-configurator.git
cd sign-configurator
npm install
npm run dev
```

`npm run dev` prints a local address (usually `http://localhost:5173/`): open it and the
configurator is there, with live reload while you edit. Everything runs in the browser; no server
or account is needed.

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm run build` | Type check, then build every page into `dist/` |
| `npm run build:public` | Build only the pages that go online (`index.html`, `parts.html`) |
| `npm run preview` | Serve the built `dist/` locally, under `/sign-configurator/` |
| `npm test` | Unit tests (`vitest`) |
| `npm run check` | Everything before a pull request: types, unit tests, build, browser tests |

The browser tests use Playwright. Install its browser once:

```
npx playwright install chromium
```

Pages: `index.html` is the configurator, `parts.html` the open parts list. `bend-test.html` (test
pieces for the LED strip) and `spec.html` (the specification, from `SPEC.md`) are for local use.

### Optional features

A local copy only offers "Download STL". The "Send request" button, the download counters and the
"Offer me a coffee" link are off until you configure them: copy `.env.example` to `.env.local` and
fill it in. `.env.example` explains each variable; SPEC §14–16 describes how they work and what a
hosted copy needs.

## License
GPL-3.0-or-later. Fonts in `public/fonts` keep their own licenses.