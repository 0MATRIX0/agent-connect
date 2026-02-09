const API_SERVER = process.env.API_SERVER_URL || 'http://localhost:3109';
const API_TOKEN = process.env.API_TOKEN || '';

export function getApiServer() {
  return API_SERVER;
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (API_TOKEN) {
    headers['Authorization'] = `Bearer ${API_TOKEN}`;
  }
  return headers;
}

export function apiHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = { ...getAuthHeaders() };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}
