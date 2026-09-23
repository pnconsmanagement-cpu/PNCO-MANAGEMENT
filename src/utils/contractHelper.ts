import { Employee } from '../types';

export interface ContractStatusInfo {
  status: 'UNLIMITED' | 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  label: string;
  badgeClass: string;
  daysRemaining?: number;
  description: string;
}

export const STANDARD_CONTRACT_TYPES = [
  'HĐLĐ Không xác định thời hạn',
  'HĐLĐ Xác định thời hạn (12 tháng)',
  'HĐLĐ Xác định thời hạn (24 tháng)',
  'HĐLĐ Xác định thời hạn (36 tháng)',
  'Hợp đồng thử việc (60 ngày)',
  'Hợp đồng thử việc (30 ngày)',
  'Hợp đồng khoán việc / Theo công trình',
  'Hợp đồng thời vụ',
];

export const CONTRACT_DURATIONS = [
  'Vô thời hạn',
  '12 tháng',
  '24 tháng',
  '36 tháng',
  '60 ngày',
  '30 ngày',
  'Theo tiến độ công trình',
];

/**
 * Parse dd/mm/yyyy to Date
 */
export function parseDateVN(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  return null;
}

/**
 * Calculate contract status for HR management
 * Based on current date or period date
 */
export function getContractStatusInfo(emp: Partial<Employee>, referenceDate: Date = new Date()): ContractStatusInfo {
  const contractType = emp.contractType || 'HĐLĐ Không xác định thời hạn';
  const duration = emp.contractDuration || '';
  const endDateStr = emp.contractEndDate?.trim();

  // 1. Không xác định thời hạn
  const isUnlimited =
    contractType.includes('Không xác định') ||
    duration.toLowerCase().includes('vô thời hạn') ||
    (!endDateStr && !duration.match(/\d+\s*(tháng|năm|ngày)/i));

  if (isUnlimited) {
    return {
      status: 'UNLIMITED',
      label: 'Vô thời hạn',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      description: 'HĐLĐ không xác định thời hạn (KXDTH), bảo lưu chế độ lâu dài theo BLLĐ 2019',
    };
  }

  // 2. Nếu có ngày hết hạn cụ thể
  if (endDateStr) {
    const endDate = parseDateVN(endDateStr);
    if (endDate) {
      const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      const diffTime = end.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysRemaining < 0) {
        return {
          status: 'EXPIRED',
          label: 'Đã hết hạn',
          daysRemaining,
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
          description: `Đã quá hạn ${Math.abs(daysRemaining)} ngày (hết hạn ngày ${endDateStr}). Cần ký phụ lục hoặc gia hạn HĐ!`,
        };
      } else if (daysRemaining <= 30) {
        return {
          status: 'EXPIRING_SOON',
          label: `Sắp hết hạn (${daysRemaining} ngày)`,
          daysRemaining,
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold animate-pulse',
          description: `Còn ${daysRemaining} ngày là đến hạn (${endDateStr}). Nhân sự cần thông báo trước 15-30 ngày theo quy định.`,
        };
      } else {
        return {
          status: 'VALID',
          label: 'Còn hạn',
          daysRemaining,
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          description: `Thời hạn hợp đồng đến ngày ${endDateStr} (còn ${daysRemaining} ngày).`,
        };
      }
    }
  }

  // 3. Nếu là khoán việc / theo công trình
  if (contractType.includes('khoán việc') || contractType.includes('công trình') || duration.includes('công trình')) {
    return {
      status: 'VALID',
      label: 'Theo công trình',
      badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
      description: 'Hợp đồng khoán việc / dịch vụ theo tiến độ thi công cơ điện công trình',
    };
  }

  // Default: Có thời hạn xác định
  return {
    status: 'VALID',
    label: duration || 'Có thời hạn',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    description: `Hợp đồng có thời hạn: ${duration || 'Theo thỏa thuận'}`,
  };
}

/**
 * Auto-suggest duration & end date when selecting contract type
 */
export function getDefaultContractDetails(contractType: string, startDateStr: string = '01/01/2026') {
  const startDate = parseDateVN(startDateStr) || new Date();

  if (contractType.includes('Không xác định')) {
    return {
      contractDuration: 'Vô thời hạn',
      contractEndDate: '',
    };
  }

  if (contractType.includes('12 tháng')) {
    const end = new Date(startDate);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    return {
      contractDuration: '12 tháng',
      contractEndDate: `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
    };
  }

  if (contractType.includes('24 tháng')) {
    const end = new Date(startDate);
    end.setFullYear(end.getFullYear() + 2);
    end.setDate(end.getDate() - 1);
    return {
      contractDuration: '24 tháng',
      contractEndDate: `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
    };
  }

  if (contractType.includes('36 tháng')) {
    const end = new Date(startDate);
    end.setFullYear(end.getFullYear() + 3);
    end.setDate(end.getDate() - 1);
    return {
      contractDuration: '36 tháng',
      contractEndDate: `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
    };
  }

  if (contractType.includes('60 ngày') || contractType.includes('Thử việc')) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 60);
    return {
      contractDuration: '60 ngày',
      contractEndDate: `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
    };
  }

  if (contractType.includes('30 ngày')) {
    const end = new Date(startDate);
    end.setDate(end.getDate() + 30);
    return {
      contractDuration: '30 ngày',
      contractEndDate: `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`,
    };
  }

  if (contractType.includes('khoán việc') || contractType.includes('công trình')) {
    return {
      contractDuration: 'Theo tiến độ công trình',
      contractEndDate: '',
    };
  }

  return {
    contractDuration: '12 tháng',
    contractEndDate: '',
  };
}

/**
 * Đảm bảo mọi nhân viên luôn có thông tin HĐLĐ và Thời hạn hợp đồng hợp lệ
 * (Áp dụng tiêu chuẩn Bộ Luật Lao Động 2019 cho Phúc Nguyên M&E)
 */
export function ensureEmployeeContract(emp: Employee): Employee {
  if (emp.contractType && emp.contractDuration) {
    return emp;
  }

  const dept = emp.department || '';
  const title = emp.title || '';
  let contractType = 'HĐLĐ Xác định thời hạn (12 tháng)';
  let contractDuration = '12 tháng';
  let contractEndDate = '31/12/2026';
  const contractStartDate = emp.contractStartDate || emp.joinDate || '01/01/2024';

  if (dept === 'Ban Lãnh đạo' || dept === 'Kế toán' || title.includes('Giám đốc') || title.includes('Kế toán trưởng')) {
    contractType = 'HĐLĐ Không xác định thời hạn';
    contractDuration = 'Vô thời hạn';
    contractEndDate = '';
  } else if (title.includes('Chỉ huy trưởng')) {
    contractType = 'HĐLĐ Xác định thời hạn (36 tháng)';
    contractDuration = '36 tháng';
    contractEndDate = '10/08/2027';
  } else if (dept.includes('Giám sát') || dept.includes('Cơ điện')) {
    contractType = 'HĐLĐ Xác định thời hạn (24 tháng)';
    contractDuration = '24 tháng';
    contractEndDate = '15/03/2027';
  } else if (dept.includes('Thợ hàn') || dept.includes('thi công')) {
    contractType = 'HĐLĐ Xác định thời hạn (12 tháng)';
    contractDuration = '12 tháng';
    contractEndDate = '31/12/2026';
  }

  return {
    ...emp,
    contractType: emp.contractType || contractType,
    contractDuration: emp.contractDuration || contractDuration,
    contractStartDate: emp.contractStartDate || contractStartDate,
    contractEndDate: emp.contractEndDate !== undefined ? emp.contractEndDate : contractEndDate,
    contractNumber: emp.contractNumber || `HĐLĐ-${emp.code}/PNC`,
    contractFileUrl: emp.contractFileUrl || `https://drive.google.com/drive/search?q=HDLD_${emp.code}_${encodeURIComponent(emp.fullName)}`,
    contractFileName: emp.contractFileName || `HDLD_${emp.code}_${emp.fullName.replace(/\s+/g, '_')}.pdf`,
    contractAddendums: emp.contractAddendums || [],
  };
}

/**
 * Sinh số phụ lục hợp đồng lao động chuẩn pháp lý BLLĐ 2019
 */
export function generateAddendumNumber(empCode: string, year: number = 2026, sequence: number = 1): string {
  const seqStr = String(sequence).padStart(2, '0');
  return `PL${seqStr}/${year}/HĐLĐ-${empCode}/PNC`;
}

/**
 * Tạo nội dung Email chính thức gửi cho nhân viên khi tăng lương hàng năm & ban hành Phụ lục HĐLĐ
 */
export function generateSalaryIncreaseEmail(params: {
  employee: Employee;
  oldSalary: number;
  newSalary: number;
  effectiveDate: string;
  addendumNumber: string;
  reason: string;
  contractFileUrl?: string;
  companyName?: string;
}): { subject: string; body: string } {
  const {
    employee,
    oldSalary,
    newSalary,
    effectiveDate,
    addendumNumber,
    reason,
    contractFileUrl,
    companyName = 'CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN',
  } = params;

  const diffAmount = newSalary - oldSalary;
  const percent = oldSalary > 0 ? Math.round((diffAmount / oldSalary) * 1000) / 10 : 0;
  const formatMoney = (n: number) => n.toLocaleString('vi-VN');

  const subject = `[${companyName}] Quyết định Tăng lương & Phụ lục HĐLĐ năm ${new Date().getFullYear()} - ${employee.fullName} (${employee.code})`;

  const fileSection = contractFileUrl
    ? `\n📄 Đường dẫn tra cứu & tải file Hợp đồng/Phụ lục đã ký:\n${contractFileUrl}\n`
    : `\n📄 Bản gốc Phụ lục HĐLĐ được lưu trữ tại Phòng Nhân sự - Kế toán Công ty.\n`;

  const body = `Kính gửi Anh/Chị: ${employee.fullName},
Mã nhân viên: ${employee.code}
Chức danh: ${employee.title}
Bộ phận: ${employee.department}

Ban Giám Đốc và Phòng Nhân sự ${companyName} trân trọng ghi nhận và đánh giá cao những nỗ lực, tinh thần trách nhiệm cũng như đóng góp thiết thực của Anh/Chị trong suốt quá trình công tác.

Căn cứ Quy chế tiền lương của Công ty và quy định của Bộ Luật Lao Động 2019, Ban Giám Đốc trân trọng thông báo Quyết định điều chỉnh nâng bậc lương định kỳ cho Anh/Chị như sau:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THÔNG TIN ĐIỀU CHỈNH TIỀN LƯƠNG & HỢP ĐỒNG:
• Mức lương cơ bản trước điều chỉnh: ${formatMoney(oldSalary)} VNĐ/tháng
• MỨC LƯƠNG CƠ BẢN MỚI ÁP DỤNG:     ${formatMoney(newSalary)} VNĐ/tháng
• Mức tăng:                          +${formatMoney(diffAmount)} VNĐ/tháng (+${percent}%)
• Thời gian bắt đầu có hiệu lực:      Từ ngày ${effectiveDate}
• Căn cứ pháp lý:                    Phụ lục Hợp đồng Lao động số ${addendumNumber}
• Lý do điều chỉnh:                   ${reason}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${fileSection}
Các quyền lợi khác về chế độ bảo hiểm xã hội (BHXH, BHYT, BHTN), chế độ công đoàn và các điều khoản khác của Hợp đồng lao động tiếp tục được bảo đảm thực hiện đầy đủ theo đúng thỏa thuận và quy định pháp luật.

Kính chúc Anh/Chị luôn dồi dào sức khỏe, tiếp tục phát huy năng lực và gặt hái thêm nhiều thành công cùng sự phát triển của ${companyName}!

Mọi thắc mắc cần hỗ trợ, Anh/Chị vui lòng phản hồi email này hoặc liên hệ trực tiếp Phòng Nhân sự - Kế toán.

Trân trọng,
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BAN GIÁM ĐỐC & PHÒNG NHÂN SỰ - KẾ TOÁN
${companyName}
• Địa chỉ: Số 123 Đường D1, KDC Him Lam, P. Tân Hưng, Q.7, TP.HCM
• Email liên hệ: pncons.management@gmail.com
• Hotline: 0903 888 999`;

  return { subject, body };
}
