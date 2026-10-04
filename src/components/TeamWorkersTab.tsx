import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Edit2,
  Trash2,
  HardHat,
  Building,
  CheckCircle2,
  Clock,
  DollarSign,
  Briefcase,
  X,
  Save,
  Check,
  RotateCcw,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { TeamWorker, Project, CompanyConfig } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';

interface TeamWorkersTabProps {
  workers: TeamWorker[];
  projects: Project[];
  config: CompanyConfig;
  onAddWorker: (worker: TeamWorker) => void;
  onUpdateWorker: (worker: TeamWorker) => void;
  onDeleteWorker: (id: string) => void;
  onBatchUpdate: (list: TeamWorker[]) => void;
}

export const TeamWorkersTab: React.FC<TeamWorkersTabProps> = ({
  workers,
  projects,
  config,
  onAddWorker,
  onUpdateWorker,
  onDeleteWorker,
  onBatchUpdate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'PAUSED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<TeamWorker | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<TeamWorker | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formTeamName, setFormTeamName] = useState('');
  const [formLeaderName, setFormLeaderName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formIdCard, setFormIdCard] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');
  const [formBankName, setFormBankName] = useState('Techcombank');
  const [formProject, setFormProject] = useState('');
  const [formWorkerCount, setFormWorkerCount] = useState<number>(8);
  const [formPaymentMethod, setFormPaymentMethod] = useState<'BANK' | 'CASH'>('BANK');
  const [formRateType, setFormRateType] = useState<'DAILY' | 'PIECEWORK'>('DAILY');
  const [formUnitRate, setFormUnitRate] = useState<number>(650000);
  const [formActualDays, setFormActualDays] = useState<number>(26);
  const [formOtHours, setFormOtHours] = useState<number>(0);
  const [formMealAllowance, setFormMealAllowance] = useState<number>(1000000);
  const [formOtherBonus, setFormOtherBonus] = useState<number>(0);
  const [formAdvancePayment, setFormAdvancePayment] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'COMPLETED' | 'PAUSED'>('ACTIVE');
  const [formNotes, setFormNotes] = useState('');

  const openAddModal = () => {
    setEditingWorker(null);
    const nextIdx = workers.length + 1;
    setFormCode(`PNC-TD${nextIdx < 10 ? '0' + nextIdx : nextIdx}`);
    setFormTeamName('');
    setFormLeaderName('');
    setFormPhone('');
    setFormIdCard('');
    setFormBankAccount('');
    setFormBankName('Techcombank');
    setFormProject(projects[0]?.name || 'Khách sạn Melia Vinpearl');
    setFormWorkerCount(8);
    setFormPaymentMethod('BANK');
    setFormRateType('DAILY');
    setFormUnitRate(650000);
    setFormActualDays(26);
    setFormOtHours(0);
    setFormMealAllowance(1000000);
    setFormOtherBonus(0);
    setFormAdvancePayment(0);
    setFormStatus('ACTIVE');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (w: TeamWorker) => {
    setEditingWorker(w);
    setFormCode(w.code);
    setFormTeamName(w.teamName);
    setFormLeaderName(w.leaderName);
    setFormPhone(w.phone);
    setFormIdCard(w.idCard || '');
    setFormBankAccount(w.bankAccount);
    setFormBankName(w.bankName);
    setFormProject(w.project);
    setFormWorkerCount(w.workerCount || 1);
    setFormPaymentMethod(w.paymentMethod);
    setFormRateType(w.rateType);
    setFormUnitRate(w.unitRate);
    setFormActualDays(w.actualWorkDays);
    setFormOtHours(w.overtimeHours || 0);
    setFormMealAllowance(w.mealAllowance || 0);
    setFormOtherBonus(w.otherBonus || 0);
    setFormAdvancePayment(w.advancePayment || 0);
    setFormStatus(w.status);
    setFormNotes(w.notes || '');
    setIsModalOpen(true);
  };

  const calculateWorkerTotals = (
    unitRate: number,
    actualDays: number,
    otHours: number,
    meal: number,
    bonus: number,
    advance: number
  ) => {
    const salaryByDays = Math.round(unitRate * actualDays);
    const hourlyRate = unitRate / 8;
    const overtimePay = Math.round(hourlyRate * 1.5 * otHours);
    const totalIncome = salaryByDays + overtimePay + meal + bonus;
    const totalDeductions = advance;
    const netSalary = Math.max(0, totalIncome - totalDeductions);
    return { salaryByDays, overtimePay, totalIncome, totalDeductions, netSalary };
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTeamName.trim() || !formLeaderName.trim()) {
      alert('Vui lòng nhập tên tổ đội và trưởng tổ đội!');
      return;
    }

    const { salaryByDays, overtimePay, totalIncome, totalDeductions, netSalary } = calculateWorkerTotals(
      formUnitRate,
      formActualDays,
      formOtHours,
      formMealAllowance,
      formOtherBonus,
      formAdvancePayment
    );

    if (editingWorker) {
      const updated: TeamWorker = {
        ...editingWorker,
        code: formCode,
        teamName: formTeamName,
        leaderName: formLeaderName,
        phone: formPhone,
        idCard: formIdCard,
        bankAccount: formBankAccount,
        bankName: formBankName,
        project: formProject,
        workerCount: Number(formWorkerCount) || 1,
        paymentMethod: formPaymentMethod,
        rateType: formRateType,
        unitRate: Number(formUnitRate) || 0,
        actualWorkDays: Number(formActualDays) || 0,
        overtimeHours: Number(formOtHours) || 0,
        overtimePay,
        salaryByDays,
        mealAllowance: Number(formMealAllowance) || 0,
        otherBonus: Number(formOtherBonus) || 0,
        totalIncome,
        advancePayment: Number(formAdvancePayment) || 0,
        totalDeductions,
        netSalary,
        status: formStatus,
        notes: formNotes,
      };
      onUpdateWorker(updated);
      showToast(`Đã cập nhật tổ đội ${formTeamName}!`);
    } else {
      const newWorker: TeamWorker = {
        id: `team-${Date.now()}`,
        code: formCode,
        teamName: formTeamName,
        leaderName: formLeaderName,
        phone: formPhone,
        idCard: formIdCard,
        bankAccount: formBankAccount,
        bankName: formBankName,
        project: formProject,
        workerCount: Number(formWorkerCount) || 1,
        paymentMethod: formPaymentMethod,
        rateType: formRateType,
        unitRate: Number(formUnitRate) || 0,
        actualWorkDays: Number(formActualDays) || 0,
        overtimeHours: Number(formOtHours) || 0,
        overtimePay,
        salaryByDays,
        mealAllowance: Number(formMealAllowance) || 0,
        otherBonus: Number(formOtherBonus) || 0,
        totalIncome,
        advancePayment: Number(formAdvancePayment) || 0,
        totalDeductions,
        netSalary,
        status: formStatus,
        notes: formNotes,
      };
      onAddWorker(newWorker);
      showToast(`Đã thêm tổ đội mới ${formTeamName}!`);
    }

    setIsModalOpen(false);
  };

  // Tăng giảm nhanh ngày công của tổ
  const handleQuickStepDays = (w: TeamWorker, delta: number) => {
    const nextDays = Math.max(0, Math.min(31, Number((w.actualWorkDays + delta).toFixed(1))));
    const { salaryByDays, overtimePay, totalIncome, totalDeductions, netSalary } = calculateWorkerTotals(
      w.unitRate,
      nextDays,
      w.overtimeHours || 0,
      w.mealAllowance || 0,
      w.otherBonus || 0,
      w.advancePayment || 0
    );

    const updated: TeamWorker = {
      ...w,
      actualWorkDays: nextDays,
      salaryByDays,
      overtimePay,
      totalIncome,
      totalDeductions,
      netSalary,
    };
    onUpdateWorker(updated);
  };

  // Lọc danh sách
  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      const matchSearch =
        w.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.leaderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
        w.phone.includes(searchTerm);

      const matchProject = projectFilter === 'ALL' || w.project === projectFilter;
      const matchStatus = statusFilter === 'ALL' || w.status === statusFilter;

      return matchSearch && matchProject && matchStatus;
    });
  }, [workers, searchTerm, projectFilter, statusFilter]);

  // Thống kê
  const totalTeams = workers.length;
  const totalCraftsmen = workers.reduce((s, w) => s + (w.workerCount || 1), 0);
  const totalIncomeAll = workers.reduce((s, w) => s + (w.totalIncome || 0), 0);
  const totalNetAll = workers.reduce((s, w) => s + (w.netSalary || 0), 0);

  // Xuất file Excel
  const handleExportExcel = () => {
    const dataToExport = filteredWorkers.map((w, idx) => ({
      STT: idx + 1,
      'Mã Tổ Đội': w.code,
      'Tên Tổ Đội': w.teamName,
      'Đội Trưởng': w.leaderName,
      'SĐT': w.phone,
      'Số Thợ Trong Đội': w.workerCount,
      'Công Trình / Dự Án': w.project,
      'Hình Thức': w.rateType === 'DAILY' ? 'Theo ngày công' : 'Khoán khối lượng',
      'Đơn Giá (VNĐ)': w.unitRate,
      'Ngày Công / Khối Lượng': w.actualWorkDays,
      'Tiền Theo Công (VNĐ)': w.salaryByDays,
      'Giờ OT': w.overtimeHours,
      'Tiền OT (VNĐ)': w.overtimePay,
      'Phụ Cấp Ăn Ca (VNĐ)': w.mealAllowance,
      'Thưởng (VNĐ)': w.otherBonus,
      'Tổng Thu Nhập (VNĐ)': w.totalIncome,
      'Tạm Ứng (VNĐ)': w.advancePayment,
      'Thực Lĩnh (VNĐ)': w.netSalary,
      'Số Tài Khoản': w.bankAccount,
      'Ngân Hàng': w.bankName,
      'Phương Thức': w.paymentMethod === 'BANK' ? 'Chuyển khoản' : 'Tiền mặt',
      'Trạng Thái': w.status === 'ACTIVE' ? 'Đang thi công' : 'Hoàn thành',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ToDoiThiCong');
    XLSX.writeFile(wb, `Danh_Sach_Nhan_Vien_To_Doi_Phuc_Nguyen_${Date.now()}.xlsx`);
    showToast('Đã xuất danh sách tổ đội ra file Excel thành công!');
  };

  // In bảng thanh toán tổ đội
  const handlePrintSheet = () => {
    window.print();
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
      <div className="bg-gradient-to-r from-[#09233b] via-[#0f3d64] to-[#1c5b8c] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#13375c] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-lg">
              <HardHat className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              Danh Sách Nhân Viên Tổ Đội Thi Công (Sheet: team_workers)
            </h2>
          </div>
          <p className="text-xs text-sky-200 mt-1 max-w-2xl">
            Quản lý các tổ đội thầu phụ, cai thầu, đội thi công chuyên môn (Cốp pha, Hàn xưởng, M&E, Hoàn thiện) theo ngày công hoặc khoán khối lượng công trình Phúc Nguyên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-xs active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Tổ Đội Mới</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Download className="w-4 h-4 text-sky-300" />
            <span>Xuất Excel</span>
          </button>

          <button
            type="button"
            onClick={handlePrintSheet}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Printer className="w-4 h-4 text-sky-300" />
            <span>In Bảng Ký Nhận</span>
          </button>
        </div>
      </div>

      {/* 4 Thẻ Chỉ Số Tổ Đội */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Số lượng tổ đội</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{totalTeams} tổ đội</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Quy mô {totalCraftsmen} công nhân thợ</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng thu nhập các đội</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{formatVND(totalIncomeAll)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tiền công + OT + phụ cấp tổ</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Thực lĩnh chi trả tổ đội</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">{formatVND(totalNetAll)}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">Sau khi trừ tạm ứng</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Phân bổ tại công trình</div>
            <div className="text-xs font-bold text-slate-800 mt-1">
              <div>Phủ sóng {projects.length} dự án trọng điểm</div>
              <div className="text-slate-500 font-normal">Chuyển khoản ATM & Ký nhận</div>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <Building className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tìm kiếm & Bộ lọc */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên tổ đội, đội trưởng, dự án, SĐT..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f3d64] bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Công trình:</span>
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white cursor-pointer"
            >
              <option value="ALL">Tất cả công trình</option>
              {projects.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách Tổ Đội */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider select-none">
                <th className="p-3 border-r border-slate-200 text-center w-12">STT</th>
                <th className="p-3 border-r border-slate-200 w-24">Mã Đội</th>
                <th className="p-3 border-r border-slate-200 min-w-[200px]">Tên Tổ Đội & Đội Trưởng</th>
                <th className="p-3 border-r border-slate-200 min-w-[170px]">Dự Án Đang Thi Công</th>
                <th className="p-3 border-r border-slate-200 text-center w-20">Quy Mô</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[110px]">Đơn Giá</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[120px]">Số Ngày Công</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[120px]">Tiền Theo Công</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[100px]">Tiền OT</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[100px]">Tạm Ứng</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[120px] bg-emerald-50 text-emerald-950 font-black">
                  Thực Lĩnh
                </th>
                <th className="p-3 text-center w-24 no-print">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-400">
                    Chưa có tổ đội nào trong danh sách. Bấm "Thêm Tổ Đội Mới" để tạo.
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((w, idx) => (
                  <tr key={w.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>

                    <td className="p-3 border-r border-slate-200 font-mono font-bold text-indigo-900">
                      {w.code}
                    </td>

                    <td className="p-3 border-r border-slate-200">
                      <div className="font-bold text-slate-900 hover:text-indigo-700 cursor-pointer" onClick={() => openEditModal(w)}>
                        {w.teamName}
                      </div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Trưởng đội: <strong className="text-slate-800">{w.leaderName}</strong> &bull; {w.phone}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {w.bankAccount ? `${w.bankAccount} (${w.bankName})` : 'Ký nhận tiền mặt'}
                      </div>
                    </td>

                    <td className="p-3 border-r border-slate-200 text-slate-700">
                      <div className="font-semibold text-slate-900 line-clamp-1">{w.project}</div>
                      <span className="text-[10px] text-slate-500">
                        {w.rateType === 'DAILY' ? 'Chấm công nhật' : 'Khoán theo khối lượng'}
                      </span>
                    </td>

                    <td className="p-3 border-r border-slate-200 text-center font-bold text-indigo-950">
                      {w.workerCount || 1} thợ
                    </td>

                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-800">
                      {formatVND(w.unitRate)}
                    </td>

                    <td className="p-3 border-r border-slate-200 text-center bg-indigo-50/20">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickStepDays(w, -0.5)}
                          className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="font-mono font-black text-slate-900 text-xs px-1.5 min-w-[28px]">
                          {w.actualWorkDays}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuickStepDays(w, 0.5)}
                          className="w-5 h-6 rounded bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>

                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                      {formatVND(w.salaryByDays)}
                    </td>

                    <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-700">
                      {formatVND(w.overtimePay || 0)}
                    </td>

                    <td className="p-3 border-r border-slate-200 text-right font-mono text-rose-700">
                      {w.advancePayment > 0 ? `-${formatVND(w.advancePayment)}` : '0 đ'}
                    </td>

                    <td className="p-3 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/40">
                      {formatVND(w.netSalary)}
                    </td>

                    <td className="p-3 text-center no-print">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(w)}
                          className="p-1.5 text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer"
                          title="Sửa tổ đội"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Bạn có chắc chắn muốn xóa ${w.teamName}?`)) {
                              onDeleteWorker(w.id);
                              showToast(`Đã xóa tổ đội ${w.teamName}`);
                            }
                          }}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Xóa tổ đội"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm / Chỉnh Sửa Tổ Đội */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#09233b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardHat className="w-5 h-5 text-indigo-300" />
                <h3 className="font-bold text-sm uppercase">
                  {editingWorker ? 'Chỉnh Sửa Tổ Đội Thi Công' : 'Thêm Tổ Đội Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mã tổ đội *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số lượng thợ trong đội</label>
                  <input
                    type="number"
                    min={1}
                    value={formWorkerCount}
                    onChange={(e) => setFormWorkerCount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên tổ đội thi công *</label>
                <input
                  type="text"
                  required
                  value={formTeamName}
                  onChange={(e) => setFormTeamName(e.target.value)}
                  placeholder="VD: Tổ Cốp Pha & Bê Tông - Đội 1..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Họ tên đội trưởng / Cai thầu *</label>
                  <input
                    type="text"
                    required
                    value={formLeaderName}
                    onChange={(e) => setFormLeaderName(e.target.value)}
                    placeholder="VD: Nguyễn Văn Thành..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0912 345 678..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Công trình / Dự án phân công *</label>
                <select
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Đơn giá ngày / khoán (VNĐ) *</label>
                  <input
                    type="number"
                    step={10000}
                    required
                    value={formUnitRate}
                    onChange={(e) => setFormUnitRate(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold text-indigo-900"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số ngày công / khối lượng</label>
                  <input
                    type="number"
                    step={0.5}
                    value={formActualDays}
                    onChange={(e) => setFormActualDays(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Giờ tăng ca (OT)</label>
                  <input
                    type="number"
                    value={formOtHours}
                    onChange={(e) => setFormOtHours(Number(e.target.value))}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phụ cấp ăn ca</label>
                  <input
                    type="number"
                    step={100000}
                    value={formMealAllowance}
                    onChange={(e) => setFormMealAllowance(Number(e.target.value))}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tạm ứng (VNĐ)</label>
                  <input
                    type="number"
                    step={100000}
                    value={formAdvancePayment}
                    onChange={(e) => setFormAdvancePayment(Number(e.target.value))}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono text-rose-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số tài khoản ngân hàng</label>
                  <input
                    type="text"
                    value={formBankAccount}
                    onChange={(e) => setFormBankAccount(e.target.value)}
                    placeholder="STK đội trưởng..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tên ngân hàng</label>
                  <input
                    type="text"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    placeholder="VD: Techcombank..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Ghi chú công việc tổ đội</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ghi chú phân công công việc..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingWorker ? 'Cập Nhật' : 'Lưu Tổ Đội'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
