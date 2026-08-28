'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Flame, HeartPulse, Palette, Sparkles } from 'lucide-react'

export default function DesignSystemPage() {
  const colors = [
    { name: 'Brand Navy', var: '--navy', hex: '#0B2545' },
    { name: 'Brand Teal', var: '--brand', hex: '#135D54' },
    { name: 'OK Emerald', var: '--ok', hex: '#1F8A5B' },
    { name: 'Warn Amber', var: '--warn', hex: '#C8851A' },
    { name: 'Crit Rose', var: '--crit', hex: '#CC3F3F' },
    { name: 'Info Blue', var: '--info', hex: '#2B6CB0' },
  ]

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px', display: 'grid', gap: 32 }}>
      <div>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: '.85rem', marginBottom: 12 }}>
          <ArrowLeft size={16} /> กลับหน้าหลัก CareLink
        </Link>
        <span className="eyebrow">DESIGN TOKENS & SYSTEM</span>
        <h1 style={{ margin: '6px 0 8px', fontSize: '2.4rem' }}>AMIS DynaFlow 2.0 Design System</h1>
        <p style={{ color: 'var(--muted)', margin: 0 }}>
          ชุดคู่มือองค์ประกอบ UI, โทเคนสี, สถานะความหนาแน่น และคอมโพเนนต์มาตรฐานสำหรับระบบโรงพยาบาล
        </p>
      </div>

      {/* Color Tokens */}
      <section className="workspace-card" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>โทเคนสีหลัก (Core Color Palette)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {colors.map((c) => (
            <div key={c.name} style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' }}>
              <div style={{ height: 64, background: c.hex }} />
              <div style={{ padding: 10, background: '#fff', fontSize: '.8rem' }}>
                <strong>{c.name}</strong>
                <div style={{ color: 'var(--muted)', fontFamily: 'monospace', fontSize: '.75rem' }}>{c.hex}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Flow State Badges */}
      <section className="workspace-card" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>สถานะการไหลเวียน (AMIS Flow States)</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span className="status-pill flowing" style={{ padding: '8px 14px', fontSize: '.85rem' }}>
            🟢 Flowing (คล่องตัว)
          </span>
          <span className="status-pill building" style={{ padding: '8px 14px', fontSize: '.85rem' }}>
            🟡 Building (เริ่มสะสม)
          </span>
          <span className="status-pill bottleneck" style={{ padding: '8px 14px', fontSize: '.85rem' }}>
            🔴 Bottleneck (คอขวดวิกฤต)
          </span>
          <span className="status-pill" style={{ padding: '8px 14px', fontSize: '.85rem' }}>
            ⚪ Idle (ไม่มีผู้ป่วยรอ)
          </span>
        </div>
      </section>

      {/* Buttons Gallery */}
      <section className="workspace-card" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>ปุ่มมาตรฐาน (Standard Action Buttons)</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="button primary">Primary Button</button>
          <button className="button secondary">Secondary Button</button>
          <button className="button success">Success Action</button>
          <button className="button warning">Warning Action</button>
          <button className="button danger">Danger Action</button>
          <button className="button ghost">Ghost Border</button>
          <button className="button primary large">Large Primary</button>
        </div>
      </section>

      {/* Metric Cards */}
      <section className="workspace-card" style={{ padding: 24 }}>
        <h3 style={{ marginTop: 0 }}>การ์ดสถิติ (KPI & Metric Cards)</h3>
        <div className="queue-summary-grid" style={{ padding: 0 }}>
          <div className="metric-card highlight">
            <span>Now Serving</span>
            <strong>NPR-005</strong>
            <small>ห้องตรวจ 201</small>
          </div>
          <div className="metric-card">
            <span>คิวรอคอย</span>
            <strong>8 คิว</strong>
            <small>ประมาณ 16 นาที</small>
          </div>
          <div className="metric-card">
            <span>ความจุสถานี</span>
            <strong>12 คน</strong>
            <small>อัตราครองเตียง 66%</small>
          </div>
          <div className="metric-card">
            <span>Throughput</span>
            <strong>18/ชม.</strong>
            <small>ผ่านเกณฑ์ SLA</small>
          </div>
        </div>
      </section>
    </div>
  )
}
