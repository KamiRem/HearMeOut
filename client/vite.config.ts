import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const proxy = {
  '/api': { target: 'http://127.0.0.1:3001' },
  '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
})
