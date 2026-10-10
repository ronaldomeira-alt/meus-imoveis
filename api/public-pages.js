import { handlePublicPages, handlePublicPageHtml } from './_shared/public-pages.js';

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.has('token') || url.searchParams.has('id')) {
    return handlePublicPageHtml(req, res);
  }
  return handlePublicPages(req, res);
}
