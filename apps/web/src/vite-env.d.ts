/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_USE_MSW: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
