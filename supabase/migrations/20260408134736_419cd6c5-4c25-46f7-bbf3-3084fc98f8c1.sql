-- Phase 4B2B: Simplify clients unique key to code only
-- Business decision: store_code is not a uniqueness dimension for this application.
-- clients.code is already 100% unique across all 4526 records.

-- Drop redundant composite indexes
DROP INDEX IF EXISTS clients_code_store_unique;
DROP INDEX IF EXISTS idx_clients_code_store;

-- clients_code_key UNIQUE(code) is kept as the official unique constraint.
-- idx_clients_cnpj, idx_clients_esn_id, idx_clients_gsn_id, idx_clients_unit_id are kept.