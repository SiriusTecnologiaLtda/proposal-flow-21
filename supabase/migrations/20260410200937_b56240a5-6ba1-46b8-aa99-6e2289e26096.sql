-- P3 fix: Close idempotency race condition with atomic unique constraint
-- Using (signature_id, payload_hash) to scope deduplication per envelope
CREATE UNIQUE INDEX IF NOT EXISTS uq_signature_events_dedup
ON public.signature_events (signature_id, payload_hash)
WHERE payload_hash IS NOT NULL;
