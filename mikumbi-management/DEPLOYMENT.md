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

## Joining Instructions (Form I)
Edit the full letter in Staff site -> Student Management -> Joining Instructions -> **Edit & Publish**,
press **Preview PDF**, then **Publish**. While published, editing is locked - press **Turn Off to Edit** first.
The Head Master's signature uploaded in Settings -> Signature & Stamp is placed on every Joining
Instruction automatically. The new `content` column on `joining_settings` is added automatically on start.

## Backend Docker image
Doc Tools has been removed, so the image no longer installs LibreOffice.

## Security notes
- Staff passwords: at least 8 characters with letters and numbers. 8 wrong passwords lock an
  account for 15 minutes (Head Master "Reset Password" in User Accounts unlocks it).
- Parents' Results login: 8 wrong phone numbers lock that student's online login for 30 minutes.
- Changing/resetting a password signs that person out everywhere else.
- Optional `DATA_ENCRYPTION_KEY` on Render (see backend/.env.example) encrypts stored secrets;
  without it JWT_SECRET is used. Never change it after setting it.
- IMPORTANT: the seed creates ONE account, admin/admin123 - change that password immediately.
