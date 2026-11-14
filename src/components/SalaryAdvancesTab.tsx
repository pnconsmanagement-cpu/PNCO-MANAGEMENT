import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  Printer,
  Download,
  AlertCircle,
  X,
  Save,
  Check,
  Building,
  HardHat,
  Users,
  DollarSign,
  FileText,
  Edit2,
  Cloud,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SalaryAdvance, Employee, SeasonalWorker, TeamWorker, CompanyConfig } from '../types';
import { formatVND, numberToVietnameseWords } from '../utils/numberToVietnameseWords';
import {
  isSupabaseConfigured,
  syncSalaryAdvancesToSupabase,
  loadSalaryAdvancesFromSupabase,
} from '../services/supabaseService';

interface SalaryAdvancesTabProps {
  advances: SalaryAdvance[];
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  teamWorkers: TeamWorker[];
  config: CompanyConfig;
  onAddAdvance: (advance: SalaryAdvance) => void;
  onUpdateAdvance: (advance: SalaryAdvance) => void;
  onDeleteAdvance: (id: string) => void;
  forcedTargetType?: 'PERMANENT' | 'SEASONAL' | 'TEAM';
  onSaveData?: () => Promise<void> | void;
  onOpenSupabaseModal?: () => void;
  hasUnsavedChanges?: boolean;
  isSavingData?: boolean;
}

export const SalaryAdvancesTab: React.FC<SalaryAdvancesTabProps> = ({
  advances,
  employees,
  seasonalWorkers,
  teamWorkers,
  config,
  onAddAdvance,
  onUpdateAdvance,
  onDeleteAdvance,
  forcedTargetType,
  onSaveData,
  onOpenSupabaseModal,
  hasUnsavedChanges = false,
  isSavingData = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<'ALL' | 'PERMANENT' | 'SEASONAL' | 'TEAM'>(
    forcedTargetType || 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DEDUCTED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [printingAdvance, setPrintingAdvance] = useState<SalaryAdvance | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [cloudConnected, setCloudConnected] = useState<boolean>(() => isSupabaseConfigured());
  const [cloudRowCount, setCloudRowCount] = useState<number | null>(null);
  const [cloudErrorMsg, setCloudErrorMsg] = useState<string | null>(null);
  const [isPushingCloud, setIsPushingCloud] = useState<boolean>(false);

  const refreshCloudAdvanceCount = React.useCallback(async () => {
    const connected = isSupabaseConfigured();
    setCloudConnected(connected);
    if (!connected) {
      setCloudRowCount(null);
      return null;
    }
    const rows = await loadSalaryAdvancesFromSupabase();
    if (rows !== null) {
      setCloudRowCount(rows.length);
      return rows.length;
    }
    return null;
  }, []);

  React.useEffect(() => {
    refreshCloudAdvanceCount();
    const onCfgChange = () => {
      refreshCloudAdvanceCount();
    };
    window.addEventListener('pncons-supabase-config-changed', onCfgChange);
    return () => window.removeEventListener('pncons-supabase-config-changed', onCfgChange);
  }, [refreshCloudAdvanceCount]);

  React.useEffect(() => {
    if (forcedTargetType) {
      setTargetTypeFilter(forcedTargetType);
      setFormTargetType(forcedTargetType);
    }
  }, [forcedTargetType]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const withSyncTimeout = <T,>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> => {
    return new Promise<T>((resolve) => {
      const timer = setTimeout(() => resolve(fallbackValue), ms);
      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(fallbackValue);
        });
    });
  };

  const persistAdvancesListToSupabase = async (
    targetList: SalaryAdvance[],
    periodKeyHint?: string,
    voucherLabel?: string
  ) => {
    setIsPushingCloud(true);
    setCloudErrorMsg(null);
    try {
      const connected = isSupabaseConfigured();
      setCloudConnected(connected);

      if (!connected) {
        if (onSaveData) {
          void Promise.resolve(onSaveData()).catch(() => {});
        }
        setCloudErrorMsg(
          'Trình duyệt hiện tại chưa kết nối Supabase Cloud nên dữ liệu chỉ mới lưu trên máy này. Hãy nhấn "Kết nối Supabase Cloud" để ghi vào bảng salary_advances!'
        );
        showToast('Đã lưu trên máy — Vui lòng Kết nối Supabase Cloud để đẩy lên bảng salary_advances!');
        return;
      }

      // Ghi trực tiếp bảng salary_advances lên Supabase trước tiên (nhanh ~200ms) có bảo vệ timeout 10s
      const res = await withSyncTimeout(
        syncSalaryAdvancesToSupabase(targetList, periodKeyHint || config.periodCode),
        10000,
        {
          success: false,
          count: 0,
          message: 'Quá thời gian phản hồi từ mạng khi ghi bảng salary_advances.',
          error: 'Mạng phản hồi chậm — vui lòng nhấn Lưu Data Lên Supabase để đồng bộ lại.',
        }
      );

      // Đồng bộ nền sang toàn cục (LocalStorage, Server, Bản Lương) không chặn giao diện
      if (onSaveData) {
        void Promise.resolve(onSaveData()).catch(() => {});
      }

      if (!res.success) {
        const errDetail = res.error || res.message || 'Không ghi được vào bảng salary_advances';
        setCloudErrorMsg(`Lỗi ghi bảng salary_advances: ${errDetail}`);
        showToast(`Lỗi ghi bảng salary_advances: ${errDetail}`);
        return;
      }

      const verifiedCount = await withSyncTimeout(refreshCloudAdvanceCount(), 5000, null);
      const finalCount = verifiedCount !== null ? verifiedCount : res.count;
      setCloudErrorMsg(null);
      showToast(
        voucherLabel
          ? `✓ Đã ghi phiếu ${voucherLabel} vào bảng salary_advances trên Supabase (Tổng: ${finalCount} phiếu)!`
          : `✓ Đã đồng bộ thành công ${finalCount} phiếu vào bảng salary_advances trên Supabase!`
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      setCloudErrorMsg(`Lỗi kết nối khi ghi bảng salary_advances: ${msg}`);
    } finally {
      setIsPushingCloud(false);
    }
  };

  const [editingAdvance, setEditingAdvance] = useState<SalaryAdvance | null>(null);

  // Helper chuyển đổi giữa YYYY-MM-DD (input type="date") và DD/MM/YYYY (hiển thị)
  const getTodayIsoDate = () => {
    const now = new Date();
    const y = config.year || now.getFullYear();
    const m = String(config.month || now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const toIsoDateString = (dateStr?: string): string => {
    if (!dateStr) return getTodayIsoDate();
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr.trim();
    const parts = dateStr.trim().split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return getTodayIsoDate();
  };

  const toVnDateString = (isoStr: string): string => {
    if (!isoStr) return new Date().toLocaleDateString('vi-VN');
    const parts = isoStr.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return isoStr;
  };

  const getPeriodKeyFromIsoDate = (isoStr: string): string => {
    const parts = isoStr.trim().split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return `${config.month < 10 ? '0' + config.month : config.month}/${config.year}`;
  };

  // Form modal state
  const [formTargetType, setFormTargetType] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>(
    forcedTargetType || 'PERMANENT'
  );
  const [formWorkerId, setFormWorkerId] = useState('');
  const [modalWorkerSearch, setModalWorkerSearch] = useState('');
  const [modalSubGroupFilter, setModalSubGroupFilter] = useState('ALL');
  const [formAmount, setFormAmount] = useState<number>(3000000);
  const [formRequestDate, setFormRequestDate] = useState<string>(() => getTodayIsoDate());
  const [formReason, setFormReason] = useState('Tạm ứng tiền sinh hoạt công trường giữa kỳ');
  const [formMethod, setFormMethod] = useState<'BANK' | 'CASH'>('BANK');
  const [formNotes, setFormNotes] = useState('');

  const normalizeSearchText = (str?: string): string => {
    if (!str) return '';
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  };

  const selectedWorkerRowRef = React.useRef<HTMLTableRowElement | null>(null);

  // Danh sách worker khả dụng theo loại target - CHỈ HIỆN NHÂN SỰ ĐANG LÀM VIỆC (ACTIVE)
  const availableWorkers = useMemo(() => {
    if (formTargetType === 'PERMANENT') {
      return employees
        .filter((e) => (e.status || 'ACTIVE') === 'ACTIVE')
        .map((e) => {
          const safeKey = String(e.id || e.code || '').trim();
          const safeCode = String(e.code || e.id || '').trim();
          return {
            id: safeKey,
            rawId: String(e.id || safeCode).trim(),
            code: safeCode,
            name: e.fullName,
            sub: e.department || 'Văn phòng',
            groupLabel: e.department || 'Văn phòng',
            roleLabel: e.title || 'Nhân viên chính thức',
            phone: e.phone || '',
            bankAccount: e.bankAccount || '',
            bankName: e.bankName || '',
            resolvedTargetType: 'PERMANENT' as const,
          };
        });
    } else if (formTargetType === 'SEASONAL') {
      return seasonalWorkers
        .filter((w) => (w.status || 'ACTIVE') === 'ACTIVE')
        .map((w) => {
          const safeKey = String(w.id || w.code || '').trim();
          const safeCode = String(w.code || w.id || '').trim();
          return {
            id: safeKey,
            rawId: String(w.id || safeCode).trim(),
            code: safeCode,
            name: w.fullName,
            sub: `${w.project || w.trade || ''}${w.payrollCycleType === 'TEAM' ? ' • Hệ Tổ đội' : ''}`,
            groupLabel: w.project || 'Công trình',
            roleLabel: `${w.trade || 'Thợ thời vụ'}${w.payrollCycleType === 'TEAM' ? ' (Tổ đội)' : ''}`,
            phone: w.phone || '',
            bankAccount: w.bankAccount || '',
            bankName: w.bankName || (w.paymentMethod === 'CASH' ? 'Tiền mặt' : ''),
            resolvedTargetType: 'SEASONAL' as const,
          };
        });
    } else {
      const seasonalTeams = seasonalWorkers
        .filter((w) => (w.status || 'ACTIVE') === 'ACTIVE' && w.payrollCycleType === 'TEAM')
        .map((w) => {
          const safeKey = String(w.id || w.code || '').trim();
          const safeCode = String(w.code || w.id || '').trim();
          return {
            id: safeKey,
            rawId: String(w.id || safeCode).trim(),
            code: safeCode,
            name: w.fullName,
            sub: `${w.project || w.trade || 'Tổ đội'} • Bản Lương Tổ Đội`,
            groupLabel: w.project || 'Tổ đội thi công',
            roleLabel: `${w.trade || 'Công nhân Tổ đội'}${w.teamName ? ` • ${w.teamName}` : ''}`,
            phone: w.phone || '',
            bankAccount: w.bankAccount || '',
            bankName: w.bankName || (w.paymentMethod === 'CASH' ? 'Tiền mặt' : ''),
            resolvedTargetType: 'SEASONAL' as const,
          };
        });
      const legacyTeams = teamWorkers
        .filter((t) => (t.status || 'ACTIVE') === 'ACTIVE')
        .map((t) => {
          const safeKey = String(t.id || t.code || '').trim();
          const safeCode = String(t.code || t.id || '').trim();
          return {
            id: safeKey,
            rawId: String(t.id || safeCode).trim(),
            code: safeCode,
            name: t.teamName,
            sub: `${t.leaderName} (${t.project})`,
            groupLabel: t.project || 'Tổ đội khoán',
            roleLabel: `Đội trưởng: ${t.leaderName}`,
            phone: t.phone || '',
            bankAccount: t.bankAccount || '',
            bankName: t.bankName || '',
            resolvedTargetType: 'TEAM' as const,
          };
        });
      return [...seasonalTeams, ...legacyTeams];
    }
  }, [formTargetType, employees, seasonalWorkers, teamWorkers]);

  const availableModalSubGroups = useMemo(() => {
    const set = new Set<string>();
    availableWorkers.forEach((w) => {
      if (w.groupLabel && w.groupLabel.trim()) set.add(w.groupLabel.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [availableWorkers]);

  const filteredModalWorkers = useMemo(() => {
    const qNorm = normalizeSearchText(modalWorkerSearch);
    const qRaw = modalWorkerSearch.trim().toLowerCase();
    return availableWorkers.filter((w) => {
      if (modalSubGroupFilter !== 'ALL' && w.groupLabel !== modalSubGroupFilter) {
        return false;
      }
      if (!qNorm) return true;
      const haystackRaw = `${w.code} ${w.name} ${w.sub} ${w.roleLabel} ${w.phone} ${w.bankAccount} ${w.bankName}`.toLowerCase();
      if (haystackRaw.includes(qRaw)) return true;
      const haystackNorm = normalizeSearchText(
        `${w.code} ${w.name} ${w.sub} ${w.roleLabel} ${w.phone} ${w.bankAccount} ${w.bankName}`
      );
      return haystackNorm.includes(qNorm);
    });
  }, [availableWorkers, modalWorkerSearch, modalSubGroupFilter]);

  const selectedModalWorkerObj = useMemo(() => {
    const targetKey = String(formWorkerId || '').trim();
    if (!targetKey) return null;
    return availableWorkers.find((w) => w.id === targetKey || w.code === targetKey) || null;
  }, [availableWorkers, formWorkerId]);

  // Tự động cuộn tới đúng dòng nhân sự đang chọn khi mở cửa sổ Sửa Phiếu Tạm Ứng
  React.useEffect(() => {
    if (!isModalOpen) return;
    const t = setTimeout(() => {
      selectedWorkerRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [isModalOpen, editingAdvance?.id]);

  const openAddModal = () => {
    setEditingAdvance(null);
    const target = forcedTargetType || 'PERMANENT';
    setFormTargetType(target);
    setModalWorkerSearch('');
    setModalSubGroupFilter('ALL');
    const firstActiveEmp = employees.find((e) => (e.status || 'ACTIVE') === 'ACTIVE');
    const firstActiveSea = seasonalWorkers.find((w) => (w.status || 'ACTIVE') === 'ACTIVE');
    const firstKey =
      target === 'PERMANENT'
        ? String(firstActiveEmp?.id || firstActiveEmp?.code || '').trim()
        : String(firstActiveSea?.id || firstActiveSea?.code || '').trim();
    setFormWorkerId(firstKey);
    setFormAmount(3000000);
    setFormRequestDate(getTodayIsoDate());
    setFormReason(target === 'PERMANENT' ? 'Tạm ứng tiền lương giữa kỳ' : 'Tạm ứng tiền sinh hoạt công trường giữa kỳ');
    setFormMethod('BANK');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (adv: SalaryAdvance) => {
    setEditingAdvance(adv);
    setModalWorkerSearch('');
    setModalSubGroupFilter('ALL');
    setFormTargetType(adv.targetType);
    const advWId = String(adv.workerId || '').trim();
    const advWCode = String(adv.workerCode || '').trim();
    let matchedId = advWId || advWCode;

    if (adv.targetType === 'PERMANENT') {
      const emp = employees.find(
        (e) =>
          (Boolean(advWId) && String(e.id || '').trim() === advWId) ||
          (Boolean(advWCode) && String(e.code || '').trim() === advWCode)
      );
      if (emp) matchedId = String(emp.id || emp.code || matchedId).trim();
    } else if (adv.targetType === 'SEASONAL') {
      const sw = seasonalWorkers.find(
        (w) =>
          (Boolean(advWId) && String(w.id || '').trim() === advWId) ||
          (Boolean(advWCode) && String(w.code || '').trim() === advWCode)
      );
      if (sw) matchedId = String(sw.id || sw.code || matchedId).trim();
    } else if (adv.targetType === 'TEAM') {
      const swTeam = seasonalWorkers.find(
        (w) =>
          (Boolean(advWId) && String(w.id || '').trim() === advWId) ||
          (Boolean(advWCode) && String(w.code || '').trim() === advWCode)
      );
      if (swTeam) {
        matchedId = String(swTeam.id || swTeam.code || matchedId).trim();
      } else {
        const tw = teamWorkers.find(
          (t) =>
            (Boolean(advWId) && String(t.id || '').trim() === advWId) ||
            (Boolean(advWCode) && String(t.code || '').trim() === advWCode)
        );
        if (tw) matchedId = String(tw.id || tw.code || matchedId).trim();
      }
    }

    setFormWorkerId(matchedId);
    setFormAmount(adv.amount || 0);
    setFormRequestDate(toIsoDateString(adv.requestDate || adv.paymentDate));
    setFormReason(adv.reason || '');
    setFormMethod(adv.paymentMethod || 'BANK');
    setFormNotes(adv.notes || '');
    setIsModalOpen(true);
  };

  const handleCreateAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const targetKey = String(formWorkerId || '').trim();
    const selectedWorker =
      (targetKey
        ? availableWorkers.find((w) => w.id === targetKey || w.code === targetKey)
        : undefined) ||
      (editingAdvance
        ? {
            id: String(editingAdvance.workerId || editingAdvance.workerCode || '').trim(),
            rawId: String(editingAdvance.workerId || editingAdvance.workerCode || '').trim(),
            code: String(editingAdvance.workerCode || editingAdvance.workerId || '').trim(),
            name: editingAdvance.workerName,
            sub: editingAdvance.departmentOrProject,
            resolvedTargetType: editingAdvance.targetType,
          }
        : undefined);

    if (!selectedWorker) {
      showToast('Vui lòng chọn nhân sự nhận tạm ứng trong danh sách!');
      return;
    }

    const formattedDate = toVnDateString(formRequestDate);
    const derivedPeriodKey = getPeriodKeyFromIsoDate(formRequestDate);

    if (editingAdvance) {
      const updatedAdv: SalaryAdvance = {
        ...editingAdvance,
        targetType: selectedWorker.resolvedTargetType || formTargetType,
        workerId: selectedWorker.rawId || selectedWorker.id || selectedWorker.code,
        workerCode: selectedWorker.code || selectedWorker.id,
        workerName: selectedWorker.name,
        departmentOrProject: selectedWorker.sub || 'Công ty Phúc Nguyên',
        amount: Number(formAmount) || 0,
        requestDate: formattedDate,
        paymentDate: formattedDate,
        reason: formReason,
        paymentMethod: formMethod,
        periodKey: derivedPeriodKey,
        notes: formNotes,
      };
      const nextList = advances.map((item) => (item.id === updatedAdv.id ? updatedAdv : item));
      onUpdateAdvance(updatedAdv);
      setEditingAdvance(null);
      setIsModalOpen(false);
      showToast(`✓ Đã cập nhật phiếu ${updatedAdv.advanceCode} — Đang đồng bộ lên Supabase...`);
      void persistAdvancesListToSupabase(nextList, derivedPeriodKey, updatedAdv.advanceCode);
      return;
    }

    // Sinh mã phiếu TU-YYYY-NNN không bao giờ trùng lặp với các phiếu đã có (tránh lỗi UNIQUE constraint trên Supabase)
    const existingCodes = new Set(advances.map((a) => String(a.advanceCode || '').trim()));
    const yearPrefix = formRequestDate.slice(0, 4) || String(config.year || 2026);
    const maxSeq = advances.reduce((maxN, a) => {
      const m = String(a.advanceCode || '').match(/(\d+)\s*$/);
      if (!m) return maxN;
      const num = parseInt(m[1], 10);
      return !isNaN(num) && num < 100000 ? Math.max(maxN, num) : maxN;
    }, 0);
    let nextSeq = Math.max(advances.length + 1, maxSeq + 1);
    let candidateCode = `TU-${yearPrefix}-${nextSeq < 100 ? String(nextSeq).padStart(3, '0') : nextSeq}`;
    while (existingCodes.has(candidateCode)) {
      nextSeq += 1;
      candidateCode = `TU-${yearPrefix}-${nextSeq < 100 ? String(nextSeq).padStart(3, '0') : nextSeq}`;
    }

    const newAdv: SalaryAdvance = {
      id: `adv-${Date.now()}`,
      advanceCode: candidateCode,
      targetType: selectedWorker.resolvedTargetType || formTargetType,
      workerId: selectedWorker.rawId || selectedWorker.id || selectedWorker.code,
      workerCode: selectedWorker.code || selectedWorker.id,
      workerName: selectedWorker.name,
      departmentOrProject: selectedWorker.sub || 'Công ty Phúc Nguyên',
      amount: Number(formAmount) || 0,
      requestDate: formattedDate,
      paymentDate: formattedDate,
      reason: formReason,
      paymentMethod: formMethod,
      status: 'APPROVED',
      approvedBy: 'Admin (Giám đốc)',
      periodKey: derivedPeriodKey,
      notes: formNotes,
    };

    const nextList = [newAdv, ...advances];
    onAddAdvance(newAdv);
    setIsModalOpen(false);
    showToast(`✓ Đã tạo phiếu ${newAdv.advanceCode} — Đang đồng bộ lên Supabase...`);
    void persistAdvancesListToSupabase(nextList, derivedPeriodKey, newAdv.advanceCode);
  };

  // Thay đổi trạng thái ứng
  const handleToggleStatus = (adv: SalaryAdvance) => {
    let nextStatus: SalaryAdvance['status'] = 'APPROVED';
    if (adv.status === 'APPROVED') nextStatus = 'DEDUCTED';
    else if (adv.status === 'DEDUCTED') nextStatus = 'PENDING';
    else if (adv.status === 'PENDING') nextStatus = 'APPROVED';

    const updated: SalaryAdvance = { ...adv, status: nextStatus };
    onUpdateAdvance(updated);
    showToast(
      nextStatus === 'DEDUCTED'
        ? `Đã chuyển trạng thái phiếu ${adv.advanceCode} — Nhấn "Lưu Data" để lưu lên Supabase!`
        : `Đã cập nhật trạng thái phiếu ${adv.advanceCode} — Nhấn "Lưu Data" để lưu!`
    );
  };

  // Danh sách theo phân hệ đang xem (Chính thức hoặc Thời vụ/Tổ đội)
  const scopedAdvancesByGroup = useMemo(() => {
    return advances.filter((adv) => {
      let isWorkerActive = true;
      if (adv.targetType === 'PERMANENT') {
        const emp = employees.find((e) => e.id === adv.workerId || e.code === adv.workerCode);
        if (emp && (emp.status || 'ACTIVE') !== 'ACTIVE') isWorkerActive = false;
      } else if (adv.targetType === 'SEASONAL') {
        const worker = seasonalWorkers.find((w) => w.id === adv.workerId || w.code === adv.workerCode);
        if (worker && (worker.status || 'ACTIVE') !== 'ACTIVE') isWorkerActive = false;
      } else if (adv.targetType === 'TEAM') {
        const swTeam = seasonalWorkers.find((w) => w.id === adv.workerId || w.code === adv.workerCode);
        const team = teamWorkers.find((t) => t.id === adv.workerId || t.code === adv.workerCode);
        if (swTeam && (swTeam.status || 'ACTIVE') !== 'ACTIVE') isWorkerActive = false;
        if (!swTeam && team && (team.status || 'ACTIVE') !== 'ACTIVE') isWorkerActive = false;
      }
      if (!isWorkerActive) return false;

      if (targetTypeFilter === 'ALL') return true;
      if (targetTypeFilter === 'SEASONAL') {
        return adv.targetType === 'SEASONAL' || adv.targetType === 'TEAM';
      }
      return adv.targetType === targetTypeFilter;
    });
  }, [advances, employees, seasonalWorkers, teamWorkers, targetTypeFilter]);

  // Lọc danh sách hiển thị trên bảng theo từ khóa & trạng thái
  const filteredAdvances = useMemo(() => {
    return scopedAdvancesByGroup.filter((adv) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        (adv.workerName || '').toLowerCase().includes(q) ||
        (adv.workerCode || '').toLowerCase().includes(q) ||
        (adv.advanceCode || '').toLowerCase().includes(q) ||
        (adv.departmentOrProject || '').toLowerCase().includes(q) ||
        (adv.reason || '').toLowerCase().includes(q) ||
        (adv.periodKey || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'ALL' || adv.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [scopedAdvancesByGroup, searchTerm, statusFilter]);

  // Thống kê đúng theo phân hệ đang mở (không cộng lẫn phiếu của khối khác)
  const totalAmount = scopedAdvancesByGroup.reduce((sum, a) => sum + (a.amount || 0), 0);
  const deductedAmount = scopedAdvancesByGroup
    .filter((a) => a.status === 'DEDUCTED')
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  const approvedAmount = scopedAdvancesByGroup
    .filter((a) => a.status === 'APPROVED')
    .reduce((sum, a) => sum + (a.amount || 0), 0);

  // Xuất file Excel
  const handleExportExcel = () => {
    const dataToExport = filteredAdvances.map((a, idx) => ({
      STT: idx + 1,
      'Mã Phiếu Ứng': a.advanceCode,
      'Mã Nhân Sự': a.workerCode,
      'Họ Và Tên': a.workerName,
      'Nhóm Nhân Sự':
        a.targetType === 'PERMANENT'
          ? 'Chính thức'
          : a.targetType === 'SEASONAL'
          ? 'Thời vụ'
          : 'Tổ đội',
      'Phòng Ban / Công Trình': a.departmentOrProject,
      'Số Tiền Ứng (VNĐ)': a.amount,
      'Bằng Chữ': numberToVietnameseWords(a.amount),
      'Ngày Ứng': a.requestDate,
      'Phương Thức': a.paymentMethod === 'BANK' ? 'Chuyển khoản' : 'Tiền mặt',
      'Lý Do': a.reason,
      'Trạng Thái':
        a.status === 'DEDUCTED'
          ? 'Đã trừ vào lương'
          : a.status === 'APPROVED'
          ? 'Đã duyệt chi'
          : 'Chờ duyệt',
      'Kỳ Lương Khấu Trừ': a.periodKey,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TamUngLuong');
    XLSX.writeFile(wb, `Danh_Sach_Tam_Ung_Luong_Phuc_Nguyen_${Date.now()}.xlsx`);
    showToast('Đã xuất danh sách tạm ứng lương ra Excel thành công!');
  };

  // In phiếu chi tạm ứng an toàn qua iframe ẩn (không cần pop-up window.open)
  const handlePrintAdvanceReceipt = (adv: SalaryAdvance) => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Phiếu Chi Tạm Ứng - ${adv.advanceCode}</title>
        <style>
          body { font-family: 'Times New Roman', serif; padding: 25px; color: #111; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .title { text-align: center; margin: 20px 0; }
          .title h1 { margin: 0; font-size: 22px; text-transform: uppercase; }
          .title p { margin: 4px 0 0; font-size: 13px; font-style: italic; }
          .row { margin: 10px 0; font-size: 14px; }
          .highlight { font-weight: bold; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; text-align: center; }
          .sig-box { width: 22%; }
          .sig-space { height: 70px; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div style="font-weight: bold; font-size: 14px;">${config.name}</div>
            <div style="font-size: 12px;">Đ/C: ${config.address}</div>
            <div style="font-size: 12px;">MST: ${config.taxCode} - Hotline: ${config.phone}</div>
          </div>
          <div style="text-align: right;">
            <div style="margin-bottom: 4px;">
              <img src="${window.location.origin}/assets/aistudio/image_1ca8dbc7.png" alt="PNCO Construction Logo" style="height: 38px; width: auto; object-fit: contain; display: inline-block;" />
            </div>
            <div style="font-weight: bold; font-size: 13px;">MẪU SỐ: 03-TT</div>
            <div style="font-size: 12px;">Số: <strong>${adv.advanceCode}</strong></div>
            <div style="font-size: 12px;">Ngày: ${adv.requestDate}</div>
          </div>
        </div>

        <div class="title">
          <h1>GIẤY ĐỀ NGHỊ TẠM ỨNG & PHIẾU CHI LƯƠNG</h1>
          <p>Kỳ áp dụng khấu trừ lương: Tháng ${adv.periodKey}</p>
        </div>

        <div class="row">Họ và tên người nhận: <span class="highlight">${adv.workerName}</span> (Mã NV: <strong>${adv.workerCode}</strong>)</div>
        <div class="row">Phòng ban / Dự án công trình: <span class="highlight">${adv.departmentOrProject}</span></div>
        <div class="row">Số tiền tạm ứng: <span class="highlight" style="font-size: 16px; color: #b91c1c;">${formatVND(adv.amount)}</span></div>
        <div class="row">Viết bằng chữ: <em>${numberToVietnameseWords(adv.amount)}</em></div>
        <div class="row">Lý do xin tạm ứng: ${adv.reason}</div>
        <div class="row">Hình thức chi trả: <strong>${adv.paymentMethod === 'BANK' ? 'Chuyển khoản qua ngân hàng' : 'Tiền mặt tại thủ quỹ/công trường'}</strong></div>
        <div class="row">Thời hạn khấu trừ: Trừ trực tiếp vào kỳ thanh toán lương <strong>${adv.periodKey}</strong> của Công ty Phúc Nguyên.</div>

        <div class="signatures">
          <div class="sig-box">
            <div style="font-weight: bold;">Người nhận tiền</div>
            <div style="font-size: 11px; font-style: italic;">(Ký, ghi rõ họ tên)</div>
            <div class="sig-space"></div>
            <div>${adv.workerName}</div>
          </div>
          <div class="sig-box">
            <div style="font-weight: bold;">Người lập phiếu</div>
            <div style="font-size: 11px; font-style: italic;">(Ký, họ tên)</div>
            <div class="sig-space"></div>
            <div>Bộ phận Kế toán</div>
          </div>
          <div class="sig-box">
            <div style="font-weight: bold;">Kế toán trưởng</div>
            <div style="font-size: 11px; font-style: italic;">(Ký duyệt)</div>
            <div class="sig-space"></div>
            <div>Nguyễn Thanh Thúy</div>
          </div>
          <div class="sig-box">
            <div style="font-weight: bold;">Giám đốc duyệt</div>
            <div style="font-size: 11px; font-style: italic;">(Ký, đóng dấu)</div>
            <div class="sig-space"></div>
            <div>Phúc Nguyên PNCONS</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.className = 'fixed right-0 bottom-0 w-0 h-0 border-0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      showToast('Không thể khởi tạo khung in phiếu tạm ứng.');
      return;
    }
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }, 300);
  };

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className={`text-white p-4 sm:p-5 rounded-2xl shadow-sm border flex flex-wrap items-center justify-between gap-4 ${
        forcedTargetType === 'SEASONAL'
          ? 'bg-gradient-to-r from-amber-900 via-amber-800 to-amber-700 border-amber-900'
          : 'bg-gradient-to-r from-[#09233b] via-[#0f3d64] to-[#1c5b8c] border-[#13375c]'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className={`p-2 rounded-lg ${forcedTargetType === 'SEASONAL' ? 'bg-amber-500 text-slate-950' : 'bg-amber-500/20 text-amber-300'}`}>
              <CreditCard className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              {forcedTargetType === 'PERMANENT'
                ? 'Bản Ứng Lương Nhân Viên Chính Thức'
                : forcedTargetType === 'SEASONAL'
                ? 'Bản Ứng Lương Nhân Viên Thời Vụ'
                : 'Bản Lương Ứng Theo Nhân Viên (Tạm Ứng Tiền Lương)'}
            </h2>
          </div>
          <p className="text-xs text-sky-100 mt-1 max-w-2xl">
            {forcedTargetType
              ? 'Chỉ hiển thị và cho phép lập phiếu tạm ứng đối với nhân sự có trạng thái đang làm việc trong danh sách. Tự động khấu trừ vào Bảng lương hàng kỳ.'
              : 'Quản lý phê duyệt tạm ứng cho Nhân viên chính thức, Nhân lực thời vụ và Tổ đội thi công. Tự động liên kết và khấu trừ vào Bảng lương hàng kỳ.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cloudConnected ? (
            <span className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-emerald-300" />
              <span>
                Bảng salary_advances:{' '}
                <strong>{cloudRowCount !== null ? `${cloudRowCount} phiếu` : 'Đã kết nối'}</strong>
              </span>
            </span>
          ) : (
            onOpenSupabaseModal && (
              <button
                type="button"
                onClick={onOpenSupabaseModal}
                className="px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <Cloud className="w-4 h-4" />
                <span>Kết nối Supabase Cloud</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => persistAdvancesListToSupabase(advances, config.periodCode)}
            disabled={isSavingData || isPushingCloud}
            className={`px-3.5 py-2 font-black text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-60 ${
              hasUnsavedChanges
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-white/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Nhấn nút Lưu Data để ghi toàn bộ phiếu tạm ứng lên bảng salary_advances trên Supabase"
          >
            <Save className={`w-4 h-4 ${isSavingData || isPushingCloud ? 'animate-bounce' : ''}`} />
            <span>
              {isSavingData || isPushingCloud
                ? 'Đang ghi Supabase...'
                : hasUnsavedChanges
                ? 'Lưu Data (Chưa lưu)'
                : 'Lưu Data Lên Supabase'}
            </span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-xs active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Tạo Phiếu Tạm Ứng Mới</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Download className="w-4 h-4 text-sky-300" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {!cloudConnected && (
        <div className="bg-rose-50 border border-rose-300 text-rose-950 px-4 py-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Trình duyệt này chưa kết nối Supabase Cloud!</strong> Dữ liệu phiếu ứng đang chỉ lưu tạm trên trình duyệt nên chưa thể ghi vào bảng{' '}
              <code className="font-mono font-bold">salary_advances</code>.
            </span>
          </div>
          {onOpenSupabaseModal && (
            <button
              type="button"
              onClick={onOpenSupabaseModal}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Kết nối Supabase ngay</span>
            </button>
          )}
        </div>
      )}

      {cloudErrorMsg && (
        <div className="bg-rose-50 border border-rose-300 text-rose-950 px-4 py-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{cloudErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => persistAdvancesListToSupabase(advances, config.periodCode)}
            disabled={isSavingData || isPushingCloud}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Thử ghi lại lên Supabase</span>
          </button>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Có thay đổi phiếu tạm ứng chưa ghi lên Supabase Cloud!</strong> Vui lòng nhấn nút{' '}
              <strong>Lưu Data Lên Supabase</strong> để ghi chính thức vào bảng <code className="font-mono font-bold">salary_advances</code>.
            </span>
          </div>
          <button
            type="button"
            onClick={() => persistAdvancesListToSupabase(advances, config.periodCode)}
            disabled={isSavingData || isPushingCloud}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-lg text-xs cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingData || isPushingCloud ? 'Đang ghi Supabase...' : 'Lưu lên Supabase ngay'}</span>
          </button>
        </div>
      )}

      {/* 4 Thẻ Chỉ Số Tạm Ứng */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng tiền đã tạm ứng</div>
            <div className="text-xl font-black text-rose-700 mt-0.5">{formatVND(totalAmount)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{scopedAdvancesByGroup.length} phiếu tạm ứng</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Đã khấu trừ vào lương</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">{formatVND(deductedAmount)}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              Đã thu hồi {totalAmount > 0 ? Math.round((deductedAmount / totalAmount) * 100) : 0}% tiền ứng
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Đã duyệt chi (Chờ trừ lương)</div>
            <div className="text-xl font-black text-amber-700 mt-0.5">{formatVND(approvedAmount)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Kỳ đang xem: {config.periodCode}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Cơ cấu đối tượng ứng</div>
            <div className="text-xs font-bold text-slate-800 mt-1 space-y-0.5">
              <div>Chính thức: {advances.filter((a) => a.targetType === 'PERMANENT').length} phiếu</div>
              <div className="text-amber-800">
                Thời vụ & Tổ đội:{' '}
                {advances.filter((a) => a.targetType === 'SEASONAL' || a.targetType === 'TEAM').length} phiếu
              </div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0f3d64] shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bộ Lọc & Tìm Kiếm */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên nhân viên, mã NV, mã phiếu ứng (TU-...), lý do..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f3d64] bg-slate-50"
            />
          </div>

          {!forcedTargetType && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <span>Đối tượng:</span>
              <select
                value={targetTypeFilter}
                onChange={(e) => setTargetTypeFilter(e.target.value as any)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white cursor-pointer"
              >
                <option value="ALL">Tất cả đối tượng</option>
                <option value="PERMANENT">1. Nhân viên chính thức</option>
                <option value="SEASONAL">2. Nhân lực thời vụ</option>
                <option value="TEAM">3. Nhân viên tổ đội</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white cursor-pointer"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="APPROVED">Đã chi / Đã duyệt</option>
              <option value="DEDUCTED">Đã trừ vào lương</option>
              <option value="PENDING">Chờ phê duyệt</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách Bản Lương Ứng */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider select-none">
                <th className="p-3 border-r border-slate-200 text-center w-12">STT</th>
                <th className="p-3 border-r border-slate-200 w-28">Mã Phiếu</th>
                <th className="p-3 border-r border-slate-200 min-w-[180px]">Họ Và Tên Người Ứng</th>
                <th className="p-3 border-r border-slate-200 w-28 text-center">Phân Nhóm</th>
                <th className="p-3 border-r border-slate-200 min-w-[150px]">Phòng Ban / Dự Án</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[120px]">Số Tiền Tạm Ứng</th>
                <th className="p-3 border-r border-slate-200 text-center w-24">Ngày Ứng</th>
                <th className="p-3 border-r border-slate-200 min-w-[160px]">Lý Do Tạm Ứng</th>
                <th className="p-3 border-r border-slate-200 text-center w-28">Hình Thức</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[120px]">Trạng Thái</th>
                <th className="p-3 text-center w-24 no-print">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    Chưa có khoản tạm ứng nào trong danh sách. Bấm "Tạo Phiếu Tạm Ứng Mới" để thêm.
                  </td>
                </tr>
              ) : (
                filteredAdvances.map((adv, idx) => {
                  return (
                    <tr key={adv.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>

                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-[#0f3d64]">
                        {adv.advanceCode}
                      </td>

                      <td className="p-3 border-r border-slate-200">
                        <div className="font-bold text-slate-900">{adv.workerName}</div>
                        <div className="font-mono text-[10px] text-slate-500">{adv.workerCode}</div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center">
                        {adv.targetType === 'PERMANENT' ? (
                          <span className="px-2 py-0.5 bg-sky-50 text-[#0f3d64] border border-sky-200 rounded font-semibold text-[10px]">
                            Chính thức
                          </span>
                        ) : adv.targetType === 'SEASONAL' ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold text-[10px]">
                            Thời vụ
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-semibold text-[10px]">
                            Tổ đội
                          </span>
                        )}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-700">
                        <div className="font-medium line-clamp-1">{adv.departmentOrProject}</div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-right font-mono font-black text-rose-700 bg-rose-50/20">
                        {formatVND(adv.amount)}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-600">
                        <div>{adv.requestDate}</div>
                        <div className="text-[10px] font-bold text-sky-700">Kỳ {adv.periodKey}</div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-600">
                        <div className="line-clamp-2">{adv.reason}</div>
                        {adv.notes && <div className="text-[10px] text-slate-400 italic">{adv.notes}</div>}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center font-medium">
                        {adv.paymentMethod === 'BANK' ? (
                          <span className="text-blue-700 font-semibold">Chuyển khoản</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Tiền mặt</span>
                        )}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(adv)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition active:scale-95 border ${
                            adv.status === 'DEDUCTED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : adv.status === 'APPROVED'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                          title="Bấm để chuyển trạng thái (Đã chi -> Đã trừ vào lương -> Chờ duyệt)"
                        >
                          {adv.status === 'DEDUCTED'
                            ? '✓ Đã trừ vào lương'
                            : adv.status === 'APPROVED'
                            ? '● Đã chi tiền'
                            : 'Chờ duyệt'}
                        </button>
                      </td>

                      <td className="p-3 text-center no-print">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(adv)}
                            className="px-2 py-1 text-xs font-bold text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded flex items-center gap-1 cursor-pointer transition"
                            title="Sửa thông tin phiếu tạm ứng (Số tiền, ngày ứng, nhân sự...)"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintAdvanceReceipt(adv)}
                            className="p-1.5 text-slate-700 hover:text-[#0f3d64] hover:bg-sky-50 rounded cursor-pointer"
                            title="In phiếu chi tạm ứng mẫu 03-TT"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteAdvance(adv.id);
                              showToast(`Đã xóa phiếu ${adv.advanceCode} và cập nhật lại Bản Lương!`);
                            }}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded cursor-pointer"
                            title="Xóa phiếu tạm ứng"
                          >
                            <X className="w-3.5 h-3.5" />
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

      {/* Modal Tạo / Sửa Phiếu Tạm Ứng (Có Cửa Sổ Tìm & Chọn Nhân Viên Nhanh Kiểu Danh Sách Tổ Đội) */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingAdvance(null);
              setIsModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[94vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#09233b] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-amber-300" />
                <h3 className="font-black text-sm uppercase tracking-wide">
                  {editingAdvance ? `Sửa Phiếu Tạm Ứng (${editingAdvance.advanceCode})` : 'Lập Phiếu Tạm Ứng Tiền Lương'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingAdvance(null);
                  setIsModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdvance} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5">Loại đối tượng nhận tạm ứng</label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('PERMANENT');
                      setModalWorkerSearch('');
                      setModalSubGroupFilter('ALL');
                      const firstEmp = employees.find((e) => (e.status || 'ACTIVE') === 'ACTIVE');
                      setFormWorkerId(String(firstEmp?.id || firstEmp?.code || '').trim());
                    }}
                    className={`py-2 rounded-lg font-bold text-center transition cursor-pointer ${
                      formTargetType === 'PERMANENT' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Chính thức ({employees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('SEASONAL');
                      setModalWorkerSearch('');
                      setModalSubGroupFilter('ALL');
                      const firstSea = seasonalWorkers.find((w) => (w.status || 'ACTIVE') === 'ACTIVE');
                      setFormWorkerId(String(firstSea?.id || firstSea?.code || '').trim());
                    }}
                    className={`py-2 rounded-lg font-bold text-center transition cursor-pointer ${
                      formTargetType === 'SEASONAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Thời vụ ({seasonalWorkers.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('TEAM');
                      setModalWorkerSearch('');
                      setModalSubGroupFilter('ALL');
                      const swTeam = seasonalWorkers.find(
                        (w) => (w.status || 'ACTIVE') === 'ACTIVE' && w.payrollCycleType === 'TEAM'
                      );
                      const legacyTeam = teamWorkers.find((t) => (t.status || 'ACTIVE') === 'ACTIVE');
                      const firstTeamWorker = String(
                        swTeam?.id || swTeam?.code || legacyTeam?.id || legacyTeam?.code || ''
                      ).trim();
                      setFormWorkerId(firstTeamWorker);
                    }}
                    className={`py-2 rounded-lg font-bold text-center transition cursor-pointer ${
                      formTargetType === 'TEAM' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Tổ đội (
                    {seasonalWorkers.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE' && w.payrollCycleType === 'TEAM').length +
                      teamWorkers.filter((t) => (t.status || 'ACTIVE') === 'ACTIVE').length}
                    )
                  </button>
                </div>
              </div>

              {/* CỬA SỔ TÌM & CHỌN NHÂN VIÊN NHANH (TƯƠNG TỰ MỤC CHỌN DANH SÁCH TỔ ĐỘI) */}
              <div className="bg-sky-50/65 border-2 border-sky-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-black text-slate-900 uppercase tracking-wide text-xs">
                      Mục Tìm & Chọn Nhân Sự Nhận Tạm Ứng *
                    </span>
                  </div>

                  {selectedModalWorkerObj ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-black text-[11px] flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                      <span>
                        Đang chọn: [{selectedModalWorkerObj.code}] {selectedModalWorkerObj.name}
                      </span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[11px]">
                      Chưa chọn nhân sự
                    </span>
                  )}
                </div>

                {/* Ô tìm kiếm nhanh + Lọc Dự án / Bộ phận */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus={!editingAdvance}
                      value={modalWorkerSearch}
                      onChange={(e) => setModalWorkerSearch(e.target.value)}
                      placeholder="Tìm mã NV/CN (PNC-TV01...), tên nhân viên, SĐT, STK ngân hàng..."
                      className="w-full pl-9 pr-8 py-2 bg-white border border-sky-300 focus:border-sky-600 rounded-xl text-xs font-medium text-slate-800 focus:outline-none shadow-2xs"
                    />
                    {modalWorkerSearch && (
                      <button
                        type="button"
                        onClick={() => setModalWorkerSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Xóa từ khóa tìm kiếm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <select
                    value={modalSubGroupFilter}
                    onChange={(e) => setModalSubGroupFilter(e.target.value)}
                    className="sm:w-52 px-3 py-2 bg-white border border-sky-300 focus:border-sky-600 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">
                      {formTargetType === 'PERMANENT'
                        ? `Tất cả bộ phận (${availableWorkers.length})`
                        : `Tất cả dự án (${availableWorkers.length})`}
                    </option>
                    {availableModalSubGroups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bảng danh sách nhân sự cuộn mượt — Click 1 chạm để chọn */}
                <div className="bg-white border border-sky-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[10px] sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-2.5 w-10 text-center">CHỌN</th>
                          <th className="py-2 px-2.5 w-24">MÃ NV</th>
                          <th className="py-2 px-2.5">HỌ VÀ TÊN NHÂN SỰ</th>
                          <th className="py-2 px-2.5">DỰ ÁN / BỘ PHẬN</th>
                          <th className="py-2 px-2.5">STK NGÂN HÀNG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredModalWorkers.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500">
                              Không tìm thấy nhân sự nào khớp với từ khóa <strong>"{modalWorkerSearch}"</strong>.
                            </td>
                          </tr>
                        ) : (
                          filteredModalWorkers.map((w) => {
                            const targetKey = String(formWorkerId || '').trim();
                            const isSelected =
                              Boolean(targetKey) && (w.id === targetKey || w.code === targetKey);
                            const currentPeriodKey = getPeriodKeyFromIsoDate(formRequestDate);
                            const existingAdvTotal = advances
                              .filter(
                                (a) =>
                                  (editingAdvance ? a.id !== editingAdvance.id : true) &&
                                  ((Boolean(a.workerId) && a.workerId === w.rawId) ||
                                    (Boolean(a.workerCode) && a.workerCode === w.code)) &&
                                  a.periodKey === currentPeriodKey
                              )
                              .reduce((sum, a) => sum + (a.amount || 0), 0);

                            return (
                              <tr
                                key={`${w.resolvedTargetType}-${w.id || w.code}`}
                                ref={isSelected ? selectedWorkerRowRef : undefined}
                                onClick={() => setFormWorkerId(w.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-sky-100/90 hover:bg-sky-100 font-semibold'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2 px-2.5 text-center">
                                  <div
                                    className={`w-4 h-4 rounded-full mx-auto flex items-center justify-center border ${
                                      isSelected
                                        ? 'bg-sky-600 border-sky-600 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 font-mono font-black text-sky-800 whitespace-nowrap">
                                  {w.code}
                                </td>
                                <td className="py-2 px-2.5">
                                  <div className="font-bold text-slate-900 flex flex-wrap items-center gap-1.5">
                                    <span>{w.name}</span>
                                    {existingAdvTotal > 0 && (
                                      <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-mono font-bold">
                                        Đã ứng T{currentPeriodKey}: {formatVND(existingAdvTotal)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {w.roleLabel}
                                    {w.phone ? ` • SĐT: ${w.phone}` : ''}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-slate-700 font-medium">
                                  {w.groupLabel}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px]">
                                  {w.bankAccount ? (
                                    <div>
                                      <span className="font-bold text-blue-900">{w.bankAccount}</span>
                                      {w.bankName && (
                                        <span className="block font-sans text-[10px] text-slate-500">
                                          {w.bankName}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="font-sans italic text-slate-400">
                                      {w.bankName || 'Tiền mặt / Chưa có'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số tiền tạm ứng (VNĐ) *</label>
                  <input
                    type="number"
                    step={100000}
                    required
                    min={0}
                    value={formAmount}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold text-rose-700"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 italic">{formatVND(formAmount)}</div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ngày tạm ứng *</label>
                  <input
                    type="date"
                    required
                    value={formRequestDate}
                    onChange={(e) => setFormRequestDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-semibold text-slate-800"
                  />
                  <div className="text-[10px] text-sky-700 mt-0.5 font-semibold">
                    Ngày: {toVnDateString(formRequestDate)} (Kỳ {getPeriodKeyFromIsoDate(formRequestDate)})
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phương thức chi</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold bg-white cursor-pointer"
                  >
                    <option value="BANK">Chuyển khoản ATM</option>
                    <option value="CASH">Tiền mặt công trường</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Lý do xin tạm ứng *</label>
                  <input
                    type="text"
                    required
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Lý do chi tiết..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ghi chú thêm</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Thông tin tài khoản nhận, người bảo lãnh..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAdvance(null);
                    setIsModalOpen(false);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-slate-950 font-black rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {editingAdvance ? 'Cập Nhật & Ghi Lên Supabase' : 'Lưu Phiếu & Ghi Lên Supabase'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
