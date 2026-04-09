# Eltru Configurator — CLAUDE.md

## Project Purpose

The Eltru Configurator is a web-based cubicle configuration and quoting system for Eltru (eltru.com), an office furniture company. It allows customers or salespeople to configure cubicle setups (brand, style, size, fabric, trim, glass, pedestal, accessories) and generate shareable quote links and PDFs.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **PDF Generation:** Puppeteer (planned for Session 3)
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Deployment:** TBD

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
| POST | /api/configs | Save a new configuration |
| GET | /api/configs/:code | Load config by code |
| POST | /api/quotes | Create a quote link |
| GET | /api/quotes/:token | Load quote by token |
| POST | /api/pdf | Generate PDF |
| GET | /api/admin/layers | List layer assets |
| POST | /api/admin/layers | Add layer asset |
| GET | /api/admin/configs | Recent configurations |
| GET | /api/admin/pricing | All pricing rows |

## Config Codes

Config codes use the format `ELT-XXXX` where X is an uppercase letter or number, excluding ambiguous characters (0, O, I, 1). Example: `ELT-K7MN`.

## 6-Session Build Plan

| Session | Focus |
|---|---|
| 1 | Project foundation — Express server, Supabase client, routes, config codes |
| 2 | Supabase integration — full CRUD for configs and quotes, option lookups |
| 3 | PDF generation — Puppeteer, quote PDF layout |
| 4 | Frontend configurator — layer-based visual builder (canvas/img layers) |
| 5 | Admin panel — pricing management, layer asset uploads |
| 6 | Polish, testing, deployment |
