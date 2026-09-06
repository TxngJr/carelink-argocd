import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(dimensions.scrollWidth, `horizontal overflow: ${dimensions.scrollWidth}px > ${dimensions.clientWidth}px`).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

async function expectHealthyPage(page: Page, path: string, width: number, height: number) {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(path)
  await expect(page.locator('body')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  expect(pageErrors).toEqual([])
}

async function developmentLogin(page: Page, username: string) {
  const response = await page.request.post('/api/auth/development-login', { data: { username } })
  const payload = await response.json() as { success?: boolean; error?: { message?: string } }
  expect(response.ok(), payload.error?.message).toBe(true)
  expect(payload.success, payload.error?.message).toBe(true)
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 900 },
]) {
  for (const path of ['/', '/login/nurse', '/login/patient', '/kiosk', '/tv']) {
    test(`public UI ${path} ไม่ล้นจอและไม่มี page error ที่ ${viewport.width}px`, async ({ page }) => {
      await expectHealthyPage(page, path, viewport.width, viewport.height)
    })
  }
}

test('password toggle แสดงและซ่อนรหัสผ่านได้โดยไม่ล้างค่าที่กรอก', async ({ page }) => {
  await page.goto('/login/patient')
  const password = page.getByRole('textbox', { name: 'รหัสผ่าน' })
  await password.fill('demo1234')
  await expect(password).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'แสดงรหัสผ่าน' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('demo1234')
  await page.getByRole('button', { name: 'ซ่อนรหัสผ่าน' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})

const STAFF_PAGES = [
  { username: 'manager', path: '/operations' },
  { username: 'registration', path: '/registration' },
  { username: 'vitals', path: '/vitals' },
  { username: 'nurse', path: '/intake' },
  { username: 'doctor', path: '/physician' },
  { username: 'lab', path: '/lab' },
  { username: 'pharmacy', path: '/pharmacy' },
  { username: 'infusion', path: '/infusion' },
] as const

for (const item of STAFF_PAGES) {
  test(`${item.path} render พร้อม shared shell และไม่มี horizontal overflow`, async ({ page }) => {
    await page.context().clearCookies()
    await developmentLogin(page, item.username)
    await page.setViewportSize({ width: 1024, height: 820 })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(item.path)
    await expect(page.locator('#main-content')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    expect(pageErrors).toEqual([])
  })
}

test('staff shell แสดงสถานะ realtime และ skip link สำหรับ keyboard', async ({ page }) => {
  await developmentLogin(page, 'nurse')
  await page.goto('/intake')
  const skipLink = page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' })
  const mainContent = page.locator('#main-content')
  await skipLink.focus()
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(mainContent).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: /ข้อมูลสด|กำลังเชื่อมต่อ|การเชื่อมต่อสะดุด/ }).first()).toBeVisible()
})
