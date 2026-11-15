import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  // относительная база: страница работает и на https://<user>.github.io/<repo>/, и локально, и из файла
  base: './',
  plugins: [react(), viteSingleFile()],
})
