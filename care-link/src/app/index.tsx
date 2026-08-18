import { ApiError, api, AppointmentSubmission } from '@/services/api';
import { useAuth } from '@/context/auth-context';
import { sameBangkokDay, validateMeasurementStrings } from '@/utils/appointment';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Section = 'home' | 'request' | 'notifications' | 'profile';
type Appointment = {
  id: string;
  status: string;
  chief_complaint: string;
  measurements?: Record<string, number>;
  appointment_at?: string;
  assigned_pc?: string;
  nurse_note?: string;
  doctor_note?: string;
};
type Journey = {
  queue_no?: string;
  current_station?: string;
  station_name?: string;
  next_station?: string;
  next_station_name?: string;
  queue_ahead?: number;
  est_wait_min?: number;
  queue_status?: string;
  route?: Array<{ station_code: string; status: string }>;
  updated_at?: string;
};
type Notice = { id: string; title: string; message: string; is_read: boolean; created_at: string };

const STATUS_LABELS: Record<string, string> = {
  submitted: 'ส่งคำขอแล้ว',
  nurse_proposed: 'พยาบาลเสนอวันนัดแล้ว',
  confirmed: 'ยืนยันนัดแล้ว',
  arrival_reported: 'แจ้งมาถึงแล้ว',
  checked_in: 'เช็กอินแล้ว',
  in_service: 'กำลังรับบริการ',
  completed: 'การรับบริการเสร็จสมบูรณ์',
  cancelled: 'ยกเลิกแล้ว',
};

const QUEUE_LABELS: Record<string, string> = {
  waiting: 'กำลังรอ',
  called: 'ถูกเรียกแล้ว',
  in_progress: 'กำลังรับบริการ',
};

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

function dateThai(value?: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        {...props}
        style={[styles.input, props.multiline && styles.multiline]}
        placeholderTextColor="#75817F"
      />
    </View>
  );
}

function PrimaryButton({
  title,
  onPress,
  disabled,
  tone = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'quiet';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'danger' && styles.dangerButton,
        tone === 'quiet' && styles.quietButton,
        (pressed || disabled) && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'quiet' && styles.quietButtonText]}>{title}</Text>
    </Pressable>
  );
}

function AuthScreen() {
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      if (!phone.trim() || !password) throw new Error('กรุณากรอกเบอร์โทรและรหัสผ่าน');
      if (mode === 'register') {
        if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
          throw new Error('กรุณากรอกชื่อและวันเกิดรูปแบบ YYYY-MM-DD');
        }
        if (password.length < 6) throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
        await register({ display_name: name.trim(), phone: phone.trim(), birth_date: birthDate, password });
      } else {
        await login(phone.trim(), password);
      }
    } catch (error) {
      Alert.alert('ทำรายการไม่สำเร็จ', messageOf(error));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>CareLink</Text>
        <Text style={styles.authTitle}>{mode === 'login' ? 'เข้าสู่ระบบผู้ป่วย' : 'สมัครสมาชิกผู้ป่วย'}</Text>
        {mode === 'register' && (
          <>
            <Field label="ชื่อ-นามสกุล" value={name} onChangeText={setName} placeholder="เช่น สมชาย ใจดี" />
            <Field label="วันเกิด" value={birthDate} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" />
          </>
        )}
        <Field label="เบอร์โทร" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="0812345678" />
        <Field label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry placeholder="อย่างน้อย 6 ตัวอักษร" />
        <PrimaryButton title={loading ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเข้าสู่ระบบ'} onPress={submit} disabled={loading} />
        <PrimaryButton
          tone="quiet"
          title={mode === 'login' ? 'ยังไม่มีบัญชี — สมัครสมาชิก' : 'มีบัญชีแล้ว — เข้าสู่ระบบ'}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          disabled={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function RequestForm({
  appointment,
  token,
  onSaved,
}: {
  appointment: Appointment | null;
  token: string;
  onSaved: () => Promise<void>;
}) {
  const [complaint, setComplaint] = useState(appointment?.chief_complaint || '');
  const [height, setHeight] = useState(appointment?.measurements?.height_cm?.toString() || '');
  const [weight, setWeight] = useState(appointment?.measurements?.weight_kg?.toString() || '');
  const [sbp, setSbp] = useState(appointment?.measurements?.sbp?.toString() || '');
  const [dbp, setDbp] = useState(appointment?.measurements?.dbp?.toString() || '');
  const [spo2, setSpo2] = useState(appointment?.measurements?.spo2?.toString() || '');
  const [saving, setSaving] = useState(false);

  const optional = (value: string) => value.trim() === '' ? undefined : Number(value);
  const submit = async () => {
    if (!complaint.trim()) return Alert.alert('ข้อมูลไม่ครบ', 'กรุณาระบุอาการสำคัญ');
    const measurementError = validateMeasurementStrings({ height, weight, sbp, dbp, spo2 });
    if (measurementError) return Alert.alert('ข้อมูลไม่ถูกต้อง', measurementError);
    const measurements = {
      height_cm: optional(height),
      weight_kg: optional(weight),
      sbp: optional(sbp),
      dbp: optional(dbp),
      spo2: optional(spo2),
    };
    const body: AppointmentSubmission = { chief_complaint: complaint.trim(), measurements };
    setSaving(true);
    try {
      if (appointment?.status === 'submitted') await api.updateAppointmentRequest(token, appointment.id, body);
      else await api.createAppointmentRequest(token, body);
      await onSaved();
      Alert.alert('สำเร็จ', 'บันทึกคำขอนัดแล้ว');
    } catch (error) {
      Alert.alert('บันทึกไม่สำเร็จ', messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{appointment?.status === 'submitted' ? 'แก้ไขคำขอ' : 'ส่งอาการเพื่อขอนัด'}</Text>
      <Text style={styles.help}>กรอกเฉพาะค่าที่วัดได้ ช่องว่างสามารถเว้นได้</Text>
      <Field label="อาการสำคัญ *" value={complaint} onChangeText={setComplaint} multiline placeholder="อธิบายอาการที่ต้องการพบแพทย์" />
      <View style={styles.twoColumns}>
        <View style={styles.half}><Field label="ส่วนสูง (ซม.)" value={height} onChangeText={setHeight} keyboardType="numeric" /></View>
        <View style={styles.half}><Field label="น้ำหนัก (กก.)" value={weight} onChangeText={setWeight} keyboardType="numeric" /></View>
      </View>
      <View style={styles.twoColumns}>
        <View style={styles.half}><Field label="ความดันตัวบน" value={sbp} onChangeText={setSbp} keyboardType="numeric" /></View>
        <View style={styles.half}><Field label="ความดันตัวล่าง" value={dbp} onChangeText={setDbp} keyboardType="numeric" /></View>
      </View>
      <Field label="ออกซิเจน SpO₂ (%)" value={spo2} onChangeText={setSpo2} keyboardType="numeric" />
      <PrimaryButton title={saving ? 'กำลังบันทึก…' : 'บันทึกคำขอ'} onPress={submit} disabled={saving} />
    </View>
  );
}

function JourneyCard({ journey }: { journey: Journey }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>คิวปัจจุบัน</Text>
      <Text style={styles.queueNumber}>{journey.queue_no || '-'}</Text>
      <Text style={styles.station}>{journey.station_name || journey.current_station}</Text>
      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{journey.queue_ahead ?? 0}</Text><Text>คิวข้างหน้า</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{journey.est_wait_min ?? 0}</Text><Text>นาทีโดยประมาณ</Text></View>
      </View>
      <Text style={styles.body}>สถานะ: {QUEUE_LABELS[journey.queue_status || ''] || journey.queue_status || '-'}</Text>
      <Text style={styles.body}>สถานีถัดไป: {journey.next_station_name || journey.next_station || 'ปลายทาง'}</Text>
      <View style={styles.timeline}>
        {(journey.route || []).map((step, index) => (
          <View key={`${step.station_code}-${index}`} style={styles.timelineRow}>
            <View style={[styles.dot, step.status === 'completed' && styles.dotDone, step.status === 'in_progress' && styles.dotCurrent]} />
            <Text style={styles.body}>{step.station_code} · {step.status === 'completed' ? 'เสร็จแล้ว' : step.status === 'in_progress' ? 'กำลังดำเนินการ' : 'รอ'}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.updated}>อัปเดตล่าสุด {dateThai(journey.updated_at)}</Text>
    </View>
  );
}

function PatientApp() {
  const { token, user, logout } = useAuth();
  const [section, setSection] = useState<Section>('home');
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [arrivalBusy, setArrivalBusy] = useState(false);

  const refresh = useCallback(async (showSpinner = false) => {
    if (!token) return;
    if (showSpinner) setRefreshing(true);
    try {
      const [nextAppointment, nextJourney, nextNotices] = await Promise.all([
        api.getCurrentAppointmentRequest(token),
        api.getJourney(token),
        api.getNotifications(token),
      ]);
      setAppointment(nextAppointment);
      setJourney(nextJourney);
      setNotices(nextNotices || []);
      setOffline(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await logout();
      } else {
        setOffline(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, [token, logout]);

  useEffect(() => {
    refresh(true);
    const timer = setInterval(() => refresh(false), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const unread = useMemo(() => notices.filter(item => !item.is_read).length, [notices]);
  const reportArrival = async () => {
    if (!token || !appointment) return;
    setArrivalBusy(true);
    try {
      await api.reportArrival(token, appointment.id);
      await refresh();
      Alert.alert('แจ้งมาถึงแล้ว', 'กรุณารอพยาบาลตรวจสอบและยืนยันเช็กอิน');
    } catch (error) {
      Alert.alert('ทำรายการไม่สำเร็จ', messageOf(error));
    } finally {
      setArrivalBusy(false);
    }
  };
  const cancel = () => {
    if (!token || !appointment) return;
    Alert.alert('ยกเลิกคำขอ', 'ยืนยันยกเลิกคำขอนี้หรือไม่', [
      { text: 'ไม่ยกเลิก', style: 'cancel' },
      {
        text: 'ยืนยัน',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelAppointmentRequest(token, appointment.id);
            await refresh();
          } catch (error) {
            Alert.alert('ยกเลิกไม่สำเร็จ', messageOf(error));
          }
        },
      },
    ]);
  };

  const content = () => {
    if (section === 'request') {
      if (appointment && appointment.status !== 'submitted' && appointment.status !== 'cancelled' && appointment.status !== 'completed') {
        return <View style={styles.card}><Text style={styles.cardTitle}>มีคำขอที่กำลังดำเนินการ</Text><Text style={styles.body}>แก้ไขได้เฉพาะช่วงที่เพิ่งส่งคำขอ กรุณาติดตามสถานะจากหน้าหลัก</Text></View>;
      }
      return <RequestForm appointment={appointment?.status === 'submitted' ? appointment : null} token={token!} onSaved={async () => { await refresh(); setSection('home'); }} />;
    }
    if (section === 'notifications') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>การแจ้งเตือนในแอป</Text>
          <Text style={styles.help}>ระบบตรวจสอบข้อมูลทุกประมาณ 10 วินาทีเฉพาะขณะที่เปิดแอป ไม่มี SMS หรือแจ้งเตือนเมื่อปิดแอป</Text>
          {notices.length === 0 && <Text style={styles.empty}>ยังไม่มีการแจ้งเตือน</Text>}
          {notices.map(item => (
            <Pressable
              key={item.id}
              style={[styles.notice, !item.is_read && styles.noticeUnread]}
              onPress={async () => {
                if (!item.is_read) {
                  await api.markNotificationRead(token!, item.id);
                  await refresh();
                }
              }}
            >
              <Text style={styles.noticeTitle}>{item.title}</Text>
              <Text style={styles.body}>{item.message}</Text>
              <Text style={styles.updated}>{dateThai(item.created_at)}</Text>
            </Pressable>
          ))}
        </View>
      );
    }
    if (section === 'profile') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>โปรไฟล์</Text>
          <Text style={styles.body}>ชื่อ: {user?.display_name}</Text>
          <Text style={styles.help}>หากต้องการความช่วยเหลือ โปรดติดต่อเจ้าหน้าที่โรงพยาบาลโดยตรง แอปนี้ไม่มีระบบช่วยเหลือฉุกเฉิน</Text>
          <PrimaryButton tone="danger" title="ออกจากระบบ" onPress={logout} />
        </View>
      );
    }
    return (
      <>
        {appointment ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>สถานะปัจจุบัน</Text>
            <Text style={styles.status}>{STATUS_LABELS[appointment.status] || appointment.status}</Text>
            <Text style={styles.body}>อาการ: {appointment.chief_complaint}</Text>
            {appointment.appointment_at && <Text style={styles.body}>วันนัด: {dateThai(appointment.appointment_at)}</Text>}
            {appointment.assigned_pc && <Text style={styles.body}>ห้องตรวจ: {appointment.assigned_pc}</Text>}
            {appointment.nurse_note && <Text style={styles.body}>หมายเหตุพยาบาล: {appointment.nurse_note}</Text>}
            {appointment.doctor_note && <Text style={styles.body}>หมายเหตุแพทย์: {appointment.doctor_note}</Text>}
            {appointment.status === 'confirmed' && (
              <>
                {!sameBangkokDay(appointment.appointment_at) && <Text style={styles.help}>ปุ่มแจ้งมาถึงจะแสดงในวันนัดตามเวลาประเทศไทย</Text>}
                {sameBangkokDay(appointment.appointment_at) && (
                  <PrimaryButton title={arrivalBusy ? 'กำลังแจ้ง…' : 'ฉันมาถึงโรงพยาบาลแล้ว'} onPress={reportArrival} disabled={arrivalBusy} />
                )}
              </>
            )}
            {['submitted', 'nurse_proposed', 'confirmed'].includes(appointment.status) && <PrimaryButton tone="quiet" title="ยกเลิกคำขอ" onPress={cancel} />}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ยังไม่มีคำขอนัด</Text>
            <Text style={styles.body}>เริ่มจากส่งอาการและค่าที่วัดเองได้ให้พยาบาลตรวจสอบ</Text>
            <PrimaryButton title="ส่งข้อมูลเพื่อขอนัด" onPress={() => setSection('request')} />
          </View>
        )}
        {journey && <JourneyCard journey={journey} />}
        {appointment?.status === 'completed' && (
          <View style={[styles.card, styles.completedCard]}>
            <Text style={styles.cardTitle}>เสร็จสมบูรณ์</Text>
            <Text style={styles.body}>การรับบริการครั้งนี้สิ้นสุดแล้ว ขอบคุณที่ใช้ CareLink</Text>
          </View>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View><Text style={styles.brandSmall}>CareLink</Text><Text style={styles.greeting}>สวัสดี {user?.display_name}</Text></View>
        {offline && <Text style={styles.offline}>ออฟไลน์</Text>}
      </View>
      <View style={styles.nav}>
        {([
          ['home', 'หน้าหลัก'],
          ['request', 'ส่งข้อมูล'],
          ['notifications', `แจ้งเตือน${unread ? ` (${unread})` : ''}`],
          ['profile', 'โปรไฟล์'],
        ] as Array<[Section, string]>).map(([key, label]) => (
          <Pressable key={key} onPress={() => setSection(key)} style={[styles.navItem, section === key && styles.navActive]}>
            <Text style={[styles.navText, section === key && styles.navTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.page}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} />}
        keyboardShouldPersistTaps="handled"
      >
        {refreshing && !appointment ? <ActivityIndicator size="large" color="#0B6B63" /> : content()}
        {offline && <Text style={styles.offlineHelp}>เชื่อมต่อระบบไม่ได้ ข้อมูลบนหน้าจออาจไม่ล่าสุด โปรดลากลงเพื่อลองใหม่</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Index() {
  const { isAuthenticated, isRestoring } = useAuth();
  if (isRestoring) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#0B6B63" /></SafeAreaView>;
  return isAuthenticated ? <PatientApp /> : <AuthScreen />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F7F6' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F7F6' },
  authPage: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 38, fontWeight: '800', color: '#0B6B63', textAlign: 'center' },
  brandSmall: { fontSize: 25, fontWeight: '800', color: '#0B6B63' },
  authTitle: { fontSize: 24, fontWeight: '700', color: '#173A37', textAlign: 'center', marginBottom: 12 },
  greeting: { color: '#385653', fontSize: 16 },
  field: { gap: 6, marginBottom: 10 },
  label: { fontSize: 16, fontWeight: '600', color: '#244946' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#B7CAC7', borderRadius: 12, backgroundColor: '#FFFFFF', paddingHorizontal: 14, fontSize: 17, color: '#163835' },
  multiline: { minHeight: 112, paddingTop: 14, textAlignVertical: 'top' },
  button: { minHeight: 54, borderRadius: 13, backgroundColor: '#0B6B63', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 8 },
  dangerButton: { backgroundColor: '#B63E3E' },
  quietButton: { backgroundColor: '#E2EFED' },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  quietButtonText: { color: '#0B5C55' },
  nav: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D7E4E2' },
  navItem: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  navActive: { borderBottomWidth: 3, borderBottomColor: '#0B6B63' },
  navText: { fontSize: 12, color: '#4D6663', textAlign: 'center' },
  navTextActive: { color: '#0B6B63', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18, gap: 10, borderWidth: 1, borderColor: '#DCE8E6' },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#173A37' },
  body: { fontSize: 16, lineHeight: 24, color: '#304E4B' },
  help: { fontSize: 14, lineHeight: 21, color: '#637A77' },
  status: { alignSelf: 'flex-start', backgroundColor: '#DDF1ED', color: '#075B53', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, fontSize: 17, fontWeight: '700' },
  twoColumns: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  queueNumber: { fontSize: 34, fontWeight: '800', color: '#0B6B63', textAlign: 'center' },
  station: { fontSize: 20, fontWeight: '700', textAlign: 'center', color: '#244946' },
  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: '#F0F6F5', padding: 12, borderRadius: 12, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800', color: '#0B6B63' },
  timeline: { gap: 7, marginTop: 4 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#C8D3D1' },
  dotDone: { backgroundColor: '#2C9B70' },
  dotCurrent: { backgroundColor: '#EE9B38' },
  updated: { fontSize: 12, color: '#71827F' },
  completedCard: { borderColor: '#68B892', backgroundColor: '#EDFAF4' },
  notice: { padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#D8E2E0', gap: 4 },
  noticeUnread: { borderColor: '#0B6B63', backgroundColor: '#F0FAF8' },
  noticeTitle: { fontSize: 17, fontWeight: '700', color: '#173A37' },
  empty: { textAlign: 'center', color: '#71827F', paddingVertical: 20, fontSize: 16 },
  offline: { color: '#A63838', fontWeight: '700' },
  offlineHelp: { color: '#A63838', textAlign: 'center', lineHeight: 20 },
});
