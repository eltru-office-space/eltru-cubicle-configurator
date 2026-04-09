-- Run this in the Supabase SQL editor BEFORE running db/seedPricing.js
-- Adds FK columns to pricing table to support per-size and per-option pricing

ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS size_id   UUID REFERENCES sizes(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS height_id UUID REFERENCES heights(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trim_id   UUID REFERENCES trims(id)   ON DELETE SET NULL;
