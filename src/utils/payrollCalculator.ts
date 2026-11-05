import { Employee, DailyAttendanceDetail, MonthlyAttendanceRecord } from '../types';

export function getRealCurrentDateInfo() {
  const now = new Date();
  const realDay = now.getDate();
  const realMonth = now.getMonth() + 1;
  const realYear = now.getFullYear();
  const dayStr = String(realDay).padStart(2, '0');
  const monthStr = String(realMonth).padStart(2, '0');
  const nextMonthNum = realMonth === 12 ? 1 : realMonth + 1;
  const nextYearNum = realMonth === 12 ? realYear + 1 : realYear;
  const nextMonthStr = String(nextMonthNum).padStart(2, '0');

  return {
    realDay,
    realMonth,
    realYear,
    dayStr,
    monthStr,
    realMonthPadded: monthStr,
    realDateStr: `${dayStr}/${monthStr}/${realYear}`,
    realDateFormatted: `${dayStr}/${monthStr}/${realYear}`,
    realMonthKey: `${realYear}-${monthStr}`,
    realPeriodCode: `${monthStr}/${realYear}`,
    realPeriodLabel: `Kỳ lương tháng ${monthStr} năm ${realYear}`,
    realPaymentDate: `05/${nextMonthStr}/${nextYearNum}`,
  };
}

// Biểu thuế TNCN từng phần theo Luật thuế TNCN Việt Nam
export function calculatePIT(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  if (taxableIncome <= 5000000) {
    return taxableIncome * 0.05;
  } else if (taxableIncome <= 10000000) {
    return taxableIncome * 0.1 - 250000;
  } else if (taxableIncome <= 18000000) {
    return taxableIncome * 0.15 - 750000;
  } else if (taxableIncome <= 32000000) {
    return taxableIncome * 0.2 - 1650000;
  } else if (taxableIncome <= 52000000) {
    return taxableIncome * 0.25 - 3250000;
  } else if (taxableIncome <= 80000000) {
    return taxableIncome * 0.3 - 5850000;
  } else {
    return taxableIncome * 0.35 - 9850000;
  }
}

/**
 * Tổng hợp 5 chỉ số từ bản đồ ngày chấm công trong tháng:
 * - totalCong: Tổng ngày công thực tế
 * - totalVM: Vắng mặt / Nghỉ không lương
 * - totalDM: Đi muộn
 * - totalNP: Nghỉ phép có lương
 * - totalOT: Tổng giờ tăng ca
 */
export function calculateDaysSummary(daysMap?: { [dayNumber: number]: DailyAttendanceDetail }) {
  let totalCong = 0;
  let totalVM = 0;
  let totalDM = 0;
  let totalNP = 0;
  let totalOT = 0;

  Object.values(daysMap || {}).forEach((d) => {
    if (!d) return;
    const status = d.statusType;
    const units = Number(d.workUnits || 0);
    const ot = Number(d.otHours || 0);

    totalOT += ot;

    if (status === 'LEAVE') {
      totalNP += 1;
    } else if (status === 'ABSENT') {
      totalVM += 1;
    } else if (status === 'LATE') {
      totalDM += 1;
      totalCong += units > 0 ? units : 1;
    } else if (units > 0) {
      totalCong += units;
    }
  });

  return {
    totalCong: Math.round(totalCong * 10) / 10,
    totalVM,
    totalDM,
    totalNP,
    totalOT: Math.round(totalOT * 10) / 10,
  };
}

/**
 * Tự động tạo bản đồ chi tiết từng ngày trong tháng khớp 100% với tổng số công, giờ OT, nghỉ phép, vắng mặt
 */
export function synthesizeDaysMapFromTotals(
  month: number,
  year: number,
  actualWorkDays: number,
  overtimeHours: number,
  paidLeaveDays: number = 0,
  unpaidLeaveDays: number = 0
): { [dayNumber: number]: DailyAttendanceDetail } {
  if (
    (actualWorkDays || 0) <= 0 &&
    (overtimeHours || 0) <= 0 &&
    (paidLeaveDays || 0) <= 0 &&
    (unpaidLeaveDays || 0) <= 0
  ) {
    return {};
  }

  const totalDaysInMonth = new Date(year, month, 0).getDate();
  const mStr = String(month).padStart(2, '0');
  const generated: { [dayNumber: number]: DailyAttendanceDetail } = {};

  let remWork = Math.max(0, Number(actualWorkDays) || 0);
  let remLeave = Math.max(0, Math.round(Number(paidLeaveDays) || 0));
  let remAbsent = Math.max(0, Math.round(Number(unpaidLeaveDays) || 0));
  let remOt = Math.max(0, Math.round(Number(overtimeHours) || 0));

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d, 12, 0, 0);
    const isSunday = dateObj.getDay() === 0;
    const dateStr = `${String(d).padStart(2, '0')}/${mStr}/${year}`;

    if (isSunday) {
      if (remAbsent > 0) {
        generated[d] = {
          day: d,
          dateStr,
          workUnits: 0,
          statusType: 'ABSENT',
          otHours: 0,
        };
        remAbsent -= 1;
      }
      continue;
    }

    if (remWork >= 1) {
      generated[d] = {
        day: d,
        dateStr,
        workUnits: 1,
        statusType: 'FULL',
        otHours: 0,
      };
      remWork -= 1;
    } else if (remWork >= 0.5) {
      generated[d] = {
        day: d,
        dateStr,
        workUnits: 0.5,
        statusType: 'HALF',
        otHours: 0,
      };
      remWork = 0;
    } else if (remLeave > 0) {
      generated[d] = {
        day: d,
        dateStr,
        workUnits: 0,
        statusType: 'LEAVE',
        otHours: 0,
      };
      remLeave -= 1;
    } else if (remAbsent > 0) {
      generated[d] = {
        day: d,
        dateStr,
        workUnits: 0,
        statusType: 'ABSENT',
        otHours: 0,
      };
      remAbsent -= 1;
    }
  }

  // Nếu vẫn còn công lẻ (do làm cả Chủ Nhật)
  if (remWork > 0) {
    for (let d = 1; d <= totalDaysInMonth; d++) {
      if (remWork <= 0) break;
      const dateStr = `${String(d).padStart(2, '0')}/${mStr}/${year}`;
      if (!generated[d] || generated[d].workUnits === 0) {
        const addUnit = remWork >= 1 ? 1 : 0.5;
        generated[d] = {
          day: d,
          dateStr,
          workUnits: addUnit,
          statusType: addUnit === 1 ? 'FULL' : 'HALF',
          otHours: generated[d]?.otHours || 0,
        };
        remWork -= addUnit;
      }
    }
  }

  // Phân bổ giờ tăng ca (OT) lên các ngày đi làm
  const workingDayNums = Object.keys(generated)
    .map(Number)
    .filter((d) => (generated[d]?.workUnits || 0) > 0);

  if (remOt > 0 && workingDayNums.length === 0) {
    // Trường hợp chỉ có OT mà chưa có ngày công -> gắn vào ngày 1
    const dateStr = `01/${mStr}/${year}`;
    generated[1] = {
      day: 1,
      dateStr,
      workUnits: 1,
      statusType: 'FULL',
      otHours: remOt,
    };
  } else {
    let pass = 0;
    while (remOt > 0 && workingDayNums.length > 0 && pass < 12) {
      for (const dNum of workingDayNums) {
        if (remOt <= 0) break;
        const addOt = Math.min(remOt, pass === 0 ? 3 : 1);
        generated[dNum] = {
          ...generated[dNum],
          otHours: (generated[dNum].otHours || 0) + addOt,
        };
        remOt -= addOt;
      }
      pass++;
    }
  }

  return generated;
}

export function buildMonthlyAttendanceRecord(
  month: number,
  year: number,
  actualWorkDays: number,
  overtimeHours: number,
  paidLeaveDays: number = 0,
  unpaidLeaveDays: number = 0
): MonthlyAttendanceRecord {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const days = synthesizeDaysMapFromTotals(
    month,
    year,
    actualWorkDays,
    overtimeHours,
    paidLeaveDays,
    unpaidLeaveDays
  );
  const summary = calculateDaysSummary(days);
  return {
    monthKey,
    month,
    year,
    totalWorkDays: summary.totalCong,
    totalOtHours: summary.totalOT,
    days,
    lastSubmittedAt: '2026-09-01T00:00:00.000Z',
    submittedBy: 'ADMIN',
  };
}

// Chuẩn hóa họ tên để đối chiếu chính xác nhân sự ngay cả khi Mã NV (PNC0001...) bị đánh lại số thứ tự
export function normalizeEmpName(name?: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Dữ liệu lịch sử chuẩn Tháng 10/2026 đối chiếu theo Họ Tên nhân sự
// Chỉ những nhân viên thực sự có chấm công mới có số công > 0; nhân viên không chấm công giữ nguyên 0 công.
// Lưu ý: Tháng 09/2026 nhóm Nhân Viên Chính Thức KHÔNG chấm công nên mặc định toàn bộ 0 công.
const HISTORICAL_MONTH_10_BY_NAME: Record<string, { work: number; ot: number; np: number; vm: number }> = {
  'NGUYEN THANH THUY': { work: 27, ot: 0, np: 0, vm: 0 },
  'TRAN ANH MINH': { work: 27, ot: 0, np: 0, vm: 0 },
  'HAN VAN QUANG': { work: 27, ot: 90, np: 0, vm: 3 },
  'HAN KIEU DUY PHON': { work: 26, ot: 38, np: 0, vm: 2 },
  'LE DINH NGOC': { work: 26, ot: 100, np: 0, vm: 3 },
  'TRAN NGOC HOANG HUY': { work: 24.5, ot: 71, np: 0, vm: 3 },
  'DANG TAN PHIEU': { work: 24, ot: 73, np: 0, vm: 3 },
  'NGUYEN TAN VIET': { work: 27, ot: 98, np: 0, vm: 0 },
  'PHAM VAN KHOA': { work: 25.5, ot: 59.5, np: 0, vm: 0 },
};

// Danh sách nhân sự chưa chấm công Tháng 10/2026
const UNCLOCKED_OCT_2026_NAMES = new Set([
  'ADMIN',
  'TRAN TAN DAT',
  'HO PHAN THANH LONG',
]);

// Nhận diện danh sách 19 nhân viên mẫu cũ (chứa các mã PNC0004, PNC0008, PNC0014..PNC0019 hoặc Admin)
export function isLegacy19MockEmployeeList(list?: Employee[] | null): boolean {
  if (!Array.isArray(list) || list.length === 0) return false;
  if (list.length >= 14) return true;
  return list.some((e) => {
    if (!e) return false;
    const code = String(e.code || '').trim();
    const norm = normalizeEmpName(e.fullName);
    if (['PNC0004', 'PNC0008', 'PNC0014', 'PNC0015', 'PNC0016', 'PNC0017', 'PNC0018', 'PNC0019'].includes(code)) {
      return true;
    }
    if (norm === 'ADMIN') return true;
    if (code === 'PNC0003' && norm === 'TRAN ANH MINH') return true;
    if (code === 'PNC0002' && norm === 'NGUYEN THANH THUY') return true;
    return false;
  });
}

/**
 * Làm sạch dữ liệu chấm công tự nhảy của nhân viên chính thức:
 * 1. Xóa bỏ công Tháng 09/2026 tự nhảy từ dữ liệu mẫu cũ (nhóm Nhân Viên Chính Thức không chấm công Tháng 9).
 * 2. Xóa bỏ công Tháng 11/2026 bị tự sao chép từ Tháng 10 hoặc tự điền 24-27 công khi chưa chấm.
 * 3. Xóa bỏ công Tháng 10/2026 bị tự nhảy 26-27 công (0 OT) của các nhân viên chưa tham gia chấm công.
 */
export function sanitizeEmployeeMonthlyAttendance(emp: Employee): Employee {
  const normName = normalizeEmpName(emp.fullName);
  const existingMonthly: Record<string, MonthlyAttendanceRecord> = {
    ...(emp.monthlyAttendance || {}),
  };

  // 1. Làm sạch Tháng 09/2026: Nhóm Nhân Viên Chính Thức không chấm công Tháng 9
  const rec09 = existingMonthly['2026-09'];
  if (rec09) {
    const w09 = Number(rec09.totalWorkDays || 0);
    const ot09 = Number(rec09.totalOtHours || 0);
    const hasDays09 = rec09.days && Object.keys(rec09.days).length > 0;
    const isManual09 = rec09.submittedBy === 'MANUAL_USER';
    if (!isManual09 && (w09 > 0 || ot09 > 0 || hasDays09)) {
      existingMonthly['2026-09'] = {
        monthKey: '2026-09',
        month: 9,
        year: 2026,
        totalWorkDays: 0,
        totalOtHours: 0,
        days: {},
        lastSubmittedAt: new Date().toISOString(),
        submittedBy: 'ADMIN',
      };
    }
  }

  // 2. Làm sạch Tháng 11/2026 nếu bị tự sao chép từ Tháng 10 hoặc tự sinh đủ tháng
  const rec11 = existingMonthly['2026-11'];
  if (rec11) {
    const rec10 = existingMonthly['2026-10'];
    const h10 = HISTORICAL_MONTH_10_BY_NAME[normName];
    const w11 = Number(rec11.totalWorkDays || 0);
    const ot11 = Number(rec11.totalOtHours || 0);
    const isDefault11 = rec11.lastSubmittedAt === '2026-09-01T00:00:00.000Z';
    const isManual11 = rec11.submittedBy === 'MANUAL_USER';
    const matchesOct =
      (rec10 && w11 > 0 && w11 === Number(rec10.totalWorkDays || 0) && ot11 === Number(rec10.totalOtHours || 0)) ||
      (h10 && w11 > 0 && w11 === h10.work && ot11 === h10.ot);
    // Hôm nay mới đầu tháng 11/2026 nên bất kỳ bản ghi nào tự có >= 20 công đều là dữ liệu tự nhảy
    if (!isManual11 && (isDefault11 || matchesOct || w11 >= 20)) {
      existingMonthly['2026-11'] = {
        monthKey: '2026-11',
        month: 11,
        year: 2026,
        totalWorkDays: 0,
        totalOtHours: 0,
        days: {},
        lastSubmittedAt: new Date().toISOString(),
        submittedBy: 'ADMIN',
      };
    }
  }

  // 3. Làm sạch Tháng 10/2026 cho những nhân sự chưa chấm công nhưng bị tự nhảy công do lỗi đồng bộ mã cũ
  const rec10 = existingMonthly['2026-10'];
  if (rec10) {
    const w10 = Number(rec10.totalWorkDays || 0);
    const ot10 = Number(rec10.totalOtHours || 0);
    const isManualUser = rec10.submittedBy === 'MANUAL_USER';
    if (UNCLOCKED_OCT_2026_NAMES.has(normName) && !isManualUser && (w10 > 0 || ot10 > 0)) {
      existingMonthly['2026-10'] = {
        monthKey: '2026-10',
        month: 10,
        year: 2026,
        totalWorkDays: 0,
        totalOtHours: 0,
        days: {},
        lastSubmittedAt: new Date().toISOString(),
        submittedBy: 'ADMIN',
      };
    } else if (HISTORICAL_MONTH_10_BY_NAME[normName] && !isManualUser) {
      // Nếu bản ghi lịch sử Tháng 10 bị phép gộp cũ làm sai lệch số công (VD: Lê Đình Ngọc 26->27, Hoàng Huy 24.5->26.5)
      const h10 = HISTORICAL_MONTH_10_BY_NAME[normName];
      if (w10 !== h10.work || ot10 !== h10.ot) {
        existingMonthly['2026-10'] = buildMonthlyAttendanceRecord(
          10,
          2026,
          h10.work,
          h10.ot,
          h10.np,
          h10.vm
        );
      }
    }
  }

  return {
    ...emp,
    monthlyAttendance: existingMonthly,
  };
}

/**
 * Đảm bảo nhân sự luôn có lịch sử chấm công Tháng 10/2026 (theo đúng tên nhân sự),
 * tuyệt đối không tự nhảy công cho Tháng 09/2026 hoặc nhân viên chưa chấm công.
 */
export function ensureEmployeeHistoricalMonths(emp: Employee): Employee {
  const sanitized = sanitizeEmployeeMonthlyAttendance(emp);
  const existingMonthly = { ...(sanitized.monthlyAttendance || {}) };
  const normName = normalizeEmpName(sanitized.fullName);

  // Khởi tạo Tháng 10/2026 nếu chưa có (chỉ với nhân sự thực sự có chấm công Tháng 10)
  if (!existingMonthly['2026-10']) {
    const h10 = HISTORICAL_MONTH_10_BY_NAME[normName];
    if (h10 && (h10.work > 0 || h10.ot > 0)) {
      existingMonthly['2026-10'] = buildMonthlyAttendanceRecord(
        10,
        2026,
        h10.work,
        h10.ot,
        h10.np,
        h10.vm
      );
    }
  }

  return {
    ...sanitized,
    monthlyAttendance: existingMonthly,
  };
}

/**
 * Tính toán lương nhân viên chính thức:
 * - BẢN LƯƠNG TỰ ĐỘNG NHẢY LƯƠNG KHI NHÂN VIÊN THAM GIA CHẤM CÔNG (actualWorkDays > 0 || overtimeHours > 0 || paidLeaveDays > 0)
 * - Khi nhân viên chưa tham gia chấm công (0 công, 0 giờ TC, 0 nghỉ phép), lương hiển thị = 0 đ và trạng thái selectedForAttendance = false.
 */
export function recomputeEmployeePayroll(emp: Employee): Employee {
  const stdDays = emp.standardWorkDays || 26;
  const actDays = Math.max(0, Number(emp.actualWorkDays) || 0);
  const overtimeHours = Math.max(0, Number(emp.overtimeHours) || 0);
  const paidLeaveDays = Math.max(0, Number(emp.paidLeaveDays) || 0);
  const isDaily = emp.salaryType === 'DAILY';

  const responsibilityAllowance = Number(emp.responsibilityAllowance) || 0;
  const projectAllowance = Number(emp.projectAllowance) || 0;
  const mealAllowance = Number(emp.mealAllowance) || 0;
  const phoneTravelAllowance = Number(emp.phoneTravelAllowance) || 0;
  const kpiBonus = Number(emp.kpiBonus) || 0;
  const otherIncome = Number(emp.otherIncome) || 0;

  // Nhân viên có tham gia chấm công trong kỳ hay không:
  const isActive = (emp.status || 'ACTIVE') === 'ACTIVE';
  const hasParticipatedInAttendance = actDays > 0 || overtimeHours > 0 || paidLeaveDays > 0;
  const selectedForAttendance = isActive && hasParticipatedInAttendance;

  // Nếu nhân viên chưa tham gia chấm công trong tháng này (0 công, 0 giờ TC, 0 phép):
  // Bản lương để 0 đ cho đến khi nhân viên tham gia chấm công!
  if (!hasParticipatedInAttendance) {
    return {
      ...emp,
      actualWorkDays: 0,
      overtimeHours: 0,
      selectedForAttendance: false,
      responsibilityAllowance,
      projectAllowance,
      salaryByActualDays: 0,
      overtimePay: 0,
      totalIncome: 0,
      socialInsurance: 0,
      healthInsurance: 0,
      unemploymentInsurance: 0,
      totalInsurance: 0,
      unionFee: 0,
      taxExemptIncome: 0,
      taxableIncome: 0,
      personalIncomeTax: 0,
      totalDeductions: emp.advancePayment || 0,
      netSalary: 0,
    };
  }

  const effectiveDailyRate = isDaily
    ? (emp.dailyRate || emp.baseSalary)
    : (emp.baseSalary / stdDays);

  const salaryByActualDays = Math.round(
    isDaily ? (emp.dailyRate || emp.baseSalary) * actDays : (emp.baseSalary / stdDays) * actDays
  );

  const hourlyRate = effectiveDailyRate / 8;
  const overtimePay = Math.round(hourlyRate * 1.5 * overtimeHours);

  const totalIncome =
    salaryByActualDays +
    responsibilityAllowance +
    projectAllowance +
    mealAllowance +
    phoneTravelAllowance +
    kpiBonus +
    overtimePay +
    otherIncome;

  // Bảo hiểm (BHXH 8%, BHYT 1.5%, BHTN 1%)
  const insBase = emp.insuranceSalary || 0;
  const socialInsurance = Math.round(insBase * 0.08);
  const healthInsurance = Math.round(insBase * 0.015);
  const unemploymentInsurance = Math.round(insBase * 0.01);
  const totalInsurance = socialInsurance + healthInsurance + unemploymentInsurance;

  const unionFee = 0;

  const personalIncomeTax = 0;
  const calculatedTaxableIncome = 0;
  const taxExempt = 0;

  const totalDeductions = totalInsurance + (emp.advancePayment || 0);
  const netSalary = Math.max(0, totalIncome - totalDeductions);

  return {
    ...emp,
    actualWorkDays: actDays,
    overtimeHours,
    selectedForAttendance,
    responsibilityAllowance,
    projectAllowance,
    salaryByActualDays,
    overtimePay,
    totalIncome,
    socialInsurance,
    healthInsurance,
    unemploymentInsurance,
    totalInsurance,
    unionFee,
    taxExemptIncome: taxExempt,
    taxableIncome: calculatedTaxableIncome,
    personalIncomeTax,
    totalDeductions,
    netSalary,
  };
}

/**
 * Đồng bộ 100% dữ liệu nhân viên từ Bản Chấm Công (monthlyAttendance[monthKey]) sang Bản Lương cho bất kỳ Tháng/Năm nào.
 * Tuyệt đối KHÔNG tự sinh ngày công từ actualWorkDays của tháng khác khi tháng đang xem chưa chấm công.
 */
export function syncEmployeeForMonth(
  emp: Employee,
  month: number,
  year: number,
  standardWorkDays: number = 26
): Employee {
  const withHistory = ensureEmployeeHistoricalMonths(emp);
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const monthRecord = withHistory.monthlyAttendance?.[monthKey];

  if (monthRecord) {
    let daysMap = monthRecord.days || {};
    if (
      Object.keys(daysMap).length === 0 &&
      ((monthRecord.totalWorkDays || 0) > 0 || (monthRecord.totalOtHours || 0) > 0)
    ) {
      daysMap = synthesizeDaysMapFromTotals(
        month,
        year,
        monthRecord.totalWorkDays || 0,
        monthRecord.totalOtHours || 0,
        0,
        0
      );
    }

    const summary = calculateDaysSummary(daysMap);
    return recomputeEmployeePayroll({
      ...withHistory,
      standardWorkDays: withHistory.standardWorkDays || standardWorkDays,
      actualWorkDays: summary.totalCong,
      overtimeHours: summary.totalOT,
      paidLeaveDays: summary.totalNP,
      unpaidLeaveDays: summary.totalVM,
      selectedForAttendance: summary.totalCong > 0 || summary.totalOT > 0 || summary.totalNP > 0,
      monthlyAttendance: {
        ...(withHistory.monthlyAttendance || {}),
        [monthKey]: {
          ...monthRecord,
          totalWorkDays: summary.totalCong,
          totalOtHours: summary.totalOT,
          days: daysMap,
        },
      },
    });
  }

  // Nếu tháng đang xem chưa có bản ghi chấm công trong monthlyAttendance -> mặc định 0 công, Chưa chấm công!
  return recomputeEmployeePayroll({
    ...withHistory,
    standardWorkDays: withHistory.standardWorkDays || standardWorkDays,
    actualWorkDays: 0,
    overtimeHours: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    selectedForAttendance: false,
  });
}
