-- Server-only role; login credentials are provisioned separately for each environment.
CREATE ROLE impulso_backend
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION BYPASSRLS;
