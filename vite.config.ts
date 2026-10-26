import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = 
    env.PDF_Parser || 
    env.PDF_PARSER || 
    env.VITE_PDF_PARSER || 
    env.VITE_GEMINI_API_KEY || 
    process.env.PDF_Parser || 
    process.env.PDF_PARSER || 
    'AQ.Ab8RN6IyREuG3Byw10B0La598MTc_8xAMNzQ2c6xs2mosvgfoA';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.PDF_Parser': JSON.stringify(apiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey),
      'process.env.PDF_Parser': JSON.stringify(apiKey),
    },
  };
});
