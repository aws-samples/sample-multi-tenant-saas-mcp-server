export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-auth-header',
};

export function setCorsHeaders(setHeader: (key: string, value: string) => void) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    setHeader(key, value);
  });
}
