import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  User,
  HardHat,
  DollarSign,
  Building,
  CalendarCheck,
  Clock,
  Zap,
  RotateCcw,
  Sparkles,
  Printer,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  CreditCard,
  Trash2,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import {
  SeasonalWorker,
  WeeklyDayAttendance,
  CompanyConfig,
  SeasonalCycleType,
  PayrollPeriodOption,
} from '../types';
import {
  recomputeSeasonalWorkerPayroll,
  getPayrollPeriods,
  getWorkerForPeriod,
  recordWorkerPeriod,
  createTimesheetForPeriod,
  createEmptyTimesheetForPeriod,
} from '../data/mockSeasonalWorkers';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import { printSeasonalWorkerReceipt } from '../utils/printPayrollReceipt';

interface SeasonalWorkerModalProps {
  isOpen: boolean;
  worker: SeasonalWorker | null; // null for creating new
  config?: CompanyConfig;
  onClose: () => void;
  onSave: (worker: SeasonalWorker) => void;
  onDelete?: (id: string) => void;
  existingCodes: string[];
  initialPeriod?: PayrollPeriodOption;
}

const MONTHS_LIST = [
  { value: 1, label: 'Tháng 01' },
  { value: 2, label: 'Tháng 02' },
  { value: 3, label: 'Tháng 03' },
  { value: 4, label: 'Tháng 04' },
  { value: 5, label: 'Tháng 05' },
  { value: 6, label: 'Tháng 06' },
  { value: 7, label: 'Tháng 07' },
  { value: 8, label: 'Tháng 08' },
  { value: 9, label: 'Tháng 09' },
  { value: 10, label: 'Tháng 10' },
  { value: 11, label: 'Tháng 11' },
  { value: 12, label: 'Tháng 12' },
];

const YEARS_LIST = [2025, 2026, 2027, 2028];

const DEFAULT_CONFIG: CompanyConfig = {
  name: 'CÔNG TY TNHH XÂY DỰNG- CƠ ĐIỆN PHÚC NGUYÊN',
  taxCode: '0314890123',
  address: 'Số 45 Đường D9, P. Tây Thạnh, Q. Tân Phú, TP. Hồ Chí Minh',
  phone: '028 3816 5588',
  period: 'Kỳ lương tháng 09 năm 2026',
  periodCode: '09/2026',
  month: 9,
  year: 2026,
  paymentDate: '05/10/2026',
  standardWorkDays: 26,
  formNumber: 'Mẫu số 02-LĐTL',
};

function getNextWorkerCode(codes: string[]): string {
  let max = 0;
  for (const c of codes) {
    const num = parseInt((c || '').replace(/\D/g, ''), 10);
    if (!isNaN(num) && num > max) {
      max = num;
    }
  }
  return `PNC-TV${String(max + 1).padStart(2, '0')}`;
}

export const SeasonalWorkerModal: React.FC<SeasonalWorkerModalProps> = ({
  isOpen,
  worker,
  config = DEFAULT_CONFIG,
  onClose,
  onSave,
  onDelete,
  existingCodes,
  initialPeriod,
}) => {
  const isEditing = !!worker;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Chế độ chấm công: 'WEEKLY_SHEET' (Lồng bảng chấm công) hoặc 'MANUAL' (Nhập số trực tiếp)
  const [attendanceMode, setAttendanceMode] = useState<'WEEKLY_SHEET' | 'MANUAL'>('WEEKLY_SHEET');

  // Tháng và Năm chấm công được chọn
  const [attendanceYear, setAttendanceYear] = useState<number>(
    initialPeriod
      ? parseInt(initialPeriod.periodKey.split('-')[0], 10)
      : worker?.attendanceYear || config.year || 2026
  );
  const [attendanceMonth, setAttendanceMonth] = useState<number>(
    initialPeriod
      ? parseInt(initialPeriod.periodKey.split('-')[1].split('_')[0], 10)
      : worker?.attendanceMonth || config.month || 9
  );

  // Chu kỳ chấm lương: 1 tuần hoặc 2 tuần
  const [cycleType, setCycleType] = useState<SeasonalCycleType>(() => {
    if (initialPeriod) return initialPeriod.cycleType;
    if (worker?.payrollCycleType) return worker.payrollCycleType;
    return '1_WEEK';
  });

  // Danh sách các kỳ thanh toán động theo Tháng, Năm và Chu kỳ
  const payrollPeriods = useMemo(() => {
    return getPayrollPeriods(attendanceYear, attendanceMonth, cycleType);
  }, [attendanceYear, attendanceMonth, cycleType]);

  // ID kỳ đang chọn
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => {
    if (initialPeriod) return initialPeriod.id;
    if (worker?.currentWeekId) return worker.currentWeekId;
    return cycleType === '1_WEEK' ? 'W2' : 'BI1';
  });

  // Kỳ đang hoạt động
  const activePeriod = useMemo(() => {
    return payrollPeriods.find((p) => p.id === selectedPeriodId) || payrollPeriods[0];
  }, [payrollPeriods, selectedPeriodId]);

  // Bảng chấm công ngày
  const [timesheet, setTimesheet] = useState<WeeklyDayAttendance[]>(() => {
    if (worker) {
      const activeWorkerState = getWorkerForPeriod(worker, activePeriod);
      return activeWorkerState.weeklyTimesheet || createEmptyTimesheetForPeriod(activePeriod);
    }
    return createTimesheetForPeriod(activePeriod, 6, 0);
  });

  // Form state
  const [form, setForm] = useState<SeasonalWorker>(() => {
    if (worker) {
      return getWorkerForPeriod(worker, activePeriod);
    }
    const defaultSheet = createTimesheetForPeriod(activePeriod, activePeriod.cycleType === '1_WEEK' ? 6 : 13, 0);
    return recomputeSeasonalWorkerPayroll({
      id: String(Date.now()),
      code: getNextWorkerCode(existingCodes),
      fullName: '',
      trade: 'Thợ điện chính M&E',
      skillLevel: 'Thợ chính (bậc 4/7)',
      project: 'Dự án Vinhomes Grand Park',
      teamName: 'Đội Thi công Cơ điện 1',
      teamLeader: 'KS. Trần Văn Minh',
      phone: '',
      idCard: '',
      bankAccount: '',
      bankName: 'Vietcombank',
      paymentMethod: 'BANK',
      joinDate: new Date().toLocaleDateString('vi-VN'),
      dailyRate: 550000,
      actualWorkDays: activePeriod.cycleType === '1_WEEK' ? 6 : 13,
      salaryByDays: 0,
      overtimeHours: 0,
      overtimePay: 0,
      mealAllowance: activePeriod.cycleType === '1_WEEK' ? 180000 : 390000,
      travelSafetyAllowance: 200000,
      otherBonus: 0,
      totalIncome: 0,
      hasTaxCommitment: true,
      personalIncomeTax: 0,
      advancePayment: 0,
      totalDeductions: 0,
      netSalary: 0,
      status: 'ACTIVE',
      notes: '',
      attendanceMonth: 9,
      attendanceYear: 2026,
      currentWeekId: activePeriod.id,
      currentWeekLabel: activePeriod.label,
      payrollCycleType: activePeriod.cycleType,
      weeklyTimesheet: defaultSheet,
    });
  });

  // Khi modal mở hoặc worker thay đổi, đồng bộ lại state
  useEffect(() => {
    if (isOpen) {
      const activeCycle = initialPeriod?.cycleType || worker?.payrollCycleType || cycleType || '1_WEEK';
      setCycleType(activeCycle);

      const yr = initialPeriod
        ? parseInt(initialPeriod.periodKey.split('-')[0], 10)
        : worker?.attendanceYear || config.year || 2026;
      const mo = initialPeriod
        ? parseInt(initialPeriod.periodKey.split('-')[1].split('_')[0], 10)
        : worker?.attendanceMonth || config.month || 9;
      setAttendanceYear(yr);
      setAttendanceMonth(mo);

      const periods = getPayrollPeriods(yr, mo, activeCycle);
      const targetPeriodId = initialPeriod?.id || worker?.currentWeekId || periods[0]?.id || 'W1';
      setSelectedPeriodId(targetPeriodId);

      const curPeriod = periods.find((p) => p.id === targetPeriodId) || periods[0];

      if (worker) {
        const workerForThisPeriod = getWorkerForPeriod(worker, curPeriod);
        setForm({ ...workerForThisPeriod });
        setTimesheet(workerForThisPeriod.weeklyTimesheet || createEmptyTimesheetForPeriod(curPeriod));
      } else {
        const defaultSheet = createTimesheetForPeriod(curPeriod, curPeriod.cycleType === '1_WEEK' ? 6 : 13, 0);
        setTimesheet(defaultSheet);
        setForm(
          recomputeSeasonalWorkerPayroll({
            id: String(Date.now()),
            code: getNextWorkerCode(existingCodes),
            fullName: '',
            trade: 'Thợ điện chính M&E',
            skillLevel: 'Thợ chính (bậc 4/7)',
            project: 'Dự án Vinhomes Grand Park',
            teamName: 'Đội Thi công Cơ điện 1',
            teamLeader: 'KS. Trần Văn Minh',
            phone: '',
            idCard: '',
            bankAccount: '',
            bankName: 'Vietcombank',
            paymentMethod: 'BANK',
            joinDate: new Date().toLocaleDateString('vi-VN'),
            dailyRate: 550000,
            actualWorkDays: curPeriod.cycleType === '1_WEEK' ? 6 : 13,
            salaryByDays: 0,
            overtimeHours: 0,
            overtimePay: 0,
            mealAllowance: curPeriod.cycleType === '1_WEEK' ? 180000 : 390000,
            travelSafetyAllowance: 200000,
            otherBonus: 0,
            totalIncome: 0,
            hasTaxCommitment: true,
            personalIncomeTax: 0,
            advancePayment: 0,
            totalDeductions: 0,
            netSalary: 0,
            status: 'ACTIVE',
            notes: '',
            attendanceMonth: mo,
            attendanceYear: yr,
            currentWeekId: curPeriod.id,
            currentWeekLabel: curPeriod.label,
            payrollCycleType: curPeriod.cycleType,
            weeklyTimesheet: defaultSheet,
          })
        );
      }
    }
  }, [worker, isOpen, existingCodes.length, config.month, config.year, initialPeriod]);

  if (!isOpen) return null;

  // Cập nhật trường chung và tính toán tức thời
  const updateField = (field: keyof SeasonalWorker, val: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: val };
      return recomputeSeasonalWorkerPayroll(updated);
    });
  };

  // Đồng bộ bảng chấm công với ngày công và OT
  const syncTimesheetToForm = (newTimesheet: WeeklyDayAttendance[]) => {
    const totalDays = newTimesheet.reduce((sum, d) => sum + (d.workUnits || 0), 0);
    const totalOT = newTimesheet.reduce((sum, d) => sum + (d.otHours || 0), 0);

    setTimesheet(newTimesheet);
    setForm((prev) => {
      const updated: SeasonalWorker = {
        ...prev,
        actualWorkDays: totalDays,
        overtimeHours: totalOT,
        weeklyTimesheet: newTimesheet,
      };
      return recomputeSeasonalWorkerPayroll(updated);
    });
  };

  // Đổi Chu kỳ: 1 tuần vs 2 tuần
  const handleCycleChange = (newCycle: SeasonalCycleType) => {
    setCycleType(newCycle);
    const newPeriods = getPayrollPeriods(attendanceYear, attendanceMonth, newCycle);
    const firstPeriod = newPeriods[0];
    setSelectedPeriodId(firstPeriod.id);

    // Chuyển chu kỳ: Nạp bản ghi của kỳ mới (hoặc reset 0 công nếu chưa có)
    const workerWithSavedCurrent = recordWorkerPeriod(form, activePeriod, {
      actualWorkDays: form.actualWorkDays,
      overtimeHours: form.overtimeHours,
      weeklyTimesheet: timesheet,
      mealAllowance: form.mealAllowance,
      travelSafetyAllowance: form.travelSafetyAllowance,
      otherBonus: form.otherBonus,
      advancePayment: form.advancePayment,
    });

    const newPeriodState = getWorkerForPeriod(workerWithSavedCurrent, firstPeriod);
    setForm(newPeriodState);
    setTimesheet(newPeriodState.weeklyTimesheet || createEmptyTimesheetForPeriod(firstPeriod));
  };

  // Thay đổi Kỳ thanh toán (Tuần hoặc Đợt 2 tuần)
  const handlePeriodChange = (newPeriodId: string) => {
    setSelectedPeriodId(newPeriodId);
    const targetPeriod = payrollPeriods.find((p) => p.id === newPeriodId) || payrollPeriods[0];

    // Lưu lại kỳ hiện tại trước khi chuyển sang kỳ mới
    const workerWithSavedCurrent = recordWorkerPeriod(form, activePeriod, {
      actualWorkDays: form.actualWorkDays,
      overtimeHours: form.overtimeHours,
      weeklyTimesheet: timesheet,
      mealAllowance: form.mealAllowance,
      travelSafetyAllowance: form.travelSafetyAllowance,
      otherBonus: form.otherBonus,
      advancePayment: form.advancePayment,
    });

    // Lấy trạng thái của kỳ mới (nếu chưa có thì MẶC ĐỊNH 0 CÔNG để người dùng chấm lại từ đầu)
    const newPeriodState = getWorkerForPeriod(workerWithSavedCurrent, targetPeriod);
    setForm(newPeriodState);
    setTimesheet(newPeriodState.weeklyTimesheet || createEmptyTimesheetForPeriod(targetPeriod));
  };

  // Thay đổi Tháng chấm công
  const handleMonthChange = (newMonth: number) => {
    setAttendanceMonth(newMonth);
    const newPeriods = getPayrollPeriods(attendanceYear, newMonth, cycleType);
    const newPeriod = newPeriods.find((p) => p.id === selectedPeriodId) || newPeriods[0];
    setSelectedPeriodId(newPeriod.id);

    const workerWithSaved = recordWorkerPeriod(form, activePeriod, {
      actualWorkDays: form.actualWorkDays,
      overtimeHours: form.overtimeHours,
      weeklyTimesheet: timesheet,
      mealAllowance: form.mealAllowance,
      travelSafetyAllowance: form.travelSafetyAllowance,
      otherBonus: form.otherBonus,
      advancePayment: form.advancePayment,
    });
    const nextState = getWorkerForPeriod(workerWithSaved, newPeriod);
    setForm(nextState);
    setTimesheet(nextState.weeklyTimesheet || createEmptyTimesheetForPeriod(newPeriod));
  };

  // Thay đổi Năm chấm công
  const handleYearChange = (newYear: number) => {
    setAttendanceYear(newYear);
    const newPeriods = getPayrollPeriods(newYear, attendanceMonth, cycleType);
    const newPeriod = newPeriods.find((p) => p.id === selectedPeriodId) || newPeriods[0];
    setSelectedPeriodId(newPeriod.id);

    const workerWithSaved = recordWorkerPeriod(form, activePeriod, {
      actualWorkDays: form.actualWorkDays,
      overtimeHours: form.overtimeHours,
      weeklyTimesheet: timesheet,
      mealAllowance: form.mealAllowance,
      travelSafetyAllowance: form.travelSafetyAllowance,
      otherBonus: form.otherBonus,
      advancePayment: form.advancePayment,
    });
    const nextState = getWorkerForPeriod(workerWithSaved, newPeriod);
    setForm(nextState);
    setTimesheet(nextState.weeklyTimesheet || createEmptyTimesheetForPeriod(newPeriod));
  };

  // Điều hướng chuyển tháng nhanh (< / >)
  const handleStepMonth = (direction: 'PREV' | 'NEXT') => {
    let nextM = direction === 'PREV' ? attendanceMonth - 1 : attendanceMonth + 1;
    let nextY = attendanceYear;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    } else if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setAttendanceYear(nextY);
    handleMonthChange(nextM);
  };

  // Thay đổi số công của 1 ngày (1.0, 0.5, 0)
  const handleDayWorkUnitsChange = (dayIndex: number, newWorkUnits: number) => {
    const updated = timesheet.map((d, idx) => {
      if (idx === dayIndex) {
        return {
          ...d,
          workUnits: newWorkUnits,
          note: newWorkUnits > 0 ? (d.otHours > 0 ? `Thi công + ${d.otHours}h OT` : 'Thi công bình thường') : 'Nghỉ ca',
        };
      }
      return d;
    });
    syncTimesheetToForm(updated);
  };

  // Thay đổi giờ tăng ca OT của 1 ngày
  const handleDayOTChange = (dayIndex: number, delta: number) => {
    const updated = timesheet.map((d, idx) => {
      if (idx === dayIndex) {
        const newOT = Math.max(0, (d.otHours || 0) + delta);
        return {
          ...d,
          otHours: newOT,
          note:
            d.workUnits > 0
              ? newOT > 0
                ? `Thi công + ${newOT}h OT`
                : 'Thi công bình thường'
              : newOT > 0
              ? `OT ca nghỉ ${newOT}h`
              : 'Nghỉ ca',
        };
      }
      return d;
    });
    syncTimesheetToForm(updated);
  };

  // Đổi ghi chú công việc trong ngày
  const handleDayNoteChange = (dayIndex: number, note: string) => {
    const updated = timesheet.map((d, idx) => (idx === dayIndex ? { ...d, note } : d));
    setTimesheet(updated);
    setForm((prev) => ({ ...prev, weeklyTimesheet: updated }));
  };

  // Chấm nhanh công cho cả kỳ (T2 - T7)
  const handleQuickFillPeriod = (workDaysCount: number) => {
    let remaining = workDaysCount;
    const updated = timesheet.map((d) => {
      const isSunday = d.dayOfWeek === 'CN';
      let wUnits = 0;
      if (!isSunday && remaining > 0) {
        wUnits = 1;
        remaining -= 1;
      }
      return {
        ...d,
        workUnits: wUnits,
        note: wUnits > 0 ? 'Thi công bình thường' : 'Nghỉ ca',
      };
    });
    syncTimesheetToForm(updated);
  };

  // Thêm OT vào các ngày làm việc
  const handleAddUniformOT = (hours: number) => {
    const updated = timesheet.map((d) => {
      if (d.workUnits > 0) {
        return {
          ...d,
          otHours: hours,
          note: `Thi công + ${hours}h OT`,
        };
      }
      return d;
    });
    syncTimesheetToForm(updated);
  };

  // Xóa / Đặt lại kỳ này về 0 công để chấm lại từ đầu
  const handleResetPeriod = () => {
    const updated = timesheet.map((d) => ({
      ...d,
      workUnits: 0,
      otHours: 0,
      note: 'Nghỉ ca',
    }));
    syncTimesheetToForm(updated);
  };

  // Tự động tính tiền ăn ca theo số ngày công thực tế (30.000đ/ngày)
  const handleAutoCalcMeal = () => {
    const autoMeal = Math.round(form.actualWorkDays * 30000);
    updateField('mealAllowance', autoMeal);
  };

  // Xử lý in phiếu thanh toán kỳ trực tiếp
  const handleDirectPrint = () => {
    const workerToPrint = recomputeSeasonalWorkerPayroll({
      ...form,
      attendanceMonth,
      attendanceYear,
      currentWeekId: activePeriod.id,
      currentWeekLabel: activePeriod.label,
      payrollCycleType: activePeriod.cycleType,
      weeklyTimesheet: timesheet,
    });
    printSeasonalWorkerReceipt(workerToPrint, config, undefined, activePeriod.label);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) {
      setErrorMessage('Vui lòng nhập họ và tên công nhân kỹ thuật!');
      return;
    }
    setErrorMessage('');

    // Lưu vào bản ghi chu kỳ tương ứng bằng recordWorkerPeriod
    const finalWorker = recordWorkerPeriod(form, activePeriod, {
      actualWorkDays: form.actualWorkDays,
      overtimeHours: form.overtimeHours,
      weeklyTimesheet: timesheet,
      mealAllowance: form.mealAllowance,
      travelSafetyAllowance: form.travelSafetyAllowance,
      otherBonus: form.otherBonus,
      advancePayment: form.advancePayment,
      hasTaxCommitment: form.hasTaxCommitment,
      notes: form.notes,
    });

    onSave(finalWorker);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Toolbar */}
        <div className="bg-gradient-to-r from-[#0f3d64] via-[#154c79] to-[#0f3d64] text-white p-4 px-6 rounded-t-xl flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-400/20 border border-amber-400/40 rounded-xl">
              <HardHat className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base leading-tight">
                  {isEditing ? `Hồ sơ công nhân: ${worker?.fullName}` : 'Thêm mới Công nhân kỹ thuật / Lao động thời vụ'}
                </h3>
                <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black rounded text-[10px] uppercase tracking-wider">
                  {cycleType === '1_WEEK' ? 'Lương 1 tuần' : 'Lương 2 tuần'}
                </span>
              </div>
              <p className="text-xs text-sky-200 mt-0.5">
                Chấm công {cycleType === '1_WEEK' ? '7 ngày' : '15 ngày'}, chọn Tháng/Năm, đơn giá ngày, tiền tăng ca OT và quyết toán thuế TNCN 10%
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* NÚT IN PHIẾU THANH TOÁN TUẦN TRỰC TIẾP */}
            <button
              type="button"
              onClick={handleDirectPrint}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="In phiếu thanh toán tiền công tuần (Mẫu 03-LĐTL)"
            >
              <Printer className="w-4 h-4 text-emerald-100" />
              <span>In phiếu thanh toán</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Nhóm 1: Thông tin nhân thân & nghề nghiệp */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5 border-b pb-1 border-slate-200">
              <User className="w-4 h-4 text-sky-700" />
              <span>1. Thông tin lý lịch & Chuyên môn kỹ thuật</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mã nhân công *</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => updateField('code', e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono font-bold text-sky-900 uppercase"
                  placeholder="PNC-TV01"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Họ và tên công nhân *</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => updateField('fullName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-bold text-slate-900"
                  placeholder="Nguyễn Văn A"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500"
                  placeholder="09xx xxx xxx"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số CCCD / CMND</label>
                <input
                  type="text"
                  value={form.idCard}
                  onChange={(e) => updateField('idCard', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono"
                  placeholder="0790xxxxxxxx"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nghề nghiệp / Vị trí tay nghề</label>
                <input
                  type="text"
                  value={form.trade}
                  onChange={(e) => updateField('trade', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-semibold text-slate-800"
                  placeholder="Thợ hàn 6G, Thợ điện M&E, Thợ PCCC..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bậc thợ / Xếp loại tay nghề</label>
                <select
                  value={form.skillLevel}
                  onChange={(e) => updateField('skillLevel', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  <option value="Thợ bậc 5/7 (Chứng chỉ 6G)">Thợ bậc 5/7 (Chứng chỉ 6G)</option>
                  <option value="Thợ bậc 4/7">Thợ bậc 4/7</option>
                  <option value="Thợ bậc 3/7">Thợ bậc 3/7</option>
                  <option value="Thợ chính">Thợ chính lành nghề</option>
                  <option value="Thợ lành nghề">Thợ lành nghề</option>
                  <option value="Thợ phụ">Thợ phụ công trình</option>
                  <option value="Kỹ thuật viên">Kỹ thuật viên bảo trì</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Chu kỳ tính lương *</span>
                  <span className="text-[10px] text-sky-700 font-normal">Thiết lập theo thợ</span>
                </label>
                <select
                  value={cycleType}
                  onChange={(e) => handleCycleChange(e.target.value as SeasonalCycleType)}
                  className="w-full px-3 py-2 border-2 border-sky-400 rounded focus:ring-2 focus:ring-sky-500 bg-sky-50/50 font-bold text-sky-950 cursor-pointer"
                >
                  <option value="1_WEEK">Lương 1 Tuần (Theo từng tuần W1 - W5)</option>
                  <option value="2_WEEKS">Lương 2 Tuần (Đợt 1: 01-15, Đợt 2: 16-cuối tháng)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Nhóm 2: Công trình & Tổ đội thi công */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5 border-b pb-1 border-slate-200">
              <Building className="w-4 h-4 text-sky-700" />
              <span>2. Công trình, Đội thi công & Trạng thái</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Công trình / Dự án</label>
                <input
                  type="text"
                  value={form.project}
                  onChange={(e) => updateField('project', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-medium"
                  placeholder="Vinhomes Grand Park, NM Dược Mekophar..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tổ / Đội thi công</label>
                <input
                  type="text"
                  value={form.teamName}
                  onChange={(e) => updateField('teamName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500"
                  placeholder="Đội Cơ điện 1, Đội Hàn..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chỉ huy / Tổ trưởng phụ trách</label>
                <input
                  type="text"
                  value={form.teamLeader}
                  onChange={(e) => updateField('teamLeader', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500"
                  placeholder="KS. Trần Văn Minh"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Trạng thái công việc</label>
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 bg-white font-semibold"
                >
                  <option value="ACTIVE">Đang thi công tại công trình</option>
                  <option value="COMPLETED">Đã hoàn thành đợt khoán</option>
                  <option value="PAUSED">Tạm ngưng công việc</option>
                </select>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* Nhóm 3: BẢNG CHẤM CÔNG & CHỌN CHU KỲ (1 TUẦN HOẶC 2 TUẦN) */}
          {/* ========================================================================= */}
          <div className="bg-gradient-to-b from-sky-50/70 to-slate-50/50 border-2 border-sky-300/80 rounded-2xl p-4.5 space-y-4 shadow-xs">
            {/* Header Mục 3: Tiêu đề & Chế độ */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-200/90 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#0f3d64] text-white rounded-xl shadow-xs">
                  <CalendarCheck className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
                      3. BẢNG CHẤM CÔNG & ĐƠN GIÁ LƯƠNG THEO CHU KỲ
                    </h4>
                    <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black rounded text-[10px] uppercase">
                      {cycleType === '1_WEEK' ? 'Lương 1 Tuần' : 'Lương 2 Tuần'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hỗ trợ chuyển đổi giữa chu kỳ 1 tuần và 2 tuần. Khi chuyển kỳ mới, số công mặc định 0 để người dùng chấm lại.
                  </p>
                </div>
              </div>

              {/* Tùy chọn chuyển đổi chế độ */}
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-300 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setAttendanceMode('WEEKLY_SHEET')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    attendanceMode === 'WEEKLY_SHEET'
                      ? 'bg-[#0f3d64] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Bảng chấm công chi tiết</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceMode('MANUAL')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    attendanceMode === 'MANUAL'
                      ? 'bg-[#0f3d64] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Nhập số công trực tiếp</span>
                </button>
              </div>
            </div>

            {/* BẢNG CHẤM CÔNG CHI TIẾT THEO CHU KỲ */}
            {attendanceMode === 'WEEKLY_SHEET' && (
              <div className="bg-white border border-sky-300 rounded-xl p-4 shadow-sm space-y-4">
                {/* THANH ĐIỀU HÀNH THÁNG & NĂM & CHU KỲ */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-sky-50/50 to-slate-50 p-3 rounded-xl border border-slate-200">
                  {/* BỘ CHỌN THÁNG VÀ NĂM */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleStepMonth('PREV')}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                        title="Tháng trước"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      {/* Chọn Tháng */}
                      <div className="flex items-center gap-1 px-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                        <select
                          value={attendanceMonth}
                          onChange={(e) => handleMonthChange(parseInt(e.target.value, 10))}
                          className="bg-transparent font-black text-slate-800 text-xs py-1 pr-1 border-none focus:ring-0 cursor-pointer"
                        >
                          {MONTHS_LIST.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Chọn Năm */}
                      <span className="text-slate-300">/</span>
                      <select
                        value={attendanceYear}
                        onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                        className="bg-transparent font-black text-slate-800 text-xs py-1 pl-1 pr-2 border-none focus:ring-0 cursor-pointer font-mono"
                      >
                        {YEARS_LIST.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleStepMonth('NEXT')}
                        className="p-1.5 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition cursor-pointer"
                        title="Tháng sau"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* NÚT CHUYỂN CHU KỲ (1 TUẦN / 2 TUẦN) */}
                    <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-300 text-xs shadow-2xs">
                      <span className="text-[11px] font-bold text-slate-600 px-2 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-sky-700" />
                        <span>Chu kỳ:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCycleChange('1_WEEK')}
                        className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                          cycleType === '1_WEEK'
                            ? 'bg-[#0f3d64] text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Lương 1 Tuần
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCycleChange('2_WEEKS')}
                        className={`px-2.5 py-1 rounded font-bold text-xs transition cursor-pointer ${
                          cycleType === '2_WEEKS'
                            ? 'bg-[#0f3d64] text-white shadow-xs'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        Lương 2 Tuần
                      </button>
                    </div>
                  </div>

                  {/* CÁC NÚT CHẤM NHANH 1-CLICK */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cycleType === '1_WEEK' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleQuickFillPeriod(6)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer text-xs shadow-2xs"
                          title="Chấm đủ 1 công từ Thứ 2 đến Thứ 7 (6 công)"
                        >
                          <Zap className="w-3.5 h-3.5 text-emerald-600" />
                          <span>⚡ 6 công (T2 - T7)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickFillPeriod(7)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer text-xs shadow-2xs"
                          title="Chấm cả 7 ngày bao gồm Chủ nhật (7 công)"
                        >
                          <Zap className="w-3.5 h-3.5 text-blue-600" />
                          <span>⚡ 7 công (T2 - CN)</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleQuickFillPeriod(activePeriod.maxStandardDays || 13)}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer text-xs shadow-2xs"
                          title={`Chấm đủ ${activePeriod.maxStandardDays || 13} công tiêu chuẩn của đợt 2 tuần`}
                        >
                          <Zap className="w-3.5 h-3.5 text-emerald-600" />
                          <span>⚡ {activePeriod.maxStandardDays || 13} công tiêu chuẩn</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickFillPeriod(timesheet.length)}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer text-xs shadow-2xs"
                          title="Chấm tất cả các ngày trong đợt (kể cả Chủ nhật)"
                        >
                          <Zap className="w-3.5 h-3.5 text-blue-600" />
                          <span>⚡ Đủ cả đợt ({timesheet.length} ngày)</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddUniformOT(2)}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold transition cursor-pointer text-xs shadow-2xs"
                      title="Thêm 2 giờ OT vào các ngày làm việc"
                    >
                      <span>+2h OT/ngày</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetPeriod}
                      className="px-2.5 py-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded-lg font-semibold transition cursor-pointer text-xs flex items-center gap-1"
                      title="Đặt lại toàn bộ ngày về 0 công để chấm lại từ đầu"
                    >
                      <RotateCcw className="w-3 h-3 text-rose-500" />
                      <span>Xóa trắng (0 công)</span>
                    </button>
                  </div>
                </div>

                {/* THANH CHỌN KỲ TRỰC QUAN (DANH SÁCH TUẦN HOẶC ĐỢT 2 TUẦN) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5 font-bold text-slate-800">
                      <Clock className="w-3.5 h-3.5 text-sky-700" />
                      <span>
                        {cycleType === '1_WEEK' ? 'Chọn tuần thi công:' : 'Chọn đợt thi công (2 tuần):'}
                      </span>
                    </span>
                    <span className="text-[11px] text-sky-800 font-bold">
                      {activePeriod?.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {payrollPeriods.map((p) => {
                      const isSelected = p.id === selectedPeriodId;
                      const hasRecord = form.periodRecords?.[p.periodKey]?.isRecorded;
                      const recDays = form.periodRecords?.[p.periodKey]?.actualWorkDays;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePeriodChange(p.id)}
                          className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#0f3d64] text-white border-[#0f3d64] shadow-md ring-2 ring-sky-300/60 scale-[1.01]'
                              : 'bg-slate-50 hover:bg-sky-50/70 border-slate-200 text-slate-700 hover:border-sky-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-extrabold text-xs">{p.shortLabel}</span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            )}
                          </div>
                          <div
                            className={`text-[10px] font-mono ${
                              isSelected ? 'text-sky-200' : 'text-slate-500'
                            }`}
                          >
                            {p.dates[0]} - {p.dates[p.dates.length - 1]}
                          </div>
                          <div className="mt-1">
                            {hasRecord && recDays !== undefined ? (
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                                  isSelected
                                    ? 'bg-emerald-400 text-slate-950'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                Đã chấm: {recDays} công
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full ${
                                  isSelected
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                Chưa chấm (0 công)
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* =================================================================== */}
                {/* CÁC THẺ CHẤM CÔNG CHI TIẾT TỪNG NGÀY (THIẾT KẾ ĐẸP, HIỆN ĐẠI) */}
                {/* =================================================================== */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 max-h-[380px] overflow-y-auto p-1">
                  {timesheet.map((day, idx) => {
                    const isSunday = day.dayOfWeek === 'CN';
                    const isFullDay = day.workUnits === 1;
                    const isHalfDay = day.workUnits === 0.5;
                    const isOff = day.workUnits === 0;
                    const hasOT = day.otHours > 0;

                    return (
                      <div
                        key={`${day.dayOfWeek}_${day.dateLabel || idx}`}
                        className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all duration-150 ${
                          isFullDay
                            ? 'bg-gradient-to-b from-emerald-50/60 via-white to-emerald-50/20 border-emerald-300 ring-2 ring-emerald-200/50 shadow-xs'
                            : isHalfDay
                            ? 'bg-gradient-to-b from-amber-50/60 via-white to-amber-50/20 border-amber-300 ring-2 ring-amber-200/50 shadow-xs'
                            : isSunday
                            ? 'bg-rose-50/30 border-rose-200/80'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        {/* Phần tiêu đề ngày & Thứ */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                                isSunday
                                  ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                  : 'bg-[#0f3d64] text-white'
                              }`}
                            >
                              {day.dayOfWeek}
                            </span>
                            <span
                              className={`font-black text-xs ${
                                isSunday ? 'text-rose-600' : 'text-slate-800'
                              }`}
                            >
                              {day.dayName}
                            </span>
                          </div>

                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 font-bold shadow-2xs">
                            {day.dateLabel || activePeriod?.dates[idx] || ''}
                          </span>
                        </div>

                        {/* Chọn nhanh số công: 1.0 (Đủ) | 0.5 (Nửa) | 0 (Nghỉ) */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                            <span>Công ngày:</span>
                            <span
                              className={`font-mono font-black ${
                                isFullDay
                                  ? 'text-emerald-700'
                                  : isHalfDay
                                  ? 'text-amber-700'
                                  : 'text-slate-400'
                              }`}
                            >
                              {day.workUnits} công
                            </span>
                          </div>

                          {/* Nhóm nút bấm Segmented Control */}
                          <div className="grid grid-cols-3 gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                            <button
                              type="button"
                              onClick={() => handleDayWorkUnitsChange(idx, 1)}
                              className={`py-1 rounded-md font-black text-[11px] transition-all cursor-pointer flex items-center justify-center gap-0.5 ${
                                isFullDay
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-700 hover:bg-white/80'
                              }`}
                              title="Đi làm đủ ngày (8 tiếng = 1 công)"
                            >
                              {isFullDay && <Check className="w-3 h-3 stroke-[3]" />}
                              <span>1.0</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDayWorkUnitsChange(idx, 0.5)}
                              className={`py-1 rounded-md font-black text-[11px] transition-all cursor-pointer flex items-center justify-center gap-0.5 ${
                                isHalfDay
                                  ? 'bg-amber-500 text-white shadow-xs'
                                  : 'text-slate-700 hover:bg-white/80'
                              }`}
                              title="Đi làm nửa ngày (4 tiếng = 0.5 công)"
                            >
                              <span>0.5</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDayWorkUnitsChange(idx, 0)}
                              className={`py-1 rounded-md font-bold text-[11px] transition-all cursor-pointer flex items-center justify-center ${
                                isOff
                                  ? 'bg-slate-600 text-white shadow-xs'
                                  : 'text-slate-500 hover:bg-white/80'
                              }`}
                              title="Nghỉ ca (0 công)"
                            >
                              <span>0</span>
                            </button>
                          </div>

                          {/* Nhãn trạng thái trực quan */}
                          <div className="text-center pt-0.5">
                            {isFullDay ? (
                              <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-block">
                                ✓ Đủ ca (8h)
                              </span>
                            ) : isHalfDay ? (
                              <span className="text-[10px] text-amber-900 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-block">
                                ◐ Nửa ca (4h)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full inline-block">
                                Nghỉ ca
                              </span>
                            )}
                          </div>
                        </div>

                        {/* TĂNG CA OT TRONG NGÀY */}
                        <div className="mt-2.5 pt-2 border-t border-slate-200/80 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                            <span>Tăng ca (OT):</span>
                            {hasOT ? (
                              <span className="font-mono font-black text-amber-800 bg-amber-100/90 px-1.5 py-0.2 rounded border border-amber-300">
                                ⚡ +{day.otHours}h OT
                              </span>
                            ) : (
                              <span className="font-mono text-slate-400">0h</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleDayOTChange(idx, -1)}
                              className="w-5 h-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-black flex items-center justify-center transition cursor-pointer"
                              title="Giảm 1 giờ OT"
                            >
                              -
                            </button>
                            <span className="font-mono font-black text-xs px-1 text-slate-900">
                              {day.otHours}h
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDayOTChange(idx, 1)}
                              className="w-5 h-5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-xs font-black flex items-center justify-center transition cursor-pointer"
                              title="Tăng 1 giờ OT"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Ghi chú công việc */}
                        <div className="mt-2 pt-1.5 border-t border-slate-100">
                          <input
                            type="text"
                            placeholder="Ghi chú ca..."
                            value={day.note || ''}
                            onChange={(e) => handleDayNoteChange(idx, e.target.value)}
                            className="w-full text-[10px] px-2 py-1 bg-white border border-slate-200 rounded-md focus:ring-1 focus:ring-sky-500 text-slate-700 placeholder-slate-400"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* =================================================================== */}
                {/* BẢNG TỔNG HỢP CHẤM CÔNG KỲ HIỆN ĐẠI (BENTO CARDS) */}
                {/* =================================================================== */}
                <div className="bg-gradient-to-r from-sky-50 via-slate-50 to-emerald-50/40 border border-sky-300 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                    <div className="bg-white p-2 rounded-lg border border-sky-200 shadow-2xs">
                      <span className="text-slate-500 text-[10px] block font-medium">
                        Tổng ngày công ({cycleType === '1_WEEK' ? 'Tuần' : 'Đợt 2 tuần'}):
                      </span>
                      <strong className="text-base font-black font-mono text-sky-950">
                        {form.actualWorkDays} công
                      </strong>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                      <span className="text-slate-500 text-[10px] block font-medium">Tổng giờ tăng ca OT:</span>
                      <strong className="text-base font-black font-mono text-amber-900">
                        {form.overtimeHours} giờ OT (x1.5)
                      </strong>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                      <span className="text-slate-500 text-[10px] block font-medium">Lương công nhật:</span>
                      <strong className="text-base font-black font-mono text-slate-900">
                        {formatNumberOnly(form.salaryByDays)} đ
                      </strong>
                    </div>

                    <div className="bg-white p-2 rounded-lg border border-amber-200 shadow-2xs">
                      <span className="text-slate-500 text-[10px] block font-medium">Tiền làm thêm OT:</span>
                      <strong className="text-base font-black font-mono text-amber-900">
                        {formatNumberOnly(form.overtimePay)} đ
                      </strong>
                    </div>
                  </div>

                  {/* Nút bấm tự tính tiền ăn ca theo số công */}
                  <button
                    type="button"
                    onClick={handleAutoCalcMeal}
                    className="px-3 py-2 bg-white hover:bg-sky-50 text-sky-900 border border-sky-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                    title="Tự động tính tiền ăn: 30.000đ x Số ngày công"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Tự tính tiền ăn: {form.actualWorkDays} x 30k = {formatNumberOnly(form.actualWorkDays * 30000)} đ</span>
                  </button>
                </div>
              </div>
            )}

            {/* CÁC TRƯỜNG TÀI CHÍNH: ĐƠN GIÁ, PHỤ CẤP, TẠM ỨNG & THUẾ TNCN */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 text-xs pt-1">
              {/* Đơn giá ngày công */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Đơn giá ngày công (VNĐ/ngày) *
                </label>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={form.dailyRate}
                  onChange={(e) => updateField('dailyRate', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono font-bold text-sky-900"
                />
                <div className="flex flex-wrap gap-1 mt-1">
                  {[400000, 500000, 550000, 600000, 650000, 900000].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => updateField('dailyRate', rate)}
                      className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                        form.dailyRate === rate
                          ? 'bg-sky-700 text-white font-bold'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-sky-100'
                      }`}
                    >
                      {rate / 1000}k
                    </button>
                  ))}
                </div>
              </div>

              {/* Số ngày công thực tế */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Số ngày công thực tế (công) *
                </label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={31}
                  value={form.actualWorkDays}
                  onChange={(e) => updateField('actualWorkDays', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono font-bold text-slate-900 bg-white"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  {attendanceMode === 'WEEKLY_SHEET'
                    ? '✓ Đồng bộ trực tiếp từ 7 thẻ chấm công ở trên'
                    : 'Nhập tay số ngày công thực tế'}
                </div>
              </div>

              {/* Tổng giờ tăng ca (OT) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tổng giờ tăng ca OT (giờ)
                </label>
                <input
                  type="number"
                  step={1}
                  min={0}
                  value={form.overtimeHours}
                  onChange={(e) => updateField('overtimeHours', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono font-bold text-amber-800"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Hệ số 150%: Tiền OT = <strong>{formatNumberOnly(form.overtimePay)} đ</strong>
                </div>
              </div>

              {/* Tiền ăn trưa / ăn ca */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tiền ăn ca công trường (đ)</label>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={form.mealAllowance}
                  onChange={(e) => updateField('mealAllowance', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Định mức: 30.000 đ/ngày làm việc
                </div>
              </div>

              {/* Phụ cấp xăng xe / an toàn */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phụ cấp xăng xe / An toàn (đ)</label>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={form.travelSafetyAllowance}
                  onChange={(e) => updateField('travelSafetyAllowance', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>

              {/* Thưởng tiến độ / chuyên cần */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Thưởng tiến độ / Chuyên cần (đ)</label>
                <input
                  type="number"
                  step={10000}
                  min={0}
                  value={form.otherBonus}
                  onChange={(e) => updateField('otherBonus', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono"
                />
              </div>

              {/* Tạm ứng tại công trường */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tạm ứng tiền mặt tại CT (đ)</label>
                <input
                  type="number"
                  step={50000}
                  min={0}
                  value={form.advancePayment}
                  onChange={(e) => updateField('advancePayment', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-rose-300 rounded focus:ring-2 focus:ring-rose-500 font-mono text-rose-700 font-bold"
                />
              </div>

              {/* Cam kết thuế 08 & Thuế TNCN */}
              <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-300">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 mb-1">
                  <input
                    type="checkbox"
                    checked={form.hasTaxCommitment}
                    onChange={(e) => updateField('hasTaxCommitment', e.target.checked)}
                    className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                  />
                  <span>Đã có Cam kết 08/CK-TNCN</span>
                </label>
                <p className="text-[10px] text-slate-600">
                  {form.hasTaxCommitment
                    ? '✓ Miễn khấu trừ thuế TNCN 10% tại nguồn'
                    : '⚠ Khấu trừ 10% khi thu nhập từ 2.000.000đ trở lên'}
                </p>
              </div>
            </div>
          </div>

          {/* Nhóm 4: Hình thức nhận tiền & Thông tin thanh toán */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5 border-b pb-1 border-slate-200">
              <CreditCard className="w-4 h-4 text-sky-700" />
              <span>4. Hình thức thanh toán lương tuần & Tài khoản ngân hàng</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phương thức nhận lương</label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) => updateField('paymentMethod', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 bg-white font-semibold"
                >
                  <option value="BANK">Chuyển khoản Ngân hàng (ATM / VietQR)</option>
                  <option value="CASH">Nhận tiền mặt tại công trường</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số tài khoản ngân hàng</label>
                <input
                  type="text"
                  value={form.bankAccount}
                  onChange={(e) => updateField('bankAccount', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500 font-mono font-bold"
                  placeholder="1903xxxxxxxx"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ngân hàng thụ hưởng</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => updateField('bankName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500"
                  placeholder="Vietcombank, MB Bank, Techcombank..."
                />
              </div>

              <div className="md:col-span-3">
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú công việc / Hợp đồng khoán</label>
                <input
                  type="text"
                  value={form.notes || ''}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-sky-500"
                  placeholder="Ghi chú chi tiết công việc hoặc điều khoản thanh toán..."
                />
              </div>
            </div>
          </div>

          {/* BẢNG TỔNG HỢP THU NHẬP & THỰC LĨNH TUẦN TỨC THỜI */}
          <div className="bg-slate-50 border border-slate-300 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs shrink-0 shadow-2xs">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="text-slate-500 block text-[11px]">Tổng thu nhập (A):</span>
                <span className="font-bold text-slate-900 font-mono text-sm">{formatNumberOnly(form.totalIncome)} đ</span>
              </div>
              <div className="border-l border-slate-300 pl-4">
                <span className="text-slate-500 block text-[11px]">Thuế TNCN 10%:</span>
                <span className={`font-bold font-mono text-sm ${form.personalIncomeTax > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {formatNumberOnly(form.personalIncomeTax)} đ
                </span>
              </div>
              <div className="border-l border-slate-300 pl-4">
                <span className="text-slate-500 block text-[11px]">Tạm ứng tại CT:</span>
                <span className="font-bold text-rose-700 font-mono text-sm">{formatNumberOnly(form.advancePayment)} đ</span>
              </div>
              <div className="border-l border-slate-300 pl-4">
                <span className="text-slate-500 block text-[11px]">Tổng giảm trừ (B):</span>
                <span className="font-bold text-rose-800 font-mono text-sm">{formatNumberOnly(form.totalDeductions)} đ</span>
              </div>
            </div>

            <div className="bg-emerald-50 border-2 border-emerald-400 px-5 py-2.5 rounded-xl text-right shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800 block uppercase">THỰC LĨNH THANH TOÁN:</span>
              <span className="text-lg font-black text-emerald-700 font-mono">
                {formatNumberOnly(form.netSalary)} VNĐ
              </span>
            </div>
          </div>

          {/* Buttons Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Nút in nhanh trực tiếp */}
              <button
                type="button"
                onClick={handleDirectPrint}
                className="px-4 py-2 text-xs font-bold text-slate-800 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                title="In phiếu thanh toán tiền công tuần (Mẫu 03-LĐTL)"
              >
                <Printer className="w-4 h-4" />
                <span>In phiếu lương tuần</span>
              </button>

              {/* Nút xóa công nhân khi đang ở chế độ chỉnh sửa hồ sơ */}
              {isEditing && onDelete && worker && (
                <div>
                  {!isConfirmingDelete ? (
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(true)}
                      className="px-3.5 py-2 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                      title="Xóa công nhân này khỏi danh sách thời vụ"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      <span>Xóa công nhân này</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 px-3 py-1.5 rounded-lg">
                      <span className="text-xs font-bold text-rose-800">Xác nhận xóa?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(worker.id);
                          onClose();
                        }}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded text-xs transition cursor-pointer"
                      >
                        Đồng ý xóa
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsConfirmingDelete(false)}
                        className="px-2 py-1 text-slate-600 hover:bg-slate-200 rounded text-xs transition cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-[#0f3d64] hover:bg-[#1a5b94] rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isEditing ? 'Lưu thay đổi hồ sơ' : 'Thêm công nhân thời vụ'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
