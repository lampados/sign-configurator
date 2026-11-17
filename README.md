# sign-configurator
a sign configurator


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

## License
GPL-3.0-or-later. Fonts in `public/fonts` keep their own licenses.