import { handlePublicPageHtml } from './shared/public-pages.js';

export default function handler(req, res) {
  return handlePublicPageHtml(req, res);
}
