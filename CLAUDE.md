# Eltru Configurator — CLAUDE.md

## Project Purpose

The Eltru Configurator is a web-based cubicle configuration and quoting system for Eltru (eltru.com), an office furniture company. It allows customers or salespeople to configure cubicle setups (brand, style, size, fabric, trim, glass, pedestal, accessories) and generate shareable quote links and PDFs.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **PDF Generation:** Puppeteer Core + `@sparticuz/chromium` (Linux/Railway), system Chrome (macOS dev)
- **Email:** Resend SDK (`lib/email.js`) — falls back to console.log if `RESEND_API_KEY` not set
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Deployment:** Railway (auto-deploy from GitHub)

## How to Run

```bash
# Install dependencies
npm install

# Copy and fill in env vars
cp .env.example .env
# Edit .env with your Supabase credentials

# Start the server
node server.js
```

Server runs on PORT from `.env` (default 3000).

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. https://xxxx.supabase.co) |
| `SUPABASE_ANON_KEY` | Supabase anon/public key (safe for client-side) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-only, full DB access) |
| `SALES_PASSWORD` | Password for salesperson-facing features |
| `ADMIN_PASSWORD` | Password for admin API routes |
| `PORT` | Port to run Express on (default: 3000) |
| `BASE_URL` | Full base URL for generating share links (e.g. http://localhost:3000) |
| `RESEND_API_KEY` | Resend API key for transactional emails (optional — falls back to console.log) |
| `ELTRU_EMAIL` | Internal notification email address (default: hello@eltru.com) |

## Supabase Table Structure

### Lookup/Option Tables
- **brands** — cubicle brand options
- **styles** — panel styles per brand
- **sizes** — cubicle size options
- **heights** — panel height options
- **fabrics** — fabric/color options
- **trims** — trim color options
- **glass_options** — glass panel options
- **pedestals** — pedestal/storage options

### Core Tables
- **layer_assets** — PNG image layers for the visual configurator
- **pricing** — pricing rules per option combination
- **configurations** — saved cubicle configurations

  Key columns: `id`, `config_code`, `brand_id`, `style_id`, `size_id`, `height_id`, `height_id_2`, `fabric_id`, `trim_id`, `glass_id`, `pedestal_id`, `base_price_usd`, `total_price_usd`, `outlet_count`, `harness_count`, `monitor_arm`, `quantity`, `client_name`, `client_email`, `client_company`, `notes`, `created_at`, `created_by`, `session_id`

- **quote_links** — salesperson-generated shareable quote links

  Key columns: `id`, `link_token`, `config_id`, `salesperson`, `custom_price_usd`, `discount_pct`, `notes_internal`, `notes_client`, `expires_at`, `viewed_at`, `view_count`, `is_active`, `accepted_at`, `created_at`

- **pdf_exports** — log of generated PDFs

## API Routes

| Method | Path | Description |
|---|---|---|
| GET | /health | Health check |
| GET | /api/options | All product options in one call |
| GET | /api/layers | Layer image lookup (bulk or single) |
| POST | /api/configs | Save a new configuration (fires email) |
| GET | /api/configs/:code | Load config by code (enriched) |
| POST | /api/quotes | Create a quote link |
| GET | /api/quotes/:token | Load quote by token |
| POST | /api/quotes/:token/accept | Client accepts quote (fires email) |
| POST | /api/quotes/:token/send-email | Email quote link to a recipient |
| POST | /api/pdf | Generate and return PDF binary |
| POST | /api/auth/sales | Sales password check |
| POST | /api/auth/admin | Admin password check |
| GET | /api/admin/layers | List layer assets |
| POST | /api/admin/layers/upload | Upload layer image |
| DELETE | /api/admin/layers/:id | Delete layer asset |
| GET | /api/admin/configs | All configurations (admin) |
| GET | /api/admin/pricing | All pricing rows |
| PUT | /api/admin/pricing/:id | Update a pricing row |

## Rate Limits

| Route | Window | Max requests |
|---|---|---|
| POST /api/configs | 1 hour | 10 |
| POST /api/pdf | 1 hour | 5 |
| POST /api/auth/* | 15 min | 10 |

## Email System (`lib/email.js`)

Three exported functions, all non-blocking (errors logged, never thrown):

- `sendConfigSavedEmail(config)` — fires after config saved; sends to client (if email provided) and Eltru team
- `sendQuoteAcceptedEmail(quote, config)` — fires when client accepts quote; red "Action Needed" header to team
- `sendQuoteLinkEmail(quote, config, recipientEmail)` — called by `POST /api/quotes/:token/send-email`

All require `RESEND_API_KEY` env var. Without it, mocked to console.log.

## Config Codes

Config codes use the format `ELT-XXXX` where X is an uppercase letter or number, excluding ambiguous characters (0, O, I, 1). Example: `ELT-K7MN`.

## 6-Session Build Plan

| Session | Focus | Status |
|---|---|---|
| 1 | Project foundation — Express server, Supabase client, routes, config codes | ✓ Done |
| 2 | Supabase integration — full CRUD for configs and quotes, option lookups | ✓ Done |
| 3 | PDF generation — Puppeteer, quote PDF layout | ✓ Done |
| 4 | Frontend configurator — layer-based visual builder (canvas/img layers) | ✓ Done |
| 5 | Client capture (Step 9), Resend email, PDF polish, rate limiting, admin improvements | ✓ Done |
| 6 | Final polish, testing, deployment | — |

## Live URL

https://eltru-cubicle-configurator-production.up.railway.app
