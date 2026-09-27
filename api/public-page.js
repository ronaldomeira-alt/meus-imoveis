import { handlePublicPageHtml } from './_shared/public-pages.js';

export default function handler(req, res) {
  return handlePublicPageHtml(req, res);
}
