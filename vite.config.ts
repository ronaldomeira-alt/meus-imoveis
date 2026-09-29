import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Connect } from 'vite'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const publicApi = require('./api/_shared/public-pages.js') as {
  handlePublicPages: Connect.NextHandleFunction
  handlePublicPageHtml: Connect.NextHandleFunction
}
const mediaApi = require('./api/_shared/media.js') as {
  handleMedia: Connect.NextHandleFunction
}
const matchesApi = require('./api/_shared/matches.js') as {
  handleMatches: Connect.NextHandleFunction
}
const propertyLifecycleApi = require('./api/_shared/property-lifecycle.js') as {
  handlePropertyDeletion: Connect.NextHandleFunction
}
const instagramImportApi = require('./api/_shared/instagram-import.js') as {
  handleInstagramImport: Connect.NextHandleFunction
}

const publicPagesPlugin = {
  name: 'local-public-property-pages',
  configureServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use('/api/public-pages', publicApi.handlePublicPages)
    server.middlewares.use('/api/media', mediaApi.handleMedia)
    server.middlewares.use('/api/matches', matchesApi.handleMatches)
    server.middlewares.use('/api/property-lifecycle', propertyLifecycleApi.handlePropertyDeletion)
    server.middlewares.use('/api/instagram-import', instagramImportApi.handleInstagramImport)
    server.middlewares.use('/imovel', (req, res, next) => {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const match = parsedUrl.pathname.match(/^\/([a-zA-Z0-9_-]+)/);
      if (!match) return next();
      parsedUrl.searchParams.set('id', match[1]);
      req.url = `${parsedUrl.pathname}?${parsedUrl.searchParams.toString()}`;
      return publicApi.handlePublicPageHtml(req, res, next);
    })
  },
  configurePreviewServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use('/api/public-pages', publicApi.handlePublicPages)
    server.middlewares.use('/api/media', mediaApi.handleMedia)
    server.middlewares.use('/api/matches', matchesApi.handleMatches)
    server.middlewares.use('/api/property-lifecycle', propertyLifecycleApi.handlePropertyDeletion)
    server.middlewares.use('/api/instagram-import', instagramImportApi.handleInstagramImport)
    server.middlewares.use('/imovel', (req, res, next) => {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const match = parsedUrl.pathname.match(/^\/([a-zA-Z0-9_-]+)/);
      if (!match) return next();
      parsedUrl.searchParams.set('id', match[1]);
      req.url = `${parsedUrl.pathname}?${parsedUrl.searchParams.toString()}`;
      return publicApi.handlePublicPageHtml(req, res, next);
    })
  },
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const env = loadEnv(mode, process.cwd(), '')
  process.env.VITE_SUPABASE_URL ||= env.VITE_SUPABASE_URL
  process.env.VITE_SUPABASE_ANON_KEY ||= env.VITE_SUPABASE_ANON_KEY
  process.env.SUPABASE_URL ||= env.SUPABASE_URL || env.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY
  process.env.APIFY_API_TOKEN ||= env.APIFY_API_TOKEN

  process.env.PUBLIC_PROPERTIES_ADMIN_TOKEN ||= env.PUBLIC_PROPERTIES_ADMIN_TOKEN
  process.env.PUBLIC_CONTACT_WHATSAPP ||= env.PUBLIC_CONTACT_WHATSAPP
  process.env.R2_ACCOUNT_ID ||= env.R2_ACCOUNT_ID
  process.env.R2_BUCKET_NAME ||= env.R2_BUCKET_NAME
  process.env.R2_PUBLIC_URL ||= env.R2_PUBLIC_URL
  process.env.VITE_R2_PUBLIC_URL ||= env.VITE_R2_PUBLIC_URL
  process.env.R2_ACCESS_KEY_ID ||= env.R2_ACCESS_KEY_ID
  process.env.R2_SECRET_ACCESS_KEY ||= env.R2_SECRET_ACCESS_KEY
  process.env.MEUS_IMOVEIS_ACCOUNT_ID ||= env.MEUS_IMOVEIS_ACCOUNT_ID
  process.env.MATCH_CANONICAL_ACCOUNT_ID ||= env.MATCH_CANONICAL_ACCOUNT_ID
  return {
    plugins: [react(), publicPagesPlugin],
    server: {
      port: 3001,
      host: true,
    },
  }
})
