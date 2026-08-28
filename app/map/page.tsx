'use client'

import React, { useEffect, useState } from 'react'
import { Building2, Layers, MapPin, RefreshCw } from 'lucide-react'
import { StaffShell } from '@/components/staff-shell'
import { clientApi } from '@/lib/client'
import { STATIONS } from '@/lib/stations'
import type { OperationsSnapshot } from '@/lib/types'

export default function HospitalMapPage() {
  const [data, setData] = useState<OperationsSnapshot | null>(null)
  const [selectedFloor, setSelectedFloor] = useState<string>('ชั้น 1')

  useEffect(() => {
    clientApi.getOperationsSnapshot().then(setData).catch(() => null)
  }, [])

  const floors = ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'อาคารผู้ป่วยใน']
  const floorStations = (data?.stations || []).filter((s) => s.floor === selectedFloor)

  return (
    <StaffShell role="manager">
      <div style={{ display: 'grid', gap: 20 }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">INDOOR HOSPITAL MAP</span>
            <h2>แผนที่โรงพยาบาลและระดับความหนาแน่นรายชั้น</h2>
            <p>ติดตามสถานะความพร้อมและตำแหน่งของแต่ละจุดบริการ</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {floors.map((f) => (
              <button
                key={f}
                className={`button ${selectedFloor === f ? 'primary' : 'ghost'}`}
                onClick={() => setSelectedFloor(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="workspace-card">
          <div className="workspace-card-head">
            <h3>ผังจุดบริการ: {selectedFloor}</h3>
            <span className="count-badge">{floorStations.length} สถานี</span>
          </div>

          <div style={{ padding: '0 20px 24px' }}>
            <div className="flowboard-grid">
              {floorStations.map((station) => (
                <div key={station.code} className={`station-flow-tile ${station.state}`}>
                  <div className="station-tile-head">
                    <div>
                      <strong>{station.code}</strong>
                      <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{station.name}</p>
                      <span>{station.floor}</span>
                    </div>
                    <span className={`status-pill ${station.state}`}>
                      {station.state === 'bottleneck' ? 'คอขวด' : station.state === 'building' ? 'สะสม' : 'คล่องตัว'}
                    </span>
                  </div>
                  <div className="station-tile-metrics">
                    <div>
                      <span>คิวรอ</span>
                      <strong>{station.waiting_count} คน</strong>
                    </div>
                    <div>
                      <span>เวลารอ</span>
                      <strong>{station.est_wait_min} นาที</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StaffShell>
  )
}
