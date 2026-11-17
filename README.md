# CampusXchange

CampusXchange is a campus-only marketplace and Lost & Found website. Students can browse and publish second-hand items, report lost or found belongings, and manage their own posts.

## Recommended services and credentials

- **MySQL database**: use a managed MySQL instance (for example, Railway or Aiven). `DATABASE_URL` is the connection string supplied by the provider. Set `DATABASE_SSL=true` when your provider requires TLS.
- **Email delivery**: verification emails use Gmail SMTP. Enable 2-Step Verification on the Gmail account, create a Google App Password, then set `SMTP_USER` to that Gmail address, `SMTP_PASS` to the App Password, and `EMAIL_FROM` to `CampusXchange <same-gmail-address>` in `server/.env`. Use an App Password, not your regular Gmail password. Recipients are restricted to `@student.nitw.ac.in`.
- **Image storage**: use Cloudinary. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- **Authentication**: the server creates its own `JWT_SECRET`; set a long random value in production.

No payment provider or Google OAuth credentials are needed. Email verification is a one-time link sent to the student's institutional mailbox.

Listing cards open a detail view. Signed-in students can email the poster from there; poster email addresses are only returned by the authenticated contact endpoint and are not included in public listing results. Meet in a public place on campus.

## Run locally

Requirements: Node.js 20+ and a MySQL database.

1. Copy `server/.env.example` to `server/.env` and fill in the database, Gmail SMTP, and Cloudinary values.
2. Leave `VITE_API_URL` empty in `client/.env` for local development; Vite proxies `/api` requests to the local backend. From the project root run `npm install` (it installs both frontend and backend workspaces).
3. Run `npm run dev`. The web app is at `http://localhost:5173`; the API is at `http://localhost:4000`.
4. Register using an `@student.nitw.ac.in` email and click the link sent to that inbox.

The API creates its tables on startup. Keep `.env` files and all provider credentials out of Git.

For local feature testing without waiting for email verification, an opt-in verified test account is available. Set `NODE_ENV=development`, `DEV_TEST_USER_ENABLED=true`, `DEV_TEST_USER_EMAIL` to an unused `@student.nitw.ac.in` address, and `DEV_TEST_USER_PASSWORD` to a private password of at least 12 characters. Restart the API, then sign in through the normal form. It only creates the account if that email is unused and never changes an existing account. It is rejected unless `NODE_ENV=development`. Never enable it in production. This creates a regular test user, not an admin; the app currently has no admin role or dashboard.

## Deploy

GitHub is not automatically a host for the full application. GitHub Pages can serve the static frontend, but the Express API still needs a public Node.js host (for example, Render or Railway), plus the managed MySQL database and Cloudinary.

- Deploy `server/` as a Node.js web service. Configure the variables from `server/.env.example`; set `FRONTEND_URL` to the complete public frontend URL, including the repository subpath and trailing slash if applicable (for example, `https://OWNER.github.io/CAMPUSXCHANGE2/`), and set `WEB_ORIGIN` to the origin only (for example, `https://OWNER.github.io`).
- For GitHub Pages, build the Vite frontend with `VITE_API_URL` set to the public API origin (for example, `https://your-api.example.com`, without a trailing slash) and `VITE_BASE_PATH=/CAMPUSXCHANGE2/`. Replace the repository name in the base path if needed. The Pages site URL is normally `https://OWNER.github.io/CAMPUSXCHANGE2/`.
- The email verification link returns to the frontend URL with a `?token=...` query parameter; it does not depend on a `/verify` route, so it works with GitHub Pages repository paths.
- Provision MySQL and Cloudinary, set all deployment secrets in the hosting providers’ environment settings, and test email delivery before accepting real users.

## Scope and safety

The app does not process payments or provide chat. Students should arrange exchanges safely in public campus locations. Admin moderation and institutional identity-provider integration are not included in this starter.
