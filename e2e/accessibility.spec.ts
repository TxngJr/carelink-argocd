import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
]) {
  test(`หน้าสาธารณะผ่าน automated accessibility scan ที่ ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('Kiosk ใช้แป้นพิมพ์กรอกข้อมูลยืนยันได้', async ({ page }) => {
  await page.goto('/kiosk')
  await expect(page.getByLabel('HN หรือเบอร์โทร *')).toBeFocused()
  await page.getByLabel('HN หรือเบอร์โทร *').fill('HN000101')
  await page.getByLabel('วันเกิด *').fill('1978-05-12')
  await page.getByRole('button', { name: 'ตรวจสอบบัตรคิว' }).click()
  await expect(page.getByText('นายสมชาย ใจดี')).toBeVisible()
})
