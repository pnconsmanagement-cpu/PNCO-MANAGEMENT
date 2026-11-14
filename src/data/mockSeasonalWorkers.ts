import {
  SeasonalWorker,
  WeeklyDayAttendance,
  SeasonalCycleType,
  SeasonalPeriodRecord,
  PayrollPeriodOption,
  TeamPaymentVoucher,
} from '../types';

export type { PayrollPeriodOption, TeamPaymentVoucher };

export interface MonthWeekOption {
  id: string; // 'W1' | 'W2' | 'W3' | 'W4' | 'W5'
  weekNum: number;
  label: string; // "Tuần 1 (01/09 - 07/09)"
  shortLabel: string; // "Tuần 1"
  startDay: number;
  endDay: number;
  dates: string[]; // ['01/09', '02/09', '03/09', '04/09', '05/09', '06/09', '07/09']
}

/**
 * Lấy thông tin thứ trong tuần và định dạng ngày chính xác từ chuỗi ngày (vd: '01/09', '31/08') và năm
 * Tính toán trực tiếp bằng JavaScript Date để khớp 100% với lịch thực tế
 */
export function getDayOfWeekInfo(
  dateStr: string,
  periodYear: number = 2026,
  periodMonth?: number
): { dayOfWeek: string; dayName: string; isSunday: boolean } {
  let d = 1;
  let m = periodMonth || 9;
  let y = periodYear;

  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    if (parts.length >= 3) {
      y = parseInt(parts[2], 10);
    } else if (periodMonth) {
      // Xử lý giáp hạt năm (Tháng 12 sang Tháng 1)
      if (periodMonth === 1 && m === 12) y = periodYear - 1;
      else if (periodMonth === 12 && m === 1) y = periodYear + 1;
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  }

  // Sử dụng 12:00 trưa để đảm bảo không bị lệch múi giờ (DST / Timezone GMT+7)
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const dayIdx = dateObj.getDay(); // 0 = Chủ Nhật, 1 = Thứ Hai, 2 = Thứ Ba, 3 = Thứ Tư, 4 = Thứ Năm, 5 = Thứ Sáu, 6 = Thứ Bảy

  const dayOfWeeks = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

  return {
    dayOfWeek: dayOfWeeks[dayIdx],
    dayName: dayNames[dayIdx],
    isSunday: dayIdx === 0,
  };
}

/**
 * Tính toán danh sách các tuần trong bất kỳ Tháng & Năm nào (Lương 1 tuần)
 * Chuẩn lịch tuần Thứ Hai đến Chủ Nhật (Monday to Sunday) khớp 100% lịch thực tế
 */
export function getWeeksForMonth(year: number, month: number): MonthWeekOption[] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0); // Ngày cuối cùng của tháng

  // Tìm ngày Thứ Hai của tuần chứa ngày 1 của tháng
  const firstDayOfWeek = firstDay.getDay(); // 0 là CN, 1 là T2...
  const diffToMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
  const startMonday = new Date(year, month - 1, 1 + diffToMonday);

  const weeks: MonthWeekOption[] = [];
  const curMonday = new Date(startMonday.getFullYear(), startMonday.getMonth(), startMonday.getDate());
  let wNum = 1;

  while (curMonday <= lastDay) {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(curMonday.getFullYear(), curMonday.getMonth(), curMonday.getDate() + i);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      dates.push(`${dd}/${mm}`);
    }

    const startStr = dates[0];
    const endStr = dates[6];
    const id = `W${wNum}`;

    weeks.push({
      id,
      weekNum: wNum,
      label: `Tuần ${wNum} (${startStr} - ${endStr})`,
      shortLabel: `Tuần ${wNum}`,
      startDay: parseInt(dates[0].split('/')[0], 10),
      endDay: parseInt(dates[6].split('/')[0], 10),
      dates,
    });

    wNum++;
    curMonday.setDate(curMonday.getDate() + 7);
  }

  return weeks;
}

/**
 * Tính toán danh sách các đợt 2 tuần (Lương 2 tuần / Nửa tháng)
 * Đợt 1: Ngày 01 - 15
 * Đợt 2: Ngày 16 - Cuối tháng (28/29/30/31)
 */
export function getBiWeeklyPeriodsForMonth(year: number, month: number): PayrollPeriodOption[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mStr = String(month).padStart(2, '0');
  const yStr = String(year);

  // Đợt 1: 01 -> 15
  const d1Dates: string[] = [];
  for (let i = 1; i <= 15; i++) {
    d1Dates.push(`${String(i).padStart(2, '0')}/${mStr}`);
  }

  // Đợt 2: 16 -> daysInMonth
  const d2Dates: string[] = [];
  for (let i = 16; i <= daysInMonth; i++) {
    d2Dates.push(`${String(i).padStart(2, '0')}/${mStr}`);
  }

  return [
    {
      id: 'BI1',
      periodKey: `${yStr}-${mStr}_BI1`,
      cycleType: '2_WEEKS',
      label: `Đợt 1 (01/${mStr} - 15/${mStr})`,
      shortLabel: 'Đợt 1 (1 - 15)',
      startDate: `01/${mStr}`,
      endDate: `15/${mStr}`,
      startDay: 1,
      endDay: 15,
      dates: d1Dates,
      maxStandardDays: 13,
      year,
      month,
    },
    {
      id: 'BI2',
      periodKey: `${yStr}-${mStr}_BI2`,
      cycleType: '2_WEEKS',
      label: `Đợt 2 (16/${mStr} - ${daysInMonth}/${mStr})`,
      shortLabel: `Đợt 2 (16 - ${daysInMonth})`,
      startDate: `16/${mStr}`,
      endDate: `${daysInMonth}/${mStr}`,
      startDay: 16,
      endDay: daysInMonth,
      dates: d2Dates,
      maxStandardDays: daysInMonth - 15 >= 15 ? 13 : 12,
      year,
      month,
    },
  ];
}

/**
 * Tính toán kỳ thanh toán cả tháng (Lương Tháng / Toàn bộ tháng)
 * Từ ngày 01 đến ngày cuối cùng của tháng (28/29/30/31)
 */
export function getMonthlyPeriodForMonth(year: number, month: number): PayrollPeriodOption[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mStr = String(month).padStart(2, '0');
  const yStr = String(year);

  const monthDates: string[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    monthDates.push(`${String(i).padStart(2, '0')}/${mStr}`);
  }

  return [
    {
      id: 'M1',
      periodKey: `${yStr}-${mStr}_MONTH`,
      cycleType: '1_MONTH',
      label: `Cả tháng ${mStr}/${year} (01/${mStr} - ${daysInMonth}/${mStr})`,
      shortLabel: `Cả tháng ${mStr}`,
      startDate: `01/${mStr}`,
      endDate: `${daysInMonth}/${mStr}`,
      startDay: 1,
      endDay: daysInMonth,
      dates: monthDates,
      maxStandardDays: 26,
      year,
      month,
    },
  ];
}

/**
 * Lấy danh sách các kỳ thanh toán theo loại chu kỳ (1 tuần, 2 tuần hoặc cả tháng)
 */
export function getPayrollPeriods(
  year: number,
  month: number,
  cycleType: SeasonalCycleType = '1_WEEK'
): PayrollPeriodOption[] {
  const mStr = String(month).padStart(2, '0');
  const yStr = String(year);

  if (cycleType === '1_MONTH' || cycleType === 'TEAM') {
    return getMonthlyPeriodForMonth(year, month).map((p) => ({
      ...p,
      cycleType,
    }));
  }

  if (cycleType === '2_WEEKS') {
    return getBiWeeklyPeriodsForMonth(year, month);
  }

  const weeks = getWeeksForMonth(year, month);
  return weeks.map((w) => ({
    id: w.id,
    periodKey: `${yStr}-${mStr}_${w.id}`,
    cycleType: '1_WEEK',
    label: w.label,
    shortLabel: w.shortLabel,
    startDate: w.dates[0],
    endDate: w.dates[w.dates.length - 1],
    startDay: w.startDay,
    endDay: w.endDay,
    dates: w.dates,
    maxStandardDays: 6,
    year,
    month,
  }));
}

/**
 * Tạo bảng chấm công trống (0 công) cho một chu kỳ để người dùng chấm lại từ đầu
 * Khớp đúng thứ trong tuần thực tế theo từng ngày
 */
export function createEmptyTimesheetForPeriod(period: PayrollPeriodOption): WeeklyDayAttendance[] {
  const pYear = period.year || parseInt(period.periodKey?.split('-')[0], 10) || 2026;
  const pMonth = period.month || parseInt(period.periodKey?.split('-')[1]?.split('_')[0], 10) || 9;

  return period.dates.map((dateStr) => {
    const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, pYear, pMonth);

    return {
      dayOfWeek,
      dayName,
      dateLabel: dateStr,
      workUnits: 0, // Mặc định 0 công
      otHours: 0,
      shiftType: 'DAY',
      note: isSunday ? 'Nghỉ Chủ Nhật' : 'Chưa chấm công',
    };
  });
}

/**
 * Tạo bảng chấm công có số công và OT cho một chu kỳ
 * Ưu tiên điền công vào các ngày Thứ Hai đến Thứ Bảy, Chủ Nhật nghỉ
 */
export function createTimesheetForPeriod(
  period: PayrollPeriodOption,
  workDays: number = 0,
  otHours: number = 0
): WeeklyDayAttendance[] {
  const pYear = period.year || parseInt(period.periodKey?.split('-')[0], 10) || 2026;
  const pMonth = period.month || parseInt(period.periodKey?.split('-')[1]?.split('_')[0], 10) || 9;

  // Đếm tổng số ngày T2 - T7 thuộc đúng tháng của kỳ
  const dateMetaList = period.dates.map((dateStr) => {
    const parts = dateStr.split('/');
    const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : pMonth;
    const isSameMonth = itemMonth === pMonth;
    const info = getDayOfWeekInfo(dateStr, pYear, pMonth);
    return {
      dateStr,
      isSameMonth,
      ...info,
    };
  });

  const nonSundayCount = dateMetaList.filter((d) => d.isSameMonth && !d.isSunday).length;
  let remainingNonSunday = Math.min(Math.max(0, workDays), nonSundayCount);
  let remainingSunday = Math.max(0, workDays - nonSundayCount);
  let remainingOT = Math.max(0, otHours);

  return dateMetaList.map((meta) => {
    const { dateStr, isSameMonth, dayOfWeek, dayName, isSunday } = meta;
    let dayWork = 0;

    // Ưu tiên tuyệt đối điền công vào các ngày Thứ Hai đến Thứ Bảy (!isSunday), chỉ điền Chủ Nhật nếu số công > số ngày T2-T7
    if (isSameMonth) {
      if (!isSunday) {
        if (remainingNonSunday >= 1) {
          dayWork = 1;
          remainingNonSunday -= 1;
        } else if (remainingNonSunday >= 0.5) {
          dayWork = 0.5;
          remainingNonSunday -= 0.5;
        }
      } else {
        if (remainingSunday >= 1) {
          dayWork = 1;
          remainingSunday -= 1;
        } else if (remainingSunday >= 0.5) {
          dayWork = 0.5;
          remainingSunday -= 0.5;
        }
      }
    }

    let dayOT = 0;
    if (isSameMonth && dayWork > 0 && remainingOT > 0) {
      dayOT = Math.min(remainingOT, 4);
      remainingOT -= dayOT;
    }

    return {
      dayOfWeek,
      dayName,
      dateLabel: dateStr,
      workUnits: dayWork,
      otHours: dayOT,
      shiftType: 'DAY',
      note: dayWork > 0
        ? (dayOT > 0 ? `Thi công + ${dayOT}h OT` : (isSunday ? 'Làm ca Chủ Nhật' : 'Thi công bình thường'))
        : (isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
    };
  });
}

/**
 * Tạo bảng chấm công 7 ngày tương ứng với Tháng, Năm và Tuần được chọn
 */
export function createWeeklyTimesheetForWeek(
  year: number = 2026,
  month: number = 9,
  weekId: string = 'W2',
  workDays: number = 6,
  otHours: number = 0
): WeeklyDayAttendance[] {
  const periods = getPayrollPeriods(year, month, '1_WEEK');
  const period = periods.find((p) => p.id === weekId) || periods[0];
  return createTimesheetForPeriod(period, workDays, otHours);
}

/**
 * Tạo bảng chấm công 7 ngày trong tuần mặc định (Thứ Hai -> Chủ Nhật)
 */
export function createDefaultWeeklyTimesheet(workDays: number = 6, otHours: number = 0): WeeklyDayAttendance[] {
  return createWeeklyTimesheetForWeek(2026, 9, 'W2', workDays, otHours);
}

/**
 * Tự động tính toán tiền lương, phụ cấp, OT, thuế TNCN và thực lĩnh của công nhân kỹ thuật thời vụ
 * Tuân thủ Thông tư 111/2013/TT-BTC về thuế TNCN với lao động thời vụ / khoán việc:
 * - Nếu không có Cam kết 08/CK-TNCN và tổng thu nhập từ 2.000.000đ trở lên: Khấu trừ 10%
 * - Nếu đã ký Cam kết 08/CK-TNCN: Tạm thời không khấu trừ thuế 10%
 */
export function normalizeSingleTeamVoucher(
  v: Partial<TeamPaymentVoucher>,
  fallbackWorker: Partial<SeasonalWorker>,
  orderIndex: number
): TeamPaymentVoucher {
  const sal = Math.max(0, Math.round(Number(v.salaryByDays ?? 0)));
  const bonus = Math.max(0, Math.round(Number(v.otherBonus ?? 0)));
  const adv = Math.max(0, Math.round(Number(v.advancePayment ?? 0)));
  const totInc = sal + bonus;
  const hasTax = v.hasTaxCommitment ?? fallbackWorker.hasTaxCommitment ?? true;
  const tax = !hasTax && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
  const totDed = tax + adv;
  const net = Math.max(0, totInc - totDed);
  return {
    id:
      v.id ||
      `TVOUCHER_${Date.now()}_${orderIndex}_${Math.random().toString(36).slice(2, 7)}`,
    ...(v.batchCode ? { batchCode: String(v.batchCode).trim() } : {}),
    ...(v.batchTitle ? { batchTitle: String(v.batchTitle).trim() } : {}),
    orderIndex,
    paymentDate: String(v.paymentDate || fallbackWorker.paymentDate || '').trim(),
    project: String(v.project || fallbackWorker.project || '').trim(),
    salaryByDays: sal,
    otherBonus: bonus,
    advancePayment: adv,
    hasTaxCommitment: hasTax,
    personalIncomeTax: tax,
    totalIncome: totInc,
    totalDeductions: totDed,
    netSalary: net,
    notes: v.notes,
    updatedAt: v.updatedAt || Date.now(),
  };
}

export function extractTeamPeriodVouchers(
  rec: SeasonalPeriodRecord | undefined,
  fallbackWorker: Partial<SeasonalWorker>
): TeamPaymentVoucher[] {
  if (!rec) return [];
  if (Array.isArray(rec.teamVouchers)) {
    if (rec.teamVouchers.length === 0) return [];
    return rec.teamVouchers.map((v, idx) =>
      normalizeSingleTeamVoucher(v, fallbackWorker, idx + 1)
    );
  }
  const hasLegacyActivity =
    Boolean(rec.isRecorded) ||
    Number(rec.salaryByDays || 0) > 0 ||
    Number(rec.actualWorkDays || 0) > 0;
  if (!hasLegacyActivity) return [];

  const legacySalary =
    rec.salaryByDays !== undefined &&
    rec.salaryByDays > 0 &&
    (!rec.actualWorkDays || rec.actualWorkDays === 1)
      ? Number(rec.salaryByDays)
      : Number(rec.salaryByDays || rec.dailyRate || 0);
  const legacyBonus =
    Number(rec.mealAllowance || 0) +
    Number(rec.travelSafetyAllowance || 0) +
    Number(rec.otherBonus || 0);
  return [
    normalizeSingleTeamVoucher(
      {
        id: `LEGACY_${rec.periodKey || 'TEAM_M1'}`,
        orderIndex: 1,
        paymentDate: rec.paymentDate || fallbackWorker.paymentDate || '',
        project: rec.project || fallbackWorker.project || '',
        salaryByDays: legacySalary,
        otherBonus: legacyBonus,
        advancePayment: Number(rec.advancePayment || 0),
        hasTaxCommitment: rec.hasTaxCommitment ?? fallbackWorker.hasTaxCommitment ?? true,
        notes: rec.notes,
        updatedAt: rec.updatedAt || 0,
      },
      fallbackWorker,
      1
    ),
  ];
}

export function getTeamWorkerVouchersForMonth(
  worker: SeasonalWorker | undefined,
  month: number,
  year: number
): TeamPaymentVoucher[] {
  if (!worker) return [];
  const monthKey = `${year}-${String(month).padStart(2, '0')}_MONTH`;
  const rec = worker.periodRecords?.[monthKey];
  return extractTeamPeriodVouchers(rec, worker);
}

export function buildTeamPeriodRecordFromVouchers(
  rawWorker: SeasonalWorker,
  period: PayrollPeriodOption,
  rawVouchers: Partial<TeamPaymentVoucher>[]
): SeasonalWorker {
  const worker = sanitizeSeasonalWorkerAttendance(rawWorker);
  const pKey = period.periodKey;
  const emptySheet = createEmptyTimesheetForPeriod(period);
  const normalizedVouchers = rawVouchers.map((v, idx) =>
    normalizeSingleTeamVoucher(v, worker, idx + 1)
  );
  const hasVouchers = normalizedVouchers.length > 0;
  const sumSalaryByDays = normalizedVouchers.reduce((s, v) => s + (v.salaryByDays || 0), 0);
  const sumOtherBonus = normalizedVouchers.reduce((s, v) => s + (v.otherBonus || 0), 0);
  const sumTotalIncome = normalizedVouchers.reduce((s, v) => s + (v.totalIncome || 0), 0);
  const sumTax = normalizedVouchers.reduce((s, v) => s + (v.personalIncomeTax || 0), 0);
  const sumAdvance = normalizedVouchers.reduce((s, v) => s + (v.advancePayment || 0), 0);
  const sumDeductions = normalizedVouchers.reduce((s, v) => s + (v.totalDeductions || 0), 0);
  const sumNet = normalizedVouchers.reduce((s, v) => s + (v.netSalary || 0), 0);
  const latestVoucher = hasVouchers
    ? normalizedVouchers[normalizedVouchers.length - 1]
    : undefined;
  const nowTs = Date.now();

  const periodRecord: SeasonalPeriodRecord = {
    periodKey: pKey,
    periodLabel: period.label,
    cycleType: 'TEAM',
    isRecorded: hasVouchers,
    dailyRate: 0,
    project: latestVoucher?.project || worker.project,
    paymentDate: latestVoucher?.paymentDate || worker.paymentDate,
    actualWorkDays: hasVouchers ? 1 : 0,
    salaryByDays: sumSalaryByDays,
    overtimeHours: 0,
    overtimePay: 0,
    mealAllowance: 0,
    travelSafetyAllowance: 0,
    otherBonus: sumOtherBonus,
    totalIncome: sumTotalIncome,
    hasTaxCommitment: worker.hasTaxCommitment ?? true,
    personalIncomeTax: sumTax,
    advancePayment: sumAdvance,
    totalDeductions: sumDeductions,
    netSalary: sumNet,
    weeklyTimesheet: emptySheet,
    notes: latestVoucher?.notes ?? worker.notes,
    teamVouchers: normalizedVouchers,
    updatedAt: nowTs,
  };

  return {
    ...worker,
    payrollCycleType: 'TEAM',
    project: latestVoucher?.project || worker.project,
    paymentDate: latestVoucher?.paymentDate || worker.paymentDate,
    dailyRate: 0,
    actualWorkDays: hasVouchers ? 1 : 0,
    salaryByDays: sumSalaryByDays,
    overtimeHours: 0,
    overtimePay: 0,
    mealAllowance: 0,
    travelSafetyAllowance: 0,
    otherBonus: sumOtherBonus,
    totalIncome: sumTotalIncome,
    personalIncomeTax: sumTax,
    advancePayment: sumAdvance,
    totalDeductions: sumDeductions,
    netSalary: sumNet,
    selectedForAttendance: hasVouchers,
    currentPeriodKey: pKey,
    currentWeekId: period.id,
    currentWeekLabel: period.label,
    weeklyTimesheet: emptySheet,
    teamVouchers: normalizedVouchers,
    periodRecords: {
      ...(worker.periodRecords || {}),
      [pKey]: periodRecord,
    },
    updatedAt: nowTs,
  };
}

export function recomputeSeasonalWorkerPayroll(worker: SeasonalWorker): SeasonalWorker {
  const isTeamCycle = worker.payrollCycleType === 'TEAM';

  // Nếu là tổng hợp tháng của nhân sự Tổ Đội có danh sách teamVouchers (không phải 1 dòng đợt lẻ activeVoucherId)
  if (isTeamCycle && !worker.activeVoucherId && Array.isArray(worker.teamVouchers)) {
    if (worker.teamVouchers.length === 0) {
      const adv = Math.max(0, worker.advancePayment || 0);
      return {
        ...worker,
        dailyRate: 0,
        actualWorkDays: 0,
        salaryByDays: 0,
        overtimeHours: 0,
        overtimePay: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus: 0,
        totalIncome: 0,
        personalIncomeTax: 0,
        advancePayment: adv,
        totalDeductions: adv,
        netSalary: 0,
        selectedForAttendance: false,
      };
    }
    const normalized = worker.teamVouchers.map((v, idx) =>
      normalizeSingleTeamVoucher(v, worker, idx + 1)
    );
    const sumSal = normalized.reduce((s, v) => s + (v.salaryByDays || 0), 0);
    const sumBonus = normalized.reduce((s, v) => s + (v.otherBonus || 0), 0);
    const sumInc = normalized.reduce((s, v) => s + (v.totalIncome || 0), 0);
    const sumTax = normalized.reduce((s, v) => s + (v.personalIncomeTax || 0), 0);
    const sumVoucherAdv = normalized.reduce((s, v) => s + (v.advancePayment || 0), 0);
    const effectiveAdv = Math.max(sumVoucherAdv, Math.max(0, worker.advancePayment || 0));
    const totalDed = sumTax + effectiveAdv;
    const latest = normalized[normalized.length - 1];
    return {
      ...worker,
      project: latest?.project || worker.project,
      paymentDate: latest?.paymentDate || worker.paymentDate,
      dailyRate: 0,
      actualWorkDays: 1,
      salaryByDays: sumSal,
      overtimeHours: 0,
      overtimePay: 0,
      mealAllowance: 0,
      travelSafetyAllowance: 0,
      otherBonus: sumBonus,
      totalIncome: sumInc,
      personalIncomeTax: sumTax,
      advancePayment: effectiveAdv,
      totalDeductions: totalDed,
      netSalary: Math.max(0, sumInc - totalDed),
      teamVouchers: normalized,
      selectedForAttendance: true,
    };
  }

  const dailyRate = isTeamCycle ? 0 : Math.max(0, worker.dailyRate || 0);
  const actualWorkDays = Math.max(0, worker.actualWorkDays || 0);
  const overtimeHours = isTeamCycle ? 0 : Math.max(0, worker.overtimeHours || 0);
  const advancePayment = Math.max(0, worker.advancePayment || 0);
  const mealAllowance = isTeamCycle ? 0 : Math.max(0, worker.mealAllowance || 0);
  const travelSafetyAllowance = isTeamCycle ? 0 : Math.max(0, worker.travelSafetyAllowance || 0);
  const otherBonus = Math.max(0, worker.otherBonus || 0);

  const directTeamSalary = isTeamCycle
    ? Math.max(0, Math.round(Number(worker.salaryByDays || worker.dailyRate || 0)))
    : 0;

  // Nếu nhân sự chưa tham gia chấm công (0 công, 0 giờ OT): Bản lương để 0 đ cho đến khi có chấm công (trừ Tổ Đội đã có lương kỳ)
  const hasParticipated = isTeamCycle
    ? directTeamSalary > 0 || Boolean(worker.selectedForAttendance && actualWorkDays > 0)
    : actualWorkDays > 0 || overtimeHours > 0;
  if (!hasParticipated) {
    return {
      ...worker,
      dailyRate: isTeamCycle ? 0 : dailyRate,
      actualWorkDays: 0,
      salaryByDays: 0,
      overtimeHours: 0,
      overtimePay: 0,
      mealAllowance,
      travelSafetyAllowance,
      otherBonus,
      totalIncome: 0,
      personalIncomeTax: 0,
      advancePayment,
      totalDeductions: advancePayment,
      netSalary: 0,
    };
  }

  // 1. Tiền lương theo ngày công (hoặc lương theo kỳ đối với Tổ Đội, không nhân đơn giá ngày công)
  const salaryByDays = isTeamCycle ? directTeamSalary : Math.round(dailyRate * actualWorkDays);

  // 2. Tiền làm thêm giờ (Đơn giá 1 giờ = Đơn giá ngày / 8 giờ, hệ số OT x 1.5; Tổ Đội không tính OT ngày)
  const hourlyRate = dailyRate / 8;
  const overtimePay = isTeamCycle ? 0 : Math.round(hourlyRate * overtimeHours * 1.5);

  // 3. Tổng thu nhập
  const totalIncome = salaryByDays + overtimePay + mealAllowance + travelSafetyAllowance + otherBonus;

  // 4. Thuế TNCN thời vụ (10% nếu không có Cam kết 08 và tổng thu nhập >= 2.000.000đ)
  let personalIncomeTax = 0;
  if (!worker.hasTaxCommitment && totalIncome >= 2000000) {
    personalIncomeTax = Math.round(totalIncome * 0.1);
  }

  // 5. Tổng khấu trừ
  const totalDeductions = personalIncomeTax + advancePayment;

  // 6. Thực lĩnh thanh toán
  const netSalary = Math.max(0, totalIncome - totalDeductions);

  return {
    ...worker,
    dailyRate: isTeamCycle ? 0 : dailyRate,
    actualWorkDays: isTeamCycle ? (salaryByDays > 0 ? 1 : 0) : actualWorkDays,
    salaryByDays,
    overtimeHours,
    overtimePay,
    mealAllowance,
    travelSafetyAllowance,
    otherBonus,
    totalIncome,
    personalIncomeTax,
    advancePayment,
    totalDeductions,
    netSalary,
  };
}

/**
 * Khởi tạo dữ liệu lịch sử chấm công mẫu cho các tháng 09/2026, 10/2026 và tháng thực tế hiện tại cho công nhân thời vụ
 * để khi chuyển qua lại giữa Tháng 9, Tháng 10 và Tháng hiện tại trên Danh Sách Thời Vụ, Bản Chấm Công và Bản Lương đều đồng bộ 100%.
 */
export function buildSeasonalMonthlyAttendanceRecord(
  worker: SeasonalWorker,
  month: number,
  year: number,
  workDays: number,
  otHours: number = 0,
  lastSubmittedAt: string = '2026-09-01T00:00:00.000Z'
) {
  const mStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${mStr}`;
  const periodOption: PayrollPeriodOption = {
    id: 'M1',
    periodKey: `${monthKey}_MONTH`,
    cycleType: '1_MONTH',
    label: `Cả tháng ${mStr}/${year}`,
    shortLabel: `Cả tháng ${mStr}`,
    startDay: 1,
    endDay: new Date(year, month, 0).getDate(),
    dates: Array.from({ length: new Date(year, month, 0).getDate() }, (_, idx) => `${String(idx + 1).padStart(2, '0')}/${mStr}`),
    maxStandardDays: 26,
    year,
    month,
  };
  const sheet = createTimesheetForPeriod(periodOption, workDays, otHours);
  const days: { [dayNumber: number]: any } = {};
  sheet.forEach((dItem) => {
    if (!dItem.dateLabel) return;
    const dNum = parseInt(dItem.dateLabel.split('/')[0], 10);
    if (!isNaN(dNum) && (dItem.workUnits > 0 || dItem.otHours > 0)) {
      days[dNum] = {
        day: dNum,
        dateStr: `${String(dNum).padStart(2, '0')}/${mStr}/${year}`,
        workUnits: dItem.workUnits,
        otHours: dItem.otHours,
        statusType: dItem.workUnits === 1 ? 'FULL' : 'HALF',
        location: worker.project || '',
        shiftType: 'DAY',
        otMultiplier: 1.5,
        note: dItem.note || 'Thi công tại công trình',
      };
    }
  });
  return {
    monthKey,
    month,
    year,
    totalWorkDays: workDays,
    totalOtHours: otHours,
    days,
    lastSubmittedAt,
    submittedBy: 'ADMIN',
  };
}

/**
 * Đồng bộ dữ liệu chấm công tháng (monthlyAttendance[monthKey] & periodRecords) của công nhân thời vụ
 * sang Danh Sách Thời Vụ, Bản Chấm Công và Bản Lương cho bất kỳ Tháng/Năm nào.
 */
export function getUnifiedWorkerDailyRate(worker: SeasonalWorker): number {
  // Nhân sự thuộc danh sách Tổ Đội không chấm công và không áp đơn giá ngày công cố định (nhận lương linh hoạt theo từng kỳ)
  if (!worker || worker.payrollCycleType === 'TEAM') {
    return 0;
  }
  if ((worker as any).dailyRateUpdatedAt !== undefined && typeof worker.dailyRate === 'number') {
    return Math.max(0, worker.dailyRate);
  }
  if (typeof worker.dailyRate === 'number' && worker.dailyRate > 0) {
    return worker.dailyRate;
  }
  if (worker.periodRecords) {
    for (const rec of Object.values(worker.periodRecords)) {
      if (rec && rec.cycleType !== 'TEAM' && rec.dailyRate && rec.dailyRate > 0) {
        return rec.dailyRate;
      }
    }
  }
  return 0;
}

const LEGACY_MOCK_WORKER_CODES = new Set([
  'PNC-TV01',
  'PNC-TV02',
  'PNC-TV03',
  'PNC-TV04',
  'PNC-TV05',
  'PNC-TV06',
  'PNC-TV07',
  'PNC-TV08',
  'PNC-TV09',
  'PNC-TV10',
  'PNC-TV11',
  'PNC-TV12',
]);

export function sanitizeLegacySeasonalAllowances(worker: SeasonalWorker): SeasonalWorker {
  if (!worker || worker.payrollCycleType === 'TEAM') return worker;
  if ((worker as any).allowanceUpdatedAt) return worker;

  const isLegacySlot = LEGACY_MOCK_WORKER_CODES.has(String(worker.code || '').trim());
  const pRecs = worker.periodRecords || {};
  const hasZeroSubPeriod = Object.entries(pRecs).some(
    ([k, r]) =>
      r &&
      (k.includes('_W') || k.includes('_BI')) &&
      Number(r.mealAllowance || 0) === 0 &&
      Number(r.travelSafetyAllowance || 0) === 0 &&
      Number(r.otherBonus || 0) === 0
  );
  const hasAutoMealOnly =
    Number(worker.mealAllowance || 0) > 0 &&
    Number(worker.mealAllowance || 0) % 30000 === 0 &&
    Number(worker.travelSafetyAllowance || 0) === 0 &&
    Number(worker.otherBonus || 0) === 0;

  if (!isLegacySlot && !hasZeroSubPeriod && !hasAutoMealOnly) {
    return worker;
  }

  const cleanedRecords: Record<string, SeasonalPeriodRecord> = {};
  Object.entries(pRecs).forEach(([k, r]) => {
    if (!r) return;
    if (r.cycleType === 'TEAM') {
      cleanedRecords[k] = r;
      return;
    }
    const sal = Number(r.salaryByDays || 0);
    const otPay = Number(r.overtimePay || 0);
    const totInc = sal + otPay;
    const hasTax = r.hasTaxCommitment ?? worker.hasTaxCommitment ?? true;
    const tax = !hasTax && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
    const adv = Number(r.advancePayment || 0);
    const totDed = tax + adv;
    cleanedRecords[k] = {
      ...r,
      mealAllowance: 0,
      travelSafetyAllowance: 0,
      otherBonus: 0,
      totalIncome: totInc,
      personalIncomeTax: tax,
      totalDeductions: totDed,
      netSalary: Math.max(0, totInc - totDed),
    };
  });

  return {
    ...worker,
    mealAllowance: 0,
    travelSafetyAllowance: 0,
    otherBonus: 0,
    periodRecords: cleanedRecords,
  };
}

function syncPeriodRecordsDailyRate(
  records: Record<string, SeasonalPeriodRecord> | undefined,
  unifiedRate: number,
  isTeamWorker = false,
  configuredAllowances?: {
    mealAllowance: number;
    travelSafetyAllowance: number;
    otherBonus: number;
  }
): Record<string, SeasonalPeriodRecord> {
  if (!records) return {};
  const result: Record<string, SeasonalPeriodRecord> = {};
  Object.keys(records).forEach((key) => {
    const rec = records[key];
    if (!rec) return;
    if (rec.cycleType === 'TEAM' || isTeamWorker) {
      if (Array.isArray(rec.teamVouchers)) {
        const vouchers = rec.teamVouchers.map((v, idx) =>
          normalizeSingleTeamVoucher(v, { hasTaxCommitment: rec.hasTaxCommitment ?? true }, idx + 1)
        );
        const hasV = vouchers.length > 0;
        const sSal = vouchers.reduce((s, v) => s + (v.salaryByDays || 0), 0);
        const sBon = vouchers.reduce((s, v) => s + (v.otherBonus || 0), 0);
        const sInc = vouchers.reduce((s, v) => s + (v.totalIncome || 0), 0);
        const sTax = vouchers.reduce((s, v) => s + (v.personalIncomeTax || 0), 0);
        const sAdv = vouchers.reduce((s, v) => s + (v.advancePayment || 0), 0);
        const sDed = vouchers.reduce((s, v) => s + (v.totalDeductions || 0), 0);
        const sNet = vouchers.reduce((s, v) => s + (v.netSalary || 0), 0);
        const latestV = hasV ? vouchers[vouchers.length - 1] : undefined;
        result[key] = {
          ...rec,
          cycleType: 'TEAM',
          isRecorded: hasV,
          project: latestV?.project || rec.project,
          paymentDate: latestV?.paymentDate || rec.paymentDate,
          dailyRate: 0,
          actualWorkDays: hasV ? 1 : 0,
          salaryByDays: sSal,
          overtimePay: 0,
          mealAllowance: 0,
          travelSafetyAllowance: 0,
          otherBonus: sBon,
          totalIncome: sInc,
          personalIncomeTax: sTax,
          advancePayment: sAdv,
          totalDeductions: sDed,
          netSalary: sNet,
          teamVouchers: vouchers,
        };
        return;
      }
      const legacyTeamSalary =
        rec.salaryByDays !== undefined && rec.salaryByDays > 0
          ? Number(rec.salaryByDays)
          : Number(rec.dailyRate || 0);
      const workDays =
        legacyTeamSalary > 0 && (Number(rec.actualWorkDays || 0) > 0 || rec.isRecorded) ? 1 : 0;
      const salaryByDays = workDays > 0 ? Math.round(legacyTeamSalary) : 0;
      const otherBonus =
        Number(rec.mealAllowance || 0) +
        Number(rec.travelSafetyAllowance || 0) +
        Number(rec.otherBonus || 0);
      const totalIncome = salaryByDays + otherBonus;
      const hasTaxCommitment = rec.hasTaxCommitment ?? true;
      const personalIncomeTax =
        !hasTaxCommitment && totalIncome >= 2000000 ? Math.round(totalIncome * 0.1) : 0;
      const advancePayment = Number(rec.advancePayment || 0);
      const totalDeductions = personalIncomeTax + advancePayment;
      result[key] = {
        ...rec,
        cycleType: 'TEAM',
        dailyRate: 0,
        actualWorkDays: workDays,
        salaryByDays,
        overtimeHours: 0,
        overtimePay: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus,
        totalIncome,
        personalIncomeTax,
        totalDeductions,
        netSalary: Math.max(0, totalIncome - totalDeductions),
      };
      return;
    }
    const rate = typeof unifiedRate === 'number' && unifiedRate > 0 ? unifiedRate : rec.dailyRate || 0;
    const workDays = Number(rec.actualWorkDays || 0);
    const otHours = Number(rec.overtimeHours || 0);
    const hasActivity = workDays > 0 || otHours > 0;
    const salaryByDays = Math.round(rate * workDays);
    const hourlyRate = rate / 8;
    const overtimePay = Math.round(hourlyRate * otHours * 1.5);
    const mealAllowance = hasActivity
      ? Number(configuredAllowances ? configuredAllowances.mealAllowance : rec.mealAllowance || 0)
      : 0;
    const travelSafetyAllowance = hasActivity
      ? Number(configuredAllowances ? configuredAllowances.travelSafetyAllowance : rec.travelSafetyAllowance || 0)
      : 0;
    const otherBonus = hasActivity
      ? Number(configuredAllowances ? configuredAllowances.otherBonus : rec.otherBonus || 0)
      : 0;
    const totalIncome = salaryByDays + overtimePay + mealAllowance + travelSafetyAllowance + otherBonus;
    const hasTaxCommitment = rec.hasTaxCommitment ?? true;
    const personalIncomeTax =
      !hasTaxCommitment && totalIncome >= 2000000 ? Math.round(totalIncome * 0.1) : 0;
    const advancePayment = Number(rec.advancePayment || 0);
    const totalDeductions = personalIncomeTax + advancePayment;
    const netSalary = totalIncome - totalDeductions;

    result[key] = {
      ...rec,
      dailyRate: rate,
      salaryByDays,
      overtimePay,
      mealAllowance,
      travelSafetyAllowance,
      otherBonus,
      totalIncome,
      personalIncomeTax,
      totalDeductions,
      netSalary,
    };
  });
  return result;
}

const CLEANED_PHANTOM_SEASONAL_TIMESTAMP = '2026-11-10T00:00:00.000Z';
const CLEANED_PHANTOM_SEASONAL_EPOCH = 1794268800000;

/**
 * Nhận diện bản ghi chấm công tháng (monthlyAttendance[monthKey] hoặc attendance_records)
 * bị tự động nhảy công (25-26 công liên tiếp từ ngày 1..26 kể cả Chủ Nhật hoặc mang dấu thời gian khởi tạo mẫu).
 * Bảo toàn 100% các bản ghi chấm công thực tế của người dùng (như Lê Văn Cường 11 công + 10h OT, Trần Thanh Xuân 2 công, Huỳnh Trần Gia Hưng 4 công...).
 */
export function isPhantomAutoSeasonalRecord(rec: any): boolean {
  if (!rec || typeof rec !== 'object') return false;

  const ts = String(rec.lastSubmittedAt || rec.updated_at || '');
  if (ts === '2026-09-01T00:00:00.000Z' || ts === '2026-10-01T00:00:00.000Z') {
    return true;
  }

  const daysObj = rec.days || rec.attendance_data;
  if (!daysObj || typeof daysObj !== 'object' || Array.isArray(daysObj)) {
    return false;
  }

  const activeDayNums: number[] = [];
  let allMissingUpdatedAt = true;
  Object.entries(daysObj).forEach(([k, val]: [string, any]) => {
    const dNum = Number(k);
    if (!Number.isInteger(dNum) || dNum < 1 || dNum > 31 || !val || typeof val !== 'object') return;
    const wUnits = Number(val.workUnits || 0);
    const ot = Number(val.otHours || 0);
    if (wUnits > 0 || ot > 0) {
      activeDayNums.push(dNum);
      if (val.updatedAt) {
        allMissingUpdatedAt = false;
      }
    }
  });

  if (activeDayNums.length < 22) {
    return false;
  }

  // Trường hợp 1: Mọi ngày từ 1..22 đều có công = 1 liên tiếp (bao gồm cả tất cả các ngày Chủ Nhật đầu tháng)
  // trong khi các ngày cuối tháng (28, 29, 30) lại trống hoàn toàn -> dấu hiệu 100% do hàm tự sinh công tạo ra
  let consecutiveFromDay1 = true;
  for (let d = 1; d <= 22; d++) {
    if (Number(daysObj[d]?.workUnits || 0) < 1) {
      consecutiveFromDay1 = false;
      break;
    }
  }
  const tailEmpty =
    Number(daysObj[28]?.workUnits || 0) === 0 &&
    Number(daysObj[29]?.workUnits || 0) === 0 &&
    Number(daysObj[30]?.workUnits || 0) === 0;

  if (consecutiveFromDay1 && tailEmpty) {
    return true;
  }

  // Trường hợp 2: Có >= 22 ngày công nhưng tất cả các ô ngày đều không có updatedAt (do buildSeasonalMonthlyAttendanceRecord tự sinh)
  if (allMissingUpdatedAt) {
    return true;
  }

  return false;
}

function isPhantomAutoSeasonalPeriodRecord(pRec: any): boolean {
  if (!pRec || typeof pRec !== 'object' || pRec.cycleType === 'TEAM') return false;
  const workDays = Number(pRec.actualWorkDays || 0);
  if (workDays < 22) return false;

  if (Array.isArray(pRec.weeklyTimesheet) && pRec.weeklyTimesheet.length >= 28) {
    let consecutive22 = true;
    for (let i = 0; i < 22; i++) {
      if (Number(pRec.weeklyTimesheet[i]?.workUnits || 0) < 1) {
        consecutive22 = false;
        break;
      }
    }
    const tailZero =
      Number(pRec.weeklyTimesheet[27]?.workUnits || 0) === 0 &&
      Number(pRec.weeklyTimesheet[28]?.workUnits || 0) === 0 &&
      Number(pRec.weeklyTimesheet[29]?.workUnits || 0) === 0;
    if (consecutive22 && tailZero) return true;
  }

  if (!pRec.updatedAt && workDays >= 24) {
    return true;
  }

  return false;
}

/**
 * Làm sạch triệt để các bản ghi chấm công thời vụ bị nhảy công tự động (25-26 công) ở tất cả các tháng.
 * Đặt tường minh về 0 công (Chưa chấm công) kèm dấu thời gian mới để ghi đè dữ liệu rác trên cả LocalStorage & Supabase.
 */
export function sanitizeSeasonalWorkerAttendance(rawWorker: SeasonalWorker): SeasonalWorker {
  const worker = sanitizeLegacySeasonalAllowances(rawWorker);
  if (!worker || worker.payrollCycleType === 'TEAM') return worker;

  const rawMonthly = worker.monthlyAttendance || {};
  const rawPeriods = worker.periodRecords || {};
  const cleanedMonthly: Record<string, any> = { ...rawMonthly };
  const cleanedPeriods: Record<string, SeasonalPeriodRecord> = { ...rawPeriods };
  const phantomMonths = new Set<string>();

  Object.entries(rawMonthly).forEach(([mKey, mRec]) => {
    if (!mRec) return;
    if (isPhantomAutoSeasonalRecord(mRec)) {
      phantomMonths.add(mKey);
    } else if (!mRec.days || Object.keys(mRec.days).length === 0) {
      if (Number(mRec.totalWorkDays || 0) > 0 || Number(mRec.totalOtHours || 0) > 0) {
        phantomMonths.add(mKey);
      }
    }
  });

  Object.entries(rawPeriods).forEach(([pKey, pRec]) => {
    if (!pRec || pRec.cycleType === 'TEAM') return;
    const match = pKey.match(/^(\d{4}-\d{2})_(.+)$/);
    if (!match) return;
    const mKey = match[1];
    const suffix = match[2];
    if ((suffix === 'MONTH' || suffix === 'M1') && isPhantomAutoSeasonalPeriodRecord(pRec)) {
      phantomMonths.add(mKey);
    }
  });

  if (phantomMonths.size === 0) {
    return worker;
  }

  phantomMonths.forEach((mKey) => {
    const parts = mKey.split('-');
    const yNum = Number(parts[0]) || 2026;
    const mNum = Number(parts[1]) || 10;

    // Kiểm tra xem tháng này có kỳ tuần/đợt (W1..W6, BI1..BI2) nào được người dùng chấm công thực tế hợp lệ không
    // (Kỳ tuần bị nhiễm từ 26 công tự động sẽ có W1, W2, W3 đều 7 công tính cả Chủ Nhật hoặc không có updatedAt)
    const subKeys = Object.keys(cleanedPeriods).filter(
      (k) => k.startsWith(`${mKey}_W`) || k.startsWith(`${mKey}_BI`)
    );
    const allSubArePhantom =
      subKeys.length === 0 ||
      subKeys.every((sk) => {
        const sr = cleanedPeriods[sk];
        if (!sr || !sr.isRecorded || (Number(sr.actualWorkDays || 0) === 0 && Number(sr.overtimeHours || 0) === 0)) {
          return true;
        }
        if (!(sr as any).updatedAt) return true;
        if (sk.includes('_W') && Number(sr.actualWorkDays || 0) >= 7 && Number(sr.overtimeHours || 0) === 0) {
          return true;
        }
        return false;
      });

    if (allSubArePhantom) {
      cleanedMonthly[mKey] = {
        monthKey: mKey,
        month: mNum,
        year: yNum,
        totalWorkDays: 0,
        totalOtHours: 0,
        days: {},
        lastSubmittedAt: CLEANED_PHANTOM_SEASONAL_TIMESTAMP,
        submittedBy: 'ADMIN',
      };

      Object.keys(cleanedPeriods).forEach((pk) => {
        if (pk.startsWith(`${mKey}_`) && cleanedPeriods[pk]?.cycleType !== 'TEAM') {
          cleanedPeriods[pk] = {
            ...cleanedPeriods[pk],
            isRecorded: false,
            actualWorkDays: 0,
            salaryByDays: 0,
            overtimeHours: 0,
            overtimePay: 0,
            mealAllowance: 0,
            travelSafetyAllowance: 0,
            otherBonus: 0,
            totalIncome: 0,
            personalIncomeTax: 0,
            netSalary: 0,
            weeklyTimesheet: (cleanedPeriods[pk].weeklyTimesheet || []).map((d) => ({
              ...d,
              workUnits: 0,
              otHours: 0,
              note: d.dayOfWeek === 'CN' ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca',
            })),
            updatedAt: CLEANED_PHANTOM_SEASONAL_EPOCH,
          } as SeasonalPeriodRecord;
        }
      });
    }
  });

  const curMKey = `${worker.attendanceYear || 2026}-${String(worker.attendanceMonth || 10).padStart(2, '0')}`;
  const isCurMonthCleaned =
    phantomMonths.has(curMKey) &&
    cleanedMonthly[curMKey] &&
    Number(cleanedMonthly[curMKey].totalWorkDays || 0) === 0;

  return {
    ...worker,
    ...(isCurMonthCleaned
      ? {
          actualWorkDays: 0,
          overtimeHours: 0,
          salaryByDays: 0,
          overtimePay: 0,
          totalIncome: 0,
          personalIncomeTax: 0,
          netSalary: 0,
          selectedForAttendance: false,
        }
      : {}),
    monthlyAttendance: cleanedMonthly,
    periodRecords: cleanedPeriods,
  };
}

export function syncSeasonalWorkerForMonth(
  rawWorker: SeasonalWorker,
  month: number,
  year: number
): SeasonalWorker {
  const worker = sanitizeSeasonalWorkerAttendance(rawWorker);
  const mStr = String(month).padStart(2, '0');
  const monthKey = `${year}-${mStr}`;
  const monthPeriodKey = `${monthKey}_MONTH`;
  const monthRec = worker.monthlyAttendance?.[monthKey];
  const effectiveRate = getUnifiedWorkerDailyRate(worker);

  // Xử lý riêng cho nhân sự thuộc nhóm Tổ Đội (TEAM): Không lấy từ bảng chấm công 31 ngày mà lấy trực tiếp từ bản ghi lương tháng (periodRecords[monthPeriodKey]) và danh sách các đợt chi (teamVouchers)
  if (worker.payrollCycleType === 'TEAM') {
    const teamRec = worker.periodRecords?.[monthPeriodKey];
    const mPeriodOption = getMonthlyPeriodForMonth(year, month)[0];
    const emptySheet = createEmptyTimesheetForPeriod(mPeriodOption);
    const vouchers = extractTeamPeriodVouchers(teamRec, worker);

    if (vouchers.length > 0) {
      const sumSalary = vouchers.reduce((s, v) => s + (v.salaryByDays || 0), 0);
      const sumBonus = vouchers.reduce((s, v) => s + (v.otherBonus || 0), 0);
      const sumAdvance = vouchers.reduce((s, v) => s + (v.advancePayment || 0), 0);
      const latestVoucher = vouchers[vouchers.length - 1];
      return recomputeSeasonalWorkerPayroll({
        ...worker,
        project: latestVoucher.project || teamRec?.project || worker.project,
        paymentDate: latestVoucher.paymentDate || teamRec?.paymentDate || worker.paymentDate,
        dailyRate: 0,
        salaryByDays: sumSalary,
        attendanceMonth: month,
        attendanceYear: year,
        currentPeriodKey: monthPeriodKey,
        currentWeekId: mPeriodOption.id,
        currentWeekLabel: mPeriodOption.label,
        weeklyTimesheet: teamRec?.weeklyTimesheet || emptySheet,
        actualWorkDays: 1,
        overtimeHours: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus: sumBonus,
        advancePayment: sumAdvance,
        hasTaxCommitment: teamRec?.hasTaxCommitment ?? worker.hasTaxCommitment,
        notes: latestVoucher.notes ?? teamRec?.notes ?? worker.notes,
        selectedForAttendance: true,
        teamVouchers: vouchers,
        periodRecords: worker.periodRecords,
      });
    }
    return recomputeSeasonalWorkerPayroll({
      ...worker,
      dailyRate: 0,
      salaryByDays: 0,
      attendanceMonth: month,
      attendanceYear: year,
      currentPeriodKey: monthPeriodKey,
      currentWeekId: mPeriodOption.id,
      currentWeekLabel: mPeriodOption.label,
      weeklyTimesheet: emptySheet,
      actualWorkDays: 0,
      overtimeHours: 0,
      mealAllowance: 0,
      travelSafetyAllowance: 0,
      otherBonus: 0,
      advancePayment: 0,
      selectedForAttendance: false,
      teamVouchers: [],
      periodRecords: worker.periodRecords,
    });
  }

  const configuredAllowances = {
    mealAllowance: Math.max(0, Number(worker.mealAllowance || 0)),
    travelSafetyAllowance: Math.max(0, Number(worker.travelSafetyAllowance || 0)),
    otherBonus: Math.max(0, Number(worker.otherBonus || 0)),
  };
  const syncedRecords = syncPeriodRecordsDailyRate(
    worker.periodRecords,
    effectiveRate,
    false,
    configuredAllowances
  );

  // 1. Nếu đã có bản ghi tháng trong monthlyAttendance[monthKey] (kể cả khi đã xóa trắng về 0 ngày công / days rỗng)
  if (monthRec && monthRec.days) {
    const dayKeys = Object.keys(monthRec.days);
    // Nếu bản ghi tháng đã được xóa trắng (days rỗng và totalWorkDays = 0, totalOtHours = 0)
    if (dayKeys.length === 0 && Number(monthRec.totalWorkDays || 0) === 0 && Number(monthRec.totalOtHours || 0) === 0) {
      const mPeriodOption = getMonthlyPeriodForMonth(year, month)[0];
      const emptySheet = createEmptyTimesheetForPeriod(mPeriodOption);
      const existingPeriodRec = syncedRecords[monthPeriodKey];
      const recomputedZero = recomputeSeasonalWorkerPayroll({
        ...worker,
        dailyRate: effectiveRate,
        actualWorkDays: 0,
        overtimeHours: 0,
        mealAllowance: configuredAllowances.mealAllowance,
        travelSafetyAllowance: configuredAllowances.travelSafetyAllowance,
        otherBonus: configuredAllowances.otherBonus,
        selectedForAttendance: false,
      });
      const clearedPeriodRecords: Record<string, SeasonalPeriodRecord> = { ...syncedRecords };
      ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'BI1', 'BI2', 'M1', 'MONTH'].forEach((suffix) => {
        const pid = `${monthKey}_${suffix}`;
        if (clearedPeriodRecords[pid] && clearedPeriodRecords[pid].cycleType !== 'TEAM') {
          clearedPeriodRecords[pid] = {
            ...clearedPeriodRecords[pid],
            isRecorded: false,
            actualWorkDays: 0,
            salaryByDays: 0,
            overtimeHours: 0,
            overtimePay: 0,
            mealAllowance: 0,
            travelSafetyAllowance: 0,
            otherBonus: 0,
            totalIncome: 0,
            personalIncomeTax: 0,
            netSalary: 0,
          };
        }
      });
      clearedPeriodRecords[monthPeriodKey] = {
        periodKey: monthPeriodKey,
        periodLabel: mPeriodOption.label,
        cycleType: '1_MONTH',
        isRecorded: false,
        dailyRate: effectiveRate,
        actualWorkDays: 0,
        salaryByDays: 0,
        overtimeHours: 0,
        overtimePay: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus: 0,
        totalIncome: 0,
        hasTaxCommitment: recomputedZero.hasTaxCommitment,
        personalIncomeTax: 0,
        advancePayment: recomputedZero.advancePayment,
        totalDeductions: recomputedZero.totalDeductions,
        netSalary: 0,
        weeklyTimesheet: emptySheet,
        notes: existingPeriodRec?.notes || worker.notes,
      };
      return {
        ...recomputedZero,
        dailyRate: effectiveRate,
        attendanceMonth: month,
        attendanceYear: year,
        weeklyTimesheet: emptySheet,
        selectedForAttendance: false,
        monthlyAttendance: {
          ...(worker.monthlyAttendance || {}),
          [monthKey]: {
            ...monthRec,
            totalWorkDays: 0,
            totalOtHours: 0,
            days: {},
          },
        },
        periodRecords: clearedPeriodRecords,
      };
    }

    if (dayKeys.length > 0) {
      let totalWork = 0;
      let totalOt = 0;
      Object.values(monthRec.days).forEach((d: any) => {
        if (!d) return;
        const st = d.statusType;
        const units = Number(d.workUnits || 0);
        if (st === 'LATE') {
          totalWork += units > 0 ? units : 1;
        } else if (st !== 'ABSENT' && st !== 'LEAVE' && units > 0) {
          totalWork += units;
        }
        totalOt += Number(d.otHours || 0);
      });
      const roundedWork = Math.round(totalWork * 10) / 10;
      const roundedOt = Math.round(totalOt * 10) / 10;
      const isParticipating = roundedWork > 0 || roundedOt > 0;

      // Đồng bộ sang tất cả các chu kỳ 1_WEEK, 2_WEEKS và 1_MONTH của tháng này để Bản Lương 1 Tuần / 2 Tuần / Tháng luôn khớp 100%
      const allSubPeriods = [
        ...getPayrollPeriods(year, month, '1_WEEK'),
        ...getBiWeeklyPeriodsForMonth(year, month),
      ];
      const nextSyncedRecords: Record<string, SeasonalPeriodRecord> = { ...syncedRecords };
      allSubPeriods.forEach((pOpt) => {
        let pDays = 0;
        let pOt = 0;
        const pSheet: WeeklyDayAttendance[] = pOpt.dates.map((dateStr) => {
          const parts = dateStr.split('/');
          const dNum = parseInt(parts[0], 10);
          const itemM = parts.length > 1 ? parseInt(parts[1], 10) : month;
          const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, year, month);
          const d = itemM === month ? monthRec!.days[dNum] : undefined;
          const wUnits =
            d && d.statusType !== 'ABSENT' && d.statusType !== 'LEAVE'
              ? d.statusType === 'LATE'
                ? Number(d.workUnits || 0) > 0
                  ? Number(d.workUnits)
                  : 1
                : Number(d.workUnits || 0)
              : 0;
          const ot = d ? Number(d.otHours || 0) : 0;
          pDays += wUnits;
          pOt += ot;
          return {
            dayOfWeek,
            dayName,
            dateLabel: dateStr,
            workUnits: wUnits,
            otHours: ot,
            shiftType: d?.shiftType || 'DAY',
            note: d?.note || (wUnits > 0 ? 'Thi công bình thường' : isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
          };
        });
        const rDays = Math.round(pDays * 10) / 10;
        const rOt = Math.round(pOt * 10) / 10;
        const pRecorded = rDays > 0 || rOt > 0;
        const prevSubRec = nextSyncedRecords[pOpt.periodKey];
        const salByDays = pRecorded ? Math.round(effectiveRate * rDays) : 0;
        const otPay = pRecorded ? Math.round((effectiveRate / 8) * rOt * 1.5) : 0;
        const meal = pRecorded ? configuredAllowances.mealAllowance : 0;
        const travel = pRecorded ? configuredAllowances.travelSafetyAllowance : 0;
        const bonus = pRecorded ? configuredAllowances.otherBonus : 0;
        const totInc = pRecorded ? salByDays + otPay + meal + travel + bonus : 0;
        const hasTax = prevSubRec?.hasTaxCommitment ?? worker.hasTaxCommitment ?? true;
        const tax = pRecorded && !hasTax && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
        const adv = Number(prevSubRec?.advancePayment ?? worker.advancePayment ?? 0);
        const totDed = tax + adv;
        nextSyncedRecords[pOpt.periodKey] = {
          ...(prevSubRec || {}),
          periodKey: pOpt.periodKey,
          periodLabel: pOpt.label,
          cycleType: pOpt.cycleType,
          isRecorded: pRecorded,
          dailyRate: effectiveRate,
          actualWorkDays: rDays,
          salaryByDays: salByDays,
          overtimeHours: rOt,
          overtimePay: otPay,
          mealAllowance: meal,
          travelSafetyAllowance: travel,
          otherBonus: bonus,
          totalIncome: totInc,
          hasTaxCommitment: hasTax,
          personalIncomeTax: tax,
          advancePayment: adv,
          totalDeductions: totDed,
          netSalary: pRecorded ? Math.max(0, totInc - totDed) : 0,
          weeklyTimesheet: pSheet,
          notes: prevSubRec?.notes || worker.notes,
        };
      });

      // Cũng đồng bộ vào periodRecords[monthPeriodKey] để khi chọn chu kỳ "Cả tháng" khớp 100%
      const mPeriodOption = getMonthlyPeriodForMonth(year, month)[0];
      const sheetFromDays: WeeklyDayAttendance[] = mPeriodOption.dates.map((dateStr) => {
        const dNum = parseInt(dateStr.split('/')[0], 10);
        const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, year, month);
        const dayDetail = monthRec.days[dNum];
        const wUnits =
          dayDetail && dayDetail.statusType !== 'ABSENT' && dayDetail.statusType !== 'LEAVE'
            ? dayDetail.statusType === 'LATE'
              ? Number(dayDetail.workUnits || 0) > 0
                ? Number(dayDetail.workUnits)
                : 1
              : Number(dayDetail.workUnits || 0)
            : 0;
        const ot = dayDetail ? Number(dayDetail.otHours || 0) : 0;
        return {
          dayOfWeek,
          dayName,
          dateLabel: dateStr,
          workUnits: wUnits,
          otHours: ot,
          shiftType: dayDetail?.shiftType || 'DAY',
          note: dayDetail?.note || (wUnits > 0 ? 'Thi công bình thường' : isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
        };
      });

      const existingPeriodRec = nextSyncedRecords[monthPeriodKey];
      const effectiveMeal = isParticipating ? configuredAllowances.mealAllowance : 0;
      const effectiveTravel = isParticipating ? configuredAllowances.travelSafetyAllowance : 0;
      const effectiveBonus = isParticipating ? configuredAllowances.otherBonus : 0;
      const effectiveAdvance =
        worker.advancePayment !== undefined && worker.advancePayment > 0
          ? worker.advancePayment
          : existingPeriodRec?.advancePayment || 0;

      const recomputed = recomputeSeasonalWorkerPayroll({
        ...worker,
        dailyRate: effectiveRate,
        actualWorkDays: roundedWork,
        overtimeHours: roundedOt,
        mealAllowance: effectiveMeal,
        travelSafetyAllowance: effectiveTravel,
        otherBonus: effectiveBonus,
        advancePayment: effectiveAdvance,
        selectedForAttendance: isParticipating,
      });

      return {
        ...recomputed,
        dailyRate: effectiveRate,
        attendanceMonth: month,
        attendanceYear: year,
        weeklyTimesheet: sheetFromDays,
        selectedForAttendance: isParticipating,
        monthlyAttendance: {
          ...(worker.monthlyAttendance || {}),
          [monthKey]: {
            ...monthRec,
            totalWorkDays: roundedWork,
            totalOtHours: roundedOt,
          },
        },
        periodRecords: {
          ...nextSyncedRecords,
          [monthPeriodKey]: {
            periodKey: monthPeriodKey,
            periodLabel: mPeriodOption.label,
            cycleType: '1_MONTH',
            isRecorded: isParticipating,
            dailyRate: effectiveRate,
            actualWorkDays: recomputed.actualWorkDays,
            salaryByDays: recomputed.salaryByDays,
            overtimeHours: recomputed.overtimeHours,
            overtimePay: recomputed.overtimePay,
            mealAllowance: recomputed.mealAllowance,
            travelSafetyAllowance: recomputed.travelSafetyAllowance,
            otherBonus: recomputed.otherBonus,
            totalIncome: recomputed.totalIncome,
            hasTaxCommitment: recomputed.hasTaxCommitment,
            personalIncomeTax: recomputed.personalIncomeTax,
            advancePayment: recomputed.advancePayment,
            totalDeductions: recomputed.totalDeductions,
            netSalary: recomputed.netSalary,
            weeklyTimesheet: sheetFromDays,
            notes: existingPeriodRec?.notes || worker.notes,
          },
        },
      };
    }
  }

  // 2. Nếu chưa có monthlyAttendance[monthKey], chỉ tổng hợp từ các kỳ tuần/đợt (W1..W6, BI1..BI2) đã thực sự được người dùng chấm chi tiết ngày
  const prefix = `${monthKey}_`;
  const matchingPeriodKeys = Object.keys(syncedRecords).filter((k) => k.startsWith(prefix));
  const mPeriodOption = getMonthlyPeriodForMonth(year, month)[0];
  if (matchingPeriodKeys.length > 0) {
    const weekKeys = matchingPeriodKeys.filter((k) => k.includes('_W'));
    const biKeys = matchingPeriodKeys.filter((k) => k.includes('_BI'));
    const subKeysToSum = weekKeys.length > 0 ? weekKeys : biKeys;
    if (subKeysToSum.length > 0) {
      const reconstructedDays: { [dayNumber: number]: any } = {};
      let sumDays = 0;
      let sumOt = 0;
      let sumAdv = 0;
      subKeysToSum.forEach((wk) => {
        const r = syncedRecords[wk];
        if (r && r.isRecorded && Array.isArray(r.weeklyTimesheet)) {
          sumAdv += Number(r.advancePayment || 0);
          r.weeklyTimesheet.forEach((dItem) => {
            if (!dItem?.dateLabel) return;
            const parts = dItem.dateLabel.split('/');
            const dNum = parseInt(parts[0], 10);
            const itemM = parts.length > 1 ? parseInt(parts[1], 10) : month;
            const wUnits = Number(dItem.workUnits || 0);
            const ot = Number(dItem.otHours || 0);
            if (itemM === month && !isNaN(dNum) && (wUnits > 0 || ot > 0)) {
              reconstructedDays[dNum] = {
                day: dNum,
                dateStr: `${String(dNum).padStart(2, '0')}/${mStr}/${year}`,
                workUnits: wUnits,
                otHours: ot,
                statusType: wUnits === 1 ? 'FULL' : 'HALF',
                location: worker.project || '',
                shiftType: dItem.shiftType || 'DAY',
                otMultiplier: 1.5,
                note: dItem.note || 'Thi công bình thường',
                updatedAt: new Date().toISOString(),
              };
            }
          });
        }
      });
      Object.values(reconstructedDays).forEach((d: any) => {
        sumDays += Number(d.workUnits || 0);
        sumOt += Number(d.otHours || 0);
      });
      if (sumDays > 0 || sumOt > 0) {
        const roundedDays = Math.round(sumDays * 10) / 10;
        const sheetFromSub: WeeklyDayAttendance[] = mPeriodOption.dates.map((dateStr) => {
          const dNum = parseInt(dateStr.split('/')[0], 10);
          const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, year, month);
          const detail = reconstructedDays[dNum];
          return {
            dayOfWeek,
            dayName,
            dateLabel: dateStr,
            workUnits: detail ? Number(detail.workUnits || 0) : 0,
            otHours: detail ? Number(detail.otHours || 0) : 0,
            shiftType: detail?.shiftType || 'DAY',
            note: detail?.note || (isSunday ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca'),
          };
        });
        return recomputeSeasonalWorkerPayroll({
          ...worker,
          dailyRate: effectiveRate,
          attendanceMonth: month,
          attendanceYear: year,
          weeklyTimesheet: sheetFromSub,
          actualWorkDays: roundedDays,
          overtimeHours: sumOt,
          mealAllowance: configuredAllowances.mealAllowance,
          travelSafetyAllowance: configuredAllowances.travelSafetyAllowance,
          otherBonus: configuredAllowances.otherBonus,
          advancePayment: sumAdv || worker.advancePayment,
          selectedForAttendance: true,
          periodRecords: syncedRecords,
          monthlyAttendance: {
            ...(worker.monthlyAttendance || {}),
            [monthKey]: {
              monthKey,
              month,
              year,
              totalWorkDays: roundedDays,
              totalOtHours: sumOt,
              days: reconstructedDays,
              lastSubmittedAt: new Date().toISOString(),
              submittedBy: 'ADMIN',
            },
          },
        });
      }
    }
  }

  // 3. Nếu đã có dữ liệu ở các tháng khác nhưng tháng đang chọn hoàn toàn chưa chấm công -> mặc định 0 công (Chưa chấm công)
  const emptySheet = createEmptyTimesheetForPeriod(mPeriodOption);
  return recomputeSeasonalWorkerPayroll({
    ...worker,
    dailyRate: effectiveRate,
    attendanceMonth: month,
    attendanceYear: year,
    weeklyTimesheet: emptySheet,
    periodRecords: syncedRecords,
    actualWorkDays: 0,
    overtimeHours: 0,
    selectedForAttendance: false,
  });
}

/**
 * Chuẩn hóa bảng chấm công chi tiết (weeklyTimesheet) hiển thị trên Phiếu Lương Thời Vụ
 * để luôn khớp 100% với Số ngày công thực tế (actualWorkDays), Giờ tăng ca (overtimeHours) và Tháng/Năm của kỳ lương đang xem/in.
 */
export function resolveWorkerTimesheetForReceipt(
  worker: SeasonalWorker,
  month?: number,
  year?: number
): WeeklyDayAttendance[] {
  // Nhân viên thuộc nhóm Tổ Đội không chấm công nên không in bảng chấm công chi tiết
  if (worker.payrollCycleType === 'TEAM') {
    return [];
  }
  const yr = year || worker.attendanceYear || 2026;
  const mo = month || worker.attendanceMonth || 10;
  const mStr = String(mo).padStart(2, '0');
  const monthKey = `${yr}-${mStr}`;
  const targetWorkDays = Math.round(Number(worker.actualWorkDays || 0) * 10) / 10;
  const targetOtHours = Math.round(Number(worker.overtimeHours || 0) * 10) / 10;

  const currentSheet = worker.weeklyTimesheet || [];
  const matchesMonth =
    currentSheet.length > 0 && currentSheet.some((d) => d.dateLabel?.endsWith(`/${mStr}`));
  const currentWorkSum =
    Math.round(currentSheet.reduce((s, d) => s + (Number(d.workUnits) || 0), 0) * 10) / 10;
  const currentOtSum =
    Math.round(currentSheet.reduce((s, d) => s + (Number(d.otHours) || 0), 0) * 10) / 10;

  // 1. Nếu weeklyTimesheet hiện tại đúng tháng và tổng công + tổng OT khớp với chỉ số trên phiếu lương
  if (
    matchesMonth &&
    Math.abs(currentWorkSum - targetWorkDays) < 0.1 &&
    Math.abs(currentOtSum - targetOtHours) < 0.1
  ) {
    return currentSheet;
  }

  // 2. Kiểm tra dữ liệu chi tiết ngày trong monthlyAttendance[monthKey]
  const monthRecord = worker.monthlyAttendance?.[monthKey];
  if (monthRecord && monthRecord.days && Object.keys(monthRecord.days).length > 0) {
    const daysInMo = new Date(yr, mo, 0).getDate();
    const autoList: WeeklyDayAttendance[] = [];
    for (let d = 1; d <= daysInMo; d++) {
      const dStr = String(d).padStart(2, '0');
      const dateLabel = `${dStr}/${mStr}`;
      const dInfo = getDayOfWeekInfo(dateLabel, yr, mo);
      const detail = monthRecord.days[d];
      const workUnits =
        detail && detail.statusType !== 'ABSENT' && detail.statusType !== 'LEAVE'
          ? Number(detail.workUnits || 0)
          : 0;
      const otHours = detail ? Number(detail.otHours || 0) : 0;
      autoList.push({
        dayOfWeek: dInfo.dayOfWeek,
        dayName: dInfo.dayName,
        dateLabel,
        workUnits,
        otHours,
        shiftType: detail?.shiftType || 'DAY',
      });
    }
    const autoWorkSum =
      Math.round(autoList.reduce((s, d) => s + (Number(d.workUnits) || 0), 0) * 10) / 10;
    const autoOtSum =
      Math.round(autoList.reduce((s, d) => s + (Number(d.otHours) || 0), 0) * 10) / 10;

    if (
      Math.abs(autoWorkSum - targetWorkDays) < 0.1 &&
      Math.abs(autoOtSum - targetOtHours) < 0.1
    ) {
      return autoList;
    }
  }

  // 3. Kiểm tra trong periodRecords của kỳ hiện tại hoặc cả tháng
  const monthPeriodRec =
    (worker.currentPeriodKey && worker.periodRecords?.[worker.currentPeriodKey]) ||
    worker.periodRecords?.[`${monthKey}_MONTH`];
  if (monthPeriodRec?.weeklyTimesheet && monthPeriodRec.weeklyTimesheet.length > 0) {
    const recSheet = monthPeriodRec.weeklyTimesheet;
    const recWorkSum =
      Math.round(recSheet.reduce((s, d) => s + (Number(d.workUnits) || 0), 0) * 10) / 10;
    const recOtSum =
      Math.round(recSheet.reduce((s, d) => s + (Number(d.otHours) || 0), 0) * 10) / 10;
    if (
      recSheet.some((d) => d.dateLabel?.endsWith(`/${mStr}`)) &&
      Math.abs(recWorkSum - targetWorkDays) < 0.1 &&
      Math.abs(recOtSum - targetOtHours) < 0.1
    ) {
      return recSheet;
    }
  }

  // 4. Tự động phân bổ khớp 100% với tổng ngày công (targetWorkDays) và tổng giờ OT (targetOtHours) trong kỳ
  if (matchesMonth && currentSheet.length > 0 && currentSheet.length <= 16) {
    const subPeriodOpt: PayrollPeriodOption = {
      id: worker.currentWeekId || 'W1',
      periodKey: worker.currentPeriodKey || `${monthKey}_W1`,
      cycleType: currentSheet.length <= 7 ? '1_WEEK' : '2_WEEKS',
      label: worker.currentWeekLabel || `Kỳ ${mStr}/${yr}`,
      shortLabel: `Kỳ ${mStr}/${yr}`,
      startDay: parseInt(currentSheet[0]?.dateLabel?.split('/')[0] || '1', 10),
      endDay: parseInt(currentSheet[currentSheet.length - 1]?.dateLabel?.split('/')[0] || '7', 10),
      dates: currentSheet.map((d) => d.dateLabel),
      maxStandardDays: currentSheet.length,
      year: yr,
      month: mo,
    };
    return createTimesheetForPeriod(subPeriodOpt, targetWorkDays, targetOtHours);
  }

  const mPeriodOption = getMonthlyPeriodForMonth(yr, mo)[0];
  return createTimesheetForPeriod(mPeriodOption, targetWorkDays, targetOtHours);
}

/**
 * Lấy dữ liệu công, phụ cấp, OT, tạm ứng của công nhân trong chu kỳ được chọn (Tuần hoặc Đợt 2 tuần)
 * ĐẶC BIỆT THEO YÊU CẦU:
 * - Nếu chu kỳ đã được chấm và record: Hiển thị lại đúng số công, OT, tạm ứng đã lưu
 * - Nếu chu kỳ chưa chấm: MẶC ĐỊNH SỐ CÔNG = 0, OT = 0, TẠM ỨNG = 0 (bắt buộc người dùng chấm lại, không để sẵn)
 */
export function getWorkerForPeriod(rawWorker: SeasonalWorker, period: PayrollPeriodOption): SeasonalWorker {
  const worker = sanitizeSeasonalWorkerAttendance(rawWorker);
  const pKey = period.periodKey;
  const existingRecord = worker.periodRecords?.[pKey];
  const pYear = period.year || parseInt(period.periodKey?.split('-')[0], 10) || 2026;
  const pMonth = period.month || parseInt(period.periodKey?.split('-')[1]?.split('_')[0], 10) || 9;
  const monthKey = `${pYear}-${String(pMonth).padStart(2, '0')}`;

  // Đồng bộ đơn giá ngày công thống nhất giữa Hồ sơ công nhân, Danh sách nhân viên và Bản lương
  const periodDailyRate = getUnifiedWorkerDailyRate(worker);

  // Nếu là nhân sự Tổ Đội (TEAM): Lấy trực tiếp từ bản ghi kỳ thanh toán & danh sách các đợt nhận (teamVouchers)
  if (worker.payrollCycleType === 'TEAM') {
    const emptySheet = createEmptyTimesheetForPeriod(period);
    const vouchers = extractTeamPeriodVouchers(existingRecord, worker);
    if (vouchers.length > 0) {
      const sumSalary = vouchers.reduce((s, v) => s + (v.salaryByDays || 0), 0);
      const sumBonus = vouchers.reduce((s, v) => s + (v.otherBonus || 0), 0);
      const sumAdvance = vouchers.reduce((s, v) => s + (v.advancePayment || 0), 0);
      const latestVoucher = vouchers[vouchers.length - 1];
      return {
        ...recomputeSeasonalWorkerPayroll({
          ...worker,
          project: latestVoucher.project || existingRecord?.project || worker.project,
          paymentDate: latestVoucher.paymentDate || existingRecord?.paymentDate || worker.paymentDate,
          dailyRate: 0,
          salaryByDays: sumSalary,
          currentPeriodKey: pKey,
          currentWeekId: period.id,
          currentWeekLabel: period.label,
          payrollCycleType: 'TEAM',
          actualWorkDays: 1,
          overtimeHours: 0,
          mealAllowance: 0,
          travelSafetyAllowance: 0,
          otherBonus: sumBonus,
          hasTaxCommitment: existingRecord?.hasTaxCommitment ?? worker.hasTaxCommitment,
          advancePayment: sumAdvance,
          weeklyTimesheet: existingRecord?.weeklyTimesheet || emptySheet,
          notes: latestVoucher.notes ?? existingRecord?.notes ?? worker.notes,
          teamVouchers: vouchers,
        }),
        selectedForAttendance: true,
      };
    }
    return {
      ...recomputeSeasonalWorkerPayroll({
        ...worker,
        dailyRate: 0,
        currentPeriodKey: pKey,
        currentWeekId: period.id,
        currentWeekLabel: period.label,
        payrollCycleType: 'TEAM',
        actualWorkDays: 0,
        overtimeHours: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus: 0,
        advancePayment: 0,
        weeklyTimesheet: emptySheet,
        teamVouchers: [],
      }),
      selectedForAttendance: false,
    };
  }

  const configuredMeal = Math.max(0, Number(worker.mealAllowance || 0));
  const configuredTravel = Math.max(0, Number(worker.travelSafetyAllowance || 0));
  const configuredBonus = Math.max(0, Number(worker.otherBonus || 0));

  // Kiểm tra nếu đã có dữ liệu chấm công từ bảng chấm công tháng / di động (monthlyAttendance)
  const monthlyDays = worker.monthlyAttendance?.[monthKey]?.days;
  const hasMonthlyAttendanceForMonth = monthlyDays !== undefined;
  let hasMonthlyDataForPeriod = false;
  let monthlyWorkDays = 0;
  let monthlyOtHours = 0;

  if (monthlyDays && period.dates && period.dates.length > 0) {
    period.dates.forEach((dateStr) => {
      const parts = dateStr.split('/');
      const dayNum = parseInt(parts[0], 10);
      const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : pMonth;
      // CỰC KỲ QUAN TRỌNG: Chỉ lấy ngày thuộc đúng tháng pMonth (không lấy ngày của tháng trước/tháng sau ở tuần giáp hạt như Tuần 1 26/10-01/11 hoặc Tuần 6 30/11-06/12)
      if (itemMonth === pMonth && monthlyDays[dayNum] !== undefined) {
        hasMonthlyDataForPeriod = true;
        const dRec = monthlyDays[dayNum];
        if (dRec.statusType !== 'ABSENT' && dRec.statusType !== 'LEAVE') {
          monthlyWorkDays +=
            dRec.statusType === 'LATE' && !(Number(dRec.workUnits || 0) > 0)
              ? 1
              : Number(dRec.workUnits || 0);
        }
        monthlyOtHours += Number(dRec.otHours || 0);
      }
    });
  }

  const hasRecordedMonthlyDays =
    hasMonthlyDataForPeriod && monthlyDays && (monthlyWorkDays > 0 || monthlyOtHours > 0);

  // 1. Nếu có dữ liệu từ bảng chấm công tháng (monthlyAttendance) với công > 0 trong tuần/kỳ này
  if (hasRecordedMonthlyDays && monthlyDays) {
    const timesheetFromMonthly: WeeklyDayAttendance[] = period.dates.map((dateStr) => {
      const parts = dateStr.split('/');
      const dayNum = parseInt(parts[0], 10);
      const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : pMonth;
      const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, pYear, pMonth);
      const dayDetail = itemMonth === pMonth ? monthlyDays[dayNum] : undefined;

      const workUnits =
        dayDetail && dayDetail.statusType !== 'ABSENT' && dayDetail.statusType !== 'LEAVE'
          ? dayDetail.statusType === 'LATE' && !(Number(dayDetail.workUnits || 0) > 0)
            ? 1
            : Number(dayDetail.workUnits || 0)
          : 0;
      const otHours = dayDetail ? Number(dayDetail.otHours || 0) : 0;
      const shiftType = dayDetail?.shiftType || 'DAY';
      const note =
        dayDetail?.note ||
        (workUnits > 0
          ? isSunday
            ? 'Làm ca Chủ Nhật'
            : 'Thi công bình thường'
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

    const totalDays = timesheetFromMonthly.reduce((sum, d) => sum + (d.workUnits || 0), 0);
    const totalOT = timesheetFromMonthly.reduce((sum, d) => sum + (d.otHours || 0), 0);
    const roundedWorkDays = Math.round(totalDays * 10) / 10;

    return recomputeSeasonalWorkerPayroll({
      ...worker,
      dailyRate: periodDailyRate,
      currentPeriodKey: pKey,
      currentWeekId: period.id,
      currentWeekLabel: period.label,
      payrollCycleType: worker.payrollCycleType || '1_MONTH',
      actualWorkDays: roundedWorkDays,
      overtimeHours: totalOT,
      mealAllowance: configuredMeal,
      travelSafetyAllowance: configuredTravel,
      otherBonus: configuredBonus,
      advancePayment:
        worker.advancePayment !== undefined && worker.advancePayment > 0
          ? worker.advancePayment
          : existingRecord?.advancePayment || 0,
      hasTaxCommitment: existingRecord?.hasTaxCommitment ?? worker.hasTaxCommitment,
      notes: existingRecord?.notes ?? worker.notes,
      weeklyTimesheet: timesheetFromMonthly,
    });
  }

  // 2. Chỉ dùng existingRecord khi tháng này CHƯA có monthlyAttendance (tránh việc tuần trống như Tuần 6 bị lấy nhầm công cũ)
  if (!hasMonthlyAttendanceForMonth && existingRecord && (existingRecord.isRecorded || existingRecord.actualWorkDays > 0)) {
    let normalizedTimesheet: WeeklyDayAttendance[];
    if (existingRecord.weeklyTimesheet && existingRecord.weeklyTimesheet.length > 0) {
      normalizedTimesheet = period.dates.map((dateStr, idx) => {
        const parts = dateStr.split('/');
        const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : pMonth;
        const { dayOfWeek, dayName, isSunday } = getDayOfWeekInfo(dateStr, pYear, pMonth);
        const match =
          existingRecord.weeklyTimesheet?.find((d) => d.dateLabel === dateStr) ||
          existingRecord.weeklyTimesheet?.[idx];

        const workUnits = itemMonth === pMonth && match ? Number(match.workUnits || 0) : 0;
        const otHours = itemMonth === pMonth && match ? Number(match.otHours || 0) : 0;
        const shiftType = match?.shiftType || 'DAY';
        const note =
          match?.note ||
          (workUnits > 0
            ? isSunday
              ? 'Làm ca Chủ Nhật'
              : 'Thi công bình thường'
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
    } else {
      normalizedTimesheet = createTimesheetForPeriod(period, existingRecord.actualWorkDays, existingRecord.overtimeHours);
    }

    const totalDays = normalizedTimesheet.reduce((sum, d) => sum + (d.workUnits || 0), 0);
    const totalOT = normalizedTimesheet.reduce((sum, d) => sum + (d.otHours || 0), 0);
    const effectiveDays = Math.round(totalDays * 10) / 10;
    const effectiveOT = totalOT;

    if (effectiveDays > 0 || effectiveOT > 0) {
      return recomputeSeasonalWorkerPayroll({
        ...worker,
        dailyRate: periodDailyRate,
        currentPeriodKey: pKey,
        currentWeekId: period.id,
        currentWeekLabel: period.label,
        payrollCycleType: worker.payrollCycleType || '1_MONTH',
        actualWorkDays: effectiveDays,
        overtimeHours: effectiveOT,
        mealAllowance: configuredMeal,
        travelSafetyAllowance: configuredTravel,
        otherBonus: configuredBonus,
        hasTaxCommitment: existingRecord.hasTaxCommitment ?? worker.hasTaxCommitment,
        advancePayment:
          worker.advancePayment !== undefined && worker.advancePayment > 0
            ? worker.advancePayment
            : existingRecord.advancePayment || 0,
        weeklyTimesheet: normalizedTimesheet,
        notes: existingRecord.notes ?? worker.notes,
      });
    }
  }

  // 3. Chu kỳ hoàn toàn chưa được chấm công -> Mặc định 0 công để người dùng chấm lại từ đầu, nhưng vẫn giữ cấu hình Phụ cấp & Thưởng của hồ sơ
  const emptySheet = createEmptyTimesheetForPeriod(period);
  return recomputeSeasonalWorkerPayroll({
    ...worker,
    dailyRate: periodDailyRate,
    currentPeriodKey: pKey,
    currentWeekId: period.id,
    currentWeekLabel: period.label,
    payrollCycleType: worker.payrollCycleType || '1_MONTH',
    actualWorkDays: 0, // Mặc định 0 công
    overtimeHours: 0,
    mealAllowance: configuredMeal,
    travelSafetyAllowance: configuredTravel,
    otherBonus: configuredBonus,
    advancePayment: 0,
    weeklyTimesheet: emptySheet,
  });
}

/**
 * Chấm công và record lại số liệu của công nhân cho một chu kỳ cụ thể,
 * đồng thời đồng bộ thống nhất đơn giá ngày công trên toàn bộ các kỳ
 */
export function recordWorkerPeriod(
  rawWorker: SeasonalWorker,
  period: PayrollPeriodOption,
  patch: Partial<SeasonalWorker>
): SeasonalWorker {
  const worker = sanitizeSeasonalWorkerAttendance(rawWorker);
  const pKey = period.periodKey;

  const periodDailyRate =
    patch.dailyRate !== undefined && patch.dailyRate >= 0
      ? patch.dailyRate
      : getUnifiedWorkerDailyRate(worker);

  const pYear = period.year || parseInt(pKey?.split('-')[0], 10) || 2026;
  const pMonth = period.month || parseInt(pKey?.split('-')[1]?.split('_')[0], 10) || 9;
  const mStr = String(pMonth).padStart(2, '0');
  const monthKey = `${pYear}-${mStr}`;
  const existingPeriodRec = worker.periodRecords?.[pKey];
  const existingMonthRec = worker.monthlyAttendance?.[monthKey];
  const hasValidMonthDays =
    existingMonthRec && existingMonthRec.days && Object.keys(existingMonthRec.days).length > 0;

  const fallbackWorkDays = existingPeriodRec?.isRecorded
    ? existingPeriodRec.actualWorkDays
    : period.cycleType === '1_MONTH' && hasValidMonthDays
    ? existingMonthRec?.totalWorkDays
    : 0;
  const fallbackOtHours = existingPeriodRec?.isRecorded
    ? existingPeriodRec.overtimeHours
    : period.cycleType === '1_MONTH' && hasValidMonthDays
    ? existingMonthRec?.totalOtHours
    : 0;

  // Xác định số ngày công và giờ OT mục tiêu (tuyệt đối không lấy công của tháng khác đắp sang kỳ đang sửa)
  const targetDays =
    patch.actualWorkDays !== undefined
      ? Math.max(0, patch.actualWorkDays)
      : Math.max(0, Number(fallbackWorkDays) || 0);
  const targetOT =
    patch.overtimeHours !== undefined
      ? Math.max(0, patch.overtimeHours)
      : Math.max(0, Number(fallbackOtHours) || 0);

  // Tự động đồng bộ và sinh weeklyTimesheet tương ứng để số ngày công luôn được ghi nhận vào lịch tháng
  let effectiveTimesheet =
    patch.weeklyTimesheet ||
    (existingPeriodRec?.isRecorded ? existingPeriodRec.weeklyTimesheet : undefined);
  const currentTimesheetWorkUnits = effectiveTimesheet?.reduce((sum, d) => sum + (d.workUnits || 0), 0) || 0;
  if (!effectiveTimesheet || effectiveTimesheet.length === 0 || Math.abs(currentTimesheetWorkUnits - targetDays) > 0.01) {
    effectiveTimesheet = createTimesheetForPeriod(period, targetDays, targetOT);
  }

  const declaredCycle: SeasonalCycleType =
    patch.payrollCycleType || worker.payrollCycleType || period.cycleType || '1_MONTH';

  // RIÊNG NHÓM TỔ ĐỘI ('TEAM'): Không dùng đơn giá ngày công (dailyRate = 0), bảo toàn tuyệt đối các kỳ lương Tổ Đội (teamVouchers) đã lập
  if (declaredCycle === 'TEAM') {
    const baseTeamWorker: SeasonalWorker = {
      ...worker,
      ...patch,
      dailyRate: 0,
      payrollCycleType: 'TEAM',
    };
    const existingVouchers = extractTeamPeriodVouchers(existingPeriodRec, baseTeamWorker);
    const updatedVouchers = existingVouchers.map((v, idx) =>
      normalizeSingleTeamVoucher(
        {
          ...v,
          hasTaxCommitment:
            patch.hasTaxCommitment !== undefined
              ? patch.hasTaxCommitment
              : v.hasTaxCommitment ?? baseTeamWorker.hasTaxCommitment ?? true,
        },
        baseTeamWorker,
        idx + 1
      )
    );
    const rebuiltTeamWorker = buildTeamPeriodRecordFromVouchers(
      baseTeamWorker,
      period,
      updatedVouchers
    );
    return {
      ...rebuiltTeamWorker,
      status: patch.status !== undefined ? patch.status : worker.status,
      hasTaxCommitment:
        patch.hasTaxCommitment !== undefined
          ? patch.hasTaxCommitment
          : worker.hasTaxCommitment ?? true,
      dailyRate: 0,
    };
  }

  const effectivePeriodDailyRate =
    patch.dailyRate !== undefined && patch.dailyRate >= 0
      ? patch.dailyRate
      : periodDailyRate;

  const updated = recomputeSeasonalWorkerPayroll({
    ...worker,
    ...patch,
    dailyRate: effectivePeriodDailyRate,
    actualWorkDays: targetDays,
    overtimeHours: targetOT,
    weeklyTimesheet: effectiveTimesheet,
    currentPeriodKey: pKey,
    currentWeekId: period.id,
    currentWeekLabel: period.label,
    payrollCycleType: declaredCycle,
  });

  const isPeriodParticipating =
    updated.actualWorkDays > 0 || updated.overtimeHours > 0;

  const periodRecord: SeasonalPeriodRecord = {
    periodKey: pKey,
    periodLabel: period.label,
    cycleType: period.cycleType,
    isRecorded: isPeriodParticipating,
    dailyRate: effectivePeriodDailyRate,
    project: patch.project || existingPeriodRec?.project || worker.project,
    paymentDate: patch.paymentDate !== undefined ? patch.paymentDate : existingPeriodRec?.paymentDate || worker.paymentDate,
    actualWorkDays: updated.actualWorkDays,
    salaryByDays: updated.salaryByDays,
    overtimeHours: updated.overtimeHours,
    overtimePay: updated.overtimePay,
    mealAllowance: updated.mealAllowance,
    travelSafetyAllowance: updated.travelSafetyAllowance,
    otherBonus: updated.otherBonus,
    totalIncome: updated.totalIncome,
    hasTaxCommitment: updated.hasTaxCommitment,
    personalIncomeTax: updated.personalIncomeTax,
    advancePayment: updated.advancePayment,
    totalDeductions: updated.totalDeductions,
    netSalary: updated.netSalary,
    weeklyTimesheet: effectiveTimesheet,
    notes: updated.notes,
  };
  (periodRecord as any).updatedAt = Date.now();

  const isAllowancePatched =
    patch.mealAllowance !== undefined ||
    patch.travelSafetyAllowance !== undefined ||
    patch.otherBonus !== undefined;
  const configuredAllowances = {
    mealAllowance: Math.max(0, Number(patch.mealAllowance ?? worker.mealAllowance ?? 0)),
    travelSafetyAllowance: Math.max(0, Number(patch.travelSafetyAllowance ?? worker.travelSafetyAllowance ?? 0)),
    otherBonus: Math.max(0, Number(patch.otherBonus ?? worker.otherBonus ?? 0)),
  };

  const periodRecords = syncPeriodRecordsDailyRate(
    {
      ...(worker.periodRecords || {}),
      [pKey]: periodRecord,
    },
    effectivePeriodDailyRate,
    false,
    configuredAllowances
  );

  // Nếu người dùng xóa trắng kỳ Cả Tháng về 0 công, đồng bộ xóa luôn các kỳ tuần/đợt của tháng đó để không bị phục hồi lại công cũ
  if (!isPeriodParticipating && period.cycleType === '1_MONTH') {
    const pYear = period.year || 2026;
    const pMonth = period.month || 9;
    const mPrefix = `${pYear}-${String(pMonth).padStart(2, '0')}_`;
    Object.keys(periodRecords).forEach((key) => {
      if (key.startsWith(mPrefix) && key !== pKey) {
        periodRecords[key] = {
          ...periodRecords[key],
          isRecorded: false,
          actualWorkDays: 0,
          salaryByDays: 0,
          overtimeHours: 0,
          overtimePay: 0,
          totalIncome: 0,
          personalIncomeTax: 0,
          netSalary: 0,
          weeklyTimesheet: (periodRecords[key].weeklyTimesheet || []).map((d) => ({
            ...d,
            workUnits: 0,
            otHours: 0,
            note: d.dayOfWeek === 'CN' ? 'Nghỉ Chủ Nhật' : 'Nghỉ ca',
          })),
        };
      }
    });
  }

  // Đồng bộ lại monthlyAttendance cho các ngày trong chu kỳ này (chỉ ghi đè days khi người dùng thực sự sửa số công / OT / lịch)
  const isAttendancePatched =
    patch.actualWorkDays !== undefined ||
    patch.overtimeHours !== undefined ||
    patch.weeklyTimesheet !== undefined;
  const monthlyAttendance = worker.monthlyAttendance ? { ...worker.monthlyAttendance } : {};
  if (isAttendancePatched && effectiveTimesheet && effectiveTimesheet.length > 0) {
    const pYear = period.year || 2026;
    const pMonth = period.month || 9;
    const mStr = String(pMonth).padStart(2, '0');
    const monthKey = `${pYear}-${mStr}`;
    const curMonthRecord = monthlyAttendance[monthKey] || {
      monthKey,
      month: pMonth,
      year: pYear,
      totalWorkDays: 0,
      totalOtHours: 0,
      days: {},
    };
    const updatedDays = { ...(curMonthRecord.days || {}) };

    // Nếu là chu kỳ Cả Tháng và xóa về 0 công, làm sạch hoàn toàn updatedDays
    if (!isPeriodParticipating && period.cycleType === '1_MONTH') {
      Object.keys(updatedDays).forEach((k) => {
        delete updatedDays[Number(k)];
      });
    } else {
      effectiveTimesheet.forEach((dayItem) => {
        if (dayItem.dateLabel) {
          const parts = dayItem.dateLabel.split('/');
          const dayNum = parseInt(parts[0], 10);
          const itemMonth = parts.length > 1 ? parseInt(parts[1], 10) : pMonth;
          if (!isNaN(itemMonth) && itemMonth !== pMonth) {
            return;
          }
          if (!isNaN(dayNum)) {
            const wUnits = Number(dayItem.workUnits || 0);
            const ot = Number(dayItem.otHours || 0);
            if (wUnits <= 0 && ot <= 0) {
              // Khi ngày trong kỳ được đặt về 0 công và 0 giờ OT -> Xóa khỏi updatedDays để lịch hiển thị trạng thái trống (đã xóa chấm công)
              delete updatedDays[dayNum];
            } else {
              updatedDays[dayNum] = {
                day: dayNum,
                dateStr: `${String(dayNum).padStart(2, '0')}/${mStr}/${pYear}`,
                workUnits: wUnits,
                otHours: ot,
                statusType: wUnits === 1 ? 'FULL' : wUnits === 0.5 ? 'HALF' : 'FULL',
                location: worker.project || '',
                shiftType: dayItem.shiftType || 'DAY',
                otMultiplier: 1.5,
                note: dayItem.note || '',
                updatedAt: new Date().toISOString(),
              };
            }
          }
        }
      });
    }

    // Dọn dẹp các ngày mặc định bị gán nhầm ABSENT (0 công, 0 OT với ghi chú mặc định)
    Object.keys(updatedDays).forEach((k) => {
      const dNum = Number(k);
      const d = updatedDays[dNum];
      if (
        d &&
        Number(d.workUnits || 0) === 0 &&
        Number(d.otHours || 0) === 0 &&
        (d.note === 'Nghỉ ca' || d.note === 'Nghỉ Chủ Nhật' || d.note === 'Chưa chấm công')
      ) {
        delete updatedDays[dNum];
      }
    });

    let totalMonthWork = 0;
    let totalMonthOt = 0;
    Object.values(updatedDays).forEach((d) => {
      totalMonthWork += Number(d.workUnits || 0);
      totalMonthOt += Number(d.otHours || 0);
    });

    monthlyAttendance[monthKey] = {
      ...curMonthRecord,
      totalWorkDays: Math.round(totalMonthWork * 10) / 10,
      totalOtHours: totalMonthOt,
      days: updatedDays,
      lastSubmittedAt: new Date().toISOString(),
      submittedBy: 'ADMIN',
    };

    // Đồng thời xóa cache chấm công di động trong localStorage của tháng này để mở Link Thợ khớp ngay 100%
    if (typeof window !== 'undefined' && worker.code) {
      try {
        localStorage.setItem(
          `pncons_mobile_days_${worker.code}_${pYear}_${pMonth}`,
          JSON.stringify(updatedDays)
        );
      } catch {}
    }
  }

  return {
    ...updated,
    mealAllowance: configuredAllowances.mealAllowance,
    travelSafetyAllowance: configuredAllowances.travelSafetyAllowance,
    otherBonus: configuredAllowances.otherBonus,
    ...(patch.dailyRate !== undefined ? { dailyRateUpdatedAt: Date.now() } : {}),
    ...(isAllowancePatched ? { allowanceUpdatedAt: Date.now() } : {}),
    selectedForAttendance: isPeriodParticipating,
    periodRecords,
    monthlyAttendance,
  };
}

const rawSeasonalWorkers: SeasonalWorker[] = [
  {
    id: '1',
    code: 'PNC-TV01',
    fullName: 'Nguyễn Văn Hùng',
    trade: 'Thợ hàn áp lực & kết cấu 6G',
    skillLevel: 'Thợ bậc 5/7 (Chứng chỉ 6G)',
    project: 'Dự án Vinhomes Grand Park',
    teamName: 'Đội Cơ điện & Hàn áp lực',
    teamLeader: 'KS. Trần Văn Minh',
    phone: '0903 112 345',
    idCard: '079085012345',
    bankAccount: '1903678901234',
    bankName: 'Techcombank',
    paymentMethod: 'BANK',
    joinDate: '02/08/2026',
    dailyRate: 650000,
    actualWorkDays: 25,
    salaryByDays: 0,
    overtimeHours: 16,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 500000,
    otherBonus: 500000,
    totalIncome: 0,
    hasTaxCommitment: true, // Đã có Cam kết 08/CK-TNCN
    personalIncomeTax: 0,
    advancePayment: 3000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Thợ hàn chính phụ trách đường ống áp lực Chiller tầng hầm',
  },
  {
    id: '2',
    code: 'PNC-TV02',
    fullName: 'Lê Hoàng Nam',
    trade: 'Thợ điện chính M&E',
    skillLevel: 'Thợ bậc 4/7',
    project: 'Dự án Nhà máy Dược Mekophar',
    teamName: 'Đội Thi công Cơ điện 1',
    teamLeader: 'KS. Phan Quốc Toàn',
    phone: '0918 223 456',
    idCard: '079086023456',
    bankAccount: '102938475610',
    bankName: 'Vietcombank',
    paymentMethod: 'BANK',
    joinDate: '05/08/2026',
    dailyRate: 600000,
    actualWorkDays: 26,
    salaryByDays: 0,
    overtimeHours: 20,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 400000,
    otherBonus: 300000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 2000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Đấu nối tủ điện tổng MSB và hệ thống chiếu sáng phân xưởng',
  },
  {
    id: '3',
    code: 'PNC-TV03',
    fullName: 'Trần Đình Trọng',
    trade: 'Thợ cơ điện lạnh HVAC',
    skillLevel: 'Thợ chính',
    project: 'Dự án Tòa nhà Bitexco Nam Sài Gòn',
    teamName: 'Đội Ống gió & Lạnh',
    teamLeader: 'KS. Nguyễn Văn Bảo',
    phone: '0937 334 567',
    idCard: '079087034567',
    bankAccount: '068192837465',
    bankName: 'MB Bank',
    paymentMethod: 'BANK',
    joinDate: '10/08/2026',
    dailyRate: 580000,
    actualWorkDays: 24,
    salaryByDays: 0,
    overtimeHours: 12,
    overtimePay: 0,
    mealAllowance: 720000,
    travelSafetyAllowance: 350000,
    otherBonus: 0,
    totalIncome: 0,
    hasTaxCommitment: false, // Chưa nộp Cam kết 08 -> Khấu trừ 10%
    personalIncomeTax: 0,
    advancePayment: 2000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Gia công ống gió tôn mạ kẽm và treo ty ren trục kỹ thuật',
  },
  {
    id: '4',
    code: 'PNC-TV04',
    fullName: 'Vũ Văn Thắng',
    trade: 'Thợ kéo cáp điện hạ thế & cáp ngầm',
    skillLevel: 'Thợ lành nghề',
    project: 'Dự án Vinhomes Grand Park',
    teamName: 'Đội Thi công Cơ điện 1',
    teamLeader: 'KS. Trần Văn Minh',
    phone: '0978 445 678',
    idCard: '079088045678',
    bankAccount: '246813579',
    bankName: 'ACB',
    paymentMethod: 'BANK',
    joinDate: '01/08/2026',
    dailyRate: 550000,
    actualWorkDays: 25.5,
    salaryByDays: 0,
    overtimeHours: 24,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 300000,
    otherBonus: 200000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 1500000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Kéo cáp ngầm XLPE từ trạm biến áp vào phòng điện chính',
  },
  {
    id: '5',
    code: 'PNC-TV05',
    fullName: 'Phạm Quốc Bảo',
    trade: 'Thợ thi công PCCC & Báo cháy',
    skillLevel: 'Thợ bậc 3/7',
    project: 'Dự án Kho Lạnh KCN Long Hậu',
    teamName: 'Đội PCCC Phúc Nguyên',
    teamLeader: 'KS. Lê Văn Hải',
    phone: '0945 556 789',
    idCard: '079089056789',
    bankAccount: '108876543210',
    bankName: 'VietinBank',
    paymentMethod: 'BANK',
    joinDate: '08/08/2026',
    dailyRate: 560000,
    actualWorkDays: 26,
    salaryByDays: 0,
    overtimeHours: 18,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 400000,
    otherBonus: 0,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 2500000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Lắp đặt đường ống chữa cháy vách tường và đầu phun sprinkler',
  },
  {
    id: '6',
    code: 'PNC-TV06',
    fullName: 'Bùi Văn Đạt',
    trade: 'Thợ cơ khí lắp dựng & kết cấu thép',
    skillLevel: 'Thợ chính',
    project: 'Dự án Nhà máy Dược Mekophar',
    teamName: 'Đội Cơ điện & Hàn áp lực',
    teamLeader: 'KS. Phan Quốc Toàn',
    phone: '0912 667 890',
    idCard: '079090067890',
    bankAccount: '0123456789',
    bankName: 'Agribank',
    paymentMethod: 'CASH', // Nhận tiền mặt tại công trường
    joinDate: '12/08/2026',
    dailyRate: 520000,
    actualWorkDays: 23,
    salaryByDays: 0,
    overtimeHours: 10,
    overtimePay: 0,
    mealAllowance: 690000,
    travelSafetyAllowance: 300000,
    otherBonus: 0,
    totalIncome: 0,
    hasTaxCommitment: false, // Chưa nộp Cam kết 08 -> Khấu trừ 10%
    personalIncomeTax: 0,
    advancePayment: 1000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Lắp dựng giàn đỡ ống công nghệ tầng mái',
  },
  {
    id: '7',
    code: 'PNC-TV07',
    fullName: 'Đặng Hữu Tài',
    trade: 'KTV bảo trì hệ thống Chiller & Bơm',
    skillLevel: 'Kỹ thuật viên bậc 4/7',
    project: 'Dự án Tòa nhà Saigon Marina Q1',
    teamName: 'Đội Cơ điện lạnh',
    teamLeader: 'KS. Nguyễn Văn Bảo',
    phone: '0908 778 901',
    idCard: '079091078901',
    bankAccount: '12410002938475',
    bankName: 'BIDV',
    paymentMethod: 'BANK',
    joinDate: '01/08/2026',
    dailyRate: 620000,
    actualWorkDays: 25,
    salaryByDays: 0,
    overtimeHours: 8,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 500000,
    otherBonus: 400000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 3000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Cân chỉnh động cơ bơm giải nhiệt và chạy thử nghiệm hệ thống Chiller',
  },
  {
    id: '8',
    code: 'PNC-TV08',
    fullName: 'Hoàng Văn Phúc',
    trade: 'Thợ phụ cơ điện công trình',
    skillLevel: 'Thợ phụ',
    project: 'Dự án Vinhomes Grand Park',
    teamName: 'Đội Thi công Cơ điện 2',
    teamLeader: 'KS. Trần Văn Minh',
    phone: '0933 889 012',
    idCard: '079092089012',
    bankAccount: '9988776655',
    bankName: 'Techcombank',
    paymentMethod: 'CASH', // Nhận tiền mặt
    joinDate: '03/08/2026',
    dailyRate: 400000,
    actualWorkDays: 26,
    salaryByDays: 0,
    overtimeHours: 14,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 200000,
    otherBonus: 100000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 1000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Phụ kéo dây, luồn ống ghen và hỗ trợ dọn dẹp hiện trường thi công',
  },
  {
    id: '9',
    code: 'PNC-TV09',
    fullName: 'Võ Minh Sang',
    trade: 'Thợ điện nước M&E âm tường',
    skillLevel: 'Thợ lành nghề',
    project: 'Dự án Căn hộ Sun Avenue Q2',
    teamName: 'Đội Hoàn thiện M&E',
    teamLeader: 'KS. Đỗ Quang Hưng',
    phone: '0989 990 123',
    idCard: '079093090123',
    bankAccount: '5566778899',
    bankName: 'Agribank',
    paymentMethod: 'BANK',
    joinDate: '06/08/2026',
    dailyRate: 530000,
    actualWorkDays: 24.5,
    salaryByDays: 0,
    overtimeHours: 16,
    overtimePay: 0,
    mealAllowance: 750000,
    travelSafetyAllowance: 300000,
    otherBonus: 200000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 2000000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Cắt đục bê tông, đi ống uPVC và ống nước nóng PPR căn hộ mẫu',
  },
  {
    id: '10',
    code: 'PNC-TV10',
    fullName: 'Phan Thanh Bình',
    trade: 'Thợ cơ khí đột dập máng cáp trunking',
    skillLevel: 'Thợ bậc 3/7',
    project: 'Xưởng Cơ điện Linh Xuân',
    teamName: 'Đội Gia công Cơ khí xưởng',
    teamLeader: 'KS. Lê Văn Hải',
    phone: '0972 101 234',
    idCard: '079094001234',
    bankAccount: '1987654321',
    bankName: 'VPBank',
    paymentMethod: 'BANK',
    joinDate: '01/08/2026',
    dailyRate: 500000,
    actualWorkDays: 26,
    salaryByDays: 0,
    overtimeHours: 22,
    overtimePay: 0,
    mealAllowance: 780000,
    travelSafetyAllowance: 350000,
    otherBonus: 300000,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 1500000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Vận hành máy chấn đột máng cáp trunking và thang máng cáp mạ kẽm',
  },
  {
    id: '11',
    code: 'PNC-TV11',
    fullName: 'Đinh Văn Hậu',
    trade: 'Thợ hàn điện & kết cấu thép',
    skillLevel: 'Thợ chính',
    project: 'Xưởng Cơ điện Linh Xuân',
    teamName: 'Đội Cơ khí xưởng',
    teamLeader: 'KS. Lê Văn Hải',
    phone: '0902 212 345',
    idCard: '079095012345',
    bankAccount: '0123987456',
    bankName: 'Sacombank',
    paymentMethod: 'CASH', // Nhận tiền mặt
    joinDate: '04/08/2026',
    dailyRate: 520000,
    actualWorkDays: 25,
    salaryByDays: 0,
    overtimeHours: 12,
    overtimePay: 0,
    mealAllowance: 750000,
    travelSafetyAllowance: 350000,
    otherBonus: 0,
    totalIncome: 0,
    hasTaxCommitment: false, // Chưa nộp Cam kết 08 -> Khấu trừ 10%
    personalIncomeTax: 0,
    advancePayment: 1500000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Hàn khung giá đỡ ống thép PCCC và thang máng cáp theo bản vẽ xưởng',
  },
  {
    id: '12',
    code: 'PNC-TV12',
    fullName: 'Trịnh Đình Khang',
    trade: 'Thợ phụ kéo cáp & luồn dây',
    skillLevel: 'Thợ phụ',
    project: 'Dự án Kho Lạnh KCN Long Hậu',
    teamName: 'Đội Thi công Cơ điện 2',
    teamLeader: 'KS. Phan Quốc Toàn',
    phone: '0919 323 456',
    idCard: '079096023456',
    bankAccount: '1122334455',
    bankName: 'MB Bank',
    paymentMethod: 'CASH', // Nhận tiền mặt
    joinDate: '15/08/2026',
    dailyRate: 380000,
    actualWorkDays: 22,
    salaryByDays: 0,
    overtimeHours: 8,
    overtimePay: 0,
    mealAllowance: 660000,
    travelSafetyAllowance: 200000,
    otherBonus: 0,
    totalIncome: 0,
    hasTaxCommitment: true,
    personalIncomeTax: 0,
    advancePayment: 800000,
    totalDeductions: 0,
    netSalary: 0,
    status: 'ACTIVE',
    notes: 'Phụ kéo cáp điều khiển phòng máy nén lạnh và hỗ trợ đội thợ chính',
  },
];

// Khởi tạo các bản ghi chấm công mẫu theo từng kỳ (W1, W2, BI1)
// Mặc định khởi tạo toàn bộ công nhân thời vụ ở trạng thái 0 công (Chưa chấm công) để tuyệt đối không tự nhảy công
export const initialSeasonalWorkers: SeasonalWorker[] = rawSeasonalWorkers.map((rawW) => {
  const m10Period = getMonthlyPeriodForMonth(2026, 10)[0];
  const emptySheet = createEmptyTimesheetForPeriod(m10Period);
  const zeroCalc = recomputeSeasonalWorkerPayroll({
    ...rawW,
    actualWorkDays: 0,
    overtimeHours: 0,
    mealAllowance: 0,
    travelSafetyAllowance: 0,
    otherBonus: 0,
    advancePayment: 0,
    selectedForAttendance: false,
  });

  return {
    ...zeroCalc,
    selectedForAttendance: false,
    payrollCycleType: '1_MONTH',
    currentPeriodKey: '2026-10_MONTH',
    currentWeekId: 'M1',
    currentWeekLabel: m10Period.label,
    attendanceMonth: 10,
    attendanceYear: 2026,
    weeklyTimesheet: emptySheet,
    periodRecords: {},
    monthlyAttendance: {},
  };
});

/**
 * Làm sạch dữ liệu công nhân thời vụ, loại bỏ các bản ghi chấm công tự động (25-26 công)
 * và đồng bộ đơn giá ngày công thống nhất mà KHÔNG tự động gán công mẫu.
 */
export function ensureSeasonalHistoricalMonths(rawWorker: SeasonalWorker): SeasonalWorker {
  const worker = sanitizeSeasonalWorkerAttendance(rawWorker);
  const isTeamWorker = worker.payrollCycleType === 'TEAM';
  const unifiedRate = getUnifiedWorkerDailyRate(worker);
  const configuredAllowances = !isTeamWorker
    ? {
        mealAllowance: Math.max(0, Number(worker.mealAllowance || 0)),
        travelSafetyAllowance: Math.max(0, Number(worker.travelSafetyAllowance || 0)),
        otherBonus: Math.max(0, Number(worker.otherBonus || 0)),
      }
    : undefined;
  const nextMonthly = { ...(worker.monthlyAttendance || {}) };
  const nextPeriods = syncPeriodRecordsDailyRate(
    { ...(worker.periodRecords || {}) },
    unifiedRate,
    isTeamWorker,
    configuredAllowances
  );

  return {
    ...worker,
    dailyRate: isTeamWorker ? 0 : unifiedRate > 0 ? unifiedRate : worker.dailyRate,
    monthlyAttendance: nextMonthly,
    periodRecords: nextPeriods,
  };
}

