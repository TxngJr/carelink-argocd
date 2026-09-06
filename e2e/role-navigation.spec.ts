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
    expectedLinks: ['/operations', '/operations/insights', '/map', '/appointments', '/registration', '/vitals', '/intake', '/physician', '/lab', '/pharmacy', '/infusion'],
    forbidden: '/patient',
  },
  {
    username: 'manager',
    home: '/operations',
    expectedLinks: ['/operations', '/operations/insights', '/map', '/appointments', '/registration', '/vitals', '/intake', '/infusion'],
    forbidden: '/physician',
  },
  {
    username: 'operations',
    home: '/operations',
    expectedLinks: ['/operations', '/operations/insights', '/map'],
    forbidden: '/appointments',
  },
  {
    username: 'nurse',
    home: '/intake',
    expectedLinks: ['/operations', '/map', '/appointments', '/registration', '/vitals', '/intake'],
    forbidden: '/lab',
  },
  {
    username: 'registration',
    home: '/registration',
    expectedLinks: ['/registration'],
    forbidden: '/operations',
  },
  {
    username: 'vitals',
    home: '/vitals',
    expectedLinks: ['/vitals'],
    forbidden: '/lab',
  },
  {
    username: 'doctor',
    home: '/physician',
    expectedLinks: ['/operations', '/map', '/appointments', '/physician'],
    forbidden: '/pharmacy',
  },
  {
    username: 'lab',
    home: '/lab',
    expectedLinks: ['/lab'],
    forbidden: '/operations',
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
  test(`${roleCase.username} เห็น navbar ตามสิทธิ์และถูกส่งกลับเมื่อเปิดหน้าต้องห้าม`, async ({ page }) => {
    await page.context().clearCookies()
    await developmentLogin(page, roleCase.username)
    await page.goto(roleCase.home)
    await expect.poll(() => new URL(page.url()).pathname).toBe(roleCase.home)

    const navigation = page.getByRole('navigation', { name: 'เมนูหลัก' })
    await expect(navigation).toBeVisible()
    await expect(navigation.locator('a[href="/tv"]')).toHaveCount(1)
    await expect(navigation.locator('a[href="/kiosk"]')).toHaveCount(1)
    for (const href of roleCase.expectedLinks) {
      await expect(navigation.locator(`a[href="${href}"]`), `${roleCase.username} ควรเห็น ${href}`).toHaveCount(1)
    }

    if (roleCase.username !== 'admin') {
      await page.goto(roleCase.forbidden)
      await expect.poll(() => new URL(page.url()).pathname).toBe(roleCase.home)
      expect(new URL(page.url()).searchParams.get('ไม่อนุญาต')).toBe('1')
    }
  })
}

test('legacy aliases ใช้ guard เดียวกับ workspace ปัจจุบัน', async ({ page }) => {
  await developmentLogin(page, 'doctor')
  await page.goto('/doctor')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/physician')

  await page.context().clearCookies()
  await developmentLogin(page, 'nurse')
  await page.goto('/doctor')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/intake')

  await page.context().clearCookies()
  await developmentLogin(page, 'infusion')
  await page.goto('/chemo')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/infusion')
})
