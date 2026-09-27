import {
  SeasonalWorker,
  DailyAttendanceDetail,
  MonthlyAttendanceRecord,
  WeeklyDayAttendance,
} from '../types';
import { getDayOfWeekInfo, recomputeSeasonalWorkerPayroll } from '../data/mockSeasonalWorkers';
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
    return worker.monthlyAttendance[monthKey];
  }

  // Nếu chưa có bản ghi tháng, tự động tạo mới
  const daysInMonth = getDaysInMonth(year, month);
  const days: { [dayNumber: number]: DailyAttendanceDetail } = {};

  // Kiểm tra xem công nhân đã có số công trong kỳ này chưa
  const hasExistingWorkDays = (worker.actualWorkDays || 0) > 0;
  let remainingDays = hasExistingWorkDays ? worker.actualWorkDays : 0;
  let remainingOT = hasExistingWorkDays ? (worker.overtimeHours || 0) : 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const dateLabel = `${dStr}/${mStr}`;
    const dayInfo = getDayOfWeekInfo(dateLabel, year, month);

    let dayWork = 0;
    let dayOT = 0;

    // Nếu công nhân đã có số công ghi nhận trước đó, điền vào các ngày T2 - T7
    if (remainingDays >= 1 && !dayInfo.isSunday) {
      dayWork = 1;
      remainingDays -= 1;
    } else if (remainingDays >= 0.5 && !dayInfo.isSunday) {
      dayWork = 0.5;
      remainingDays -= 0.5;
    }

    if (dayWork > 0 && remainingOT > 0) {
      dayOT = Math.min(remainingOT, 4);
      remainingOT -= dayOT;
    }

    days[d] = {
      day: d,
      dateStr: `${dStr}/${mStr}/${year}`,
      workUnits: dayWork,
      otHours: dayOT,
      note: dayWork > 0 ? (dayOT > 0 ? `Thi công + ${dayOT}h OT` : 'Thi công bình thường') : (dayInfo.isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
      shiftType: 'DAY',
      updatedAt: new Date().toISOString(),
    };
  }

  // Tính tổng công và OT thực tế
  let totalWorkDays = 0;
  let totalOtHours = 0;
  Object.values(days).forEach((d) => {
    totalWorkDays += d.workUnits || 0;
    totalOtHours += d.otHours || 0;
  });

  return {
    monthKey,
    month,
    year,
    totalWorkDays,
    totalOtHours,
    days,
    lastSubmittedAt: undefined,
  };
}

/**
 * Cập nhật chấm công tháng của công nhân, tính lại lương và đồng bộ bảng tuần
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

  let totalWorkDays = 0;
  let totalOtHours = 0;

  Object.values(days).forEach((d) => {
    totalWorkDays += Number(d.workUnits || 0);
    totalOtHours += Number(d.otHours || 0);
  });

  // Làm tròn công đến 1 chữ số thập phân (vd: 24.5)
  totalWorkDays = Math.round(totalWorkDays * 10) / 10;

  const record: MonthlyAttendanceRecord = {
    monthKey,
    month,
    year,
    totalWorkDays,
    totalOtHours,
    days,
    lastSubmittedAt: new Date().toISOString(),
    submittedBy,
  };

  const monthlyAttendance = {
    ...(worker.monthlyAttendance || {}),
    [monthKey]: record,
  };

  // Cập nhật công nhân và tính toán lại lương theo Thông tư 111
  const updatedWorker = recomputeSeasonalWorkerPayroll({
    ...worker,
    actualWorkDays: totalWorkDays,
    overtimeHours: totalOtHours,
    monthlyAttendance,
    attendanceMonth: month,
    attendanceYear: year,
  });

  // Nếu có weeklyTimesheet đang mở, đồng bộ lại các ngày trong tuần tương ứng
  if (updatedWorker.weeklyTimesheet && updatedWorker.weeklyTimesheet.length > 0) {
    const updatedTimesheet: WeeklyDayAttendance[] = updatedWorker.weeklyTimesheet.map((dayItem) => {
      if (dayItem.dateLabel) {
        const dayNum = parseInt(dayItem.dateLabel.split('/')[0], 10);
        if (days[dayNum]) {
          return {
            ...dayItem,
            workUnits: days[dayNum].workUnits,
            otHours: days[dayNum].otHours,
            note: days[dayNum].note,
            shiftType: days[dayNum].shiftType,
          };
        }
      }
      return dayItem;
    });
    updatedWorker.weeklyTimesheet = updatedTimesheet;
  }

  return updatedWorker;
}

// URL Web App Public chính thức của ứng dụng trên Google Cloud Run
export const PUBLIC_APP_URL = 'https://ais-pre-phjm5jxgxjrhlw6ojcsnfc-84463466708.asia-southeast1.run.app';

/**
 * Lấy URL gốc công khai của Web App để chia sẻ cho công nhân / thợ trên điện thoại
 * Tránh lỗi 404 trên máy chủ nội bộ aistudio.google.com
 */
export function getPublicBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. Nếu người dùng cấu hình URL tùy chỉnh trong bộ nhớ
    try {
      const custom = localStorage.getItem('payroll_public_app_url');
      if (custom && custom.startsWith('http')) {
        return custom.replace(/\/$/, '');
      }
    } catch {}

    const origin = window.location.origin || '';

    // 2. Nếu đang mở trực tiếp trên domain Cloud Run (*.run.app)
    if (origin.includes('.run.app')) {
      return origin;
    }

    // 3. Nếu đang trong AI Studio (aistudio.google.com), iframe hoặc localhost,
    // BẮT BUỘC dùng domain Public Cloud Run để khi gửi link Zalo cho thợ mở trên điện thoại không bị 404
    return PUBLIC_APP_URL;
  }
  return PUBLIC_APP_URL;
}

/**
 * Sinh đường dẫn Link web app chấm công riêng trên điện thoại
 * Tự động nhúng cấu hình Supabase Cloud (nếu có) để máy điện thoại của thợ tự kết nối đồng bộ Realtime về máy chủ!
 */
export function generateShareableAttendanceUrl(
  workerCode?: string,
  options?: {
    month?: number;
    year?: number;
    includeConfig?: boolean;
  }
): string {
  const baseUrl = getPublicBaseUrl();

  const params = new URLSearchParams();
  params.set('view', 'chamcong');

  if (workerCode) {
    params.set('worker', workerCode);
  }
  if (options?.month) {
    params.set('m', String(options.month));
  }
  if (options?.year) {
    params.set('y', String(options.year));
  }

  // Đính kèm cả hash #chamcong để bất kỳ trình duyệt di động nào bị redirect 302 vẫn giữ nguyên 100% trang chấm công
  let hashPart = `chamcong${workerCode ? `&worker=${workerCode}` : ''}`;

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
