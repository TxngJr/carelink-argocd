const API = process.env.CARELINK_API_URL || 'http://localhost:8080/api'

async function request(path, { method = 'GET', token, body, expected } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await response.json()
  if (expected) {
    if (response.status !== expected) throw new Error(`${path}: expected ${expected}, got ${response.status}`)
    return json
  }
  if (!response.ok || !json.success) {
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(json)}`)
  }
  return json.data
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

await request('/dev/seed', { method: 'POST' })
const nurse = (await request('/auth/login', {
  method: 'POST',
  body: { username: 'nurse', password: 'password123' },
})).token
const doctor = (await request('/auth/login', {
  method: 'POST',
  body: { username: 'doctor', password: 'password123' },
})).token

async function finishStation(code, token) {
  const called = await request(`/stations/${code}/call-next`, { method: 'POST', token })
  const item = called.queue_item
  await request(`/stations/${code}/queue/${item.id}/start`, { method: 'POST', token })
  return request(`/stations/${code}/queue/${item.id}/complete`, { method: 'POST', token })
}

async function runFlow(label, assignedPC, doctorRoute) {
  const phone = `06${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-8)}`
  const patient = await request('/mobile/auth/register', {
    method: 'POST',
    body: {
      display_name: `ผู้ป่วยทดสอบ ${label}`,
      phone,
      birth_date: '1990-01-01',
      password: 'password123',
    },
  })
  const token = patient.token
  const appointment = await request('/mobile/appointment-requests', {
    method: 'POST',
    token,
    body: {
      chief_complaint: `ทดสอบเส้นทาง ${label}`,
      measurements: { height_cm: 170, weight_kg: 65.5, sbp: 120, dbp: 80, spo2: 98 },
    },
  })
  await request('/mobile/appointment-requests', {
    method: 'POST',
    token,
    body: { chief_complaint: 'duplicate', measurements: {} },
    expected: 409,
  })
  const appointmentAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
  await request(`/nurse/appointment-requests/${appointment.id}/propose`, {
    method: 'POST', token: nurse, body: { appointment_at: appointmentAt },
  })
  await request(`/doctor/appointment-requests/${appointment.id}/confirm`, {
    method: 'POST',
    token: doctor,
    body: { appointment_at: appointmentAt, assigned_pc: assignedPC },
  })
  const firstArrival = await request(`/mobile/appointment-requests/${appointment.id}/report-arrival`, { method: 'POST', token })
  const secondArrival = await request(`/mobile/appointment-requests/${appointment.id}/report-arrival`, { method: 'POST', token })
  assert(firstArrival.id === secondArrival.id, `${label}: report-arrival is not idempotent`)
  const firstCheckin = await request(`/nurse/appointment-requests/${appointment.id}/confirm-checkin`, {
    method: 'POST', token: nurse,
  })
  const secondCheckin = await request(`/nurse/appointment-requests/${appointment.id}/confirm-checkin`, {
    method: 'POST', token: nurse,
  })
  assert(firstCheckin.encounter_id === secondCheckin.encounter_id, `${label}: check-in is not idempotent`)

  for (const station of ['NPR', 'EV', 'VM', 'MHT']) await finishStation(station, nurse)
  const calledPC = await request(`/stations/${assignedPC}/call-next`, { method: 'POST', token: doctor })
  const pcItem = calledPC.queue_item
  await request(`/stations/${assignedPC}/queue/${pcItem.id}/start`, { method: 'POST', token: doctor })
  await request(`/doctor/encounters/${firstCheckin.encounter_id}/route`, {
    method: 'POST',
    token: doctor,
    body: { station_codes: doctorRoute },
  })
  await request(`/stations/${assignedPC}/queue/${pcItem.id}/complete`, { method: 'POST', token: doctor })
  for (const station of doctorRoute) await finishStation(station, nurse)

  const current = await request('/mobile/appointment-requests/current', { token })
  assert(current.status === 'completed', `${label}: appointment did not complete`)
  assert(current.measurements.weight_kg === 65.5, `${label}: weight was not preserved`)
  console.log(`✓ ${label} completed (${assignedPC} → ${doctorRoute.join(' → ')})`)
}

await runFlow('ผู้ป่วยนอก', 'PC2', ['LAB', 'RC', 'PD', 'DH'])
await runFlow('รับไว้รักษา', 'PC', ['HA', 'IPW'])
console.log('CareLink acceptance passed')
