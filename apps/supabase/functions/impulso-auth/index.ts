import { authorizationAssets } from "./_generated/assets.ts";
import { authorizationConfiguration, createAuthorizationHandler } from "./handler.ts";

const configuration = authorizationConfiguration(
  Deno.env.get("IMPULSO_AUTH_ISSUER") ?? "",
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
);

Deno.serve(createAuthorizationHandler(configuration, authorizationAssets));
