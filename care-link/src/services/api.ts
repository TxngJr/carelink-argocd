import { API_BASE_URL } from '@/constants/config';

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request(method: string, path: string, token?: string, body?: any) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('การเชื่อมต่อขัดข้อง กรุณาตรวจสอบอินเทอร์เน็ต');
  }

  const json = await response.json().catch(() => null);
  if (!json) {
    throw new ApiError('รูปแบบข้อมูลจากระบบไม่ถูกต้อง', response.status);
  }
  if (!response.ok || !json.success) {
    throw new ApiError(json.error?.message || json.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ', response.status);
  }

  return json.data;
}

export const api = {
  register: (data: { display_name: string; phone: string; birth_date: string; password: string }) =>
    request('POST', '/api/mobile/auth/register', undefined, data),

  login: (username: string, password: string) => 
    request('POST', '/api/mobile/auth/login', undefined, { username, password }),
  
  getJourney: (token: string) =>
    request('GET', '/api/mobile/journey/current', token),

  getMe: (token: string) =>
    request('GET', '/api/mobile/me', token),

  getNotifications: (token: string) =>
    request('GET', '/api/mobile/notifications', token),

  markNotificationRead: (token: string, id: string) =>
    request('PATCH', `/api/mobile/notifications/${id}/read`, token),

  createAppointmentRequest: (token: string, data: AppointmentSubmission) =>
    request('POST', '/api/mobile/appointment-requests', token, data),

  getCurrentAppointmentRequest: (token: string) =>
    request('GET', '/api/mobile/appointment-requests/current', token),

  updateAppointmentRequest: (token: string, id: string, data: AppointmentSubmission) =>
    request('PATCH', `/api/mobile/appointment-requests/${id}`, token, data),

  cancelAppointmentRequest: (token: string, id: string, reason = '') =>
    request('POST', `/api/mobile/appointment-requests/${id}/cancel`, token, { reason }),

  reportArrival: (token: string, id: string) =>
    request('POST', `/api/mobile/appointment-requests/${id}/report-arrival`, token),

};

export type AppointmentSubmission = {
  chief_complaint: string;
  measurements: {
    height_cm?: number;
    weight_kg?: number;
    sbp?: number;
    dbp?: number;
    spo2?: number;
  };
};
