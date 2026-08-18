export function sameBangkokDay(value?: string, now = new Date()) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(value)) === formatter.format(now);
}

export function validateMeasurementStrings(values: {
  height: string;
  weight: string;
  sbp: string;
  dbp: string;
  spo2: string;
}) {
  if ((values.sbp.trim() === '') !== (values.dbp.trim() === '')) {
    return 'กรุณากรอกความดันตัวบนและตัวล่างพร้อมกัน';
  }
  if (Object.values(values).some(value => value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0))) {
    return 'ค่าที่วัดต้องเป็นตัวเลขมากกว่าศูนย์';
  }
  if (values.spo2 && Number(values.spo2) > 100) return 'SpO₂ ต้องไม่เกิน 100';
  return '';
}
