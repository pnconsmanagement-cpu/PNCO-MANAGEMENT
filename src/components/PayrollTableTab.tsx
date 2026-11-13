import React, { useState, useMemo, useEffect } from 'react';
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
  Printer,
  X,
  Save,
  CheckCircle2,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  Link2,
  Eye,
} from 'lucide-react';
import {
  CompanyConfig,
  Employee,
  SeasonalWorker,
  TeamWorker,
  Project,
  SeasonalCycleType,
  TeamPaymentVoucher,
} from '../types';
import {
  isSupabaseConfigured,
  getShareableConfigUrl,
  extractSupabaseCredentialsFromAnyText,
  setSupabaseConfig,
} from '../services/supabaseService';
import { formatNumberOnly, formatVND } from '../utils/numberToVietnameseWords';
import { recomputeEmployeePayroll, syncEmployeeForMonth, getRealCurrentDateInfo } from '../utils/payrollCalculator';
import {
  syncSeasonalWorkerForMonth,
  getPayrollPeriods,
  getWorkerForPeriod,
  recordWorkerPeriod,
  getUnifiedWorkerDailyRate,
  recomputeSeasonalWorkerPayroll,
  getTeamWorkerVouchersForMonth,
  buildTeamPeriodRecordFromVouchers,
} from '../data/mockSeasonalWorkers';
import { MonthYearPicker } from './MonthYearPicker';
import { SeasonalWorkerReceiptModal } from './SeasonalWorkerReceiptModal';
import {
  printSeasonalWorkerReceipt,
  printPermanentEmployeeReceipt,
  openPermanentEmployeeReceiptInNewTab,
  downloadPermanentEmployeeReceiptHTML,
} from '../utils/printPayrollReceipt';
import { PayslipDocument } from './PayslipDocument';
import { EmployeeModal } from './EmployeeModal';
import {
  TeamBatchPayrollModal,
  TeamPayrollPeriodGroup,
  TeamPayrollPeriodWorkerRow,
} from './TeamBatchPayrollModal';

interface PayrollTableTabProps {
  employees: Employee[];
  seasonalWorkers?: SeasonalWorker[];
  teamWorkers?: TeamWorker[];
  projects?: Project[];
  config: CompanyConfig;
  onChangeMonthYear: (month: number, year: number) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onAddEmployee: (emp: Employee) => void;
  onDeleteEmployee: (id: string) => void;
  onUpdateSeasonalWorker?: (worker: SeasonalWorker) => void;
  onBatchUpdateTeamWorkersList?: (workers: SeasonalWorker[]) => void;
  onSavePayrollToCloud?: () => Promise<void> | void;
  onReloadFromCloud?: () => Promise<void> | void;
  onOpenSupabaseModal?: () => void;
  cloudSyncStatus?: 'synced' | 'syncing' | 'error' | 'idle';
  hasUnsavedChanges?: boolean;
  forcedCategory?: 'PERMANENT' | 'SEASONAL' | 'TEAM' | 'ALL';
}

export const PayrollTableTab: React.FC<PayrollTableTabProps> = ({
  employees,
  seasonalWorkers = [],
  teamWorkers = [],
  projects = [],
  config,
  onChangeMonthYear,
  onUpdateEmployee,
  onAddEmployee,
  onDeleteEmployee,
  onUpdateSeasonalWorker,
  onBatchUpdateTeamWorkersList,
  onSavePayrollToCloud,
  onReloadFromCloud,
  onOpenSupabaseModal,
  cloudSyncStatus = 'idle',
  hasUnsavedChanges = false,
  forcedCategory,
}) => {
  const { realMonth, realYear } = getRealCurrentDateInfo();
  const currentMonth = config.month || realMonth;
  const currentYear = config.year || realYear;

  // Chu kỳ ghi nhận lương: Theo Tuần, Theo Tháng, Theo Quý, Theo Năm
  const [periodCycle, setPeriodCycle] = useState<'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'>('MONTH');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Math.ceil(currentMonth / 3));

  // Nhóm nhân sự: Tất cả, Chính thức, Thời vụ, Tổ đội
  const [workerCategory, setWorkerCategory] = useState<'ALL' | 'PERMANENT' | 'SEASONAL' | 'TEAM'>(
    forcedCategory || 'PERMANENT'
  );

  useEffect(() => {
    if (forcedCategory) {
      setWorkerCategory(forcedCategory);
    }
  }, [forcedCategory]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [attendanceOnly, setAttendanceOnly] = useState(true);
  const [seasonalAttendanceOnly, setSeasonalAttendanceOnly] = useState(true);
  const [salaryTypeFilter, setSalaryTypeFilter] = useState<'ALL' | 'MONTHLY' | 'DAILY'>('ALL');
  const [showResignedHistory, setShowResignedHistory] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [printingSeasonalWorker, setPrintingSeasonalWorker] = useState<SeasonalWorker | null>(null);
  const [printingPermanentEmployee, setPrintingPermanentEmployee] = useState<Employee | null>(null);

  // Modal chỉnh sửa nhanh STK & Ngân hàng khi bấm vào tên nhân viên thời vụ tại Bản Lương
  const [editingSeasonalBankWorker, setEditingSeasonalBankWorker] = useState<SeasonalWorker | null>(null);
  const [bankFormAccount, setBankFormAccount] = useState('');
  const [bankFormName, setBankFormName] = useState('');
  const [bankFormMethod, setBankFormMethod] = useState<'BANK' | 'CASH'>('BANK');

  const handleOpenSeasonalBankModal = (w: SeasonalWorker) => {
    const baseWorker = seasonalWorkers.find((sw) => sw.id === w.id || sw.code === w.code) || w;
    setEditingSeasonalBankWorker(baseWorker);
    setBankFormAccount(baseWorker.bankAccount || '');
    setBankFormName(baseWorker.bankName || 'Vietcombank');
    setBankFormMethod(baseWorker.paymentMethod || 'BANK');
  };

  const handleSaveSeasonalBankModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSeasonalBankWorker || !onUpdateSeasonalWorker) return;
    const baseWorker =
      seasonalWorkers.find(
        (sw) => sw.id === editingSeasonalBankWorker.id || sw.code === editingSeasonalBankWorker.code
      ) || editingSeasonalBankWorker;
    const cleanedAccount = bankFormAccount.trim();
    const cleanedBankName =
      bankFormName.trim() || (bankFormMethod === 'CASH' ? 'Tiền mặt' : 'Vietcombank');
    onUpdateSeasonalWorker({
      ...baseWorker,
      paymentMethod: bankFormMethod,
      bankAccount: cleanedAccount,
      bankName: cleanedBankName,
      bankUpdatedAt: Date.now(),
    } as SeasonalWorker);
    setEditingSeasonalBankWorker(null);
  };

  // 4 Tab Bản Lương Thời Vụ riêng biệt: Bản Lương 1 Tuần ('1_WEEK'), Bản Lương 2 Tuần ('2_WEEKS'), Bản Lương Tháng ('1_MONTH'), Bản Lương Tổ Đội ('TEAM')
  const [seasonalCycleTab, setSeasonalCycleTab] = useState<SeasonalCycleType>(() => {
    try {
      const saved = localStorage.getItem('seasonal_payroll_active_tab');
      if (saved === '1_WEEK' || saved === '2_WEEKS' || saved === '1_MONTH' || saved === 'TEAM') {
        return saved;
      }
    } catch {}
    return '1_MONTH';
  });

  // Lựa chọn kỳ con trong tháng cho Bản Lương 1 Tuần (W1..W5) hoặc Bản Lương 2 Tuần (BI1..BI2), hoặc 'ALL_PERIODS' (Tổng hợp tháng)
  const [selectedSeasonalSubPeriodId, setSelectedSeasonalSubPeriodId] = useState<string>('ALL_PERIODS');

  const handleSelectSeasonalCycleTab = (tab: SeasonalCycleType) => {
    setSeasonalCycleTab(tab);
    setSelectedSeasonalSubPeriodId('ALL_PERIODS');
    try {
      localStorage.setItem('seasonal_payroll_active_tab', tab);
    } catch {}
  };

  // Danh sách các kỳ con (Tuần 1..5 hoặc Đợt 1..2) của tháng hiện tại theo tab chu kỳ đang chọn
  const seasonalSubPeriods = useMemo(() => {
    return getPayrollPeriods(currentYear, currentMonth, seasonalCycleTab);
  }, [currentYear, currentMonth, seasonalCycleTab]);

  // Hệ số tính toán theo chu kỳ (cho nhân viên chính thức / tổ đội)
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

  // Đồng bộ 100% danh sách nhân viên chính thức và thời vụ theo đúng Tháng / Năm đang chọn từ Bản Chấm Công & Bản Ứng Lương
  const syncedEmployeesForMonth = useMemo(() => {
    return employees.map((emp) => {
      const synced = syncEmployeeForMonth(emp, currentMonth, currentYear, config.standardWorkDays || 26);
      const adv = emp.advancePayment || synced.advancePayment || 0;
      const totalDeductions = (synced.totalInsurance || 0) + (synced.personalIncomeTax || 0) + adv;
      return {
        ...synced,
        unionFee: 0,
        advancePayment: adv,
        totalDeductions,
        netSalary: Math.max(0, (synced.totalIncome || 0) - totalDeductions),
      };
    });
  }, [employees, currentMonth, currentYear, config.standardWorkDays]);

  const syncedSeasonalForMonth = useMemo(() => {
    return seasonalWorkers.map((w) => {
      const unifiedRate = getUnifiedWorkerDailyRate(w);
      const bankAccount = w.bankAccount || '';
      const bankName = w.bankName || (w.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Vietcombank');
      const paymentMethod = w.paymentMethod || 'BANK';
      const synced = syncSeasonalWorkerForMonth(
        {
          ...w,
          dailyRate: unifiedRate,
          bankAccount,
          bankName,
          paymentMethod,
        },
        currentMonth,
        currentYear
      );
      const rateToUse =
        w.payrollCycleType === 'TEAM' && synced.dailyRate !== undefined && synced.dailyRate >= 0
          ? synced.dailyRate
          : unifiedRate;
      const adv =
        w.payrollCycleType === 'TEAM'
          ? synced.advancePayment ?? w.advancePayment ?? 0
          : w.advancePayment ?? synced.advancePayment ?? 0;
      const recalculated = recomputeSeasonalWorkerPayroll({
        ...synced,
        dailyRate: rateToUse,
        advancePayment: adv,
        bankAccount: w.bankAccount || synced.bankAccount || '',
        bankName: w.bankName || synced.bankName || 'Vietcombank',
        paymentMethod: w.paymentMethod || synced.paymentMethod || 'BANK',
      });
      return {
        ...recalculated,
        teamVouchers: synced.teamVouchers,
        selectedForAttendance: synced.selectedForAttendance,
      };
    });
  }, [seasonalWorkers, currentMonth, currentYear]);

  // Danh sách công nhân thời vụ đang làm việc (ACTIVE)
  const activeSeasonalWorkers = useMemo(() => {
    return syncedSeasonalForMonth.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE');
  }, [syncedSeasonalForMonth]);

  // Danh sách tất cả dự án hiện có để chọn nhanh tại Bản Lương
  const availableProjectNames = useMemo(() => {
    const set = new Set<string>(['Coherent Vsip 3', 'Tòa nhà văn phòng & Dịch vụ thương mại']);
    projects.forEach((p) => {
      if (p.name && p.name.trim()) set.add(p.name.trim());
    });
    seasonalWorkers.forEach((w) => {
      if (w.project && w.project.trim()) set.add(w.project.trim());
    });
    teamWorkers.forEach((t) => {
      if (t.project && t.project.trim()) set.add(t.project.trim());
    });
    return Array.from(set);
  }, [projects, seasonalWorkers, teamWorkers]);

  // Helper tìm đúng nhân sự gốc trong seasonalWorkers (ưu tiên khớp ID hoặc nhân sự thuộc chu kỳ TEAM khi trùng mã code)
  const findTeamBaseWorker = (target: SeasonalWorker | string): SeasonalWorker | undefined => {
    if (typeof target === 'string') {
      const key = target.trim();
      return (
        seasonalWorkers.find((sw) => sw.payrollCycleType === 'TEAM' && (sw.id === key || sw.code === key)) ||
        seasonalWorkers.find((sw) => sw.id === key) ||
        seasonalWorkers.find((sw) => sw.code === key)
      );
    }
    return (
      seasonalWorkers.find((sw) => target.id && sw.id === target.id) ||
      seasonalWorkers.find(
        (sw) => sw.payrollCycleType === 'TEAM' && sw.code === target.code
      ) ||
      seasonalWorkers.find((sw) => sw.code === target.code) ||
      target
    );
  };

  // Helper cập nhật đúng đợt chi lương (TeamPaymentVoucher) hoặc tạo đợt 1 cho nhân sự Tổ Đội (TEAM) trong tháng đang xem
  const handleUpdateTeamSeasonalMonthRecord = (
    w: SeasonalWorker,
    patch: Partial<SeasonalWorker>
  ) => {
    if (!onUpdateSeasonalWorker) return;
    const baseWorker = findTeamBaseWorker(w) || w;
    const mPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
    const existingVouchers = getTeamWorkerVouchersForMonth(baseWorker, currentMonth, currentYear);

    // Nếu người dùng bấm hủy chọn / xóa dòng
    if (patch.selectedForAttendance === false && patch.actualWorkDays === 0) {
      const nextVouchers = w.activeVoucherId
        ? existingVouchers.filter((v) => v.id !== w.activeVoucherId)
        : [];
      const updatedWorker = buildTeamPeriodRecordFromVouchers(baseWorker, mPeriod, nextVouchers);
      onUpdateSeasonalWorker({
        ...updatedWorker,
        payrollCycleType: 'TEAM',
        updatedAt: Date.now(),
      });
      return;
    }

    const effectiveSalaryByDays =
      patch.salaryByDays !== undefined
        ? patch.salaryByDays
        : patch.dailyRate !== undefined
        ? patch.dailyRate
        : w.salaryByDays !== undefined
        ? w.salaryByDays
        : w.dailyRate || 0;

    const effectiveBonus =
      patch.otherBonus !== undefined ||
      patch.mealAllowance !== undefined ||
      patch.travelSafetyAllowance !== undefined
        ? (patch.mealAllowance ?? 0) +
          (patch.travelSafetyAllowance ?? 0) +
          (patch.otherBonus ?? 0)
        : (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0);

    let nextVouchers: Partial<TeamPaymentVoucher>[];
    if (existingVouchers.length > 0 && w.activeVoucherId) {
      let matched = false;
      nextVouchers = existingVouchers.map((v) => {
        if (v.id === w.activeVoucherId) {
          matched = true;
          return {
            ...v,
            project: patch.project !== undefined ? patch.project : v.project || w.project || baseWorker.project,
            paymentDate:
              patch.paymentDate !== undefined
                ? patch.paymentDate
                : v.paymentDate || w.paymentDate || getDefaultVoucherDate(currentMonth, currentYear),
            salaryByDays: effectiveSalaryByDays,
            otherBonus: effectiveBonus,
            advancePayment:
              patch.advancePayment !== undefined ? patch.advancePayment : v.advancePayment || 0,
            updatedAt: Date.now(),
          };
        }
        return v;
      });
      if (!matched) {
        nextVouchers.push({
          id: w.activeVoucherId,
          orderIndex: nextVouchers.length + 1,
          project: patch.project !== undefined ? patch.project : w.project || baseWorker.project,
          paymentDate:
            patch.paymentDate !== undefined
              ? patch.paymentDate
              : w.paymentDate || getDefaultVoucherDate(currentMonth, currentYear),
          salaryByDays: effectiveSalaryByDays,
          otherBonus: effectiveBonus,
          advancePayment:
            patch.advancePayment !== undefined ? patch.advancePayment : w.advancePayment || 0,
          updatedAt: Date.now(),
        });
      }
    } else if (existingVouchers.length === 1 && !w.activeVoucherId) {
      const v0 = existingVouchers[0];
      nextVouchers = [
        {
          ...v0,
          project: patch.project !== undefined ? patch.project : v0.project || w.project || baseWorker.project,
          paymentDate:
            patch.paymentDate !== undefined
              ? patch.paymentDate
              : v0.paymentDate || w.paymentDate || getDefaultVoucherDate(currentMonth, currentYear),
          salaryByDays: effectiveSalaryByDays,
          otherBonus: effectiveBonus,
          advancePayment:
            patch.advancePayment !== undefined ? patch.advancePayment : v0.advancePayment || 0,
          updatedAt: Date.now(),
        },
      ];
    } else if (existingVouchers.length === 0) {
      nextVouchers = [
        {
          id: `TVOUCHER_${Date.now()}_1`,
          orderIndex: 1,
          project: patch.project !== undefined ? patch.project : w.project || baseWorker.project,
          paymentDate:
            patch.paymentDate !== undefined
              ? patch.paymentDate
              : w.paymentDate || getDefaultVoucherDate(currentMonth, currentYear),
          salaryByDays: effectiveSalaryByDays,
          otherBonus: effectiveBonus,
          advancePayment:
            patch.advancePayment !== undefined ? patch.advancePayment : w.advancePayment || 0,
          updatedAt: Date.now(),
        },
      ];
    } else {
      // Trường hợp đã có nhiều đợt mà gọi không kèm activeVoucherId -> giữ nguyên danh sách đợt để tránh ghi đè
      nextVouchers = existingVouchers;
    }

    const updatedWorker = buildTeamPeriodRecordFromVouchers(baseWorker, mPeriod, nextVouchers);
    onUpdateSeasonalWorker({
      ...updatedWorker,
      payrollCycleType: 'TEAM',
      updatedAt: Date.now(),
    });
  };

  const handleRemoveTeamVoucherRow = (w: SeasonalWorker) => {
    if (!onUpdateSeasonalWorker) return;
    const baseWorker = findTeamBaseWorker(w) || w;
    const mPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
    const existingVouchers = getTeamWorkerVouchersForMonth(baseWorker, currentMonth, currentYear);
    const nextVouchers = w.activeVoucherId
      ? existingVouchers.filter((v) => v.id !== w.activeVoucherId)
      : [];
    const updatedWorker = buildTeamPeriodRecordFromVouchers(baseWorker, mPeriod, nextVouchers);
    onUpdateSeasonalWorker({
      ...updatedWorker,
      payrollCycleType: 'TEAM',
      updatedAt: Date.now(),
    });
    setSavePayrollNotice(
      nextVouchers.length > 0
        ? `Đã xóa Đợt ${w.activeVoucherIndex || ''} của ${baseWorker.fullName} (còn ${nextVouchers.length} đợt trong tháng) — Nhấn "Lưu Data" để lưu chính thức!`
        : `Đã xóa lệnh chi lương của ${baseWorker.fullName} trong kỳ ${String(currentMonth).padStart(2, '0')}/${currentYear} — Nhấn "Lưu Data" để lưu chính thức!`
    );
    setTimeout(() => {
      setSavePayrollNotice(null);
    }, 4500);
  };

  // Trạng thái lưu bản lương & đồng bộ Supabase
  const [isSavingPayroll, setIsSavingPayroll] = useState(false);
  const [isReloadingPayroll, setIsReloadingPayroll] = useState(false);
  const [copiedSyncLink, setCopiedSyncLink] = useState(false);
  const [savePayrollNotice, setSavePayrollNotice] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState(() => isSupabaseConfigured());
  const [quickSyncLinkInput, setQuickSyncLinkInput] = useState('');

  useEffect(() => {
    const handleCfgChanged = () => {
      setSupabaseReady(isSupabaseConfigured());
    };
    window.addEventListener('pncons-supabase-config-changed', handleCfgChanged);
    return () => {
      window.removeEventListener('pncons-supabase-config-changed', handleCfgChanged);
    };
  }, []);

  const handleQuickConnectFromBanner = async () => {
    const trimmed = quickSyncLinkInput.trim();
    if (!trimmed) {
      if (onOpenSupabaseModal) onOpenSupabaseModal();
      return;
    }
    const creds = extractSupabaseCredentialsFromAnyText(trimmed);
    if (!creds) {
      setSavePayrollNotice(
        '⚠ Không nhận diện được Link Đồng Bộ. Hãy bấm "Sao chép link Máy 2" từ mục Quản lý Supabase Cloud ở tab có dữ liệu rồi dán lại, hoặc nhấn "Mở bảng cấu hình".'
      );
      if (onOpenSupabaseModal) onOpenSupabaseModal();
      return;
    }
    setIsReloadingPayroll(true);
    try {
      setSupabaseConfig(creds.url, creds.anonKey);
      setSupabaseReady(true);
      setQuickSyncLinkInput('');
      if (onReloadFromCloud) {
        await Promise.resolve(onReloadFromCloud());
      }
      setSavePayrollNotice(
        '✓ Đã kết nối Supabase Cloud & tải toàn bộ Bản Lương, Chấm Công và Nhân Sự về thành công!'
      );
      setTimeout(() => {
        setSavePayrollNotice(null);
      }, 6000);
    } finally {
      setIsReloadingPayroll(false);
    }
  };

  const handleReloadFromCloudClick = async () => {
    if (!onReloadFromCloud || hasUnsavedChanges) return;
    setIsReloadingPayroll(true);
    try {
      await Promise.resolve(onReloadFromCloud());
      setSavePayrollNotice(
        `✓ Đã tải & đồng bộ Bản Lương mới nhất từ Supabase Cloud!`
      );
      setTimeout(() => {
        setSavePayrollNotice(null);
      }, 4500);
    } finally {
      setIsReloadingPayroll(false);
    }
  };

  const handleCopySyncLink = () => {
    const shareUrl = getShareableConfigUrl();
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopiedSyncLink(true);
    setSavePayrollNotice(
      '✓ Đã copy Link Đồng Bộ! Mở link này trên máy tính / trình duyệt khác sẽ tự động kết nối Cloud & tải ngay toàn bộ Bản Lương.'
    );
    setTimeout(() => {
      setCopiedSyncLink(false);
    }, 3000);
    setTimeout(() => {
      setSavePayrollNotice(null);
    }, 6000);
  };

  const handleSavePayrollTable = async () => {
    setIsSavingPayroll(true);
    try {
      // Đảm bảo tất cả nhân sự Tổ Đội đang được chọn trả lương trên bảng đều được đóng gói đầy đủ vào periodRecords (bảo toàn 100% mảng teamVouchers nhiều đợt)
      if (onUpdateSeasonalWorker) {
        const mPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
        activeSeasonalWorkers.forEach((w) => {
          if (
            w.payrollCycleType === 'TEAM' &&
            (Boolean(w.selectedForAttendance) || (w.actualWorkDays || 0) > 0)
          ) {
            const baseWorker = findTeamBaseWorker(w) || w;
            const existingRec = baseWorker.periodRecords?.[mPeriod.periodKey];
            if (existingRec && Array.isArray(existingRec.teamVouchers)) {
              return;
            }
            const salAmount = w.salaryByDays || w.dailyRate || existingRec?.salaryByDays || 0;
            if (!existingRec || !existingRec.isRecorded || existingRec.salaryByDays !== salAmount) {
              handleUpdateTeamSeasonalMonthRecord(w, {
                salaryByDays: salAmount,
                dailyRate: salAmount,
                actualWorkDays: 1,
                paymentDate: w.paymentDate || existingRec?.paymentDate,
                project: w.project || existingRec?.project,
                selectedForAttendance: true,
              });
            }
          }
        });
      }
      if (onSavePayrollToCloud) {
        await Promise.resolve(onSavePayrollToCloud());
      }
      setSavePayrollNotice(
        isSupabaseConfigured()
          ? `✓ Đã lưu Data & đồng bộ Bản Lương kỳ ${String(currentMonth).padStart(2, '0')}/${currentYear} lên Supabase Cloud thành công!`
          : `⚠ Đã lưu trên trình duyệt này (Chưa kết nối Supabase Cloud — nhấn "Kết nối Cloud" bên cạnh để đồng bộ sang máy khác)!`
      );
      setTimeout(() => {
        setSavePayrollNotice(null);
      }, 5500);
    } finally {
      setIsSavingPayroll(false);
    }
  };

  // Modal Tạo Kỳ Lương Tổ Đội & Cửa sổ Xem Danh Sách Công Nhân Theo Kỳ Lương
  const [isTeamBatchModalOpen, setIsTeamBatchModalOpen] = useState(false);
  const [editingTeamPeriodGroup, setEditingTeamPeriodGroup] = useState<TeamPayrollPeriodGroup | null>(null);
  const [viewingTeamPeriodGroupKey, setViewingTeamPeriodGroupKey] = useState<string | null>(null);
  const [detailModalSearchTerm, setDetailModalSearchTerm] = useState<string>('');
  const [confirmDeleteGroupKey, setConfirmDeleteGroupKey] = useState<string | null>(null);
  const [confirmRemoveVoucherId, setConfirmRemoveVoucherId] = useState<string | null>(null);

  useEffect(() => {
    setViewingTeamPeriodGroupKey(null);
    setConfirmDeleteGroupKey(null);
    setConfirmRemoveVoucherId(null);
    setDetailModalSearchTerm('');
  }, [currentMonth, currentYear, seasonalCycleTab]);

  // Modal Tạo Phiếu Chi Lương Tổ Đội lẻ 1 nhân sự
  const [isTeamVoucherModalOpen, setIsTeamVoucherModalOpen] = useState(false);
  const [teamVoucherWorkerCode, setTeamVoucherWorkerCode] = useState<string>('');
  const [teamVoucherSalary, setTeamVoucherSalary] = useState<string>('');
  const [teamVoucherBonus, setTeamVoucherBonus] = useState<string>('');
  const [teamVoucherDate, setTeamVoucherDate] = useState<string>('');
  const [teamVoucherProject, setTeamVoucherProject] = useState<string>('');

  const getDefaultVoucherDate = (mo: number, yr: number) => {
    const today = new Date();
    const dayNum = Math.min(today.getDate(), new Date(yr, mo, 0).getDate());
    return `${yr}-${String(mo).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  };

  const formatIsoToDmy = (rawDate?: string) => {
    if (!rawDate) return '—';
    const trimmed = rawDate.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return trimmed;
  };

  const normalizeToIsoDate = (rawDate: string | undefined, mo: number, yr: number): string => {
    const fallback = getDefaultVoucherDate(mo, yr);
    if (!rawDate || !rawDate.trim()) return fallback;
    const trimmed = rawDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
      const dd = dmyMatch[1].padStart(2, '0');
      const mm = dmyMatch[2].padStart(2, '0');
      const yyyy = dmyMatch[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return fallback;
  };

  const selectedModalWorkerExistingVouchers = useMemo(() => {
    if (!teamVoucherWorkerCode) return [];
    const baseW = findTeamBaseWorker(teamVoucherWorkerCode);
    return getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
  }, [teamVoucherWorkerCode, seasonalWorkers, currentMonth, currentYear]);

  const handleOpenTeamVoucherModal = (preselectedWorker?: SeasonalWorker) => {
    const defaultWorker = preselectedWorker || allTeamSeasonalWorkers[0];
    const baseW = defaultWorker ? findTeamBaseWorker(defaultWorker) : undefined;
    const existingVouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
    const latestVoucher =
      existingVouchers.length > 0 ? existingVouchers[existingVouchers.length - 1] : undefined;

    setTeamVoucherWorkerCode(defaultWorker ? defaultWorker.id || defaultWorker.code : '');
    // Luôn để trống ô tiền lương để tạo Lệnh Chi Lương Đợt Mới (không ghi đè đợt trước)
    setTeamVoucherSalary('');
    setTeamVoucherBonus('');
    setTeamVoucherDate(getDefaultVoucherDate(currentMonth, currentYear));
    setTeamVoucherProject(
      preselectedWorker?.project ||
        latestVoucher?.project ||
        defaultWorker?.project ||
        availableProjectNames[0] ||
        'Coherent Vsip 3'
    );
    setIsTeamVoucherModalOpen(true);
  };

  const handleSaveTeamVoucherModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateSeasonalWorker || !teamVoucherWorkerCode) return;
    const baseWorker = findTeamBaseWorker(teamVoucherWorkerCode);
    if (!baseWorker) return;

    const salaryAmount = Math.max(0, Number(teamVoucherSalary) || 0);
    const bonusAmount = Math.max(0, Number(teamVoucherBonus) || 0);
    const chosenDate = normalizeToIsoDate(teamVoucherDate, currentMonth, currentYear);
    const chosenProject =
      teamVoucherProject || baseWorker.project || availableProjectNames[0] || 'Coherent Vsip 3';

    // Lấy toàn bộ các đợt chi lương đã có trong tháng và THÊM ĐỢT MỚI (tuyệt đối không ghi đè đợt cũ!)
    const targetPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
    const existingVouchers = getTeamWorkerVouchersForMonth(baseWorker, currentMonth, currentYear);
    const nextOrderNum = existingVouchers.length + 1;

    const nextVouchers: Partial<TeamPaymentVoucher>[] = [
      ...existingVouchers,
      {
        id: `TVOUCHER_${Date.now()}_${nextOrderNum}_${Math.random().toString(36).slice(2, 6)}`,
        orderIndex: nextOrderNum,
        paymentDate: chosenDate,
        project: chosenProject,
        salaryByDays: salaryAmount,
        otherBonus: bonusAmount,
        advancePayment: 0,
        hasTaxCommitment: baseWorker.hasTaxCommitment ?? true,
        updatedAt: Date.now(),
      },
    ];

    const updatedWorker = buildTeamPeriodRecordFromVouchers(
      {
        ...baseWorker,
        payrollCycleType: 'TEAM',
      },
      targetPeriod,
      nextVouchers
    );

    setSeasonalCycleTab('TEAM');
    setSelectedSeasonalSubPeriodId('ALL_PERIODS');

    onUpdateSeasonalWorker({
      ...updatedWorker,
      payrollCycleType: 'TEAM',
      updatedAt: Date.now(),
    });

    setIsTeamVoucherModalOpen(false);
    setSavePayrollNotice(
      `✓ Đã tạo lệnh chi lương Đợt ${nextOrderNum} (${formatNumberOnly(salaryAmount + bonusAmount)} đ - ngày ${formatIsoToDmy(chosenDate)}) cho ${baseWorker.fullName} — Nhấn nút "Lưu Data" để lưu chính thức!`
    );
    setTimeout(() => {
      setSavePayrollNotice(null);
    }, 5500);
  };

  // Số lượng nhân viên thời vụ ĐÃ CÓ CHẤM CÔNG hoặc CÓ TẠM ỨNG theo từng Tab Chu kỳ lương đã khai báo
  const oneWeekWorkersCount = useMemo(
    () =>
      activeSeasonalWorkers.filter(
        (w) =>
          (w.payrollCycleType || '1_MONTH') === '1_WEEK' &&
          ((w.actualWorkDays || 0) > 0 || (w.overtimeHours || 0) > 0 || (w.advancePayment || 0) > 0)
      ).length,
    [activeSeasonalWorkers]
  );
  const twoWeeksWorkersCount = useMemo(
    () =>
      activeSeasonalWorkers.filter(
        (w) =>
          (w.payrollCycleType || '1_MONTH') === '2_WEEKS' &&
          ((w.actualWorkDays || 0) > 0 || (w.overtimeHours || 0) > 0 || (w.advancePayment || 0) > 0)
      ).length,
    [activeSeasonalWorkers]
  );
  const monthlySeasonalWorkersCount = useMemo(
    () =>
      activeSeasonalWorkers.filter(
        (w) =>
          (w.payrollCycleType || '1_MONTH') === '1_MONTH' &&
          ((w.actualWorkDays || 0) > 0 || (w.overtimeHours || 0) > 0 || (w.advancePayment || 0) > 0)
      ).length,
    [activeSeasonalWorkers]
  );
  const allTeamSeasonalWorkers = useMemo(
    () => activeSeasonalWorkers.filter((w) => (w.payrollCycleType || '1_MONTH') === 'TEAM'),
    [activeSeasonalWorkers]
  );
  const teamSeasonalWorkersCount = useMemo(
    () =>
      allTeamSeasonalWorkers.filter(
        (w) =>
          Boolean(w.selectedForAttendance) ||
          (w.actualWorkDays || 0) > 0 ||
          (w.overtimeHours || 0) > 0 ||
          (w.advancePayment || 0) > 0
      ).length,
    [allTeamSeasonalWorkers]
  );

  const totalTeamOrdersCount = useMemo(() => {
    return allTeamSeasonalWorkers.reduce((sum, w) => {
      const baseW = findTeamBaseWorker(w) || w;
      const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
      return sum + vouchers.length;
    }, 0);
  }, [allTeamSeasonalWorkers, seasonalWorkers, currentMonth, currentYear]);

  // Tổng hợp danh sách Thống Kê Các Kỳ Lương Tổ Đội theo ngày trong tháng đang xem
  const teamPayrollPeriodGroups = useMemo<TeamPayrollPeriodGroup[]>(() => {
    const groupMap = new Map<string, TeamPayrollPeriodGroup>();
    const defaultIso = getDefaultVoucherDate(currentMonth, currentYear);

    allTeamSeasonalWorkers.forEach((w) => {
      const baseW = findTeamBaseWorker(w) || w;
      const bankAcc = w.bankAccount || baseW.bankAccount || '';
      const bankNm =
        w.bankName ||
        baseW.bankName ||
        ((w.paymentMethod || baseW.paymentMethod) === 'CASH' ? 'Tiền mặt' : 'Vietcombank');
      const payMethod = w.paymentMethod || baseW.paymentMethod || 'BANK';
      const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);

      vouchers.forEach((v) => {
        const bCode = (v.batchCode || '').trim();
        const payDate = normalizeToIsoDate(v.paymentDate || w.paymentDate, currentMonth, currentYear) || defaultIso;
        const proj = (v.project || w.project || 'Coherent Vsip 3').trim();
        const gKey = bCode ? `BATCH::${bCode}` : `DATE::${payDate}::${proj}`;
        const payDateDmy = formatIsoToDmy(payDate);
        const displayCode = bCode || `Kỳ ${payDateDmy}`;

        const sal = Math.max(0, v.salaryByDays || 0);
        const bon = Math.max(0, v.otherBonus || 0);
        const adv = Math.max(0, v.advancePayment || 0);
        const tax = Math.max(0, v.personalIncomeTax || 0);
        const inc = v.totalIncome ?? sal + bon;
        const ded = v.totalDeductions ?? tax + adv;
        const net = v.netSalary ?? Math.max(0, inc - ded);

        const rowItem: TeamPayrollPeriodWorkerRow = {
          worker: {
            ...w,
            bankAccount: bankAcc,
            bankName: bankNm,
            paymentMethod: payMethod,
            project: proj,
            paymentDate: payDate,
          },
          voucher: v,
          voucherId: v.id,
          salaryByDays: sal,
          otherBonus: bon,
          advancePayment: adv,
          personalIncomeTax: tax,
          totalIncome: inc,
          totalDeductions: ded,
          netSalary: net,
        };

        const existing = groupMap.get(gKey);
        if (existing) {
          existing.workerCount += 1;
          existing.totalSalaryByDays += sal;
          existing.totalBonus += bon;
          existing.totalAdvance += adv;
          existing.totalTax += tax;
          existing.totalIncome += inc;
          existing.totalNetSalary += net;
          existing.voucherIds.add(v.id);
          existing.rows.push(rowItem);
        } else {
          groupMap.set(gKey, {
            groupKey: gKey,
            displayCode,
            rawBatchCode: bCode || undefined,
            isLegacyDateGroup: !bCode,
            paymentDate: payDate,
            paymentDateDisplay: payDateDmy,
            project: proj,
            workerCount: 1,
            totalSalaryByDays: sal,
            totalBonus: bon,
            totalAdvance: adv,
            totalTax: tax,
            totalIncome: inc,
            totalNetSalary: net,
            voucherIds: new Set([v.id]),
            rows: [rowItem],
          });
        }
      });
    });

    // Sắp xếp danh sách công nhân bên trong mỗi kỳ theo mã CN tăng dần
    groupMap.forEach((g) => {
      g.rows.sort((a, b) =>
        (a.worker.code || '').localeCompare(b.worker.code || '', 'vi', { numeric: true })
      );
    });

    // Sắp xếp các Kỳ Lương theo Ngày kỳ lương tăng dần, sau đó theo Mã kỳ lương
    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.paymentDate !== b.paymentDate) {
        return a.paymentDate.localeCompare(b.paymentDate);
      }
      return a.displayCode.localeCompare(b.displayCode, 'vi', { numeric: true });
    });
  }, [allTeamSeasonalWorkers, seasonalWorkers, currentMonth, currentYear]);

  // Lọc bảng Thống kê Kỳ Lương theo ô tìm kiếm (tìm theo ngày kỳ lương, mã kỳ, dự án hoặc tên/mã công nhân có trong kỳ)
  const filteredTeamPeriodGroups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return teamPayrollPeriodGroups;
    return teamPayrollPeriodGroups.filter((g) => {
      if (
        g.displayCode.toLowerCase().includes(term) ||
        g.paymentDateDisplay.toLowerCase().includes(term) ||
        g.paymentDate.toLowerCase().includes(term) ||
        g.project.toLowerCase().includes(term)
      ) {
        return true;
      }
      return g.rows.some(
        (r) =>
          r.worker.fullName.toLowerCase().includes(term) ||
          r.worker.code.toLowerCase().includes(term)
      );
    });
  }, [teamPayrollPeriodGroups, searchTerm]);

  // Kỳ lương đang được Click mở xem danh sách công nhân chi tiết
  const activeViewingPeriodGroup = useMemo(() => {
    if (!viewingTeamPeriodGroupKey) return null;
    return teamPayrollPeriodGroups.find((g) => g.groupKey === viewingTeamPeriodGroupKey) || null;
  }, [teamPayrollPeriodGroups, viewingTeamPeriodGroupKey]);

  useEffect(() => {
    if (viewingTeamPeriodGroupKey && !activeViewingPeriodGroup) {
      setViewingTeamPeriodGroupKey(null);
    }
  }, [viewingTeamPeriodGroupKey, activeViewingPeriodGroup]);

  const filteredDetailModalRows = useMemo(() => {
    if (!activeViewingPeriodGroup) return [];
    const q = detailModalSearchTerm.trim().toLowerCase();
    if (!q) return activeViewingPeriodGroup.rows;
    return activeViewingPeriodGroup.rows.filter(
      (r) =>
        r.worker.fullName.toLowerCase().includes(q) ||
        r.worker.code.toLowerCase().includes(q) ||
        (r.worker.trade && r.worker.trade.toLowerCase().includes(q)) ||
        (r.worker.bankAccount && r.worker.bankAccount.toLowerCase().includes(q))
    );
  }, [activeViewingPeriodGroup, detailModalSearchTerm]);

  const handleOpenCreateTeamBatchModal = () => {
    setViewingTeamPeriodGroupKey(null);
    setEditingTeamPeriodGroup(null);
    setIsTeamBatchModalOpen(true);
  };

  const handleOpenEditTeamPeriodGroup = (group: TeamPayrollPeriodGroup) => {
    setViewingTeamPeriodGroupKey(null);
    setEditingTeamPeriodGroup(group);
    setIsTeamBatchModalOpen(true);
  };

  const handleSaveTeamBatchAndSync = (
    updatedTeamWorkers: SeasonalWorker[],
    noticeMessage: string,
    savedBatchCode: string
  ) => {
    setIsTeamBatchModalOpen(false);
    setEditingTeamPeriodGroup(null);
    setSeasonalCycleTab('TEAM');
    if (onBatchUpdateTeamWorkersList) {
      onBatchUpdateTeamWorkersList(updatedTeamWorkers);
    } else if (onUpdateSeasonalWorker) {
      updatedTeamWorkers.forEach((uw) => onUpdateSeasonalWorker(uw));
    }

    if (onSavePayrollToCloud) {
      setIsSavingPayroll(true);
      setSavePayrollNotice(`⏳ Đang ghi Kỳ lương Tổ Đội [${savedBatchCode}] vào Database...`);
      Promise.resolve(onSavePayrollToCloud())
        .then(() => {
          setSavePayrollNotice(noticeMessage);
          setTimeout(() => {
            setSavePayrollNotice(null);
          }, 6500);
        })
        .catch(() => {
          setSavePayrollNotice(
            `⚠ Đã lưu Kỳ lương [${savedBatchCode}] trên máy — vui lòng nhấn "Lưu Data" để đồng bộ lại Cloud.`
          );
        })
        .finally(() => {
          setIsSavingPayroll(false);
        });
    } else {
      setSavePayrollNotice(noticeMessage);
      setTimeout(() => {
        setSavePayrollNotice(null);
      }, 6500);
    }
  };

  const handleDeleteTeamPeriodGroup = async (group: TeamPayrollPeriodGroup) => {
    if (!group || group.voucherIds.size === 0) return;
    const mPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
    const nowTs = Date.now();
    const updatedWorkers: SeasonalWorker[] = [];

    allTeamSeasonalWorkers.forEach((w) => {
      const baseW = findTeamBaseWorker(w) || w;
      const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
      const hasTarget = vouchers.some((v) => group.voucherIds.has(v.id));
      if (!hasTarget) return;
      const remaining = vouchers.filter((v) => !group.voucherIds.has(v.id));
      const rebuilt = buildTeamPeriodRecordFromVouchers(
        { ...baseW, payrollCycleType: 'TEAM' },
        mPeriod,
        remaining
      );
      updatedWorkers.push({
        ...rebuilt,
        payrollCycleType: 'TEAM',
        updatedAt: nowTs,
      });
    });

    if (updatedWorkers.length > 0) {
      if (viewingTeamPeriodGroupKey === group.groupKey) {
        setViewingTeamPeriodGroupKey(null);
      }
      setConfirmDeleteGroupKey(null);
      if (onBatchUpdateTeamWorkersList) {
        onBatchUpdateTeamWorkersList(updatedWorkers);
      } else if (onUpdateSeasonalWorker) {
        updatedWorkers.forEach((uw) => onUpdateSeasonalWorker(uw));
      }
      setIsSavingPayroll(true);
      try {
        if (onSavePayrollToCloud) {
          await Promise.resolve(onSavePayrollToCloud());
        }
        setSavePayrollNotice(
          `✓ Đã xóa Kỳ lương [${group.displayCode} - ngày ${group.paymentDateDisplay}] (${updatedWorkers.length} công nhân) và cập nhật Database!`
        );
        setTimeout(() => {
          setSavePayrollNotice(null);
        }, 5500);
      } finally {
        setIsSavingPayroll(false);
      }
    }
  };

  const handleRemoveSingleWorkerFromPeriod = async (
    row: TeamPayrollPeriodWorkerRow,
    group: TeamPayrollPeriodGroup
  ) => {
    const baseW = findTeamBaseWorker(row.worker) || row.worker;
    const mPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
    const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
    const remaining = vouchers.filter((v) => v.id !== row.voucherId);
    const rebuilt = buildTeamPeriodRecordFromVouchers(
      { ...baseW, payrollCycleType: 'TEAM' },
      mPeriod,
      remaining
    );
    const updatedWorker: SeasonalWorker = {
      ...rebuilt,
      payrollCycleType: 'TEAM',
      updatedAt: Date.now(),
    };

    setConfirmRemoveVoucherId(null);
    if (onBatchUpdateTeamWorkersList) {
      onBatchUpdateTeamWorkersList([updatedWorker]);
    } else if (onUpdateSeasonalWorker) {
      onUpdateSeasonalWorker(updatedWorker);
    }

    if (onSavePayrollToCloud) {
      setIsSavingPayroll(true);
      try {
        await Promise.resolve(onSavePayrollToCloud());
        setSavePayrollNotice(
          `✓ Đã gỡ công nhân ${row.worker.fullName} khỏi ${group.displayCode} (${group.paymentDateDisplay}) & cập nhật Database!`
        );
        setTimeout(() => {
          setSavePayrollNotice(null);
        }, 5000);
      } finally {
        setIsSavingPayroll(false);
      }
    }
  };

  const handleExportSingleTeamPeriodExcel = (group: TeamPayrollPeriodGroup) => {
    const rows = group.rows.map((r, index) => ({
      STT: index + 1,
      'Mã kỳ lương': group.displayCode,
      'Ngày kỳ lương': group.paymentDateDisplay,
      'Dự án thi công': group.project,
      'Mã CN': r.worker.code,
      'Họ và tên công nhân': r.worker.fullName,
      'Ngành nghề': r.worker.trade,
      'Bậc thợ': r.worker.skillLevel,
      'Tiền lương kỳ này (VNĐ)': r.salaryByDays,
      'Phụ cấp & Thưởng': r.otherBonus,
      'TỔNG THU NHẬP': r.totalIncome,
      'Khấu trừ tạm ứng': r.advancePayment,
      'Thuế TNCN': r.personalIncomeTax,
      'THỰC LĨNH NHẬN (VNĐ)': r.netSalary,
      'Số tài khoản': r.worker.bankAccount || '',
      'Ngân hàng': r.worker.bankName || 'Tiền mặt',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachCongNhanKyLuong');
    const safeCode = group.displayCode.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDate = group.paymentDateDisplay.replace(/\//g, '-');
    XLSX.writeFile(wb, `KyLuongToDoi_${safeCode}_Ngay_${safeDate}.xlsx`);
  };

  // Dữ liệu thời vụ theo đúng Tab Chu kỳ đã khai báo (Bản Lương 1 Tuần / Bản Lương 2 Tuần / Bản Lương Tháng / Bản Lương Tổ Đội nhiều đợt)
  const scaledSeasonal = useMemo(() => {
    // Khi đang ở chế độ xem Bản Lương Thời Vụ (workerCategory === 'SEASONAL'), lọc đúng nhân viên thuộc Tab đang chọn
    const listByCycle =
      workerCategory === 'SEASONAL'
        ? activeSeasonalWorkers.filter((w) => (w.payrollCycleType || '1_MONTH') === seasonalCycleTab)
        : activeSeasonalWorkers;

    // RIÊNG TAB BẢN LƯƠNG TỔ ĐỘI: Tách mỗi đợt chi lương (TeamPaymentVoucher) thành 1 dòng lệnh độc lập để 1 người nhận lương nhiều lần trong tháng hiển thị đầy đủ từng đợt!
    if (workerCategory === 'SEASONAL' && seasonalCycleTab === 'TEAM') {
      const expandedRows: SeasonalWorker[] = [];
      listByCycle.forEach((w) => {
        const bankAcc = w.bankAccount || '';
        const bankNm = w.bankName || (w.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Vietcombank');
        const payMethod = w.paymentMethod || 'BANK';
        const baseW = findTeamBaseWorker(w) || w;
        const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);

        if (vouchers.length > 0) {
          vouchers.forEach((v, vIdx) => {
            expandedRows.push({
              ...w,
              bankAccount: bankAcc,
              bankName: bankNm,
              paymentMethod: payMethod,
              project: v.project || w.project,
              paymentDate: v.paymentDate || w.paymentDate,
              dailyRate: v.salaryByDays || 0,
              actualWorkDays: 1,
              salaryByDays: v.salaryByDays || 0,
              overtimeHours: 0,
              overtimePay: 0,
              mealAllowance: 0,
              travelSafetyAllowance: 0,
              otherBonus: v.otherBonus || 0,
              totalIncome: v.totalIncome ?? (v.salaryByDays || 0) + (v.otherBonus || 0),
              personalIncomeTax: v.personalIncomeTax || 0,
              advancePayment: v.advancePayment || 0,
              totalDeductions: v.totalDeductions ?? (v.personalIncomeTax || 0) + (v.advancePayment || 0),
              netSalary: v.netSalary ?? Math.max(0, (v.salaryByDays || 0) + (v.otherBonus || 0) - (v.advancePayment || 0)),
              selectedForAttendance: true,
              activeVoucherId: v.id,
              activeVoucherIndex: vIdx + 1,
              totalVouchersInMonth: vouchers.length,
              activeBatchCode: v.batchCode,
              teamVouchers: vouchers,
            });
          });
        } else {
          const adv = w.advancePayment || 0;
          expandedRows.push({
            ...w,
            bankAccount: bankAcc,
            bankName: bankNm,
            paymentMethod: payMethod,
            dailyRate: 0,
            actualWorkDays: 0,
            salaryByDays: 0,
            overtimeHours: 0,
            overtimePay: 0,
            mealAllowance: 0,
            travelSafetyAllowance: 0,
            otherBonus: 0,
            totalIncome: 0,
            personalIncomeTax: 0,
            advancePayment: adv,
            totalDeductions: adv,
            netSalary: 0,
            selectedForAttendance: false,
            activeVoucherId: undefined,
            activeVoucherIndex: undefined,
            totalVouchersInMonth: 0,
            activeBatchCode: undefined,
            teamVouchers: [],
          });
        }
      });

      return expandedRows.filter((w) => {
        if (seasonalAttendanceOnly) {
          const isParticipating = Boolean(w.selectedForAttendance) || (w.advancePayment || 0) > 0;
          if (!isParticipating) return false;
        }
        const term = searchTerm.toLowerCase();
        return (
          !term ||
          w.fullName.toLowerCase().includes(term) ||
          w.code.toLowerCase().includes(term) ||
          (w.project && w.project.toLowerCase().includes(term)) ||
          (w.activeBatchCode && w.activeBatchCode.toLowerCase().includes(term)) ||
          (w.activeVoucherIndex && `đợt ${w.activeVoucherIndex}`.includes(term))
        );
      });
    }

    const subPeriod =
      selectedSeasonalSubPeriodId !== 'ALL_PERIODS'
        ? seasonalSubPeriods.find((p) => p.id === selectedSeasonalSubPeriodId)
        : undefined;

    // Tính toán công & lương cho từng công nhân (theo kỳ con nếu chọn Tuần 1..5 / Đợt 1..2, hoặc tổng hợp tháng)
    const computedList = listByCycle.map((w) => {
      const bankAcc = w.bankAccount || '';
      const bankNm = w.bankName || (w.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Vietcombank');
      const payMethod = w.paymentMethod || 'BANK';
      if (subPeriod) {
        const wSub = getWorkerForPeriod(w, subPeriod);
        const adv = w.advancePayment || wSub.advancePayment || 0;
        const totalDed = (wSub.personalIncomeTax || 0) + adv;
        return {
          ...wSub,
          bankAccount: bankAcc || wSub.bankAccount || '',
          bankName: bankNm || wSub.bankName || 'Vietcombank',
          paymentMethod: payMethod,
          advancePayment: adv,
          totalDeductions: totalDed,
          netSalary: Math.max(0, (wSub.totalIncome || 0) - totalDed),
        };
      }
      const hasParticipated =
        (w.actualWorkDays || 0) > 0 ||
        (w.overtimeHours || 0) > 0 ||
        (w.payrollCycleType === 'TEAM' && Boolean(w.selectedForAttendance));
      const adv = w.advancePayment || 0;
      if (!hasParticipated) {
        return {
          ...w,
          bankAccount: bankAcc,
          bankName: bankNm,
          paymentMethod: payMethod,
          actualWorkDays: 0,
          salaryByDays: 0,
          overtimeHours: 0,
          overtimePay: 0,
          totalIncome: 0,
          personalIncomeTax: 0,
          advancePayment: adv,
          totalDeductions: adv,
          netSalary: 0,
          selectedForAttendance: false,
        };
      }
      const totalDed = (w.personalIncomeTax || 0) + adv;
      return {
        ...w,
        bankAccount: bankAcc,
        bankName: bankNm,
        paymentMethod: payMethod,
        advancePayment: adv,
        totalDeductions: totalDed,
        netSalary: Math.max(0, (w.totalIncome || 0) - totalDed),
        selectedForAttendance: true,
      };
    });

    return computedList.filter((w) => {
      if (seasonalAttendanceOnly) {
        const isParticipating =
          (w.actualWorkDays || 0) > 0 ||
          (w.overtimeHours || 0) > 0 ||
          (w.advancePayment || 0) > 0 ||
          (w.payrollCycleType === 'TEAM' && Boolean(w.selectedForAttendance));
        if (!isParticipating) return false;
      }
      const term = searchTerm.toLowerCase();
      return (
        !term ||
        w.fullName.toLowerCase().includes(term) ||
        w.code.toLowerCase().includes(term) ||
        (w.project && w.project.toLowerCase().includes(term))
      );
    });
  }, [
    activeSeasonalWorkers,
    seasonalWorkers,
    currentMonth,
    currentYear,
    workerCategory,
    seasonalCycleTab,
    selectedSeasonalSubPeriodId,
    seasonalSubPeriods,
    seasonalAttendanceOnly,
    searchTerm,
  ]);

  // Dữ liệu tổ đội theo chu kỳ - CHỈ TỔ ĐỘI ĐANG LÀM VIỆC (ACTIVE)
  const scaledTeam = useMemo(() => {
    const mult = cycleMultiplier;
    return teamWorkers
      .filter((t) => {
        if ((t.status || 'ACTIVE') !== 'ACTIVE') return false;
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
    () => syncedEmployeesForMonth.filter((e) => (e.status || 'ACTIVE') !== 'RESIGNED'),
    [syncedEmployeesForMonth]
  );
  const resignedEmployees = useMemo(
    () => syncedEmployeesForMonth.filter((e) => e.status === 'RESIGNED'),
    [syncedEmployeesForMonth]
  );

  // Số nhân sự đang tham gia chấm công trong kỳ này (có Công > 0 hoặc Giờ TC > 0 hoặc Nghỉ phép > 0)
  const participatingEmployeesCount = useMemo(
    () =>
      activeEmployees.filter(
        (e) => (e.actualWorkDays || 0) > 0 || (e.overtimeHours || 0) > 0 || (e.paidLeaveDays || 0) > 0
      ).length,
    [activeEmployees]
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
    return syncedEmployeesForMonth
      .filter((e) => {
        const isActive = (e.status || 'ACTIVE') === 'ACTIVE';
        const isParticipating =
          (e.actualWorkDays || 0) > 0 || (e.overtimeHours || 0) > 0 || (e.paidLeaveDays || 0) > 0;

        if (!showResignedHistory) {
          if (!isActive) return false;
          // Khi bật "Chỉ hiện NV tham gia chấm công" và có ít nhất 1 nhân viên đã chấm công trong tháng
          if (attendanceOnly && participatingEmployeesCount > 0 && !isParticipating) {
            return false;
          }
        } else {
          if (isActive) return false;
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
      })
      .map((emp) => {
        const mult = cycleMultiplier;
        const hasParticipated =
          (emp.actualWorkDays || 0) > 0 || (emp.overtimeHours || 0) > 0 || (emp.paidLeaveDays || 0) > 0;

        if (!hasParticipated) {
          const scaledAdvance = Math.round((emp.advancePayment || 0) * mult);
          return {
            ...emp,
            actualWorkDays: 0,
            standardWorkDays: Number(((emp.standardWorkDays || 26) * mult).toFixed(1)),
            baseSalary: Math.round(emp.baseSalary * mult),
            salaryByActualDays: 0,
            overtimePay: 0,
            totalIncome: 0,
            totalInsurance: 0,
            personalIncomeTax: 0,
            advancePayment: scaledAdvance,
            totalDeductions: scaledAdvance,
            netSalary: 0,
          };
        }

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
        const yearBonus = periodCycle === 'YEAR' ? emp.baseSalary : 0;
        const scaledTotalIncome = scaledSalaryByDays + scaledOT + scaledAllowances + yearBonus;
        const scaledInsurance = Math.round((emp.totalInsurance || 0) * mult);
        const scaledTax = Math.round((emp.personalIncomeTax || 0) * mult);
        const scaledAdvance = Math.round((emp.advancePayment || 0) * mult);
        const scaledDeductions = scaledInsurance + scaledTax + scaledAdvance;
        const scaledNet = Math.max(0, scaledTotalIncome - scaledDeductions);

        return {
          ...emp,
          unionFee: 0,
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
      })
      .sort((a, b) => {
        if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [
    syncedEmployeesForMonth,
    selectedDept,
    searchTerm,
    attendanceOnly,
    participatingEmployeesCount,
    salaryTypeFilter,
    showResignedHistory,
    cycleMultiplier,
    periodCycle,
  ]);

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
      if (seasonalCycleTab === 'TEAM') {
        const wb = XLSX.utils.book_new();
        const summaryRows = filteredTeamPeriodGroups.map((g, idx) => ({
          STT: idx + 1,
          'Ngày kỳ lương': g.paymentDateDisplay,
          'Mã kỳ lương': g.displayCode,
          'Dự án thi công': g.project,
          'Số công nhân nhận lương': g.workerCount,
          'Tổng tiền lương kỳ (VNĐ)': g.totalSalaryByDays,
          'Phụ cấp & Thưởng': g.totalBonus,
          'TỔNG THU NHẬP': g.totalIncome,
          'Khấu trừ tạm ứng': g.totalAdvance,
          'Thuế TNCN': g.totalTax,
          'TỔNG THỰC LĨNH KỲ (VNĐ)': g.totalNetSalary,
        }));
        const detailRows: Record<string, string | number>[] = [];
        let detailStt = 1;
        filteredTeamPeriodGroups.forEach((g) => {
          g.rows.forEach((r) => {
            detailRows.push({
              STT: detailStt++,
              'Ngày kỳ lương': g.paymentDateDisplay,
              'Mã kỳ lương': g.displayCode,
              'Dự án thi công': g.project,
              'Mã CN': r.worker.code,
              'Họ và tên công nhân': r.worker.fullName,
              'Ngành nghề': r.worker.trade,
              'Bậc thợ': r.worker.skillLevel,
              'Tiền lương kỳ này (VNĐ)': r.salaryByDays,
              'Phụ cấp & Thưởng': r.otherBonus,
              'TỔNG THU NHẬP': r.totalIncome,
              'Khấu trừ tạm ứng': r.advancePayment,
              'Thuế TNCN': r.personalIncomeTax,
              'THỰC LĨNH NHẬN (VNĐ)': r.netSalary,
              'Số tài khoản': r.worker.bankAccount || '',
              'Ngân hàng': r.worker.bankName || 'Tiền mặt',
            });
          });
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ThongKeKyLuongToDoi');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'ChiTietCongNhanTheoKy');
        XLSX.writeFile(wb, `ThongKeKyLuong_ToDoi_${cycleSuffix}_${config.name.replace(/\s+/g, '_')}.xlsx`);
        return;
      }

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
      {/* Banner chuyên dụng nếu ở chế độ Bảng lương riêng biệt */}
      {forcedCategory === 'PERMANENT' && (
        <div className="bg-gradient-to-r from-[#0f3d64] to-slate-900 text-white p-3.5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide flex items-center gap-2">
                3. BẢN LƯƠNG NHÂN VIÊN CHÍNH THỨC
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-500 text-white">
                  {filteredEmployees.length} nhân sự
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Lương theo chức danh & phòng ban, tính công chuẩn 26 ngày, BHXH 10.5%, thuế TNCN lũy tiến từng phần và cấn trừ tạm ứng.
              </p>
            </div>
          </div>
          <div className="text-xs text-sky-200 bg-sky-950/60 px-3 py-1.5 rounded-lg border border-sky-800/40 font-semibold">
            Kỳ tính lương: <strong className="text-white">{config.periodCode}</strong>
          </div>
        </div>
      )}

      {forcedCategory === 'SEASONAL' && (
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-amber-700 to-slate-900 text-white p-3.5 rounded-xl shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
                <HardHat className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h2 className="text-base font-black tracking-wide flex items-center gap-2">
                  2.3 BẢN LƯƠNG NHÂN VIÊN THỜI VỤ —{' '}
                  {seasonalCycleTab === '1_WEEK'
                    ? 'BẢN LƯƠNG 1 TUẦN'
                    : seasonalCycleTab === '2_WEEKS'
                    ? 'BẢN LƯƠNG 2 TUẦN'
                    : seasonalCycleTab === 'TEAM'
                    ? 'BẢN LƯƠNG TỔ ĐỘI'
                    : 'BẢN LƯƠNG THÁNG'}
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                    {seasonalCycleTab === 'TEAM'
                      ? `${teamPayrollPeriodGroups.length} kỳ lương (${teamSeasonalWorkersCount} công nhân)`
                      : `${scaledSeasonal.length} công nhân`}
                  </span>
                </h2>
                <p className="text-xs text-amber-200/90">
                  Nhân viên khai báo <strong>Lương 1 Tuần</strong> hiện ở Tab 1 Tuần, <strong>Lương 2 Tuần</strong> hiện ở Tab 2 Tuần, <strong>Lương Tháng</strong> hiện ở Tab Lương Tháng, và <strong>Tổ Đội</strong> chọn trả lương tại Tab Bản Lương Tổ Đội.
                </p>
              </div>
            </div>
            <div className="text-xs text-amber-200 bg-amber-950/60 px-3 py-1.5 rounded-lg border border-amber-800/40 font-semibold">
              Kỳ tính lương: <strong className="text-white">{config.periodCode}</strong>
            </div>
          </div>

          {/* 4 TAB BẢN LƯƠNG NHÂN VIÊN THỜI VỤ: BẢN LƯƠNG 1 TUẦN | BẢN LƯƠNG 2 TUẦN | BẢN LƯƠNG THÁNG | BẢN LƯƠNG TỔ ĐỘI */}
          <div className="bg-white p-3 rounded-xl border-2 border-amber-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectSeasonalCycleTab('1_WEEK')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                    seasonalCycleTab === '1_WEEK'
                      ? 'bg-[#0f3d64] text-white shadow-sm font-black ring-2 ring-[#0f3d64]/20'
                      : 'bg-slate-50 text-slate-700 hover:bg-sky-50 border border-slate-300'
                  }`}
                >
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>Bản Lương 1 Tuần</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                      seasonalCycleTab === '1_WEEK'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-sky-100 text-sky-900'
                    }`}
                  >
                    {oneWeekWorkersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectSeasonalCycleTab('2_WEEKS')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                    seasonalCycleTab === '2_WEEKS'
                      ? 'bg-[#0f3d64] text-white shadow-sm font-black ring-2 ring-[#0f3d64]/20'
                      : 'bg-slate-50 text-slate-700 hover:bg-amber-50 border border-slate-300'
                  }`}
                >
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Bản Lương 2 Tuần</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                      seasonalCycleTab === '2_WEEKS'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {twoWeeksWorkersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectSeasonalCycleTab('1_MONTH')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                    seasonalCycleTab === '1_MONTH'
                      ? 'bg-[#0f3d64] text-white shadow-sm font-black ring-2 ring-[#0f3d64]/20'
                      : 'bg-slate-50 text-slate-700 hover:bg-emerald-50 border border-slate-300'
                  }`}
                >
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>Bản Lương Tháng</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                      seasonalCycleTab === '1_MONTH'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {monthlySeasonalWorkersCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectSeasonalCycleTab('TEAM')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                    seasonalCycleTab === 'TEAM'
                      ? 'bg-purple-900 text-white shadow-sm font-black ring-2 ring-purple-700/30'
                      : 'bg-purple-50/70 text-purple-950 hover:bg-purple-100 border border-purple-300'
                  }`}
                >
                  <Building className="w-4 h-4 text-purple-400" />
                  <span>Bản Lương Tổ Đội</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                      seasonalCycleTab === 'TEAM'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-purple-200 text-purple-950'
                    }`}
                  >
                    {teamPayrollPeriodGroups.length} kỳ
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <MonthYearPicker
                  month={config.month || 9}
                  year={config.year || 2026}
                  onChange={onChangeMonthYear}
                  label="Chọn kỳ xem lương:"
                />

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={
                      seasonalCycleTab === 'TEAM'
                        ? 'Tìm ngày kỳ lương, mã KL, dự án, tên CN...'
                        : 'Tìm tên thợ, mã, dự án...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56 focus:outline-sky-600"
                  />
                </div>

                {seasonalCycleTab !== 'TEAM' && (
                  <button
                    type="button"
                    onClick={() => setSeasonalAttendanceOnly(!seasonalAttendanceOnly)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border font-bold flex items-center gap-1 transition cursor-pointer ${
                      seasonalAttendanceOnly
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300'
                    }`}
                    title="Chuyển đổi giữa hiển thị toàn bộ thợ thuộc tab này hoặc chỉ hiện thợ đã có công > 0"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>{seasonalAttendanceOnly ? '🟢 Chỉ hiện thợ đã có công' : 'Hiện tất cả thợ trong Tab'}</span>
                  </button>
                )}

                {seasonalCycleTab === 'TEAM' && (onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) && (
                  <button
                    type="button"
                    onClick={handleOpenCreateTeamBatchModal}
                    className="px-3.5 py-1.5 bg-purple-800 hover:bg-purple-900 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs ring-2 ring-purple-400/30"
                    title="Tạo Kỳ Lương Tổ Đội (KL 0001+): Tick chọn một hoặc nhiều công nhân Tổ Đội, nhập tiền lương từng người và lưu thẳng vào Database"
                  >
                    <Layers className="w-4 h-4 text-amber-300" />
                    <span>+ Tạo Kỳ Lương Tổ Đội</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSavePayrollTable}
                  disabled={isSavingPayroll || cloudSyncStatus === 'syncing'}
                  className={`px-3.5 py-1.5 disabled:opacity-60 rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs ${
                    hasUnsavedChanges
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-400/40'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                  title="Nhấn nút Lưu Data để lưu toàn bộ Bản Lương vừa nhập và đẩy lên Supabase Cloud"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {isSavingPayroll || cloudSyncStatus === 'syncing'
                      ? 'Đang lưu Data...'
                      : hasUnsavedChanges
                      ? 'Lưu Data (Chưa lưu)'
                      : 'Lưu Data'}
                  </span>
                </button>

                {supabaseReady ? (
                  <>
                    {onReloadFromCloud && (
                      <button
                        type="button"
                        onClick={handleReloadFromCloudClick}
                        disabled={isReloadingPayroll || hasUnsavedChanges || cloudSyncStatus === 'syncing'}
                        className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-[#0f3d64] border border-sky-300 disabled:opacity-50 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title={
                          hasUnsavedChanges
                            ? 'Đang có dữ liệu chưa lưu — vui lòng nhấn Lưu Data trước khi tải từ Cloud'
                            : 'Kéo dữ liệu Bản Lương mới nhất vừa lưu từ máy khác trên Supabase Cloud về'
                        }
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isReloadingPayroll ? 'animate-spin' : ''}`} />
                        <span>{isReloadingPayroll ? 'Đang tải...' : 'Đồng bộ Cloud'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopySyncLink}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      title="Copy Link Đồng Bộ có gắn sẵn cấu hình Cloud để mở trên máy tính / trình duyệt khác tự động nhận ngay Bản Lương"
                    >
                      {copiedSyncLink ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-indigo-600" />
                      )}
                      <span>{copiedSyncLink ? 'Đã copy Link!' : 'Link Đồng Bộ'}</span>
                    </button>
                  </>
                ) : (
                  onOpenSupabaseModal && (
                    <button
                      type="button"
                      onClick={onOpenSupabaseModal}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                      title="Kết nối Supabase Cloud để tự động tải và đồng bộ Bản Lương giữa các máy tính"
                    >
                      <Cloud className="w-3.5 h-3.5" />
                      <span>Kết nối Cloud</span>
                    </button>
                  )
                )}

                <button
                  id="btn-export-excel"
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất Excel (.xlsx)</span>
                </button>
              </div>
            </div>

            {!supabaseReady && onOpenSupabaseModal && (
              <div className="bg-amber-50 border border-amber-300 text-amber-950 px-3.5 py-2.5 rounded-lg text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      <strong>Trình duyệt này chưa có thông số Supabase Cloud:</strong> Sang tab đang có dữ liệu (50 nhân sự) &rarr; bấm{' '}
                      <strong>Quản lý Supabase Cloud</strong> (góc dưới trái) &rarr; bấm <strong>Sao chép link Máy 2</strong>, rồi dán thẳng vào ô dưới đây:
                    </span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={quickSyncLinkInput}
                      onChange={(e) => setQuickSyncLinkInput(e.target.value)}
                      placeholder="Dán 'Link Máy 2' (#sb_url=...) hoặc nội dung .env vào đây để nhận Bản Lương ngay..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-400 rounded font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickConnectFromBanner}
                    disabled={isReloadingPayroll}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-black text-xs cursor-pointer shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isReloadingPayroll ? 'animate-spin' : ''}`} />
                    <span>{isReloadingPayroll ? 'Đang tải Bản Lương...' : 'Kết nối & Tải Bản Lương ngay'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSupabaseModal}
                    className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-400 rounded font-bold text-xs cursor-pointer shrink-0"
                  >
                    Mở bảng cấu hình / File .json
                  </button>
                </div>
              </div>
            )}

            {savePayrollNotice && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{savePayrollNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSavePayrollNotice(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-black px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Thanh chọn Tuần (W1..W5) hoặc Đợt (BI1..BI2) khi đang ở Tab Bản Lương 1 Tuần hoặc Bản Lương 2 Tuần */}
            {(seasonalCycleTab === '1_WEEK' || seasonalCycleTab === '2_WEEKS') && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200 text-xs">
                <span className="font-bold text-slate-600 mr-1">
                  {seasonalCycleTab === '1_WEEK' ? 'Chọn tuần trong tháng:' : 'Chọn đợt 2 tuần trong tháng:'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSeasonalSubPeriodId('ALL_PERIODS')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    selectedSeasonalSubPeriodId === 'ALL_PERIODS'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                  }`}
                >
                  Tổng hợp cả tháng {config.periodCode}
                </button>
                {seasonalSubPeriods.map((p) => {
                  const workersInThisSubPeriod = activeSeasonalWorkers.filter((w) => {
                    if ((w.payrollCycleType || '1_MONTH') !== seasonalCycleTab) return false;
                    const wPeriod = getWorkerForPeriod(w, p);
                    return (wPeriod.actualWorkDays || 0) > 0 || (wPeriod.overtimeHours || 0) > 0;
                  }).length;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedSeasonalSubPeriodId(p.id)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                        selectedSeasonalSubPeriodId === p.id
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-amber-50 border border-slate-300'
                      }`}
                    >
                      <span>{p.label}</span>
                      {workersInThisSubPeriod > 0 && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                            selectedSeasonalSubPeriodId === p.id
                              ? 'bg-white text-amber-900'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {workersInThisSubPeriod} có công
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Thanh hướng dẫn gọn cho Bảng Thống Kê Kỳ Lương Tổ Đội — CHỈ HIỆN TẠI TAB BẢN LƯƠNG TỔ ĐỘI */}
            {seasonalCycleTab === 'TEAM' && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-purple-200/80 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-purple-950">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 border border-purple-200 font-black text-[11px] uppercase tracking-wide">
                    <Calendar className="w-3.5 h-3.5 text-purple-700" />
                    <span>
                      Thống kê Kỳ Lương Tổ Đội Tháng {String(currentMonth).padStart(2, '0')}/{currentYear}:{' '}
                      {teamPayrollPeriodGroups.length} kỳ lương ({totalTeamOrdersCount} lượt nhận lương)
                    </span>
                  </span>
                  <span className="text-slate-600 font-medium">
                    👉 Nhấn trực tiếp vào dòng <strong>Kỳ Lương</strong> bất kỳ bên dưới để mở danh sách chi tiết công nhân nhận lương của kỳ đó.
                  </span>
                </div>
                <div className="font-mono font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                  Tổng thực lĩnh tháng:{' '}
                  {formatNumberOnly(
                    teamPayrollPeriodGroups.reduce((s, g) => s + g.totalNetSalary, 0)
                  )}{' '}
                  đ
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4 Chế độ chu kỳ lương: Chỉ hiển thị khi KHÔNG phải Bản Lương Thời Vụ cố định */}
      {forcedCategory !== 'SEASONAL' && (
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
      )}

      {/* 3 Nhóm nhân sự: Chỉ hiển thị khi xem Tổng hợp (không cố định nhóm) */}
      {!forcedCategory && (
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
      )}

      {/* Top Filter & Actions (Dành cho Nhân viên chính thức / Tổng hợp) */}
      {forcedCategory !== 'SEASONAL' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              {showResignedHistory ? 'Hồ sơ lưu trữ lịch sử lương nhân viên đã nghỉ' : 'Bảng lương chi tiết'} — {periodCycle === 'WEEK' ? `Tuần ${selectedWeek} (Tháng ${config.periodCode})` : periodCycle === 'QUARTER' ? `Quý ${selectedQuarter} Năm ${config.year || 2026}` : periodCycle === 'YEAR' ? `Cả Năm ${config.year || 2026}` : config.period}
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              ({filtered.length} {showResignedHistory ? 'nhân sự đã thôi việc' : 'nhân viên đang làm việc'})
            </span>

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
                title="Chuyển đổi giữa chỉ hiển thị nhân sự đã tham gia chấm công trong kỳ và hiển thị toàn bộ nhân sự đang làm việc"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>
                  {attendanceOnly
                    ? `🟢 NV tham gia chấm công (${participatingEmployeesCount})`
                    : `Hiện tất cả (${activeEmployees.length})`}
                </span>
              </button>
            )}

            {onSavePayrollToCloud && (
              <button
                type="button"
                onClick={handleSavePayrollTable}
                disabled={isSavingPayroll || cloudSyncStatus === 'syncing'}
                className={`px-3 py-1 rounded text-xs font-black flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60 ${
                  hasUnsavedChanges
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-400/40'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
                title="Nhấn nút Lưu Data để lưu toàn bộ thông tin Bản Lương vừa nhập và đồng bộ Cloud"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {isSavingPayroll || cloudSyncStatus === 'syncing'
                    ? 'Đang lưu Data...'
                    : hasUnsavedChanges
                    ? 'Lưu Data (Chưa lưu)'
                    : 'Lưu Data'}
                </span>
              </button>
            )}

            {supabaseReady ? (
              <>
                {onReloadFromCloud && (
                  <button
                    type="button"
                    onClick={handleReloadFromCloudClick}
                    disabled={isReloadingPayroll || hasUnsavedChanges || cloudSyncStatus === 'syncing'}
                    className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-[#0f3d64] border border-sky-300 disabled:opacity-50 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title={
                      hasUnsavedChanges
                        ? 'Đang có dữ liệu chưa lưu — vui lòng nhấn Lưu Data trước khi tải từ Cloud'
                        : 'Kéo dữ liệu Bản Lương mới nhất từ Supabase Cloud về'
                    }
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-sky-600 ${isReloadingPayroll ? 'animate-spin' : ''}`} />
                    <span>{isReloadingPayroll ? 'Đang tải...' : 'Đồng bộ Cloud'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopySyncLink}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Copy Link Đồng Bộ có gắn sẵn cấu hình Cloud để mở trên máy tính / trình duyệt khác tự động nhận ngay Bản Lương"
                >
                  {copiedSyncLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{copiedSyncLink ? 'Đã copy Link!' : 'Link Đồng Bộ'}</span>
                </button>
              </>
            ) : (
              onOpenSupabaseModal && (
                <button
                  type="button"
                  onClick={onOpenSupabaseModal}
                  className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="Kết nối Supabase Cloud để tự động tải và đồng bộ Bản Lương giữa các máy tính"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Kết nối Cloud</span>
                </button>
              )
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
      )}

      {forcedCategory !== 'SEASONAL' && !supabaseReady && onOpenSupabaseModal && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 px-3.5 py-2.5 rounded-lg text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Trình duyệt này chưa có thông số Supabase Cloud:</strong> Sang tab đang có dữ liệu &rarr; bấm{' '}
                <strong>Quản lý Supabase Cloud</strong> (góc dưới trái) &rarr; bấm <strong>Sao chép link Máy 2</strong>, rồi dán thẳng vào ô dưới đây:
              </span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickSyncLinkInput}
                onChange={(e) => setQuickSyncLinkInput(e.target.value)}
                placeholder="Dán 'Link Máy 2' (#sb_url=...) hoặc nội dung .env vào đây để nhận Bản Lương ngay..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-400 rounded font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={handleQuickConnectFromBanner}
              disabled={isReloadingPayroll}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-black text-xs cursor-pointer shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReloadingPayroll ? 'animate-spin' : ''}`} />
              <span>{isReloadingPayroll ? 'Đang tải Bản Lương...' : 'Kết nối & Tải Bản Lương ngay'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenSupabaseModal}
              className="px-2.5 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-400 rounded font-bold text-xs cursor-pointer shrink-0"
            >
              Mở bảng cấu hình / File .json
            </button>
          </div>
        </div>
      )}

      {forcedCategory !== 'SEASONAL' && savePayrollNotice && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savePayrollNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavePayrollNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-black px-1.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

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
              <th className="p-2 border-r border-sky-800 text-right bg-amber-900 font-bold">TỔNG KHẤU TRỪ</th>
              <th className="p-2 border-r border-sky-800 text-right bg-emerald-900 font-bold">THỰC LĨNH</th>
              <th className="p-2 border-r border-sky-800">Số tài khoản</th>
              <th className="p-2 border-r border-sky-800">Ngân hàng</th>
              <th className="p-2 text-center sticky right-0 bg-[#0f3d64] z-30">In bản lương</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={21} className="p-8 text-center text-slate-400">
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
                  <td
                    onClick={() => {
                      const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                      setEditingEmployee(original);
                    }}
                    title="Bấm để chỉnh sửa thông tin hồ sơ, lương và phụ cấp nhân viên"
                    className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50 font-bold text-slate-900 hover:text-sky-700 cursor-pointer z-10"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="underline decoration-dotted decoration-slate-300 underline-offset-2">{emp.fullName}</span>
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
                <td
                  onClick={() => {
                    const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                    setEditingEmployee(original);
                  }}
                  title="Bấm để chỉnh sửa Phụ cấp trách nhiệm"
                  className="p-1.5 border-r border-slate-200 text-right font-mono font-semibold text-[#0f3d64] hover:bg-sky-50 cursor-pointer"
                >
                  {(emp.responsibilityAllowance || 0) > 0 ? formatNumberOnly(emp.responsibilityAllowance) : '-'}
                </td>
                <td
                  onClick={() => {
                    const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                    setEditingEmployee(original);
                  }}
                  title="Bấm để chỉnh sửa Phụ cấp dự án"
                  className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-emerald-700 hover:bg-sky-50 cursor-pointer"
                >
                  {(emp.projectAllowance || 0) > 0 ? formatNumberOnly(emp.projectAllowance) : '-'}
                </td>
                <td
                  onClick={() => {
                    const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                    setEditingEmployee(original);
                  }}
                  title="Bấm để chỉnh sửa Phụ cấp khác (cơm, xăng xe, điện thoại)"
                  className="p-1.5 border-r border-slate-200 text-right font-mono hover:bg-sky-50 cursor-pointer"
                >
                  {formatNumberOnly(emp.mealAllowance + emp.phoneTravelAllowance)}
                </td>
                <td
                  onClick={() => {
                    const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                    setEditingEmployee(original);
                  }}
                  title="Bấm để chỉnh sửa Thưởng KPI"
                  className="p-1.5 border-r border-slate-200 text-right font-mono hover:bg-sky-50 cursor-pointer"
                >
                  {formatNumberOnly(emp.kpiBonus)}
                </td>
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
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-amber-950 bg-amber-50/70">
                  {formatNumberOnly(emp.totalDeductions)}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[12px]">
                  {formatNumberOnly(emp.netSalary)}
                </td>
                <td className="p-1.5 border-r border-slate-200 font-mono text-slate-700">
                  {onUpdateEmployee ? (
                    <input
                      type="text"
                      value={emp.bankAccount || ''}
                      placeholder="Nhập số TK..."
                      onChange={(e) => {
                        const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                        onUpdateEmployee({
                          ...original,
                          bankAccount: e.target.value,
                        });
                      }}
                      className="w-32 font-mono font-bold text-blue-900 bg-white border border-slate-200 hover:border-sky-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs outline-none transition-colors placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
                      title="Số tài khoản ngân hàng của nhân viên"
                    />
                  ) : (
                    emp.bankAccount || '-'
                  )}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-slate-700 font-medium">
                  {onUpdateEmployee ? (
                    <input
                      type="text"
                      value={emp.bankName || ''}
                      placeholder="Ngân hàng..."
                      onChange={(e) => {
                        const original = employees.find((item) => item.id === emp.id || item.code === emp.code) || emp;
                        onUpdateEmployee({
                          ...original,
                          bankName: e.target.value,
                        });
                      }}
                      className="w-28 text-slate-800 font-medium bg-white border border-slate-200 hover:border-sky-400 focus:border-sky-500 rounded px-1.5 py-0.5 text-xs outline-none transition-colors"
                      title="Ngân hàng thụ hưởng"
                    />
                  ) : (
                    emp.bankName || '-'
                  )}
                </td>
                <td className="p-1.5 text-center sticky right-0 bg-white hover:bg-sky-50 z-10 border-l border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPrintingPermanentEmployee(emp)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                    title={`In bản lương của ${emp.fullName}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In bản lương</span>
                  </button>
                </td>
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
              <td className="p-2 text-right border-r border-slate-300 font-mono text-amber-900 bg-amber-100 font-black">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.totalDeductions, 0))}
              </td>
              <td className="p-2 text-right border-r border-slate-300 font-mono text-emerald-900 bg-emerald-100 font-black text-[12px]">
                {formatNumberOnly(filtered.reduce((s, e) => s + e.netSalary, 0))}
              </td>
              <td colSpan={3} className="p-2 text-center text-slate-500 font-normal">
                Chi trả chuyển khoản ngân hàng
              </td>
            </tr>
          </tfoot>
        </table>
        )}

        {/* BẢNG THỐNG KÊ CÁC KỲ LƯƠNG TỔ ĐỘI THEO NGÀY (CHỈ RIÊNG TAB BẢN LƯƠNG TỔ ĐỘI — CLICK VÀO DÒNG ĐỂ XEM DANH SÁCH CÔNG NHÂN) */}
        {workerCategory === 'SEASONAL' && seasonalCycleTab === 'TEAM' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-purple-950 text-white sticky top-0 z-20 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-2.5 border-r border-purple-800 text-center w-12">STT</th>
                <th className="p-2.5 border-r border-purple-800 text-center">Ngày kỳ lương</th>
                <th className="p-2.5 border-r border-purple-800">Mã kỳ lương</th>
                <th className="p-2.5 border-r border-purple-800">Dự án thi công</th>
                <th className="p-2.5 border-r border-purple-800 text-center">Quân số nhận lương</th>
                <th className="p-2.5 border-r border-purple-800 text-right bg-purple-900">Tổng tiền lương kỳ</th>
                <th className="p-2.5 border-r border-purple-800 text-right">Phụ cấp & Thưởng</th>
                <th className="p-2.5 border-r border-purple-800 text-right">Khấu trừ tạm ứng</th>
                <th className="p-2.5 border-r border-purple-800 text-right">Thuế TNCN</th>
                <th className="p-2.5 border-r border-purple-800 text-right bg-emerald-900 font-black">
                  TỔNG THỰC LĨNH KỲ (VNĐ)
                </th>
                <th className="p-2.5 text-center sticky right-0 bg-purple-950 z-30">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filteredTeamPeriodGroups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-500">
                    <div className="space-y-2.5 flex flex-col items-center">
                      <Calendar className="w-8 h-8 text-purple-400" />
                      <p className="font-black text-sm text-slate-800">
                        Chưa có Kỳ Lương Tổ Đội nào trong Tháng {String(currentMonth).padStart(2, '0')}/{currentYear}
                      </p>
                      <p className="text-xs text-slate-500 max-w-lg whitespace-normal">
                        Nhấn nút <strong>+ Tạo Kỳ Lương Tổ Đội</strong> để lập kỳ lương theo ngày, tick chọn một hoặc nhiều công nhân Tổ Đội và lưu vào Database.
                      </p>
                      {(onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) && (
                        <button
                          type="button"
                          onClick={handleOpenCreateTeamBatchModal}
                          className="mt-1 px-4 py-2 bg-purple-800 hover:bg-purple-900 text-white rounded-xl text-xs font-black inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        >
                          <Layers className="w-4 h-4 text-amber-300" />
                          <span>+ Tạo Kỳ Lương Tổ Đội (Tick chọn CN)</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTeamPeriodGroups.map((g, idx) => {
                  const isConfirmingDelete = confirmDeleteGroupKey === g.groupKey;
                  const sampleNames = g.rows
                    .slice(0, 3)
                    .map((r) => r.worker.fullName)
                    .join(', ');
                  const remainingCount = Math.max(0, g.workerCount - 3);

                  return (
                    <tr
                      key={g.groupKey}
                      onClick={() => {
                        setDetailModalSearchTerm('');
                        setConfirmRemoveVoucherId(null);
                        setViewingTeamPeriodGroupKey(g.groupKey);
                      }}
                      className="hover:bg-purple-50/70 transition-colors cursor-pointer group"
                      title={`Nhấn vào dòng này để xem danh sách ${g.workerCount} công nhân nhận lương của ${g.displayCode} (ngày ${g.paymentDateDisplay})`}
                    >
                      <td className="p-2.5 border-r border-slate-200 text-center text-slate-500 font-mono font-bold">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 font-mono font-black text-purple-950 text-xs">
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          <span>{g.paymentDateDisplay}</span>
                        </span>
                      </td>
                      <td className="p-2.5 border-r border-slate-200">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs border ${
                              g.isLegacyDateGroup
                                ? 'bg-slate-100 text-slate-800 border-slate-300'
                                : 'bg-amber-100 text-amber-950 border-amber-400'
                            }`}
                          >
                            {g.displayCode}
                          </span>
                          <span className="text-[11px] text-purple-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Click xem danh sách</span>
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 font-bold text-[#0f3d64]">
                        {g.project}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-center">
                        <div className="flex flex-col items-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-950 border border-sky-300 font-black text-xs">
                            {g.workerCount} công nhân
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5 max-w-[230px] truncate">
                            {sampleNames}
                            {remainingCount > 0 ? ` (+${remainingCount} người)` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-bold text-slate-900 bg-purple-50/30">
                        {formatNumberOnly(g.totalSalaryByDays)} đ
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-semibold text-emerald-700">
                        {g.totalBonus > 0 ? `+${formatNumberOnly(g.totalBonus)} đ` : '-'}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-semibold text-rose-700">
                        {g.totalAdvance > 0 ? `-${formatNumberOnly(g.totalAdvance)} đ` : '-'}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono text-rose-700">
                        {g.totalTax > 0 ? `-${formatNumberOnly(g.totalTax)} đ` : '-'}
                      </td>
                      <td className="p-2.5 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/80 text-[13px]">
                        {formatNumberOnly(g.totalNetSalary)} đ
                      </td>
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 text-center sticky right-0 bg-white group-hover:bg-purple-50/90 z-10 border-l border-slate-200"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailModalSearchTerm('');
                              setConfirmRemoveVoucherId(null);
                              setViewingTeamPeriodGroupKey(g.groupKey);
                            }}
                            className="px-2.5 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                            title={`Mở xem danh sách ${g.workerCount} công nhân nhận lương của ${g.displayCode}`}
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-300" />
                            <span>Xem DS ({g.workerCount})</span>
                          </button>

                          {(onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditTeamPeriodGroup(g)}
                              className="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                              title={`Chỉnh sửa danh sách công nhân & tiền lương của kỳ ${g.displayCode}`}
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Sửa kỳ</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleExportSingleTeamPeriodExcel(g)}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer"
                            title={`Xuất file Excel danh sách công nhân của kỳ ${g.displayCode}`}
                          >
                            <Download className="w-3 h-3" />
                            <span>Excel</span>
                          </button>

                          {(onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) &&
                            (isConfirmingDelete ? (
                              <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-300 rounded-lg px-1.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTeamPeriodGroup(g)}
                                  className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-black cursor-pointer"
                                >
                                  Xóa!
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteGroupKey(null)}
                                  className="px-1 py-0.5 text-slate-600 hover:text-slate-900 text-[10px] font-bold cursor-pointer"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteGroupKey(g.groupKey)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                                title={`Xóa kỳ lương ${g.displayCode}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTeamPeriodGroups.length > 0 && (
              <tfoot className="bg-purple-100 font-black text-slate-900 sticky bottom-0 border-t-2 border-purple-400 text-xs">
                <tr>
                  <td colSpan={4} className="p-2.5 text-center uppercase tracking-wide border-r border-purple-300 text-purple-950">
                    TỔNG CỘNG THÁNG {String(currentMonth).padStart(2, '0')}/{currentYear} ({filteredTeamPeriodGroups.length} KỲ LƯƠNG)
                  </td>
                  <td className="p-2.5 text-center border-r border-purple-300 font-mono text-sky-950">
                    {filteredTeamPeriodGroups.reduce((s, g) => s + g.workerCount, 0)} lượt CN
                  </td>
                  <td className="p-2.5 text-right border-r border-purple-300 font-mono text-purple-950">
                    {formatNumberOnly(filteredTeamPeriodGroups.reduce((s, g) => s + g.totalSalaryByDays, 0))} đ
                  </td>
                  <td className="p-2.5 text-right border-r border-purple-300 font-mono text-emerald-800">
                    {formatNumberOnly(filteredTeamPeriodGroups.reduce((s, g) => s + g.totalBonus, 0))} đ
                  </td>
                  <td className="p-2.5 text-right border-r border-purple-300 font-mono text-rose-800">
                    {formatNumberOnly(filteredTeamPeriodGroups.reduce((s, g) => s + g.totalAdvance, 0))} đ
                  </td>
                  <td className="p-2.5 text-right border-r border-purple-300 font-mono text-rose-800">
                    {formatNumberOnly(filteredTeamPeriodGroups.reduce((s, g) => s + g.totalTax, 0))} đ
                  </td>
                  <td className="p-2.5 text-right border-r border-purple-300 font-mono text-emerald-950 bg-emerald-200 font-black text-[13px]">
                    {formatNumberOnly(filteredTeamPeriodGroups.reduce((s, g) => s + g.totalNetSalary, 0))} đ
                  </td>
                  <td className="p-2.5 text-center text-[11px] font-semibold text-purple-900">
                    Click dòng để xem DS CN
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* BẢNG LƯƠNG NHÂN LỰC THỜI VỤ (1 TUẦN / 2 TUẦN / LƯƠNG THÁNG — GIỮ NGUYÊN 100%) */}
        {workerCategory === 'SEASONAL' && seasonalCycleTab !== 'TEAM' && (
          <table className="w-full border-collapse text-left whitespace-nowrap">
            <thead className="bg-[#b45309] text-white sticky top-0 z-20">
              <tr>
                <th className="p-2 border-r border-amber-800 text-center w-10">STT</th>
                <th className="p-2 border-r border-amber-800">Mã thợ</th>
                <th className="p-2 border-r border-amber-800 sticky left-0 bg-[#b45309] z-30">Họ và tên thợ</th>
                <th className="p-2 border-r border-amber-800 text-center">Chu kỳ lương</th>
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
                <th className="p-2 border-r border-amber-800">Ngân hàng</th>
                <th className="p-2 text-center sticky right-0 bg-[#b45309] z-30">In bản lương</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {scaledSeasonal.length === 0 ? (
                <tr>
                  <td colSpan={20} className="p-8 text-center text-slate-500">
                    <div className="space-y-2 flex flex-col items-center">
                      <p className="font-bold text-slate-700">
                        Chưa có nhân viên thời vụ nào trong{' '}
                        {seasonalCycleTab === '1_WEEK'
                          ? 'Tab Bản Lương 1 Tuần'
                          : seasonalCycleTab === '2_WEEKS'
                          ? 'Tab Bản Lương 2 Tuần'
                          : 'Tab Bản Lương Tháng'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Khi thêm nhân viên mới hoặc chọn chu kỳ lương tại mục <strong>2.1 Danh Sách Thời Vụ</strong> (Lương 1 Tuần / Lương 2 Tuần / Lương Tháng), nhân viên sẽ tự động xuất hiện tại Tab tương ứng này.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                scaledSeasonal.map((w, idx) => (
                  <tr
                    key={
                      w.activeVoucherId
                        ? `${w.id || w.code}__${w.activeVoucherId}`
                        : `${w.id || w.code}__${idx}`
                    }
                    className="hover:bg-amber-50/50 transition-colors"
                  >
                    <td className="p-1.5 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {idx + 1}
                    </td>
                    <td
                      onClick={() => handleOpenSeasonalBankModal(w)}
                      className="p-1.5 border-r border-slate-200 font-bold text-amber-900 font-mono cursor-pointer hover:underline"
                      title="Bấm để cập nhật Số tài khoản (STK) & Ngân hàng"
                    >
                      {w.code}
                    </td>
                    <td
                      onClick={() => handleOpenSeasonalBankModal(w)}
                      className="p-1.5 border-r border-slate-200 sticky left-0 bg-white hover:bg-amber-50 font-bold text-slate-900 z-10 cursor-pointer group"
                      title="Bấm vào tên để chỉnh sửa Số tài khoản (STK) & Ngân hàng"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="group-hover:text-amber-700 group-hover:underline truncate">
                            {w.fullName}
                          </span>
                        </div>
                        <Edit3 className="w-3 h-3 text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-center">
                      {onUpdateSeasonalWorker ? (
                        <select
                          value={w.payrollCycleType || '1_MONTH'}
                          onChange={(e) => {
                            const newCycle = e.target.value as SeasonalCycleType;
                            const original = seasonalWorkers.find((sw) => sw.id === w.id || sw.code === w.code) || w;
                            onUpdateSeasonalWorker({
                              ...original,
                              payrollCycleType: newCycle,
                              updatedAt: Date.now(),
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                            (w.payrollCycleType || '1_MONTH') === '1_WEEK'
                              ? 'bg-sky-50 text-sky-900 border-sky-300'
                              : (w.payrollCycleType || '1_MONTH') === '2_WEEKS'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : (w.payrollCycleType || '1_MONTH') === 'TEAM'
                              ? 'bg-purple-50 text-purple-900 border-purple-300'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          }`}
                          title="Đổi chu kỳ lương của công nhân này"
                        >
                          <option value="1_WEEK">Lương 1 Tuần</option>
                          <option value="2_WEEKS">Lương 2 Tuần</option>
                          <option value="1_MONTH">Lương Tháng</option>
                          <option value="TEAM">Tổ Đội</option>
                        </select>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            (w.payrollCycleType || '1_MONTH') === '1_WEEK'
                              ? 'bg-sky-50 text-sky-900 border-sky-300'
                              : (w.payrollCycleType || '1_MONTH') === '2_WEEKS'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : (w.payrollCycleType || '1_MONTH') === 'TEAM'
                              ? 'bg-purple-50 text-purple-900 border-purple-300'
                              : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {(w.payrollCycleType || '1_MONTH') === '1_WEEK'
                            ? 'Lương 1 Tuần'
                            : (w.payrollCycleType || '1_MONTH') === '2_WEEKS'
                            ? 'Lương 2 Tuần'
                            : (w.payrollCycleType || '1_MONTH') === 'TEAM'
                            ? 'Tổ Đội'
                            : 'Lương Tháng'}
                        </span>
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700">{w.trade}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        {w.skillLevel}
                      </span>
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700 font-medium">
                      {onUpdateSeasonalWorker && w.payrollCycleType === 'TEAM' ? (
                        <select
                          value={w.project || ''}
                          onChange={(e) => {
                            handleUpdateTeamSeasonalMonthRecord(w, { project: e.target.value });
                          }}
                          className="px-1.5 py-0.5 bg-white border border-slate-200 hover:border-purple-400 rounded text-xs font-semibold text-[#0f3d64] cursor-pointer max-w-[170px]"
                          title="Chọn dự án nhận chi phí lương trong tháng này"
                        >
                          {w.project && !availableProjectNames.includes(w.project) && (
                            <option value={w.project}>{w.project}</option>
                          )}
                          {availableProjectNames.map((projName) => (
                            <option key={projName} value={projName}>
                              {projName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        w.project || 'Toàn công ty'
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                      {w.payrollCycleType === 'TEAM' ? (
                        <span
                          className="text-[11px] font-sans font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200"
                          title="Nhân sự Tổ Đội không tính theo đơn giá ngày mà nhập trực tiếp tại cột Lương theo công"
                        >
                          Khoán / Tổ đội
                        </span>
                      ) : onUpdateSeasonalWorker ? (
                        <div className="flex items-center justify-end gap-0.5">
                          <input
                            type="number"
                            step="10000"
                            min="0"
                            placeholder="0"
                            value={w.dailyRate ? w.dailyRate : ''}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              const newRate = rawVal === '' ? 0 : Math.max(0, Number(rawVal) || 0);
                              const baseWorker =
                                seasonalWorkers.find((sw) => sw.id === w.id || sw.code === w.code) || w;
                              onUpdateSeasonalWorker({
                                ...baseWorker,
                                dailyRate: newRate,
                                dailyRateUpdatedAt: Date.now(),
                                updatedAt: Date.now(),
                              } as SeasonalWorker);
                            }}
                            className="w-28 text-right font-mono font-bold text-slate-800 bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs outline-none transition-colors"
                            title="Sửa đơn giá ngày (tự động đồng bộ sang Danh sách thời vụ & mọi kỳ lương)"
                          />
                        </div>
                      ) : (
                        formatNumberOnly(w.dailyRate)
                      )}
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
                      {onUpdateSeasonalWorker && w.payrollCycleType === 'TEAM' ? (
                        <input
                          type="number"
                          step="50000"
                          min="0"
                          placeholder="0"
                          value={
                            (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0) || ''
                          }
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            handleUpdateTeamSeasonalMonthRecord(w, {
                              mealAllowance: 0,
                              travelSafetyAllowance: 0,
                              otherBonus: val,
                            });
                          }}
                          className="w-24 text-right font-mono font-semibold text-emerald-800 bg-white border border-slate-200 hover:border-purple-400 rounded px-1.5 py-0.5 text-xs outline-none"
                          title="Phụ cấp & thưởng thêm trong tháng"
                        />
                      ) : (
                        formatNumberOnly((w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0))
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-amber-950 bg-amber-50/60">
                      {formatNumberOnly(w.totalIncome)}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                      {onUpdateSeasonalWorker && w.payrollCycleType === 'TEAM' ? (
                        <input
                          type="number"
                          step="100000"
                          min="0"
                          placeholder="0"
                          value={w.advancePayment || ''}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            handleUpdateTeamSeasonalMonthRecord(w, { advancePayment: val });
                          }}
                          className="w-24 text-right font-mono font-semibold text-rose-700 bg-white border border-slate-200 hover:border-rose-400 rounded px-1.5 py-0.5 text-xs outline-none"
                          title="Số tiền tạm ứng khấu trừ trong tháng"
                        />
                      ) : w.advancePayment > 0 ? (
                        formatNumberOnly(w.advancePayment)
                      ) : (
                        '-'
                      )}
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
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-800">
                      {onUpdateSeasonalWorker ? (
                        <input
                          type="text"
                          value={w.bankAccount || ''}
                          placeholder="Nhập số TK..."
                          onChange={(e) => {
                            const newAcc = e.target.value;
                            const baseWorker =
                              seasonalWorkers.find((sw) => sw.id === w.id || sw.code === w.code) || w;
                            onUpdateSeasonalWorker({
                              ...baseWorker,
                              bankAccount: newAcc,
                              paymentMethod: newAcc.trim() ? 'BANK' : baseWorker.paymentMethod,
                              bankUpdatedAt: Date.now(),
                              updatedAt: Date.now(),
                            } as SeasonalWorker);
                          }}
                          className="w-32 font-mono font-bold text-blue-900 bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs outline-none transition-colors placeholder:font-sans placeholder:font-normal placeholder:text-slate-400"
                          title="Số tài khoản ngân hàng của nhân viên (tự động đồng bộ với Hồ sơ & Phiếu lương)"
                        />
                      ) : (
                        <span className="font-bold text-blue-900">{w.bankAccount || '-'}</span>
                      )}
                    </td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-700 font-medium">
                      {onUpdateSeasonalWorker ? (
                        <input
                          type="text"
                          value={w.paymentMethod === 'CASH' && !w.bankAccount ? 'Tiền mặt' : (w.bankName || '')}
                          placeholder="Ngân hàng..."
                          onChange={(e) => {
                            const newBank = e.target.value;
                            const baseWorker =
                              seasonalWorkers.find((sw) => sw.id === w.id || sw.code === w.code) || w;
                            onUpdateSeasonalWorker({
                              ...baseWorker,
                              bankName: newBank,
                              bankUpdatedAt: Date.now(),
                              updatedAt: Date.now(),
                            } as SeasonalWorker);
                          }}
                          className="w-28 text-slate-800 font-medium bg-white border border-slate-200 hover:border-amber-400 focus:border-amber-500 rounded px-1.5 py-0.5 text-xs outline-none transition-colors"
                          title="Ngân hàng thụ hưởng"
                        />
                      ) : (
                        <span>{w.bankName || 'Tiền mặt'}</span>
                      )}
                    </td>
                    <td className="p-1.5 text-center sticky right-0 bg-white hover:bg-amber-50 z-10 border-l border-slate-200">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const subPeriod =
                              selectedSeasonalSubPeriodId !== 'ALL_PERIODS'
                                ? seasonalSubPeriods.find((p) => p.id === selectedSeasonalSubPeriodId)
                                : undefined;
                            const periodLabelText = subPeriod
                              ? subPeriod.label
                              : seasonalCycleTab === '1_WEEK'
                              ? `Bản Lương 1 Tuần (Tháng ${currentMonth}/${currentYear})`
                              : seasonalCycleTab === '2_WEEKS'
                              ? `Bản Lương 2 Tuần (Tháng ${currentMonth}/${currentYear})`
                              : `Kỳ lương Tháng ${currentMonth}/${currentYear}`;
                            const printWorker = {
                              ...w,
                              attendanceMonth: currentMonth,
                              attendanceYear: currentYear,
                            };
                            const printConfig = {
                              ...config,
                              month: currentMonth,
                              year: currentYear,
                              periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                              period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                            };
                            setPrintingSeasonalWorker(printWorker);
                            printSeasonalWorkerReceipt(printWorker, printConfig, undefined, periodLabelText);
                          }}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          title={`In bản lương của ${w.fullName}`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>In bản lương</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-amber-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-amber-400">
              <tr>
                <td colSpan={7} className="p-2 text-center uppercase tracking-wide border-r border-amber-300">
                  TỔNG CỘNG{' '}
                  {seasonalCycleTab === '1_WEEK'
                    ? 'BẢN LƯƠNG 1 TUẦN'
                    : seasonalCycleTab === '2_WEEKS'
                    ? 'BẢN LƯƠNG 2 TUẦN'
                    : 'BẢN LƯƠNG THÁNG'}{' '}
                  ({scaledSeasonal.length} NHÂN SỰ)
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
                <td colSpan={3} className="p-2 text-center text-slate-600 font-medium">
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
                      (s, e) => s + (e.totalInsurance || 0) + (e.personalIncomeTax || 0),
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

      {/* Modal Xem & In Bản Lương Nhân Viên Thời Vụ */}
      <SeasonalWorkerReceiptModal
        isOpen={!!printingSeasonalWorker}
        worker={printingSeasonalWorker}
        config={{
          ...config,
          month: currentMonth,
          year: currentYear,
          periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
          period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
        }}
        periodLabel={
          selectedSeasonalSubPeriodId !== 'ALL_PERIODS'
            ? seasonalSubPeriods.find((p) => p.id === selectedSeasonalSubPeriodId)?.label
            : seasonalCycleTab === '1_WEEK'
            ? `Bản Lương 1 Tuần (Tháng ${currentMonth}/${currentYear})`
            : seasonalCycleTab === '2_WEEKS'
            ? `Bản Lương 2 Tuần (Tháng ${currentMonth}/${currentYear})`
            : `Kỳ lương Tháng ${currentMonth}/${currentYear}`
        }
        onClose={() => setPrintingSeasonalWorker(null)}
      />

      {/* Modal Xem & In Bản Lương Nhân Viên Chính Thức */}
      {printingPermanentEmployee && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPrintingPermanentEmployee(null);
          }}
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 overflow-y-auto"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="no-print bg-slate-100 border-b border-slate-200 p-3 px-4 sm:px-5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0f3d64]" />
                <span>
                  Phiếu thanh toán tiền lương: {printingPermanentEmployee.fullName} ({printingPermanentEmployee.code})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    printPermanentEmployeeReceipt(printingPermanentEmployee, {
                      ...config,
                      month: currentMonth,
                      year: currentYear,
                      periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                      period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                    })
                  }
                  className="px-3 py-1.5 bg-[#0f3d64] hover:bg-[#1a5b94] text-white rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="In trực tiếp phiếu lương qua hộp thoại máy in"
                >
                  <Printer className="w-4 h-4" />
                  <span>In phiếu ngay</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openPermanentEmployeeReceiptInNewTab(printingPermanentEmployee, {
                      ...config,
                      month: currentMonth,
                      year: currentYear,
                      periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                      period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                    })
                  }
                  className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="Mở sang tab mới riêng biệt để in"
                >
                  <span>Mở tab in riêng</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadPermanentEmployeeReceiptHTML(printingPermanentEmployee, {
                      ...config,
                      month: currentMonth,
                      year: currentYear,
                      periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                      period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                    })
                  }
                  className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                  title="Tải file HTML độc lập để mở hoặc in trên mọi thiết bị"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tải file in</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintingPermanentEmployee(null)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-300 hover:border-rose-300 rounded text-xs font-bold transition cursor-pointer ml-1 shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Đóng</span>
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex-1">
              <PayslipDocument
                employee={printingPermanentEmployee}
                config={{
                  ...config,
                  month: currentMonth,
                  year: currentYear,
                  periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                  period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Nhanh STK & Ngân Hàng Nhân Viên Thời Vụ */}
      {editingSeasonalBankWorker && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingSeasonalBankWorker(null);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-[#0f3d64] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm uppercase tracking-wide">
                  Cập nhật STK & Ngân Hàng
                </h3>
                <p className="text-[11px] text-sky-200 mt-0.5">
                  {editingSeasonalBankWorker.fullName} ({editingSeasonalBankWorker.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSeasonalBankWorker(null)}
                className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSeasonalBankModal} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Hình thức nhận lương
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBankFormMethod('BANK')}
                    className={`py-2 px-3 rounded-lg font-bold border text-center transition cursor-pointer ${
                      bankFormMethod === 'BANK'
                        ? 'bg-sky-50 border-sky-500 text-[#0f3d64]'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Chuyển khoản Ngân hàng
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBankFormMethod('CASH');
                      if (!bankFormAccount.trim()) {
                        setBankFormName('Tiền mặt');
                      }
                    }}
                    className={`py-2 px-3 rounded-lg font-bold border text-center transition cursor-pointer ${
                      bankFormMethod === 'CASH'
                        ? 'bg-amber-50 border-amber-500 text-amber-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Nhận Tiền mặt
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Số tài khoản ngân hàng (STK)
                </label>
                <input
                  type="text"
                  autoFocus
                  value={bankFormAccount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBankFormAccount(val);
                    if (val.trim()) {
                      setBankFormMethod('BANK');
                      if (bankFormName === 'Tiền mặt') {
                        setBankFormName('Vietcombank');
                      }
                    }
                  }}
                  placeholder="Nhập số tài khoản..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 font-mono font-bold text-sm text-blue-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tên Ngân hàng thụ hưởng
                </label>
                <input
                  type="text"
                  value={bankFormName}
                  onChange={(e) => setBankFormName(e.target.value)}
                  placeholder="VD: Vietcombank, Techcombank, MBBank..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 font-semibold text-slate-800"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    'Vietcombank',
                    'Techcombank',
                    'MBBank',
                    'BIDV',
                    'VietinBank',
                    'Agribank',
                    'ACB',
                    'Sacombank',
                    'VPBank',
                    'TPBank',
                  ].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => {
                        setBankFormName(bank);
                        setBankFormMethod('BANK');
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                        bankFormName.toLowerCase() === bank.toLowerCase()
                          ? 'bg-[#0f3d64] text-white border-[#0f3d64]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                      }`}
                    >
                      {bank}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingSeasonalBankWorker(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer shadow-xs"
                >
                  Lưu thông tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tạo Phiếu Chi Lương Tổ Đội (Hỗ trợ tạo nhiều đợt trong cùng 1 tháng) */}
      {isTeamVoucherModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsTeamVoucherModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="bg-purple-900 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm uppercase tracking-wide">
                    Tạo Phiếu Chi Lương Tổ Đội — Đợt {selectedModalWorkerExistingVouchers.length + 1}
                  </h3>
                  <p className="text-[11px] text-purple-200 mt-0.5">
                    Kỳ {String(currentMonth).padStart(2, '0')}/{currentYear} • Hỗ trợ tạo nhiều lệnh nhận lương trong tháng cho cùng 1 người
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTeamVoucherModalOpen(false)}
                className="p-1 text-purple-200 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTeamVoucherModal} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  1. Tên nhân viên (Thuộc nhóm Tổ Đội) <span className="text-rose-600">*</span>
                </label>
                {allTeamSeasonalWorkers.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px]">
                    Chưa có nhân viên nào được gán là <strong>Tổ Đội</strong> trong Danh sách nhân viên thời vụ. Vui lòng gán chu kỳ <strong>Tổ Đội</strong> cho nhân viên tại mục <strong>2.1 Danh Sách Thời Vụ</strong> trước.
                  </div>
                ) : (
                  <select
                    required
                    value={teamVoucherWorkerCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTeamVoucherWorkerCode(val);
                      const found = allTeamSeasonalWorkers.find(
                        (w) => (w.id || w.code) === val || w.code === val || w.id === val
                      );
                      if (found) {
                        const baseW = findTeamBaseWorker(found);
                        const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
                        const latestV = vouchers.length > 0 ? vouchers[vouchers.length - 1] : undefined;
                        setTeamVoucherProject(
                          latestV?.project ||
                            found.project ||
                            availableProjectNames[0] ||
                            'Coherent Vsip 3'
                        );
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600 font-bold text-slate-900 bg-white cursor-pointer"
                  >
                    <option value="">-- Chọn nhân viên Tổ Đội --</option>
                    {allTeamSeasonalWorkers.map((w) => {
                      const baseW = findTeamBaseWorker(w) || w;
                      const vCount = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear).length;
                      return (
                        <option key={w.id || w.code} value={w.id || w.code}>
                          [{w.code}] {w.fullName} — {w.trade}
                          {vCount > 0 ? ` (Đã có ${vCount} đợt trong T${currentMonth})` : ''}
                        </option>
                      );
                    })}
                  </select>
                )}

                {teamVoucherWorkerCode && selectedModalWorkerExistingVouchers.length > 0 && (
                  <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-950 space-y-1.5">
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <span>
                        Đã có {selectedModalWorkerExistingVouchers.length} đợt chi trong T
                        {String(currentMonth).padStart(2, '0')}/{currentYear}:
                      </span>
                      <span className="text-emerald-700 font-mono">
                        Tổng:{' '}
                        {formatNumberOnly(
                          selectedModalWorkerExistingVouchers.reduce(
                            (s, v) => s + (v.salaryByDays || 0) + (v.otherBonus || 0),
                            0
                          )
                        )}{' '}
                        đ
                      </span>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {selectedModalWorkerExistingVouchers.map((v, i) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between text-[11px] bg-white px-2 py-1 rounded border border-purple-100"
                        >
                          <span className="text-slate-700">
                            <strong>Đợt {i + 1}</strong> ({formatIsoToDmy(v.paymentDate)}) • {v.project}
                          </span>
                          <span className="font-mono font-bold text-purple-900">
                            {formatNumberOnly((v.salaryByDays || 0) + (v.otherBonus || 0))} đ
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-purple-700 font-semibold">
                      ➜ Phiếu này sẽ tạo thêm <strong>Lệnh chi Đợt {selectedModalWorkerExistingVouchers.length + 1}</strong> riêng biệt (không ghi đè các đợt trên).
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    2. Lương nhận đợt này (VNĐ) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100000"
                    placeholder="VD: 6000000"
                    value={teamVoucherSalary}
                    onChange={(e) => setTeamVoucherSalary(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600 font-mono font-black text-sm text-purple-950"
                  />
                  {Number(teamVoucherSalary) > 0 && (
                    <span className="block text-[11px] font-bold text-emerald-700 mt-1">
                      {formatNumberOnly(Number(teamVoucherSalary))} đ
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Phụ cấp / Thưởng đợt này
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50000"
                    placeholder="0 (Tùy chọn)"
                    value={teamVoucherBonus}
                    onChange={(e) => setTeamVoucherBonus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600 font-mono font-bold text-sm text-emerald-800"
                  />
                  {Number(teamVoucherBonus) > 0 && (
                    <span className="block text-[11px] font-bold text-emerald-700 mt-1">
                      + {formatNumberOnly(Number(teamVoucherBonus))} đ
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  3. Ngày chuyển đợt này <span className="text-rose-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={teamVoucherDate}
                  onChange={(e) => setTeamVoucherDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600 font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  4. Dự án nhận chi phí <span className="text-rose-600">*</span>
                </label>
                <select
                  required
                  value={teamVoucherProject}
                  onChange={(e) => setTeamVoucherProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-600 font-bold text-[#0f3d64] bg-white cursor-pointer"
                >
                  {teamVoucherProject && !availableProjectNames.includes(teamVoucherProject) && (
                    <option value={teamVoucherProject}>{teamVoucherProject}</option>
                  )}
                  {availableProjectNames.map((proj) => (
                    <option key={proj} value={proj}>
                      {proj}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsTeamVoucherModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold transition cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!teamVoucherWorkerCode || allTeamSeasonalWorkers.length === 0}
                  className="px-4 py-2 rounded-lg bg-purple-800 hover:bg-purple-900 disabled:opacity-50 text-white font-bold transition cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    Thêm Lệnh Chi Đợt {selectedModalWorkerExistingVouchers.length + 1}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cửa sổ Xem Danh Sách Công Nhân Nhận Lương Của Kỳ Lương Tổ Đội (Mở khi Click vào dòng Kỳ Lương) */}
      {activeViewingPeriodGroup && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
          onClick={() => setViewingTeamPeriodGroupKey(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border-2 border-purple-300 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal Chi Tiết Kỳ Lương */}
            <div className="bg-gradient-to-r from-purple-950 via-purple-900 to-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-mono font-black text-xs">
                    {activeViewingPeriodGroup.displayCode}
                  </span>
                  <h3 className="text-sm sm:text-base font-black tracking-wide uppercase">
                    Danh sách nhân viên nhận lương kỳ {activeViewingPeriodGroup.paymentDateDisplay}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-purple-200">
                  <span>
                    📅 Ngày kỳ lương: <strong className="text-white">{activeViewingPeriodGroup.paymentDateDisplay}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    🏢 Dự án thi công: <strong className="text-amber-300">{activeViewingPeriodGroup.project}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    👷 Quân số nhận lương: <strong className="text-white">{activeViewingPeriodGroup.workerCount} công nhân</strong>
                  </span>
                  <span>•</span>
                  <span>
                    💰 Tổng thực lĩnh kỳ:{' '}
                    <strong className="text-emerald-300 font-mono">
                      {formatNumberOnly(activeViewingPeriodGroup.totalNetSalary)} đ
                    </strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditTeamPeriodGroup(activeViewingPeriodGroup)}
                    className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                    title="Mở cửa sổ Tick thêm/bớt công nhân hoặc sửa tiền lương của kỳ này"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Sửa kỳ / Tick thêm bớt CN</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleExportSingleTeamPeriodExcel(activeViewingPeriodGroup)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất Excel kỳ này</span>
                </button>

                <button
                  type="button"
                  onClick={() => setViewingTeamPeriodGroupKey(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                  title="Đóng cửa sổ danh sách"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Thanh Tìm kiếm nhanh trong kỳ */}
            <div className="px-5 py-2.5 bg-purple-50/70 border-b border-purple-200 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={detailModalSearchTerm}
                  onChange={(e) => setDetailModalSearchTerm(e.target.value)}
                  placeholder="Tìm nhanh tên hoặc mã công nhân trong kỳ này..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs focus:outline-none focus:border-purple-600"
                />
              </div>
              <div className="text-slate-600 font-semibold">
                Hiển thị <strong className="text-purple-950">{filteredDetailModalRows.length}</strong> /{' '}
                {activeViewingPeriodGroup.workerCount} công nhân Tổ Đội nhận lương ngày{' '}
                <strong className="text-purple-950">{activeViewingPeriodGroup.paymentDateDisplay}</strong>
              </div>
            </div>

            {/* Bảng Danh Sách Công Nhân Của Kỳ Lương */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-left whitespace-nowrap text-xs">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-300 text-[11px] uppercase">
                  <tr>
                    <th className="p-2.5 border-r border-slate-200 text-center w-10">STT</th>
                    <th className="p-2.5 border-r border-slate-200">Mã CN</th>
                    <th className="p-2.5 border-r border-slate-200">Họ và tên công nhân Tổ Đội</th>
                    <th className="p-2.5 border-r border-slate-200">Ngành nghề</th>
                    <th className="p-2.5 border-r border-slate-200 text-center">Bậc thợ</th>
                    <th className="p-2.5 border-r border-slate-200 text-right bg-purple-50 text-purple-950">
                      Tiền lương kỳ này
                    </th>
                    <th className="p-2.5 border-r border-slate-200 text-right">Phụ cấp & Thưởng</th>
                    <th className="p-2.5 border-r border-slate-200 text-right">Trừ tạm ứng</th>
                    <th className="p-2.5 border-r border-slate-200 text-right bg-emerald-50 text-emerald-950 font-black">
                      THỰC LĨNH NHẬN (VNĐ)
                    </th>
                    <th className="p-2.5 border-r border-slate-200">Số tài khoản</th>
                    <th className="p-2.5 border-r border-slate-200">Ngân hàng</th>
                    <th className="p-2.5 text-center">In phiếu / Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredDetailModalRows.map((row, rIdx) => {
                    const isConfirmingRemove = confirmRemoveVoucherId === row.voucherId;
                    return (
                      <tr key={row.voucherId} className="hover:bg-amber-50/50 transition-colors">
                        <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">
                          {rIdx + 1}
                        </td>
                        <td
                          onClick={() => handleOpenSeasonalBankModal(row.worker)}
                          className="p-2 border-r border-slate-200 font-mono font-bold text-purple-900 cursor-pointer hover:underline"
                          title="Nhấn để cập nhật Số tài khoản ngân hàng"
                        >
                          {row.worker.code}
                        </td>
                        <td
                          onClick={() => handleOpenSeasonalBankModal(row.worker)}
                          className="p-2 border-r border-slate-200 font-bold text-slate-900 cursor-pointer hover:text-purple-800"
                          title="Nhấn để cập nhật Số tài khoản ngân hàng"
                        >
                          {row.worker.fullName}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-slate-700">{row.worker.trade}</td>
                        <td className="p-2 border-r border-slate-200 text-center">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold">
                            {row.worker.skillLevel}
                          </span>
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-purple-950 bg-purple-50/40">
                          {formatNumberOnly(row.salaryByDays)} đ
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-mono text-emerald-700 font-semibold">
                          {row.otherBonus > 0 ? `+${formatNumberOnly(row.otherBonus)} đ` : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                          {row.advancePayment > 0 ? `-${formatNumberOnly(row.advancePayment)} đ` : '-'}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/70 text-[13px]">
                          {formatNumberOnly(row.netSalary)} đ
                        </td>
                        <td className="p-2 border-r border-slate-200 font-mono font-bold text-blue-900">
                          {row.worker.bankAccount || <span className="text-slate-400 font-sans font-normal">Chưa có STK</span>}
                        </td>
                        <td className="p-2 border-r border-slate-200 text-slate-700">
                          {row.worker.paymentMethod === 'CASH' && !row.worker.bankAccount
                            ? 'Tiền mặt'
                            : row.worker.bankName || 'Tiền mặt'}
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                const printWorker: SeasonalWorker = {
                                  ...row.worker,
                                  dailyRate: row.salaryByDays,
                                  actualWorkDays: 1,
                                  salaryByDays: row.salaryByDays,
                                  overtimeHours: 0,
                                  overtimePay: 0,
                                  mealAllowance: 0,
                                  travelSafetyAllowance: 0,
                                  otherBonus: row.otherBonus,
                                  totalIncome: row.totalIncome,
                                  advancePayment: row.advancePayment,
                                  personalIncomeTax: row.personalIncomeTax,
                                  totalDeductions: row.totalDeductions,
                                  netSalary: row.netSalary,
                                  attendanceMonth: currentMonth,
                                  attendanceYear: currentYear,
                                };
                                const printConfig = {
                                  ...config,
                                  month: currentMonth,
                                  year: currentYear,
                                  periodCode: `${String(currentMonth).padStart(2, '0')}/${currentYear}`,
                                  period: `Kỳ lương tháng ${String(currentMonth).padStart(2, '0')} năm ${currentYear}`,
                                };
                                const periodLabelText = `Bản Lương Tổ Đội - ${activeViewingPeriodGroup.displayCode} (Ngày: ${activeViewingPeriodGroup.paymentDateDisplay} • Dự án: ${activeViewingPeriodGroup.project})`;
                                setPrintingSeasonalWorker(printWorker);
                                printSeasonalWorkerReceipt(printWorker, printConfig, undefined, periodLabelText);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
                              title={`In phiếu lương kỳ ${activeViewingPeriodGroup.displayCode} cho ${row.worker.fullName}`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>In bản lương</span>
                            </button>

                            {(onBatchUpdateTeamWorkersList || onUpdateSeasonalWorker) &&
                              (isConfirmingRemove ? (
                                <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-300 rounded-lg px-1.5 py-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveSingleWorkerFromPeriod(row, activeViewingPeriodGroup)
                                    }
                                    className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-black cursor-pointer"
                                  >
                                    Gỡ!
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveVoucherId(null)}
                                    className="px-1 py-0.5 text-slate-600 hover:text-slate-900 text-[10px] font-bold cursor-pointer"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveVoucherId(row.voucherId)}
                                  className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer"
                                  title={`Gỡ ${row.worker.fullName} khỏi kỳ lương này`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-amber-100 font-black text-slate-900 sticky bottom-0 border-t-2 border-amber-400">
                  <tr>
                    <td colSpan={5} className="p-2.5 text-center uppercase tracking-wide border-r border-amber-300">
                      TỔNG CỘNG {activeViewingPeriodGroup.displayCode} — NGÀY {activeViewingPeriodGroup.paymentDateDisplay} ({filteredDetailModalRows.length} CÔNG NHÂN)
                    </td>
                    <td className="p-2.5 text-right border-r border-amber-300 font-mono text-purple-950">
                      {formatNumberOnly(filteredDetailModalRows.reduce((s, r) => s + r.salaryByDays, 0))} đ
                    </td>
                    <td className="p-2.5 text-right border-r border-amber-300 font-mono text-emerald-800">
                      {formatNumberOnly(filteredDetailModalRows.reduce((s, r) => s + r.otherBonus, 0))} đ
                    </td>
                    <td className="p-2.5 text-right border-r border-amber-300 font-mono text-rose-800">
                      {formatNumberOnly(filteredDetailModalRows.reduce((s, r) => s + r.advancePayment, 0))} đ
                    </td>
                    <td className="p-2.5 text-right border-r border-amber-300 font-mono text-emerald-950 bg-emerald-200 font-black text-[13px]">
                      {formatNumberOnly(filteredDetailModalRows.reduce((s, r) => s + r.netSalary, 0))} đ
                    </td>
                    <td colSpan={3} className="p-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setViewingTeamPeriodGroupKey(null)}
                        className="px-4 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Đóng danh sách
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tạo & Chỉnh Sửa Kỳ Lương Tổ Đội (KL 0001+ • Tick chọn nhiều công nhân & Lưu Database) */}
      <TeamBatchPayrollModal
        isOpen={isTeamBatchModalOpen}
        onClose={() => {
          setIsTeamBatchModalOpen(false);
          setEditingTeamPeriodGroup(null);
        }}
        teamWorkersList={allTeamSeasonalWorkers}
        allSeasonalWorkers={seasonalWorkers}
        projects={projects}
        availableProjectNames={availableProjectNames}
        currentMonth={currentMonth}
        currentYear={currentYear}
        editingGroup={editingTeamPeriodGroup}
        onSaveBatchAndSync={handleSaveTeamBatchAndSync}
      />

      {/* Modal Chỉnh Sửa Chi Tiết Hồ Sơ, Lương & Phụ Cấp Nhân Viên Chính Thức */}
      <EmployeeModal
        isOpen={!!editingEmployee}
        initialData={editingEmployee}
        employee={editingEmployee}
        onClose={() => setEditingEmployee(null)}
        onSave={(savedEmp) => {
          onUpdateEmployee(savedEmp);
          setEditingEmployee(null);
        }}
        existingCodes={employees.map((e) => e.code)}
        config={config}
      />
    </div>
  );
};
