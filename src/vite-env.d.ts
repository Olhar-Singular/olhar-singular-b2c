/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  /** Mercado Pago public key of the SAME application as ACCESS_TOKEN_MP_PROD. */
  readonly VITE_MP_PUBLIC_KEY?: string;
  /** Google Tag Manager container id; absent = no analytics injected. */
  readonly VITE_GTM_ID?: string;
}
