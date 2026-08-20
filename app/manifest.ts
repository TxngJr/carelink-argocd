import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CareLink', short_name: 'CareLink', description: 'Patient flow and queue management prototype',
    start_url: '/', display: 'standalone', background_color: '#f5f8f7', theme_color: '#135d54',
    icons: [{ src: '/logo-mark.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
