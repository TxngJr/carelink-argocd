import { expect, test, type APIRequestContext } from '@playwright/test'

type Envelope<T> = { success: boolean; data: T; error?: { message?: string } }

async function data<T>(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  const payload = await response.json() as Envelope<T>
  expect(response.ok(), payload.error?.message).toBe(true)
  expect(payload.success, payload.error?.message).toBe(true)
  return payload.data
}

test('แพทย์สั่ง Infusion จนเจ้าหน้าที่ปล่อยเก้าอี้', async ({ playwright, baseURL }) => {
  const api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL || 'http://127.0.0.1:3000', 'Content-Type': 'application/json' },
  })
  const phone = `09${String(Date.now()).slice(-8)}`
  const password = 'demo1234'
  const post = <T>(path: string, body: unknown = {}) => api.post(`/api${path}`, { data: body }).then(data<T>)
  const get = <T>(path: string) => api.get(`/api${path}`).then(data<T>)
  const login = (username: string) => post('/auth/development-login', { username })

  await post('/mobile/auth/register', { display_name: 'ผู้ป่วยทดสอบ Infusion', phone, birth_date: '1990-01-01', password })
  const appointment = await post<{ id: string }>('/mobile/appointment-requests', { chief_complaint: 'ทดสอบเส้นทาง Infusion', measurements: {} })

  await login('nurse')
  const appointmentAt = new Date(Date.now() + 2 * 60_000).toISOString()
  await post(`/nurse/appointment-requests/${appointment.id}/propose`, { appointment_at: appointmentAt, note: 'ทดสอบ E2E' })
  await login('doctor')
  await post(`/doctor/appointment-requests/${appointment.id}/confirm`, { appointment_at: appointmentAt, assigned_pc: 'PC', note: 'ยืนยัน E2E' })

  await post('/mobile/auth/login', { username: phone, password })
  await post(`/mobile/appointment-requests/${appointment.id}/report-arrival`)
  await login('nurse')
  const checkedIn = await post<{ encounter_id: string }>(`/nurse/appointment-requests/${appointment.id}/confirm-checkin`)
  const encounterId = checkedIn.encounter_id

  async function advance(station: string, username: string) {
    await login(username)
    const queue = await get<{ items: Array<{ id: string; encounter_id: string; version: number }> }>(`/stations/${station}/queue`)
    const item = queue.items.find((row) => row.encounter_id === encounterId)
    expect(item, `ไม่พบคิว ${station}`).toBeTruthy()
    await post(`/stations/${station}/queue/${item!.id}/start`, { version: item!.version })
    const refreshed = await get<{ items: Array<{ id: string; encounter_id: string; version: number }> }>(`/stations/${station}/queue`)
    const started = refreshed.items.find((row) => row.encounter_id === encounterId)!
    await post(`/stations/${station}/queue/${started.id}/complete`, { version: started.version })
  }

  await advance('NPR', 'registration')
  await advance('EV', 'registration')
  await login('vitals')
  await post(`/vitals/${encounterId}`, { sbp: 120, dbp: 80, pulse: 72, temperature: 36.7, respiratory_rate: 18, spo2: 98, weight_kg: 65, height_cm: 170, pain_score: 0, notes: 'E2E' })
  await advance('VM', 'vitals')
  await login('nurse')
  await post(`/nurse/assessment/${encounterId}`, { chief_complaint: 'ทดสอบ', history_of_illness: '', triage_level: 'normal', is_urgent: false, is_fast_track: false, nurse_notes: 'E2E' })
  await advance('MHT', 'nurse')

  await login('doctor')
  const pcQueue = await get<{ items: Array<{ id: string; encounter_id: string; version: number }> }>('/stations/PC/queue')
  const pc = pcQueue.items.find((row) => row.encounter_id === encounterId)!
  await post(`/stations/PC/queue/${pc.id}/start`, { version: pc.version })
  const templates = await get<Array<{ id: string; code: string; name: string }>>('/infusion/templates')
  const hydration = templates.find((row) => row.code === 'HYDRATION_DEMO')!
  await post(`/doctor/encounters/${encounterId}/orders`, { items: [{ type: 'infusion', code: hydration.code, name: hydration.name, quantity: 1, status: 'ordered', service_template_id: hydration.id }] })
  await post(`/doctor/encounters/${encounterId}/route`, { station_codes: ['INFUSION', 'DH'] })
  const pcStarted = (await get<{ items: Array<{ id: string; encounter_id: string; version: number }> }>('/stations/PC/queue')).items.find((row) => row.encounter_id === encounterId)!
  await post(`/stations/PC/queue/${pcStarted.id}/complete`, { version: pcStarted.version })

  await login('infusion')
  const board = await get<{ chairs: Array<{ id: string; session?: unknown }>; queue: Array<{ id: string; encounter_id: string }> }>('/infusion/board')
  const chair = board.chairs.find((row) => !row.session)!
  const infusionQueue = board.queue.find((row) => row.encounter_id === encounterId)!
  let session = await post<{ id: string; version: number; phases: unknown[] }>(`/infusion/chairs/${chair.id}/call`, {
    queue_item_id: infusionQueue.id,
    override_reason: 'ทดสอบ E2E ด้วยข้อมูลสังเคราะห์',
  })
  for (let index = 0; index < session.phases.length; index++) {
    session = await post(`/infusion/sessions/${session.id}/start`, { version: session.version })
    session = await post(`/infusion/sessions/${session.id}/complete-phase`, { version: session.version, reason: 'จบก่อนเวลาเพื่อทดสอบ E2E' })
  }
  await post(`/infusion/sessions/${session.id}/complete`, { version: session.version, reason: 'ยืนยันจบ journey E2E' })
  const finalBoard = await get<{ chairs: Array<{ id: string; session?: unknown }> }>('/infusion/board')
  expect(finalBoard.chairs.find((row) => row.id === chair.id)?.session).toBeUndefined()
  await api.dispose()
})
