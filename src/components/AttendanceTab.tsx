import React, { useState, useEffect, useMemo } from 'react';
import { CompanyConfig, Employee, SeasonalWorker, TeamWorker } from '../types';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import {
  Calendar,
  Check,
  Save,
  RotateCcw,
  Users,
  Filter,
  Eraser,
  AlertCircle,
  CheckCircle2,
  X,
  HardHat,
  Plus,
  Minus,
  CheckSquare,
  Square,
  Sparkles,
  Clock,
  Briefcase,
  Building,
} from 'lucide-react';
import { MonthYearPicker } from './MonthYearPicker';

interface AttendanceTabProps {
  employees: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onBatchUpdate: (updated: Employee[]) => void;
  onBatchUpdateSeasonal?: (updated: SeasonalWorker[]) => void;
  onBatchUpdateTeam?: (updated: TeamWorker[]) => void;
  onGoToEmployeeList?: () => void;
  onGoToSeasonalAttendance?: () => void;
  seasonalCount?: number;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  employees,
  seasonalWorkers = [],
  teamWorkers = [],
  config,
  onChangeMonthYear,
  onBatchUpdate,
  onBatchUpdateSeasonal,
  onBatchUpdateTeam,
  onGoToEmployeeList,
  onGoToSeasonalAttendance,
  seasonalCount = 12,
}) => {
  const [attendanceGroup, setAttendanceGroup] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('PERMANENT');
  const [modifiedEmployees, setModifiedEmployees] = useState<Employee[]>(employees);
  const [modifiedSeasonal, setModifiedSeasonal] = useState<SeasonalWorker[]>(seasonalWorkers);
  const [modifiedTeam, setModifiedTeam] = useState<TeamWorker[]>(teamWorkers);
  const [onlySelected, setOnlySelected] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    actionLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bộ đệm chuỗi nhập liệu tạm thời để việc gõ phím, xóa backspace, gõ số thập phân 25.5 không bị giật hoặc reset về 0
  const [localInputs, setLocalInputs] = useState<
    Record<
      string,
      {
        actualWorkDays?: string;
        overtimeHours?: string;
        paidLeaveDays?: string;
        unpaidLeaveDays?: string;
      }
    >
  >({});

  const [lastSavedCode, setLastSavedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    setModifiedEmployees(employees);
  }, [employees]);

  useEffect(() => {
    setModifiedSeasonal(seasonalWorkers);
  }, [seasonalWorkers]);

  useEffect(() => {
    setModifiedTeam(teamWorkers);
  }, [teamWorkers]);

  // Cập nhật số ngày công thực tế cho NV Chính thức
  const handleWorkDaysChange = (code: string, newDays: number) => {
    const validDays = Math.max(0, Math.min(31, Number(newDays) || 0));
    const updated = modifiedEmployees.map((emp) => {
      if (emp.code === code) {
        const item = { ...emp, actualWorkDays: validDays };
        return recomputeEmployeePayroll(item);
      }
      return emp;
    });
    setModifiedEmployees(updated);
    onBatchUpdate(updated);
    setLastSavedCode(code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Cập nhật công cho Thời vụ
  const handleSeasonalWorkDaysChange = (code: string, newDays: number) => {
    const validDays = Math.max(0, Math.min(31, Number(newDays) || 0));
    const updated = modifiedSeasonal.map((w) => {
      if (w.code === code) {
        const salaryByDays = Math.round(validDays * (w.dailyRate || 0));
        const totalIncome = salaryByDays + (w.overtimePay || 0) + (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0);
        const pit = w.hasTaxCommitment ? 0 : Math.round(totalIncome * 0.1);
        const totalDeductions = pit + (w.advancePayment || 0);
        const netSalary = Math.max(0, totalIncome - totalDeductions);
        return {
          ...w,
          actualWorkDays: validDays,
          salaryByDays,
          totalIncome,
          personalIncomeTax: pit,
          totalDeductions,
          netSalary,
        };
      }
      return w;
    });
    setModifiedSeasonal(updated);
    if (onBatchUpdateSeasonal) onBatchUpdateSeasonal(updated);
    setLastSavedCode(code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Cập nhật công cho Tổ đội
  const handleTeamWorkDaysChange = (code: string, newDays: number) => {
    const validDays = Math.max(0, Math.min(31, Number(newDays) || 0));
    const updated = modifiedTeam.map((t) => {
      if (t.code === code) {
        const salaryByDays = Math.round(validDays * (t.unitRate || 0));
        const totalIncome = salaryByDays + (t.overtimePay || 0) + (t.mealAllowance || 0) + (t.otherBonus || 0);
        const totalDeductions = t.advancePayment || 0;
        const netSalary = Math.max(0, totalIncome - totalDeductions);
        return {
          ...t,
          actualWorkDays: validDays,
          salaryByDays,
          totalIncome,
          totalDeductions,
          netSalary,
        };
      }
      return t;
    });
    setModifiedTeam(updated);
    if (onBatchUpdateTeam) onBatchUpdateTeam(updated);
    setLastSavedCode(code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Tăng giảm nhanh số ngày công (+/- 0.5 công)
  const handleStepWorkDays = (code: string, delta: number) => {
    if (attendanceGroup === 'PERMANENT') {
      const current = modifiedEmployees.find((e) => e.code === code)?.actualWorkDays || 0;
      const nextVal = Math.max(0, Math.min(31, Number((current + delta).toFixed(1))));
      setLocalInputs((prev) => {
        const next = { ...prev };
        if (next[code]) delete next[code].actualWorkDays;
        return next;
      });
      handleWorkDaysChange(code, nextVal);
    } else if (attendanceGroup === 'SEASONAL') {
      const current = modifiedSeasonal.find((w) => w.code === code)?.actualWorkDays || 0;
      const nextVal = Math.max(0, Math.min(31, Number((current + delta).toFixed(1))));
      handleSeasonalWorkDaysChange(code, nextVal);
    } else {
      const current = modifiedTeam.find((t) => t.code === code)?.actualWorkDays || 0;
      const nextVal = Math.max(0, Math.min(31, Number((current + delta).toFixed(1))));
      handleTeamWorkDaysChange(code, nextVal);
    }
  };

  // Cập nhật giờ tăng ca OT
  const handleOtChange = (code: string, hours: number) => {
    const validOT = Math.max(0, Math.min(200, Number(hours) || 0));
    if (attendanceGroup === 'PERMANENT') {
      const updated = modifiedEmployees.map((emp) => {
        if (emp.code === code) {
          const item = { ...emp, overtimeHours: validOT };
          return recomputeEmployeePayroll(item);
        }
        return emp;
      });
      setModifiedEmployees(updated);
      onBatchUpdate(updated);
    } else if (attendanceGroup === 'SEASONAL') {
      const updated = modifiedSeasonal.map((w) => {
        if (w.code === code) {
          const hourlyRate = (w.dailyRate || 0) / 8;
          const otPay = Math.round(hourlyRate * validOT * 1.5);
          const totalIncome = (w.salaryByDays || 0) + otPay + (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0);
          const pit = w.hasTaxCommitment ? 0 : Math.round(totalIncome * 0.1);
          const netSalary = Math.max(0, totalIncome - pit - (w.advancePayment || 0));
          return {
            ...w,
            overtimeHours: validOT,
            overtimePay: otPay,
            totalIncome,
            personalIncomeTax: pit,
            netSalary,
          };
        }
        return w;
      });
      setModifiedSeasonal(updated);
      if (onBatchUpdateSeasonal) onBatchUpdateSeasonal(updated);
    } else {
      const updated = modifiedTeam.map((t) => {
        if (t.code === code) {
          const hourlyRate = (t.unitRate || 0) / 8;
          const otPay = Math.round(hourlyRate * validOT * 1.5);
          const totalIncome = (t.salaryByDays || 0) + otPay + (t.mealAllowance || 0) + (t.otherBonus || 0);
          const netSalary = Math.max(0, totalIncome - (t.advancePayment || 0));
          return {
            ...t,
            overtimeHours: validOT,
            overtimePay: otPay,
            totalIncome,
            netSalary,
          };
        }
        return t;
      });
      setModifiedTeam(updated);
      if (onBatchUpdateTeam) onBatchUpdateTeam(updated);
    }
    setLastSavedCode(code);
    setTimeout(() => setLastSavedCode(null), 1500);
  };

  // Tăng giảm nhanh giờ tăng ca OT (+/- 1h)
  const handleStepOT = (code: string, delta: number) => {
    let current = 0;
    if (attendanceGroup === 'PERMANENT') {
      current = modifiedEmployees.find((e) => e.code === code)?.overtimeHours || 0;
    } else if (attendanceGroup === 'SEASONAL') {
      current = modifiedSeasonal.find((w) => w.code === code)?.overtimeHours || 0;
    } else {
      current = modifiedTeam.find((t) => t.code === code)?.overtimeHours || 0;
    }
    const nextVal = Math.max(0, Math.min(200, current + delta));
    setLocalInputs((prev) => {
      const next = { ...prev };
      if (next[code]) delete next[code].overtimeHours;
      return next;
    });
    handleOtChange(code, nextVal);
  };

  // Cập nhật số ngày nghỉ phép có hưởng lương
  const handlePaidLeaveChange = (code: string, days: number) => {
    const validDays = Math.max(0, Math.min(31, Number(days) || 0));
    const updated = modifiedEmployees.map((emp) => {
      if (emp.code === code) {
        const item = { ...emp, paidLeaveDays: validDays };
        return recomputeEmployeePayroll(item);
      }
      return emp;
    });
    setModifiedEmployees(updated);
    onBatchUpdate(updated);
  };

  // Cập nhật số ngày nghỉ không lương
  const handleUnpaidLeaveChange = (code: string, days: number) => {
    const validDays = Math.max(0, Math.min(31, Number(days) || 0));
    const updated = modifiedEmployees.map((emp) => {
      if (emp.code === code) {
        const item = { ...emp, unpaidLeaveDays: validDays };
        return recomputeEmployeePayroll(item);
      }
      return emp;
    });
    setModifiedEmployees(updated);
    onBatchUpdate(updated);
  };

  // Bật/tắt chọn nhân viên vào bảng chấm công
  const handleToggleSelectAttendance = (code: string) => {
    const updated = modifiedEmployees.map((emp) => {
      if (emp.code === code) {
        const isCurrent = emp.selectedForAttendance !== false;
        return { ...emp, selectedForAttendance: !isCurrent };
      }
      return emp;
    });
    setModifiedEmployees(updated);
    onBatchUpdate(updated);
  };

  // Đặt công chuẩn cho toàn bộ danh sách
  const handleFillFullWorkDays = () => {
    const std = config.standardWorkDays || 26;
    setConfirmModal({
      title: 'Xác nhận đặt công chuẩn',
      message: `Đặt công thực tế bằng công chuẩn (${std} ngày) cho toàn bộ nhân viên được chọn chấm công?`,
      actionLabel: 'Đặt công chuẩn',
      onConfirm: () => {
        const updated = modifiedEmployees.map((emp) => {
          if (onlySelected && emp.selectedForAttendance === false) return emp;
          return recomputeEmployeePayroll({ ...emp, actualWorkDays: std, unpaidLeaveDays: 0 });
        });
        setLocalInputs({});
        setModifiedEmployees(updated);
        onBatchUpdate(updated);
        setToastMessage(`Đã đặt công chuẩn (${std} ngày) cho toàn bộ nhân viên!`);
      },
    });
  };

  // Xóa trắng toàn bộ để nhập mới
  const handleClearAttendance = () => {
    setConfirmModal({
      title: 'Xác nhận xóa trắng chấm công',
      message: 'Bạn có chắc muốn để trống Công thực tế và Giờ OT để nhập mới từ đầu cho kỳ này?',
      actionLabel: 'Xóa trắng',
      onConfirm: () => {
        const updated = modifiedEmployees.map((emp) => {
          if (onlySelected && emp.selectedForAttendance === false) return emp;
          return recomputeEmployeePayroll({
            ...emp,
            actualWorkDays: 0,
            overtimeHours: 0,
            paidLeaveDays: 0,
            unpaidLeaveDays: 0,
          });
        });
        setLocalInputs({});
        setModifiedEmployees(updated);
        onBatchUpdate(updated);
        setToastMessage('Đã xóa trắng công thực tế và OT để nhập mới!');
      },
    });
  };

  // Lưu và đồng bộ
  const handleSaveAttendance = () => {
    onBatchUpdate(modifiedEmployees);
    setToastMessage('Đã lưu & đồng bộ toàn bộ bảng chấm công và tính lại bảng lương!');
  };

  const monthFormatted = (config.month || 9) < 10 ? `0${config.month || 9}` : config.month;
  const yearFormatted = config.year || 2026;

  // Danh sách hiển thị
  const displayedEmployees = useMemo(() => {
    const list = !onlySelected
      ? modifiedEmployees
      : modifiedEmployees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED');
    return [...list].sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [modifiedEmployees, onlySelected]);

  const selectedCount = modifiedEmployees.filter((e) => e.selectedForAttendance !== false && e.status !== 'RESIGNED').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
      {/* Bộ chuyển đổi 3 nhóm nhân sự chấm công */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="tab-att-permanent"
            onClick={() => setAttendanceGroup('PERMANENT')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-xs ${
              attendanceGroup === 'PERMANENT'
                ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Users className={`w-4 h-4 ${attendanceGroup === 'PERMANENT' ? 'text-sky-300' : 'text-slate-500'}`} />
            <span>1. Nhân Viên Chính Thức</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              attendanceGroup === 'PERMANENT' ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {modifiedEmployees.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-att-seasonal"
            onClick={() => setAttendanceGroup('SEASONAL')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-xs ${
              attendanceGroup === 'SEASONAL'
                ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <HardHat className={`w-4 h-4 ${attendanceGroup === 'SEASONAL' ? 'text-amber-200' : 'text-slate-500'}`} />
            <span>2. Nhân Lực Thời Vụ</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              attendanceGroup === 'SEASONAL' ? 'bg-slate-900 text-amber-300' : 'bg-slate-200 text-slate-700'
            }`}>
              {modifiedSeasonal.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-att-team"
            onClick={() => setAttendanceGroup('TEAM')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer shadow-xs ${
              attendanceGroup === 'TEAM'
                ? 'bg-indigo-700 text-white shadow-md font-black ring-2 ring-indigo-700/20'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Building className={`w-4 h-4 ${attendanceGroup === 'TEAM' ? 'text-indigo-200' : 'text-slate-500'}`} />
            <span>3. Nhân Viên Tổ Đội</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              attendanceGroup === 'TEAM' ? 'bg-indigo-950 text-indigo-200' : 'bg-slate-200 text-slate-700'
            }`}>
              {modifiedTeam.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-slate-600 font-medium px-2 hidden sm:block">
          {attendanceGroup === 'PERMANENT' && 'Chấm công nhân sự văn phòng & kỹ sư cơ hữu'}
          {attendanceGroup === 'SEASONAL' && 'Chấm công thợ kỹ thuật theo ngày & công trình'}
          {attendanceGroup === 'TEAM' && 'Chấm công đội khoán & thợ tổ thi công'}
        </div>
      </div>

      {/* Banner phân loại & liên kết bảng chấm công */}
      <div className="bg-gradient-to-r from-sky-50 via-slate-50 to-sky-50/50 border border-sky-200/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#0f3d64] text-white rounded-lg shadow-xs">
            <Calendar className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                BẢNG CHẤM CÔNG THÁNG {monthFormatted}/{yearFormatted}
              </h2>
              <span className="px-2 py-0.5 bg-sky-100 text-sky-900 border border-sky-300 font-bold rounded-full text-[10px]">
                {attendanceGroup === 'PERMANENT' && `Nhân viên chính thức (${selectedCount}/${modifiedEmployees.length})`}
                {attendanceGroup === 'SEASONAL' && `Nhân lực thời vụ (${modifiedSeasonal.length} thợ)`}
                {attendanceGroup === 'TEAM' && `Nhân viên tổ đội (${modifiedTeam.length} tổ)`}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ghi nhận ngày công thực tế, giờ tăng ca OT và ngày nghỉ để tự động tính chính xác lương
            </p>
          </div>
        </div>

        {/* Nút chuyển nhanh sang chấm công Thợ thời vụ (nếu người dùng cần chấm công thời vụ) */}
        {onGoToSeasonalAttendance && (
          <button
            type="button"
            id="btn-switch-to-seasonal-attendance"
            onClick={onGoToSeasonalAttendance}
            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="Chuyển sang Chấm công theo tuần / công trình cho Nhân lực thời vụ"
          >
            <HardHat className="w-4 h-4 text-amber-600" />
            <span>Xem chi tiết Tuần Thợ Thời Vụ →</span>
          </button>
        )}
      </div>

      {/* Thanh công cụ điều khiển kỳ & tác vụ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Bộ chọn tháng năm */}
          <MonthYearPicker
            month={config.month || 9}
            year={config.year || 2026}
            onChange={onChangeMonthYear}
            label="Kỳ chấm công:"
          />

          {/* Lọc chỉ hiện nhân viên chọn chấm công */}
          <button
            type="button"
            onClick={() => setOnlySelected(!onlySelected)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
              onlySelected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-2xs'
                : 'bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{onlySelected ? `Chỉ hiện NV chấm công (${selectedCount})` : `Hiện tất cả nhân sự (${modifiedEmployees.length})`}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onGoToEmployeeList && (
            <button
              type="button"
              onClick={onGoToEmployeeList}
              className="px-2.5 py-1.5 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Quản lý nhân sự trong Danh sách nhân viên"
            >
              <Users className="w-3.5 h-3.5 text-sky-700" />
              <span>Quản lý hồ sơ nhân viên</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClearAttendance}
            className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            title="Đặt lại 0 công và 0 OT để nhập mới"
          >
            <Eraser className="w-3.5 h-3.5 text-amber-700" />
            <span>Xóa trắng nhập mới</span>
          </button>

          <button
            type="button"
            onClick={handleFillFullWorkDays}
            className="px-3 py-1.5 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
            title="Chấm đủ công chuẩn (26 ngày) cho tất cả nhân viên"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
            <span>Chấm đủ công tất cả ({config.standardWorkDays || 26} công)</span>
          </button>

          <button
            onClick={handleSaveAttendance}
            className="px-4 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Save className="w-3.5 h-3.5 text-amber-300" />
            <span>Lưu & Đồng bộ bảng lương</span>
          </button>
        </div>
      </div>

      {/* Bảng chấm công chi tiết theo từng nhóm */}
      <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[660px] text-xs shadow-xs">
        {attendanceGroup === 'PERMANENT' && (
        <table className="w-full border-collapse text-left whitespace-nowrap">
          <thead className="bg-[#0f3d64] text-white sticky top-0 z-20 text-[11px] select-none">
            <tr>
              <th className="p-2.5 border-r border-sky-800 text-center w-12 font-bold">STT</th>
              <th className="p-2.5 border-r border-sky-800 text-center w-16 font-bold bg-[#144d7d]" title="Tích chọn để tính vào bảng lương">
                Chấm công
              </th>
              <th className="p-2.5 border-r border-sky-800 text-center w-20 font-bold">Mã NV</th>
              <th className="p-2.5 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30 min-w-[170px] font-bold">
                Họ và tên
              </th>
              <th className="p-2.5 border-r border-sky-800 min-w-[120px]">Bộ phận</th>
              <th className="p-2.5 border-r border-sky-800 text-center w-28">
                <div>Hình thức lương</div>
                <div className="text-[9px] text-amber-200 font-normal">Tháng / Ngày</div>
              </th>
              <th className="p-2.5 border-r border-sky-800 text-center w-20">Công chuẩn</th>
              <th className="p-2.5 border-r border-sky-800 text-center min-w-[180px] bg-[#144d7d]">
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
              <th className="p-2.5 border-r border-sky-800 text-center w-24">Nghỉ không lương</th>
              <th className="p-2.5 text-right min-w-[140px] bg-[#144d7d] font-bold">
                <div>Lương theo công</div>
                <div className="text-[9px] text-amber-200 font-normal">Thực nhận theo ngày công</div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-[12px]">
            {displayedEmployees.map((emp, index) => {
              const isSelectedForAttendance = emp.selectedForAttendance !== false;
              const stdDays = emp.standardWorkDays || config.standardWorkDays || 26;

              // Lấy giá trị chuỗi nhập liệu tạm thời (nếu người dùng đang gõ)
              const rawDaysValue =
                localInputs[emp.code]?.actualWorkDays !== undefined
                  ? localInputs[emp.code]?.actualWorkDays
                  : emp.actualWorkDays !== undefined
                  ? String(emp.actualWorkDays)
                  : '';

              const rawOtValue =
                localInputs[emp.code]?.overtimeHours !== undefined
                  ? localInputs[emp.code]?.overtimeHours
                  : emp.overtimeHours !== undefined
                  ? String(emp.overtimeHours)
                  : '';

              const rawPaidLeaveValue =
                localInputs[emp.code]?.paidLeaveDays !== undefined
                  ? localInputs[emp.code]?.paidLeaveDays
                  : emp.paidLeaveDays !== undefined
                  ? String(emp.paidLeaveDays)
                  : '';

              const rawUnpaidLeaveValue =
                localInputs[emp.code]?.unpaidLeaveDays !== undefined
                  ? localInputs[emp.code]?.unpaidLeaveDays
                  : emp.unpaidLeaveDays !== undefined
                  ? String(emp.unpaidLeaveDays)
                  : '';

              const isRecentlySaved = lastSavedCode === emp.code;

              return (
                <tr
                  key={emp.code}
                  className={`hover:bg-sky-50/60 transition-colors ${
                    !isSelectedForAttendance ? 'bg-slate-50/70 opacity-60' : ''
                  }`}
                >
                  {/* STT */}
                  <td className="p-2 border-r border-slate-200 text-center text-slate-500 font-mono">
                    {index + 1}
                  </td>

                  {/* Checkbox Chấm công */}
                  <td className="p-2 border-r border-slate-200 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAttendance(emp.code)}
                      className="cursor-pointer inline-flex items-center justify-center p-1 rounded hover:bg-slate-200/60 transition"
                      title={isSelectedForAttendance ? 'Đang chọn chấm công. Nhấn để bỏ chọn.' : 'Đã bỏ chọn. Nhấn để chọn chấm công.'}
                    >
                      {isSelectedForAttendance ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </td>

                  {/* Mã NV */}
                  <td className="p-2 border-r border-slate-200 font-mono font-bold text-[#0f3d64] text-center">
                    {emp.code}
                  </td>

                  {/* Họ và tên (Cố định cột trái khi scroll) */}
                  <td className="p-2 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 font-bold text-slate-900 z-10">
                    <div className="flex items-center justify-between gap-2">
                      <span>{emp.fullName}</span>
                      {isRecentlySaved && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded font-bold animate-in fade-in">
                          ✓ Đã lưu
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Bộ phận */}
                  <td className="p-2 border-r border-slate-200 text-slate-600">
                    {emp.department}
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

                  {/* Công chuẩn */}
                  <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-700 font-mono">
                    {stdDays}
                  </td>

                  {/* ========================================================================= */}
                  {/* CÔNG THỰC TẾ: Hỗ trợ gõ trực tiếp, xóa backspace không bị snap về 0, */}
                  {/* hỗ trợ số thập phân 25.5, kèm stepper - / + và nút chấm đủ công */}
                  {/* ========================================================================= */}
                  <td className="p-1.5 border-r border-slate-200 text-center bg-sky-50/40">
                    <div className="flex items-center justify-center gap-1">
                      {/* Nút giảm 0.5 công */}
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(emp.code, -0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition active:scale-95"
                        title="Giảm 0.5 ngày công"
                      >
                        -
                      </button>

                      {/* Ô nhập ngày công dạng text để gõ mượt mà 100%, không bị trình duyệt xóa khi gõ dấu chấm */}
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={rawDaysValue}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          // Cho phép nhập số và tối đa 1 dấu chấm thập phân
                          if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                            setLocalInputs((prev) => ({
                              ...prev,
                              [emp.code]: {
                                ...(prev[emp.code] || {}),
                                actualWorkDays: valStr,
                              },
                            }));

                            // Nếu là số hợp lệ, cập nhật tức thời
                            if (valStr !== '' && !valStr.endsWith('.')) {
                              const parsed = parseFloat(valStr);
                              if (!isNaN(parsed) && parsed >= 0 && parsed <= 31) {
                                handleWorkDaysChange(emp.code, parsed);
                              }
                            }
                          }
                        }}
                        onBlur={() => {
                          const currentStr = localInputs[emp.code]?.actualWorkDays;
                          if (currentStr !== undefined) {
                            const parsed = parseFloat(currentStr);
                            const finalDays = isNaN(parsed) ? 0 : Math.max(0, Math.min(31, parsed));
                            handleWorkDaysChange(emp.code, finalDays);
                            // Xóa bộ đệm sau khi blur để hiển thị số chuẩn
                            setLocalInputs((prev) => {
                              const next = { ...prev };
                              if (next[emp.code]) {
                                delete next[emp.code].actualWorkDays;
                              }
                              return next;
                            });
                          }
                        }}
                        className="w-14 px-1.5 py-1 border border-sky-400 focus:border-sky-600 focus:ring-1 focus:ring-sky-500 rounded text-center font-mono font-black text-xs text-slate-900 bg-white shadow-2xs"
                        title="Nhập số ngày công làm việc (VD: 26, 25.5, 24)"
                      />

                      {/* Nút tăng 0.5 công */}
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(emp.code, 0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition active:scale-95"
                        title="Tăng 0.5 ngày công"
                      >
                        +
                      </button>

                      {/* Nút chấm nhanh đủ công chuẩn (26) */}
                      <button
                        type="button"
                        onClick={() => handleWorkDaysChange(emp.code, stdDays)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 cursor-pointer transition"
                        title={`Đặt nhanh đủ công chuẩn (${stdDays} ngày)`}
                      >
                        Đủ {stdDays}
                      </button>
                    </div>
                  </td>

                  {/* GIỜ TĂNG CA (OT) */}
                  <td className="p-1.5 border-r border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepOT(emp.code, -1)}
                        className="w-4.5 h-5.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black flex items-center justify-center cursor-pointer transition"
                        title="Giảm 1 giờ OT"
                      >
                        -
                      </button>

                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        value={rawOtValue}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                            setLocalInputs((prev) => ({
                              ...prev,
                              [emp.code]: {
                                ...(prev[emp.code] || {}),
                                overtimeHours: valStr,
                              },
                            }));
                            if (valStr !== '' && !valStr.endsWith('.')) {
                              const parsed = parseFloat(valStr);
                              if (!isNaN(parsed) && parsed >= 0) {
                                handleOtChange(emp.code, parsed);
                              }
                            }
                          }
                        }}
                        onBlur={() => {
                          const currentStr = localInputs[emp.code]?.overtimeHours;
                          if (currentStr !== undefined) {
                            const parsed = parseFloat(currentStr);
                            const finalOT = isNaN(parsed) ? 0 : Math.max(0, parsed);
                            handleOtChange(emp.code, finalOT);
                            setLocalInputs((prev) => {
                              const next = { ...prev };
                              if (next[emp.code]) delete next[emp.code].overtimeHours;
                              return next;
                            });
                          }
                        }}
                        className="w-11 px-1 py-0.5 border border-slate-300 focus:border-sky-500 rounded text-center font-mono font-bold text-xs text-amber-900 bg-white"
                        title="Nhập giờ làm thêm OT"
                      />

                      <button
                        type="button"
                        onClick={() => handleStepOT(emp.code, 1)}
                        className="w-4.5 h-5.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-black flex items-center justify-center cursor-pointer transition"
                        title="Tăng 1 giờ OT"
                      >
                        +
                      </button>
                      <span className="text-[10px] text-slate-400">h</span>
                    </div>
                  </td>

                  {/* Tiền làm thêm giờ (1.5x) */}
                  <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-amber-900 bg-amber-50/20">
                    {(emp.overtimePay || 0) > 0 ? (
                      `${new Intl.NumberFormat('vi-VN').format(emp.overtimePay)} đ`
                    ) : (
                      <span className="text-slate-400 font-normal">—</span>
                    )}
                  </td>

                  {/* Nghỉ phép có lương */}
                  <td className="p-1.5 border-r border-slate-200 text-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={rawPaidLeaveValue}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                          setLocalInputs((prev) => ({
                            ...prev,
                            [emp.code]: {
                              ...(prev[emp.code] || {}),
                              paidLeaveDays: valStr,
                            },
                          }));
                          if (valStr !== '' && !valStr.endsWith('.')) {
                            const parsed = parseFloat(valStr);
                            if (!isNaN(parsed)) handlePaidLeaveChange(emp.code, parsed);
                          }
                        }
                      }}
                      onBlur={() => {
                        const currentStr = localInputs[emp.code]?.paidLeaveDays;
                        if (currentStr !== undefined) {
                          const parsed = parseFloat(currentStr);
                          handlePaidLeaveChange(emp.code, isNaN(parsed) ? 0 : Math.max(0, parsed));
                          setLocalInputs((prev) => {
                            const next = { ...prev };
                            if (next[emp.code]) delete next[emp.code].paidLeaveDays;
                            return next;
                          });
                        }
                      }}
                      className="w-11 px-1 py-0.5 border border-slate-200 hover:border-slate-400 rounded text-center font-mono font-medium text-xs text-slate-700 bg-white"
                      title="Số ngày nghỉ phép hưởng nguyên lương"
                    />
                  </td>

                  {/* Nghỉ không lương */}
                  <td className="p-1.5 border-r border-slate-200 text-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={rawUnpaidLeaveValue}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (/^[0-9]*\.?[0-9]*$/.test(valStr)) {
                          setLocalInputs((prev) => ({
                            ...prev,
                            [emp.code]: {
                              ...(prev[emp.code] || {}),
                              unpaidLeaveDays: valStr,
                            },
                          }));
                          if (valStr !== '' && !valStr.endsWith('.')) {
                            const parsed = parseFloat(valStr);
                            if (!isNaN(parsed)) handleUnpaidLeaveChange(emp.code, parsed);
                          }
                        }
                      }}
                      onBlur={() => {
                        const currentStr = localInputs[emp.code]?.unpaidLeaveDays;
                        if (currentStr !== undefined) {
                          const parsed = parseFloat(currentStr);
                          handleUnpaidLeaveChange(emp.code, isNaN(parsed) ? 0 : Math.max(0, parsed));
                          setLocalInputs((prev) => {
                            const next = { ...prev };
                            if (next[emp.code]) delete next[emp.code].unpaidLeaveDays;
                            return next;
                          });
                        }
                      }}
                      className="w-11 px-1 py-0.5 border border-slate-200 hover:border-slate-400 rounded text-center font-mono font-medium text-xs text-slate-700 bg-white"
                      title="Số ngày nghỉ không lương"
                    />
                  </td>

                  {/* Lương theo công */}
                  <td className="p-2 text-right font-mono font-bold text-[#0f3d64]">
                    {emp.actualWorkDays === 0 ? (
                      <span className="text-slate-400 font-normal italic text-[11px]">Chưa nhập công (0đ)</span>
                    ) : (
                      <div>
                        <div>{new Intl.NumberFormat('vi-VN').format(emp.salaryByActualDays)} đ</div>
                        <div className="text-[9px] text-slate-500 font-normal">
                          {emp.salaryType === 'DAILY' ? '(Đơn giá × công)' : '(=Lương/26 × công)'}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}

        {/* BẢNG CHẤM CÔNG NHÂN LỰC THỜI VỤ */}
        {attendanceGroup === 'SEASONAL' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-amber-700 text-white sticky top-0 z-20 text-[11px] select-none">
              <tr>
                <th className="p-2.5 border-r border-amber-800 text-center w-12 font-bold">STT</th>
                <th className="p-2.5 border-r border-amber-800 text-center w-20 font-bold">Mã thợ</th>
                <th className="p-2.5 border-r border-amber-800 sticky left-0 bg-amber-700 z-30 min-w-[170px] font-bold">
                  Họ tên thợ kỹ thuật
                </th>
                <th className="p-2.5 border-r border-amber-800 min-w-[130px]">Nghề & Tay nghề</th>
                <th className="p-2.5 border-r border-amber-800 min-w-[150px]">Dự án thi công</th>
                <th className="p-2.5 border-r border-amber-800 text-right w-28">Đơn giá ngày</th>
                <th className="p-2.5 border-r border-amber-800 text-center min-w-[180px] bg-amber-800">
                  <div className="font-bold text-amber-200">Công thực tế *</div>
                  <div className="text-[9px] text-amber-200/80 font-normal">Nhập số hoặc bấm +/-</div>
                </th>
                <th className="p-2.5 border-r border-amber-800 text-center min-w-[130px]">
                  <div>Tăng ca (OT)</div>
                  <div className="text-[9px] text-amber-200/80 font-normal">Hệ số 150%</div>
                </th>
                <th className="p-2.5 border-r border-amber-800 text-right w-28">Phụ cấp ăn ca</th>
                <th className="p-2.5 border-r border-amber-800 text-right w-24">Tạm ứng</th>
                <th className="p-2.5 text-right min-w-[130px] bg-amber-800 font-bold">
                  <div>Thực nhận kỳ này</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[12px]">
              {modifiedSeasonal.map((w, index) => (
                <tr key={w.id} className="hover:bg-amber-50/50 transition-colors">
                  <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">
                    {index + 1}
                  </td>
                  <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-amber-900">
                    {w.code}
                  </td>
                  <td className="p-2 border-r border-slate-200 sticky left-0 bg-white z-10 font-bold text-slate-900 shadow-xs">
                    <div>{w.fullName}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{w.phone || 'SĐT: Chưa có'}</div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-slate-700">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      {w.trade}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">{w.skillLevel}</div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-slate-700">
                    <span className="font-medium text-slate-800">{w.project || 'Toàn dự án'}</span>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                    {new Intl.NumberFormat('vi-VN').format(w.dailyRate || 0)} đ
                  </td>
                  <td className="p-1.5 border-r border-slate-200 text-center bg-amber-50/40">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(w.code, -0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="31"
                        value={w.actualWorkDays || 0}
                        onChange={(e) => handleSeasonalWorkDaysChange(w.code, parseFloat(e.target.value) || 0)}
                        className="w-14 px-1 py-1 border border-amber-400 focus:border-amber-600 rounded text-center font-mono font-black text-xs text-slate-900 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(w.code, 0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSeasonalWorkDaysChange(w.code, 26)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 cursor-pointer"
                      >
                        26c
                      </button>
                    </div>
                  </td>
                  <td className="p-1.5 border-r border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepOT(w.code, -1)}
                        className="w-4 h-5 rounded bg-slate-200 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-amber-900">{w.overtimeHours || 0}h</span>
                      <button
                        type="button"
                        onClick={() => handleStepOT(w.code, 1)}
                        className="w-4 h-5 rounded bg-amber-200 text-xs font-bold text-amber-900"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                    {new Intl.NumberFormat('vi-VN').format(w.mealAllowance || 0)} đ
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-600">
                    {(w.advancePayment || 0) > 0 ? `-${new Intl.NumberFormat('vi-VN').format(w.advancePayment)} đ` : '0 đ'}
                  </td>
                  <td className="p-2 text-right font-mono font-black text-amber-900 bg-amber-50/50">
                    {new Intl.NumberFormat('vi-VN').format(w.netSalary || 0)} đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* BẢNG CHẤM CÔNG NHÂN VIÊN TỔ ĐỘI */}
        {attendanceGroup === 'TEAM' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-indigo-800 text-white sticky top-0 z-20 text-[11px] select-none">
              <tr>
                <th className="p-2.5 border-r border-indigo-900 text-center w-12 font-bold">STT</th>
                <th className="p-2.5 border-r border-indigo-900 text-center w-20 font-bold">Mã tổ</th>
                <th className="p-2.5 border-r border-indigo-900 sticky left-0 bg-indigo-800 z-30 min-w-[180px] font-bold">
                  Tên tổ đội thi công
                </th>
                <th className="p-2.5 border-r border-indigo-900 min-w-[140px]">Đội trưởng & SĐT</th>
                <th className="p-2.5 border-r border-indigo-900 min-w-[150px]">Dự án phụ trách</th>
                <th className="p-2.5 border-r border-indigo-900 text-center w-20">Quân số</th>
                <th className="p-2.5 border-r border-indigo-900 text-right w-28">Đơn giá ngày/khoán</th>
                <th className="p-2.5 border-r border-indigo-900 text-center min-w-[180px] bg-indigo-900">
                  <div className="font-bold text-amber-200">Công thực tế *</div>
                  <div className="text-[9px] text-indigo-200 font-normal">Nhập số hoặc bấm +/-</div>
                </th>
                <th className="p-2.5 border-r border-indigo-900 text-center min-w-[130px]">
                  <div>Tăng ca (OT)</div>
                </th>
                <th className="p-2.5 border-r border-indigo-900 text-right w-28">Phụ cấp ăn ca</th>
                <th className="p-2.5 border-r border-indigo-900 text-right w-24">Tạm ứng</th>
                <th className="p-2.5 text-right min-w-[130px] bg-indigo-900 font-bold">
                  <div>Thực lĩnh tổ đội</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-[12px]">
              {modifiedTeam.map((t, index) => (
                <tr key={t.id} className="hover:bg-indigo-50/50 transition-colors">
                  <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">
                    {index + 1}
                  </td>
                  <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-indigo-900">
                    {t.code}
                  </td>
                  <td className="p-2 border-r border-slate-200 sticky left-0 bg-white z-10 font-bold text-slate-900 shadow-xs">
                    <div>{t.teamName}</div>
                    <div className="text-[10px] text-slate-500 font-normal">{t.rateType === 'PIECEWORK' ? 'Khoán khối lượng' : 'Lương ngày công'}</div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-slate-700">
                    <div className="font-medium text-slate-900">{t.leaderName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{t.phone}</div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-slate-700">
                    <span className="font-medium text-slate-800">{t.project}</span>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-center font-mono font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-black">
                      {t.workerCount || 1} thợ
                    </span>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                    {new Intl.NumberFormat('vi-VN').format(t.unitRate || 0)} đ
                  </td>
                  <td className="p-1.5 border-r border-slate-200 text-center bg-indigo-50/40">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(t.code, -0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="31"
                        value={t.actualWorkDays || 0}
                        onChange={(e) => handleTeamWorkDaysChange(t.code, parseFloat(e.target.value) || 0)}
                        className="w-14 px-1 py-1 border border-indigo-400 focus:border-indigo-600 rounded text-center font-mono font-black text-xs text-slate-900 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => handleStepWorkDays(t.code, 0.5)}
                        className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-black flex items-center justify-center cursor-pointer transition"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTeamWorkDaysChange(t.code, 26)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-300 cursor-pointer"
                      >
                        26c
                      </button>
                    </div>
                  </td>
                  <td className="p-1.5 border-r border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepOT(t.code, -1)}
                        className="w-4 h-5 rounded bg-slate-200 text-xs font-bold"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-indigo-900">{t.overtimeHours || 0}h</span>
                      <button
                        type="button"
                        onClick={() => handleStepOT(t.code, 1)}
                        className="w-4 h-5 rounded bg-indigo-200 text-xs font-bold text-indigo-900"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                    {new Intl.NumberFormat('vi-VN').format(t.mealAllowance || 0)} đ
                  </td>
                  <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-600">
                    {(t.advancePayment || 0) > 0 ? `-${new Intl.NumberFormat('vi-VN').format(t.advancePayment)} đ` : '0 đ'}
                  </td>
                  <td className="p-2 text-right font-mono font-black text-indigo-900 bg-indigo-50/50">
                    {new Intl.NumberFormat('vi-VN').format(t.netSalary || 0)} đ
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-sky-50 border-b border-sky-200 p-4 flex items-center gap-3 text-sky-950">
              <div className="p-2 bg-sky-100 rounded-full shrink-0">
                <AlertCircle className="w-5 h-5 text-sky-700" />
              </div>
              <h3 className="font-bold text-sm uppercase">{confirmModal.title}</h3>
            </div>
            <div className="p-5 text-xs text-slate-700">
              <p>{confirmModal.message}</p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#0f3d64] hover:bg-[#1a5b94] rounded-lg shadow-sm transition cursor-pointer"
              >
                {confirmModal.actionLabel || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
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
    </div>
  );
};
