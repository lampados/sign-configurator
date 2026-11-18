# Ciao, a WYSIWYG Sign Configurator

Design a 3D light sign in the browser: type a word, pick a font and a size, then download the STL
files to print it yourself or send a request. Live at [ciao.lighting](https://ciao.lighting).

## WLED

The signs are driven by ESP32 controllers running [WLED](https://kno.wled.ge/), the open-source
firmware for addressable LEDs: colours and effects are set from the WLED interface. Ciao is an
independent project and is not affiliated with or endorsed by WLED.


## Download and request counters (optional)

The Order panel can show how many times **Download STL** and **Send request** have been used
(for example "123 downloads · 12 requests so far"). The counter is anonymous: one row per click with
its type and time, no IP address, no cookies, no personal data.

It is off until you connect a database:

1. In Cloudflare, create a D1 database (any name, for example `sign-stats`).
2. Open its console and run `migrations/0001_events.sql`.
3. In your Pages project go to Settings → Bindings, add a D1 binding named `STATS` that points to
   that database, then redeploy.

Without the `STATS` binding nothing is counted and the line never appears. Each total is shown only
from `STATS_MIN_SHOWN` (in `src/config.ts`, default 10) upwards. Endpoints: `POST /api/event`,
`GET /api/stats` (see SPEC §14). Totals per day:

```sql
SELECT substr(ts, 1, 10) AS day, type, COUNT(*) AS n FROM events GROUP BY day, type ORDER BY day DESC;
```

## Your shop behind "Send request" (optional)

"Send request" saves the design and takes the customer to the cart of a WooCommerce shop, where
they enter their contact and shipping details. The shop is not written in the code: it comes from two
build variables.

| Variable | Example | Meaning |
|---|---|---|
| `VITE_SHOP_URL` | `https://shop.example.com` | Address of the shop |
| `VITE_SHOP_PRODUCT_ID` | `123` | Generic product the design is attached to |

- On Cloudflare Pages: Settings → Variables and secrets, for both Production and Preview, then
  redeploy (they are read at build time).
- Locally: copy `.env.example` to `.env.local`.

Without them the "Send request" button does not appear and the page only offers "Download STL", so
a fork never sends its visitors to someone else's shop.

## A coffee for whoever runs the site (optional)

The page can invite visitors to support the project: a line under the name, and one under
"Download STL" for those who print the sign themselves. The link comes from one build variable,
set like the shop's.

| Variable | Example | Meaning |
|---|---|---|
| `VITE_SUPPORT_URL` | `https://ko-fi.com/yourname` | Your Ko-fi, Buy Me a Coffee or similar page |

Without it neither line appears. The Sponsor button of the repository is separate: it is set in
`.github/FUNDING.yml`.

## License
GPL-3.0-or-later. Fonts in `public/fonts` keep their own licenses.