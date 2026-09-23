import { Employee } from '../types';

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

export function recomputeEmployeePayroll(emp: Employee): Employee {
  const stdDays = emp.standardWorkDays || 26;
  const actDays = emp.actualWorkDays !== undefined ? emp.actualWorkDays : stdDays;
  const isDaily = emp.salaryType === 'DAILY';

  // Phương án 1: Tính lương theo ngày (DAILY - Nhân công nhật / Khoán ngày / Thời vụ)
  //   Lương theo công = Đơn giá ngày * Ngày công thực tế
  //   Đơn giá giờ OT = (Đơn giá ngày / 8) * 1.5 * Số giờ OT
  // Phương án 2: Tính lương theo tháng (MONTHLY - Lương cơ bản theo hợp đồng tháng)
  //   Lương theo công = =ROUND(((Mức lương / 26) * Ngày công), 0)
  //   Đơn giá giờ OT = =ROUND(((Mức lương / 26) / 8 * 1.5 * Số giờ OT), 0)
  const effectiveDailyRate = isDaily
    ? (emp.dailyRate || emp.baseSalary)
    : (emp.baseSalary / stdDays);

  const salaryByActualDays = Math.round(
    isDaily ? (emp.dailyRate || emp.baseSalary) * actDays : (emp.baseSalary / stdDays) * actDays
  );

  const hourlyRate = effectiveDailyRate / 8;
  const overtimeHours = Number(emp.overtimeHours) || 0;
  const overtimePay = Math.round(hourlyRate * 1.5 * overtimeHours);

  // Tổng thu nhập (A) bao gồm: Lương theo công + Phụ cấp trách nhiệm + Phụ cấp dự án + Ăn ca + Xăng xe + Thưởng + Tăng ca (1.5x)
  const responsibilityAllowance = Number(emp.responsibilityAllowance) || 0;
  const projectAllowance = Number(emp.projectAllowance) || 0;
  const mealAllowance = Number(emp.mealAllowance) || 0;
  const phoneTravelAllowance = Number(emp.phoneTravelAllowance) || 0;
  const kpiBonus = Number(emp.kpiBonus) || 0;
  const otherIncome = Number(emp.otherIncome) || 0;

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

  // Đoàn phí (1% lương đóng BH tối đa thường theo mức chuẩn, hoặc 110.000 - 234.000đ)
  const unionFee = emp.unionFee !== undefined ? emp.unionFee : Math.min(234000, Math.round(insBase * 0.01));

  // ĐÃ BỎ PHẦN THUẾ THU NHẬP CÁ NHÂN THEO YÊU CẦU CỦA NGƯỜI DÙNG (TNCN = 0)
  const personalIncomeTax = 0;
  const calculatedTaxableIncome = 0;
  const taxExempt = 0;

  // Tổng khấu trừ (B) = BHXH (10.5%) + Đoàn phí + Tạm ứng (Không trừ thuế thu nhập cá nhân)
  const totalDeductions = totalInsurance + unionFee + (emp.advancePayment || 0);

  // Thực lĩnh (C) = Tổng thu nhập (A) - Tổng khấu trừ (B)
  const netSalary = totalIncome - totalDeductions;

  return {
    ...emp,
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
