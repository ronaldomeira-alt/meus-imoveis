import { handlePublicPages } from './shared/public-pages.js';

export default function handler(req, res) {
  return handlePublicPages(req, res);
}
