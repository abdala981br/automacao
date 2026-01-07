import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ATENÇÃO: Se seu repo chama "vagas-bot", coloque base: "/vagas-bot/"
export default defineConfig({
  plugins: [react()],
  base: "/automacao/", 
})
