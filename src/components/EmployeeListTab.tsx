import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  UserPlus,
  Search,
  Filter,
  CheckSquare,
  Square,
  Edit2,
  Trash2,
  Users,
  Building2,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  ShieldCheck,
  Mail,
  Phone,
  FileText,
  Clock,
  TrendingUp,
  Sparkles,
  HardHat,
  RotateCcw,
  Sliders,
  Printer,
  Calendar,
  Layers,
  Eraser,
  Save,
  X,
  CreditCard,
  Briefcase,
  DollarSign,
  Plus,
  Minus,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, CompanyConfig, ContractAddendum } from '../types';
import { EmployeeModal } from './EmployeeModal';
import { AnnualSalaryReviewModal } from './AnnualSalaryReviewModal';
import { MonthYearPicker } from './MonthYearPicker';
import { formatNumberOnly, formatVND } from '../utils/numberToVietnameseWords';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import { getContractStatusInfo } from '../utils/contractHelper';

interface EmployeeListTabProps {
  employees: Employee[];
  config: CompanyConfig;
  onChangeMonthYear?: (month: number, year: number) => void;
  onUpdateEmployee: (updated: Employee) => void;
  onAddEmployee: (newEmp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onBatchUpdate: (updatedList: Employee[]) => void;
  onGoToAttendance: () => void;
  onGoToSeasonalWorkers?: () => void;
  onResetDefault?: () => void;
}

export const EmployeeListTab: React.FC<EmployeeListTabProps> = ({
  employees,
  config,
  onChangeMonthYear,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
  onBatchUpdate,
  onGoToAttendance,
  onGoToSeasonalWorkers,
  onResetDefault,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RESIGNED' | 'LEAVE'>('ALL');
  const [attendanceFilter, setAttendanceFilter] = useState<'ALL' | 'SELECTED' | 'UNSELECTED'>('ALL');
  const [contractFilter, setContractFilter] = useState<'ALL' | 'UNLIMITED' | 'FIXED' | 'EXPIRING' | 'PROBATION'>('ALL');

  // Chế độ xem: 'ATTENDANCE' (Chấm công & Lương - tương tự Nhân lực thời vụ) hoặc 'CONTRACT' (Hồ sơ & Hợp đồng)
  const [viewMode, setViewMode] = useState<'ATTENDANCE' | 'CONTRACT'>('ATTENDANCE');
  const [isQuickEditMode, setIsQuickEditMode] = useState(true);

  // Bộ đệm gõ phím trực tiếp trên từng ô để không bị cưỡng chế về 0 khi xóa hoặc gõ dấu chấm thập phân
  const [rowDaysBuffer, setRowDaysBuffer] = useState<Record<string, string>>({});
  const [rowOtBuffer, setRowOtBuffer] = useState<Record<string, string>>({});
  const [rowPaidLeaveBuffer, setRowPaidLeaveBuffer] = useState<Record<string, string>>({});
  const [rowUnpaidLeaveBuffer, setRowUnpaidLeaveBuffer] = useState<Record<string, string>>({});

  const [lastSavedCode, setLastSavedCode] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Annual Salary Review Modal State
  const [isSalaryReviewOpen, setIsSalaryReviewOpen] = useState(false);
  const [salaryReviewEmployee, setSalaryReviewEmployee] = useState<Employee | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Departments
  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return Array.from(set);
  }, [employees]);

  // Statistics
  const totalCount = employees.length;
  const activeCount = employees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length;
  const resignedCount = employees.filter((e) => e.status === 'RESIGNED').length;
  const selectedAttendanceCount = employees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED').length;

  // Thống kê chấm công & tiền lương tháng hiện tại
  const attendanceEmployees = useMemo(() => {
    return employees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED');
  }, [employees]);

  const totalWorkDays = useMemo(() => {
    return attendanceEmployees.reduce((sum, e) => sum + (e.actualWorkDays || 0), 0);
  }, [attendanceEmployees]);

  const totalOtHours = useMemo(() => {
    return attendanceEmployees.reduce((sum, e) => sum + (e.overtimeHours || 0), 0);
  }, [attendanceEmployees]);

  const totalNetSalary = useMemo(() => {
    return attendanceEmployees.reduce((sum, e) => sum + (e.netSalary || 0), 0);
  }, [attendanceEmployees]);

  // Thống kê Hợp đồng lao động & Thời hạn
  const contractStats = useMemo(() => {
    let unlimited = 0;
    let fixed = 0;
    let probationOrOther = 0;
    let expiringSoon = 0;
    let expired = 0;

    employees.forEach((emp) => {
      const info = getContractStatusInfo(emp);
      if (info.status === 'UNLIMITED') {
        unlimited++;
      } else if (info.status === 'EXPIRED') {
        expired++;
      } else if (info.status === 'EXPIRING_SOON') {
        expiringSoon++;
      } else {
        fixed++;
      }

      if (
        emp.contractType?.includes('Thử việc') ||
        emp.contractType?.includes('khoán') ||
        emp.contractType?.includes('thời vụ')
      ) {
        probationOrOther++;
      }
    });

    return { unlimited, fixed, probationOrOther, expiringSoon, expired };
  }, [employees]);

  // Filtered List
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.contractType && emp.contractType.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.contractDuration && emp.contractDuration.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.contractNumber && emp.contractNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.email && emp.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (emp.phone && emp.phone.includes(searchTerm));

      const matchDept = selectedDept === 'ALL' || emp.department === selectedDept;

      const currentStatus = emp.status || 'ACTIVE';
      const matchStatus = statusFilter === 'ALL' || currentStatus === statusFilter;

      const isSelected = emp.selectedForAttendance !== false;
      const matchAttendance =
        attendanceFilter === 'ALL' ||
        (attendanceFilter === 'SELECTED' && isSelected) ||
        (attendanceFilter === 'UNSELECTED' && !isSelected);

      const contractInfo = getContractStatusInfo(emp);
      let matchContract = true;
      if (contractFilter === 'UNLIMITED') {
        matchContract = contractInfo.status === 'UNLIMITED';
      } else if (contractFilter === 'FIXED') {
        matchContract =
          contractInfo.status === 'VALID' &&
          !emp.contractType?.includes('Thử việc') &&
          !emp.contractType?.includes('khoán');
      } else if (contractFilter === 'EXPIRING') {
        matchContract = contractInfo.status === 'EXPIRING_SOON' || contractInfo.status === 'EXPIRED';
      } else if (contractFilter === 'PROBATION') {
        matchContract =
          (emp.contractType?.includes('Thử việc') ||
            emp.contractType?.includes('khoán') ||
            emp.contractType?.includes('thời vụ')) ??
          false;
      }

      return matchSearch && matchDept && matchStatus && matchAttendance && matchContract;
    }).sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [employees, searchTerm, selectedDept, statusFilter, attendanceFilter, contractFilter]);

  // Cập nhật số ngày công thực tế của nhân viên
  const handleWorkDaysChange = (emp: Employee, newDays: number) => {
    const validDays = Math.max(0, Math.min(31, Number(newDays) || 0));
    const recomputed = recomputeEmployeePayroll({
      ...emp,
      actualWorkDays: validDays,
    });
    onUpdateEmployee(recomputed);
    setLastSavedCode(emp.code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Tăng giảm nhanh số ngày công (+/- 0.5 công)
  const handleStepWorkDays = (emp: Employee, delta: number) => {
    const current = emp.actualWorkDays || 0;
    const nextVal = Math.max(0, Math.min(31, Number((current + delta).toFixed(1))));
    setRowDaysBuffer((prev) => {
      const next = { ...prev };
      delete next[emp.id];
      return next;
    });
    handleWorkDaysChange(emp, nextVal);
  };

  // Cập nhật giờ tăng ca OT
  const handleOtChange = (emp: Employee, hours: number) => {
    const validOT = Math.max(0, Math.min(200, Number(hours) || 0));
    const recomputed = recomputeEmployeePayroll({
      ...emp,
      overtimeHours: validOT,
    });
    onUpdateEmployee(recomputed);
    setLastSavedCode(emp.code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Tăng giảm nhanh giờ tăng ca (+/- 1h)
  const handleStepOT = (emp: Employee, delta: number) => {
    const current = emp.overtimeHours || 0;
    const nextVal = Math.max(0, Math.min(200, current + delta));
    setRowOtBuffer((prev) => {
      const next = { ...prev };
      delete next[emp.id];
      return next;
    });
    handleOtChange(emp, nextVal);
  };

  // Cập nhật ngày nghỉ phép có lương
  const handlePaidLeaveChange = (emp: Employee, days: number) => {
    const validDays = Math.max(0, Math.min(31, Number(days) || 0));
    const recomputed = recomputeEmployeePayroll({
      ...emp,
      paidLeaveDays: validDays,
    });
    onUpdateEmployee(recomputed);
  };

  // Cập nhật ngày nghỉ không lương
  const handleUnpaidLeaveChange = (emp: Employee, days: number) => {
    const validDays = Math.max(0, Math.min(31, Number(days) || 0));
    const recomputed = recomputeEmployeePayroll({
      ...emp,
      unpaidLeaveDays: validDays,
    });
    onUpdateEmployee(recomputed);
  };

  // Bật / tắt đưa vào chấm công
  const handleToggleAttendance = (emp: Employee) => {
    const updated: Employee = {
      ...emp,
      selectedForAttendance: emp.selectedForAttendance === false ? true : false,
    };
    onUpdateEmployee(updated);
    showToast(
      updated.selectedForAttendance
        ? `Đã chọn chấm công cho ${emp.fullName}`
        : `Đã bỏ chọn chấm công cho ${emp.fullName}`
    );
  };

  // Chọn tất cả hoặc bỏ chọn tất cả
  const handleSelectAllAttendance = (select: boolean) => {
    const targetIds = new Set(filteredEmployees.map((e) => e.id));
    const updatedList = employees.map((e) => {
      if (targetIds.has(e.id)) {
        return { ...e, selectedForAttendance: select };
      }
      return e;
    });
    onBatchUpdate(updatedList);
    showToast(select ? 'Đã chọn chấm công cho toàn bộ nhân sự đang lọc' : 'Đã bỏ chọn chấm công cho toàn bộ');
  };

  // Tiện ích chấm đủ công chuẩn (26 ngày) cho tất cả nhân sự đang chọn
  const handleBatchFillFullDays = () => {
    const std = config.standardWorkDays || 26;
    const targetIds = new Set(filteredEmployees.map((e) => e.id));
    const updatedList = employees.map((e) => {
      if (targetIds.has(e.id) && e.selectedForAttendance !== false && e.status !== 'RESIGNED') {
        return recomputeEmployeePayroll({
          ...e,
          actualWorkDays: std,
          unpaidLeaveDays: 0,
        });
      }
      return e;
    });
    setRowDaysBuffer({});
    onBatchUpdate(updatedList);
    showToast(`Đã chấm đủ ${std} ngày công chuẩn cho toàn bộ nhân viên thường trực!`);
  };

  // Tiện ích xóa trắng ngày công để nhập mới từ đầu (0 công)
  const handleBatchClearDays = () => {
    const targetIds = new Set(filteredEmployees.map((e) => e.id));
    const updatedList = employees.map((e) => {
      if (targetIds.has(e.id) && e.selectedForAttendance !== false) {
        return recomputeEmployeePayroll({
          ...e,
          actualWorkDays: 0,
          overtimeHours: 0,
          paidLeaveDays: 0,
          unpaidLeaveDays: 0,
        });
      }
      return e;
    });
    setRowDaysBuffer({});
    setRowOtBuffer({});
    onBatchUpdate(updatedList);
    showToast('Đã đặt lại 0 công và 0 OT để nhập mới từ đầu!');
  };

  // Lưu và đồng bộ dữ liệu
  const handleSaveAllAttendance = () => {
    onBatchUpdate(employees);
    showToast('Đã lưu dữ liệu chấm công & tính toán lại bảng lương thành công!');
  };

  // Toggle status (Active <-> Resigned)
  const handleToggleStatus = (emp: Employee) => {
    const newStatus = (emp.status || 'ACTIVE') === 'ACTIVE' ? 'RESIGNED' : 'ACTIVE';
    const updated: Employee = {
      ...emp,
      status: newStatus,
      selectedForAttendance: newStatus === 'ACTIVE',
    };
    onUpdateEmployee(updated);
    showToast(newStatus === 'ACTIVE' ? `Đã mở lại trạng thái làm việc cho ${emp.fullName}` : `Đã chuyển ${emp.fullName} sang Đã nghỉ việc`);
  };

  // Xuất file Excel bảng lương & chấm công chi tiết
  const handleExportExcel = () => {
    const mStr = (config.month || 9) < 10 ? `0${config.month || 9}` : `${config.month || 9}`;
    const dataToExport = filteredEmployees.map((e, index) => ({
      STT: index + 1,
      'Mã NV': e.code,
      'Họ và tên': e.fullName,
      'Chức danh': e.title,
      'Bộ phận': e.department,
      'Hình thức lương': e.salaryType === 'DAILY' ? 'Theo ngày' : 'Theo tháng',
      'Hợp đồng lao động': e.contractType || 'HĐLĐ Không xác định thời hạn',
      'Số HĐLĐ': e.contractNumber || '',
      'Thời hạn': e.contractDuration || 'Vô thời hạn',
      'Chấm công': e.selectedForAttendance !== false ? 'Có' : 'Không',
      'Công chuẩn (ngày)': e.standardWorkDays || config.standardWorkDays || 26,
      'Công thực tế (ngày)': e.actualWorkDays || 0,
      'Lương cơ bản (đ)': e.baseSalary,
      'Lương theo công (đ)': e.salaryByActualDays || 0,
      'Giờ OT (h)': e.overtimeHours || 0,
      'Tiền OT (đ)': e.overtimePay || 0,
      'PC Trách nhiệm (đ)': e.responsibilityAllowance || 0,
      'PC Dự án (đ)': e.projectAllowance || 0,
      'Ăn ca (đ)': e.mealAllowance || 0,
      'Xăng xe / ĐT (đ)': e.phoneTravelAllowance || 0,
      'Tổng thu nhập (đ)': e.totalIncome || 0,
      'Đóng BHXH 10.5% (đ)': e.totalInsurance || Math.round((e.insuranceSalary || 0) * 0.105),
      'Giảm trừ NPT': e.dependents || 0,
      'Thuế TNCN (đ)': e.taxPersonalIncome || 0,
      'Tạm ứng (đ)': e.advancePayment || 0,
      'THỰC LĨNH (đ)': e.netSalary || 0,
      'Số tài khoản': e.bankAccount || '',
      'Ngân hàng': e.bankName || '',
      'Trạng thái': (e.status || 'ACTIVE') === 'ACTIVE' ? 'Đang làm việc' : 'Nghỉ việc',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BangLuongThuongTruc');
    XLSX.writeFile(wb, `Bang_Luong_Cham_Cong_Thuong_Truc_Thang_${mStr}_${config.year || 2026}.xlsx`);
    showToast('Đã xuất file Excel bảng lương & chấm công thành công!');
  };

  // In bảng danh sách thanh toán lương nhân viên thường trực
  const handlePrintPayrollSheet = () => {
    const mStr = (config.month || 9) < 10 ? `0${config.month || 9}` : `${config.month || 9}`;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Trình duyệt đang chặn cửa sổ pop-up. Vui lòng cho phép pop-up để in bảng lương!');
      return;
    }

    const rowsHtml = filteredEmployees
      .filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED')
      .map(
        (e, idx) => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 6px; text-align: center;">${idx + 1}</td>
          <td style="padding: 6px; font-weight: bold; text-align: center;">${e.code}</td>
          <td style="padding: 6px; font-weight: bold;">${e.fullName}</td>
          <td style="padding: 6px;">${e.department}</td>
          <td style="padding: 6px; text-align: right;">${formatNumberOnly(e.baseSalary)} đ</td>
          <td style="padding: 6px; text-align: center; font-weight: bold;">${e.actualWorkDays || 0}</td>
          <td style="padding: 6px; text-align: right;">${formatNumberOnly(e.salaryByActualDays || 0)} đ</td>
          <td style="padding: 6px; text-align: center;">${e.overtimeHours || 0}h</td>
          <td style="padding: 6px; text-align: right;">${formatNumberOnly(e.overtimePay || 0)} đ</td>
          <td style="padding: 6px; text-align: right;">${formatNumberOnly((e.responsibilityAllowance || 0) + (e.projectAllowance || 0))} đ</td>
          <td style="padding: 6px; text-align: right; color: #b91c1c;">-${formatNumberOnly(e.totalInsurance || 0)} đ</td>
          <td style="padding: 6px; text-align: right; font-weight: bold; color: #0f3d64;">${formatNumberOnly(e.netSalary || 0)} đ</td>
          <td style="padding: 6px; font-family: monospace; font-size: 11px;">${e.bankAccount || 'Tiền mặt'} - ${e.bankName || ''}</td>
          <td style="padding: 6px; text-align: center; width: 90px;"></td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Bảng Kê Chi Trả Lương Nhân Viên Thường Trực Tháng ${mStr}/${config.year || 2026}</title>
          <style>
            body { font-family: 'Times New Roman', serif; font-size: 12px; margin: 20px; color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px; text-align: center; }
            td { border: 1px solid #cbd5e1; font-size: 11.5px; }
            .header { text-align: center; margin-bottom: 20px; }
            .signatures { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
            @media print {
              body { margin: 10mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h3 style="margin: 0; text-transform: uppercase;">${config.companyName || 'CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG PHÚC NGUYỄN'}</h3>
            <p style="margin: 3px 0; font-size: 11px;">Địa chỉ: ${config.address || 'TP. Hồ Chí Minh'}</p>
            <h2 style="margin: 15px 0 5px 0; text-transform: uppercase; color: #0f3d64;">BẢNG KÊ CHI TRẢ LƯƠNG NHÂN VIÊN THƯỜNG TRỰC</h2>
            <p style="margin: 0; font-style: italic;">Kỳ lương tháng ${mStr} năm ${config.year || 2026} (Ngày thanh toán: ${config.paymentDate || '05/' + mStr + '/' + (config.year || 2026)})</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã NV</th>
                <th>Họ và tên</th>
                <th>Bộ phận</th>
                <th>Lương cơ bản</th>
                <th>Công thực tế</th>
                <th>Lương theo công</th>
                <th>Giờ OT</th>
                <th>Tiền OT</th>
                <th>Phụ cấp</th>
                <th>Trừ BHXH</th>
                <th>THỰC LĨNH</th>
                <th>Tài khoản ATM</th>
                <th>Ký nhận</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="signatures">
            <div>
              <p><strong>NGƯỜI LẬP BIỂU</strong></p>
              <br><br><br>
              <p>Phan Thị Thanh Nga</p>
            </div>
            <div>
              <p><strong>KẾ TOÁN TRƯỞNG</strong></p>
              <br><br><br>
              <p>Nguyễn Thị Thu Hà</p>
            </div>
            <div>
              <p><strong>TỔNG GIÁM ĐỐC</strong></p>
              <br><br><br>
              <p>${config.representative || 'Phan Thanh Hải'}</p>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Export List CSV
  const handleExportCSV = () => {
    const headers = [
      'STT',
      'Mã NV',
      'Họ và tên',
      'Chức danh',
      'Bộ phận',
      'Hợp đồng lao động',
      'Số HĐLĐ',
      'Thời hạn hợp đồng',
      'Ngày hết hạn HĐ',
      'Ngày vào làm',
      'Trạng thái',
      'Chấm công kỳ này',
      'Lương cơ bản',
      'Công thực tế',
      'Lương theo công',
      'Giờ OT',
      'Tiền OT',
      'PC Trách nhiệm',
      'PC Dự án',
      'Ăn ca',
      'Xăng xe/ĐT',
      'NPT',
      'Lương đóng BH',
      'Phí đóng BHXH (10.5%)',
      'Thực lĩnh',
      'Số tài khoản',
      'Ngân hàng',
    ];

    const rows = filteredEmployees.map((e, idx) => [
      idx + 1,
      `"${e.code}"`,
      `"${e.fullName}"`,
      `"${e.title}"`,
      `"${e.department}"`,
      `"${e.contractType || 'HĐLĐ Không xác định thời hạn'}"`,
      `"${e.contractNumber || ''}"`,
      `"${e.contractDuration || 'Vô thời hạn'}"`,
      `"${e.contractEndDate || ''}"`,
      `"${e.joinDate}"`,
      `"${(e.status || 'ACTIVE') === 'ACTIVE' ? 'Đang làm việc' : e.status === 'RESIGNED' ? 'Nghỉ việc' : 'Tạm hoãn'}"`,
      `"${e.selectedForAttendance !== false ? 'Có' : 'Không'}"`,
      e.baseSalary,
      e.actualWorkDays || 0,
      e.salaryByActualDays || 0,
      e.overtimeHours || 0,
      e.overtimePay || 0,
      e.responsibilityAllowance || 0,
      e.projectAllowance || 0,
      e.mealAllowance,
      e.phoneTravelAllowance,
      e.dependents,
      e.insuranceSalary || 0,
      e.totalInsurance || Math.round((e.insuranceSalary || 0) * 0.105),
      e.netSalary || 0,
      `"${e.bankAccount}"`,
      `"${e.bankName}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Danh_sach_nhan_su_thuong_truc_${config.periodCode.replace('/', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sao lưu toàn bộ danh sách nhân viên ra file JSON
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(employees, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sao_luu_nhan_su_PhucNguyen_${config.periodCode.replace('/', '_')}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Khôi phục từ file JSON sao lưu
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          onBatchUpdate(parsed);
          showToast(`Đã khôi phục thành công toàn bộ ${parsed.length} nhân sự từ file sao lưu!`);
        } else {
          alert('File không hợp lệ: Không tìm thấy danh sách nhân sự.');
        }
      } catch (err) {
        alert('Lỗi: Không thể đọc file JSON sao lưu này!');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Áp dụng Tăng Lương Hàng Năm & Phụ Lục HĐLĐ & Cập nhật File Hợp Đồng
  const handleApplySalaryIncrease = (
    employeeId: string,
    updates: {
      newBaseSalary: number;
      addendum: ContractAddendum;
      newContractFileUrl?: string;
      newContractFileName?: string;
      updatedEmail?: string;
    }
  ) => {
    const target = employees.find((e) => e.id === employeeId);
    if (!target) return;

    const existingAddendums = target.contractAddendums || [];
    const updatedEmp: Employee = {
      ...target,
      baseSalary: updates.newBaseSalary,
      contractAddendums: [updates.addendum, ...existingAddendums],
      contractFileUrl: updates.newContractFileUrl || target.contractFileUrl,
      contractFileName: updates.newContractFileName || target.contractFileName,
      email: updates.updatedEmail || target.email,
    };

    onUpdateEmployee(updatedEmp);
    showToast(`Đã áp dụng mức lương mới và ban hành Phụ lục HĐ cho ${target.fullName}!`);
  };

  const monthFormatted = (config.month || 9) < 10 ? `0${config.month || 9}` : config.month;
  const yearFormatted = config.year || 2026;

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Toast thông báo hành động */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 text-xs font-bold flex items-center gap-2.5 animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP BANNER GIỐNG NHÂN LỰC THỜI VỤ: Thiết kế màu xanh `#0f3d64` đẳng cấp */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-[#0f3d64] via-[#154c79] to-[#0f3d64] text-white p-4 sm:p-5 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-sky-400/20 border border-sky-400/40 rounded-xl shrink-0">
            <Users className="w-7 h-7 text-sky-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
                1. DANH SÁCH NHÂN VIÊN THƯỜNG TRỰC CHÍNH THỨC
              </h2>
              <span className="px-2.5 py-0.5 bg-sky-400 text-slate-950 font-black rounded text-[10px] uppercase tracking-wider shadow-xs">
                Lương tháng &bull; HĐLĐ &bull; Chấm công trực tiếp
              </span>
            </div>
            <p className="text-xs text-sky-100 mt-1 max-w-3xl leading-relaxed">
              Quản lý hồ sơ nhân sự thường trực, chấm công thực tế, giờ OT, phụ cấp, BHXH 10.5% và lương thực lĩnh.
              Hỗ trợ nhập ngày công trực tiếp, gõ số thập phân 25.5 công mượt mà và tự động tính lương.
            </p>
          </div>
        </div>

        {/* Thanh tác vụ chính */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút Thêm nhân viên */}
          <button
            id="btn-add-permanent-employee"
            type="button"
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            <span>+ Thêm nhân viên mới</span>
          </button>

          {/* Toggle chế độ sửa nhanh trên bảng */}
          <button
            type="button"
            onClick={() => setIsQuickEditMode(!isQuickEditMode)}
            className={`px-3 py-2 text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer border ${
              isQuickEditMode
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
            }`}
            title="Bật/tắt chế độ sửa nhanh ngày công, OT trực tiếp trên bảng"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isQuickEditMode ? 'Đang sửa nhanh' : 'Sửa nhanh trên bảng'}</span>
          </button>

          {/* Xuất file Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            title="Xuất file Excel đầy đủ bảng kê chi trả lương & ngày công"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>

          {/* In bảng ký nhận */}
          <button
            type="button"
            onClick={handlePrintPayrollSheet}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer border border-white/20"
            title="In bảng danh sách ký nhận tiền lương tháng của nhân viên"
          >
            <Printer className="w-4 h-4" />
            <span>In bảng ký nhận</span>
          </button>

          {/* Nút Quy trình Tăng lương hàng năm */}
          <button
            id="btn-annual-salary-review"
            type="button"
            onClick={() => {
              const firstTarget = filteredEmployees.find((e) => e.status !== 'RESIGNED') || employees[0];
              if (firstTarget) {
                setSalaryReviewEmployee(firstTarget);
                setIsSalaryReviewOpen(true);
              }
            }}
            className="px-3 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap"
            title="Thực hiện quy trình tăng lương hàng năm, ban hành Phụ lục HĐLĐ và gửi Email cho nhân viên"
          >
            <TrendingUp className="w-4 h-4 text-amber-200" />
            <span>Tăng lương & Phụ lục HĐ</span>
          </button>

          {/* Nút Chuyển nhanh sang Nhân lực thời vụ */}
          {onGoToSeasonalWorkers && (
            <button
              id="btn-goto-seasonal-workers"
              type="button"
              onClick={onGoToSeasonalWorkers}
              className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap"
              title="Chuyển sang Tab 2. Quản lý Công nhân kỹ thuật & Nhân lực thời vụ công trình"
            >
              <HardHat className="w-4 h-4 text-amber-300" />
              <span>Chuyển sang 2. Nhân Lực Thời Vụ →</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THẺ CHỈ SỐ THỐNG KÊ TỔNG QUAN (4 METRIC CARDS) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng số nhân sự thường trực</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{totalCount} người</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              🟢 {activeCount} đang làm việc &bull; 🔴 {resignedCount} đã nghỉ
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0f3d64] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Nhân sự chấm công tháng</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {selectedAttendanceCount} / {totalCount} người
            </div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
              ✓ Đưa vào bảng tính lương tháng {monthFormatted}/{yearFormatted}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng ngày công & Giờ OT</div>
            <div className="text-xl font-black text-sky-950 mt-0.5">
              {totalWorkDays} công &bull; {totalOtHours}h OT
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Công chuẩn: {config.standardWorkDays || 26} ngày/tháng
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng lương thực lĩnh tháng</div>
            <div className="text-xl font-black text-[#0f3d64] mt-0.5">
              {formatVND(totalNetSalary)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Chi trả kỳ tháng {monthFormatted}/{yearFormatted}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. THANH ĐIỀU HÀNH KỲ LƯƠNG, CHỌN CHẾ ĐỘ XEM & TIỆN ÍCH CHẤM CÔNG */}
      {/* ========================================================================= */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Bộ chọn tháng/năm đồng bộ */}
            {onChangeMonthYear ? (
              <MonthYearPicker
                month={config.month || 9}
                year={config.year || 2026}
                onChange={onChangeMonthYear}
                label="Kỳ chấm công:"
              />
            ) : (
              <div className="flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded border border-slate-300">
                <Calendar className="w-4 h-4 text-sky-700" />
                <span>Tháng {monthFormatted}/{yearFormatted}</span>
              </div>
            )}

            {/* Toggle 2 chế độ hiển thị: 'Chấm công & Lương' vs 'Hồ sơ & Hợp đồng' */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-2 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-sky-700" />
                <span>Chế độ xem:</span>
              </span>
              <button
                type="button"
                onClick={() => setViewMode('ATTENDANCE')}
                className={`px-3 py-1 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'ATTENDANCE'
                    ? 'bg-[#0f3d64] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="Xem và chấm công trực tiếp số ngày công, giờ OT, phụ cấp, lương theo công, BHXH và thực lĩnh"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>Chấm công & Tiền lương</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('CONTRACT')}
                className={`px-3 py-1 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'CONTRACT'
                    ? 'bg-[#0f3d64] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
                title="Xem chi tiết hồ sơ hợp đồng lao động, thời hạn HĐ, số tài khoản ATM, thông tin liên lạc"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Hồ sơ & Hợp đồng lao động</span>
              </button>
            </div>
          </div>

          {/* Các nút tiện ích thao tác chấm công nhanh */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBatchClearDays}
              className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Đặt lại 0 công và 0 OT để nhập mới từ đầu cho kỳ này"
            >
              <Eraser className="w-3.5 h-3.5 text-amber-700" />
              <span>Để trống nhập mới (0 công)</span>
            </button>

            <button
              type="button"
              onClick={handleBatchFillFullDays}
              className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
              title="Chấm đủ 26 ngày công chuẩn cho tất cả nhân viên thường trực"
            >
              <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chấm đủ công tất cả ({config.standardWorkDays || 26} công)</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAllAttendance}
              className="px-3.5 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Lưu lại toàn bộ dữ liệu chấm công và cập nhật bảng lương"
            >
              <Save className="w-3.5 h-3.5 text-amber-300" />
              <span>Lưu & Đồng bộ bảng lương</span>
            </button>
          </div>
        </div>

        {/* Thanh tìm kiếm & bộ lọc */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Ô Tìm kiếm */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm họ tên, mã NV, chức danh, số HĐ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded-lg focus:outline-sky-600 bg-slate-50 focus:bg-white text-xs"
              />
            </div>

            {/* Lọc Bộ phận */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-sky-600 text-xs"
            >
              <option value="ALL">Tất cả phòng ban ({departments.length})</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Lọc Trạng thái nhân sự */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-sky-600 font-medium text-xs"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">🟢 Đang làm việc ({activeCount})</option>
              <option value="RESIGNED">🔴 Đã nghỉ việc ({resignedCount})</option>
            </select>

            {/* Lọc tình trạng chấm công */}
            <select
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-sky-600 text-xs"
            >
              <option value="ALL">Tất cả chế độ chấm công</option>
              <option value="SELECTED">✓ Đã chọn chấm công ({selectedAttendanceCount})</option>
              <option value="UNSELECTED">✗ Không chọn chấm công ({totalCount - selectedAttendanceCount})</option>
            </select>

            {/* Lọc Hợp đồng lao động */}
            {viewMode === 'CONTRACT' && (
              <select
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value as any)}
                className="px-2.5 py-1.5 border border-sky-300 rounded-lg bg-sky-50/40 focus:outline-sky-600 font-medium text-slate-800 text-xs"
              >
                <option value="ALL">Tất cả Hợp đồng ({totalCount})</option>
                <option value="UNLIMITED">HĐLĐ Vô thời hạn ({contractStats.unlimited})</option>
                <option value="FIXED">HĐLĐ Có thời hạn ({contractStats.fixed})</option>
                <option value="PROBATION">Thử việc / Khoán việc ({contractStats.probationOrOther})</option>
                {(contractStats.expiringSoon > 0 || contractStats.expired > 0) && (
                  <option value="EXPIRING">⚠️ Cần lưu ý hạn HĐ ({contractStats.expiringSoon + contractStats.expired})</option>
                )}
              </select>
            )}
          </div>

          {/* Nút chọn nhanh tất cả chấm công & backup */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAllAttendance(true)}
              className="px-2.5 py-1.5 border border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition text-xs"
              title="Tích chọn tất cả nhân viên đang hiển thị vào chấm công"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Chọn tất cả chấm công</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectAllAttendance(false)}
              className="px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition text-xs"
              title="Bỏ chọn tất cả nhân viên đang hiển thị"
            >
              <Square className="w-3.5 h-3.5 text-slate-400" />
              <span>Bỏ chọn tất cả</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition text-xs"
              title="Xuất danh sách nhân sự ra file CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Xuất CSV</span>
            </button>

            {/* Sao lưu dữ liệu an toàn ra file JSON */}
            <button
              id="btn-export-json-backup"
              type="button"
              onClick={handleExportJSON}
              className="px-2.5 py-1.5 border border-sky-300 text-sky-800 bg-sky-50/60 hover:bg-sky-100 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition text-xs"
              title="Tải file sao lưu toàn bộ thông tin nhân sự (.json) về máy tính để lưu trữ dự phòng"
            >
              <Download className="w-3.5 h-3.5 text-sky-700" />
              <span>Sao lưu (JSON)</span>
            </button>

            {/* Khôi phục từ file sao lưu */}
            <button
              id="btn-import-json-backup"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition text-xs"
              title="Khôi phục danh sách nhân sự từ file sao lưu .json"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Khôi phục file</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BẢNG DANH SÁCH NHÂN SỰ THƯỜNG TRỰC: HỖ TRỢ CHẤM CÔNG DỄ DÀNG NHƯ THỜI VỤ */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[660px]">
          <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-[#0f3d64] text-white z-20 select-none text-[11px]">
              <tr>
                <th className="p-2.5 border-r border-sky-800 text-center w-12 font-bold">STT</th>
                <th
                  className="p-2.5 border-r border-sky-800 text-center w-20 font-bold bg-[#144d7d]"
                  title="Tích chọn để tính vào bảng lương"
                >
                  <div className="flex items-center justify-center gap-1">
                    <CalendarCheck className="w-3.5 h-3.5 text-amber-300" />
                    <span>Chấm công</span>
                  </div>
                </th>
                <th className="p-2.5 border-r border-sky-800 w-20 font-bold text-center">Mã NV</th>
                <th className="p-2.5 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30 min-w-[170px] font-bold">
                  Họ và tên
                </th>
                <th className="p-2.5 border-r border-sky-800 min-w-[130px]">Bộ phận & Chức danh</th>
                <th className="p-2.5 border-r border-sky-800 text-center min-w-[125px]">
                  <div>Hình thức lương</div>
                  <div className="text-[9px] text-amber-200 font-normal">Tháng / Ngày</div>
                </th>

                {/* CÁC CỘT TRONG CHẾ ĐỘ 'CHẤM CÔNG & LƯƠNG' (GIỐNG THỜI VỤ) */}
                {viewMode === 'ATTENDANCE' ? (
                  <>
                    <th className="p-2.5 border-r border-sky-800 text-center w-20">Công chuẩn</th>
                    <th className="p-2.5 border-r border-sky-800 text-center min-w-[185px] bg-[#144d7d]">
                      <div className="font-bold text-amber-200">Công thực tế *</div>
                      <div className="text-[9px] text-sky-200 font-normal">Nhập số hoặc bấm +/-</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-center min-w-[145px]">
                      <div>Giờ OT (h)</div>
                      <div className="text-[9px] text-amber-200 font-normal">Hệ số 150%</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-right w-28 bg-[#144d7d]">
                      <div>Tiền tăng ca</div>
                      <div className="text-[9px] text-amber-200 font-normal">Lương giờ × 1.5</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-center w-24">Nghỉ phép</th>
                    <th className="p-2.5 border-r border-sky-800 text-center w-24">Nghỉ KL</th>
                    <th className="p-2.5 border-r border-sky-800 text-right min-w-[130px]">
                      <div>Lương theo công</div>
                      <div className="text-[9px] text-amber-200 font-normal">Đơn giá × công</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-right min-w-[120px]">
                      <div>Phụ cấp</div>
                      <div className="text-[9px] text-amber-200 font-normal">Trách nhiệm + Dự án</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-right min-w-[125px]">
                      <div>BHXH (10.5%)</div>
                      <div className="text-[9px] text-amber-200 font-normal">Khấu trừ NLĐ</div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 text-right min-w-[140px] bg-[#144d7d] font-bold">
                      <div>THỰC LĨNH</div>
                      <div className="text-[9px] text-amber-200 font-normal">Chi trả thực nhận</div>
                    </th>
                  </>
                ) : (
                  /* CÁC CỘT TRONG CHẾ ĐỘ 'HỒ SƠ & HỢP ĐỒNG' */
                  <>
                    <th className="p-2.5 border-r border-sky-800 min-w-[165px] font-bold bg-[#144d7d]">
                      <div className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-amber-300" />
                        <span>Hợp đồng lao động</span>
                      </div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 min-w-[145px] font-bold bg-[#144d7d]">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-300" />
                        <span>Thời hạn hợp đồng</span>
                      </div>
                    </th>
                    <th className="p-2.5 border-r border-sky-800 min-w-[180px] font-bold">Email & SĐT</th>
                    <th className="p-2.5 border-r border-sky-800 text-center w-24 font-bold">Trạng thái</th>
                    <th className="p-2.5 border-r border-sky-800 text-right w-28 font-bold">Lương cơ bản</th>
                    <th className="p-2.5 border-r border-sky-800 text-right w-28 font-bold">PC Trách nhiệm</th>
                    <th className="p-2.5 border-r border-sky-800 text-right w-28 font-bold">PC Dự án</th>
                    <th className="p-2.5 border-r border-sky-800 text-center w-14 font-bold">NPT</th>
                    <th className="p-2.5 border-r border-sky-800 text-right w-32 font-bold">BHXH (10.5%)</th>
                    <th className="p-2.5 border-r border-sky-800 min-w-[170px] font-bold">Tài khoản ATM</th>
                  </>
                )}

                <th className="p-2.5 text-center min-w-[120px] font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={18} className="p-8 text-center text-slate-500 italic">
                    Không tìm thấy nhân viên nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const isSelectedForAttendance = emp.selectedForAttendance !== false;
                  const isResigned = emp.status === 'RESIGNED';
                  const contractInfo = getContractStatusInfo(emp);
                  const isRecentlySaved = lastSavedCode === emp.code;
                  const stdDays = emp.standardWorkDays || config.standardWorkDays || 26;

                  // Lấy chuỗi nhập liệu tạm thời (để việc gõ phím không bị gián đoạn)
                  const rawDays =
                    rowDaysBuffer[emp.id] !== undefined
                      ? rowDaysBuffer[emp.id]
                      : emp.actualWorkDays !== undefined
                      ? String(emp.actualWorkDays)
                      : '';

                  const rawOt =
                    rowOtBuffer[emp.id] !== undefined
                      ? rowOtBuffer[emp.id]
                      : emp.overtimeHours !== undefined
                      ? String(emp.overtimeHours)
                      : '';

                  const rawPaid =
                    rowPaidLeaveBuffer[emp.id] !== undefined
                      ? rowPaidLeaveBuffer[emp.id]
                      : emp.paidLeaveDays !== undefined
                      ? String(emp.paidLeaveDays)
                      : '';

                  const rawUnpaid =
                    rowUnpaidLeaveBuffer[emp.id] !== undefined
                      ? rowUnpaidLeaveBuffer[emp.id]
                      : emp.unpaidLeaveDays !== undefined
                      ? String(emp.unpaidLeaveDays)
                      : '';

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-sky-50/50 transition-colors ${
                        !isSelectedForAttendance
                          ? 'bg-slate-100/70 text-slate-400 opacity-70'
                          : isResigned
                          ? 'bg-rose-50/40'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50/40'
                      }`}
                    >
                      {/* STT */}
                      <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>

                      {/* Checkbox chọn chấm công */}
                      <td
                        className={`p-2 border-r border-slate-200 text-center cursor-pointer transition-colors ${
                          isSelectedForAttendance ? 'bg-emerald-50/70' : 'bg-slate-100'
                        }`}
                        onClick={() => handleToggleAttendance(emp)}
                        title={isSelectedForAttendance ? 'Đang chọn chấm công. Bấm để bỏ chọn.' : 'Đã bỏ chọn. Bấm để chọn chấm công.'}
                      >
                        <div className="flex items-center justify-center gap-1.5 select-none">
                          <input
                            type="checkbox"
                            checked={isSelectedForAttendance}
                            onChange={() => {}}
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span
                            className={`text-[11px] font-semibold ${
                              isSelectedForAttendance ? 'text-emerald-800' : 'text-slate-400'
                            }`}
                          >
                            {isSelectedForAttendance ? 'Chấm' : 'Ẩn'}
                          </span>
                        </div>
                      </td>

                      {/* Mã NV */}
                      <td className="p-2 border-r border-slate-200 font-mono font-bold text-center text-[#0f3d64]">
                        {emp.code}
                      </td>

                      {/* Họ và tên (Cố định cột trái khi scroll) */}
                      <td className="p-2 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 z-10">
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className="font-bold text-slate-900 hover:text-sky-700 cursor-pointer"
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsModalOpen(true);
                            }}
                            title="Bấm để xem/sửa chi tiết hồ sơ nhân viên"
                          >
                            {emp.fullName}
                          </div>
                          {isRecentlySaved && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded font-bold animate-in fade-in">
                              ✓ Đã lưu
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 italic">Vào làm: {emp.joinDate}</div>
                      </td>

                      {/* Bộ phận & Chức danh */}
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        <div className="font-semibold text-slate-900">{emp.department}</div>
                        <div className="text-[10px] text-slate-500">{emp.title}</div>
                      </td>

                      {/* Hình thức lương & Mức lương cơ bản */}
                      <td className="p-1.5 border-r border-slate-200 text-center">
                        {emp.salaryType === 'DAILY' ? (
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Theo ngày
                            </span>
                            <span className="text-[11px] font-mono text-amber-950 font-bold mt-0.5">
                              {new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-[#0f3d64] border border-sky-200">
                              Theo tháng
                            </span>
                            <span className="text-[11px] font-mono text-slate-700 mt-0.5">
                              {new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ
                            </span>
                          </div>
                        )}
                      </td>

                      {/* ========================================================================= */}
                      {/* DỮ LIỆU CHẾ ĐỘ 'CHẤM CÔNG & LƯƠNG' (CỰC KỲ DỄ CHẤM CÔNG NHƯ THỜI VỤ) */}
                      {/* ========================================================================= */}
                      {viewMode === 'ATTENDANCE' ? (
                        <>
                          {/* Công chuẩn */}
                          <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-slate-700">
                            {stdDays}
                          </td>

                          {/* SỐ NGÀY CÔNG THỰC TẾ: Gõ mượt mà, hỗ trợ số thập phân, nút +/- */}
                          <td className="p-1.5 border-r border-slate-200 text-center bg-sky-50/40">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStepWorkDays(emp, -0.5)}
                                className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition active:scale-95"
                                title="Giảm 0.5 ngày công"
                              >
                                -
                              </button>

                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                value={rawDays}
                                onChange={(e) => {
                                  const valStr = e.target.value;
                                  if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                                    setRowDaysBuffer((prev) => ({ ...prev, [emp.id]: valStr }));
                                    if (valStr !== '' && !valStr.endsWith('.')) {
                                      const parsed = parseFloat(valStr);
                                      if (!isNaN(parsed) && parsed >= 0 && parsed <= 31) {
                                        handleWorkDaysChange(emp, parsed);
                                      }
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (rowDaysBuffer[emp.id] !== undefined) {
                                    const parsed = parseFloat(rowDaysBuffer[emp.id]);
                                    const finalDays = isNaN(parsed) ? 0 : Math.max(0, Math.min(31, parsed));
                                    handleWorkDaysChange(emp, finalDays);
                                    setRowDaysBuffer((prev) => {
                                      const next = { ...prev };
                                      delete next[emp.id];
                                      return next;
                                    });
                                  }
                                }}
                                className="w-13 px-1 py-1 border border-sky-400 focus:border-sky-600 focus:ring-1 focus:ring-sky-500 rounded text-center font-mono font-black text-xs text-slate-900 bg-white shadow-2xs"
                                title="Nhập số ngày công làm việc (VD: 26, 25.5, 24)"
                              />

                              <button
                                type="button"
                                onClick={() => handleStepWorkDays(emp, 0.5)}
                                className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition active:scale-95"
                                title="Tăng 0.5 ngày công"
                              >
                                +
                              </button>

                              <button
                                type="button"
                                onClick={() => handleWorkDaysChange(emp, stdDays)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 cursor-pointer transition"
                                title={`Đặt nhanh đủ công chuẩn (${stdDays} ngày)`}
                              >
                                Đủ {stdDays}
                              </button>
                            </div>
                          </td>

                          {/* GIỜ TĂNG CA OT */}
                          <td className="p-1.5 border-r border-slate-200 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStepOT(emp, -1)}
                                className="w-4.5 h-5.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black flex items-center justify-center cursor-pointer transition"
                                title="Giảm 1 giờ OT"
                              >
                                -
                              </button>

                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                value={rawOt}
                                onChange={(e) => {
                                  const valStr = e.target.value;
                                  if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                                    setRowOtBuffer((prev) => ({ ...prev, [emp.id]: valStr }));
                                    if (valStr !== '' && !valStr.endsWith('.')) {
                                      const parsed = parseFloat(valStr);
                                      if (!isNaN(parsed) && parsed >= 0) {
                                        handleOtChange(emp, parsed);
                                      }
                                    }
                                  }
                                }}
                                onBlur={() => {
                                  if (rowOtBuffer[emp.id] !== undefined) {
                                    const parsed = parseFloat(rowOtBuffer[emp.id]);
                                    const finalOT = isNaN(parsed) ? 0 : Math.max(0, parsed);
                                    handleOtChange(emp, finalOT);
                                    setRowOtBuffer((prev) => {
                                      const next = { ...prev };
                                      delete next[emp.id];
                                      return next;
                                    });
                                  }
                                }}
                                className="w-11 px-1 py-0.5 border border-slate-300 focus:border-sky-500 rounded text-center font-mono font-bold text-xs text-amber-900 bg-white"
                                title="Nhập giờ làm thêm OT"
                              />

                              <button
                                type="button"
                                onClick={() => handleStepOT(emp, 1)}
                                className="w-4.5 h-5.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black flex items-center justify-center cursor-pointer transition"
                                title="Tăng 1 giờ OT"
                              >
                                +
                              </button>
                              <span className="text-[10px] text-slate-400">h</span>
                            </div>
                          </td>

                          {/* TIỀN TĂNG CA OT (1.5x) */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-amber-900 bg-amber-50/20">
                            {(emp.overtimePay || 0) > 0 ? (
                              `${new Intl.NumberFormat('vi-VN').format(emp.overtimePay)} đ`
                            ) : (
                              <span className="text-slate-400 font-normal">—</span>
                            )}
                          </td>

                          {/* NGHỈ PHÉP CÓ LƯƠNG */}
                          <td className="p-1.5 border-r border-slate-200 text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={rawPaid}
                              onChange={(e) => {
                                const valStr = e.target.value;
                                if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                                  setRowPaidLeaveBuffer((prev) => ({ ...prev, [emp.id]: valStr }));
                                  if (valStr !== '' && !valStr.endsWith('.')) {
                                    const parsed = parseFloat(valStr);
                                    if (!isNaN(parsed)) handlePaidLeaveChange(emp, parsed);
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (rowPaidLeaveBuffer[emp.id] !== undefined) {
                                  const parsed = parseFloat(rowPaidLeaveBuffer[emp.id]);
                                  handlePaidLeaveChange(emp, isNaN(parsed) ? 0 : Math.max(0, parsed));
                                  setRowPaidLeaveBuffer((prev) => {
                                    const next = { ...prev };
                                    delete next[emp.id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-10 px-1 py-0.5 border border-slate-200 hover:border-slate-400 rounded text-center font-mono font-medium text-xs text-slate-700 bg-white"
                              title="Số ngày nghỉ phép hưởng nguyên lương"
                            />
                          </td>

                          {/* NGHỈ KHÔNG LƯƠNG */}
                          <td className="p-1.5 border-r border-slate-200 text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0"
                              value={rawUnpaid}
                              onChange={(e) => {
                                const valStr = e.target.value;
                                if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                                  setRowUnpaidLeaveBuffer((prev) => ({ ...prev, [emp.id]: valStr }));
                                  if (valStr !== '' && !valStr.endsWith('.')) {
                                    const parsed = parseFloat(valStr);
                                    if (!isNaN(parsed)) handleUnpaidLeaveChange(emp, parsed);
                                  }
                                }
                              }}
                              onBlur={() => {
                                if (rowUnpaidLeaveBuffer[emp.id] !== undefined) {
                                  const parsed = parseFloat(rowUnpaidLeaveBuffer[emp.id]);
                                  handleUnpaidLeaveChange(emp, isNaN(parsed) ? 0 : Math.max(0, parsed));
                                  setRowUnpaidLeaveBuffer((prev) => {
                                    const next = { ...prev };
                                    delete next[emp.id];
                                    return next;
                                  });
                                }
                              }}
                              className="w-10 px-1 py-0.5 border border-slate-200 hover:border-slate-400 rounded text-center font-mono font-medium text-xs text-slate-700 bg-white"
                              title="Số ngày nghỉ không lương"
                            />
                          </td>

                          {/* LƯƠNG THEO CÔNG */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                            {emp.actualWorkDays === 0 ? (
                              <span className="text-slate-400 font-normal italic text-[11px]">0 đ</span>
                            ) : (
                              `${new Intl.NumberFormat('vi-VN').format(emp.salaryByActualDays || 0)} đ`
                            )}
                          </td>

                          {/* PHỤ CẤP TRÁCH NHIỆM + DỰ ÁN */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            {((emp.responsibilityAllowance || 0) + (emp.projectAllowance || 0)) > 0 ? (
                              `${new Intl.NumberFormat('vi-VN').format((emp.responsibilityAllowance || 0) + (emp.projectAllowance || 0))} đ`
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* TRỪ BHXH 10.5% */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-700">
                            {(emp.totalInsurance || 0) > 0 ? (
                              `-${new Intl.NumberFormat('vi-VN').format(emp.totalInsurance)} đ`
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* THỰC LĨNH */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-[#0f3d64] bg-sky-50/30 text-xs">
                            {emp.netSalary > 0 ? (
                              `${new Intl.NumberFormat('vi-VN').format(emp.netSalary)} đ`
                            ) : (
                              <span className="text-slate-400 font-normal">0 đ</span>
                            )}
                          </td>
                        </>
                      ) : (
                        /* ========================================================================= */
                        /* DỮ LIỆU CHẾ ĐỘ 'HỒ SƠ & HỢP ĐỒNG LAO ĐỘNG' */
                        /* ========================================================================= */
                        <>
                          {/* Hợp đồng lao động */}
                          <td className="p-2 border-r border-slate-200">
                            <div className="font-bold text-slate-800 text-[11px] leading-snug">
                              {emp.contractType || 'HĐLĐ Không xác định thời hạn'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Số: {emp.contractNumber || 'Chưa cấp'}
                            </div>
                          </td>

                          {/* Thời hạn hợp đồng */}
                          <td className="p-2 border-r border-slate-200">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                contractInfo.status === 'UNLIMITED'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : contractInfo.status === 'EXPIRED'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300 font-black animate-pulse'
                                  : contractInfo.status === 'EXPIRING_SOON'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {contractInfo.label}
                            </span>
                            {emp.contractEndDate && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Hết hạn: {emp.contractEndDate}
                              </div>
                            )}
                          </td>

                          {/* Email & SĐT */}
                          <td className="p-2 border-r border-slate-200">
                            {emp.email && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-700">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[140px]">{emp.email}</span>
                              </div>
                            )}
                            {emp.phone && (
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{emp.phone}</span>
                              </div>
                            )}
                          </td>

                          {/* Trạng thái làm việc */}
                          <td className="p-2 border-r border-slate-200 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(emp)}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition cursor-pointer ${
                                (emp.status || 'ACTIVE') === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                              title="Bấm để đổi trạng thái Đang làm việc / Nghỉ việc"
                            >
                              {(emp.status || 'ACTIVE') === 'ACTIVE' ? '🟢 Đang làm' : '🔴 Đã nghỉ'}
                            </button>
                          </td>

                          {/* Lương cơ bản */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                            {new Intl.NumberFormat('vi-VN').format(emp.baseSalary)} đ
                          </td>

                          {/* PC Trách nhiệm */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            {(emp.responsibilityAllowance || 0) > 0 ? (
                              `${new Intl.NumberFormat('vi-VN').format(emp.responsibilityAllowance)} đ`
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* PC Dự án */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                            {(emp.projectAllowance || 0) > 0 ? (
                              `${new Intl.NumberFormat('vi-VN').format(emp.projectAllowance)} đ`
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* NPT */}
                          <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-700 font-bold">
                            {emp.dependents || 0}
                          </td>

                          {/* BHXH (10.5%) */}
                          <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-700">
                            {(emp.totalInsurance || 0) > 0 ? (
                              `-${new Intl.NumberFormat('vi-VN').format(emp.totalInsurance)} đ`
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* Tài khoản ATM */}
                          <td className="p-2 border-r border-slate-200 font-mono text-[11px] text-slate-700">
                            <div className="font-bold">{emp.bankAccount || '—'}</div>
                            <div className="text-[10px] text-slate-500 font-sans">{emp.bankName || ''}</div>
                          </td>
                        </>
                      )}

                      {/* Thao tác */}
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Sửa chi tiết */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-sky-700 hover:bg-sky-100 rounded-lg transition cursor-pointer"
                            title="Chỉnh sửa chi tiết hồ sơ & hợp đồng"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Đánh giá tăng lương */}
                          <button
                            type="button"
                            onClick={() => {
                              setSalaryReviewEmployee(emp);
                              setIsSalaryReviewOpen(true);
                            }}
                            className="p-1.5 text-amber-700 hover:bg-amber-100 rounded-lg transition cursor-pointer"
                            title="Quy trình tăng lương hàng năm & Phụ lục HĐLĐ"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Xóa nhân viên */}
                          <button
                            type="button"
                            onClick={() => setEmployeeToDelete(emp)}
                            className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                            title="Xóa nhân viên này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CHỈNH SỬA / THÊM MỚI NHÂN VIÊN */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <EmployeeModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEmployee(null);
          }}
          onSave={(savedEmp) => {
            if (editingEmployee) {
              onUpdateEmployee(savedEmp);
              showToast(`Đã cập nhật hồ sơ nhân viên ${savedEmp.fullName} thành công!`);
            } else {
              onAddEmployee(savedEmp);
              showToast(`Đã thêm mới nhân viên ${savedEmp.fullName} thành công!`);
            }
            setIsModalOpen(false);
            setEditingEmployee(null);
          }}
          initialData={editingEmployee}
          employee={editingEmployee}
          existingCodes={employees.map((e) => e.code)}
          departments={departments}
          config={config}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: QUY TRÌNH TĂNG LƯƠNG HÀNG NĂM & PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG */}
      {/* ========================================================================= */}
      {isSalaryReviewOpen && salaryReviewEmployee && (
        <AnnualSalaryReviewModal
          isOpen={isSalaryReviewOpen}
          onClose={() => {
            setIsSalaryReviewOpen(false);
            setSalaryReviewEmployee(null);
          }}
          employee={salaryReviewEmployee}
          config={config}
          onApplySalaryIncrease={handleApplySalaryIncrease}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: XÁC NHẬN XÓA NHÂN VIÊN */}
      {/* ========================================================================= */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 text-rose-950">
              <div className="p-2 bg-rose-100 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-600" />
              </div>
              <h3 className="font-bold text-sm uppercase">Xác nhận xóa nhân viên</h3>
            </div>
            <div className="p-5 text-xs text-slate-700 space-y-2">
              <p>
                Bạn có chắc chắn muốn xóa nhân viên{' '}
                <strong className="text-slate-900 font-bold">{employeeToDelete.fullName}</strong> ({employeeToDelete.code}) khỏi hệ thống?
              </p>
              <p className="text-slate-500 italic">
                Lưu ý: Thao tác này sẽ gỡ bỏ toàn bộ hồ sơ, dữ liệu chấm công và bảng lương của nhân sự này.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteEmployee(employeeToDelete.id);
                  setEmployeeToDelete(null);
                  showToast('Đã xóa nhân viên thành công!');
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: XÁC NHẬN KHÔI PHỤC DANH SÁCH MẪU BAN ĐẦU */}
      {/* ========================================================================= */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-50 border-b border-amber-200 p-4 flex items-center gap-3 text-amber-950">
              <div className="p-2 bg-amber-100 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-bold text-sm uppercase">Khôi phục nhân viên mẫu</h3>
            </div>
            <div className="p-5 text-xs text-slate-700 space-y-2">
              <p>
                Bạn có chắc muốn khôi phục lại danh sách 19 nhân viên thường trực mẫu ban đầu của Phúc Nguyễn?
              </p>
              <p className="text-amber-800 font-medium">
                Mọi dữ liệu chỉnh sửa cục bộ hiện tại sẽ được thay thế bằng danh sách mẫu.
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onResetDefault) onResetDefault();
                  setShowResetConfirm(false);
                  showToast('Đã khôi phục lại danh sách nhân sự mẫu ban đầu!');
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition cursor-pointer"
              >
                Khôi phục mẫu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
