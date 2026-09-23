import {
  SeasonalWorker,
  WeeklyDayAttendance,
  SeasonalCycleType,
  SeasonalPeriodRecord,
  PayrollPeriodOption,
} from '../types';

export type { PayrollPeriodOption };

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
 * Tính toán danh sách các tuần trong bất kỳ Tháng & Năm nào (Lương 1 tuần)
 */
export function getWeeksForMonth(year: number, month: number): MonthWeekOption[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const mStr = String(month).padStart(2, '0');

  const defs = [
    { id: 'W1', weekNum: 1, startDay: 1, endDay: Math.min(7, daysInMonth) },
    { id: 'W2', weekNum: 2, startDay: 8, endDay: Math.min(14, daysInMonth) },
    { id: 'W3', weekNum: 3, startDay: 15, endDay: Math.min(21, daysInMonth) },
    { id: 'W4', weekNum: 4, startDay: 22, endDay: Math.min(28, daysInMonth) },
    { id: 'W5', weekNum: 5, startDay: 29, endDay: daysInMonth },
  ];

  return defs
    .filter((d) => d.startDay <= daysInMonth)
    .map((d) => {
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const curDay = d.startDay + i;
        if (curDay <= daysInMonth) {
          dates.push(`${String(curDay).padStart(2, '0')}/${mStr}`);
        } else {
          const nextM = month === 12 ? 1 : month + 1;
          const nextDay = curDay - daysInMonth;
          dates.push(`${String(nextDay).padStart(2, '0')}/${String(nextM).padStart(2, '0')}`);
        }
      }

      const sStr = String(d.startDay).padStart(2, '0');
      const eStr = String(d.endDay).padStart(2, '0');

      return {
        id: d.id,
        weekNum: d.weekNum,
        label: `Tuần ${d.weekNum} (${sStr}/${mStr} - ${eStr}/${mStr})`,
        shortLabel: `Tuần ${d.weekNum}`,
        startDay: d.startDay,
        endDay: d.endDay,
        dates,
      };
    });
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
      startDay: 1,
      endDay: 15,
      dates: d1Dates,
      maxStandardDays: 13,
    },
    {
      id: 'BI2',
      periodKey: `${yStr}-${mStr}_BI2`,
      cycleType: '2_WEEKS',
      label: `Đợt 2 (16/${mStr} - ${daysInMonth}/${mStr})`,
      shortLabel: `Đợt 2 (16 - ${daysInMonth})`,
      startDay: 16,
      endDay: daysInMonth,
      dates: d2Dates,
      maxStandardDays: daysInMonth - 15 >= 15 ? 13 : 12,
    },
  ];
}

/**
 * Lấy danh sách các kỳ thanh toán theo loại chu kỳ (1 tuần hoặc 2 tuần)
 */
export function getPayrollPeriods(
  year: number,
  month: number,
  cycleType: SeasonalCycleType = '1_WEEK'
): PayrollPeriodOption[] {
  const mStr = String(month).padStart(2, '0');
  const yStr = String(year);

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
    startDay: w.startDay,
    endDay: w.endDay,
    dates: w.dates,
    maxStandardDays: 6,
  }));
}

/**
 * Tạo bảng chấm công trống (0 công) cho một chu kỳ để người dùng chấm lại từ đầu
 */
export function createEmptyTimesheetForPeriod(period: PayrollPeriodOption): WeeklyDayAttendance[] {
  const dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const dayOfWeeks = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return period.dates.map((dateStr, idx) => {
    const dow = dayOfWeeks[idx % 7];
    const dName = dayNames[idx % 7];

    return {
      dayOfWeek: dow,
      dayName: dName,
      dateLabel: dateStr,
      workUnits: 0, // Mặc định 0 công
      otHours: 0,
      shiftType: 'DAY',
      note: 'Chưa chấm công',
    };
  });
}

/**
 * Tạo bảng chấm công có số công và OT cho một chu kỳ
 */
export function createTimesheetForPeriod(
  period: PayrollPeriodOption,
  workDays: number = 0,
  otHours: number = 0
): WeeklyDayAttendance[] {
  const dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];
  const dayOfWeeks = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  let remainingDays = workDays;
  let remainingOT = otHours;

  return period.dates.map((dateStr, idx) => {
    const dow = dayOfWeeks[idx % 7];
    const dName = dayNames[idx % 7];
    const isSunday = dow === 'CN';

    let dayWork = 0;
    if (!isSunday && remainingDays >= 1) {
      dayWork = 1;
      remainingDays -= 1;
    } else if (isSunday && remainingDays >= 1) {
      dayWork = 1;
      remainingDays -= 1;
    } else if (remainingDays >= 0.5) {
      dayWork = 0.5;
      remainingDays -= 0.5;
    }

    let dayOT = 0;
    if (dayWork > 0 && remainingOT > 0) {
      dayOT = Math.min(remainingOT, 4);
      remainingOT -= dayOT;
    }

    return {
      dayOfWeek: dow,
      dayName: dName,
      dateLabel: dateStr,
      workUnits: dayWork,
      otHours: dayOT,
      shiftType: 'DAY',
      note: dayWork > 0 ? (dayOT > 0 ? `Thi công + ${dayOT}h OT` : 'Thi công bình thường') : 'Nghỉ ca',
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
export function recomputeSeasonalWorkerPayroll(worker: SeasonalWorker): SeasonalWorker {
  const dailyRate = Math.max(0, worker.dailyRate || 0);
  const actualWorkDays = Math.max(0, worker.actualWorkDays || 0);
  const overtimeHours = Math.max(0, worker.overtimeHours || 0);

  // 1. Tiền lương theo ngày công
  const salaryByDays = Math.round(dailyRate * actualWorkDays);

  // 2. Tiền làm thêm giờ (Đơn giá 1 giờ = Đơn giá ngày / 8 giờ, hệ số OT x 1.5)
  const hourlyRate = dailyRate / 8;
  const overtimePay = Math.round(hourlyRate * overtimeHours * 1.5);

  // 3. Phụ cấp và thưởng
  const mealAllowance = Math.max(0, worker.mealAllowance || 0);
  const travelSafetyAllowance = Math.max(0, worker.travelSafetyAllowance || 0);
  const otherBonus = Math.max(0, worker.otherBonus || 0);

  // 4. Tổng thu nhập
  const totalIncome = salaryByDays + overtimePay + mealAllowance + travelSafetyAllowance + otherBonus;

  // 5. Thuế TNCN thời vụ (10% nếu không có Cam kết 08 và tổng thu nhập >= 2.000.000đ)
  let personalIncomeTax = 0;
  if (!worker.hasTaxCommitment && totalIncome >= 2000000) {
    personalIncomeTax = Math.round(totalIncome * 0.1);
  }

  // 6. Tạm ứng tiền mặt tại công trường
  const advancePayment = Math.max(0, worker.advancePayment || 0);

  // 7. Tổng khấu trừ
  const totalDeductions = personalIncomeTax + advancePayment;

  // 8. Thực lĩnh thanh toán
  const netSalary = Math.max(0, totalIncome - totalDeductions);

  return {
    ...worker,
    dailyRate,
    actualWorkDays,
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
 * Lấy dữ liệu công, phụ cấp, OT, tạm ứng của công nhân trong chu kỳ được chọn (Tuần hoặc Đợt 2 tuần)
 * ĐẶC BIỆT THEO YÊU CẦU:
 * - Nếu chu kỳ đã được chấm và record: Hiển thị lại đúng số công, OT, tạm ứng đã lưu
 * - Nếu chu kỳ chưa chấm: MẶC ĐỊNH SỐ CÔNG = 0, OT = 0, TẠM ỨNG = 0 (bắt buộc người dùng chấm lại, không để sẵn)
 */
export function getWorkerForPeriod(worker: SeasonalWorker, period: PayrollPeriodOption): SeasonalWorker {
  const pKey = period.periodKey;
  const existingRecord = worker.periodRecords?.[pKey];

  if (existingRecord) {
    return recomputeSeasonalWorkerPayroll({
      ...worker,
      currentPeriodKey: pKey,
      currentWeekId: period.id,
      currentWeekLabel: period.label,
      payrollCycleType: period.cycleType,
      actualWorkDays: existingRecord.actualWorkDays,
      overtimeHours: existingRecord.overtimeHours,
      mealAllowance: existingRecord.mealAllowance,
      travelSafetyAllowance: existingRecord.travelSafetyAllowance,
      otherBonus: existingRecord.otherBonus,
      hasTaxCommitment: existingRecord.hasTaxCommitment ?? worker.hasTaxCommitment,
      advancePayment: existingRecord.advancePayment,
      weeklyTimesheet:
        existingRecord.weeklyTimesheet ||
        createTimesheetForPeriod(period, existingRecord.actualWorkDays, existingRecord.overtimeHours),
      notes: existingRecord.notes ?? worker.notes,
    });
  }

  // Chu kỳ chưa được chấm công -> Mặc định 0 công để người dùng chấm lại từ đầu
  const emptySheet = createEmptyTimesheetForPeriod(period);
  return recomputeSeasonalWorkerPayroll({
    ...worker,
    currentPeriodKey: pKey,
    currentWeekId: period.id,
    currentWeekLabel: period.label,
    payrollCycleType: period.cycleType,
    actualWorkDays: 0, // Mặc định 0 công
    overtimeHours: 0,
    mealAllowance: 0,
    travelSafetyAllowance: 0,
    otherBonus: 0,
    advancePayment: 0,
    weeklyTimesheet: emptySheet,
  });
}

/**
 * Chấm công và record lại số liệu của công nhân cho một chu kỳ cụ thể
 */
export function recordWorkerPeriod(
  worker: SeasonalWorker,
  period: PayrollPeriodOption,
  patch: Partial<SeasonalWorker>
): SeasonalWorker {
  const pKey = period.periodKey;
  const updated = recomputeSeasonalWorkerPayroll({
    ...worker,
    ...patch,
    currentPeriodKey: pKey,
    currentWeekId: period.id,
    currentWeekLabel: period.label,
    payrollCycleType: period.cycleType,
  });

  const periodRecord: SeasonalPeriodRecord = {
    periodKey: pKey,
    periodLabel: period.label,
    cycleType: period.cycleType,
    isRecorded: true,
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
    weeklyTimesheet: updated.weeklyTimesheet,
    notes: updated.notes,
  };

  const periodRecords = {
    ...(worker.periodRecords || {}),
    [pKey]: periodRecord,
  };

  return {
    ...updated,
    periodRecords,
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
// CỰC KỲ QUAN TRỌNG: Các tuần W3, W4, W5 và BI2 CHƯA CHẤM CÔNG (mặc định = 0 công để người dùng chấm lại)
export const initialSeasonalWorkers: SeasonalWorker[] = rawSeasonalWorkers.map((w, index) => {
  const w1Days = index % 3 === 0 ? 5.5 : 6;
  const w1OT = (index % 4) * 2;
  const w1Meal = w1Days * 30000;
  const w1Advance = (index % 2 === 0 ? 1000000 : 500000);

  const w2Days = index % 4 === 0 ? 5 : 6;
  const w2OT = (index % 3) * 2;
  const w2Meal = w2Days * 30000;
  const w2Advance = (index % 3 === 0 ? 800000 : 500000);

  // W1 (Tuần 1: 01/09 - 07/09)
  const w1Calc = recomputeSeasonalWorkerPayroll({
    ...w,
    actualWorkDays: w1Days,
    overtimeHours: w1OT,
    mealAllowance: w1Meal,
    travelSafetyAllowance: 100000,
    otherBonus: 0,
    advancePayment: w1Advance,
  });

  const p1Periods = getPayrollPeriods(2026, 9, '1_WEEK');
  const w1Period = p1Periods.find((p) => p.id === 'W1') || p1Periods[0];
  const w1Timesheet = createTimesheetForPeriod(w1Period, w1Days, w1OT);

  const w1Record: SeasonalPeriodRecord = {
    periodKey: '2026-09_W1',
    periodLabel: 'Tuần 1 (01/09 - 07/09)',
    cycleType: '1_WEEK',
    isRecorded: true,
    actualWorkDays: w1Days,
    salaryByDays: w1Calc.salaryByDays,
    overtimeHours: w1OT,
    overtimePay: w1Calc.overtimePay,
    mealAllowance: w1Meal,
    travelSafetyAllowance: 100000,
    otherBonus: 0,
    totalIncome: w1Calc.totalIncome,
    hasTaxCommitment: w.hasTaxCommitment,
    personalIncomeTax: w1Calc.personalIncomeTax,
    advancePayment: w1Advance,
    totalDeductions: w1Calc.totalDeductions,
    netSalary: w1Calc.netSalary,
    weeklyTimesheet: w1Timesheet,
    notes: 'Đã hoàn thành thi công Tuần 1',
  };

  // W2 (Tuần 2: 08/09 - 14/09)
  const w2Calc = recomputeSeasonalWorkerPayroll({
    ...w,
    actualWorkDays: w2Days,
    overtimeHours: w2OT,
    mealAllowance: w2Meal,
    travelSafetyAllowance: 100000,
    otherBonus: 0,
    advancePayment: w2Advance,
  });

  const w2Period = p1Periods.find((p) => p.id === 'W2') || p1Periods[1];
  const w2Timesheet = createTimesheetForPeriod(w2Period, w2Days, w2OT);

  const w2Record: SeasonalPeriodRecord = {
    periodKey: '2026-09_W2',
    periodLabel: 'Tuần 2 (08/09 - 14/09)',
    cycleType: '1_WEEK',
    isRecorded: true,
    actualWorkDays: w2Days,
    salaryByDays: w2Calc.salaryByDays,
    overtimeHours: w2OT,
    overtimePay: w2Calc.overtimePay,
    mealAllowance: w2Meal,
    travelSafetyAllowance: 100000,
    otherBonus: 0,
    totalIncome: w2Calc.totalIncome,
    hasTaxCommitment: w.hasTaxCommitment,
    personalIncomeTax: w2Calc.personalIncomeTax,
    advancePayment: w2Advance,
    totalDeductions: w2Calc.totalDeductions,
    netSalary: w2Calc.netSalary,
    weeklyTimesheet: w2Timesheet,
    notes: 'Đang thi công Tuần 2',
  };

  // Đợt 1 (01/09 - 15/09) của Lương 2 tuần
  const bi1Days = 12;
  const bi1OT = 8;
  const bi1Meal = bi1Days * 30000;
  const bi1Advance = 1500000;
  const bi1Calc = recomputeSeasonalWorkerPayroll({
    ...w,
    actualWorkDays: bi1Days,
    overtimeHours: bi1OT,
    mealAllowance: bi1Meal,
    travelSafetyAllowance: 200000,
    otherBonus: 0,
    advancePayment: bi1Advance,
  });

  const bi1Periods = getPayrollPeriods(2026, 9, '2_WEEKS');
  const bi1Period = bi1Periods[0];
  const bi1Timesheet = createTimesheetForPeriod(bi1Period, bi1Days, bi1OT);

  const bi1Record: SeasonalPeriodRecord = {
    periodKey: '2026-09_BI1',
    periodLabel: 'Đợt 1 (01/09 - 15/09)',
    cycleType: '2_WEEKS',
    isRecorded: true,
    actualWorkDays: bi1Days,
    salaryByDays: bi1Calc.salaryByDays,
    overtimeHours: bi1OT,
    overtimePay: bi1Calc.overtimePay,
    mealAllowance: bi1Meal,
    travelSafetyAllowance: 200000,
    otherBonus: 0,
    totalIncome: bi1Calc.totalIncome,
    hasTaxCommitment: w.hasTaxCommitment,
    personalIncomeTax: bi1Calc.personalIncomeTax,
    advancePayment: bi1Advance,
    totalDeductions: bi1Calc.totalDeductions,
    netSalary: bi1Calc.netSalary,
    weeklyTimesheet: bi1Timesheet,
    notes: 'Kỳ lương đợt 1 nửa đầu tháng 9',
  };

  const periodRecords: { [key: string]: SeasonalPeriodRecord } = {
    '2026-09_W1': w1Record,
    '2026-09_W2': w2Record,
    '2026-09_BI1': bi1Record,
    // CÁC KỲ W3, W4, W5 VÀ BI2 KHÔNG CÓ BẢN GHI -> MẶC ĐỊNH SỐ CÔNG SẼ LÀ 0 ĐỂ CHẤM LẠI
  };

  // Mặc định nạp dữ liệu của Tuần 2
  return {
    ...w2Calc,
    payrollCycleType: '1_WEEK',
    currentPeriodKey: '2026-09_W2',
    currentWeekId: 'W2',
    currentWeekLabel: 'Tuần 2 (08/09 - 14/09)',
    attendanceMonth: 9,
    attendanceYear: 2026,
    weeklyTimesheet: w2Timesheet,
    periodRecords,
  };
});
