# Eltru Cubicle Configurator — Complete System

## What This Is

Full-stack cubicle configurator eliminating information loss across client → sales → production → installation. Customers configure cubicles online, salespeople create custom quote links, and the Odoo integration (via OpenClaw agent) pulls structured data directly into the ERP.

## Live URL

https://eltru-cubicle-configurator-production.up.railway.app

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **PDF Generation:** Puppeteer Core + `@sparticuz/chromium` (Linux/Railway), system Chrome (macOS dev)
- **Email:** Resend SDK (`lib/email.js`) — falls back to console.log if `RESEND_API_KEY` not set
- **Frontend:** Vanilla HTML/CSS/JS (served as static files)
- **Deployment:** Railway (auto-deploy from GitHub)

## All Pages

| URL | Description | Auth |
|---|---|---|
| `/` or `/index.html` | Public configurator (client-facing) | None |
| `/embed.html` | Iframe-embeddable configurator (passes params through) | None |
| `/quote.html?token=XXX` | Client quote view (salesperson-shared link) | Token |
| `/sales.html` | Salesperson tool — load configs, create quotes, email clients | SALES_PASSWORD |
| `/admin.html` | Admin panel — layers, pricing, configs, products | ADMIN_PASSWORD |
| `/pdf-template.html` | PDF generation template (internal, used by Puppeteer) | None |
| `/404.html` | Not found page | None |

## All API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | None | Health check |
| GET | /api/options | None | All product options in one call |
| GET | /api/layers | None | Layer image lookup (bulk or single) |
| GET | /api/embed/code | None | Returns iframe embed snippet |
| POST | /api/auth/sales | None | Sales password verification |
| POST | /api/auth/admin | None | Admin password verification |
| POST | /api/configs | None | Save config (fires email, validates input) |
| GET | /api/configs/:code | None | Load config by code (enriched) |
| POST | /api/quotes | None | Create a quote link |
| GET | /api/quotes/:token | None | Load quote by token |
| POST | /api/quotes/:token/accept | None | Client accepts quote (fires email) |
| POST | /api/quotes/:token/send-email | None | Email quote link to a recipient |
| POST | /api/pdf | None | Generate and return PDF binary |
| GET | /api/pdf/download/:code | None | Direct PDF download URL (for Odoo notes) |
| GET | /api/sales/recent | SALES_PASSWORD | Recent configs for sales dashboard |
| GET | /api/admin/layers | ADMIN_PASSWORD | List all layer assets |
| POST | /api/admin/layers/upload | ADMIN_PASSWORD | Upload layer image to Supabase Storage |
| DELETE | /api/admin/layers/:id | ADMIN_PASSWORD | Delete layer asset |
| POST | /api/admin/layers | ADMIN_PASSWORD | Legacy JSON-based layer insert |
| GET | /api/admin/configs | ADMIN_PASSWORD | All configurations |
| GET | /api/admin/pricing | ADMIN_PASSWORD | All pricing rows |
| PUT | /api/admin/pricing/:id | ADMIN_PASSWORD | Update pricing row |
| GET | /api/odoo/config/:code | ADMIN_PASSWORD | Structured config payload for Odoo |
| GET | /api/odoo/quote/:token | ADMIN_PASSWORD | Structured quote payload for Odoo |

## Rate Limits

| Route | Window | Max |
|---|---|---|
| POST /api/configs | 1 hour | 10 |
| POST /api/pdf + GET /api/pdf/download/* | 1 hour | 5 |
| POST /api/auth/* | 15 min | 10 |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (server only) |
| `SALES_PASSWORD` | Yes | Password for salesperson features |
| `ADMIN_PASSWORD` | Yes | Password for admin API routes + Odoo endpoints |
| `BASE_URL` | Yes | Full base URL (e.g. https://eltru-cubicle-configurator-production.up.railway.app) |
| `PORT` | No | Express port (default: 3000) |
| `RESEND_API_KEY` | No | Resend API key for transactional emails (falls back to console.log) |
| `ELTRU_EMAIL` | No | Internal notification address (default: hello@eltru.com) |

## Email System (`lib/email.js`)

Three exported functions — all non-blocking, errors logged but never thrown:

- `sendConfigSavedEmail(config)` — fires after config saved; sends to client (if email provided) + Eltru team
- `sendQuoteAcceptedEmail(quote, config)` — fires when client accepts; red "Action Needed" header to Eltru team
- `sendQuoteLinkEmail(quote, config, recipientEmail)` — called by POST /api/quotes/:token/send-email

Requires `RESEND_API_KEY` env var. Without it, logs `[EMAIL MOCK]` to console.

## Supabase Table Structure

### Lookup/Option Tables
- **brands** — cubicle brand options (sort_order, slug, name)
- **styles** — panel styles per brand (sort_order, slug, name, brand_id)
- **sizes** — cubicle size options (sort_order, slug, label, width_in, depth_in, style_id)
- **heights** — panel height options (sort_order, slug, label, height_in, brand_id)
- **fabrics** — fabric/color options (sort_order, slug, name, hex_color, description)
- **trims** — trim color options (sort_order, slug, name, hex_color)
- **glass_options** — glass panel options (sort_order, slug, name, description, l_shape_only)
- **pedestals** — pedestal/storage options (sort_order, slug, name, description, l_shape_only)

### Core Tables
- **layer_assets** — PNG/WebP image layers for visual configurator
- **pricing** — pricing rules per option combination
- **configurations** — saved cubicle configurations

  Key columns: `id`, `config_code`, `brand_id`, `style_id`, `size_id`, `height_id`, `height_id_2`, `fabric_id`, `trim_id`, `glass_id`, `pedestal_id`, `base_price_usd`, `total_price_usd`, `outlet_count`, `harness_count`, `monitor_arm`, `quantity`, `client_name`, `client_email`, `client_company`, `notes`, `created_at`, `created_by`, `session_id` (used for referral source tracking)

- **quote_links** — salesperson-generated shareable quote links

  Key columns: `id`, `link_token`, `config_id`, `salesperson`, `custom_price_usd`, `discount_pct`, `notes_internal`, `notes_client`, `expires_at`, `viewed_at`, `view_count`, `is_active`, `accepted_at`, `created_at`

- **pdf_exports** — log of generated PDFs

## How to Add a New Brand/Model

1. Add brand row to Supabase `brands` table
2. Add style rows to `styles` table (with `brand_id`)
3. Add size rows to `sizes` table (with `style_id`)
4. Add height rows to `heights` table (with `brand_id`)
5. Add pricing rows to `pricing` table for the base configuration
6. Upload layer images via **admin.html → Layer Assets tab**
7. Set pricing via **admin.html → Pricing tab**

## How to Update Pricing

Admin panel → Pricing tab → click any price → edit inline → Enter or ✓

## URL Params for Direct Linking

| Param | Effect |
|---|---|
| `?config=ELT-XXXX` | Load and display a saved configuration |
| `?brand=knoll-reff` | Pre-select brand on load |
| `?style=straight` | Pre-select style (requires `?brand=`) |
| `?ref=facebook` | Store referral source in `session_id` field |
| `?token=XXXX` | Redirect to quote.html with that token |
| `?embed=1` | Hide header, show "Powered by Eltru" footer |

## Embeddable Configurator

Direct link: `https://eltru-cubicle-configurator-production.up.railway.app/embed.html`

Iframe embed:
```html
<iframe src="https://eltru-cubicle-configurator-production.up.railway.app/embed.html"
  width="100%" height="800" frameborder="0"
  style="border-radius:12px;border:1px solid #E0DCD4;"></iframe>
```

Pre-select a product:
```
/embed.html?brand=knoll-reff&style=straight
```

Track source (saved in session_id):
```
/?ref=facebook&brand=knoll-reff
```

## Odoo / OpenClaw Integration

### How it works

1. Salesperson creates a configuration in the configurator
2. Config code (e.g. `ELT-K7MN`) is pasted into Odoo order notes
3. OpenClaw agent reads the config code (regex: `ELT-[A-Z0-9]{4}`)
4. Agent calls `GET /api/odoo/config/{code}` with `Authorization: {ADMIN_PASSWORD}`
5. Uses the structured JSON response to populate Odoo:

| API field | Odoo field |
|---|---|
| `odoo_product_name` | Product name |
| `odoo_description` | Order line description |
| `odoo_internal_notes` | Internal notes |
| `line_items[0].unit_price` | Unit price |
| `line_items[0].quantity` | Quantity |
| `client.name` / `.email` / `.company` | Customer fields |
| `pdf_url` | Attach to order for installer |

### If quote was sent

Use `GET /api/odoo/quote/{token}` instead — includes `custom_price`, `salesperson`, `accepted_at`.

### PDF URL for installer

`GET /api/pdf/download/{code}` — direct URL, no POST needed. Include in Odoo order notes.

## How to Run Locally

```bash
npm install
cp .env.example .env
# Edit .env with Supabase credentials
node server.js
```

Server runs on PORT from `.env` (default 3000).

## 6-Session Build Plan

| Session | Focus | Status |
|---|---|---|
| 1 | Project foundation — Express server, Supabase client, routes, config codes | ✓ Done |
| 2 | Supabase integration — full CRUD for configs and quotes, option lookups | ✓ Done |
| 3 | PDF generation — Puppeteer, quote PDF layout | ✓ Done |
| 4 | Frontend configurator — layer-based visual builder (canvas/img layers) | ✓ Done |
| 5 | Client capture (Step 9), Resend email, PDF polish, rate limiting, admin improvements | ✓ Done |
| 6 | Odoo integration, embed link, mobile polish, production hardening | ✓ Done |

## What to Do Next

1. **Upload real layer images** — Use admin.html → Layer Assets tab to upload WebP layers for each brand/style/fabric combination
2. **Set up Resend** — Add `RESEND_API_KEY` to Railway Variables, set `ELTRU_EMAIL` to your team's address
3. **Configure OpenClaw** — Point the agent at `GET /api/odoo/config/{code}` with the `ADMIN_PASSWORD` in the Authorization header
4. **Add Facebook Marketplace links** — Use `/?ref=facebook&brand=knoll-reff` to track which listings drive configs
5. **Test with real clients** — Run through the full 9-step flow, confirm emails arrive, PDF downloads correctly
