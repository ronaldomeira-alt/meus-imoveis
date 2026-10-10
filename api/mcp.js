import { handleMcpServer } from './_shared/mcp-server.js';

export default async function handler(req, res) {
  return await handleMcpServer(req, res);
}
