import type { ReactNode } from 'react'
import './infusion-polish.css'

export default function InfusionLayout({ children }: { children: ReactNode }) {
  return <div className="infusion-route-scope">{children}</div>
}
