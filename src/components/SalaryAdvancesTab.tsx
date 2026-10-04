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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SalaryAdvance, Employee, SeasonalWorker, TeamWorker, CompanyConfig } from '../types';
import { formatVND, numberToVietnameseWords } from '../utils/numberToVietnameseWords';

interface SalaryAdvancesTabProps {
  advances: SalaryAdvance[];
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  teamWorkers: TeamWorker[];
  config: CompanyConfig;
  onAddAdvance: (advance: SalaryAdvance) => void;
  onUpdateAdvance: (advance: SalaryAdvance) => void;
  onDeleteAdvance: (id: string) => void;
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
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState<'ALL' | 'PERMANENT' | 'SEASONAL' | 'TEAM'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'DEDUCTED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [printingAdvance, setPrintingAdvance] = useState<SalaryAdvance | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Form modal state
  const [formTargetType, setFormTargetType] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('PERMANENT');
  const [formWorkerId, setFormWorkerId] = useState('');
  const [formAmount, setFormAmount] = useState<number>(3000000);
  const [formReason, setFormReason] = useState('Tạm ứng tiền sinh hoạt công trường giữa kỳ');
  const [formMethod, setFormMethod] = useState<'BANK' | 'CASH'>('BANK');
  const [formNotes, setFormNotes] = useState('');

  // Danh sách worker khả dụng theo loại target
  const availableWorkers = useMemo(() => {
    if (formTargetType === 'PERMANENT') {
      return employees.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.fullName,
        sub: e.department,
      }));
    } else if (formTargetType === 'SEASONAL') {
      return seasonalWorkers.map((w) => ({
        id: w.id,
        code: w.code,
        name: w.fullName,
        sub: w.project || w.trade,
      }));
    } else {
      return teamWorkers.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.teamName,
        sub: `${t.leaderName} (${t.project})`,
      }));
    }
  }, [formTargetType, employees, seasonalWorkers, teamWorkers]);

  const openAddModal = () => {
    setFormTargetType('PERMANENT');
    setFormWorkerId(employees[0]?.id || '');
    setFormAmount(3000000);
    setFormReason('Tạm ứng tiền sinh hoạt giữa kỳ');
    setFormMethod('BANK');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const handleCreateAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedWorker = availableWorkers.find((w) => w.id === formWorkerId);
    if (!selectedWorker) {
      alert('Vui lòng chọn nhân sự tạm ứng!');
      return;
    }

    const nextIdx = advances.length + 1;
    const newAdv: SalaryAdvance = {
      id: `adv-${Date.now()}`,
      advanceCode: `TU-2026-${nextIdx < 100 ? String(nextIdx).padStart(3, '0') : nextIdx}`,
      targetType: formTargetType,
      workerId: selectedWorker.id,
      workerCode: selectedWorker.code,
      workerName: selectedWorker.name,
      departmentOrProject: selectedWorker.sub || 'Công ty Phúc Nguyên',
      amount: Number(formAmount) || 0,
      requestDate: new Date().toLocaleDateString('vi-VN'),
      paymentDate: new Date().toLocaleDateString('vi-VN'),
      reason: formReason,
      paymentMethod: formMethod,
      status: 'APPROVED',
      approvedBy: 'Admin (Giám đốc)',
      periodKey: `${config.month < 10 ? '0' + config.month : config.month}/${config.year}`,
      notes: formNotes,
    };

    onAddAdvance(newAdv);
    showToast(`Đã tạo phiếu tạm ứng ${newAdv.advanceCode} cho ${newAdv.workerName}!`);
    setIsModalOpen(false);
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
        ? `Đã xác nhận khấu trừ phiếu ${adv.advanceCode} vào bảng lương!`
        : `Đã cập nhật trạng thái phiếu ${adv.advanceCode}`
    );
  };

  // Lọc danh sách
  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      const matchSearch =
        adv.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        adv.workerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        adv.advanceCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        adv.departmentOrProject.toLowerCase().includes(searchTerm.toLowerCase()) ||
        adv.reason.toLowerCase().includes(searchTerm.toLowerCase());

      const matchTarget = targetTypeFilter === 'ALL' || adv.targetType === targetTypeFilter;
      const matchStatus = statusFilter === 'ALL' || adv.status === statusFilter;

      return matchSearch && matchTarget && matchStatus;
    });
  }, [advances, searchTerm, targetTypeFilter, statusFilter]);

  // Thống kê
  const totalAmount = advances.reduce((sum, a) => sum + (a.amount || 0), 0);
  const deductedAmount = advances.filter((a) => a.status === 'DEDUCTED').reduce((sum, a) => sum + (a.amount || 0), 0);
  const approvedAmount = advances.filter((a) => a.status === 'APPROVED').reduce((sum, a) => sum + (a.amount || 0), 0);

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

  // In phiếu chi tạm ứng
  const handlePrintAdvanceReceipt = (adv: SalaryAdvance) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Vui lòng mở pop-up trên trình duyệt để in phiếu tạm ứng!');
      return;
    }

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

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
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
            <span className="p-2 bg-amber-500/20 text-amber-300 rounded-lg">
              <CreditCard className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              Bản Lương Ứng Theo Nhân Viên (Tạm Ứng Tiền Lương)
            </h2>
          </div>
          <p className="text-xs text-sky-200 mt-1 max-w-2xl">
            Quản lý phê duyệt tạm ứng cho Nhân viên chính thức, Nhân lực thời vụ và Tổ đội thi công. Tự động liên kết và khấu trừ vào Bảng lương hàng kỳ.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

      {/* 4 Thẻ Chỉ Số Tạm Ứng */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng tiền đã tạm ứng</div>
            <div className="text-xl font-black text-rose-700 mt-0.5">{formatVND(totalAmount)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{advances.length} lượt đề xuất ứng</div>
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
            <div className="text-[11px] text-slate-500 mt-0.5">Sẽ trừ vào kỳ lương {config.periodCode}</div>
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
              <div className="text-amber-800">Thời vụ: {advances.filter((a) => a.targetType === 'SEASONAL').length} &bull; Tổ đội: {advances.filter((a) => a.targetType === 'TEAM').length}</div>
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
                        {adv.requestDate}
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
                        <div className="flex items-center justify-center gap-1">
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
                              if (confirm(`Bạn có chắc muốn xóa phiếu tạm ứng ${adv.advanceCode}?`)) {
                                onDeleteAdvance(adv.id);
                                showToast(`Đã xóa phiếu ${adv.advanceCode}`);
                              }
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

      {/* Modal Tạo Phiếu Tạm Ứng Mới */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#09233b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-sm uppercase">Lập Phiếu Tạm Ứng Tiền Lương</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAdvance} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Loại đối tượng nhận tạm ứng</label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('PERMANENT');
                      setFormWorkerId(employees[0]?.id || '');
                    }}
                    className={`py-1.5 rounded-md font-bold text-center transition ${
                      formTargetType === 'PERMANENT' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Chính thức
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('SEASONAL');
                      setFormWorkerId(seasonalWorkers[0]?.id || '');
                    }}
                    className={`py-1.5 rounded-md font-bold text-center transition ${
                      formTargetType === 'SEASONAL' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Thời vụ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTargetType('TEAM');
                      setFormWorkerId(teamWorkers[0]?.id || '');
                    }}
                    className={`py-1.5 rounded-md font-bold text-center transition ${
                      formTargetType === 'TEAM' ? 'bg-indigo-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Tổ đội
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Chọn nhân sự nhận tiền *</label>
                <select
                  required
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium"
                >
                  {availableWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} - {w.name} {w.sub ? `(${w.sub})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Số tiền tạm ứng (VNĐ) *</label>
                  <input
                    type="number"
                    step={100000}
                    required
                    min={100000}
                    value={formAmount}
                    onChange={(e) => setFormAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold text-rose-700"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5 italic">{formatVND(formAmount)}</div>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phương thức chi</label>
                  <select
                    value={formMethod}
                    onChange={(e) => setFormMethod(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-semibold"
                  >
                    <option value="BANK">Chuyển khoản ATM</option>
                    <option value="CASH">Tiền mặt công trường</option>
                  </select>
                </div>
              </div>

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
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Lưu & Phê Duyệt Phiếu</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
