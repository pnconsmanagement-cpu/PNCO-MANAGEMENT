import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Search,
  CheckSquare,
  Square,
  Users,
  X,
  Save,
  AlertCircle,
  Sparkles,
  Trash2,
  Layers,
} from 'lucide-react';
import { SeasonalWorker, Project, TeamPaymentVoucher } from '../types';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import {
  getPayrollPeriods,
  getTeamWorkerVouchersForMonth,
  buildTeamPeriodRecordFromVouchers,
} from '../data/mockSeasonalWorkers';

interface SelectedWorkerSalaryItem {
  workerKey: string;
  salaryByDays: string;
  otherBonus: string;
  advancePayment: string;
  existingVoucherId?: string;
}

interface TeamBatchPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamWorkersList: SeasonalWorker[];
  allSeasonalWorkers: SeasonalWorker[];
  projects?: Project[];
  availableProjectNames: string[];
  currentMonth: number;
  currentYear: number;
  editingBatchCode?: string | null;
  onSaveBatchAndSync: (
    updatedTeamWorkers: SeasonalWorker[],
    noticeMessage: string,
    batchCode: string
  ) => Promise<void> | void;
}

function getDefaultIsoDate(month: number, year: number): string {
  const today = new Date();
  const maxDay = new Date(year, month, 0).getDate();
  const day = Math.min(today.getDate(), maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatIsoToDmy(iso?: string): string {
  if (!iso) return '';
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

export function generateNextTeamBatchCode(allSeasonalWorkers: SeasonalWorker[]): string {
  let maxNum = 0;
  allSeasonalWorkers.forEach((w) => {
    if (w.payrollCycleType !== 'TEAM') return;
    const pRecs = w.periodRecords || {};
    Object.values(pRecs).forEach((rec) => {
      if (rec && Array.isArray(rec.teamVouchers)) {
        rec.teamVouchers.forEach((v) => {
          if (v?.batchCode) {
            const match = String(v.batchCode).match(/(\d+)/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (!Number.isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
        });
      }
    });
  });
  const nextNum = maxNum + 1;
  return `KL ${String(nextNum).padStart(4, '0')}`;
}

export const TeamBatchPayrollModal: React.FC<TeamBatchPayrollModalProps> = ({
  isOpen,
  onClose,
  teamWorkersList,
  allSeasonalWorkers,
  projects = [],
  availableProjectNames,
  currentMonth,
  currentYear,
  editingBatchCode = null,
  onSaveBatchAndSync,
}) => {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [batchCode, setBatchCode] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tradeFilter, setTradeFilter] = useState<string>('ALL');
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedWorkerSalaryItem>>({});
  const [quickFillSalary, setQuickFillSalary] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Danh sách dự án gộp từ Danh sách Dự án + các dự án sẵn có
  const mergedProjectOptions = useMemo(() => {
    const names = new Set<string>();
    projects.forEach((p) => {
      if (p.name && p.name.trim()) names.add(p.name.trim());
    });
    availableProjectNames.forEach((name) => {
      if (name && name.trim()) names.add(name.trim());
    });
    if (names.size === 0) {
      names.add('Coherent Vsip 3');
    }
    return Array.from(names);
  }, [projects, availableProjectNames]);

  // Chủ đầu tư của dự án đang chọn
  const selectedProjectInvestor = useMemo(() => {
    if (!selectedProject) return 'Công ty TNHH Xây Dựng - Cơ Điện Phúc Nguyên';
    const matched = projects.find(
      (p) => p.name.trim().toLowerCase() === selectedProject.trim().toLowerCase()
    );
    return matched?.investor || 'Theo hợp đồng thi công công trình';
  }, [projects, selectedProject]);

  // Danh sách ngành nghề trong nhóm Tổ Đội để lọc nhanh
  const availableTrades = useMemo(() => {
    const set = new Set<string>();
    teamWorkersList.forEach((w) => {
      if (w.trade && w.trade.trim()) set.add(w.trade.trim());
    });
    return Array.from(set);
  }, [teamWorkersList]);

  // Khởi tạo dữ liệu khi mở Modal (Tạo mới hoặc Sửa kỳ lương đã có)
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSearchQuery('');
    setTradeFilter('ALL');
    setQuickFillSalary('');

    if (editingBatchCode) {
      const normalizedTarget = editingBatchCode.trim();
      const preselected: Record<string, SelectedWorkerSalaryItem> = {};
      let detectedProject = '';
      let detectedDate = '';

      teamWorkersList.forEach((w) => {
        const wKey = w.id || w.code;
        const baseW =
          allSeasonalWorkers.find(
            (sw) => sw.payrollCycleType === 'TEAM' && (sw.id === w.id || sw.code === w.code)
          ) || w;
        const vouchers = getTeamWorkerVouchersForMonth(baseW, currentMonth, currentYear);
        const matchingVoucher = vouchers.find(
          (v) => (v.batchCode || '').trim() === normalizedTarget
        );
        if (matchingVoucher) {
          if (!detectedProject && matchingVoucher.project) {
            detectedProject = matchingVoucher.project;
          }
          if (!detectedDate && matchingVoucher.paymentDate) {
            detectedDate = matchingVoucher.paymentDate;
          }
          preselected[wKey] = {
            workerKey: wKey,
            salaryByDays: String(matchingVoucher.salaryByDays || ''),
            otherBonus: matchingVoucher.otherBonus ? String(matchingVoucher.otherBonus) : '',
            advancePayment: matchingVoucher.advancePayment
              ? String(matchingVoucher.advancePayment)
              : '',
            existingVoucherId: matchingVoucher.id,
          };
        }
      });

      setBatchCode(normalizedTarget);
      setSelectedProject(detectedProject || mergedProjectOptions[0] || 'Coherent Vsip 3');
      setPaymentDate(detectedDate || getDefaultIsoDate(currentMonth, currentYear));
      setSelectedMap(preselected);
    } else {
      const nextCode = generateNextTeamBatchCode(allSeasonalWorkers);
      setBatchCode(nextCode);
      setSelectedProject(mergedProjectOptions[0] || 'Coherent Vsip 3');
      setPaymentDate(getDefaultIsoDate(currentMonth, currentYear));
      setSelectedMap({});
    }
  }, [
    isOpen,
    editingBatchCode,
    currentMonth,
    currentYear,
    teamWorkersList,
    allSeasonalWorkers,
    mergedProjectOptions,
  ]);

  // Lọc danh sách công nhân Tổ Đội ở khung chọn phía trên
  const filteredCatalogWorkers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teamWorkersList.filter((w) => {
      if (tradeFilter !== 'ALL' && (w.trade || '').trim() !== tradeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (w.code || '').toLowerCase().includes(q) ||
        (w.fullName || '').toLowerCase().includes(q) ||
        (w.phone || '').toLowerCase().includes(q) ||
        (w.bankAccount || '').toLowerCase().includes(q) ||
        (w.trade || '').toLowerCase().includes(q)
      );
    });
  }, [teamWorkersList, searchQuery, tradeFilter]);

  // Danh sách các công nhân đã được tick chọn
  const tickedWorkersList = useMemo(() => {
    return teamWorkersList.filter((w) => {
      const key = w.id || w.code;
      return Boolean(selectedMap[key]);
    });
  }, [teamWorkersList, selectedMap]);

  const allFilteredAreTicked = useMemo(() => {
    if (filteredCatalogWorkers.length === 0) return false;
    return filteredCatalogWorkers.every((w) => Boolean(selectedMap[w.id || w.code]));
  }, [filteredCatalogWorkers, selectedMap]);

  const handleToggleWorker = (w: SeasonalWorker) => {
    const key = w.id || w.code;
    setErrorMsg(null);
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          workerKey: key,
          salaryByDays: quickFillSalary ? quickFillSalary : '',
          otherBonus: '',
          advancePayment: '',
        };
      }
      return next;
    });
  };

  const handleToggleAllFiltered = () => {
    setErrorMsg(null);
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (allFilteredAreTicked) {
        filteredCatalogWorkers.forEach((w) => {
          delete next[w.id || w.code];
        });
      } else {
        filteredCatalogWorkers.forEach((w) => {
          const key = w.id || w.code;
          if (!next[key]) {
            next[key] = {
              workerKey: key,
              salaryByDays: quickFillSalary ? quickFillSalary : '',
              otherBonus: '',
              advancePayment: '',
            };
          }
        });
      }
      return next;
    });
  };

  const handleClearAllTicked = () => {
    setErrorMsg(null);
    setSelectedMap({});
  };

  const handleChangeWorkerField = (
    workerKey: string,
    field: 'salaryByDays' | 'otherBonus' | 'advancePayment',
    value: string
  ) => {
    setErrorMsg(null);
    setSelectedMap((prev) => {
      const existing = prev[workerKey];
      if (!existing) return prev;
      return {
        ...prev,
        [workerKey]: {
          ...existing,
          [field]: value,
        },
      };
    });
  };

  const handleApplyQuickFill = () => {
    const amount = Math.max(0, Number(quickFillSalary) || 0);
    if (amount <= 0) return;
    setErrorMsg(null);
    setSelectedMap((prev) => {
      const next: Record<string, SelectedWorkerSalaryItem> = {};
      Object.keys(prev).forEach((k) => {
        next[k] = {
          ...prev[k],
          salaryByDays: String(amount),
        };
      });
      return next;
    });
  };

  // Tính tổng tiền lương của các công nhân đã tick trong kỳ này
  const summaryTotals = useMemo(() => {
    let totalSalary = 0;
    let totalBonus = 0;
    let totalAdvance = 0;
    let totalTax = 0;
    let totalNet = 0;

    tickedWorkersList.forEach((w) => {
      const item = selectedMap[w.id || w.code];
      if (!item) return;
      const sal = Math.max(0, Math.round(Number(item.salaryByDays) || 0));
      const bonus = Math.max(0, Math.round(Number(item.otherBonus) || 0));
      const adv = Math.max(0, Math.round(Number(item.advancePayment) || 0));
      const inc = sal + bonus;
      const hasTaxCommitment = w.hasTaxCommitment ?? true;
      const tax = !hasTaxCommitment && inc >= 2000000 ? Math.round(inc * 0.1) : 0;
      const net = Math.max(0, inc - tax - adv);

      totalSalary += sal;
      totalBonus += bonus;
      totalAdvance += adv;
      totalTax += tax;
      totalNet += net;
    });

    return {
      totalSalary,
      totalBonus,
      totalAdvance,
      totalTax,
      totalNet,
    };
  }, [tickedWorkersList, selectedMap]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanedBatchCode = batchCode.trim().toUpperCase();
    if (!cleanedBatchCode) {
      setErrorMsg('Vui lòng nhập Mã kỳ lương (ví dụ: KL 0001).');
      return;
    }
    if (!selectedProject.trim()) {
      setErrorMsg('Vui lòng chọn Tên dự án thi công.');
      return;
    }
    if (!paymentDate.trim()) {
      setErrorMsg('Vui lòng chọn Ngày chi lương.');
      return;
    }
    if (tickedWorkersList.length === 0) {
      setErrorMsg('Vui lòng tick chọn ít nhất 1 công nhân Tổ Đội để lập kỳ lương.');
      return;
    }

    // Kiểm tra mọi công nhân đã tick đều đã nhập giá trị tiền lương > 0
    const missingSalaryWorkers = tickedWorkersList.filter((w) => {
      const item = selectedMap[w.id || w.code];
      const sal = Number(item?.salaryByDays || 0);
      const bonus = Number(item?.otherBonus || 0);
      return sal + bonus <= 0;
    });

    if (missingSalaryWorkers.length > 0) {
      const names = missingSalaryWorkers
        .slice(0, 3)
        .map((w) => `${w.fullName} (${w.code})`)
        .join(', ');
      setErrorMsg(
        `Vui lòng nhập Giá trị tiền lương (> 0 đ) cho: ${names}${
          missingSalaryWorkers.length > 3
            ? ` và ${missingSalaryWorkers.length - 3} công nhân khác`
            : ''
        }.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const targetPeriod = getPayrollPeriods(currentYear, currentMonth, 'TEAM')[0];
      const nowTs = Date.now();
      const updatedTeamWorkers: SeasonalWorker[] = [];
      const originalEditingCode = editingBatchCode ? editingBatchCode.trim() : null;

      // Chỉ duyệt qua các công nhân thuộc nhóm TỔ ĐỘI (payrollCycleType === 'TEAM')
      teamWorkersList.forEach((tWorker) => {
        const wKey = tWorker.id || tWorker.code;
        const baseWorker =
          allSeasonalWorkers.find(
            (sw) =>
              sw.payrollCycleType === 'TEAM' && (sw.id === tWorker.id || sw.code === tWorker.code)
          ) || tWorker;

        const existingVouchers = getTeamWorkerVouchersForMonth(
          baseWorker,
          currentMonth,
          currentYear
        );
        const tickedData = selectedMap[wKey];

        if (originalEditingCode) {
          // Chế độ SỬA kỳ lương đã có:
          // - Nếu vẫn được tick: cập nhật voucher của kỳ đó (hoặc thêm mới nếu vừa tick thêm người)
          // - Nếu đã bỏ tick mà trước đó nằm trong kỳ này: gỡ voucher của kỳ đó khỏi công nhân
          const hadInThisBatch = existingVouchers.some(
            (v) => (v.batchCode || '').trim() === originalEditingCode
          );
          if (!tickedData && !hadInThisBatch) {
            return; // Không liên quan tới kỳ lương đang sửa -> giữ nguyên 100%
          }

          let nextVouchers: Partial<TeamPaymentVoucher>[];
          if (tickedData) {
            const sal = Math.max(0, Math.round(Number(tickedData.salaryByDays) || 0));
            const bonus = Math.max(0, Math.round(Number(tickedData.otherBonus) || 0));
            const adv = Math.max(0, Math.round(Number(tickedData.advancePayment) || 0));

            if (hadInThisBatch) {
              nextVouchers = existingVouchers.map((v) => {
                if ((v.batchCode || '').trim() === originalEditingCode) {
                  return {
                    ...v,
                    batchCode: cleanedBatchCode,
                    project: selectedProject.trim(),
                    paymentDate: paymentDate.trim(),
                    salaryByDays: sal,
                    otherBonus: bonus,
                    advancePayment: adv,
                    updatedAt: nowTs,
                  };
                }
                return v;
              });
            } else {
              nextVouchers = [
                ...existingVouchers,
                {
                  id: `TVOUCHER_${nowTs}_${wKey}_${Math.random().toString(36).slice(2, 6)}`,
                  batchCode: cleanedBatchCode,
                  orderIndex: existingVouchers.length + 1,
                  project: selectedProject.trim(),
                  paymentDate: paymentDate.trim(),
                  salaryByDays: sal,
                  otherBonus: bonus,
                  advancePayment: adv,
                  hasTaxCommitment: baseWorker.hasTaxCommitment ?? true,
                  updatedAt: nowTs,
                },
              ];
            }
          } else {
            // Đã bỏ tick khỏi kỳ lương đang sửa
            nextVouchers = existingVouchers.filter(
              (v) => (v.batchCode || '').trim() !== originalEditingCode
            );
          }

          const rebuilt = buildTeamPeriodRecordFromVouchers(
            { ...baseWorker, payrollCycleType: 'TEAM' },
            targetPeriod,
            nextVouchers
          );
          updatedTeamWorkers.push({
            ...rebuilt,
            payrollCycleType: 'TEAM',
            updatedAt: nowTs,
          });
        } else {
          // Chế độ TẠO MỚI kỳ lương: chỉ tác động các công nhân được tick chọn
          if (!tickedData) return;

          const sal = Math.max(0, Math.round(Number(tickedData.salaryByDays) || 0));
          const bonus = Math.max(0, Math.round(Number(tickedData.otherBonus) || 0));
          const adv = Math.max(0, Math.round(Number(tickedData.advancePayment) || 0));

          // Nếu công nhân đã có đúng mã kỳ lương này trong tháng thì cập nhật, ngược lại thêm đợt mới
          const alreadyHasSameBatch = existingVouchers.some(
            (v) => (v.batchCode || '').trim().toUpperCase() === cleanedBatchCode
          );

          const nextVouchers: Partial<TeamPaymentVoucher>[] = alreadyHasSameBatch
            ? existingVouchers.map((v) =>
                (v.batchCode || '').trim().toUpperCase() === cleanedBatchCode
                  ? {
                      ...v,
                      batchCode: cleanedBatchCode,
                      project: selectedProject.trim(),
                      paymentDate: paymentDate.trim(),
                      salaryByDays: sal,
                      otherBonus: bonus,
                      advancePayment: adv,
                      updatedAt: nowTs,
                    }
                  : v
              )
            : [
                ...existingVouchers,
                {
                  id: `TVOUCHER_${nowTs}_${wKey}_${Math.random().toString(36).slice(2, 6)}`,
                  batchCode: cleanedBatchCode,
                  orderIndex: existingVouchers.length + 1,
                  project: selectedProject.trim(),
                  paymentDate: paymentDate.trim(),
                  salaryByDays: sal,
                  otherBonus: bonus,
                  advancePayment: adv,
                  hasTaxCommitment: baseWorker.hasTaxCommitment ?? true,
                  updatedAt: nowTs,
                },
              ];

          const rebuilt = buildTeamPeriodRecordFromVouchers(
            { ...baseWorker, payrollCycleType: 'TEAM' },
            targetPeriod,
            nextVouchers
          );
          updatedTeamWorkers.push({
            ...rebuilt,
            payrollCycleType: 'TEAM',
            updatedAt: nowTs,
          });
        }
      });

      const noticeMsg = `✓ Đã lưu Kỳ lương Tổ Đội [${cleanedBatchCode}] gồm ${
        tickedWorkersList.length
      } công nhân (Tổng thực lĩnh: ${formatNumberOnly(
        summaryTotals.totalNet
      )} đ • Ngày chi: ${formatIsoToDmy(paymentDate)}) vào Database thành công!`;

      await Promise.resolve(
        onSaveBatchAndSync(updatedTeamWorkers, noticeMsg, cleanedBatchCode)
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi xảy ra khi lưu kỳ lương vào Database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="bg-slate-50 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Header Modal */}
        <div className="bg-gradient-to-r from-[#0f3d64] via-slate-900 to-purple-950 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wide flex items-center gap-2">
                <span>
                  {editingBatchCode
                    ? `CHỈNH SỬA KỲ LƯƠNG TỔ ĐỘI: ${editingBatchCode}`
                    : 'TẠO KỲ LƯƠNG DANH SÁCH TỔ ĐỘI (TICK CHỌN CÔNG NHÂN)'}
                </span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                  Tháng {String(currentMonth).padStart(2, '0')}/{currentYear}
                </span>
              </h3>
              <p className="text-[11px] text-sky-200/90 mt-0.5">
                Chỉ tác động riêng tới <strong>Danh sách Tổ Đội</strong> • Cho phép tick chọn 1 hoặc nhiều công nhân, nhập tiền lương từng người và lưu thẳng vào Database
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung 3 Khối theo đúng chuẩn giao diện nhập đơn hàng vật tư */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* KHỐI 1: THÔNG TIN CHUNG KỲ LƯƠNG (DỰ ÁN - MÃ KỲ LƯƠNG - NGÀY CHI LƯƠNG) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              {/* 1. Chọn tên dự án thi công */}
              <div className="md:col-span-6">
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wide mb-1.5">
                  <Building2 className="w-3.5 h-3.5 text-sky-600" />
                  <span>
                    1. CHỌN TÊN DỰ ÁN THI CÔNG <span className="text-rose-600">*</span>
                  </span>
                </label>
                <select
                  required
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 hover:border-sky-500 focus:border-sky-600 rounded-xl text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer transition"
                >
                  {selectedProject && !mergedProjectOptions.includes(selectedProject) && (
                    <option value={selectedProject}>{selectedProject}</option>
                  )}
                  {mergedProjectOptions.map((projName) => (
                    <option key={projName} value={projName}>
                      {projName}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5 truncate">
                  Chủ đầu tư: <strong className="text-slate-700">{selectedProjectInvestor}</strong>
                </p>
              </div>

              {/* 2. Mã kỳ lương (Tự tăng KL 0001+) */}
              <div className="md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wide mb-1.5">
                  <span>
                    2. MÃ KỲ LƯƠNG <span className="text-rose-600">*</span>
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  placeholder="KL 0001"
                  className="w-full px-3.5 py-2.5 bg-amber-50/70 border-2 border-amber-400 focus:border-amber-500 rounded-xl text-xs sm:text-sm font-black font-mono text-amber-800 focus:outline-none transition"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Tự tăng từ <strong className="text-slate-700">KL 0001+</strong>
                </p>
              </div>

              {/* 3. Ngày chi lương */}
              <div className="md:col-span-3">
                <label className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wide mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>
                    3. NGÀY CHI LƯƠNG <span className="text-rose-600">*</span>
                  </span>
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 hover:border-sky-500 focus:border-sky-600 rounded-xl text-xs sm:text-sm font-bold font-mono text-slate-900 focus:outline-none cursor-pointer transition"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Kỳ bảng lương:{' '}
                  <strong className="text-slate-700">
                    Tháng {String(currentMonth).padStart(2, '0')}/{currentYear}
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* KHỐI 2: MỤC CHỌN DANH SÁCH TỔ ĐỘI (TICK CHỌN NHIỀU CÔNG NHÂN) - NỀN XANH DA TRỜI NHẠT */}
          <div className="bg-sky-50/60 border-2 border-sky-200 rounded-2xl p-4 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Users className="w-4 h-4" />
                </div>
                <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wide">
                  MỤC CHỌN DANH SÁCH TỔ ĐỘI (TICK CHỌN NHIỀU CÔNG NHÂN)
                </h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleAllFiltered}
                  disabled={filteredCatalogWorkers.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-sky-100/90 hover:bg-sky-200/80 text-sky-800 border border-sky-300 text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {allFilteredAreTicked ? (
                    <CheckSquare className="w-3.5 h-3.5 text-sky-700" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-sky-700" />
                  )}
                  <span>
                    {allFilteredAreTicked
                      ? `Bỏ Chọn Đang Lọc (${filteredCatalogWorkers.length})`
                      : `Chọn Tất Cả Đang Lọc (${filteredCatalogWorkers.length})`}
                  </span>
                </button>

                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black">
                  Đã tick: {tickedWorkersList.length} CN
                </span>

                {tickedWorkersList.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllTicked}
                    className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline px-2 py-1 cursor-pointer"
                  >
                    Bỏ chọn hết
                  </button>
                )}
              </div>
            </div>

            {/* Thanh tìm kiếm & lọc ngành nghề */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm mã CN (PNC-TV49...), tên công nhân, SĐT, STK ngân hàng..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 focus:border-sky-500 rounded-xl text-xs font-medium text-slate-800 focus:outline-none"
                />
              </div>

              <select
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                className="sm:w-56 px-3 py-2 bg-white border border-slate-300 focus:border-sky-500 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Tất cả ngành nghề ({teamWorkersList.length})</option>
                {availableTrades.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Bảng danh sách công nhân Tổ Đội có thanh cuộn */}
            <div className="bg-white border border-sky-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[11px] sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">TICK</th>
                      <th className="py-2.5 px-3 w-28">MÃ CN</th>
                      <th className="py-2.5 px-3">TÊN CÔNG NHÂN TỔ ĐỘI</th>
                      <th className="py-2.5 px-3">NGÀNH NGHỀ / BẬC</th>
                      <th className="py-2.5 px-3 text-right">
                        ĐÃ CHI TRONG T{String(currentMonth).padStart(2, '0')}
                      </th>
                      <th className="py-2.5 px-3">STK NGÂN HÀNG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCatalogWorkers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-500">
                          Không tìm thấy công nhân Tổ Đội nào khớp với điều kiện lọc.
                        </td>
                      </tr>
                    ) : (
                      filteredCatalogWorkers.map((w) => {
                        const wKey = w.id || w.code;
                        const isTicked = Boolean(selectedMap[wKey]);
                        const baseW =
                          allSeasonalWorkers.find(
                            (sw) =>
                              sw.payrollCycleType === 'TEAM' &&
                              (sw.id === w.id || sw.code === w.code)
                          ) || w;
                        const existingVouchers = getTeamWorkerVouchersForMonth(
                          baseW,
                          currentMonth,
                          currentYear
                        );
                        const paidSoFar = existingVouchers.reduce(
                          (s, v) => s + (v.netSalary || v.salaryByDays || 0),
                          0
                        );

                        return (
                          <tr
                            key={wKey}
                            onClick={() => handleToggleWorker(w)}
                            className={`cursor-pointer transition-colors ${
                              isTicked
                                ? 'bg-sky-50/90 hover:bg-sky-100/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td
                              className="py-2.5 px-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isTicked}
                                onChange={() => handleToggleWorker(w)}
                                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-sky-800">
                              {w.code}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{w.fullName}</div>
                              {(w.teamName || w.phone) && (
                                <div className="text-[11px] text-slate-500">
                                  {w.teamName ? `${w.teamName}` : ''}
                                  {w.teamName && w.phone ? ' • ' : ''}
                                  {w.phone ? `SĐT: ${w.phone}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <span className="font-medium">{w.trade || 'Tổ đội'}</span>
                              {w.skillLevel && (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                                  {w.skillLevel}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {paidSoFar > 0 ? (
                                <div>
                                  <span className="font-bold text-emerald-700">
                                    {formatNumberOnly(paidSoFar)} đ
                                  </span>
                                  <span className="block text-[10px] text-purple-700 font-sans font-semibold">
                                    ({existingVouchers.length} đợt đã lập)
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {w.bankAccount ? (
                                <div>
                                  <span className="font-mono font-bold text-slate-800">
                                    {w.bankAccount}
                                  </span>
                                  <span className="block text-[10px] text-slate-500">
                                    {w.bankName || 'Chuyển khoản'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Tiền mặt / Chưa có</span>
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

          {/* KHỐI 3: DANH SÁCH CÔNG NHÂN ĐÃ TICK CHỌN & NHẬP GIÁ TRỊ TIỀN LƯƠNG - VIỀN VÀNG CAM */}
          <div className="bg-amber-50/35 border-2 border-amber-300 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <h4 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wide">
                  DANH SÁCH CÔNG NHÂN ĐÃ TICK CHỌN ({tickedWorkersList.length} NGƯỜI)
                </h4>
              </div>

              {tickedWorkersList.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-amber-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-600">
                    Điền nhanh mức lương chung:
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="100000"
                    value={quickFillSalary}
                    onChange={(e) => setQuickFillSalary(e.target.value)}
                    placeholder="VD: 5000000"
                    className="w-32 px-2 py-1 border border-slate-300 focus:border-amber-500 rounded-lg text-xs font-mono font-bold text-right text-amber-950 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyQuickFill}
                    disabled={!quickFillSalary || Number(quickFillSalary) <= 0}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 font-black text-[11px] transition cursor-pointer"
                  >
                    Áp dụng cho {tickedWorkersList.length} CN
                  </button>
                </div>
              )}
            </div>

            {tickedWorkersList.length === 0 ? (
              <div className="border border-dashed border-amber-300 bg-white/85 rounded-xl py-6 px-4 text-center text-xs text-slate-600">
                👉 Hãy <strong className="text-amber-800">tick chọn các công nhân</strong> ở bảng
                danh sách Tổ Đội phía trên để nhập giá trị tiền lương cho kỳ lương{' '}
                <strong className="text-amber-900">{batchCode || 'mới'}</strong>.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-white border border-amber-200 rounded-xl overflow-x-auto shadow-2xs">
                  <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                    <thead className="bg-amber-100/80 text-amber-950 font-black uppercase text-[11px] border-b border-amber-200">
                      <tr>
                        <th className="py-2.5 px-2.5 text-center w-10">STT</th>
                        <th className="py-2.5 px-2.5 w-24">MÃ CN</th>
                        <th className="py-2.5 px-3">HỌ VÀ TÊN CÔNG NHÂN</th>
                        <th className="py-2.5 px-3 text-right">
                          GIÁ TRỊ TIỀN LƯƠNG (VNĐ) <span className="text-rose-600">*</span>
                        </th>
                        <th className="py-2.5 px-3 text-right">PHỤ CẤP / THƯỞNG</th>
                        <th className="py-2.5 px-3 text-right">TRỪ TẠM ỨNG</th>
                        <th className="py-2.5 px-3 text-right">THỰC LĨNH KỲ NÀY</th>
                        <th className="py-2.5 px-2.5 text-center w-12">BỎ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tickedWorkersList.map((w, idx) => {
                        const wKey = w.id || w.code;
                        const item = selectedMap[wKey] || {
                          workerKey: wKey,
                          salaryByDays: '',
                          otherBonus: '',
                          advancePayment: '',
                        };
                        const sal = Math.max(0, Math.round(Number(item.salaryByDays) || 0));
                        const bonus = Math.max(0, Math.round(Number(item.otherBonus) || 0));
                        const adv = Math.max(0, Math.round(Number(item.advancePayment) || 0));
                        const inc = sal + bonus;
                        const hasTax = w.hasTaxCommitment ?? true;
                        const tax = !hasTax && inc >= 2000000 ? Math.round(inc * 0.1) : 0;
                        const net = Math.max(0, inc - tax - adv);

                        return (
                          <tr key={wKey} className="hover:bg-amber-50/40">
                            <td className="py-2 px-2.5 text-center font-mono text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-2.5 font-mono font-black text-amber-900">
                              {w.code}
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-bold text-slate-900">{w.fullName}</div>
                              <div className="text-[10px] text-slate-500">
                                {w.trade}
                                {w.bankAccount ? ` • STK: ${w.bankAccount} (${w.bankName})` : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="100000"
                                placeholder="Nhập tiền lương..."
                                value={item.salaryByDays}
                                onChange={(e) =>
                                  handleChangeWorkerField(wKey, 'salaryByDays', e.target.value)
                                }
                                className="w-40 px-2.5 py-1.5 bg-amber-50/50 focus:bg-white border-2 border-amber-400 focus:border-amber-600 rounded-lg text-right font-mono font-black text-xs text-purple-950 focus:outline-none"
                              />
                              {sal > 0 && (
                                <div className="text-[10px] font-mono font-bold text-emerald-700 mt-0.5">
                                  {formatNumberOnly(sal)} đ
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="50000"
                                placeholder="0"
                                value={item.otherBonus}
                                onChange={(e) =>
                                  handleChangeWorkerField(wKey, 'otherBonus', e.target.value)
                                }
                                className="w-28 px-2 py-1.5 bg-white border border-slate-300 focus:border-emerald-500 rounded-lg text-right font-mono font-semibold text-xs text-emerald-800 focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                step="100000"
                                placeholder="0"
                                value={item.advancePayment}
                                onChange={(e) =>
                                  handleChangeWorkerField(wKey, 'advancePayment', e.target.value)
                                }
                                className="w-28 px-2 py-1.5 bg-white border border-slate-300 focus:border-rose-500 rounded-lg text-right font-mono font-semibold text-xs text-rose-700 focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-emerald-800 text-xs bg-emerald-50/40">
                              {formatNumberOnly(net)} đ
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleWorker(w)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                title={`Bỏ chọn ${w.fullName}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-amber-100/90 border-t-2 border-amber-300 font-black text-xs text-slate-900">
                      <tr>
                        <td colSpan={3} className="py-2.5 px-3 text-right uppercase">
                          Tổng cộng kỳ lương {batchCode} ({tickedWorkersList.length} công nhân):
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-950">
                          {formatNumberOnly(summaryTotals.totalSalary)} đ
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                          {formatNumberOnly(summaryTotals.totalBonus)} đ
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                          {formatNumberOnly(summaryTotals.totalAdvance)} đ
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-900 text-sm bg-emerald-200/70">
                          {formatNumberOnly(summaryTotals.totalNet)} đ
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-300 text-rose-900 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Thanh Nút Hành Động Cuối Modal */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <div className="text-xs text-slate-600">
              Đã chọn:{' '}
              <strong className="text-slate-900">{tickedWorkersList.length} công nhân Tổ Đội</strong>{' '}
              • Tổng chi thực lĩnh:{' '}
              <strong className="text-emerald-700 font-mono text-sm">
                {formatNumberOnly(summaryTotals.totalNet)} đ
              </strong>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting || teamWorkersList.length === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs sm:text-sm flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Đang lưu vào Database...'
                    : editingBatchCode
                    ? `Cập nhật Kỳ Lương (${batchCode}) & Lưu Database`
                    : `Lưu Kỳ Lương (${batchCode}) & Ghi Database`}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
