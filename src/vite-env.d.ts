/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENLAYER_CONTRACT_ADDRESS?: string;
  readonly VITE_GENLAYER_CHAIN?: "localnet" | "studionet" | "testnetAsimov";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
