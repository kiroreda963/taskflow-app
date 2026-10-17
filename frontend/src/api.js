const TOKEN_KEY = 'taskflow.token';

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth.token) onUnauthorized();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const tz = () => new Date().getTimezoneOffset();

export const api = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (email, password) => request('POST', '/auth/register', { email, password }),
  listTasks: () => request('GET', '/tasks'),
  createTask: (task) => request('POST', '/tasks', task),
  updateTask: (id, patch) => request('PATCH', `/tasks/${id}`, patch),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),
  activeTimer: () => request('GET', '/timer'),
  startTimer: (taskId) => request('POST', '/timer/start', { taskId }),
  stopTimer: () => request('POST', '/timer/stop'),
  plan: (minutes) => request('GET', `/plan?minutes=${minutes}&tzOffset=${tz()}`),
  stats: (days = 7) => request('GET', `/stats?days=${days}&tzOffset=${tz()}`),
};
