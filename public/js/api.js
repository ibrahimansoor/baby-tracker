// Thin fetch wrapper for the server API.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
  get offline() { return this.status === 0; }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'pomodoro' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "You're offline — changes are saved on this phone and will sync later");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const put = (p, b) => api('PUT', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const del = (p, b) => api('DELETE', p, b);
