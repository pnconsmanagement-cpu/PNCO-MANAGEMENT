export interface Employee {
  id: string; // STT / ID
  code: string; // PNC0001, PNC0002...
  fullName: string; // Họ và tên
  title: string; // Chức danh / Chức vụ
  department: string; // Bộ phận
  joinDate: string; // Ngày vào làm (dd/mm/yyyy)
  bankAccount: string; // Số tài khoản
  bankName: string; // Ngân hàng (BIDV, ACB, Vietcombank, ...)
  idCard?: string; // CCCD/CMND
  taxCode?: string; // Mã số thuế cá nhân
  email?: string; // Email liên hệ của nhân viên
  phone?: string; // Số điện thoại liên hệ
  dependents: number; // Số người phụ thuộc

  // Chấm công
  standardWorkDays: number; // Ngày công chuẩn (thường 26)
  actualWorkDays: number; // Ngày công thực tế
  paidLeaveDays: number; // Nghỉ phép hưởng lương
  unpaidLeaveDays: number; // Nghỉ không lương
  overtimeHours: number; // Số giờ làm thêm (OT)

  // Lương & Thu nhập
  salaryType?: 'MONTHLY' | 'DAILY'; // 'MONTHLY' = Lương theo tháng (Lương CB / 26 * Công), 'DAILY' = Lương theo ngày (Đơn giá ngày * Công)
  dailyRate?: number; // Đơn giá lương 1 ngày (VNĐ/ngày)
  baseSalary: number; // Lương cơ bản theo tháng (nếu MONTHLY) hoặc Đơn giá ngày (nếu DAILY)
  salaryByActualDays: number; // Lương theo ngày công thực tế
  responsibilityAllowance: number; // Phụ cấp trách nhiệm
  projectAllowance: number; // Phụ cấp dự án
  mealAllowance: number; // Phụ cấp ăn trưa / ăn ca
  phoneTravelAllowance: number; // Phụ cấp xăng xe, điện thoại
  kpiBonus: number; // Thưởng KPI / Hoa hồng doanh số
  overtimePay: number; // Tiền làm thêm giờ (OT x 150%)
  otherIncome: number; // Thu nhập khác
  totalIncome: number; // Tổng thu nhập (A)

  // Các khoản giảm trừ & bảo hiểm
  insuranceSalary: number; // Mức lương đóng BHXH
  socialInsurance: number; // BHXH (8%)
  healthInsurance: number; // BHYT (1.5%)
  unemploymentInsurance: number; // BHTN (1%)
  totalInsurance: number; // Cộng bảo hiểm (10.5%)
  unionFee: number; // Đoàn phí công đoàn (1% hoặc cố định)
  taxExemptIncome: number; // Khoản miễn thuế (ăn ca, công tác phí...)
  taxableIncome: number; // Thu nhập tính thuế
  personalIncomeTax: number; // Thuế TNCN
  advancePayment: number; // Tạm ứng
  totalDeductions: number; // Tổng khấu trừ (B)

  // Thực lĩnh
  netSalary: number; // Thực lĩnh = A - B
  notes?: string; // Ghi chú

  // Quản lý nhân sự
  status?: 'ACTIVE' | 'RESIGNED' | 'LEAVE'; // Đang làm việc / Nghỉ việc / Tạm nghỉ
  selectedForAttendance?: boolean; // Tích chọn để đưa vào chấm công & tính lương

  // Hợp đồng lao động & Thời hạn hợp đồng (Theo Bộ Luật Lao Động 2019)
  contractType?: string; // Loại HĐLĐ: 'HĐLĐ Không xác định thời hạn', 'HĐLĐ Xác định thời hạn (12 tháng)', 'HĐLĐ Xác định thời hạn (24 tháng)', 'HĐLĐ Xác định thời hạn (36 tháng)', 'Hợp đồng thử việc (60 ngày)', 'Hợp đồng khoán việc'...
  contractDuration?: string; // Thời hạn hợp đồng: 'Vô thời hạn', '12 tháng', '24 tháng', '36 tháng', '60 ngày'...
  contractStartDate?: string; // Ngày ký / Ngày bắt đầu HĐLĐ (dd/mm/yyyy)
  contractEndDate?: string; // Ngày hết hạn HĐLĐ (dd/mm/yyyy, để trống nếu không xác định thời hạn)
  contractNumber?: string; // Số hợp đồng lao động (VD: 01/2024/HĐLĐ-PNC)
  contractFileUrl?: string; // Đường dẫn URL file Hợp đồng lao động (Google Drive, OneDrive, file nội bộ...)
  contractFileName?: string; // Tên file tài liệu đính kèm (vd: HDLD_PNC0001.pdf)
  contractAddendums?: ContractAddendum[]; // Phụ lục hợp đồng & Lịch sử nâng lương hàng năm
  sortOrder?: number; // Thứ tự sắp xếp STT hiển thị cố định giữa các máy tính
}

export interface SeasonalWorker {
  id: string; // STT / ID
  code: string; // PNC-TV01, PNC-TV02...
  sortOrder?: number; // Thứ tự sắp xếp STT hiển thị cố định giữa các máy tính
  fullName: string; // Họ tên công nhân kỹ thuật
  trade: string; // Nghề / Chuyên môn: Thợ hàn kết cấu, Thợ điện M&E, Thợ lắp ống PCCC, Thợ HVAC, Thợ cơ khí, Thợ phụ công trình...
  skillLevel: string; // Bậc thợ / Tay nghề: Thợ bậc 4/7, Thợ chính, Thợ 6G, Thợ phụ, Thợ lành nghề...
  project: string; // Công trình / Dự án: Vinhomes Grand Park, Nhà máy Dược Mekophar, Bitexco...
  teamName: string; // Tổ / Đội thi công: Đội Cơ điện 1, Đội Hàn áp lực, Đội PCCC & HVAC...
  teamLeader: string; // Chỉ huy / Tổ trưởng phụ trách: KS. Trần Văn Minh, KS. Phan Quốc Toàn...
  phone: string; // Số điện thoại
  idCard: string; // Số CCCD / CMND
  bankAccount: string; // Số tài khoản ngân hàng
  bankName: string; // Ngân hàng (Vietcombank, MB Bank, Agribank, ACB, Techcombank...)
  paymentMethod: 'BANK' | 'CASH'; // 'BANK' = Chuyển khoản qua ngân hàng, 'CASH' = Ký nhận tiền mặt tại công trường
  joinDate: string; // Ngày bắt đầu vào làm (dd/mm/yyyy)

  // Tiền lương công nhật & Thu nhập
  dailyRate: number; // Đơn giá ngày công (VNĐ/ngày, vd: 550.000)
  actualWorkDays: number; // Số ngày công thực tế trong kỳ (vd: 24.5)
  salaryByDays: number; // Lương theo ngày công = dailyRate * actualWorkDays
  overtimeHours: number; // Số giờ làm thêm (OT)
  overtimePay: number; // Tiền làm thêm = (dailyRate / 8) * overtimeHours * 1.5
  mealAllowance: number; // Phụ cấp ăn trưa / ăn ca công trường (vd: 780.000 hoặc 30.000/ngày)
  travelSafetyAllowance: number; // Phụ cấp đi lại / Xăng xe / An toàn lao động / Độc hại
  otherBonus: number; // Thưởng chuyên cần / Thưởng vượt tiến độ công trình
  totalIncome: number; // Tổng thu nhập = Lương ngày + OT + Ăn ca + Phụ cấp + Thưởng

  // Khấu trừ & Thuế TNCN thời vụ (Thông tư 111/2013/TT-BTC)
  hasTaxCommitment: boolean; // Có Cam kết Mẫu 08/CK-TNCN không (Nếu có: miễn khấu trừ 10%, nếu không: trừ 10% khi thu nhập >= 2.000.000đ)
  personalIncomeTax: number; // Tiền thuế TNCN khấu trừ = 10% x Tổng thu nhập (nếu không có CK 08)
  advancePayment: number; // Tạm ứng tiền mặt tại công trường
  totalDeductions: number; // Tổng khấu trừ = Thuế TNCN + Tạm ứng
  netSalary: number; // Thực lĩnh = Tổng thu nhập - Tổng khấu trừ

  status: 'ACTIVE' | 'COMPLETED' | 'PAUSED'; // 'ACTIVE' = Đang thi công, 'COMPLETED' = Đã thanh lý đợt khoán, 'PAUSED' = Tạm ngưng
  notes?: string; // Ghi chú hợp đồng hoặc công việc
  payrollCycleType?: '1_WEEK' | '2_WEEKS'; // Option chu kỳ lương: 1 tuần hoặc 2 tuần
  currentPeriodKey?: string; // Khóa chu kỳ (vd: "2026-09_W1", "2026-09_BI1")
  currentWeekLabel?: string; // Nhãn chu kỳ (vd: "Tuần 2 (08/09 - 14/09)", "Đợt 1 (01/09 - 15/09)")
  currentWeekId?: string; // 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'BI1' | 'BI2'
  attendanceMonth?: number; // Tháng chấm công (1 - 12)
  attendanceYear?: number; // Năm chấm công (vd: 2026)
  weeklyTimesheet?: WeeklyDayAttendance[]; // Bảng chấm công các ngày trong chu kỳ
  // Bản ghi chấm công lưu độc lập theo từng chu kỳ (Tuần 1, Tuần 2, Đợt 1, Đợt 2...)
  periodRecords?: { [periodKey: string]: SeasonalPeriodRecord };
}

export type SeasonalCycleType = '1_WEEK' | '2_WEEKS';

export interface PayrollPeriodOption {
  id: string; // 'W1' | 'W2' | 'W3' | 'W4' | 'W5' | 'W6' | 'BI1' | 'BI2'
  periodKey: string; // vd: "2026-09_W1", "2026-09_BI1"
  cycleType: SeasonalCycleType;
  label: string; // vd: "Tuần 1 (31/08 - 06/09)", "Đợt 1 (01/09 - 15/09)"
  shortLabel: string; // vd: "Tuần 1", "Đợt 1"
  startDay: number;
  endDay: number;
  dates: string[];
  maxStandardDays: number;
  year?: number;
  month?: number;
}

export interface SeasonalPeriodRecord {
  periodKey: string; // vd: "2026-09_W1", "2026-09_BI1"
  periodLabel: string; // vd: "Tuần 1 (01/09 - 07/09)"
  cycleType: SeasonalCycleType;
  isRecorded: boolean; // true nếu đã được chấm và lưu số công
  actualWorkDays: number;
  salaryByDays: number;
  overtimeHours: number;
  overtimePay: number;
  mealAllowance: number;
  travelSafetyAllowance: number;
  otherBonus: number;
  totalIncome: number;
  hasTaxCommitment: boolean;
  personalIncomeTax: number;
  advancePayment: number;
  totalDeductions: number;
  netSalary: number;
  weeklyTimesheet?: WeeklyDayAttendance[];
  notes?: string;
}

export interface WeeklyDayAttendance {
  dayOfWeek: string; // 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'CN'
  dayName: string; // 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'
  dateLabel?: string; // vd: "15/09", "16/09"...
  workUnits: number; // 1 (đủ ngày), 0.5 (nửa ngày), 0 (nghỉ)
  otHours: number; // số giờ làm thêm OT trong ngày (0, 1, 2, 3, 4...)
  shiftType?: 'DAY' | 'NIGHT'; // Ca ngày hoặc ca đêm
  note?: string; // Nội dung công việc (vd: Hàn ống áp lực, Kéo cáp...)
}

export interface ContractAddendum {
  id: string; // Mã định danh phụ lục
  year: number; // Năm điều chỉnh lương (vd: 2026)
  effectiveDate: string; // Ngày bắt đầu áp dụng (dd/mm/yyyy)
  addendumNumber: string; // Số Phụ lục HĐLĐ (vd: PL01/2026/HĐLĐ-PNC0001)
  oldBaseSalary: number; // Lương cơ bản cũ
  newBaseSalary: number; // Lương cơ bản mới sau tăng
  increaseAmount: number; // Số tiền tăng thêm (VNĐ)
  increasePercent: number; // Tỷ lệ tăng (%)
  fileUrl?: string; // Đường dẫn file Phụ lục HĐLĐ hoặc HĐ mới
  fileName?: string; // Tên file phụ lục đính kèm
  reason: string; // Lý do tăng lương (Tăng lương định kỳ hàng năm, Nâng bậc tay nghề, Thăng chức...)
  notifiedAt?: string; // Thời gian đã gửi email thông báo cho nhân viên
  notifiedEmail?: string; // Email người nhận
}

export interface AttendanceRecord {
  employeeCode: string;
  days: { [day: number]: string }; // 'X' (cả ngày), '1/2' (nửa ngày), 'P' (phép), 'O' (ốm), 'K' (không lương), 'L' (nghỉ lễ)
  otHours: { [day: number]: number };
}

export interface DepartmentSummary {
  name: string;
  employeeCount: number;
  totalIncome: number;
  totalInsurance: number;
  totalTax: number;
  totalNet: number;
  averageNet: number;
}

export interface ZaloOAConfig {
  enabled: boolean;
  oaId: string; // ID Zalo OA Phúc Nguyên (vd: 123456789012345678)
  oaName: string; // Tên hiển thị OA (vd: Công ty TNHH TV TK XD Phúc Nguyên)
  appId: string; // App ID trên developers.zalo.me
  secretKey: string; // Secret Key
  accessToken: string; // Access Token được cấp bởi Zalo OA
  refreshToken?: string;
  templateId?: string; // Mã Template ZNS (Mẫu thông báo lương đã duyệt trên ZCA)
  sendMode: 'ZNS' | 'OA_MESSAGE'; // ZNS (gửi trực tiếp SĐT, khuyên dùng) hoặc OA_MESSAGE (gửi người đã theo dõi OA)
  isSandbox?: boolean; // Chế độ chạy thử nghiệm / mô phỏng
}

export interface CompanyConfig {
  name: string;
  address: string;
  taxCode: string;
  phone: string;
  period: string; // Kỳ lương (vd: "Kỳ lương tháng 06 năm 2026")
  periodCode: string; // 06/2026
  month: number; // 6
  year: number; // 2026
  paymentDate: string; // Ngày chi trả (vd: "05/07/2026")
  standardWorkDays: number; // 26
  formNumber: string; // Mẫu số 02-LĐTL
  zaloOA?: ZaloOAConfig;
}
