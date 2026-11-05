import {
  SeasonalWorker,
  DailyAttendanceDetail,
  MonthlyAttendanceRecord,
  WeeklyDayAttendance,
  SeasonalPeriodRecord,
} from '../types';
import { getDayOfWeekInfo, recomputeSeasonalWorkerPayroll, getPayrollPeriods, getUnifiedWorkerDailyRate } from '../data/mockSeasonalWorkers';
import { getSupabaseConfig, isSupabaseConfigured } from '../services/supabaseService';

export interface CalendarDayCell {
  day: number;
  displayDay?: number;
  dateStr: string; // '01/09/2026'
  dateLabel: string; // '01/09'
  dayOfWeek: string; // 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'CN'
  dayName: string; // 'Thứ Hai' ...
  dayOfWeekIdx: number; // 0 = CN, 1 = T2 ... 6 = T7
  isSunday: boolean;
  isToday: boolean;
  isCurrentMonth: boolean;
}

/**
 * Lấy số ngày trong tháng (28, 29, 30, hoặc 31)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Sinh danh sách các ngày trong tháng để vẽ lưới lịch chuẩn (Bắt đầu từ Thứ Hai)
 * Có padding các ô trống đầu tháng và cuối tháng để lưới luôn vuông vức 7 cột
 */
export function generateMonthCalendarGrid(year: number, month: number): {
  daysInMonth: number;
  paddingBefore: number; // Số ô trống cần đệm trước ngày 1 (Thứ Hai = 0, Thứ Ba = 1...)
  cells: CalendarDayCell[];
  weeks: CalendarDayCell[][];
} {
  const daysInMonth = getDaysInMonth(year, month);
  const mStr = String(month).padStart(2, '0');

  // Lấy thứ trong tuần của ngày 1
  // 0 = Chủ Nhật, 1 = Thứ Hai, 2 = Thứ Ba, 3 = Thứ Tư, 4 = Thứ Năm, 5 = Thứ Sáu, 6 = Thứ Bảy
  const firstDayObj = new Date(year, month - 1, 1, 12, 0, 0);
  const firstDayIdx = firstDayObj.getDay();
  // Chuẩn hóa sang lưới Thứ Hai = 0, Thứ Ba = 1, ..., Chủ Nhật = 6
  const paddingBefore = firstDayIdx === 0 ? 6 : firstDayIdx - 1;

  const today = new Date();
  const isCurrentYear = today.getFullYear() === year;
  const isCurrentMonth = today.getMonth() + 1 === month;
  const todayDate = today.getDate();

  const cells: CalendarDayCell[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const fullDateStr = `${dStr}/${mStr}/${year}`;
    const dateLabel = `${dStr}/${mStr}`;
    const dayInfo = getDayOfWeekInfo(dateLabel, year, month);
    const dateObj = new Date(year, month - 1, d, 12, 0, 0);
    const dayOfWeekIdx = dateObj.getDay();

    cells.push({
      day: d,
      dateStr: fullDateStr,
      dateLabel,
      dayOfWeek: dayInfo.dayOfWeek,
      dayName: dayInfo.dayName,
      dayOfWeekIdx,
      isSunday: dayInfo.isSunday,
      isToday: isCurrentYear && isCurrentMonth && todayDate === d,
      isCurrentMonth: true,
    });
  }

  // Chia thành các tuần (mỗi tuần 7 ngày)
  const weeks: CalendarDayCell[][] = [];
  let currentWeek: CalendarDayCell[] = [];

  // Đệm các ô đầu tuần trước ngày 1
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  for (let i = 0; i < paddingBefore; i++) {
    const prevDay = daysInPrevMonth - paddingBefore + 1 + i;
    currentWeek.push({
      day: 0,
      displayDay: prevDay,
      dateStr: '',
      dateLabel: '',
      dayOfWeek: '',
      dayName: '',
      dayOfWeekIdx: i + 1,
      isSunday: false,
      isToday: false,
      isCurrentMonth: false,
    });
  }

  cells.forEach((cell) => {
    currentWeek.push(cell);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  // Đệm các ô cuối tuần nếu tuần cuối chưa đủ 7 ngày
  let nextDayCounter = 1;
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({
        day: 0,
        displayDay: nextDayCounter++,
        dateStr: '',
        dateLabel: '',
        dayOfWeek: '',
        dayName: '',
        dayOfWeekIdx: currentWeek.length + 1,
        isSunday: currentWeek.length === 6,
        isToday: false,
        isCurrentMonth: false,
      });
    }
    weeks.push(currentWeek);
  }

  return {
    daysInMonth,
    paddingBefore,
    cells,
    weeks,
  };
}

/**
 * Lấy hoặc khởi tạo bản ghi chấm công tháng của công nhân
 */
export function getWorkerMonthlyAttendance(
  worker: SeasonalWorker,
  year: number,
  month: number
): MonthlyAttendanceRecord {
  const mStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${mStr}`;

  if (worker.monthlyAttendance && worker.monthlyAttendance[monthKey]) {
    const existing = worker.monthlyAttendance[monthKey];
    const cleanDays: { [dayNumber: number]: DailyAttendanceDetail } = {};
    Object.entries(existing.days || {}).forEach(([k, d]) => {
      const dayNum = Number(k);
      if (!d || isNaN(dayNum)) return;
      const isFakeDefault =
        Number(d.workUnits || 0) === 0 &&
        Number(d.otHours || 0) === 0 &&
        (!d.statusType ||
          (d.statusType === 'ABSENT' &&
            (d.note === 'Nghỉ ca' || d.note === 'Nghỉ Chủ Nhật' || d.note === 'Chưa chấm công')));
      if (!isFakeDefault) {
        cleanDays[dayNum] = d;
      }
    });
    return {
      ...existing,
      days: cleanDays,
    };
  }

  return {
    monthKey,
    month,
    year,
    totalWorkDays: 0,
    totalOtHours: 0,
    days: {},
    lastSubmittedAt: undefined,
  };
}

/**
 * Cập nhật chấm công tháng của công nhân, tính lại lương và đồng bộ bảng tuần lẫn tất cả chu kỳ
 */
export function updateWorkerMonthlyAttendance(
  worker: SeasonalWorker,
  year: number,
  month: number,
  days: { [dayNumber: number]: DailyAttendanceDetail },
  submittedBy: 'WORKER' | 'FOREMAN' | 'ADMIN' = 'WORKER'
): SeasonalWorker {
  const mStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${mStr}`;

  const cleanDays: { [dayNumber: number]: DailyAttendanceDetail } = {};
  let totalWorkDays = 0;
  let totalOtHours = 0;

  Object.entries(days || {}).forEach(([k, d]) => {
    const dayNum = Number(k);
    if (!d || isNaN(dayNum)) return;
    const isFakeDefault =
      Number(d.workUnits || 0) === 0 &&
      Number(d.otHours || 0) === 0 &&
      (!d.statusType ||
        (d.statusType === 'ABSENT' &&
          (d.note === 'Nghỉ ca' || d.note === 'Nghỉ Chủ Nhật' || d.note === 'Chưa chấm công')));
    if (isFakeDefault) return;

    cleanDays[dayNum] = d;
    const st = d.statusType;
    const units = Number(d.workUnits || 0);
    if (st === 'LATE') {
      totalWorkDays += units > 0 ? units : 1;
    } else if (st !== 'ABSENT' && st !== 'LEAVE' && units > 0) {
      totalWorkDays += units;
    }
    totalOtHours += Number(d.otHours || 0);
  });

  // Làm tròn công đến 1 chữ số thập phân (vd: 24.5)
  totalWorkDays = Math.round(totalWorkDays * 10) / 10;
  const isMonthParticipating = totalWorkDays > 0 || totalOtHours > 0;

  const record: MonthlyAttendanceRecord = {
    monthKey,
    month,
    year,
    totalWorkDays,
    totalOtHours,
    days: cleanDays,
    lastSubmittedAt: new Date().toISOString(),
    submittedBy,
  };

  const monthlyAttendance = {
    ...(worker.monthlyAttendance || {}),
    [monthKey]: record,
  };

  // Đồng bộ sang TẤT CẢ các chu kỳ của tháng (1 tuần, 2 tuần và cả tháng)
  const allPeriods = [
    ...getPayrollPeriods(year, month, '1_WEEK'),
    ...getPayrollPeriods(year, month, '2_WEEKS'),
    ...getPayrollPeriods(year, month, '1_MONTH'),
  ];

  const periodRecords = { ...(worker.periodRecords || {}) };

  allPeriods.forEach((period) => {
    let pWorkDays = 0;
    let pOtHours = 0;

    const timesheet: WeeklyDayAttendance[] = period.dates.map((dateStr) => {
      const parts = dateStr.split('/');
      const dayNum = parseInt(parts[0], 10);
      const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : month;
      const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, year, month);
      const d = itemMonth === month ? cleanDays[dayNum] : undefined;
      const workUnits =
        d && d.statusType !== 'ABSENT' && d.statusType !== 'LEAVE'
          ? Number(d.workUnits || 0)
          : 0;
      const otHours = d ? Number(d.otHours || 0) : 0;
      pWorkDays += workUnits;
      pOtHours += otHours;
      const shiftType = d?.shiftType || 'DAY';
      const note =
        d?.note ||
        (workUnits > 0
          ? isSunday
            ? 'Làm ca Chủ Nhật'
            : 'Thi công tại công trường'
          : isSunday
          ? 'Nghỉ Chủ Nhật'
          : 'Nghỉ ca');

      return {
        dayOfWeek,
        dayName,
        dateLabel: dateStr,
        workUnits,
        otHours,
        shiftType,
        note,
      };
    });

    const roundedPeriodDays = Math.round(pWorkDays * 10) / 10;
    const isPeriodRecorded = roundedPeriodDays > 0 || pOtHours > 0;
    const periodDailyRate = getUnifiedWorkerDailyRate(worker);
    const salaryByDays = isPeriodRecorded ? Math.round(periodDailyRate * roundedPeriodDays) : 0;
    const hourlyRate = periodDailyRate / 8;
    const overtimePay = isPeriodRecorded ? Math.round(hourlyRate * pOtHours * 1.5) : 0;
    const mealAllowance = isPeriodRecorded ? Math.max(0, worker.mealAllowance || 0) : 0;
    const travelSafetyAllowance = isPeriodRecorded ? Math.max(0, worker.travelSafetyAllowance || 0) : 0;
    const otherBonus = isPeriodRecorded ? Math.max(0, worker.otherBonus || 0) : 0;
    const totalIncome = isPeriodRecorded
      ? salaryByDays + overtimePay + mealAllowance + travelSafetyAllowance + otherBonus
      : 0;
    let personalIncomeTax = 0;
    if (isPeriodRecorded && !worker.hasTaxCommitment && totalIncome >= 2000000) {
      personalIncomeTax = Math.round(totalIncome * 0.1);
    }
    const advancePayment = Math.max(0, worker.advancePayment || 0);
    const totalDeductions = personalIncomeTax + advancePayment;
    const netSalary = isPeriodRecorded ? Math.max(0, totalIncome - totalDeductions) : 0;

    const pRec: SeasonalPeriodRecord = {
      periodKey: period.periodKey,
      periodLabel: period.label,
      cycleType: period.cycleType,
      isRecorded: isPeriodRecorded,
      dailyRate: periodDailyRate,
      actualWorkDays: roundedPeriodDays,
      salaryByDays,
      overtimeHours: pOtHours,
      overtimePay,
      mealAllowance,
      travelSafetyAllowance,
      otherBonus,
      totalIncome,
      hasTaxCommitment: worker.hasTaxCommitment,
      personalIncomeTax,
      advancePayment,
      totalDeductions,
      netSalary,
      weeklyTimesheet: timesheet,
      notes: worker.notes,
    };

    periodRecords[period.periodKey] = pRec;
  });

  const unifiedDailyRate = getUnifiedWorkerDailyRate(worker);

  // Cập nhật công nhân và tính toán lại lương theo Thông tư 111
  const updatedWorker = recomputeSeasonalWorkerPayroll({
    ...worker,
    dailyRate: unifiedDailyRate,
    actualWorkDays: totalWorkDays,
    overtimeHours: totalOtHours,
    selectedForAttendance: isMonthParticipating,
    monthlyAttendance,
    periodRecords,
    attendanceMonth: month,
    attendanceYear: year,
  });

  // Nếu có weeklyTimesheet đang mở, đồng bộ lại các ngày trong tuần tương ứng (bao gồm cả khi ngày đó đã bị xóa)
  if (updatedWorker.weeklyTimesheet && updatedWorker.weeklyTimesheet.length > 0) {
    const updatedTimesheet: WeeklyDayAttendance[] = updatedWorker.weeklyTimesheet.map((dayItem) => {
      if (dayItem.dateLabel) {
        const parts = dayItem.dateLabel.split('/');
        const dayNum = parseInt(parts[0], 10);
        const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : month;
        if (itemMonth === month && !isNaN(dayNum)) {
          const d = cleanDays[dayNum];
          if (d) {
            return {
              ...dayItem,
              workUnits: d.statusType !== 'ABSENT' && d.statusType !== 'LEAVE' ? d.workUnits : 0,
              otHours: d.otHours,
              note: d.note,
              shiftType: d.shiftType,
            };
          } else {
            return {
              ...dayItem,
              workUnits: 0,
              otHours: 0,
              note: dayItem.dayOfWeek === 'CN' ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca',
              shiftType: 'DAY',
            };
          }
        }
      }
      return dayItem;
    });
    updatedWorker.weeklyTimesheet = updatedTimesheet;
  }

  return updatedWorker;
}

// URL Web App Public chính thức của ứng dụng cho công nhân và chia sẻ ngoài (ais-pre không yêu cầu đăng nhập Google)
const envAppUrl = (import.meta as any).env?.VITE_APP_URL || '';
export const SHARED_PUBLIC_APP_URL =
  envAppUrl && envAppUrl.startsWith('http')
    ? envAppUrl.replace(/\/$/, '').replace('ais-dev-', 'ais-pre-')
    : 'https://ais-pre-phjm5jxgxjrhlw6ojcsnfc-84463466708.asia-southeast1.run.app';
export const PUBLIC_APP_URL = SHARED_PUBLIC_APP_URL;

/**
 * Lấy URL gốc công khai của Web App để chia sẻ cho công nhân / thợ trên điện thoại
 * Đảm bảo liên kết luôn mở được trực tiếp, không bị lỗi 404 và không bắt đăng nhập Google
 */
export function getPublicBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. Tự động dọn dẹp nếu localStorage từng lưu nhầm domain aistudio.google.com
    try {
      const custom = localStorage.getItem('payroll_public_app_url');
      if (custom && custom.includes('aistudio.google.com')) {
        localStorage.removeItem('payroll_public_app_url');
      } else if (custom && custom.startsWith('http') && !custom.includes('aistudio.google.com')) {
        return custom.replace(/\/$/, '').replace('ais-dev-', 'ais-pre-');
      }
    } catch {}

    const origin = window.location.origin || '';

    // 2. Nếu đang mở trực tiếp trên app (*.run.app)
    if (origin.includes('.run.app') && !origin.includes('aistudio.google.com')) {
      // BẮT BUỘC thay ais-dev- bằng ais-pre- để điện thoại của thợ mở trực tiếp không bị Google chặn đăng nhập
      return origin.replace('ais-dev-', 'ais-pre-');
    }

    // 3. Nếu đang mở trên localhost: dùng chính origin để test trực tiếp
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }

    // 4. Nếu đang trong AI Studio (aistudio.google.com), iframe:
    if (envAppUrl && envAppUrl.startsWith('http') && !envAppUrl.includes('aistudio.google.com')) {
      return envAppUrl.replace(/\/$/, '').replace('ais-dev-', 'ais-pre-');
    }

    return SHARED_PUBLIC_APP_URL;
  }
  return SHARED_PUBLIC_APP_URL;
}

/**
 * Sinh đường dẫn Link web app chấm công riêng trên điện thoại
 * Tự động nhúng thông tin nhân sự (mã, họ tên, vị trí) và tháng hiện hành thực tế
 * Tự động nhúng cấu hình Supabase Cloud (nếu có) để máy điện thoại của thợ tự kết nối đồng bộ Realtime về máy chủ!
 */
export function generateShareableAttendanceUrl(
  workerCodeOrWorker?: string | SeasonalWorker,
  options?: {
    worker?: SeasonalWorker;
    month?: number;
    year?: number;
    includeConfig?: boolean;
    forceOrigin?: string;
  }
): string {
  let baseUrl = options?.forceOrigin || getPublicBaseUrl();
  // Bảo đảm không bao giờ xuất hiện domain dev trong link chia sẻ công nhân
  if (!options?.forceOrigin && baseUrl.includes('ais-dev-')) {
    baseUrl = baseUrl.replace('ais-dev-', 'ais-pre-');
  }

  const workerObj =
    typeof workerCodeOrWorker === 'object' && workerCodeOrWorker !== null
      ? workerCodeOrWorker
      : options?.worker;
  const workerCode =
    typeof workerCodeOrWorker === 'string'
      ? workerCodeOrWorker
      : workerObj?.code;

  // Luôn ưu tiên tháng và năm hiện hành thực tế (thời gian thực theo lịch, ví dụ Tháng 11/2026)
  const now = new Date();
  const targetMonth = options?.month ?? (now.getMonth() + 1);
  const targetYear = options?.year ?? now.getFullYear();

  const params = new URLSearchParams();
  params.set('view', 'chamcong');

  if (workerCode) {
    params.set('worker', workerCode);
  }
  if (workerObj?.fullName) {
    params.set('name', workerObj.fullName);
  }
  if (workerObj?.trade) {
    params.set('trade', workerObj.trade);
  }
  if (workerObj?.project) {
    params.set('project', workerObj.project);
  }
  if (workerObj?.teamName) {
    params.set('team', workerObj.teamName);
  }

  params.set('m', String(targetMonth));
  params.set('y', String(targetYear));

  // Đính kèm hash #chamcong để bất kỳ trình duyệt di động nào bị redirect vẫn giữ nguyên 100% trang chấm công và tên thợ
  let hashPart = `chamcong${workerCode ? `&worker=${encodeURIComponent(workerCode)}` : ''}`;
  if (workerObj?.fullName) {
    hashPart += `&name=${encodeURIComponent(workerObj.fullName)}`;
  }
  if (workerObj?.trade) {
    hashPart += `&trade=${encodeURIComponent(workerObj.trade)}`;
  }
  if (workerObj?.project) {
    hashPart += `&project=${encodeURIComponent(workerObj.project)}`;
  }

  // Tự động đính kèm cấu hình Supabase nếu có
  if (options?.includeConfig !== false && isSupabaseConfigured()) {
    const { url, anonKey } = getSupabaseConfig();
    if (url && anonKey) {
      hashPart += `&sb_url=${encodeURIComponent(url)}&sb_key=${encodeURIComponent(anonKey)}`;
    }
  }

  return `${baseUrl}/?${params.toString()}#${hashPart}`;
}

/**
 * Tạo nội dung tin nhắn gửi Zalo cho công nhân
 */
export function generateZaloShareMessage(
  worker: SeasonalWorker,
  month: number,
  year: number,
  shareUrl: string
): string {
  const mStr = String(month).padStart(2, '0');
  return `[PNCONS - THÔNG BÁO CHẤM CÔNG DI ĐỘNG]
Kính gửi anh/chị: ${worker.fullName} (Mã: ${worker.code})
Vị trí: ${worker.trade} - ${worker.teamName || 'Đội thi công'}
Dự án: ${worker.project || 'Công trình PNCONS'}

Công ty gửi đường link Bảng chấm công trên điện thoại tháng ${mStr}/${year}:
👉 ${shareUrl}

* Hướng dẫn:
1. Nhấp vào link trên điện thoại (không cần cài đặt app).
2. Chạm vào từng ngày để chấm công đi làm (1 công / nửa ca) và nhập giờ tăng ca (OT).
3. Bấm "Xác nhận & Lưu", dữ liệu sẽ được tự động gửi về hệ thống quản lý công trường.

Trân trọng!`;
}
