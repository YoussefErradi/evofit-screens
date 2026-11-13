export type Round = { id: number; name: string; readyCount: number };
export type Exercise = { id: string; position: number; title: string; instructions: string; videoUrl: string | null; enabled: boolean };
export type Screen = { id: string; name: string; roundId: number; roundName: string; paired: boolean; lastSeenAt: string | null };
export type Member = { id: string; fullName: string; phone: string; email: string; startsOn: string; expiresOn: string; notes: string; status: 'Active' | 'Renew soon' | 'Expired' | 'Upcoming' };
export type Dashboard = { today: string; timezone: string; operatingNow: boolean; opensAt: string; closesAt: string; openDays: string[]; readyExercises: number; totalExercises: number; pairedScreens: number; totalScreens: number; activeMembers: number; renewalsDue: number };
export type RotationDay = { cycleNumber: number; date: string; dayNumber: number; upperTitle: string; lowerTitle: string; upperVideoUrl?: string; lowerVideoUrl?: string };
export type Schedule = { cycles: { id: string; number: number; startDate: string; endDate: string }[]; days: RotationDay[] };
export type PlayerContent = { screenId: string; screenName: string; roundId: number; roundName: string; today: string; timezone: string; operatingNow: boolean; opensAt: string; closesAt: string; openDays: string[]; content: null | { dayNumber: number; cycleNumber: number; upper: { title: string; instructions: string; videoUrl: string }; lower: { title: string; instructions: string; videoUrl: string } } };

const adminKey = 'evofit-admin-session';
export const hasAdminSession = () => Boolean(sessionStorage.getItem(adminKey));
export const clearAdminSession = () => sessionStorage.removeItem(adminKey);

async function request<T>(path: string, init?: RequestInit, admin = true): Promise<T> {
  const headers = new Headers(init?.headers);
  if (admin) {
    const token = sessionStorage.getItem(adminKey);
    if (token) headers.set('X-Evofit-Admin', token);
  }
  const response = await fetch(`/api${path}`, { ...init, headers, credentials: 'omit' });
  if (!response.ok) {
    let reason = `${response.status} ${response.statusText}`;
    try { const body = await response.json(); reason = body.detail || body.message || body.error || reason; } catch { /* keep HTTP status */ }
    if (admin && response.status === 401) {
      clearAdminSession();
      window.dispatchEvent(new Event('evofit-auth-expired'));
    }
    throw new Error(`${response.status} ${reason}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  login: async (password: string) => {
    const result = await request<{ token: string }>('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }, false);
    sessionStorage.setItem(adminKey, result.token);
  },
  logout: async () => { try { await request('/admin/logout', { method: 'POST' }); } finally { clearAdminSession(); } },
  dashboard: () => request<Dashboard>('/dashboard'),
  rounds: () => request<Round[]>('/rounds'),
  createRound: (name: string) => request<{ roundId: number; screenId: string }>('/rounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }),
  exercises: (round: number) => request<Exercise[]>(`/rounds/${round}/exercises`),
  saveExercise: (id: string, data: Pick<Exercise, 'title' | 'instructions' | 'enabled'>) => request(`/exercises/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  uploadVideo: (id: string, file: File) => { const body = new FormData(); body.append('file', file); return request(`/exercises/${id}/video`, { method: 'POST', body }); },
  screens: () => request<Screen[]>('/screens'),
  createScreen: (name: string, roundId: number) => request<{ id: string; roundId: number }>('/screens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, roundId }) }),
  pairingCode: (id: string) => request<{ code: string; expiresAt: string }>(`/screens/${id}/pairing-code`, { method: 'POST' }),
  unpair: (id: string) => request(`/screens/${id}/unpair`, { method: 'POST' }),
  schedule: (round: number) => request<Schedule>(`/rounds/${round}/schedule`),
  prepareSchedule: (round: number) => request<Schedule>(`/rounds/${round}/schedule/prepare`, { method: 'POST' }),
  members: () => request<Member[]>('/members'),
  saveMember: (data: Omit<Member, 'id' | 'status'>, id?: string) => request(id ? `/members/${id}` : '/members', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  renew: (id: string, expiresOn: string) => request(`/members/${id}/renew`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresOn }) }),
  pairPlayer: (code: string) => request<{ token: string; roundId: number; name: string }>('/player/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }, false),
  playerContent: (token: string) => request<PlayerContent>('/player/content', { headers: { Authorization: `Bearer ${token}` } }, false),
};
