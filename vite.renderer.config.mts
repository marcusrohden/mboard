import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { CSP_NONCE_PLACEHOLDER } from './src/shared/csp-nonce';

export default defineConfig({
  plugins: [react()],
  html: { cspNonce: CSP_NONCE_PLACEHOLDER },
});
