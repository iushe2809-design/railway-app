# Railway Station Cleanliness AI Inspector — PRD

## Original Problem Statement
Build a web app for railway station cleanliness inspection. Station Masters upload multiple pictures daily; the app uses Claude AI vision to analyse photos and return Clean/Needs Attention/Unclean rating, score (0-100), area-by-area breakdown, issues, and recommendations. Executive reports: photo counts per day, station-wise station-found-clean/unclean breakdown with issue details. Filters by date and station, with selective station performance. View original photo for any issue. Inspectors can overrule the AI verdict. SM only uploads & submits. Analysis is admin-only. 100 SM user logins + 1 super admin (edit access). Dark navy theme, mobile-friendly, drag & drop upload. Public shareable upload link.

## Users & Roles
- **Super Admin** (single, seeded): full access — users, stations, share links, reports, override
- **Station Master (100 seeded)**: upload photos for own station, view own submissions only
- **Public uploader (anonymous)**: via tokenized `/share/:token` link

## Architecture
- **Frontend**: React (CRA, TanStack Query unused yet, sonner toasts, recharts, lucide-react, shadcn UI)
- **Backend**: FastAPI + Motor (MongoDB), JWT bearer auth
- **AI**: Claude Sonnet 4.5 (anthropic/claude-sonnet-4-5-20250929) via emergentintegrations + EMERGENT_LLM_KEY
- **Storage**: Emergent object storage via EMERGENT_LLM_KEY

## What's Been Implemented (Feb 2026 / Iteration 1)
- JWT auth, login by username
- 100 SM accounts + 1 admin seeded; 10 stations seeded
- Drag & drop multi-photo upload (SM portal + public link)
- AI vision analysis on every photo with structured rating, score, area breakdown, issues, recommendations
- Aggregate inspection score & rating
- Admin overview dashboard with KPIs, pie + bar charts, unclean alerts, recent inspections
- Inspections list with date/station/rating/search filters
- Inspection detail with photo modal viewer & per-photo override dialog
- Reports page (30-day default) with daily uploads chart, station score chart, breakdown table, unclean details, CSV export
- User management CRUD + activate/deactivate
- Station management CRUD
- Tokenized share links (create, copy, revoke) + `/share/:token` public upload page
- Dark navy theme, mobile-first layouts, Cabinet Grotesk + IBM Plex Sans

## Backlog / Next
**P0**
- Trend charts over longer time windows
- Bulk SM password reset & CSV import for SM accounts

**P1**
- Push notifications (e-mail/Telegram) to admins on Unclean ratings
- WhatsApp/email-share for share links
- Multi-photo lightbox swiper inside inspection detail
- Mobile camera capture button (capture="environment")
- Per-station SLA targets and red/yellow thresholds
- Two-factor auth for super admin

**P2**
- Inspection comparison (week-over-week)
- AI-recommended next-action assignments per zone
- Audit log export

## Test Credentials
- Admin: `admin` / `Admin@123`
- SM: `sm001` … `sm100` / `Station@123`
