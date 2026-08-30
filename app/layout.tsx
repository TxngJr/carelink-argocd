import type { Metadata, Viewport } from 'next'
import './globals.css'
import './staff.css'

export const metadata: Metadata = {
  title: { default: 'CareLink', template: '%s | CareLink' },
  description: 'CareLink ระบบสาธิตจัดการเส้นทางและคิวด้วยข้อมูลสังเคราะห์',
  applicationName: 'CareLink',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#135d54' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body>{children}</body></html>
}
