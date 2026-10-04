import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Search,
  Plus,
  Filter,
  Edit3,
  Trash2,
  History,
  Users,
  AlertCircle,
  Calendar,
  Layers,
  HardHat,
  Building,
  TrendingUp,
  DollarSign,
  Clock,
  Sparkles,
} from 'lucide-react';
import { CompanyConfig, Employee, SeasonalWorker, TeamWorker } from '../types';
import { formatNumberOnly, formatVND } from '../utils/numberToVietnameseWords';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import { MonthYearPicker } from './MonthYearPicker';

interface PayrollTableTabProps {
  employees: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
}

export const PayrollTableTab: React.FC<PayrollTableTabProps> = ({
  employees,
  seasonalWorkers = [],
  teamWorkers = [],
  config,
  onChangeMonthYear,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
}) => {
  // Chu kỳ ghi nhận lương: Theo Tuần, Theo Tháng, Theo Quý, Theo Năm
  const [periodCycle, setPeriodCycle] = useState<'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'>('MONTH');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.ceil((config.month || 9) / 3));

  // Nhóm nhân sự: Tất cả, Chính thức, Thời vụ, Tổ đội
  const [workerCategory, setWorkerCategory] = useState<'ALL' | 'PERMANENT' | 'SEASONAL' | 'TEAM'>('PERMANENT');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [attendanceOnly, setAttendanceOnly] = useState(true);
  const [salaryTypeFilter, setSalaryTypeFilter] = useState<'ALL' | 'MONTHLY' | 'DAILY'>('ALL');
  const [showResignedHistory, setShowResignedHistory] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Hệ số tính toán theo chu kỳ
  const cycleMultiplier = useMemo(() => {
    switch (periodCycle) {
      case 'WEEK':
        return 0.25;
      case 'MONTH':
        return 1.0;
      case 'QUARTER':
        return 3.0;
      case 'YEAR':
        return 12.0;
    }
  }, [periodCycle]);

  // Dữ liệu thời vụ theo chu kỳ
  const scaledSeasonal = useMemo(() => {
    const mult = cycleMultiplier;
    return seasonalWorkers
      .filter((w) => {
        const term = searchTerm.toLowerCase();
        return (
          !term ||
          w.fullName.toLowerCase().includes(term) ||
          w.code.toLowerCase().includes(term) ||
          (w.project && w.project.toLowerCase().includes(term))
        );
      })
      .map((w) => {
        const actualDays = Number(((w.actualWorkDays || 0) * mult).toFixed(1));
        const rate = w.dailyRate || 0;
        const salaryByDays = Math.round(rate * actualDays);
        const otHours = Number(((w.overtimeHours || 0) * mult).toFixed(1));
        const otPay = Math.round(otHours * (rate / 8) * 1.5);
        const allowances = Math.round(
          ((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0)) * mult
        );
        const totalIncome = salaryByDays + otPay + allowances;
        const advance = Math.round((w.advancePayment || 0) * mult);
        const tax = Math.round((w.personalIncomeTax || 0) * mult);
        const deductions = advance + tax;
        const netSalary = Math.max(0, totalIncome - deductions);
        return {
          ...w,
          actualWorkDays: actualDays,
          salaryByDays,
          overtimeHours: otHours,
          overtimePay: otPay,
          totalIncome,
          advancePayment: advance,
          personalIncomeTax: tax,
          totalDeductions: deductions,
          netSalary,
        };
      });
  }, [seasonalWorkers, cycleMultiplier, searchTerm]);

  // Dữ liệu tổ đội theo chu kỳ
  const scaledTeam = useMemo(() => {
    const mult = cycleMultiplier;
    return teamWorkers
      .filter((t) => {
        const term = searchTerm.toLowerCase();
        return (
          !term ||
          t.teamName.toLowerCase().includes(term) ||
          t.leaderName.toLowerCase().includes(term) ||
          t.code.toLowerCase().includes(term) ||
          (t.project && t.project.toLowerCase().includes(term))
        );
      })
      .map((t) => {
        const actualDays = Number(((t.actualWorkDays || 0) * mult).toFixed(1));
        const rate = t.unitRate || 0;
        const salaryByDays = Math.round(rate * actualDays);
        const otHours = Number(((t.overtimeHours || 0) * mult).toFixed(1));
        const otPay = Math.round(otHours * (rate / 8) * 1.5);
        const allowances = Math.round(((t.mealAllowance || 0) + (t.otherBonus || 0)) * mult);
        const totalIncome = salaryByDays + otPay + allowances;
        const advance = Math.round((t.advancePayment || 0) * mult);
        const deductions = advance + (t.totalDeductions ? Math.round(t.totalDeductions * mult) : 0);
        const netSalary = Math.max(0, totalIncome - deductions);
        return {
          ...t,
          actualWorkDays: actualDays,
          salaryByDays,
          overtimeHours: otHours,
          overtimePay: otPay,
          totalIncome,
          advancePayment: advance,
          totalDeductions: deductions,
          netSalary,
        };
      });
  }, [teamWorkers, cycleMultiplier, searchTerm]);

  // Phân tách nhân viên đang làm việc và nhân viên đã nghỉ
  const activeEmployees = useMemo(
    () => employees.filter((e) => (e.status || 'ACTIVE') !== 'RESIGNED'),
    [employees]
  );
  const resignedEmployees = useMemo(
    () => employees.filter((e) => e.status === 'RESIGNED'),
    [employees]
  );

  const departments = useMemo(() => {
    const list = showResignedHistory ? resignedEmployees : activeEmployees;
    return Array.from(new Set(list.map((e) => e.department)));
  }, [activeEmployees, resignedEmployees, showResignedHistory]);

  const monthlyCount = useMemo(
    () => activeEmployees.filter((e) => e.salaryType !== 'DAILY').length,
    [activeEmployees]
  );
  const dailyCount = useMemo(
    () => activeEmployees.filter((e) => e.salaryType === 'DAILY').length,
    [activeEmployees]
  );

  // Danh sách dòng bảng lương nhân viên chính thức thích ứng theo chu kỳ
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const isResigned = e.status === 'RESIGNED';
      if (!showResignedHistory) {
        if (isResigned) return false;
        if (attendanceOnly && e.selectedForAttendance === false) return false;
      } else {
        if (!isResigned) return false;
      }

      if (salaryTypeFilter === 'MONTHLY' && e.salaryType === 'DAILY') return false;
      if (salaryTypeFilter === 'DAILY' && e.salaryType !== 'DAILY') return false;

      const matchDept = selectedDept === 'ALL' || e.department === selectedDept;
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !term ||
        e.fullName.toLowerCase().includes(term) ||
        e.code.toLowerCase().includes(term) ||
        e.title.toLowerCase().includes(term);
      return matchDept && matchSearch;
    }).map((emp) => {
      // Scale số liệu theo chu kỳ
      const mult = cycleMultiplier;
      const scaledActualDays = Number((emp.actualWorkDays * mult).toFixed(1));
      const scaledStdDays = Number(((emp.standardWorkDays || 26) * mult).toFixed(1));
      const scaledBase = Math.round(emp.baseSalary * mult);
      const scaledSalaryByDays = Math.round(emp.salaryByActualDays * mult);
      const scaledOT = Math.round((emp.overtimePay || 0) * mult);
      const scaledAllowances = Math.round(
        ((emp.responsibilityAllowance || 0) +
          (emp.projectAllowance || 0) +
          (emp.mealAllowance || 0) +
          (emp.phoneTravelAllowance || 0) +
          (emp.kpiBonus || 0)) *
          mult
      );
      // Thưởng tháng 13 nếu xem theo năm
      const yearBonus = periodCycle === 'YEAR' ? emp.baseSalary : 0;
      const scaledTotalIncome = scaledSalaryByDays + scaledOT + scaledAllowances + yearBonus;
      const scaledInsurance = Math.round((emp.totalInsurance || 0) * mult);
      const scaledTax = Math.round((emp.personalIncomeTax || 0) * mult);
      const scaledAdvance = Math.round((emp.advancePayment || 0) * mult);
      const scaledDeductions = scaledInsurance + scaledTax + scaledAdvance + Math.round((emp.unionFee || 0) * mult);
      const scaledNet = Math.max(0, scaledTotalIncome - scaledDeductions);

      return {
        ...emp,
        actualWorkDays: scaledActualDays,
        standardWorkDays: scaledStdDays,
        baseSalary: scaledBase,
        salaryByActualDays: scaledSalaryByDays,
        overtimePay: scaledOT,
        totalIncome: scaledTotalIncome,
        totalInsurance: scaledInsurance,
        personalIncomeTax: scaledTax,
        advancePayment: scaledAdvance,
        totalDeductions: scaledDeductions,
        netSalary: scaledNet,
      };
    }).sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [employees, selectedDept, searchTerm, attendanceOnly, salaryTypeFilter, showResignedHistory, cycleMultiplier, periodCycle]);

  const filtered = filteredEmployees;

  // Export to Excel .xlsx
  const handleExportExcel = () => {
    const cycleSuffix =
      periodCycle === 'WEEK'
        ? `Tuan${selectedWeek}`
        : periodCycle === 'QUARTER'
        ? `Quy${selectedQuarter}`
        : periodCycle === 'YEAR'
        ? `Nam${config.year || 2026}`
        : config.periodCode.replace('/', '_');

    if (workerCategory === 'SEASONAL') {
      const rows = scaledSeasonal.map((w, index) => ({
        'STT': index + 1,
        'Chu kỳ': periodCycle === 'WEEK' ? `Tuần ${selectedWeek}` : periodCycle === 'QUARTER' ? `Quý ${selectedQuarter}` : periodCycle === 'YEAR' ? `Năm ${config.year || 2026}` : config.periodCode,
        'Mã thợ': w.code,
        'Họ và tên': w.fullName,
        'Ngành nghề': w.trade,
        'Bậc thợ': w.skillLevel,
        'Dự án/Công trình': w.project,
        'Đơn giá ngày': w.dailyRate,
        'Ngày công thực tế': w.actualWorkDays,
        'Lương theo ngày công': w.salaryByDays,
        'Giờ tăng ca (OT)': w.overtimeHours,
        'Tiền tăng ca': w.overtimePay,
        'Phụ cấp & Thưởng': (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0),
        'TỔNG THU NHẬP': w.totalIncome,
        'Tạm ứng': w.advancePayment,
        'Thuế TNCN': w.personalIncomeTax,
        'TỔNG KHẤU TRỪ': w.totalDeductions,
        'THỰC LĨNH': w.netSalary,
        'Số tài khoản': w.bankAccount,
        'Ngân hàng': w.bankName,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'NhanLucThoiVu');
      XLSX.writeFile(wb, `BangLuong_ThoiVu_${cycleSuffix}_${config.name.replace(/\s+/g, '_')}.xlsx`);
      return;
    }

    if (workerCategory === 'TEAM') {
      const rows = scaledTeam.map((t, index) => ({
        'STT': index + 1,
        'Chu kỳ': periodCycle === 'WEEK' ? `Tuần ${selectedWeek}` : periodCycle === 'QUARTER' ? `Quý ${selectedQuarter}` : periodCycle === 'YEAR' ? `Năm ${config.year || 2026}` : config.periodCode,
        'Mã tổ đội': t.code,
        'Tên tổ đội': t.teamName,
        'Đội trưởng': t.leaderName,
        'Số điện thoại': t.phone,
        'Dự án': t.project,
        'Quân số (người)': t.workerCount,
        'Đơn giá khoán/ngày': t.unitRate,
        'Ngày công/Khối lượng': t.actualWorkDays,
        'Lương theo công/khoán': t.salaryByDays,
        'Tiền tăng ca': t.overtimePay,
        'Phụ cấp & Thưởng': (t.mealAllowance || 0) + (t.otherBonus || 0),
        'TỔNG THU NHẬP': t.totalIncome,
        'Tạm ứng': t.advancePayment,
        'TỔNG KHẤU TRỪ': t.totalDeductions,
        'THỰC LĨNH': t.netSalary,
        'Số tài khoản': t.bankAccount,
        'Ngân hàng': t.bankName,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'NhanVienToDoi');
      XLSX.writeFile(wb, `BangLuong_ToDoi_${cycleSuffix}_${config.name.replace(/\s+/g, '_')}.xlsx`);
      return;
    }

    if (workerCategory === 'ALL') {
      const wb = XLSX.utils.book_new();
      const empRows = filtered.map((e, index) => ({
        'STT': index + 1,
        'Mã NV': e.code,
        'Họ và tên': e.fullName,
        'Chức danh': e.title,
        'Bộ phận': e.department,
        'Công thực tế': e.actualWorkDays,
        'TỔNG THU NHẬP': e.totalIncome,
        'Tạm ứng': e.advancePayment,
        'THỰC LĨNH': e.netSalary,
      }));
      const seaRows = scaledSeasonal.map((w, index) => ({
        'STT': index + 1,
        'Mã thợ': w.code,
        'Họ và tên': w.fullName,
        'Ngành nghề': w.trade,
        'Dự án': w.project,
        'Công thực tế': w.actualWorkDays,
        'TỔNG THU NHẬP': w.totalIncome,
        'Tạm ứng': w.advancePayment,
        'THỰC LĨNH': w.netSalary,
      }));
      const teamRows = scaledTeam.map((t, index) => ({
        'STT': index + 1,
        'Mã tổ đội': t.code,
        'Tên tổ đội': t.teamName,
        'Đội trưởng': t.leaderName,
        'Dự án': t.project,
        'Công thực tế': t.actualWorkDays,
        'TỔNG THU NHẬP': t.totalIncome,
        'Tạm ứng': t.advancePayment,
        'THỰC LĨNH': t.netSalary,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), 'ChinhThuc');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seaRows), 'ThoiVu');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'ToDoi');
      XLSX.writeFile(wb, `BangLuong_TongHop3Nhom_${cycleSuffix}_${config.name.replace(/\s+/g, '_')}.xlsx`);
      return;
    }

    const rows = filtered.map((e, index) => ({
      'STT': index + 1,
      'Chu kỳ': periodCycle === 'WEEK' ? `Tuần ${selectedWeek}` : periodCycle === 'QUARTER' ? `Quý ${selectedQuarter}` : periodCycle === 'YEAR' ? `Năm ${config.year || 2026}` : config.periodCode,
      'Mã NV': e.code,
      'Họ và tên': e.fullName,
      'Chức danh': e.title,
      'Bộ phận': e.department,
      'Hình thức tính lương': e.salaryType === 'DAILY' ? 'Theo ngày công' : 'Lương tháng (chia 26)',
      'Lương CB': e.baseSalary,
      'Công chuẩn': e.standardWorkDays,
      'Công thực tế': e.actualWorkDays,
      'Lương thực tế theo công': e.salaryByActualDays,
      'Tiền tăng ca (OT)': e.overtimePay,
      'TỔNG THU NHẬP': e.totalIncome,
      'BHXH (10.5%)': e.totalInsurance,
      'Thuế TNCN': e.personalIncomeTax,
      'Tạm ứng': e.advancePayment,
      'TỔNG KHẤU TRỪ': e.totalDeductions,
      'THỰC LĨNH': e.netSalary,
      'Số tài khoản': e.bankAccount,
      'Ngân hàng': e.bankName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, showResignedHistory ? 'LichSuLuongNghiViec' : 'BangLuong');
    const prefix = showResignedHistory ? 'LichSuLuong_NhanVienNghiViec' : 'BangLuong';
    XLSX.writeFile(workbook, `${prefix}_${cycleSuffix}_${config.name.replace(/\s+/g, '_')}.xlsx`);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
      {/* 4 Chế độ chu kỳ lương: Theo Tuần, Theo Tháng, Theo Quý, Theo Năm */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-slate-100 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-1">Chu kỳ lương:</span>
          <button
            type="button"
            id="cycle-week"
            onClick={() => setPeriodCycle('WEEK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              periodCycle === 'WEEK'
                ? 'bg-[#0f3d64] text-white shadow-xs font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Theo Tuần (Tuần {selectedWeek})</span>
          </button>
          <button
            type="button"
            id="cycle-month"
            onClick={() => setPeriodCycle('MONTH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              periodCycle === 'MONTH'
                ? 'bg-[#0f3d64] text-white shadow-xs font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Theo Tháng ({config.periodCode})</span>
          </button>
          <button
            type="button"
            id="cycle-quarter"
            onClick={() => setPeriodCycle('QUARTER')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              periodCycle === 'QUARTER'
                ? 'bg-[#0f3d64] text-white shadow-xs font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Theo Quý (Quý {selectedQuarter})</span>
          </button>
          <button
            type="button"
            id="cycle-year"
            onClick={() => setPeriodCycle('YEAR')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              periodCycle === 'YEAR'
                ? 'bg-[#0f3d64] text-white shadow-xs font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Theo Năm ({config.year || 2026})</span>
          </button>
        </div>

        {/* Lựa chọn tuần hoặc quý cụ thể */}
        {periodCycle === 'WEEK' && (
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-slate-600">Chọn tuần:</span>
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setSelectedWeek(w)}
                className={`w-7 h-7 rounded font-bold text-xs cursor-pointer transition ${
                  selectedWeek === w ? 'bg-sky-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300'
                }`}
              >
                T{w}
              </button>
            ))}
          </div>
        )}

        {periodCycle === 'QUARTER' && (
          <div className="flex items-center gap-1 text-xs">
            <span className="font-semibold text-slate-600">Chọn quý:</span>
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setSelectedQuarter(q)}
                className={`px-2 py-1 rounded font-bold text-xs cursor-pointer transition ${
                  selectedQuarter === q ? 'bg-sky-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-300'
                }`}
              >
                Quý {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3 Nhóm nhân sự: Chính thức, Thời vụ, Tổ đội, Tổng hợp */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            id="cat-permanent"
            onClick={() => setWorkerCategory('PERMANENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              workerCategory === 'PERMANENT'
                ? 'bg-[#0f3d64] text-white shadow-xs font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>1. Nhân Viên Chính Thức</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${workerCategory === 'PERMANENT' ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {employees.length}
            </span>
          </button>
          <button
            type="button"
            id="cat-seasonal"
            onClick={() => setWorkerCategory('SEASONAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              workerCategory === 'SEASONAL'
                ? 'bg-amber-600 text-white shadow-xs font-black ring-2 ring-amber-600/20'
                : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-200'
            }`}
          >
            <HardHat className="w-3.5 h-3.5" />
            <span>2. Nhân Lực Thời Vụ</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${workerCategory === 'SEASONAL' ? 'bg-slate-900 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
              {seasonalWorkers.length}
            </span>
          </button>
          <button
            type="button"
            id="cat-team"
            onClick={() => setWorkerCategory('TEAM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              workerCategory === 'TEAM'
                ? 'bg-indigo-700 text-white shadow-xs font-black ring-2 ring-indigo-700/20'
                : 'bg-white text-slate-700 hover:bg-indigo-50 border border-slate-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>3. Nhân Viên Tổ Đội</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${workerCategory === 'TEAM' ? 'bg-indigo-950 text-indigo-200' : 'bg-slate-200 text-slate-700'}`}>
              {teamWorkers.length}
            </span>
          </button>
          <button
            type="button"
            id="cat-all"
            onClick={() => setWorkerCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              workerCategory === 'ALL'
                ? 'bg-slate-800 text-white shadow-xs font-black ring-2 ring-slate-800/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Tổng Hợp 3 Nhóm</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${workerCategory === 'ALL' ? 'bg-slate-950 text-emerald-400' : 'bg-slate-200 text-slate-700'}`}>
              {employees.length + seasonalWorkers.length + teamWorkers.length}
            </span>
          </button>
        </div>
      </div>

      {/* Top Filter & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            {showResignedHistory ? 'Hồ sơ lưu trữ lịch sử lương nhân viên đã nghỉ' : 'Bảng lương chi tiết'} — {periodCycle === 'WEEK' ? `Tuần ${selectedWeek} (Tháng ${config.periodCode})` : periodCycle === 'QUARTER' ? `Quý ${selectedQuarter} Năm ${config.year || 2026}` : periodCycle === 'YEAR' ? `Cả Năm ${config.year || 2026}` : config.period}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            ({filtered.length} {showResignedHistory ? 'nhân sự đã thôi việc' : 'nhân viên đang làm việc'})
          </span>

          {/* Month & Year Picker Text Box */}
          {periodCycle === 'MONTH' && (
            <MonthYearPicker
              month={config.month || 9}
              year={config.year || 2026}
              onChange={onChangeMonthYear}
              label="Chọn kỳ xem lương:"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chế độ xem: Bảng lương chính vs Lịch sử nhân viên đã nghỉ */}
          <div className="flex items-center rounded border border-slate-300 p-0.5 bg-slate-100 text-xs font-semibold">
            <button
              type="button"
              id="btn-payroll-active"
              onClick={() => setShowResignedHistory(false)}
              className={`px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                !showResignedHistory ? 'bg-white text-[#0f3d64] shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Đang làm việc ({activeEmployees.length})</span>
            </button>
            {resignedEmployees.length > 0 && (
              <button
                type="button"
                id="btn-payroll-resigned-history"
                onClick={() => setShowResignedHistory(true)}
                className={`px-2.5 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                  showResignedHistory ? 'bg-rose-700 text-white shadow-xs font-bold' : 'text-rose-800 hover:bg-rose-50'
                }`}
                title="Xem lại lịch sử bảng lương lúc trước của nhân viên đã thôi việc"
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch sử đã nghỉ ({resignedEmployees.length})</span>
              </button>
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded w-44 focus:outline-sky-600"
            />
          </div>

          {/* Lọc theo hình thức lương */}
          <div className="flex items-center rounded border border-slate-300 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('ALL')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tất cả ({showResignedHistory ? resignedEmployees.length : activeEmployees.length})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('MONTHLY')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'MONTHLY' ? 'bg-sky-100 text-[#0f3d64] shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lương tháng ({monthlyCount})
            </button>
            <button
              type="button"
              onClick={() => setSalaryTypeFilter('DAILY')}
              className={`px-2 py-0.5 rounded cursor-pointer transition ${
                salaryTypeFilter === 'DAILY' ? 'bg-amber-100 text-amber-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lương ngày ({dailyCount})
            </button>
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-2.5 py-1 text-xs border border-slate-300 rounded text-slate-700 bg-white"
          >
            <option value="ALL">Tất cả bộ phận</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {!showResignedHistory && (
            <button
              type="button"
              onClick={() => setAttendanceOnly(!attendanceOnly)}
              className={`px-2.5 py-1 text-xs rounded border font-semibold flex items-center gap-1 transition cursor-pointer ${
                attendanceOnly
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{attendanceOnly ? 'Chỉ hiện NV tính lương' : 'Hiện tất cả'}</span>
            </button>
          )}

          <button
            id="btn-export-excel"
            onClick={handleExportExcel}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Cảnh báo chế độ xem Lịch sử lương của nhân viên đã thôi việc */}
      {showResignedHistory && (
        <div className="bg-rose-50 border border-rose-300 p-3 rounded-lg flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-rose-900">
            <History className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <div className="font-bold uppercase tracking-wide flex items-center gap-2">
                <span>Hồ sơ lưu trữ lịch sử lương nhân viên đã thôi việc ({filtered.length} nhân sự)</span>
                <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-bold text-[10px]">LƯU TRỮ LỊCH SỬ</span>
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5">
                Bảng này chỉ lưu lại thông tin ngày công, tiền lương và phụ cấp trước đây của nhân viên đã thôi việc nhằm phục vụ tra cứu, đối soát quyết toán và giải quyết chế độ. Các nhân sự này không có trong bảng lương phát hành kỳ hiện tại.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowResignedHistory(false)}
            className="px-3 py-1 bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 rounded text-xs font-bold transition cursor-pointer shrink-0"
          >
            Về bảng lương đang làm việc
          </button>
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="border border-slate-200 rounded overflow-x-auto max-h-[620px] relative text-[11px]">
        {workerCategory === 'PERMANENT' && (
        <table className="w-full border-collapse text-left whitespace-nowrap">
          <thead className="bg-[#0f3d64] text-white sticky top-0 z-20">
            <tr>
              <th className="p-2 border-r border-sky-800 text-center w-10">STT</th>
              <th className="p-2 border-r border-sky-800">Mã NV</th>
              <th className="p-2 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30">Họ và tên</th>
              <th className="p-2 border-r border-sky-800">Chức danh</th>
              <th className="p-2 border-r border-sky-800">Bộ phận</th>
              <th className="p-2 border-r border-sky-800 text-right">
                <div>Lương CB / Đơn giá</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng hoặc Ngày</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-center">Công</th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>Lương theo công</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng / 26 hoặc Theo ngày</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>Tăng ca (1.5x)</div>
                <div className="text-[9px] text-amber-200 font-normal">Hệ số 150%</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>PC Trách nhiệm</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right bg-[#144d7d]">
                <div>PC Dự án</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right">PC Khác</th>
              <th className="p-2 border-r border-sky-800 text-right">Thưởng KPI</th>
              <th className="p-2 border-r border-sky-800 text-right bg-sky-900 font-bold">TỔNG THU NHẬP</th>
              <th className="p-2 border-r border-sky-800 text-center w-14 font-bold">NPT</th>
              <th className="p-2 border-r border-sky-800 text-right w-36 font-bold bg-[#144d7d]">
                <div>BHXH (10.5%)</div>
                <div className="text-[9px] text-amber-200 font-normal">(=Lương BH × 10.5%)</div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right">Tạm ứng</th>
              <th className="p-2 border-r border-sky-800 text-right">Đoàn phí</th>
              <th className="p-2 border-r border-sky-800 text-right bg-amber-900 font-bold">TỔNG KHẤU TRỪ</th>
              <th className="p-2 border-r border-sky-800 text-right bg-emerald-900 font-bold">THỰC LĨNH</th>
              <th className="p-2 border-r border-sky-800">Số tài khoản</th>
              <th className="p-2">Ngân hàng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={19} className="p-8 text-center text-slate-400">
                  {showResignedHistory
                    ? 'Chưa có nhân sự nào trong danh mục đã nghỉ việc'
                    : 'Không tìm thấy nhân viên đang làm việc phù hợp với bộ lọc'}
                </td>
              </tr>
            ) : (
              filtered.map((emp, index) => (
                <tr
                  key={emp.code}
                  className={`transition-colors ${
                    emp.status === 'RESIGNED'
                      ? 'bg-rose-50/30 hover:bg-rose-50/60'
                      : 'hover:bg-sky-50/50'
                  }`}
                >
                  <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-mono">
                    {index + 1}
                  </td>
                  <td className="p-1.5 border-r border-slate-200 font-semibold text-[#0f3d64]">
                    {emp.code}
                  </td>
                  <td className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 font-bold text-slate-900 z-10">
                    <div className="flex items-center gap-1.5">
                      <span>{emp.fullName}</span>
                      {emp.status === 'RESIGNED' && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 font-bold border border-rose-200 shrink-0">
                          Đã nghỉ
                        </span>
                      )}
                    </div>
                  </td>
                <td className="p-1.5 border-r border-slate-200 text-slate-700">{emp.title}</td>
                <td className="p-1.5 border-r border-slate-200 text-slate-600">{emp.department}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={emp.salaryType === 'DAILY' ? 'font-bold text-amber-900' : 'text-slate-800'}>
                      {formatNumberOnly(emp.baseSalary)}
                    </span>
                    {emp.salaryType === 'DAILY' ? (
                      <span
                        onClick={() => {
                          if (onUpdateEmployee) {
                            const updated = {
                              ...emp,
                              salaryType: 'MONTHLY' as const,
                              baseSalary: (emp.baseSalary || 500000) * 26,
                            };
                            onUpdateEmployee(recomputeEmployeePayroll(updated));
                          }
                        }}
                        title="Đang tính theo Đơn giá ngày công. Bấm để chuyển sang Lương tháng."
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 cursor-pointer"
                      >
                        Theo ngày
                      </span>
                    ) : (
                      <span
                        onClick={() => {
                          if (onUpdateEmployee) {
                            const updated = {
                              ...emp,
                              salaryType: 'DAILY' as const,
                              baseSalary: Math.round((emp.baseSalary || 11500000) / 26),
                            };
                            onUpdateEmployee(recomputeEmployeePayroll(updated));
                          }
                        }}
                        title="Đang tính theo Lương tháng (chia 26). Bấm để chuyển sang Đơn giá ngày."
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-sky-50 text-[#0f3d64] border border-sky-200 hover:bg-sky-100 cursor-pointer"
                      >
                        Theo tháng
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-semibold">
                  {emp.actualWorkDays}/{emp.standardWorkDays}
                </td>
                <td
                  className="p-1.5 border-r border-slate-200 text-right font-mono"
                  title={
                    emp.salaryType === 'DAILY'
                      ? `Lương ngày: = ${formatNumberOnly(emp.baseSalary)} đ/ngày × ${emp.actualWorkDays} công = ${formatNumberOnly(emp.salaryByActualDays)} đ`
                      : `Lương tháng: =ROUND(((${formatNumberOnly(emp.baseSalary)} / 26) * ${emp.actualWorkDays}), 0) = ${formatNumberOnly(emp.salaryByActualDays)} đ`
                  }
                >
                  <div className="font-bold text-slate-800">{formatNumberOnly(emp.salaryByActualDays)}</div>
                  <div className="text-[9px] text-slate-500 font-normal">
                    {emp.salaryType === 'DAILY' ? (
                      <span className="text-amber-700 font-semibold">(Đơn giá × {emp.actualWorkDays}c)</span>
                    ) : (
                      <span>(=Lương/26 × {emp.actualWorkDays}c)</span>
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold text-amber-900 bg-amber-50/20" title={`Số giờ OT: ${emp.overtimeHours || 0}h (x1.5)`}>
                  {emp.overtimePay > 0 ? formatNumberOnly(emp.overtimePay) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold text-[#0f3d64]">
                  {(emp.responsibilityAllowance || 0) > 0 ? formatNumberOnly(emp.responsibilityAllowance) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-700">
                  {(emp.projectAllowance || 0) > 0 ? formatNumberOnly(emp.projectAllowance) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {formatNumberOnly(emp.mealAllowance + emp.phoneTravelAllowance)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">{formatNumberOnly(emp.kpiBonus)}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-sky-950 bg-sky-50/70">
                  {formatNumberOnly(emp.totalIncome)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-bold text-slate-700">{emp.dependents}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono" title={`Lương đóng BH: ${formatVND(emp.insuranceSalary || 0)} (10.5% = ${formatVND(emp.totalInsurance)})`}>
                  <div className="font-bold text-rose-900">{formatNumberOnly(emp.totalInsurance)}</div>
                  <div className="text-[9px] text-slate-500 font-normal">
                    {(emp.insuranceSalary || 0) > 0 ? (
                      `(=${formatNumberOnly(emp.insuranceSalary)} × 10.5%)`
                    ) : (
                      '0'
                    )}
                  </div>
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">
                  {emp.advancePayment > 0 ? formatNumberOnly(emp.advancePayment) : '-'}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono">{formatNumberOnly(emp.unionFee)}</td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-amber-950 bg-amber-50/70">
                  {formatNumberOnly(emp.totalDeductions)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[12px]">
                  {formatNumberOnly(emp.netSalary)}
                </td>
                <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{emp.bankAccount}</td>
                <td className="p-1.5 text-slate-700 font-medium">{emp.bankName}</td>
              </tr>
            )))}
          </tbody>
          <tfoot className="bg-slate-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-400">
            <tr>
              <td colSpan={5} className="p-2 text-center uppercase tracking-wide border-r border-slate-300">
                TỔNG CỘNG ({filtered.length} NHÂN VIÊN)
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.baseSalary, 0))}
              </td>
              <td className="p-2 text-center border-r border-slate-300">-</td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.salaryByActualDays, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-semibold text-amber-900 bg-amber-50/40">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.overtimePay || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-semibold text-[#0f3d64]">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.responsibilityAllowance || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-bold text-emerald-800">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.projectAllowance || 0), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + (e.mealAllowance + e.phoneTravelAllowance), 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.kpiBonus, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-sky-900 bg-sky-100 font-black">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalIncome, 0))}
              </td>
              <td className="p-2 text-center border-r border-slate-300 font-bold text-slate-700">
                {filtered.reduce((s, e) => s + (e.dependents || 0), 0)}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono font-bold text-rose-900 bg-rose-50/40">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalInsurance, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.advancePayment, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.unionFee, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-amber-900 bg-amber-100 font-black">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalDeductions, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-emerald-900 bg-emerald-100 font-black text-[12px]">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.netSalary, 0))}
              </td>
              <td colSpan={2} className="p-2 text-center text-slate-500 font-normal">
                Chi trả chuyển khoản ngân hàng
              </td>
            </tr>
          </tfoot>
        </table>
        )}

        {/* BẢNG LƯƠNG NHÂN LỰC THỜI VỤ */}
        {workerCategory === 'SEASONAL' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-[#b45309] text-white sticky top-0 z-20">
              <tr>
                <th className="p-2 border-r border-amber-800 text-center w-10">STT</th>
                <th className="p-2 border-r border-amber-800">Mã thợ</th>
                <th className="p-2 border-r border-amber-800 sticky left-0 bg-[#b45309] z-30">Họ và tên thợ</th>
                <th className="p-2 border-r border-amber-800">Ngành nghề</th>
                <th className="p-2 border-r border-amber-800">Bậc thợ</th>
                <th className="p-2 border-r border-amber-800">Dự án thi công</th>
                <th className="p-2 border-r border-amber-800 text-right">Đơn giá ngày</th>
                <th className="p-2 border-r border-amber-800 text-center">Công TT</th>
                <th className="p-2 border-r border-amber-800 text-right bg-[#92400e]">Lương theo công</th>
                <th className="p-2 border-r border-amber-800 text-right bg-[#92400e]">Tăng ca (OT 1.5x)</th>
                <th className="p-2 border-r border-amber-800 text-right">Phụ cấp & Thưởng</th>
                <th className="p-2 border-r border-amber-800 text-right bg-amber-950 font-bold">TỔNG THU NHẬP</th>
                <th className="p-2 border-r border-amber-800 text-right">Tạm ứng</th>
                <th className="p-2 border-r border-amber-800 text-right">Thuế TNCN (10%)</th>
                <th className="p-2 border-r border-amber-800 text-right bg-rose-950 font-bold">TỔNG KHẤU TRỪ</th>
                <th className="p-2 border-r border-amber-800 text-right bg-emerald-900 font-bold">THỰC LĨNH</th>
                <th className="p-2 border-r border-amber-800">Số tài khoản</th>
                <th className="p-2">Ngân hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {scaledSeasonal.length === 0 ? (
                <tr>
                  <td colSpan={18} className="p-8 text-center text-slate-400">
                    Không có nhân lực thời vụ nào phù hợp với bộ lọc tìm kiếm
                  </td>
                </tr>
              ) : (
                scaledSeasonal.map((w, idx) => (
                  <tr key={w.code} className="hover:bg-amber-50/50 transition-colors">
                    <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 font-bold text-amber-900 font-mono">
                      {w.code}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-amber-50 font-bold text-slate-900 z-10">
                      {w.fullName}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700">{w.trade}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {w.skillLevel}
                      </span>
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700 font-medium">
                      {w.project || 'Toàn công ty'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                      {formatNumberOnly(w.dailyRate)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-bold text-sky-900 bg-sky-50/30">
                      {w.actualWorkDays}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                      {formatNumberOnly(w.salaryByDays)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-amber-900 font-semibold bg-amber-50/30">
                      {w.overtimePay > 0 ? `${formatNumberOnly(w.overtimePay)} (${w.overtimeHours}h)` : '-'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-emerald-800">
                      {formatNumberOnly((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0))}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-amber-950 bg-amber-50/60">
                      {formatNumberOnly(w.totalIncome)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                      {w.advancePayment > 0 ? formatNumberOnly(w.advancePayment) : '-'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-rose-700">
                      {w.personalIncomeTax > 0 ? formatNumberOnly(w.personalIncomeTax) : '-'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-rose-950 bg-rose-50/50">
                      {formatNumberOnly(w.totalDeductions)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[12px]">
                      {formatNumberOnly(w.netSalary)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{w.bankAccount || '-'}</td>
                    <td className="p-1.5 text-slate-700 font-medium">{w.bankName || 'Tiền mặt'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-amber-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-amber-400">
              <tr>
                <td colSpan={6} className="p-2 text-center uppercase tracking-wide border-r border-amber-300">
                  TỔNG CỘNG ({scaledSeasonal.length} THỢ THỜI VỤ)
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.dailyRate, 0))}
                </td>
                <td className="p-2 text-center border-r border-amber-300 font-mono text-sky-900">
                  {Number(scaledSeasonal.reduce((s, w) => s + w.actualWorkDays, 0).toFixed(1))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.salaryByDays, 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-amber-900">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.overtimePay, 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-emerald-800">
                  {formatNumberOnly(
                    scaledSeasonal.reduce(
                      (s, w) => s + ((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0)),
                      0
                    )
                  )}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-amber-950 bg-amber-200 font-black">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.totalIncome, 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-rose-800">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.advancePayment || 0), 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-rose-800">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.personalIncomeTax || 0), 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-rose-950 bg-rose-200 font-black">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.totalDeductions || 0), 0))}
                </td>
                <td className="p-2 text-right border-r border-amber-300 font-mono text-emerald-950 bg-emerald-200 font-black text-[12px]">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.netSalary, 0))}
                </td>
                <td colSpan={2} className="p-2 text-center text-slate-600 font-medium">
                  Chi trả chuyển khoản / Tiền mặt
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* BẢNG LƯƠNG NHÂN VIÊN TỔ ĐỘI */}
        {workerCategory === 'TEAM' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-[#4338ca] text-white sticky top-0 z-20">
              <tr>
                <th className="p-2 border-r border-indigo-700 text-center w-10">STT</th>
                <th className="p-2 border-r border-indigo-700">Mã tổ đội</th>
                <th className="p-2 border-r border-indigo-700 sticky left-0 bg-[#4338ca] z-30">Tên tổ đội</th>
                <th className="p-2 border-r border-indigo-700">Đội trưởng</th>
                <th className="p-2 border-r border-indigo-700">Số ĐT</th>
                <th className="p-2 border-r border-indigo-700">Dự án</th>
                <th className="p-2 border-r border-indigo-700 text-center">Quân số</th>
                <th className="p-2 border-r border-indigo-700 text-right">Đơn giá khoán</th>
                <th className="p-2 border-r border-indigo-700 text-center">Công / KL</th>
                <th className="p-2 border-r border-indigo-700 text-right bg-[#3730a3]">Lương khoán/công</th>
                <th className="p-2 border-r border-indigo-700 text-right bg-[#3730a3]">Tiền tăng ca</th>
                <th className="p-2 border-r border-indigo-700 text-right">Thưởng & Phụ cấp</th>
                <th className="p-2 border-r border-indigo-700 text-right bg-indigo-950 font-bold">TỔNG THU NHẬP</th>
                <th className="p-2 border-r border-indigo-700 text-right">Tạm ứng</th>
                <th className="p-2 border-r border-indigo-700 text-right bg-rose-950 font-bold">TỔNG KHẤU TRỪ</th>
                <th className="p-2 border-r border-indigo-700 text-right bg-emerald-900 font-bold">THỰC LĨNH</th>
                <th className="p-2 border-r border-indigo-700">Số tài khoản</th>
                <th className="p-2">Ngân hàng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {scaledTeam.length === 0 ? (
                <tr>
                  <td colSpan={18} className="p-8 text-center text-slate-400">
                    Không có tổ đội nào phù hợp với bộ lọc tìm kiếm
                  </td>
                </tr>
              ) : (
                scaledTeam.map((t, idx) => (
                  <tr key={t.code} className="hover:bg-indigo-50/50 transition-colors">
                    <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 font-bold text-indigo-900 font-mono">
                      {t.code}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-indigo-50 font-bold text-slate-900 z-10">
                      {t.teamName}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-800 font-semibold">{t.leaderName}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-600">{t.phone}</td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700 font-medium">
                      {t.project || 'Toàn công ty'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-bold text-indigo-800 bg-indigo-50/40">
                      {t.workerCount} người
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                      {formatNumberOnly(t.unitRate)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-bold text-sky-900">
                      {t.actualWorkDays}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                      {formatNumberOnly(t.salaryByDays)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-amber-900 font-semibold">
                      {t.overtimePay > 0 ? formatNumberOnly(t.overtimePay) : '-'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-emerald-800">
                      {formatNumberOnly((t.mealAllowance || 0) + (t.otherBonus || 0))}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-indigo-950 bg-indigo-50/60">
                      {formatNumberOnly(t.totalIncome)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                      {t.advancePayment > 0 ? formatNumberOnly(t.advancePayment) : '-'}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-rose-950 bg-rose-50/50">
                      {formatNumberOnly(t.totalDeductions)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[12px]">
                      {formatNumberOnly(t.netSalary)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">{t.bankAccount || '-'}</td>
                    <td className="p-1.5 text-slate-700 font-medium">{t.bankName || 'Chuyển khoản'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-indigo-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-indigo-400">
              <tr>
                <td colSpan={6} className="p-2 text-center uppercase tracking-wide border-r border-indigo-300">
                  TỔNG CỘNG ({scaledTeam.length} TỔ ĐỘI)
                </td>
                <td className="p-2 text-center border-r border-indigo-300 font-mono text-indigo-900">
                  {scaledTeam.reduce((s, t) => s + (t.workerCount || 1), 0)} người
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono">-</td>
                <td className="p-2 text-center border-r border-indigo-300 font-mono text-sky-900">
                  {Number(scaledTeam.reduce((s, t) => s + t.actualWorkDays, 0).toFixed(1))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.salaryByDays, 0))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-amber-900">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.overtimePay, 0))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-emerald-800">
                  {formatNumberOnly(
                    scaledTeam.reduce((s, t) => s + ((t.mealAllowance || 0) + (t.otherBonus || 0)), 0)
                  )}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-indigo-950 bg-indigo-200 font-black">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.totalIncome, 0))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-rose-800">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + (t.advancePayment || 0), 0))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-rose-950 bg-rose-200 font-black">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + (t.totalDeductions || 0), 0))}
                </td>
                <td className="p-2 text-right border-r border-indigo-300 font-mono text-emerald-950 bg-emerald-200 font-black text-[12px]">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.netSalary, 0))}
                </td>
                <td colSpan={2} className="p-2 text-center text-slate-600 font-medium">
                  Chi trả chuyển khoản tổ đội
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* BẢNG TỔNG HỢP TOÀN BỘ 3 NHÓM NHÂN SỰ */}
        {workerCategory === 'ALL' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-[#1e293b] text-white sticky top-0 z-20">
              <tr>
                <th className="p-2.5 border-r border-slate-700 text-center w-12">STT</th>
                <th className="p-2.5 border-r border-slate-700">Khối nhân sự / Phân loại</th>
                <th className="p-2.5 border-r border-slate-700 text-center">Quân số</th>
                <th className="p-2.5 border-r border-slate-700 text-center">Tổng ngày công</th>
                <th className="p-2.5 border-r border-slate-700 text-right">Lương theo công (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right">Tiền tăng ca OT (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right">Phụ cấp & Thưởng (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right bg-sky-950 font-bold">TỔNG THU NHẬP (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right text-rose-300">Tạm ứng (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right text-rose-300">BHXH & Thuế (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right bg-rose-950 font-bold">TỔNG KHẤU TRỪ (đ)</th>
                <th className="p-2.5 border-r border-slate-700 text-right bg-emerald-950 font-black text-xs">TỔNG THỰC LĨNH CHI (đ)</th>
                <th className="p-2.5 text-center">Tỷ trọng chi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {/* Dòng 1: Nhân viên chính thức */}
              <tr className="hover:bg-sky-50/60 font-medium">
                <td className="p-2 border-r border-slate-200 text-center font-bold font-mono">1</td>
                <td className="p-2 border-r border-slate-200 font-bold text-[#0f3d64] flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-600" />
                  <span>1. Nhân Viên Chính Thức (Văn phòng & Chỉ huy)</span>
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-bold text-sky-900">
                  {filtered.length} người
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-mono">
                  {Number(filtered.reduce((s, e) => s + e.actualWorkDays, 0).toFixed(1))}c
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono">
                  {formatNumberOnly(filtered.reduce((s, e) => s + e.salaryByActualDays, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-amber-900">
                  {formatNumberOnly(filtered.reduce((s, e) => s + (e.overtimePay || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-emerald-800">
                  {formatNumberOnly(
                    filtered.reduce(
                      (s, e) =>
                        s +
                        ((e.responsibilityAllowance || 0) +
                          (e.projectAllowance || 0) +
                          (e.mealAllowance || 0) +
                          (e.phoneTravelAllowance || 0) +
                          (e.kpiBonus || 0)),
                      0
                    )
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-sky-900 bg-sky-50/40">
                  {formatNumberOnly(filtered.reduce((s, e) => s + e.totalIncome, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">
                  {formatNumberOnly(filtered.reduce((s, e) => s + (e.advancePayment || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">
                  {formatNumberOnly(
                    filtered.reduce(
                      (s, e) => s + (e.totalInsurance || 0) + (e.personalIncomeTax || 0) + (e.unionFee || 0),
                      0
                    )
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-rose-900 bg-rose-50/40">
                  {formatNumberOnly(filtered.reduce((s, e) => s + e.totalDeductions, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-emerald-900 bg-emerald-50/60 text-sm">
                  {formatNumberOnly(filtered.reduce((s, e) => s + e.netSalary, 0))}
                </td>
                <td className="p-2 text-center font-bold text-sky-900">
                  {Math.round(
                    (filtered.reduce((s, e) => s + e.netSalary, 0) /
                      Math.max(
                        1,
                        filtered.reduce((s, e) => s + e.netSalary, 0) +
                          scaledSeasonal.reduce((s, w) => s + w.netSalary, 0) +
                          scaledTeam.reduce((s, t) => s + t.netSalary, 0)
                      )) *
                      100
                  )}%
                </td>
              </tr>

              {/* Dòng 2: Nhân lực thời vụ */}
              <tr className="hover:bg-amber-50/60 font-medium">
                <td className="p-2 border-r border-slate-200 text-center font-bold font-mono">2</td>
                <td className="p-2 border-r border-slate-200 font-bold text-amber-900 flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-amber-600" />
                  <span>2. Nhân Lực Thời Vụ (Công nhân kỹ thuật & thợ khoán)</span>
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-bold text-amber-900">
                  {scaledSeasonal.length} thợ
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-mono">
                  {Number(scaledSeasonal.reduce((s, w) => s + w.actualWorkDays, 0).toFixed(1))}c
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.salaryByDays, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-amber-900">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.overtimePay, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-emerald-800">
                  {formatNumberOnly(
                    scaledSeasonal.reduce(
                      (s, w) => s + ((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0)),
                      0
                    )
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-amber-900 bg-amber-50/40">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.totalIncome, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.advancePayment || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.personalIncomeTax || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-rose-900 bg-rose-50/40">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + (w.totalDeductions || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-emerald-900 bg-emerald-50/60 text-sm">
                  {formatNumberOnly(scaledSeasonal.reduce((s, w) => s + w.netSalary, 0))}
                </td>
                <td className="p-2 text-center font-bold text-amber-900">
                  {Math.round(
                    (scaledSeasonal.reduce((s, w) => s + w.netSalary, 0) /
                      Math.max(
                        1,
                        filtered.reduce((s, e) => s + e.netSalary, 0) +
                          scaledSeasonal.reduce((s, w) => s + w.netSalary, 0) +
                          scaledTeam.reduce((s, t) => s + t.netSalary, 0)
                      )) *
                      100
                  )}%
                </td>
              </tr>

              {/* Dòng 3: Nhân viên tổ đội */}
              <tr className="hover:bg-indigo-50/60 font-medium">
                <td className="p-2 border-r border-slate-200 text-center font-bold font-mono">3</td>
                <td className="p-2 border-r border-slate-200 font-bold text-indigo-900 flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span>3. Nhân Viên Tổ Đội (Các đội thi công khoán)</span>
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-bold text-indigo-900">
                  {scaledTeam.length} tổ ({scaledTeam.reduce((s, t) => s + (t.workerCount || 1), 0)} người)
                </td>
                <td className="p-2 border-r border-slate-200 text-center font-mono">
                  {Number(scaledTeam.reduce((s, t) => s + t.actualWorkDays, 0).toFixed(1))}c
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.salaryByDays, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-amber-900">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.overtimePay, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-emerald-800">
                  {formatNumberOnly(
                    scaledTeam.reduce((s, t) => s + ((t.mealAllowance || 0) + (t.otherBonus || 0)), 0)
                  )}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-indigo-900 bg-indigo-50/40">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.totalIncome, 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + (t.advancePayment || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-800">-</td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-rose-900 bg-rose-50/40">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + (t.totalDeductions || 0), 0))}
                </td>
                <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-emerald-900 bg-emerald-50/60 text-sm">
                  {formatNumberOnly(scaledTeam.reduce((s, t) => s + t.netSalary, 0))}
                </td>
                <td className="p-2 text-center font-bold text-indigo-900">
                  {Math.round(
                    (scaledTeam.reduce((s, t) => s + t.netSalary, 0) /
                      Math.max(
                        1,
                        filtered.reduce((s, e) => s + e.netSalary, 0) +
                          scaledSeasonal.reduce((s, w) => s + w.netSalary, 0) +
                          scaledTeam.reduce((s, t) => s + t.netSalary, 0)
                      )) *
                      100
                  )}%
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-slate-900 text-white font-bold sticky bottom-0 border-t-2 border-slate-700">
              <tr>
                <td colSpan={2} className="p-2.5 text-center uppercase tracking-wider text-xs">
                  TỔNG CỘNG TOÀN DOANH NGHIỆP PHÚC NGUYÊN
                </td>
                <td className="p-2.5 text-center text-amber-300 font-black">
                  {filtered.length + scaledSeasonal.length + scaledTeam.reduce((s, t) => s + (t.workerCount || 1), 0)} nhân sự
                </td>
                <td className="p-2.5 text-center font-mono">
                  {Number(
                    (
                      filtered.reduce((s, e) => s + e.actualWorkDays, 0) +
                      scaledSeasonal.reduce((s, w) => s + w.actualWorkDays, 0) +
                      scaledTeam.reduce((s, t) => s + t.actualWorkDays, 0)
                    ).toFixed(1)
                  )}c
                </td>
                <td className="p-2.5 text-right font-mono">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + e.salaryByActualDays, 0) +
                      scaledSeasonal.reduce((s, w) => s + w.salaryByDays, 0) +
                      scaledTeam.reduce((s, t) => s + t.salaryByDays, 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-amber-300">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + (e.overtimePay || 0), 0) +
                      scaledSeasonal.reduce((s, w) => s + w.overtimePay, 0) +
                      scaledTeam.reduce((s, t) => s + t.overtimePay, 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-emerald-300">
                  {formatNumberOnly(
                    filtered.reduce(
                      (s, e) =>
                        s +
                        ((e.responsibilityAllowance || 0) +
                          (e.projectAllowance || 0) +
                          (e.mealAllowance || 0) +
                          (e.phoneTravelAllowance || 0) +
                          (e.kpiBonus || 0)),
                      0
                    ) +
                      scaledSeasonal.reduce(
                        (s, w) => s + ((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0)),
                        0
                      ) +
                      scaledTeam.reduce((s, t) => s + ((t.mealAllowance || 0) + (t.otherBonus || 0)), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-sky-300 font-black">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + e.totalIncome, 0) +
                      scaledSeasonal.reduce((s, w) => s + w.totalIncome, 0) +
                      scaledTeam.reduce((s, t) => s + t.totalIncome, 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-rose-300">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + (e.advancePayment || 0), 0) +
                      scaledSeasonal.reduce((s, w) => s + (w.advancePayment || 0), 0) +
                      scaledTeam.reduce((s, t) => s + (t.advancePayment || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-rose-300">
                  {formatNumberOnly(
                    filtered.reduce(
                      (s, e) => s + (e.totalInsurance || 0) + (e.personalIncomeTax || 0) + (e.unionFee || 0),
                      0
                    ) + scaledSeasonal.reduce((s, w) => s + (w.personalIncomeTax || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-rose-300 font-black">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + e.totalDeductions, 0) +
                      scaledSeasonal.reduce((s, w) => s + (w.totalDeductions || 0), 0) +
                      scaledTeam.reduce((s, t) => s + (t.totalDeductions || 0), 0)
                  )}
                </td>
                <td className="p-2.5 text-right font-mono text-emerald-400 font-black text-sm bg-emerald-950">
                  {formatNumberOnly(
                    filtered.reduce((s, e) => s + e.netSalary, 0) +
                      scaledSeasonal.reduce((s, w) => s + w.netSalary, 0) +
                      scaledTeam.reduce((s, t) => s + t.netSalary, 0)
                  )}
                </td>
                <td className="p-2.5 text-center text-emerald-300 font-black">100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};
