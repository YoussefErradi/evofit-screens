# EvoFit Screens

A single-gym MVP for three portrait displays, exercise content, eight-day rotation, and subscription dates. Each paired display plays two silent exercise videos at once. Every round has 16 exercise slots; two appear on each operating day, with no repeat within the eight-day cycle. More rounds and displays can be added from the admin interface.

## Stack

- React 18, TypeScript, Vite 8; nginx serves the production build
- Java 21, Spring Boot 4, JDBC, PostgreSQL 16, Flyway
- Docker Compose for the local installation

## Run locally

1. Install Docker Desktop or a compatible Compose runtime.
2. Copy `.env.example` to `.env`. Replace **all three** placeholders with independent random values. For example, use `openssl rand -hex 32` for each value. Keep `.env` outside Git.
3. Run `docker compose up --build -d` and open `http://localhost:5173` for admin. Use the password from `EVOFIT_ADMIN_PASSWORD`.
4. On each TV, open `http://<host-LAN-IP>:5173/display`, generate a code from **Screens**, and enter it on the TV. Codes are valid for ten minutes and one use.

The API and database bind only to localhost. The web server is reachable on the local network for the TVs. **Use a trusted LAN; add HTTPS before remote admin access or entering real member data over an untrusted network.** Do not forward port 5173 to the internet. The temporary demo gateway in `scripts/` is for demonstration, not production remote access.

For frontend development, use Node.js 22.12+ and run `cd web && npm ci && npm run dev`. For backend development, use Java 21, Maven, PostgreSQL and the same environment variables as in `.env`.

## Admin workflow

1. In **Screens**, pair one display per TV. A new round creates 16 exercise slots and a display. Extra TVs can show an existing round.
2. In **Exercise content**, name every slot and upload an MP4 or WebM. The server checks the file container and caps uploads at 250 MB. Use media you own or have permission to show.
3. After all 16 enabled slots in a round have video, the API persists an eight-operating-day cycle. It prepares the following cycle on day eight. Existing cycle dates remain fixed if operating hours change.
4. In **Rotation**, review the generated dates and exercises. In **Members**, store a name, contact details, start date and expiry date, then renew by entering a later expiry.

The default operating calendar is Monday–Saturday, 06:00–22:00 in `Africa/Casablanca`. Set `EVOFIT_OPEN_DAYS`, `EVOFIT_OPEN_TIME`, and `EVOFIT_CLOSE_TIME` in `.env` for the gym. The player closes outside those hours.

The TV layout is portrait 9:16, with two videos stacked. A landscape TV browser can rotate the layout by −90° and request fullscreen. Verify video codec, simultaneous playback, orientation, and fullscreen on the actual TV before installation. The bundled sample clips are generated graphics for preview; they are not exercise content.

The display polls every 30 seconds. On a lost connection it may continue the current day's cached clips (up to 50 MB each) in browsers with service worker and Cache API support. It never advances to a new day's schedule while offline. The server and TV must reconnect for a new day, pairing changes, and fresh media. Test this behavior on the chosen TV browser.

## Security and operations

- Admin requests require a 12-hour in-memory session token sent in a custom header. The password is configured outside the repository. Signing out or restarting the API ends the session. Ten failed password attempts from an address are blocked for five minutes.
- Each display has its own random token stored as a hash in PostgreSQL. Its content request can read only its assigned round. Pairing attempts are limited to ten per address per ten minutes. Unpairing revokes the device token.
- Uploaded media needs a scoped HMAC link. Admin preview links last at most 30 minutes; display links at most 12 hours. Unpairing revokes display media access on the server. Cached copies may remain on a device until the end of the operating day.
- The browser app uses no authentication cookies. React escapes user text, SQL uses parameters, and nginx sends content-security, MIME, and referrer headers.
- PostgreSQL and uploaded media live in Docker volumes. Back up **both** with `scripts/backup.sh` and test a restore on a separate installation. Store encrypted backups away from the gym laptop. A backup passphrase file is required and must stay outside this repository.
- This is a **single-tenant** app. It has no separate gyms, staff roles, or audit log. Use one deployment per gym.

No attendance, round completion, heart rate, workout progress, or performance measurements are recorded.

## Checks

```sh
cd api && mvn test
cd ../web && npm ci && npm run build && npm audit --audit-level=high
node --check public/sw.js
```

CI runs the same checks. `docs/ENGINEERING_AUDIT.md` records what was reviewed, evidence, and remaining deployment checks.
