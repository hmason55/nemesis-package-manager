-- NULL preserves administrator-only recovery for older/moderator withdrawals.
ALTER TABLE submissions ADD COLUMN withdrawn_by INTEGER;
