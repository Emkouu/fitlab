-- A declined card can be retried, and ECOMM refuses a second attempt on a spent
-- trans_id — so a retry registers a fresh transaction and resets Payment.ecomm*.
-- Without somewhere to put the superseded attempt its response fields would be
-- lost, and the acquirer requires every response to be preserved for every card
-- payment (integration manual §4.2).
ALTER TABLE "Payment" ADD COLUMN     "ecommHistory" JSONB;
