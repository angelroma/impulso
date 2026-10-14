BEGIN;

-- Finance operations remain behind the authenticated TypeScript service.
GRANT USAGE ON SCHEMA finance TO impulso_backend;
GRANT SELECT, INSERT ON TABLE
    finance.books,
    finance.book_access,
    finance.accounts,
    finance.transactions
TO impulso_backend;

-- Native row locks need UPDATE on one column, without granting business-field edits.
GRANT UPDATE (updated_at) ON TABLE finance.books, finance.accounts TO impulso_backend;
GRANT UPDATE (granted_at) ON TABLE finance.book_access TO impulso_backend;

COMMIT;
