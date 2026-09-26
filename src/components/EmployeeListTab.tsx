import React, { useState, useMemo, useRef } from 'react';
import {
  UserPlus,
  Search,
  Filter,
  CheckSquare,
  Square,
  Edit2,
  UserMinus,
  UserCheck,
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
  MessageSquare,
  ExternalLink,
  FileText,
  Clock,
  AlertTriangle,
  TrendingUp,
  Paperclip,
  Sparkles,
  HardHat,
} from 'lucide-react';
import { Employee, CompanyConfig, ContractAddendum } from '../types';
import { EmployeeModal } from './EmployeeModal';
import { AnnualSalaryReviewModal } from './AnnualSalaryReviewModal';
import { formatVND } from '../utils/numberToVietnameseWords';
import { getContractStatusInfo } from '../utils/contractHelper';

interface EmployeeListTabProps {
  employees: Employee[];
  config: CompanyConfig;
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Annual Salary Review Modal State
  const [isSalaryReviewOpen, setIsSalaryReviewOpen] = useState(false);
  const [salaryReviewEmployee, setSalaryReviewEmployee] = useState<Employee | null>(null);

  // Departments
  const departments = useMemo(() => {
    const set = new Set(employees.map((e) => e.department));
    return Array.from(set);
  }, [employees]);

  // Statistics
  const totalCount = employees.length;
  const activeCount = employees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length;
  const resignedCount = employees.filter((e) => e.status === 'RESIGNED').length;
  const selectedAttendanceCount = employees.filter((e) => e.selectedForAttendance !== false).length;

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

  // Handle Toggle Attendance Selection
  const handleToggleAttendance = (emp: Employee) => {
    const updated: Employee = {
      ...emp,
      selectedForAttendance: emp.selectedForAttendance === false ? true : false,
    };
    onUpdateEmployee(updated);
  };

  // Select all or Deselect all for current filtered list
  const handleSelectAllAttendance = (select: boolean) => {
    const targetIds = new Set(filteredEmployees.map((e) => e.id));
    const updatedList = employees.map((e) => {
      if (targetIds.has(e.id)) {
        return { ...e, selectedForAttendance: select };
      }
      return e;
    });
    onBatchUpdate(updatedList);
  };

  // Toggle status (Active <-> Resigned)
  const handleToggleStatus = (emp: Employee) => {
    const newStatus = (emp.status || 'ACTIVE') === 'ACTIVE' ? 'RESIGNED' : 'ACTIVE';
    const updated: Employee = {
      ...emp,
      status: newStatus,
      // If resigned, automatically uncheck from attendance
      selectedForAttendance: newStatus === 'ACTIVE',
    };
    onUpdateEmployee(updated);
  };

  // Handle Delete with confirmation
  const handleDelete = (emp: Employee) => {
    setEmployeeToDelete(emp);
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
      'PC Trách nhiệm',
      'PC Dự án',
      'Ăn ca',
      'Xăng xe/ĐT',
      'NPT',
      'Lương đóng BH',
      'Phí đóng BHXH (10.5%)',
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
      e.responsibilityAllowance || 0,
      e.projectAllowance || 0,
      e.mealAllowance,
      e.phoneTravelAllowance,
      e.dependents,
      e.insuranceSalary || 0,
      e.totalInsurance || Math.round((e.insuranceSalary || 0) * 0.105),
      `"${e.bankAccount}"`,
      `"${e.bankName}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Danh_sach_nhan_su_${config.periodCode.replace('/', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

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
          alert(`Đã khôi phục thành công toàn bộ ${parsed.length} nhân sự từ file sao lưu!`);
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
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Thẻ thống kê nhân sự */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng số nhân sự</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{totalCount} người</div>
          </div>
          <div className="w-9 h-9 rounded bg-sky-50 flex items-center justify-center text-sky-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Đang làm việc</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">{activeCount} người</div>
          </div>
          <div className="w-9 h-9 rounded bg-emerald-50 flex items-center justify-center text-emerald-700">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded p-3 flex items-center justify-between shadow-xs bg-emerald-50/20">
          <div>
            <div className="text-emerald-800 font-medium flex items-center gap-1">
              <span>Được chọn chấm công</span>
            </div>
            <div className="text-xl font-black text-emerald-800 mt-0.5">
              {selectedAttendanceCount} / {totalCount}
            </div>
          </div>
          <div className="w-9 h-9 rounded bg-emerald-100 flex items-center justify-center text-emerald-800">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded p-3 flex items-center justify-between shadow-xs">
          <div>
            <div className="text-slate-500 font-medium">Đã nghỉ việc / Tạm hoãn</div>
            <div className="text-xl font-black text-rose-600 mt-0.5">{resignedCount} người</div>
          </div>
          <div className="w-9 h-9 rounded bg-rose-50 flex items-center justify-center text-rose-600">
            <UserMinus className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Thanh tổng quan Hợp đồng lao động & Thời hạn (BLLĐ 2019) */}
      <div className="bg-gradient-to-r from-sky-50 via-white to-slate-50 border border-sky-200 rounded p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-[#0f3d64] text-white flex items-center justify-center shrink-0 shadow-2xs">
            <FileText className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>Hợp đồng lao động & Thời hạn HĐLĐ</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-semibold">BLLĐ 2019</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Quản lý phân loại HĐLĐ, kỳ hạn và cảnh báo thời hạn tái ký hợp đồng tự động
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Vô thời hạn: <strong className="text-emerald-800">{contractStats.unlimited}</strong></span>
          </span>
          <span className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-sky-500"></span>
            <span>Có thời hạn: <strong className="text-sky-800">{contractStats.fixed}</strong></span>
          </span>
          {contractStats.probationOrOther > 0 && (
            <span className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 font-medium flex items-center gap-1.5 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Thử việc/Khoán: <strong className="text-indigo-800">{contractStats.probationOrOther}</strong></span>
            </span>
          )}
          {contractStats.expiringSoon > 0 && (
            <span className="px-2 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 font-bold flex items-center gap-1.5 shadow-2xs animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Sắp hết hạn (&le; 60 ngày): <strong>{contractStats.expiringSoon}</strong></span>
            </span>
          )}
          {contractStats.expired > 0 && (
            <span className="px-2 py-1 rounded bg-rose-50 border border-rose-300 text-rose-800 font-bold flex items-center gap-1.5 shadow-2xs">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Đã hết hạn: <strong>{contractStats.expired}</strong></span>
            </span>
          )}
        </div>
      </div>

      {/* Thanh công cụ & Bộ lọc */}
      <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Nút Thêm nhân viên mới */}
          <button
            id="btn-add-employee"
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
            className="px-3 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Thêm nhân viên (Tăng nhân sự)</span>
          </button>

          {/* Nút Chuyển nhanh sang Nhân lực thời vụ */}
          {onGoToSeasonalWorkers && (
            <button
              id="btn-goto-seasonal-workers"
              type="button"
              onClick={onGoToSeasonalWorkers}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap"
              title="Chuyển sang Quản lý Công nhân kỹ thuật & Nhân lực thời vụ công trình"
            >
              <HardHat className="w-4 h-4 text-amber-600" />
              <span>Nhân lực thời vụ (Công nhân kỹ thuật)</span>
            </button>
          )}

          {/* Nút Quy trình Tăng lương hàng năm & Phụ lục HĐLĐ */}
          <button
            id="btn-annual-salary-review"
            onClick={() => {
              const firstTarget = filteredEmployees.find((e) => e.status !== 'RESIGNED') || employees[0];
              if (firstTarget) {
                setSalaryReviewEmployee(firstTarget);
                setIsSalaryReviewOpen(true);
              }
            }}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs whitespace-nowrap"
            title="Thực hiện quy trình tăng lương hàng năm, ban hành Phụ lục HĐLĐ và gửi Email cho nhân viên"
          >
            <TrendingUp className="w-4 h-4 text-amber-200" />
            <span>Quy trình Tăng lương hàng năm & Phụ lục HĐ</span>
          </button>

          {/* Ô Tìm kiếm */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm tên, mã, số HĐLĐ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-slate-50 focus:bg-white"
            />
          </div>

          {/* Lọc Bộ phận */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-sky-600"
          >
            <option value="ALL">Tất cả phòng ban ({departments.length})</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Lọc Hợp đồng lao động & Thời hạn */}
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value as any)}
            className="px-2.5 py-1.5 border border-sky-300 rounded bg-sky-50/40 focus:outline-sky-600 font-medium text-slate-800"
          >
            <option value="ALL">Tất cả Hợp đồng ({totalCount})</option>
            <option value="UNLIMITED">HĐLĐ Vô thời hạn ({contractStats.unlimited})</option>
            <option value="FIXED">HĐLĐ Có thời hạn ({contractStats.fixed})</option>
            <option value="PROBATION">Thử việc / Khoán việc ({contractStats.probationOrOther})</option>
            {(contractStats.expiringSoon > 0 || contractStats.expired > 0) && (
              <option value="EXPIRING">⚠️ Cần lưu ý hạn HĐ ({contractStats.expiringSoon + contractStats.expired})</option>
            )}
          </select>

          {/* Lọc Trạng thái nhân sự */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-sky-600 font-medium"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">🟢 Đang làm việc ({activeCount})</option>
            <option value="RESIGNED">🔴 Đã nghỉ việc ({resignedCount})</option>
          </select>

          {/* Lọc tình trạng chấm công */}
          <select
            value={attendanceFilter}
            onChange={(e) => setAttendanceFilter(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-sky-600"
          >
            <option value="ALL">Tất cả chế độ chấm công</option>
            <option value="SELECTED">✓ Đã chọn chấm công ({selectedAttendanceCount})</option>
            <option value="UNSELECTED">✗ Không chọn chấm công ({totalCount - selectedAttendanceCount})</option>
          </select>
        </div>

        {/* Nút thao tác hàng loạt & Chuyển sang chấm công */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSelectAllAttendance(true)}
            className="px-2.5 py-1.5 border border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100 rounded font-medium flex items-center gap-1 cursor-pointer transition"
            title="Tích chọn tất cả nhân viên đang hiển thị vào chấm công"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>Chọn tất cả chấm công</span>
          </button>

          <button
            onClick={() => handleSelectAllAttendance(false)}
            className="px-2.5 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded font-medium flex items-center gap-1 cursor-pointer transition"
            title="Bỏ chọn tất cả nhân viên đang hiển thị"
          >
            <Square className="w-3.5 h-3.5 text-slate-400" />
            <span>Bỏ chọn tất cả</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded font-medium flex items-center gap-1 cursor-pointer transition"
            title="Xuất danh sách nhân sự ra file CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>

          {/* Sao lưu dữ liệu an toàn ra file JSON */}
          <button
            id="btn-export-json-backup"
            onClick={handleExportJSON}
            className="px-2.5 py-1.5 border border-sky-300 text-sky-800 bg-sky-50/60 hover:bg-sky-100 rounded font-medium flex items-center gap-1 cursor-pointer transition"
            title="Tải file sao lưu toàn bộ thông tin nhân sự (.json) về máy tính để lưu trữ dự phòng"
          >
            <Download className="w-3.5 h-3.5 text-sky-700" />
            <span>Sao lưu file (JSON)</span>
          </button>

          {/* Khôi phục từ file sao lưu */}
          <button
            id="btn-import-json-backup"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded font-medium flex items-center gap-1 cursor-pointer transition"
            title="Khôi phục danh sách nhân sự từ file sao lưu .json"
          >
            <Upload className="w-3.5 h-3.5 text-slate-600" />
            <span>Khôi phục từ file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportJSON}
            className="hidden"
          />

          <div
            className="hidden xl:flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[11px] font-medium"
            title="Toàn bộ thông tin bạn chỉnh sửa được tự động lưu vĩnh viễn trong trình duyệt"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tự động lưu & bảo vệ dữ liệu</span>
          </div>

          <button
            onClick={onGoToAttendance}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Sang bảng Chấm công ({selectedAttendanceCount}) →</span>
          </button>
        </div>
      </div>

      {/* Bảng Danh sách nhân sự */}
      <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[650px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0f3d64] text-white z-10 select-none text-[11px]">
              <tr>
                <th className="p-2.5 border-r border-sky-800 text-center w-12 font-bold">STT</th>
                <th className="p-2.5 border-r border-sky-800 text-center w-36 font-bold bg-[#144d7d]">
                  <div className="flex items-center justify-center gap-1">
                    <CalendarCheck className="w-3.5 h-3.5 text-amber-300" />
                    <span>Chọn chấm công</span>
                  </div>
                </th>
                <th className="p-2.5 border-r border-sky-800 w-24 font-bold text-center">Mã NV</th>
                <th className="p-2.5 border-r border-sky-800 min-w-[160px] font-bold">Họ và tên</th>
                <th className="p-2.5 border-r border-sky-800 min-w-[130px] font-bold">Chức danh</th>
                <th className="p-2.5 border-r border-sky-800 min-w-[140px] font-bold">Bộ phận</th>
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
                <th className="p-2.5 border-r border-sky-800 min-w-[190px] font-bold">Email & SĐT</th>
                <th className="p-2.5 border-r border-sky-800 text-center w-28 font-bold">Trạng thái</th>
                <th className="p-2.5 border-r border-sky-800 text-right w-32 font-bold">Lương cơ bản</th>
                <th className="p-2.5 border-r border-sky-800 text-right w-32 font-bold bg-[#144d7d]">
                  <div>PC Trách nhiệm</div>
                  <div className="text-[9.5px] text-amber-200 font-normal">Trách nhiệm</div>
                </th>
                <th className="p-2.5 border-r border-sky-800 text-right w-32 font-bold bg-[#144d7d]">
                  <div>PC Dự án</div>
                  <div className="text-[9.5px] text-amber-200 font-normal">Dự án</div>
                </th>
                <th className="p-2.5 border-r border-sky-800 text-center w-14 font-bold">NPT</th>
                <th className="p-2.5 border-r border-sky-800 text-right w-36 font-bold bg-[#144d7d]">
                  <div>BHXH (10.5%)</div>
                  <div className="text-[9px] text-amber-200 font-normal">(=Lương đóng BH × 10.5%)</div>
                </th>
                <th className="p-2.5 border-r border-sky-800 min-w-[170px] font-bold">Tài khoản chi trả</th>
                <th className="p-2.5 text-center w-36 font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-slate-500 italic">
                    Không tìm thấy nhân viên nào phù hợp với bộ lọc tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const isSelectedForAttendance = emp.selectedForAttendance !== false;
                  const isResigned = emp.status === 'RESIGNED';
                  const isLeave = emp.status === 'LEAVE';
                  const contractInfo = getContractStatusInfo(emp);

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-sky-50/40 transition-colors ${
                        !isSelectedForAttendance
                          ? 'bg-slate-100/70 text-slate-400'
                          : isResigned
                          ? 'bg-rose-50/40'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50/50'
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
                      >
                        <div className="flex items-center justify-center gap-1.5 select-none">
                          <input
                            type="checkbox"
                            checked={isSelectedForAttendance}
                            onChange={() => {}} // Handled by cell onClick
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <span
                            className={`text-[11px] font-semibold ${
                              isSelectedForAttendance ? 'text-emerald-800' : 'text-slate-400'
                            }`}
                          >
                            {isSelectedForAttendance ? 'Chấm công' : 'Bỏ qua'}
                          </span>
                        </div>
                      </td>

                      {/* Mã NV */}
                      <td className="p-2 border-r border-slate-200 font-mono font-bold text-center text-[#0f3d64]">
                        {emp.code}
                      </td>

                      {/* Họ và tên */}
                      <td className="p-2 border-r border-slate-200">
                        <div className="font-bold text-slate-800">{emp.fullName}</div>
                        <div className="text-[10px] text-slate-500 italic">Vào làm: {emp.joinDate}</div>
                      </td>

                      {/* Chức danh */}
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        {emp.title}
                      </td>

                      {/* Bộ phận */}
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        {emp.department}
                      </td>

                      {/* Cột 1: Hợp đồng lao động */}
                      <td className="p-2 border-r border-slate-200">
                        <div className="font-bold text-slate-800 text-[11px] leading-snug">
                          {emp.contractType || 'HĐLĐ Không xác định thời hạn'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-mono">
                          <FileText className="w-3 h-3 text-sky-600 shrink-0" />
                          <span>{emp.contractNumber || `HĐLĐ-${emp.code}/PNC`}</span>
                        </div>

                        {/* Đường dẫn tới file Hợp đồng lao động & Phụ lục */}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {emp.contractFileUrl ? (
                            <a
                              href={emp.contractFileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded font-medium hover:underline transition"
                              title={`Mở file HĐLĐ: ${emp.contractFileName || 'Tài liệu hợp đồng'}`}
                            >
                              <Paperclip className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                              <span>Xem file HĐ ↗</span>
                            </a>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingEmployee(emp);
                                setIsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-sky-700 hover:bg-slate-100 px-1.5 py-0.5 rounded italic cursor-pointer transition"
                              title="Bấm để gắn link hoặc tải file hợp đồng"
                            >
                              <Paperclip className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                              <span>+ Gắn file HĐ</span>
                            </button>
                          )}

                          {emp.contractAddendums && emp.contractAddendums.length > 0 && (
                            <button
                              onClick={() => {
                                setSalaryReviewEmployee(emp);
                                setIsSalaryReviewOpen(true);
                              }}
                              className="inline-flex items-center gap-0.5 text-[9px] text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1 py-0.5 rounded font-bold cursor-pointer transition"
                              title={`Đã có ${emp.contractAddendums.length} phụ lục hợp đồng điều chỉnh lương`}
                            >
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              <span>{emp.contractAddendums.length} Phụ lục</span>
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Cột 2: Thời hạn hợp đồng */}
                      <td className="p-2 border-r border-slate-200">
                        <div className="flex items-center gap-1 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] border inline-flex items-center gap-1 font-semibold ${contractInfo.badgeClass}`}
                            title={contractInfo.description}
                          >
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            <span>{contractInfo.label}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {emp.contractEndDate ? (
                            <div className="flex items-center gap-1">
                              <span className="text-slate-400">Hết hạn:</span>
                              <span className="font-mono font-medium text-slate-700">{emp.contractEndDate}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">
                              {emp.contractDuration || 'Không thời hạn'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Email & Số điện thoại */}
                      <td className="p-2 border-r border-slate-200">
                        <div className="space-y-1">
                          {emp.email ? (
                            <a
                              href={`mailto:${emp.email}`}
                              className="flex items-center gap-1.5 text-[11px] text-sky-700 hover:text-sky-900 font-medium hover:underline truncate max-w-[190px]"
                              title={`Gửi email đến ${emp.email}`}
                            >
                              <Mail className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                              <span className="truncate">{emp.email}</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-300" />
                              Chưa có email
                            </span>
                          )}
                          {emp.phone ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <a
                                href={`tel:${emp.phone}`}
                                className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-slate-900 font-mono font-medium"
                                title={`Gọi điện ${emp.phone}`}
                              >
                                <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{emp.phone}</span>
                              </a>
                              <a
                                href={`https://zalo.me/${emp.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[#0068FF] font-bold border border-blue-200 flex items-center gap-0.5 transition cursor-pointer"
                                title={`Mở chat Zalo với ${emp.fullName}`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                <span>Zalo</span>
                                <ExternalLink className="w-2 h-2" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-300" />
                              Chưa có SĐT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Trạng thái nhân sự */}
                      <td className="p-2 border-r border-slate-200 text-center">
                        {isResigned ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-semibold rounded text-[10px] border border-rose-200">
                            Nghỉ việc
                          </span>
                        ) : isLeave ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-semibold rounded text-[10px] border border-amber-200">
                            Tạm hoãn
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-semibold rounded text-[10px] border border-emerald-200">
                            Đang làm việc
                          </span>
                        )}
                      </td>

                      {/* Lương cơ bản */}
                      <td className="p-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800">
                        {formatVND(emp.baseSalary)}
                      </td>

                      {/* Phụ cấp trách nhiệm */}
                      <td className="p-2 border-r border-slate-200 text-right font-mono">
                        {(emp.responsibilityAllowance || 0) > 0 ? (
                          <span className="font-semibold text-[#0f3d64]">{formatVND(emp.responsibilityAllowance)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Phụ cấp dự án */}
                      <td className="p-2 border-r border-slate-200 text-right font-mono">
                        {(emp.projectAllowance || 0) > 0 ? (
                          <span className="font-bold text-emerald-700">{formatVND(emp.projectAllowance)}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* NPT */}
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-700">
                        {emp.dependents}
                      </td>

                      {/* Phí đóng bảo hiểm xã hội (ngay sau Người phụ thuộc) */}
                      <td className="p-2 border-r border-slate-200 text-right font-mono" title={`Lương đóng BH: ${formatVND(emp.insuranceSalary || 0)} (10.5% = ${formatVND(emp.totalInsurance || Math.round((emp.insuranceSalary || 0) * 0.105))})`}>
                        <div className="font-bold text-rose-900">
                          {formatVND(emp.totalInsurance || Math.round((emp.insuranceSalary || 0) * 0.105))}
                        </div>
                        <div className="text-[9.5px] text-slate-500 font-normal">
                          {(emp.insuranceSalary || 0) > 0 ? (
                            `(=${new Intl.NumberFormat('vi-VN').format(emp.insuranceSalary)} × 10.5%)`
                          ) : (
                            <span className="text-slate-400 italic">Không đóng BH</span>
                          )}
                        </div>
                      </td>

                      {/* Tài khoản NH */}
                      <td className="p-2 border-r border-slate-200">
                        {emp.bankAccount ? (
                          <div>
                            <div className="font-mono font-bold text-slate-800">{emp.bankAccount}</div>
                            <div className="text-[10px] text-slate-500">{emp.bankName}</div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-600 italic">Chưa có STK</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Quy trình Tăng lương hàng năm & Phụ lục HĐLĐ */}
                          <button
                            title="Quy trình Tăng lương hàng năm, ban hành Phụ lục HĐLĐ & Gửi Email cho nhân sự"
                            onClick={() => {
                              setSalaryReviewEmployee(emp);
                              setIsSalaryReviewOpen(true);
                            }}
                            className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded font-bold text-[10px] flex items-center gap-1 transition cursor-pointer shadow-2xs whitespace-nowrap"
                          >
                            <TrendingUp className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Tăng lương & HĐ</span>
                          </button>

                          {/* Sửa thông tin */}
                          <button
                            title="Chỉnh sửa thông tin nhân viên"
                            onClick={() => {
                              setEditingEmployee(emp);
                              setIsModalOpen(true);
                            }}
                            className="p-1 text-sky-700 hover:bg-sky-100 rounded transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Chuyển trạng thái nghỉ việc / kích hoạt */}
                          <button
                            title={isResigned ? 'Kích hoạt đi làm lại' : 'Chuyển sang nghỉ việc (Giảm nhân sự)'}
                            onClick={() => handleToggleStatus(emp)}
                            className={`p-1 rounded transition cursor-pointer ${
                              isResigned
                                ? 'text-emerald-700 hover:bg-emerald-100'
                                : 'text-amber-700 hover:bg-amber-100'
                            }`}
                          >
                            {isResigned ? (
                              <UserCheck className="w-3.5 h-3.5" />
                            ) : (
                              <UserMinus className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Xóa vĩnh viễn */}
                          <button
                            title="Xóa hẳn khỏi danh sách"
                            onClick={() => handleDelete(emp)}
                            className="p-1 text-rose-600 hover:bg-rose-100 rounded transition cursor-pointer"
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

        {/* Footer ghi chú */}
        <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-sky-700" />
            <span>
              <strong>Mẹo:</strong> Nhân viên được tích chọn <strong>"Chấm công"</strong> sẽ tự động hiển thị trong <strong>Bảng Chấm Công</strong> và <strong>Bảng Lương</strong> của kỳ hiện tại. Nhân sự đã nghỉ việc hoặc không tích chọn sẽ được ẩn đi để không ảnh hưởng đến bảng lương tháng.
            </span>
          </div>
          <div className="font-semibold text-slate-700">
            Hiển thị {filteredEmployees.length} / {totalCount} nhân viên
          </div>
        </div>
      </div>

      {/* Modal Thêm/Sửa nhân viên */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(savedEmp) => {
          if (editingEmployee) {
            onUpdateEmployee(savedEmp);
          } else {
            onAddEmployee(savedEmp);
          }
        }}
        initialData={editingEmployee}
        existingCodes={employees.map((e) => e.code)}
      />

      {/* Modal Quy trình Tăng lương hàng năm & Phụ lục HĐLĐ & Gửi Email */}
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

      {/* Modal Xác nhận xóa nhân viên (In-app dialog) */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 text-rose-900">
              <div className="p-2.5 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">Xác nhận xóa nhân viên</h3>
                <p className="text-xs text-rose-700">Hành động này sẽ xóa nhân viên khỏi hệ thống</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>Bạn có chắc chắn muốn xóa nhân viên sau khỏi danh sách?</p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã NV:</span>
                  <strong className="font-mono text-sky-900">{employeeToDelete.code}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Họ và tên:</span>
                  <strong className="text-slate-900">{employeeToDelete.fullName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Bộ phận:</span>
                  <span className="text-slate-800">{employeeToDelete.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Chức danh:</span>
                  <span className="text-slate-800">{employeeToDelete.jobTitle}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEmployeeToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteEmployee(employeeToDelete.id);
                  setEmployeeToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Đồng ý xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
