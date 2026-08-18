import { sameBangkokDay, validateMeasurementStrings } from './appointment';
import { describe, expect, it } from '@jest/globals';

describe('appointment helpers', () => {
  it('accepts empty optional measurements', () => {
    expect(validateMeasurementStrings({ height: '', weight: '', sbp: '', dbp: '', spo2: '' })).toBe('');
  });

  it('requires both blood pressure values', () => {
    expect(validateMeasurementStrings({ height: '', weight: '', sbp: '120', dbp: '', spo2: '' })).toContain('พร้อมกัน');
  });

  it('rejects SpO2 over 100', () => {
    expect(validateMeasurementStrings({ height: '', weight: '', sbp: '', dbp: '', spo2: '101' })).toContain('100');
  });

  it('uses Bangkok date for the arrival button', () => {
    const now = new Date('2026-07-26T17:20:00.000Z');
    expect(sameBangkokDay('2026-07-26T17:40:00.000Z', now)).toBe(true);
    expect(sameBangkokDay('2026-07-26T16:40:00.000Z', now)).toBe(false);
  });
});
