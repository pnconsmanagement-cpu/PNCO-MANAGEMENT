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
    lastSubmittedAt: new Date().toISOString(),
    submittedBy: 'ADMIN',
  };
}

// Dữ liệu lịch sử chuẩn Tháng 09/2026 và Tháng 10/2026 để khi người dùng chọn xem lại Tháng 9 hoặc Tháng 10 luôn có đầy đủ Bản Công & Bản Lương
const HISTORICAL_MONTH_09_2026: Record<string, { work: number; ot: number; np: number; vm: number }> = {
  PNC0001: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0002: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0003: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0004: { work: 25, ot: 18, np: 0, vm: 1 },
  PNC0005: { work: 26, ot: 8, np: 0, vm: 0 },
  PNC0006: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0007: { work: 25, ot: 19, np: 0, vm: 1 },
  PNC0008: { work: 27, ot: 38, np: 0, vm: 0 },
  PNC0009: { work: 25, ot: 17, np: 0, vm: 1 },
  PNC0010: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0011: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0012: { work: 25, ot: 22, np: 0, vm: 1 },
  PNC0013: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0014: { work: 24, ot: 10, np: 0, vm: 2 },
  PNC0015: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0016: { work: 25, ot: 21, np: 0, vm: 1 },
  PNC0017: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0018: { work: 25, ot: 12, np: 0, vm: 0 },
  PNC0019: { work: 26, ot: 0, np: 0, vm: 0 },
};

const HISTORICAL_MONTH_10_2026: Record<string, { work: number; ot: number; np: number; vm: number }> = {
  PNC0001: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0002: { work: 26, ot: 0, np: 0, vm: 0 },
  PNC0003: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0004: { work: 27, ot: 90, np: 0, vm: 3 },
  PNC0005: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0006: { work: 26, ot: 38, np: 0, vm: 3 },
  PNC0007: { work: 26, ot: 100, np: 1, vm: 3 },
  PNC0008: { work: 24, ot: 73, np: 2, vm: 4 },
  PNC0009: { work: 24.5, ot: 71, np: 2, vm: 3 },
  PNC0010: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0011: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0012: { work: 21.5, ot: 77, np: 0, vm: 3 },
  PNC0013: { work: 0, ot: 0, np: 0, vm: 0 },
  PNC0014: { work: 25, ot: 42, np: 0, vm: 1 },
  PNC0015: { work: 26, ot: 24, np: 0, vm: 0 },
  PNC0016: { work: 25.5, ot: 61, np: 1, vm: 0 },
  PNC0017: { work: 26, ot: 20, np: 0, vm: 0 },
  PNC0018: { work: 25, ot: 36, np: 0, vm: 1 },
  PNC0019: { work: 26, ot: 28, np: 0, vm: 0 },
};

/**
 * Đảm bảo nhân sự luôn có lịch sử chấm công Tháng 09/2026 và Tháng 10/2026 để tra cứu lại bất kỳ lúc nào,
 * đồng thời bảo toàn 100% dữ liệu đã chấm của tháng hiện tại.
 */
export function ensureEmployeeHistoricalMonths(emp: Employee): Employee {
  const existingMonthly = { ...(emp.monthlyAttendance || {}) };

  // 1. Khởi tạo Tháng 09/2026 nếu chưa có
  if (!existingMonthly['2026-09']) {
    const h09 = HISTORICAL_MONTH_09_2026[emp.code];
    if (h09) {
      existingMonthly['2026-09'] = buildMonthlyAttendanceRecord(
        9,
        2026,
        h09.work,
        h09.ot,
        h09.np,
        h09.vm
      );
    }
  }

  // 2. Khởi tạo Tháng 10/2026 nếu chưa có
  if (!existingMonthly['2026-10']) {
    const h10 = HISTORICAL_MONTH_10_2026[emp.code];
    if (h10) {
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
    ...emp,
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

  const unionFee = emp.unionFee !== undefined && emp.unionFee > 0
    ? emp.unionFee
    : Math.min(234000, Math.round(insBase * 0.01));

  const personalIncomeTax = 0;
  const calculatedTaxableIncome = 0;
  const taxExempt = 0;

  const totalDeductions = totalInsurance + unionFee + (emp.advancePayment || 0);
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

  // Nếu tháng đang xem chưa có bản ghi trong monthlyAttendance:
  // Nếu nhân viên đang ở trạng thái chưa chọn chấm công (selectedForAttendance === false) hoặc đã có các tháng khác trong monthlyAttendance -> khởi tạo 0 công cho tháng mới
  const hasOtherMonths =
    withHistory.monthlyAttendance && Object.keys(withHistory.monthlyAttendance).length > 0;

  if (hasOtherMonths || withHistory.selectedForAttendance === false) {
    return recomputeEmployeePayroll({
      ...withHistory,
      standardWorkDays: withHistory.standardWorkDays || standardWorkDays,
      actualWorkDays: 0,
      overtimeHours: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
    });
  }

  // Fallback nếu hồ sơ cũ có sẵn actualWorkDays > 0 cho kỳ hiện tại
  const builtRecord = buildMonthlyAttendanceRecord(
    month,
    year,
    withHistory.actualWorkDays || 0,
    withHistory.overtimeHours || 0,
    withHistory.paidLeaveDays || 0,
    withHistory.unpaidLeaveDays || 0
  );

  return recomputeEmployeePayroll({
    ...withHistory,
    standardWorkDays: withHistory.standardWorkDays || standardWorkDays,
    actualWorkDays: builtRecord.totalWorkDays,
    overtimeHours: builtRecord.totalOtHours,
    monthlyAttendance: {
      ...(withHistory.monthlyAttendance || {}),
      [monthKey]: builtRecord,
    },
  });
}
