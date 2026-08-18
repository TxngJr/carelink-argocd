import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Volume2, VolumeX, Maximize, Wifi, WifiOff } from 'lucide-react'
import { getTvBoard } from '../services/api'

const GROUP_SIZE = 6
const POLL_MS = 4000
const ROTATE_MS = 8000

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
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
  } catch (e) {
    // Web Audio unavailable — silently skip, the visual flash still fires
  }
}

function speak(text) {
  try {
    if (!window.speechSynthesis) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'th-TH'
    utter.rate = 0.9
    window.speechSynthesis.speak(utter)
  } catch (e) {
    // TTS unavailable — no-op
  }
}

export default function TVPage() {
  const { code } = useParams()
  const [board, setBoard] = useState(null)
  const [connected, setConnected] = useState(true)
  const [groupIndex, setGroupIndex] = useState(0)
  const [flashCodes, setFlashCodes] = useState({})
  const [ttsOn, setTtsOn] = useState(false)
  const seenCallsRef = useRef(new Map())
  const firstLoadRef = useRef(true)

  const fetchBoard = useCallback(async () => {
    try {
      const res = await getTvBoard(code ? [code] : [])
      setBoard(res.data)
      setConnected(true)

      const nextFlash = {}
      for (const st of res.data.stations) {
        const seen = seenCallsRef.current.get(st.code) || new Set()
        const nowKeys = new Set(st.now_calling.map(c => `${c.queue_no}|${c.called_at}`))
        let isNew = false
        for (const key of nowKeys) {
          if (!seen.has(key)) isNew = true
        }
        if (isNew && !firstLoadRef.current) {
          nextFlash[st.code] = true
          playChime()
          if (ttsOn && st.now_calling.length > 0) {
            speak(`คิวหมายเลข ${st.now_calling[0].queue_no.split('').join(' ')} เชิญที่ ${st.name_th}`)
          }
        }
        seenCallsRef.current.set(st.code, nowKeys)
      }
      if (Object.keys(nextFlash).length > 0) {
        setFlashCodes(nextFlash)
        setTimeout(() => setFlashCodes({}), 2500)
      }
      firstLoadRef.current = false
    } catch (err) {
      setConnected(false)
    }
  }, [code, ttsOn])

  useEffect(() => {
    fetchBoard()
    const interval = setInterval(fetchBoard, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchBoard])

  useEffect(() => {
    if (code) return
    const rotate = setInterval(() => setGroupIndex(i => i + 1), ROTATE_MS)
    return () => clearInterval(rotate)
  }, [code])

  const goFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {})
  }

  if (!board) {
    return (
      <div className="tv-root d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border" style={{ color: '#eafbf8' }} />
          <div className="mt-3" style={{ color: '#eafbf8' }}>กำลังเชื่อมต่อ...</div>
        </div>
        <TvStyles />
      </div>
    )
  }

  const groups = []
  for (let i = 0; i < board.stations.length; i += GROUP_SIZE) {
    groups.push(board.stations.slice(i, i + GROUP_SIZE))
  }
  const visible = code ? board.stations : (groups[groupIndex % groups.length] || [])

  const updatedLabel = new Date(board.updated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const avgOfVisible = visible.length > 0
    ? Math.round(visible.reduce((sum, s) => sum + (s.avg_wait_min || 0), 0) / visible.length)
    : 0

  return (
    <div className="tv-root">
      <div className="tv-header">
        <div className="tv-brand">
          <span className="tv-brand-mark">CareLink</span>
          <span className="tv-brand-sub">โรงพยาบาลมะเร็งอุบลราชธานี · จอแสดงคิว</span>
        </div>
        <div className="tv-controls">
          {connected ? <Wifi size={18} color="#7fd9c9" /> : <WifiOff size={18} color="#e08585" />}
          <button className="tv-icon-btn" onClick={() => setTtsOn(v => !v)} title="เสียงอ่านคิว">
            {ttsOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button className="tv-icon-btn" onClick={goFullscreen} title="เต็มจอ">
            <Maximize size={18} />
          </button>
        </div>
      </div>

      <div className={`tv-grid tv-grid-${Math.min(visible.length, 6) || 1}`}>
        {visible.map(st => (
          <div key={st.code} className={`tv-card ${flashCodes[st.code] ? 'tv-flash' : ''}`}>
            <div className="tv-card-title">{st.name_th}</div>
            <div className="tv-card-code">{st.code}</div>

            <div className="tv-calling-label">กำลังเรียก</div>
            {st.now_calling.length === 0 ? (
              <div className="tv-calling-empty">—</div>
            ) : (
              st.now_calling.map((c, i) => (
                <div key={i} className="tv-calling-number">{c.queue_no}</div>
              ))
            )}

            {st.next_waiting.length > 0 && (
              <div className="tv-next-row">
                <span className="tv-next-label">คิวถัดไป</span>
                {st.next_waiting.map((q, i) => (
                  <span key={i} className="tv-next-chip">{q}</span>
                ))}
              </div>
            )}

            <div className="tv-footer-line">
              รอ {st.waiting_count} คน{st.avg_wait_min > 0 ? ` · รอเฉลี่ย ~${st.avg_wait_min}±${st.wait_band_min} นาที` : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="tv-bottom">
        อัปเดต {updatedLabel}{avgOfVisible > 0 ? ` · รอเฉลี่ยรวม ~${avgOfVisible} นาที` : ''}
        {!connected && ' · การเชื่อมต่อขัดข้อง กำลังลองใหม่...'}
      </div>

      <TvStyles />
    </div>
  )
}

function TvStyles() {
  return (
    <style>{`
      .tv-root {
        min-height: 100vh;
        background: linear-gradient(160deg, #052523 0%, #06302e 55%, #08453f 100%);
        color: #eafbf8;
        font-family: 'Hanken Grotesk', 'IBM Plex Sans Thai Looped', sans-serif;
        padding: 24px 32px;
        display: flex;
        flex-direction: column;
      }
      .tv-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .tv-brand-mark { font-size: 28px; font-weight: 800; margin-right: 14px; }
      .tv-brand-sub { font-size: 14px; color: rgba(234,251,248,0.6); }
      .tv-controls { display: flex; align-items: center; gap: 10px; }
      .tv-icon-btn {
        background: rgba(234,251,248,0.08);
        border: 1px solid rgba(234,251,248,0.15);
        color: #eafbf8;
        border-radius: 8px;
        padding: 8px 10px;
        cursor: pointer;
      }
      .tv-icon-btn:hover { background: rgba(234,251,248,0.15); }
      .tv-grid {
        flex: 1;
        display: grid;
        gap: 20px;
        grid-template-columns: repeat(3, 1fr);
      }
      .tv-grid-1, .tv-grid-2 { grid-template-columns: repeat(2, 1fr); }
      .tv-card {
        background: rgba(234,251,248,0.06);
        border: 1px solid rgba(234,251,248,0.12);
        border-radius: 16px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        transition: background 0.3s, box-shadow 0.3s;
      }
      .tv-flash {
        background: rgba(31,138,91,0.35);
        box-shadow: 0 0 0 3px #1f8a5b;
      }
      .tv-card-title { font-size: 18px; font-weight: 700; }
      .tv-card-code { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: rgba(234,251,248,0.5); margin-bottom: 12px; }
      .tv-calling-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(234,251,248,0.55); margin-bottom: 4px; }
      .tv-calling-number {
        font-family: 'IBM Plex Mono', monospace;
        font-weight: 800;
        font-size: clamp(3rem, 9vw, 6rem);
        line-height: 1.05;
        color: #eafbf8;
      }
      .tv-calling-empty { font-size: clamp(2rem, 6vw, 3.5rem); color: rgba(234,251,248,0.3); }
      .tv-next-row { margin-top: 14px; display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: 6px; }
      .tv-next-label { font-size: 11px; color: rgba(234,251,248,0.5); margin-right: 4px; }
      .tv-next-chip {
        font-family: 'IBM Plex Mono', monospace;
        background: rgba(234,251,248,0.1);
        border-radius: 999px;
        padding: 3px 10px;
        font-size: 13px;
      }
      .tv-footer-line { margin-top: 16px; font-size: 13px; color: rgba(234,251,248,0.6); }
      .tv-bottom {
        margin-top: 20px;
        text-align: center;
        font-size: 13px;
        color: rgba(234,251,248,0.45);
      }
    `}</style>
  )
}
