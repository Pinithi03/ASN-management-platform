# Keycloak — ASN Portal login

Keycloak 26.8.0 handles every login for the portal: about 500 suppliers and a few
internal admins. The backend never sees passwords; it only checks the signed token
Keycloak issues (that part comes in Phase 2).

| What | Where |
| --- | --- |
| Realm config (realm-as-code) | `docker/keycloak/realm-oniverse.json` |
| Keycloak's database | own `keycloak` database, created by `docker/postgres/02-keycloak-db.sh` |
| Compose service | `keycloak` in `docker-compose.yml` (dev tweaks in `docker-compose.override.yml`) |
| Public address | `<portal-host>/auth` through Nginx (`docker/nginx/nginx.conf`) |
| Dev test users | `scripts/seed_keycloak_dev.py` |

## What the realm contains

- **Realm** `oniverse`, self-registration off, "Forgot password" on.
- **Roles:** `ADMIN` (a few internal accounts, see everything) and `SUPPLIER` (own data only).
- **Clients:**
  - `ans-frontend`: public client for the React app; standard flow + PKCE S256 only;
    password grant and implicit flow off. Its tokens carry `aud: ans-backend`,
    `supplier_id` and `supplier_code`.
  - `ans-backend`: confidential client; its service account can manage users
    (`manage-users`, `view-users`, `query-users`) so the backend can onboard suppliers.
- **User attributes** `supplier_id`, `supplier_code`: admin-edit only, so a supplier
  can never change whose data they see.
- **Login flow** `browser-admin-otp`: users with role `ADMIN` must use a one-time code
  from an authenticator app (set up on first login); suppliers are never asked.
- **Policies:** password length 12 with upper/lower/digit/special, not username or
  email, last 3 not reused. Lockout after 5 failures (1 min, growing to 15 min).
  Access token 5 min, idle session 30 min, max session 8 h. Login and admin events
  kept 90 days.
- **No signing keys in the file.** Keycloak generates fresh keys on first start.

## First start (dev)

1. Copy `.env.example` to `.env` and fill in the Keycloak section
   (`openssl rand -base64 32` makes good secrets).
2. Start everything: `docker compose up -d` (or `make docker-up`).
   Keycloak takes about a minute; check with `docker compose ps` until it is `healthy`.
3. Create dev test users: `make keycloak-seed`
   (Windows without make: `python scripts/seed_keycloak_dev.py`).

Then:

| Page | Address | Login |
| --- | --- | --- |
| Keycloak admin console | http://localhost:8080/auth/admin | `KC_BOOTSTRAP_ADMIN_USERNAME` / `_PASSWORD` from `.env` |
| Account page (test a login) | http://localhost:8080/auth/realms/oniverse/account | `dev.admin` or a Partner ID, password `DevPassword#2026` |
| Mailpit (all dev emails) | http://localhost:8025 | none |

`dev.admin` is asked to scan a QR code with an authenticator app (Google Authenticator,
Microsoft Authenticator, etc.) on first login, exactly like real admins.

## Existing dev machine (Postgres volume already there)

Postgres init scripts only run on an empty volume, so create Keycloak's database once:

```
docker compose up -d postgres
make keycloak-db
# Windows without make:
docker compose exec -T postgres bash /docker-entrypoint-initdb.d/02-keycloak-db.sh
```

It is safe to run again; it skips what already exists. Then `docker compose up -d`.

## Changing the realm

`--import-realm` only creates the realm when it does not exist yet; it never updates
an existing one. So:

1. Make the change in the **dev** admin console and test it.
2. Copy the same change into `realm-oniverse.json` (or export the realm and compare),
   keeping the `${...}` placeholders and leaving out signing keys and users.
3. Review it in a pull request.
4. To see it in dev, recreate Keycloak's data:
   `docker compose exec -T postgres psql -U ans_user -d ans_platform -c "DROP DATABASE keycloak WITH (FORCE)"`
   then `make keycloak-db`, `docker compose restart keycloak`, `make keycloak-seed`.
5. Production: apply the same change in the admin console during a release
   (later: automate with `adorsys/keycloak-config-cli`).

## Production checklist (Keycloak part)

- [ ] `.env` has strong, unique values for every Keycloak secret; `KEYCLOAK_PUBLIC_URL`
      is `https://<portal-host>/auth` and `PORTAL_URL` is `https://<portal-host>`
- [ ] TLS on Nginx; ports 8080 and 9000 are not published (only the dev override publishes 8080)
- [ ] Office/VPN IP ranges set in the `/auth/admin/` block of `docker/nginx/nginx.conf`
- [ ] Named console admins created in the `master` realm with OTP; bootstrap admin deleted
- [ ] At least two portal `ADMIN` accounts in realm `oniverse`
- [ ] Realm SMTP tested from Realm settings → Email → Test connection
- [ ] Image tag kept current: Keycloak only fixes security bugs in its newest release
- [ ] `keycloak` database included in the nightly backup

## Email for Keycloak

Dev mail goes to Mailpit. For production, set the `KEYCLOAK_SMTP_*` values in `.env`
for the system mailbox **before the first start** (they are read when the realm is
imported). To change them later, use Realm settings → Email in the admin console.

- **Gmail (Google Workspace):** host `smtp.gmail.com`, port 587, STARTTLS `true`,
  auth `true`, user = the mailbox, secret = an app password (needs 2-Step Verification).
- **Outlook (Microsoft 365):** host `smtp.office365.com`, port 587, STARTTLS `true`.
  Password SMTP is being switched off by Microsoft, so use token (XOAUTH2) auth:
  in Realm settings → Email choose Authentication → Token, with token URL
  `https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/token`, scope
  `https://outlook.office365.com/.default`, and the client ID/secret of an app
  registration that has the Office 365 Exchange Online permission `SMTP.SendAsApp`.

## Security notes for the next phases

- The `ans-backend` service account can technically assign any realm role, including
  `ADMIN`. The backend's Keycloak client (Phase 4, `keycloak_admin.py`) must only ever
  assign `SUPPLIER`; admin accounts are created by hand in the console.
- Never commit `.env`, exported users, or exported signing keys.
- `seed_keycloak_dev.py` sets known passwords, so it refuses to run when
  `ENVIRONMENT=production` or when Keycloak is not on localhost.

## What was tested (5 Oct 2026, Keycloak 26.8.0)

- Realm imports cleanly from this file into an empty server; placeholders filled from env.
- Production mode (`start`) on PostgreSQL 16 behind `https://<host>/auth`: healthy,
  token issuer `https://<host>/auth/realms/oniverse`.
- Supplier first login forces a new password; token has role `SUPPLIER`, `supplier_id`,
  `supplier_code`, `aud: ans-backend`. Later logins: no OTP prompt.
- Admin first login forces authenticator setup; later logins ask for the code;
  a reused code is rejected.
- Backend service account can create, update, disable and delete supplier users and
  assign `SUPPLIER`; it cannot change realm settings.
- Compose health check, the Keycloak DB script (twice, plus missing-password case),
  Nginx config syntax, and the seed script (twice, plus production guard).

## Login theme (`ans-glass`)

The login pages use our own theme instead of Keycloak's built-in one: a dark
"network" photo background with a frosted-glass card.

| What | Where |
| --- | --- |
| Theme files | `docker/keycloak/themes/ans-glass/login/` |
| Mounted into the container at | `/opt/keycloak/themes` (read-only, see `docker-compose.yml`) |
| Turned on by | `"loginTheme": "ans-glass"` in `realm-oniverse.json` |

Inside the theme:

- `theme.properties` — must sit in the **`login/` folder**, not the theme root, or
  Keycloak ignores the whole file (you then get raw message keys like `loginTitle`
  and no stylesheet). It sets `parent=base`, loads the stylesheet, and maps
  Keycloak's `kc*` class hooks onto our class names.
- `template.ftl` — the page shell every login page shares: brand heading, glass
  card, language links, message banner.
- `login.ftl` — the sign-in page itself (username, password with a show/hide eye,
  remember me, forgot password).
- `resources/css/glass-style.css` — all the styling.
- `resources/images/network-bg.jpg` — the background.

Everything else in the login flow (one-time code, update password, verify email,
error pages) comes from Keycloak's `base` theme and is styled through the class
mapping in `theme.properties`. There is no file to write for those pages; if a new
one looks unstyled, find the `${properties.kc...Class!}` names it uses and map them.

### Setting it up on another machine

If you are starting from an **empty** Postgres volume, there is nothing to do —
`--import-realm` reads `realm-oniverse.json` and the theme is already selected.
Just `docker compose up -d` and open the portal.

If Keycloak's database **already exists** on your machine (the usual case), the
import is skipped (`Realm 'oniverse' already exists. Import skipped` in the log),
so the realm in your database still points at the old theme. Do this once:

```
git pull                                     # get docker/keycloak/themes/
docker compose up -d --force-recreate keycloak
docker exec ans-keycloak ls /opt/keycloak/themes      # must list: ans-glass
```

`--force-recreate` matters: a container started before the themes mount was added
keeps its old configuration, and Keycloak can only offer themes it can see on disk.

Then pick the theme, either in the admin console —
**Realm settings → Themes → Login theme → `ans-glass` → Save** — or from the CLI:

```
docker exec ans-keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080/auth --realm master \
  --user <KC_BOOTSTRAP_ADMIN_USERNAME> --password <KC_BOOTSTRAP_ADMIN_PASSWORD>
docker exec ans-keycloak /opt/keycloak/bin/kcadm.sh update realms/oniverse -s loginTheme=ans-glass
```

Open the portal and hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

### Editing the theme

In dev, save a file and refresh the browser. `docker-compose.override.yml` turns
theme and template caching off and mounts `/opt/keycloak/data/tmp` as a tmpfs, so
`docker compose restart keycloak` is enough for anything a refresh misses (a
`theme.properties` change, for example).

That tmpfs is not cosmetic. Keycloak pre-compresses theme resources into
`data/tmp/kc-gzip-cache` and keys each `.gz` by **path only** — the `?v=` on the
stylesheet is ignored. Once that cache is warm, every browser (they all send
`Accept-Encoding: gzip`) keeps getting the old file, while `curl` without
compression gets the new one, so the server looks fine from the terminal while the
page is visibly stale. The tmpfs is wiped on every container start. If you ever hit
this on a container without it:

```
docker exec ans-keycloak rm -rf /opt/keycloak/data/tmp/kc-gzip-cache
docker compose restart keycloak
```

To check what a browser really gets, ask for it compressed:

```
curl -s -H 'Accept-Encoding: gzip' \
  'http://localhost:8080/auth/resources/<ver>/login/ans-glass/css/glass-style.css' | gunzip -c | tail
```

### If it does not work

| Symptom | Cause |
| --- | --- |
| `ans-glass` missing from the Login theme dropdown | the container predates the themes mount — `docker compose up -d --force-recreate keycloak` |
| Page shows `loginTitle`, `doLogIn` instead of words | `theme.properties` is not in the `login/` folder |
| No background, plain white form | the stylesheet 404s — check `theme.properties` has `styles=css/glass-style.css` |
| Blank page | a FreeMarker error — `docker compose logs --tail=80 keycloak` |
| A CSS change does not show up, even after a hard refresh | the stale `kc-gzip-cache` above |
| Theme folder empty inside the container | Docker Desktop is not sharing the folder the repo is in (Settings → Resources → File sharing) |
