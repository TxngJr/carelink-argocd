'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Maximize, Volume2, VolumeX } from 'lucide-react'
import { clientApi } from '@/lib/client'

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch {
    // Web audio fallback
  }
}

function speakThai(text: string) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'th-TH'
      utterance.rate = 0.95
      window.speechSynthesis.speak(utterance)
    } catch {
      // Speech synth fallback
    }
  }
}

export default function TvPage() {
  const [board, setBoard] = useState<{ serving: Array<{ queue_no: string; station_code: string }>; waiting: Array<{ queue_no: string; station_code: string }>; updated_at?: string }>({
    serving: [],
    waiting: [],
  })
  const [soundEnabled, setSoundEnabled] = useState(true)
  const lastCalledRef = useRef<string>('')

  useEffect(() => {
    let active = true
    function fetchTv() {
      clientApi.getTvBoard().then((data) => {
        if (!active) return
        const d = data as { serving: Array<{ queue_no: string; station_code: string }>; waiting: Array<{ queue_no: string; station_code: string }>; updated_at?: string }
        setBoard(d)
        const latestServing = d.serving?.[0]
        if (latestServing && latestServing.queue_no !== lastCalledRef.current) {
          lastCalledRef.current = latestServing.queue_no
          if (soundEnabled) {
            playChime()
            setTimeout(() => {
              speakThai(`ขอเชิญหมายเลข ${latestServing.queue_no} ที่จุด ${latestServing.station_code} ค่ะ`)
            }, 600)
          }
        }
      }).catch(() => null)
    }
    fetchTv()
    const timer = setInterval(fetchTv, 4000)
    const es = new EventSource('/api/realtime/stream?scope=public')
    es.addEventListener('queue_called', fetchTv)
    es.addEventListener('queue_updated', fetchTv)
    return () => {
      active = false
      clearInterval(timer)
      es.close()
    }
  }, [soundEnabled])

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => null)
    } else {
      document.exitFullscreen().catch(() => null)
    }
  }

  const primaryServing = board.serving?.[0]

  return (
    <div className="tv-shell">
      <header className="tv-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Image src="/logo-mark.svg" alt="CareLink" width={48} height={48} priority />
          <div>
            <h1>CareLink จอแสดงคิวสาธารณะ</h1>
            <span style={{ color: '#8fbdb4', fontSize: '.9rem' }}>ระบบแสดงผลและเรียกคิวอัตโนมัติประจำห้องพักคอย</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="button secondary"
            onClick={() => setSoundEnabled((p) => !p)}
            style={{ color: '#fff', background: 'rgba(255,255,255,.1)' }}
          >
            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            {soundEnabled ? 'เปิดเสียงประกาศ' : 'ปิดเสียง'}
          </button>
          <button
            className="button secondary"
            onClick={toggleFullScreen}
            style={{ color: '#fff', background: 'rgba(255,255,255,.1)' }}
          >
            <Maximize size={20} /> เต็มจอ
          </button>
        </div>
      </header>

      <main className="tv-grid">
        {/* Left Column: Now Serving Big Hero */}
        <section className="tv-card" style={{ background: 'rgba(255,255,255,.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow" style={{ color: '#68d3be', fontSize: '1rem' }}>กำลังเรียกคิว</span>
            <span className="status-pill flowing" style={{ fontSize: '.8rem' }}>เรียลไทม์</span>
          </div>

          {primaryServing ? (
            <div className="tv-now-serving-hero">
              <span style={{ fontSize: '1.2rem', color: '#bfe4dc' }}>หมายเลขคิวของคุณ</span>
              <h2>{primaryServing.queue_no}</h2>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#e8faf6', marginTop: 10 }}>
                เชิญที่จุดบริการ {primaryServing.station_code}
              </div>
            </div>
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#7aa29b' }}>
              <h2>ไม่มีการเรียกคิวในขณะนี้</h2>
              <p>กรุณารอฟังเสียงประกาศเรียกหมายเลขของท่าน</p>
            </div>
          )}

          {board.serving && board.serving.length > 1 && (
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={{ fontSize: '.85rem', color: '#90b9b2' }}>คิวอื่นที่กำลังให้บริการ:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {board.serving.slice(1, 5).map((item) => (
                  <div key={item.queue_no} className="tv-serving-item">
                    <strong style={{ fontFamily: 'monospace' }}>{item.queue_no}</strong>
                    <span style={{ fontSize: '1rem', color: '#bfe4dc' }}>{item.station_code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: Next in Queue */}
        <section className="tv-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow" style={{ color: '#a8c7df', fontSize: '1rem' }}>ลำดับคิวถัดไป</span>
            <span style={{ fontSize: '.85rem', color: '#88a8c2' }}>{board.waiting.length} คิวรอ</span>
          </div>

          <div style={{ display: 'grid', gap: 8, overflowY: 'auto', maxHeight: '55vh' }}>
            {board.waiting.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#66827d' }}>
                ไม่มีคิวที่กำลังรอ
              </div>
            ) : (
              board.waiting.slice(0, 8).map((item, idx) => (
                <div key={item.queue_no} className="tv-waiting-item">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ opacity: 0.6, fontSize: '.9rem' }}>#{idx + 1}</span>
                    <strong style={{ fontSize: '1.2rem', color: '#fff' }}>{item.queue_no}</strong>
                  </div>
                  <span style={{ color: '#90b9b2', fontSize: '.95rem' }}>{item.station_code}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer style={{ display: 'flex', justifyContent: 'space-between', color: '#6c8a84', fontSize: '.85rem', borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 14 }}>
        <span>ระบบสาธิตด้วยข้อมูลสังเคราะห์ ไม่แสดงชื่อหรือข้อมูลผู้ป่วย</span>
        <span>อัปเดตล่าสุด: {board.updated_at ? new Date(board.updated_at).toLocaleTimeString('th-TH') : '—'}</span>
      </footer>
    </div>
  )
}
