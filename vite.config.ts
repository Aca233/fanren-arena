import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : '/'

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@ecs':        resolve(__dirname, 'src/ecs'),
      '@components': resolve(__dirname, 'src/components'),
      '@systems':    resolve(__dirname, 'src/systems'),
      '@schemas':    resolve(__dirname, 'src/schemas'),
      '@artifacts':  resolve(__dirname, 'src/artifacts'),
      '@store':      resolve(__dirname, 'src/store'),
      '@ui':         resolve(__dirname, 'src/ui'),
      '@physics':    resolve(__dirname, 'src/physics'),
      '@ai':         resolve(__dirname, 'src/ai'),
      '@vfx':        resolve(__dirname, 'src/vfx'),
    },
  },
})
