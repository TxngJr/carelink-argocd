import { expect, test } from '@playwright/test'

type RoleCase = {
  username: string
  home: string
  expectedLinks: string[]
  forbidden: string
}

const CASES: RoleCase[] = [
  {
    username: 'admin',
    home: '/operations',
    expectedLinks: ['/operations', '/operations/insights', '/map', '/appointments', '/physician/appointments', '/registration', '/vitals', '/intake', '/physician', '/lab', '/pharmacy', '/infusion'],
    forbidden: '/patient',
  },
  {
    username: 'manager',
    home: '/operations',
    expectedLinks: ['/operations', '/operations/insights', '/map'],
    forbidden: '/appointments',
  },
  {
    username: 'operations',
    home: '/operations',
    expectedLinks: ['/operations', '/operations/insights', '/map'],
    forbidden: '/appointments',
  },
  {
    username: 'nurse',
    home: '/appointments',
    expectedLinks: ['/appointments', '/intake'],
    forbidden: '/registration',
  },
  {
    username: 'registration',
    home: '/registration',
    expectedLinks: ['/registration'],
    forbidden: '/vitals',
  },
  {
    username: 'vitals',
    home: '/vitals',
    expectedLinks: ['/vitals'],
    forbidden: '/intake',
  },
  {
    username: 'doctor',
    home: '/physician',
    expectedLinks: ['/physician', '/physician/appointments'],
    forbidden: '/appointments',
  },
  {
    username: 'lab',
    home: '/lab',
    expectedLinks: ['/lab'],
    forbidden: '/pharmacy',
  },
  {
    username: 'pharmacy',
    home: '/pharmacy',
    expectedLinks: ['/pharmacy'],
    forbidden: '/lab',
  },
  {
    username: 'infusion',
    home: '/infusion',
    expectedLinks: ['/infusion'],
    forbidden: '/pharmacy',
  },
]

async function developmentLogin(page: import('@playwright/test').Page, username: string) {
  const response = await page.request.post('/api/auth/development-login', { data: { username } })
  const payload = await response.json() as { success?: boolean; error?: { message?: string } }
  expect(response.ok(), payload.error?.message).toBe(true)
  expect(payload.success, payload.error?.message).toBe(true)
}

for (const roleCase of CASES) {
  test(`${roleCase.username} เห็นเฉพาะ navbar ของบทบาทและถูกส่งกลับเมื่อเปิดหน้าต้องห้าม`, async ({ page }) => {
    await page.context().clearCookies()
    await developmentLogin(page, roleCase.username)
    await page.goto(roleCase.home)
    await expect.poll(() => new URL(page.url()).pathname).toBe(roleCase.home)

    const navigation = page.getByRole('navigation', { name: 'เมนูหลัก' })
    await expect(navigation).toBeVisible()

    // TV/Kiosk remain public routes but are intentionally not staff navigation items.
    await expect(navigation.locator('a[href="/tv"]')).toHaveCount(0)
    await expect(navigation.locator('a[href="/kiosk"]')).toHaveCount(0)

    for (const href of roleCase.expectedLinks) {
      await expect(navigation.locator(`a[href="${href}"]`), `${roleCase.username} ควรเห็น ${href}`).toHaveCount(1)
    }

    if (roleCase.username !== 'admin') {
      await expect(navigation.locator(`a[href="${roleCase.forbidden}"]`), `${roleCase.username} ต้องไม่เห็น ${roleCase.forbidden}`).toHaveCount(0)
      await page.goto(roleCase.forbidden)
      await expect.poll(() => new URL(page.url()).pathname).toBe(roleCase.home)
      expect(new URL(page.url()).searchParams.get('ไม่อนุญาต')).toBe('1')
    }
  })
}

test('doctor ใช้หน้า confirm appointment ใต้ physician workspace เท่านั้น', async ({ page }) => {
  await developmentLogin(page, 'doctor')
  await page.goto('/physician/appointments')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/physician/appointments')
  await expect(page.getByRole('heading', { name: 'ยืนยันนัดผู้ป่วย' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'เมนูหลัก' })
  await expect(navigation.locator('a[href="/appointments"]')).toHaveCount(0)
  await expect(navigation.locator('a[href="/physician/appointments"]')).toHaveClass(/active/)
  await expect(navigation.locator('a[href="/physician"]')).not.toHaveClass(/active/)

  await page.goto('/appointments')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/physician')
})

test('API RBAC กันการเรียก endpoint ข้ามบทบาท', async ({ page }) => {
  await page.context().clearCookies()
  await developmentLogin(page, 'doctor')
  let response = await page.request.get('/api/nurse/appointment-requests')
  expect(response.status()).toBe(403)

  await page.context().clearCookies()
  await developmentLogin(page, 'nurse')
  response = await page.request.get('/api/doctor/appointment-requests')
  expect(response.status()).toBe(403)
  response = await page.request.post('/api/registration/patients', { data: {} })
  expect(response.status()).toBe(403)

  await page.context().clearCookies()
  await developmentLogin(page, 'manager')
  response = await page.request.get('/api/registration/patients?q=')
  expect(response.ok()).toBe(true)
  response = await page.request.post('/api/registration/patients', { data: {} })
  expect(response.status()).toBe(403)
  response = await page.request.post('/api/stations/MHT/call-next', { data: {} })
  expect(response.status()).toBe(403)
})

test('legacy aliases ใช้ guard เดียวกับ workspace ปัจจุบัน', async ({ page }) => {
  await developmentLogin(page, 'nurse')
  await page.goto('/nurse')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/intake')

  await page.context().clearCookies()
  await developmentLogin(page, 'doctor')
  await page.goto('/nurse')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/physician')

  await page.context().clearCookies()
  await developmentLogin(page, 'doctor')
  await page.goto('/doctor')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/physician')

  await page.context().clearCookies()
  await developmentLogin(page, 'nurse')
  await page.goto('/doctor')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/appointments')

  await page.context().clearCookies()
  await developmentLogin(page, 'infusion')
  await page.goto('/chemo')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/infusion')
})
