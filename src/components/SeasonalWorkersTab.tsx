import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  HardHat,
  Search,
  Filter,
  Plus,
  Download,
  Printer,
  Edit2,
  Trash2,
  FileText,
  Building,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  DollarSign,
  Clock,
  CreditCard,
  Banknote,
  ShieldCheck,
  Eye,
  Phone,
  ExternalLink,
  FileDown,
  Calendar,
  CheckSquare,
  Square,
  Sliders,
  X,
  ChevronRight,
  UserCheck,
  Sparkles,
  Layers,
  ArrowRightLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ListOrdered,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SeasonalWorker, CompanyConfig, SeasonalCycleType, PayrollPeriodOption } from '../types';
import { SeasonalWorkerModal } from './SeasonalWorkerModal';
import { SeasonalWorkerReceiptModal } from './SeasonalWorkerReceiptModal';
import { MonthYearPicker } from './MonthYearPicker';
import { formatNumberOnly, numberToVietnameseWords } from '../utils/numberToVietnameseWords';
import {
  initialSeasonalWorkers,
  recomputeSeasonalWorkerPayroll,
  getWeeksForMonth,
  getPayrollPeriods,
  getWorkerForPeriod,
  recordWorkerPeriod,
} from '../data/mockSeasonalWorkers';
import {
  printSeasonalWorkerReceipt,
  printSeasonalWorkersBatchPayroll,
  openSeasonalWorkersBatchInNewTab,
  downloadSeasonalWorkersBatchHTML,
} from '../utils/printPayrollReceipt';

export type WorkerSortField = 'default' | 'code' | 'name' | 'dailyRate' | 'actualWorkDays' | 'netSalary';
export type SortDirection = 'asc' | 'desc';

interface SeasonalWorkersTabProps {
  workers: SeasonalWorker[];
  config: CompanyConfig;
  onChangeMonthYear?: (month: number, year: number) => void;
  onUpdateWorker: (worker: SeasonalWorker) => void;
  onAddWorker: (worker: SeasonalWorker) => void;
  onDeleteWorker: (id: string) => void;
  onDeleteBatchWorkers?: (ids: string[]) => void;
  onClearAllWorkers?: () => void;
  onResetWorkers: () => void;
  onReorderWorkers?: (workers: SeasonalWorker[]) => void;
}

export const SeasonalWorkersTab: React.FC<SeasonalWorkersTabProps> = ({
  workers,
  config,
  onChangeMonthYear,
  onUpdateWorker,
  onAddWorker,
  onDeleteWorker,
  onDeleteBatchWorkers,
  onClearAllWorkers,
  onResetWorkers,
  onReorderWorkers,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [selectedTrade, setSelectedTrade] = useState('ALL');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'ALL' | 'BANK' | 'CASH'>('ALL');
  const [selectedTaxFilter, setSelectedTaxFilter] = useState<'ALL' | 'HAS_COMMITMENT' | 'NO_COMMITMENT'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'PAUSED'>('ALL');
  const [selectedWorkerCycleFilter, setSelectedWorkerCycleFilter] = useState<'ALL' | '1_WEEK' | '2_WEEKS'>('ALL');

  // Lựa chọn Chu kỳ thanh toán: Lương 1 tuần ('1_WEEK') hoặc Lương 2 tuần ('2_WEEKS')
  const [cycleType, setCycleType] = useState<SeasonalCycleType>(() => {
    const saved = localStorage.getItem('seasonal_payroll_cycle_type');
    return (saved === '2_WEEKS' ? '2_WEEKS' : '1_WEEK') as SeasonalCycleType;
  });

  const currentMonth = config.month || 9;
  const currentYear = config.year || 2026;

  // Danh sách các kỳ thanh toán sinh tự động theo Chu kỳ (1 tuần hoặc 2 tuần)
  const payrollPeriods = useMemo(() => {
    return getPayrollPeriods(currentYear, currentMonth, cycleType);
  }, [currentYear, currentMonth, cycleType]);

  // Kỳ đang được chọn (Mặc định W1 hoặc BI1)
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(() => {
    const saved = localStorage.getItem('seasonal_payroll_cycle_type');
    return saved === '2_WEEKS' ? 'BI1' : 'W1';
  });

  // Tự động kiểm tra và căn chỉnh selectedPeriodId nếu đổi tháng hoặc đổi chu kỳ
  useEffect(() => {
    if (!payrollPeriods.some((p) => p.id === selectedPeriodId)) {
      setSelectedPeriodId(payrollPeriods[0]?.id || (cycleType === '2_WEEKS' ? 'BI1' : 'W1'));
    }
  }, [payrollPeriods, selectedPeriodId, cycleType]);

  // Đối tượng kỳ đang chọn hiện tại
  const currentPeriodOption: PayrollPeriodOption = useMemo(() => {
    return payrollPeriods.find((p) => p.id === selectedPeriodId) || payrollPeriods[0];
  }, [payrollPeriods, selectedPeriodId]);

  // Chuyển đổi chu kỳ lương
  const handleCycleTypeChange = (newType: SeasonalCycleType) => {
    setCycleType(newType);
    localStorage.setItem('seasonal_payroll_cycle_type', newType);
    const newPeriods = getPayrollPeriods(currentYear, currentMonth, newType);
    setSelectedPeriodId(newPeriods[0]?.id || (newType === '2_WEEKS' ? 'BI1' : 'W1'));
    showToast(
      newType === '1_WEEK'
        ? 'Đã chuyển sang chu kỳ: Lương 1 tuần (Tuần 1, Tuần 2...)'
        : 'Đã chuyển sang chu kỳ: Lương 2 tuần (Đợt 1: 01-15, Đợt 2: 16-cuối tháng)'
    );
  };

  // Chế độ sửa nhanh trực tiếp trên bảng
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);

  // Trạng thái Sắp xếp danh sách (Đảm bảo 2 máy tính luôn hiển thị thứ tự giống hệt nhau)
  const [sortField, setSortField] = useState<WorkerSortField>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleToggleSort = (field: WorkerSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleNormalizeOrder = (mode: 'code' | 'name' = 'code') => {
    const sorted = [...workers].sort((a, b) => {
      if (mode === 'name') {
        return (a.fullName || '').localeCompare(b.fullName || '', 'vi', { sensitivity: 'base' });
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });

    const updated = sorted.map((w, index) => ({
      ...w,
      sortOrder: index + 1,
    }));

    if (onReorderWorkers) {
      onReorderWorkers(updated);
    } else {
      updated.forEach((w) => onUpdateWorker(w));
    }
    setSortField('default');
    setSortDirection('asc');
    showToast(
      mode === 'code'
        ? 'Đã chuẩn hóa STT cố định theo Mã thợ (PNC-TV01, PNC-TV02...) và lưu lên Cloud cho tất cả thiết bị!'
        : 'Đã chuẩn hóa STT cố định theo Họ tên (A-Z) và lưu lên Cloud cho tất cả thiết bị!'
    );
  };

  // Chọn nhiều dòng để xóa/in hàng loạt
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);

  // Modals state
  const [editingWorker, setEditingWorker] = useState<SeasonalWorker | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingReceiptWorker, setViewingReceiptWorker] = useState<SeasonalWorker | null>(null);
  const [batchPrintNotice, setBatchPrintNotice] = useState(false);

  // In-app Confirmation Dialogs
  const [workerToDelete, setWorkerToDelete] = useState<SeasonalWorker | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isClearAllConfirming, setIsClearAllConfirming] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // CÔNG NHÂN TẠI KỲ HIỆN TẠI:
  // Nếu kỳ này chưa chấm, actualWorkDays = 0, OT = 0, không tự động mang số ngày công của tuần trước sang!
  const workersInCurrentPeriod = useMemo(() => {
    if (!currentPeriodOption) return workers;
    return workers.map((w) => getWorkerForPeriod(w, currentPeriodOption));
  }, [workers, currentPeriodOption]);

  // Danh sách công trình độc nhất
  const projects = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => {
      if (w.project) set.add(w.project);
    });
    return Array.from(set).sort();
  }, [workers]);

  // Danh sách chuyên môn độc nhất
  const trades = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => {
      if (w.trade) set.add(w.trade);
    });
    return Array.from(set).sort();
  }, [workers]);

  // Lọc danh sách công nhân theo kỳ hiện tại
  const filteredWorkers = useMemo(() => {
    const list = workersInCurrentPeriod.filter((w) => {
      // 1. Tìm kiếm text
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          w.fullName.toLowerCase().includes(term) ||
          w.code.toLowerCase().includes(term) ||
          w.phone.includes(term) ||
          w.idCard.includes(term) ||
          w.trade.toLowerCase().includes(term) ||
          w.project.toLowerCase().includes(term) ||
          w.teamName.toLowerCase().includes(term);
        if (!match) return false;
      }

      // 2. Dự án
      if (selectedProject !== 'ALL' && w.project !== selectedProject) return false;

      // 3. Nghề nghiệp
      if (selectedTrade !== 'ALL' && w.trade !== selectedTrade) return false;

      // 4. Hình thức nhận tiền
      if (selectedPaymentMethod !== 'ALL' && w.paymentMethod !== selectedPaymentMethod) return false;

      // 5. Cam kết 08
      if (selectedTaxFilter === 'HAS_COMMITMENT' && !w.hasTaxCommitment) return false;
      if (selectedTaxFilter === 'NO_COMMITMENT' && w.hasTaxCommitment) return false;

      // 6. Trạng thái
      if (selectedStatus !== 'ALL' && w.status !== selectedStatus) return false;

      // 7. Chu kỳ tính lương của thợ (1 tuần hoặc 2 tuần)
      if (selectedWorkerCycleFilter !== 'ALL') {
        const workerCycle = w.payrollCycleType || '1_WEEK';
        if (workerCycle !== selectedWorkerCycleFilter) return false;
      }

      return true;
    });

    // Sắp xếp nhất quán tuyệt đối giữa 2 máy tính:
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'code') {
        cmp = (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'name') {
        cmp = (a.fullName || '').localeCompare(b.fullName || '', 'vi', { sensitivity: 'base' });
      } else if (sortField === 'dailyRate') {
        cmp = (a.dailyRate || 0) - (b.dailyRate || 0);
      } else if (sortField === 'actualWorkDays') {
        cmp = (a.actualWorkDays || 0) - (b.actualWorkDays || 0);
      } else if (sortField === 'netSalary') {
        cmp = (a.netSalary || 0) - (b.netSalary || 0);
      } else {
        // Mặc định 'default':
        // 1. Ưu tiên sortOrder được gán cố định
        // 2. Tự nhiên theo mã thợ: PNC-TV01 < PNC-TV02 < PNC-TV03 < ... < PNC-TV13
        if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
          cmp = a.sortOrder - b.sortOrder;
        } else {
          cmp = (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
        }
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [
    workersInCurrentPeriod,
    searchTerm,
    selectedProject,
    selectedTrade,
    selectedPaymentMethod,
    selectedTaxFilter,
    selectedStatus,
    selectedWorkerCycleFilter,
    sortField,
    sortDirection,
  ]);

  // Thống kê tổng hợp tại kỳ hiện tại
  const stats = useMemo(() => {
    const totalWorkers = workersInCurrentPeriod.length;
    const activeWorkers = workersInCurrentPeriod.filter((w) => w.status === 'ACTIVE').length;
    const totalWorkDays = workersInCurrentPeriod.reduce((sum, w) => sum + (w.actualWorkDays || 0), 0);
    const totalOvertimeHours = workersInCurrentPeriod.reduce((sum, w) => sum + (w.overtimeHours || 0), 0);
    const totalSalaryByDays = workersInCurrentPeriod.reduce((sum, w) => sum + (w.salaryByDays || 0), 0);
    const totalOvertimePay = workersInCurrentPeriod.reduce((sum, w) => sum + (w.overtimePay || 0), 0);
    const totalIncome = workersInCurrentPeriod.reduce((sum, w) => sum + (w.totalIncome || 0), 0);
    const totalTax = workersInCurrentPeriod.reduce((sum, w) => sum + (w.personalIncomeTax || 0), 0);
    const totalAdvance = workersInCurrentPeriod.reduce((sum, w) => sum + (w.advancePayment || 0), 0);
    const totalNet = workersInCurrentPeriod.reduce((sum, w) => sum + (w.netSalary || 0), 0);
    const totalBankPay = workersInCurrentPeriod.filter((w) => w.paymentMethod === 'BANK').reduce((sum, w) => sum + w.netSalary, 0);
    const totalCashPay = workersInCurrentPeriod.filter((w) => w.paymentMethod === 'CASH').reduce((sum, w) => sum + w.netSalary, 0);

    // Đếm số thợ đã chấm công trong kỳ này
    const recordedWorkersCount = workers.filter((w) => {
      const rec = w.periodRecords?.[currentPeriodOption.periodKey];
      return rec && rec.isRecorded && (rec.actualWorkDays > 0 || rec.netSalary > 0);
    }).length;

    return {
      totalWorkers,
      activeWorkers,
      recordedWorkersCount,
      totalWorkDays,
      totalOvertimeHours,
      totalSalaryByDays,
      totalOvertimePay,
      totalIncome,
      totalTax,
      totalAdvance,
      totalNet,
      totalBankPay,
      totalCashPay,
    };
  }, [workersInCurrentPeriod, workers, currentPeriodOption]);

  // Quản lý chọn / bỏ chọn hàng loạt
  const allFilteredSelected =
    filteredWorkers.length > 0 &&
    filteredWorkers.every((w) => selectedWorkerIds.includes(w.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredWorkers.map((w) => w.id));
      setSelectedWorkerIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const currentSet = new Set(selectedWorkerIds);
      filteredWorkers.forEach((w) => currentSet.add(w.id));
      setSelectedWorkerIds(Array.from(currentSet));
    }
  };

  const handleToggleSelectWorker = (id: string) => {
    setSelectedWorkerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Cập nhật nhanh một thuộc tính của công nhân trong KỲ ĐANG CHỌN
  // Tự động lưu vào periodRecords của kỳ đó và đánh dấu isRecorded = true!
  const handleQuickUpdate = (worker: SeasonalWorker, patch: Partial<SeasonalWorker>) => {
    const original = workers.find((w) => w.id === worker.id) || worker;
    const updated = recordWorkerPeriod(original, currentPeriodOption, patch);
    onUpdateWorker(updated);
  };

  // Thay đổi nhanh số ngày công
  const handleQuickAdjustDays = (worker: SeasonalWorker, delta: number) => {
    const currentDays = worker.actualWorkDays || 0;
    const maxDays = currentPeriodOption.maxStandardDays + 2;
    const newDays = Math.max(0, Math.min(maxDays, Number((currentDays + delta).toFixed(1))));
    handleQuickUpdate(worker, { actualWorkDays: newDays });
  };

  // Tiện ích 1: Chấm đủ công tiêu chuẩn (6 ngày cho 1 tuần, hoặc 13 ngày cho 2 tuần)
  const handleBatchFillFullDays = () => {
    const targetIds =
      selectedWorkerIds.length > 0
        ? new Set(selectedWorkerIds)
        : new Set(filteredWorkers.map((w) => w.id));

    const standardDays = currentPeriodOption.cycleType === '1_WEEK' ? 6 : Math.min(13, currentPeriodOption.maxStandardDays);

    workers.forEach((w) => {
      if (targetIds.has(w.id)) {
        const updated = recordWorkerPeriod(w, currentPeriodOption, {
          actualWorkDays: standardDays,
          mealAllowance: standardDays * 30000,
        });
        onUpdateWorker(updated);
      }
    });

    showToast(`Đã chấm đủ ${standardDays} ngày công (${currentPeriodOption.shortLabel}) cho ${targetIds.size} thợ!`);
  };

  // Tiện ích 2: Xóa trắng ngày công kỳ này để chấm lại từ đầu (0 công)
  const handleBatchClearDays = () => {
    const targetIds =
      selectedWorkerIds.length > 0
        ? new Set(selectedWorkerIds)
        : new Set(filteredWorkers.map((w) => w.id));

    workers.forEach((w) => {
      if (targetIds.has(w.id)) {
        const updated = recordWorkerPeriod(w, currentPeriodOption, {
          actualWorkDays: 0,
          overtimeHours: 0,
          mealAllowance: 0,
          advancePayment: 0,
        });
        onUpdateWorker(updated);
      }
    });

    showToast(`Đã đặt lại 0 công cho ${targetIds.size} thợ để chấm lại ${currentPeriodOption.shortLabel}!`);
  };

  // Xuất Excel bảng kê chi trả theo đúng kỳ đang chọn
  const handleExportExcel = () => {
    const dataToExport = filteredWorkers.map((w, index) => ({
      STT: index + 1,
      'Mã thợ': w.code,
      'Họ và tên': w.fullName,
      'Nghề nghiệp': w.trade,
      'Bậc thợ': w.skillLevel,
      'Đội thi công': w.teamName,
      'Chỉ huy trưởng': w.teamLeader,
      'Công trình': w.project,
      SĐT: w.phone,
      CCCD: w.idCard,
      'Chu kỳ thanh toán': currentPeriodOption.cycleType === '1_WEEK' ? 'Lương 1 tuần' : 'Lương 2 tuần',
      'Kỳ thanh toán': currentPeriodOption.label,
      'Thời gian': currentPeriodOption.dates.length > 0 ? `${currentPeriodOption.dates[0]} - ${currentPeriodOption.dates[currentPeriodOption.dates.length - 1]}` : currentPeriodOption.label,
      'Đơn giá ngày (VNĐ)': w.dailyRate,
      'Số ngày công': w.actualWorkDays,
      'Lương theo công (VNĐ)': w.salaryByDays,
      'Giờ OT (h)': w.overtimeHours,
      'Tiền OT (VNĐ)': w.overtimePay,
      'Phụ cấp ăn ca (VNĐ)': w.mealAllowance,
      'Phụ cấp đi lại/Thưởng (VNĐ)': w.travelSafetyAllowance + w.otherBonus,
      'TỔNG THU NHẬP (VNĐ)': w.totalIncome,
      'Cam kết 08 (Miễn thuế)': w.hasTaxCommitment ? 'CÓ (Miễn 10%)' : 'KHÔNG (Trừ 10%)',
      'Thuế TNCN 10% (VNĐ)': w.personalIncomeTax,
      'Tạm ứng tại CT (VNĐ)': w.advancePayment,
      'THỰC LĨNH CHI TRẢ (VNĐ)': w.netSalary,
      'Hình thức nhận': w.paymentMethod === 'BANK' ? 'Chuyển khoản ATM' : 'Tiền mặt tại công trường',
      'Số tài khoản': w.bankAccount,
      'Ngân hàng': w.bankName,
      'Trạng thái': w.status === 'ACTIVE' ? 'Đang thi công' : w.status === 'COMPLETED' ? 'Hoàn thành' : 'Tạm ngưng',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BangKeLuongThoiVu');
    XLSX.writeFile(
      wb,
      `Bang_Ke_Chi_Tra_Luong_${currentPeriodOption.id}_Thang_${currentMonth}_${currentYear}.xlsx`
    );
    showToast(`Đã xuất file Excel bảng kê chi trả ${currentPeriodOption.shortLabel} thành công!`);
  };

  // In bảng ký nhận tiền công của kỳ đang chọn
  const handlePrintPayrollSheet = () => {
    printSeasonalWorkersBatchPayroll(
      filteredWorkers,
      config,
      selectedProject,
      () => {
        setBatchPrintNotice(true);
      },
      currentPeriodOption.label
    );
  };

  // Mở tab mới độc lập để in bảng kê
  const handleOpenBatchNewTab = () => {
    openSeasonalWorkersBatchInNewTab(
      filteredWorkers,
      config,
      selectedProject,
      currentPeriodOption.label
    );
  };

  // Tải file HTML bảng kê
  const handleDownloadBatchHTML = () => {
    downloadSeasonalWorkersBatchHTML(
      filteredWorkers,
      config,
      selectedProject,
      currentPeriodOption.label
    );
  };

  // In các phiếu lương của các công nhân được chọn
  const handlePrintSelectedWorkers = () => {
    const selectedList = filteredWorkers.filter((w) => selectedWorkerIds.includes(w.id));
    if (selectedList.length === 0) return;
    printSeasonalWorkersBatchPayroll(
      selectedList,
      config,
      selectedProject,
      () => {
        setBatchPrintNotice(true);
      },
      currentPeriodOption.label
    );
  };

  return (
    <div className="space-y-4">
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

      {/* Top Banner / Summary Card */}
      <div className="bg-gradient-to-r from-[#0f3d64] via-[#154c79] to-[#0f3d64] text-white p-4 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-amber-400/20 border border-amber-400/40 rounded-xl shrink-0">
            <HardHat className="w-7 h-7 text-amber-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
                DANH SÁCH CÔNG NHÂN KỸ THUẬT & NHÂN LỰC THỜI VỤ
              </h2>
              <span className="px-2 py-0.5 bg-amber-400 text-slate-950 font-black rounded text-[10px] uppercase tracking-wider">
                Lương tuần &bull; Khoán công trình
              </span>
            </div>
            <p className="text-xs text-sky-100 mt-1 max-w-2xl leading-relaxed">
              Quản lý chấm công tuần, đơn giá khoán ngày, tăng ca OT, phụ cấp ăn ca tại công trường và khấu trừ thuế TNCN 10% (có áp dụng Cam kết Mẫu 08/CK-TNCN).
            </p>
          </div>
        </div>

        {/* Thanh tác vụ chính */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút Thêm công nhân */}
          <button
            type="button"
            onClick={() => {
              setEditingWorker(null);
              setIsFormOpen(true);
            }}
            className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm công nhân thời vụ</span>
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
            title="Bật/tắt chế độ nhập và sửa trực tiếp đơn giá, ngày công, OT, tạm ứng trên từng ô bảng"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isQuickEditMode ? 'Đang sửa nhanh' : 'Sửa nhanh trên bảng'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
            title="Xuất file Excel bảng kê chi trả tiền công"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPayrollSheet}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            title="In bảng danh sách ký nhận tiền công"
          >
            <Printer className="w-4 h-4" />
            <span>In bảng ký nhận</span>
          </button>

          <button
            type="button"
            onClick={handleOpenBatchNewTab}
            className="px-3 py-2 bg-sky-500/25 hover:bg-sky-500/40 text-sky-100 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition cursor-pointer border border-sky-400/40"
            title="Mở tab mới độc lập để in bảng kê (tránh bị chặn bởi iframe)"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Mở tab in</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBatchHTML}
            className="px-2.5 py-2 bg-white/10 hover:bg-white/20 text-white/90 font-medium text-xs rounded-lg flex items-center gap-1 transition cursor-pointer"
            title="Tải tệp HTML bảng kê chi trả để mở và in trên mọi thiết bị"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Tải file in</span>
          </button>

          {/* Nút Khôi phục dữ liệu mẫu */}
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="px-2.5 py-2 bg-white/10 hover:bg-white/20 text-amber-200 font-semibold text-xs rounded-lg flex items-center gap-1 transition cursor-pointer border border-amber-300/30"
            title="Khôi phục lại danh sách 12 công nhân mẫu ban đầu"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
            <span>Nạp thợ mẫu</span>
          </button>

          {/* Nút Xóa toàn bộ danh sách */}
          <button
            type="button"
            onClick={() => setIsClearAllConfirming(true)}
            className="px-2.5 py-2 bg-rose-600/30 hover:bg-rose-600 text-rose-100 font-bold text-xs rounded-lg flex items-center gap-1 transition cursor-pointer border border-rose-500/50"
            title="Xóa trắng toàn bộ danh sách thợ để bắt đầu nhập công nhân thực tế của công trường"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-300" />
            <span>Xóa hết danh sách</span>
          </button>
        </div>
      </div>

      {/* Thông báo nếu trình duyệt chặn in qua iframe */}
      {batchPrintNotice && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 px-4 flex items-center justify-between text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Trình duyệt đang chặn cửa sổ in ấn bên trong ứng dụng. Hãy bấm <strong>&ldquo;Mở tab in&rdquo;</strong> hoặc <strong>&ldquo;Tải file in&rdquo;</strong> để in bảng kê chi trả ngay lập tức!
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenBatchNewTab}
            className="underline font-bold text-amber-900 hover:text-amber-950 ml-3 shrink-0 cursor-pointer"
          >
            Mở tab in ngay &rarr;
          </button>
        </div>
      )}

      {/* THANH CHỌN CHU KỲ (1 TUẦN / 2 TUẦN) VÀ DANH SÁCH KỲ LƯƠNG */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Bộ chọn Tháng / Năm chấm công */}
            {onChangeMonthYear ? (
              <MonthYearPicker
                month={currentMonth}
                year={currentYear}
                onChange={(m, y) => {
                  onChangeMonthYear(m, y);
                  showToast(`Đã chuyển sang kỳ chấm công Tháng ${m < 10 ? '0' + m : m}/${y}`);
                }}
                label="Tháng thi công:"
              />
            ) : (
              <div className="flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-3 py-1.5 rounded border border-slate-300">
                <Calendar className="w-4 h-4 text-sky-700" />
                <span>Tháng {currentMonth < 10 ? `0${currentMonth}` : currentMonth}/{currentYear}</span>
              </div>
            )}

            {/* OPTION CHU KỲ THANH TOÁN (1 TUẦN HOẶC 2 TUẦN) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 px-2 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-sky-700" />
                <span>Chu kỳ:</span>
              </span>
              <button
                type="button"
                onClick={() => handleCycleTypeChange('1_WEEK')}
                className={`px-3 py-1 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  cycleType === '1_WEEK'
                    ? 'bg-[#0f3d64] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <span>Lương 1 Tuần</span>
              </button>
              <button
                type="button"
                onClick={() => handleCycleTypeChange('2_WEEKS')}
                className={`px-3 py-1 rounded-md font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  cycleType === '2_WEEKS'
                    ? 'bg-[#0f3d64] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <span>Lương 2 Tuần (Nửa tháng)</span>
              </button>
            </div>
          </div>

          {/* Nút khôi phục mẫu */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-100 rounded text-slate-700 font-semibold flex items-center gap-1.5 transition cursor-pointer text-xs"
              title="Khôi phục danh sách công nhân mẫu ban đầu"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Khôi phục mẫu</span>
            </button>
          </div>
        </div>

        {/* DẢI NÚT CHỌN KỲ THANH TOÁN (THEO TUẦN HOẶC 2 TUẦN) */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-[11px] font-bold text-slate-600 px-1 shrink-0 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-sky-700" />
              <span>Chọn kỳ chấm:</span>
            </span>

            {payrollPeriods.map((period) => {
              const isSelected = selectedPeriodId === period.id;
              // Đếm số thợ đã có dữ liệu chấm công ở kỳ này
              const recordedCountInThisPeriod = workers.filter((w) => {
                const rec = w.periodRecords?.[period.periodKey];
                return rec && rec.isRecorded && (rec.actualWorkDays > 0 || rec.netSalary > 0);
              }).length;

              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => {
                    setSelectedPeriodId(period.id);
                    showToast(`Đã chuyển sang: ${period.label}`);
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-2 whitespace-nowrap border ${
                    isSelected
                      ? 'bg-[#0f3d64] text-white border-[#0f3d64] shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-sky-50 hover:border-sky-300'
                  }`}
                >
                  <span>{period.shortLabel}</span>
                  <span className={`text-[10px] font-normal ${isSelected ? 'text-sky-200' : 'text-slate-500'}`}>
                    ({period.startDate} - {period.endDate})
                  </span>
                  {recordedCountInThisPeriod > 0 ? (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${
                        isSelected
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {recordedCountInThisPeriod}/{workers.length} thợ
                    </span>
                  ) : (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-semibold ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      0 công
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* BANNER THÔNG TIN TRẠNG THÁI KỲ CHẤM CÔNG & NÚT TIỆN ÍCH XÂY DỰNG */}
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 px-3.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-sky-950">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold flex items-center gap-1.5 text-sky-900">
              <Calendar className="w-4 h-4 text-sky-700" />
              <span>Đang chấm công:</span>
              <strong className="text-[#0f3d64] underline underline-offset-2">
                {currentPeriodOption.label}
              </strong>
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-[11px] text-slate-600">
              Trạng thái: <strong>{stats.recordedWorkersCount}</strong> / {stats.totalWorkers} thợ đã ghi nhận công (
              {stats.totalWorkers - stats.recordedWorkersCount > 0 ? (
                <span className="text-amber-800 font-bold">
                  còn {stats.totalWorkers - stats.recordedWorkersCount} thợ chưa chấm
                </span>
              ) : (
                <span className="text-emerald-700 font-bold">Đã chấm đủ tất cả thợ</span>
              )}
              )
            </span>
          </div>

          {/* Cụm nút thao tác chấm công xây dựng nhanh */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleBatchFillFullDays}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] rounded flex items-center gap-1 shadow-2xs transition cursor-pointer"
              title={`Chấm đủ ${currentPeriodOption.cycleType === '1_WEEK' ? '6 ngày' : '13 ngày'} công tiêu chuẩn cho kỳ này`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Chấm đủ công kỳ này</span>
            </button>

            <button
              type="button"
              onClick={handleBatchClearDays}
              className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-[11px] rounded flex items-center gap-1 transition cursor-pointer"
              title="Đặt lại 0 công cho kỳ này để chấm lại từ đầu, tránh bị nhầm khi in phiếu"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
              <span>Xóa trắng để chấm lại</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Thẻ chỉ số tổng quan (Metric Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Tổng nhân công</span>
            <HardHat className="w-4 h-4 text-sky-700" />
          </div>
          <div className="text-xl font-black text-slate-800">
            {stats.totalWorkers} <span className="text-xs font-normal text-slate-500">thợ ({stats.activeWorkers} đang làm)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Tổng công: <strong className="text-slate-800">{stats.totalWorkDays}</strong> | OT: <strong className="text-slate-800">{stats.totalOvertimeHours}h</strong>
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Tiền công theo ngày</span>
            <DollarSign className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black text-slate-800 font-mono">
            {formatNumberOnly(stats.totalSalaryByDays)} <span className="text-xs font-normal text-slate-500">đ</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Tiền OT: {formatNumberOnly(stats.totalOvertimePay)} đ
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Tổng thu nhập thợ</span>
            <CreditCard className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-slate-800 font-mono">
            {formatNumberOnly(stats.totalIncome)} <span className="text-xs font-normal text-slate-500">đ</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Bao gồm lương ngày, OT, ăn ca, phụ cấp
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Khấu trừ & Tạm ứng</span>
            <ShieldCheck className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-black text-rose-600 font-mono">
            {formatNumberOnly(stats.totalTax + stats.totalAdvance)} <span className="text-xs font-normal text-slate-500">đ</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Thuế 10%: {formatNumberOnly(stats.totalTax)} đ | Tạm ứng: {formatNumberOnly(stats.totalAdvance)} đ
          </p>
        </div>

        <div className="bg-white p-3.5 rounded-xl border-2 border-emerald-500/30 bg-emerald-50/20 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-900 text-xs font-bold mb-1">
            <span>Tổng thực chi thanh toán</span>
            <Banknote className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-xl font-black text-emerald-800 font-mono">
            {formatNumberOnly(stats.totalNet)} <span className="text-xs font-normal text-emerald-600">đ</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            ATM: {formatNumberOnly(stats.totalBankPay)} đ | Mặt: {formatNumberOnly(stats.totalCashPay)} đ
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="no-print bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Input Tìm kiếm */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên thợ, mã, SĐT, CCCD, nghề nghiệp..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-xs"
            />
          </div>

          {/* Lọc Dự án */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 text-xs"
          >
            <option value="ALL">Tất cả công trình ({projects.length})</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {/* Lọc Nghề nghiệp */}
          <select
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 text-xs"
          >
            <option value="ALL">Tất cả chuyên môn ({trades.length})</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Lọc Hình thức nhận lương */}
          <select
            value={selectedPaymentMethod}
            onChange={(e) => setSelectedPaymentMethod(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 text-xs"
          >
            <option value="ALL">Hình thức nhận lương (Tất cả)</option>
            <option value="BANK">Chuyển khoản ATM</option>
            <option value="CASH">Tiền mặt tại công trường</option>
          </select>

          {/* Lọc Cam kết 08 */}
          <select
            value={selectedTaxFilter}
            onChange={(e) => setSelectedTaxFilter(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 text-xs"
          >
            <option value="ALL">Thuế TNCN (Tất cả)</option>
            <option value="HAS_COMMITMENT">Đã có Cam kết 08 (Miễn thuế)</option>
            <option value="NO_COMMITMENT">Chưa có Cam kết (Khấu trừ 10%)</option>
          </select>

          {/* Lọc Chu kỳ tính lương của thợ */}
          <select
            value={selectedWorkerCycleFilter}
            onChange={(e) => setSelectedWorkerCycleFilter(e.target.value as any)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 text-xs"
          >
            <option value="ALL">Chu kỳ lương thợ (Tất cả)</option>
            <option value="1_WEEK">Thợ nhận lương 1 Tuần</option>
            <option value="2_WEEKS">Thợ nhận lương 2 Tuần</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Bộ sắp xếp thứ tự đồng bộ đa máy */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-sky-700 shrink-0" />
            <span className="font-semibold text-slate-600 hidden sm:inline">Sắp xếp:</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as any)}
              className="bg-transparent font-medium text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="default">Thứ tự STT / Mã thợ (Chuẩn đồng bộ)</option>
              <option value="code">Mã thợ (PNC-TV01, TV02...)</option>
              <option value="name">Họ và tên thợ (A &rarr; Z)</option>
              <option value="dailyRate">Đơn giá ngày</option>
              <option value="actualWorkDays">Số ngày công</option>
              <option value="netSalary">Thực lĩnh chi trả</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-white text-sky-800 border border-slate-300 hover:bg-sky-50 cursor-pointer shadow-2xs transition"
              title={sortDirection === 'asc' ? 'Đang sắp xếp Tăng dần (A-Z, 1-9). Bấm để đảo chiều.' : 'Đang sắp xếp Giảm dần (Z-A, 9-1). Bấm để đảo chiều.'}
            >
              {sortDirection === 'asc' ? '▲ Tăng' : '▼ Giảm'}
            </button>
          </div>

          {/* Nút Chuẩn hóa & Khóa STT đồng bộ đa máy */}
          <button
            type="button"
            onClick={() => handleNormalizeOrder('code')}
            className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-[#0f3d64] border border-sky-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            title="Đánh lại số thứ tự STT (1, 2, 3...) theo Mã thợ tăng dần và lưu cố định lên Cloud để tất cả máy tính hiển thị chuẩn xác 100%"
          >
            <ListOrdered className="w-3.5 h-3.5 text-sky-700" />
            <span>Chuẩn hóa STT (1, 2, 3...)</span>
          </button>

          <span className="text-xs text-slate-500 font-semibold ml-auto">
            Hiển thị <strong>{filteredWorkers.length}</strong> / {workers.length} công nhân
          </span>
        </div>
      </div>

      {/* THANH HÀNH ĐỘNG HÀNG LOẠT (BULK ACTION BAR KHI CHỌN >= 1 CÔNG NHÂN) */}
      {selectedWorkerIds.length > 0 && (
        <div className="bg-sky-50 border border-sky-300 rounded-xl p-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150 shadow-2xs">
          <div className="flex items-center gap-2 text-sky-950 font-bold">
            <CheckSquare className="w-4 h-4 text-sky-700" />
            <span>Đã chọn <strong className="text-sky-800">{selectedWorkerIds.length}</strong> công nhân thời vụ</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintSelectedWorkers}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In danh sách đã chọn</span>
            </button>

            <button
              type="button"
              onClick={() => setIsBatchDeleting(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedWorkerIds.length} mục đã chọn</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedWorkerIds([])}
              className="px-2.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold rounded-lg transition cursor-pointer"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Hướng dẫn sửa / xóa trực quan */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 px-4 flex flex-wrap items-center justify-between text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-600"></span>
            <span>Bấm vào <strong>Họ tên</strong> hoặc nút <strong>&ldquo;Sửa&rdquo;</strong> để chỉnh sửa hồ sơ & chấm công tuần</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>Bấm biểu tượng <strong>Thùng rác</strong> để xóa thợ khỏi danh sách</span>
          </span>
          {isQuickEditMode && (
            <span className="flex items-center gap-1 text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded">
              <span>Chế độ sửa nhanh đang BẬT: Bạn có thể nhập số trực tiếp vào các ô Đơn giá, Công, OT, Tạm ứng!</span>
            </span>
          )}
        </div>
      </div>

      {/* Printable Sheet Title (Only visible in Print view) */}
      <div className="hidden print:block mb-4 text-center">
        <h2 className="text-base font-black uppercase text-slate-900">
          {config.name}
        </h2>
        <p className="text-xs text-slate-600">
          Địa chỉ: {config.address} — MST: {config.taxCode}
        </p>
        <h1 className="text-lg font-black uppercase text-slate-900 mt-2">
          BẢNG THANH TOÁN TIỀN CÔNG NHÂN LỰC THỜI VỤ & KÝ NHẬN TẠI CÔNG TRƯỜNG
        </h1>
        <p className="text-xs font-semibold text-slate-700">
          Tháng {currentMonth < 10 ? `0${currentMonth}` : currentMonth}/{currentYear} — Lập ngày: {config.paymentDate}
        </p>
      </div>

      {/* Main Spreadsheet Table */}
      <div className="border border-slate-300 rounded-xl overflow-x-auto max-h-[660px] relative text-[11px] bg-white shadow-2xs">
        <table className="w-full border-collapse text-left whitespace-nowrap">
          <thead className="bg-[#0f3d64] text-white font-bold sticky top-0 z-20 select-none shadow-xs">
            <tr>
              <th className="p-2 border-r border-sky-800 text-center w-10">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded text-sky-600 focus:ring-0 cursor-pointer"
                  title="Chọn tất cả công nhân"
                />
              </th>
              <th 
                onClick={() => handleToggleSort('default')}
                className="p-2 border-r border-sky-800 text-center w-10 cursor-pointer hover:bg-sky-800/80 transition select-none"
                title="Sắp xếp theo STT cố định"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>STT</span>
                  {sortField === 'default' && (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleToggleSort('code')}
                className="p-2 border-r border-sky-800 text-center w-20 cursor-pointer hover:bg-sky-800/80 transition select-none"
                title="Sắp xếp theo Mã thợ (PNC-TV01, TV02...)"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Mã thợ</span>
                  {sortField === 'code' ? (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleToggleSort('name')}
                className="p-2 border-r border-sky-800 sticky left-0 bg-[#0f3d64] z-30 min-w-[170px] cursor-pointer hover:bg-sky-800/80 transition select-none"
                title="Sắp xếp theo Họ tên (A-Z)"
              >
                <div className="flex items-center gap-1">
                  <span>Họ và tên công nhân</span>
                  {sortField === 'name' ? (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                  )}
                </div>
              </th>
              <th className="p-2 border-r border-sky-800 min-w-[150px]">Nghề nghiệp / Bậc thợ</th>
              <th className="p-2 border-r border-sky-800 min-w-[140px]">Công trình / Đội</th>
              <th className="p-2 border-r border-sky-800 text-center min-w-[100px]">SĐT / CCCD</th>
              <th 
                onClick={() => handleToggleSort('dailyRate')}
                className="p-2 border-r border-sky-800 text-right min-w-[110px] bg-[#124977] cursor-pointer hover:bg-[#185e99] transition select-none"
                title="Sắp xếp theo Đơn giá ngày"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Đơn giá ngày</span>
                  {sortField === 'dailyRate' ? (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                  )}
                </div>
              </th>
              <th 
                onClick={() => handleToggleSort('actualWorkDays')}
                className="p-2 border-r border-sky-800 text-center min-w-[115px] bg-[#124977] cursor-pointer hover:bg-[#185e99] transition select-none"
                title="Sắp xếp theo Số ngày công"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Số ngày công</span>
                  {sortField === 'actualWorkDays' ? (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                  )}
                </div>
              </th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[110px]">Lương theo công</th>
              <th className="p-2 border-r border-sky-800 text-center min-w-[85px]">Giờ OT</th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[95px]">Tiền OT (x1.5)</th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[90px]">Ăn ca / trưa</th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[90px]">Phụ cấp & Thưởng</th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[115px] bg-[#0c3150]">
                TỔNG THU NHẬP
              </th>
              <th className="p-2 border-r border-sky-800 text-center min-w-[105px]">Cam kết 08</th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[95px] text-rose-200">
                Thuế TNCN (10%)
              </th>
              <th className="p-2 border-r border-sky-800 text-right min-w-[100px] text-rose-200">
                Tạm ứng tại CT
              </th>
              <th 
                onClick={() => handleToggleSort('netSalary')}
                className="p-2 border-r border-sky-800 text-right min-w-[125px] bg-emerald-800 text-white font-extrabold cursor-pointer hover:bg-emerald-700 transition select-none"
                title="Sắp xếp theo Thực lĩnh chi trả"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>THỰC LĨNH CHI TRẢ</span>
                  {sortField === 'netSalary' ? (
                    <span className="text-[10px] text-amber-300">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    <ArrowUpDown className="w-2.5 h-2.5 opacity-50" />
                  )}
                </div>
              </th>
              <th className="p-2 border-r border-sky-800 min-w-[120px]">Hình thức & STK</th>
              <th className="p-2 border-r border-sky-800 text-center min-w-[95px] bg-[#124977]">Chu kỳ lương</th>
              <th className="p-2 border-r border-sky-800 text-center min-w-[80px]">Trạng thái</th>
              <th className="p-2 text-center w-36 no-print sticky right-0 bg-[#0f3d64] z-30">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredWorkers.length === 0 ? (
              <tr>
                <td colSpan={23} className="p-12 text-center text-slate-400">
                  <HardHat className="w-12 h-12 mx-auto text-amber-500/70 mb-3" />
                  <p className="font-bold text-base text-slate-700">
                    {workers.length === 0
                      ? 'Danh sách nhân lực thời vụ đang trống'
                      : 'Không tìm thấy công nhân kỹ thuật thời vụ phù hợp với bộ lọc'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    {workers.length === 0
                      ? 'Bạn có thể bắt đầu thêm mới công nhân công trường của mình, hoặc bấm "Nạp thợ mẫu" để tham khảo 12 công nhân kỹ thuật chuẩn.'
                      : 'Hãy thử xóa bộ lọc tìm kiếm hoặc thêm mới công nhân.'}
                  </p>
                  {workers.length === 0 && (
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWorker(null);
                          setIsFormOpen(true);
                        }}
                        className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Thêm công nhân đầu tiên</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowResetConfirm(true)}
                        className="px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 text-amber-300" />
                        <span>Nạp lại 12 thợ mẫu</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredWorkers.map((w, index) => {
                const isSelected = selectedWorkerIds.includes(w.id);

                return (
                  <tr
                    key={w.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-sky-50/90' : 'hover:bg-sky-50/40'
                    }`}
                  >
                    {/* Checkbox chọn hàng */}
                    <td className="p-2 border-r border-slate-200 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectWorker(w.id)}
                        className="rounded text-sky-600 focus:ring-0 cursor-pointer"
                      />
                    </td>

                    {/* STT */}
                    <td className="p-2 border-r border-slate-200 text-center text-slate-500 font-mono">
                      {index + 1}
                    </td>

                    {/* Mã thợ */}
                    <td
                      onClick={() => {
                        setEditingWorker(w);
                        setIsFormOpen(true);
                      }}
                      className="p-2 border-r border-slate-200 font-mono font-bold text-[#0f3d64] text-center cursor-pointer hover:underline"
                      title="Bấm để chỉnh sửa hồ sơ"
                    >
                      {w.code}
                    </td>

                    {/* Họ và tên */}
                    <td className="p-2 border-r border-slate-200 sticky left-0 bg-white hover:bg-sky-50/60 font-bold text-slate-900 z-10">
                      {isQuickEditMode ? (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={w.fullName}
                            onChange={(e) =>
                              handleQuickUpdate(w, { fullName: e.target.value })
                            }
                            className="w-full text-xs font-bold text-slate-900 px-1.5 py-0.5 border border-sky-400 rounded bg-white focus:ring-1 focus:ring-sky-500"
                            placeholder="Họ và tên..."
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingWorker(w);
                                setIsFormOpen(true);
                              }}
                              className="text-[10px] text-sky-700 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              <Edit2 className="w-2.5 h-2.5" /> Sửa chi tiết
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => setWorkerToDelete(w)}
                              className="text-[10px] text-rose-600 hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> Xóa
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div
                            onClick={() => {
                              setEditingWorker(w);
                              setIsFormOpen(true);
                            }}
                            className="flex items-center gap-1.5 cursor-pointer group"
                            title="Bấm để chỉnh sửa công nhân này"
                          >
                            <span className="group-hover:text-sky-700 group-hover:underline">
                              {w.fullName}
                            </span>
                            <Edit2 className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                            {w.paymentMethod === 'CASH' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100 text-amber-900 font-bold border border-amber-200 shrink-0">
                                Tiền mặt
                              </span>
                            )}
                          </div>
                          {/* Nút Sửa & Xóa nhanh tiện lợi ngay cột tên cố định */}
                          <div className="flex items-center gap-2 mt-1 no-print">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWorker(w);
                                setIsFormOpen(true);
                              }}
                              className="text-[10.5px] text-sky-700 hover:text-sky-900 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Chỉnh sửa chi tiết hồ sơ & chấm công"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                              <span>Sửa hồ sơ</span>
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWorkerToDelete(w);
                              }}
                              className="text-[10.5px] text-rose-600 hover:text-rose-800 font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                              title="Xóa công nhân này khỏi danh sách"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Xóa thợ</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Nghề nghiệp / Bậc thợ */}
                    <td className="p-2 border-r border-slate-200 text-slate-800">
                      {isQuickEditMode ? (
                        <input
                          type="text"
                          value={w.trade}
                          onChange={(e) =>
                            handleQuickUpdate(w, { trade: e.target.value })
                          }
                          className="w-full text-xs font-semibold text-slate-900 px-1 py-0.5 border border-sky-400 rounded bg-white"
                          placeholder="Nghề nghiệp..."
                        />
                      ) : (
                        <>
                          <div className="font-semibold text-slate-900">{w.trade}</div>
                          <div className="text-[10px] text-slate-500">{w.skillLevel}</div>
                        </>
                      )}
                    </td>

                    {/* Công trình / Đội */}
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      <div className="font-semibold text-sky-950">{w.project}</div>
                      <div className="text-[10px] text-slate-500">
                        {w.teamName} — {w.teamLeader}
                      </div>
                    </td>

                    {/* SĐT / CCCD */}
                    <td className="p-2 border-r border-slate-200 text-center font-mono text-[10px] text-slate-600">
                      <div>{w.phone || '—'}</div>
                      <div className="text-slate-400">{w.idCard || '—'}</div>
                    </td>

                    {/* Đơn giá ngày (Hỗ trợ sửa nhanh trực tiếp) */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-sky-900 bg-slate-50/50">
                      {isQuickEditMode ? (
                        <input
                          type="number"
                          step={10000}
                          value={w.dailyRate}
                          onChange={(e) =>
                            handleQuickUpdate(w, { dailyRate: Number(e.target.value) || 0 })
                          }
                          className="w-24 text-right px-1.5 py-0.5 border border-sky-400 rounded bg-white font-mono text-xs font-bold text-sky-950 focus:ring-1 focus:ring-sky-500"
                        />
                      ) : (
                        <span>{formatNumberOnly(w.dailyRate)} đ</span>
                      )}
                    </td>

                    {/* Số ngày công (Hỗ trợ stepper + sửa nhanh) */}
                    <td className="p-2 border-r border-slate-200 text-center font-mono font-black text-slate-900 bg-slate-50/50">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustDays(w, -0.5)}
                          className="no-print w-4 h-4 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold flex items-center justify-center cursor-pointer"
                          title="Giảm 0.5 công"
                        >
                          -
                        </button>

                        {isQuickEditMode ? (
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            max={31}
                            value={w.actualWorkDays}
                            onChange={(e) =>
                              handleQuickUpdate(w, { actualWorkDays: Number(e.target.value) || 0 })
                            }
                            className="w-12 text-center px-1 py-0.5 border border-sky-400 rounded bg-white font-mono text-xs font-black text-slate-950"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWorker(w);
                              setIsFormOpen(true);
                            }}
                            className="min-w-[32px] text-sky-950 hover:text-sky-600 hover:underline cursor-pointer font-black"
                            title="Bấm để xem & chấm công 7 ngày trong tuần"
                          >
                            {w.actualWorkDays}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleQuickAdjustDays(w, 0.5)}
                          className="no-print w-4 h-4 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold flex items-center justify-center cursor-pointer"
                          title="Tăng 0.5 công"
                        >
                          +
                        </button>
                      </div>
                      <div
                        className="no-print text-[9px] text-sky-700 font-semibold cursor-pointer hover:underline"
                        onClick={() => {
                          setEditingWorker(w);
                          setIsFormOpen(true);
                        }}
                      >
                        {w.currentWeekLabel
                          ? w.currentWeekLabel.split(' ')[0] + ' ' + w.currentWeekLabel.split(' ')[1]
                          : 'Lương tuần'}
                      </div>
                    </td>

                    {/* Lương theo công */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono font-semibold text-slate-800">
                      {formatNumberOnly(w.salaryByDays)}
                    </td>

                    {/* Giờ OT (Hỗ trợ sửa nhanh) */}
                    <td className="p-2 border-r border-slate-200 text-center font-mono font-medium text-slate-700">
                      {isQuickEditMode ? (
                        <input
                          type="number"
                          step={1}
                          min={0}
                          value={w.overtimeHours}
                          onChange={(e) =>
                            handleQuickUpdate(w, { overtimeHours: Number(e.target.value) || 0 })
                          }
                          className="w-12 text-center px-1 py-0.5 border border-sky-400 rounded bg-white font-mono text-xs font-semibold"
                        />
                      ) : (
                        <span>{w.overtimeHours > 0 ? `${w.overtimeHours}h` : '—'}</span>
                      )}
                    </td>

                    {/* Tiền OT */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                      {w.overtimePay > 0 ? formatNumberOnly(w.overtimePay) : '—'}
                    </td>

                    {/* Phụ cấp ăn ca */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                      {formatNumberOnly(w.mealAllowance)}
                    </td>

                    {/* Phụ cấp & Thưởng */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono text-slate-700">
                      {formatNumberOnly(w.travelSafetyAllowance + w.otherBonus)}
                    </td>

                    {/* Tổng thu nhập */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono font-bold text-sky-950 bg-sky-50/40">
                      {formatNumberOnly(w.totalIncome)}
                    </td>

                    {/* Cam kết 08 (Click để toggle nhanh) */}
                    <td className="p-2 border-r border-slate-200 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickUpdate(w, { hasTaxCommitment: !w.hasTaxCommitment })
                        }
                        className="cursor-pointer"
                        title="Bấm để bật/tắt Cam kết 08 (Miễn hoặc Khấu trừ 10%)"
                      >
                        {w.hasTaxCommitment ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 hover:bg-emerald-200 transition">
                            Có CK 08
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 font-bold border border-amber-200 hover:bg-amber-200 transition">
                            Trừ 10%
                          </span>
                        )}
                      </button>
                    </td>

                    {/* Thuế TNCN */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                      {w.personalIncomeTax > 0 ? formatNumberOnly(w.personalIncomeTax) : '—'}
                    </td>

                    {/* Tạm ứng tại CT (Hỗ trợ sửa nhanh) */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono text-rose-700 font-semibold">
                      {isQuickEditMode ? (
                        <input
                          type="number"
                          step={50000}
                          min={0}
                          value={w.advancePayment}
                          onChange={(e) =>
                            handleQuickUpdate(w, { advancePayment: Number(e.target.value) || 0 })
                          }
                          className="w-20 text-right px-1 py-0.5 border border-rose-300 rounded bg-white font-mono text-xs font-semibold text-rose-800"
                        />
                      ) : (
                        <span>{w.advancePayment > 0 ? formatNumberOnly(w.advancePayment) : '—'}</span>
                      )}
                    </td>

                    {/* Thực lĩnh chi trả */}
                    <td className="p-2 border-r border-slate-200 text-right font-mono font-black text-emerald-800 text-xs bg-emerald-50/50">
                      {formatNumberOnly(w.netSalary)} đ
                    </td>

                    {/* Hình thức & STK */}
                    <td className="p-2 border-r border-slate-200 text-slate-700">
                      {w.paymentMethod === 'BANK' ? (
                        <div>
                          <div className="font-semibold text-blue-900 font-mono text-[10px]">
                            {w.bankAccount}
                          </div>
                          <div className="text-[9px] text-slate-500">{w.bankName}</div>
                        </div>
                      ) : (
                        <span className="text-amber-800 font-semibold text-[10px] italic">
                          Ký nhận tiền mặt tại CT
                        </span>
                      )}
                    </td>

                    {/* Chu kỳ tính lương của thợ */}
                    <td className="p-2 border-r border-slate-200 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                          (w.payrollCycleType || '1_WEEK') === '2_WEEKS'
                            ? 'bg-amber-50 text-amber-900 border-amber-300'
                            : 'bg-sky-50 text-sky-900 border-sky-300'
                        }`}
                        title={(w.payrollCycleType || '1_WEEK') === '2_WEEKS' ? 'Nhận lương 2 tuần / đợt nửa tháng' : 'Nhận lương theo từng tuần (7 ngày)'}
                      >
                        {(w.payrollCycleType || '1_WEEK') === '2_WEEKS' ? '2 Tuần' : '1 Tuần'}
                      </span>
                    </td>

                    {/* Trạng thái */}
                    <td className="p-2 border-r border-slate-200 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          w.status === 'ACTIVE'
                            ? 'bg-sky-100 text-sky-800'
                            : w.status === 'COMPLETED'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {w.status === 'ACTIVE'
                          ? 'Đang làm'
                          : w.status === 'COMPLETED'
                          ? 'Xong việc'
                          : 'Tạm ngưng'}
                      </span>
                    </td>

                    {/* CỘT THAO TÁC RÕ RÀNG, DỄ BẤM */}
                    <td className="p-2 text-center no-print sticky right-0 bg-white hover:bg-sky-50/60 z-20 border-l border-slate-300 shadow-[-2px_0_4px_rgba(0,0,0,0.06)]">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Nút Sửa rõ ràng */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingWorker(w);
                            setIsFormOpen(true);
                          }}
                          className="px-2.5 py-1 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 rounded font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          title="Chỉnh sửa chi tiết hồ sơ & bảng chấm công tuần"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-sky-700" />
                          <span>Sửa</span>
                        </button>

                        {/* Nút Xóa có chữ Xóa rõ ràng */}
                        <button
                          type="button"
                          onClick={() => setWorkerToDelete(w)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-300 rounded font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-2xs"
                          title="Xóa công nhân thời vụ này khỏi hệ thống"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Xóa</span>
                        </button>

                        {/* Nút Xem phiếu */}
                        <button
                          type="button"
                          onClick={() => setViewingReceiptWorker(w)}
                          className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
                          title="Xem phiếu cá nhân Mẫu 03-LĐTL"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Nút In */}
                        <button
                          type="button"
                          onClick={() => {
                            printSeasonalWorkerReceipt(
                              w,
                              config,
                              () => {
                                setViewingReceiptWorker(w);
                              },
                              currentPeriodOption.label
                            );
                          }}
                          className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                          title="In phiếu chi trả tiền công"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Dòng tổng cộng chân bảng */}
          <tfoot className="bg-slate-100 font-bold text-slate-900 sticky bottom-0 border-t-2 border-slate-400 z-20">
            <tr>
              <td colSpan={7} className="p-2 border-r border-slate-300 uppercase text-right tracking-wider font-extrabold text-[#0f3d64]">
                TỔNG CỘNG ({filteredWorkers.length} CÔNG NHÂN):
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-sky-900">
                —
              </td>
              <td className="p-2 border-r border-slate-300 text-center font-mono font-black text-slate-900">
                {stats.totalWorkDays}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-slate-900">
                {formatNumberOnly(stats.totalSalaryByDays)}
              </td>
              <td className="p-2 border-r border-slate-300 text-center font-mono font-bold text-slate-900">
                {stats.totalOvertimeHours > 0 ? `${stats.totalOvertimeHours}h` : '—'}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-slate-900">
                {stats.totalOvertimePay > 0 ? formatNumberOnly(stats.totalOvertimePay) : '—'}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-slate-900">
                {formatNumberOnly(filteredWorkers.reduce((sum, w) => sum + (w.mealAllowance || 0), 0))}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-slate-900">
                {formatNumberOnly(filteredWorkers.reduce((sum, w) => sum + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0), 0))}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-[#0f3d64] bg-sky-100/60">
                {formatNumberOnly(stats.totalIncome)}
              </td>
              <td className="p-2 border-r border-slate-300 text-center text-slate-500 font-normal">
                —
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-rose-700">
                {formatNumberOnly(stats.totalTax)}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-bold text-rose-700">
                {formatNumberOnly(stats.totalAdvance)}
              </td>
              <td className="p-2 border-r border-slate-300 text-right font-mono font-black text-emerald-800 text-xs bg-emerald-100/60">
                {formatNumberOnly(stats.totalNet)} đ
              </td>
              <td colSpan={4} className="p-2 font-normal text-slate-600 text-[10px] italic">
                Bằng chữ: {numberToVietnameseWords(stats.totalNet)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Chữ ký duyệt chi trả (In ấn) */}
      <div className="hidden print:grid grid-cols-4 gap-4 mt-8 pt-4 text-center text-xs">
        <div>
          <p className="font-bold uppercase text-slate-900">NGƯỜI LẬP BIỂU</p>
          <p className="text-[10px] text-slate-500 italic">(Ký, ghi rõ họ tên)</p>
          <div className="h-20"></div>
          <p className="font-semibold text-slate-800">Lê Hồng Nhung</p>
        </div>
        <div>
          <p className="font-bold uppercase text-slate-900">CHỈ HUY TRƯỞNG CÔNG TRÌNH</p>
          <p className="text-[10px] text-slate-500 italic">(Xác nhận ngày công & OT)</p>
          <div className="h-20"></div>
          <p className="font-semibold text-slate-800">KS. Trần Văn Minh</p>
        </div>
        <div>
          <p className="font-bold uppercase text-slate-900">KẾ TOÁN TRƯỞNG</p>
          <p className="text-[10px] text-slate-500 italic">(Kiểm tra đối soát)</p>
          <div className="h-20"></div>
          <p className="font-semibold text-slate-800">Nguyễn Thanh Thúy</p>
        </div>
        <div>
          <p className="font-bold uppercase text-slate-900">GIÁM ĐỐC CÔNG TY</p>
          <p className="text-[10px] text-slate-500 italic">(Duyệt chi trả tiền công)</p>
          <div className="h-20"></div>
          <p className="font-semibold text-slate-800">Admin</p>
        </div>
      </div>

      {/* MODAL 1: FORM THÊM / SỬA CÔNG NHÂN THỜI VỤ */}
      <SeasonalWorkerModal
        isOpen={isFormOpen}
        worker={editingWorker}
        config={config}
        initialPeriod={currentPeriodOption}
        onClose={() => {
          setIsFormOpen(false);
          setEditingWorker(null);
        }}
        onSave={(savedWorker) => {
          if (editingWorker) {
            onUpdateWorker(savedWorker);
            showToast(`Đã cập nhật hồ sơ công nhân ${savedWorker.fullName} thành công!`);
          } else {
            onAddWorker(savedWorker);
            showToast(`Đã thêm mới công nhân ${savedWorker.fullName} thành công!`);
          }
          setIsFormOpen(false);
          setEditingWorker(null);
        }}
        onDelete={(id) => {
          onDeleteWorker(id);
          setIsFormOpen(false);
          setEditingWorker(null);
          showToast('Đã xóa công nhân thời vụ thành công!');
        }}
        existingCodes={workers.map((w) => w.code)}
      />

      {/* MODAL 2: XEM PHIẾU CÁ NHÂN */}
      <SeasonalWorkerReceiptModal
        isOpen={!!viewingReceiptWorker}
        worker={viewingReceiptWorker}
        config={config}
        periodLabel={currentPeriodOption.label}
        onClose={() => setViewingReceiptWorker(null)}
      />

      {/* MODAL 3: XÁC NHẬN XÓA 1 CÔNG NHÂN (IN-APP DIALOG - KHÔNG BỊ IFRAME CHẶN) */}
      {workerToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 text-rose-900">
              <div className="p-2.5 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">Xác nhận xóa công nhân thời vụ</h3>
                <p className="text-xs text-rose-700">Hành động này sẽ xóa thợ khỏi danh sách và bảng lương</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>Bạn có chắc chắn muốn xóa công nhân sau khỏi danh sách chi trả?</p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Họ và tên:</span>
                  <strong className="text-slate-900">{workerToDelete.fullName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Mã thợ:</span>
                  <strong className="font-mono text-sky-900">{workerToDelete.code}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nghề nghiệp:</span>
                  <span className="text-slate-800">{workerToDelete.trade} ({workerToDelete.skillLevel})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Công trình:</span>
                  <span className="text-slate-800">{workerToDelete.project}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500 font-bold">Thực lĩnh tuần:</span>
                  <strong className="text-emerald-700 font-mono font-black">{formatNumberOnly(workerToDelete.netSalary)} đ</strong>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setWorkerToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteWorker(workerToDelete.id);
                  setWorkerToDelete(null);
                  showToast(`Đã xóa thành công công nhân ${workerToDelete.fullName}`);
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

      {/* MODAL 4: XÁC NHẬN XÓA HÀNG LOẠT (BATCH DELETE) */}
      {isBatchDeleting && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 text-rose-900">
              <div className="p-2.5 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">Xóa hàng loạt công nhân đã chọn</h3>
                <p className="text-xs text-rose-700">Đang chọn {selectedWorkerIds.length} công nhân</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>
                Bạn có chắc chắn muốn xóa toàn bộ <strong>{selectedWorkerIds.length}</strong> công nhân đã được tích chọn khỏi danh sách và bảng thanh toán lương?
              </p>
              <p className="text-slate-500 text-[11px] italic">
                Lưu ý: Thao tác này sẽ gỡ bỏ bảng chấm công và tiền lương của các công nhân này.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBatchDeleting(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteBatchWorkers) {
                    onDeleteBatchWorkers(selectedWorkerIds);
                  } else {
                    selectedWorkerIds.forEach((id) => onDeleteWorker(id));
                  }
                  const count = selectedWorkerIds.length;
                  setSelectedWorkerIds([]);
                  setIsBatchDeleting(false);
                  showToast(`Đã xóa thành công ${count} công nhân đã chọn!`);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa {selectedWorkerIds.length} công nhân</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: XÁC NHẬN KHÔI PHỤC DỮ LIỆU MẪU */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-amber-50 border-b border-amber-200 p-4 flex items-center gap-3 text-amber-900">
              <div className="p-2.5 bg-amber-100 rounded-full shrink-0">
                <RotateCcw className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">Khôi phục danh sách mẫu</h3>
                <p className="text-xs text-amber-700">Tải lại 12 công nhân kỹ thuật chuẩn mẫu ban đầu</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>
                Thao tác này sẽ tải lại danh sách 12 công nhân mẫu đại diện cho các đội thi công: Xây dựng, Cơ điện M&E, Thợ sắt hàn, Sơn nước...
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetWorkers();
                  setShowResetConfirm(false);
                  showToast('Đã khôi phục danh sách công nhân mẫu ban đầu thành công!');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi phục dữ liệu mẫu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: XÁC NHẬN XÓA TOÀN BỘ DANH SÁCH THỢ */}
      {isClearAllConfirming && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-50 border-b border-rose-200 p-4 flex items-center gap-3 text-rose-900">
              <div className="p-2.5 bg-rose-100 rounded-full shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase">Xóa toàn bộ danh sách thợ</h3>
                <p className="text-xs text-rose-700">Dọn sạch danh sách để lập danh sách công trình mới</p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-700 space-y-3">
              <p>
                Bạn có chắc chắn muốn xóa toàn bộ <strong>{workers.length}</strong> công nhân thời vụ trong hệ thống không?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                Sau khi xóa trắng, bạn có thể tự do thêm danh sách công nhân thực tế của bạn hoặc bấm <strong>&ldquo;Nạp thợ mẫu&rdquo;</strong> bất kỳ lúc nào nếu muốn xem lại.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsClearAllConfirming(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onClearAllWorkers) {
                    onClearAllWorkers();
                  } else {
                    workers.forEach((w) => onDeleteWorker(w.id));
                  }
                  setSelectedWorkerIds([]);
                  setIsClearAllConfirming(false);
                  showToast('Đã xóa sạch toàn bộ danh sách công nhân thời vụ!');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Đồng ý xóa toàn bộ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
