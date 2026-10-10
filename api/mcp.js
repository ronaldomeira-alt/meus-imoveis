import { handleMcpServer } from './_shared/mcp-server.js';

export default function handler(req, res) {
  return handleMcpServer(req, res);
}
