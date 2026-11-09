# Deployment notes (Render backend + Vercel frontend)

One frontend project serves TWO sites, chosen by hostname:
- PUBLIC site  (parents/students)  -> https://YOUR-DOMAIN.com
- STAFF site   (teachers)          -> https://staff.YOUR-DOMAIN.com

## Vercel (frontend) – environment variables
See `frontend/.env.example`. Required: `VITE_API_URL`, `VITE_PUBLIC_HOSTS`.
Add domains in Vercel -> Settings -> Domains: `YOUR-DOMAIN.com`, `www.YOUR-DOMAIN.com`, `staff.YOUR-DOMAIN.com`.
Cloudflare DNS: set those records to "DNS only" (grey cloud), using the values Vercel shows.

## Render (backend) – environment variables
See `backend/.env.example`. New/changed: `FRONTEND_URL` (staff site URL) and `ALLOWED_ORIGINS`
(public + www + staff URLs, comma-separated, no trailing slash). The database migration
(new `audience` column on announcements) runs automatically on start (`npm start`).

## Before the domain exists
Open `https://YOUR-PROJECT.vercel.app/?site=public` to preview the public site (this browser tab only).
Open `?site=staff` to switch back. The plain `.vercel.app` address stays the STAFF site.
