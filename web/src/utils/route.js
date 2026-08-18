const FORBIDDEN_AFTER_PC = new Set(['NPR', 'EV', 'VM', 'MHT', 'PC', 'PC2', 'PC3', 'PC4'])

export function buildDoctorRoute(selected, terminal) {
  const unique = new Set(selected)
  if (unique.size !== selected.length) throw new Error('ห้ามเลือก Station ซ้ำ')
  if (selected.some(code => FORBIDDEN_AFTER_PC.has(code) || code === 'DH' || code === 'HA' || code === 'IPW')) {
    throw new Error('Station หลังห้องตรวจไม่ถูกต้อง')
  }
  return terminal === 'IPW' ? [...selected, 'HA', 'IPW'] : [...selected, 'DH']
}
