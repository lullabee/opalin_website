import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const SKIP = new Set(['node_modules', 'dist', 'public', 'scripts', 'src'])

const findPages = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
    .flatMap((e) => {
      const path = dir === '.' ? e.name : `${dir}/${e.name}`
      const here = readdirSync(path).includes('index.html') ? [[path, resolve(path, 'index.html')]] : []
      return [...here, ...findPages(path)]
    })

const pages = findPages('.')

const partials = () => ({
  name: 'partials',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      const expand = (s) =>
        s.replace(/<!--\s*@([\w-]+)\s*-->/g, (_, name) =>
          expand(readFileSync(resolve('src/site', `${name}.html`), 'utf8').trim()),
        )
      return expand(html)
    },
  },
})

export default defineConfig({
  plugins: [partials()],
  build: {
    rollupOptions: {
      input: Object.fromEntries([['main', resolve('index.html')], ...pages]),
    },
  },
})
