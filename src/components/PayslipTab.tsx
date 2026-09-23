import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  CheckCircle2,
  PanelLeft,
  PanelRight,
  Mail,
  Send,
  MessageSquare,
  Zap,
  Settings,
  Loader2,
  FileDown,
  Users,
  History,
  AlertTriangle,
} from 'lucide-react';
import { CompanyConfig, Employee } from '../types';
import { PayslipDocument } from './PayslipDocument';
import { formatNumberOnly } from '../utils/numberToVietnameseWords';
import { MonthYearPicker } from './MonthYearPicker';
import { SendPayslipModal } from './SendPayslipModal';
import {
  exportPayslipToPDF,
  exportBatchPayslipsToPDF,
  printElementDirectly,
} from '../utils/pdfGenerator';

interface PayslipTabProps {
  employees: Employee[];
  config: CompanyConfig;
  onChangeMonthYear?: (month: number, year: number) => void;
  onUpdateEmployeeContact?: (employeeId: string, updates: { email?: string; phone?: string }) => void;
  onUpdateEmployeeEmail?: (employeeId: string, newEmail: string) => void;
  onOpenZaloSettings?: () => void;
  onOpenBatchZalo?: () => void;
}

export const PayslipTab: React.FC<PayslipTabProps> = ({
  employees,
  config,
  onChangeMonthYear,
  onUpdateEmployeeContact,
  onUpdateEmployeeEmail,
  onOpenZaloSettings,
  onOpenBatchZalo,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [sortBy, setSortBy] = useState<'STT' | 'NAME' | 'SALARY'>('STT');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'ACTIVE' | 'RESIGNED_HISTORY'>('ACTIVE');
  const [zoomScale, setZoomScale] = useState(1);
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(10);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isListOnRight, setIsListOnRight] = useState(false);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [sendTargetEmployee, setSendTargetEmployee] = useState<Employee | null>(null);
  const [sendChannel, setSendChannel] = useState<'ZALO' | 'EMAIL'>('ZALO');

  // PDF Export States
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [batchEmployees, setBatchEmployees] = useState<Employee[]>([]);
  const batchContainerRef = useRef<HTMLDivElement>(null);

  // Phân loại nhân viên đang làm việc và nhân viên đã nghỉ
  const activeEmployees = useMemo(
    () => employees.filter((e) => (e.status || 'ACTIVE') !== 'RESIGNED'),
    [employees]
  );
  const resignedEmployees = useMemo(
    () => employees.filter((e) => e.status === 'RESIGNED'),
    [employees]
  );

  const departments = useMemo(() => {
    const listToUse = viewMode === 'ACTIVE' ? activeEmployees : resignedEmployees;
    const set = new Set(listToUse.map((e) => e.department));
    return Array.from(set);
  }, [activeEmployees, resignedEmployees, viewMode]);

  // Filtered employees: Mặc định nhân viên đã nghỉ KHÔNG hiện lên trang phiếu lương (chỉ xem khi vào Lịch sử)
  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => {
        const isResigned = emp.status === 'RESIGNED';
        // Ở chế độ bình thường: chỉ hiện nhân viên đang làm việc
        if (viewMode === 'ACTIVE') {
          if (isResigned) return false;
        } else {
          // Ở chế độ xem lịch sử: chỉ hiện nhân viên đã nghỉ
          if (!isResigned) return false;
        }

        const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch =
          !term ||
          emp.fullName.toLowerCase().includes(term) ||
          emp.code.toLowerCase().includes(term) ||
          emp.title.toLowerCase().includes(term);
        return matchesDept && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'NAME') return a.fullName.localeCompare(b.fullName, 'vi');
        if (sortBy === 'SALARY') return b.netSalary - a.netSalary;
        return parseInt(a.id) - parseInt(b.id);
      });
  }, [employees, selectedDept, searchTerm, sortBy, viewMode]);

  // Keep selected index within bounds
  const currentEmployee = filteredEmployees[selectedIndex] || filteredEmployees[0] || employees[0];

  const totalFilteredNet = useMemo(() => {
    return filteredEmployees.reduce((sum, e) => sum + e.netSalary, 0);
  }, [filteredEmployees]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(filteredEmployees.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredEmployees]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // In trực tiếp phiếu lương chuẩn A4 qua cửa sổ in cô lập (không dính giao diện hệ thống)
  const handlePrint = (targetEmp?: Employee) => {
    const emp = targetEmp || currentEmployee;
    if (!emp) return;
    const slipEl = document.getElementById(`payslip-${emp.code}`);
    if (slipEl) {
      printElementDirectly(slipEl, `Phiếu Lương - ${emp.fullName} (${emp.code})`);
    } else {
      window.print();
    }
  };

  // Tải file .PDF thực thụ của phiếu lương đang xem (chuẩn khổ A4 sắc nét)
  const handleDownloadSinglePDF = async (targetEmp?: Employee) => {
    const emp = targetEmp || currentEmployee;
    if (!emp) return;

    // Nếu chọn nhân viên khác trong danh sách, chuyển selectedIndex
    if (targetEmp && targetEmp.code !== currentEmployee?.code) {
      const idx = filteredEmployees.findIndex((e) => e.code === targetEmp.code);
      if (idx !== -1) setSelectedIndex(idx);
      await new Promise((r) => setTimeout(r, 120));
    }

    const slipEl = document.getElementById(`payslip-${emp.code}`);
    if (!slipEl) {
      alert('Không tìm thấy phần tử phiếu lương để tạo PDF.');
      return;
    }

    try {
      setIsExportingPDF(true);
      const safeName = emp.fullName.replace(/\s+/g, '_');
      const periodStr = config.periodCode ? config.periodCode.replace('/', '_') : `${config.month || 9}_${config.year || 2026}`;
      const fileName = `PhieuLuong_${emp.code}_${safeName}_${periodStr}.pdf`;

      await exportPayslipToPDF(slipEl, fileName, (msg) => {
        setExportProgressText(msg);
      });
      showToast(`✓ Đã tải file PDF: ${fileName}`);
    } catch (error) {
      console.error('Lỗi khi xuất PDF:', error);
      alert('Không thể tạo file PDF trực tiếp. Bạn cũng có thể bấm "In / Lưu PDF" để chọn Lưu dưới dạng PDF từ trình duyệt.');
    } finally {
      setIsExportingPDF(false);
      setExportProgressText('');
    }
  };

  // Download single HTML payslip
  const handleDownloadSingleHTML = () => {
    if (!currentEmployee) return;
    const slipEl = document.getElementById(`payslip-${currentEmployee.code}`);
    if (!slipEl) return;

    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Phiếu Lương - ${currentEmployee.fullName} (${currentEmployee.code})</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    @media print {
      body { margin: 0; padding: 0; background: white; }
      @page { size: A4 portrait; margin: 10mm; }
    }
  </style>
</head>
<body class="bg-slate-100 p-6 flex justify-center">
  ${slipEl.outerHTML}
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PhieuLuong_${currentEmployee.code}_${currentEmployee.fullName.replace(/\s+/g, '_')}.html`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Đã tải file HTML: ${currentEmployee.fullName}`);
  };

  // Xuất file PDF hàng loạt (Mỗi nhân viên 1 trang A4)
  const executeBatchExport = async (items: Employee[], fileName: string) => {
    try {
      setIsExportingBatch(true);
      setBatchEmployees(items);
      setBatchProgress({ current: 0, total: items.length });

      // Đợi React mount xong các thẻ phiếu lương trong container ngầm
      await new Promise((resolve) => setTimeout(resolve, 350));

      if (!batchContainerRef.current) {
        throw new Error('Batch container not found');
      }

      const elements = Array.from(
        batchContainerRef.current.querySelectorAll('.batch-payslip-item')
      ) as HTMLElement[];

      if (elements.length === 0) {
        throw new Error('Không tìm thấy phần tử phiếu lương để kết xuất');
      }

      await exportBatchPayslipsToPDF(elements, fileName, (current, total) => {
        setBatchProgress({ current, total });
      });

      showToast(`✓ Đã tải file PDF tổng hợp: ${fileName}`);
    } catch (err) {
      console.error('Lỗi xuất PDF hàng loạt:', err);
      alert('Có lỗi khi tạo file PDF hàng loạt. Bạn hãy thử chọn khoảng số lượng nhỏ hơn.');
    } finally {
      setIsExportingBatch(false);
      setBatchEmployees([]);
      setBatchProgress(null);
    }
  };

  // Tải khoảng PDF
  const handleDownloadRange = async () => {
    const from = Math.max(1, rangeFrom);
    const to = Math.min(filteredEmployees.length, rangeTo);
    if (from > to) {
      alert('Khoảng từ phiếu phải nhỏ hơn hoặc bằng đến phiếu');
      return;
    }

    const itemsToExport = filteredEmployees.slice(from - 1, to);
    if (itemsToExport.length === 0) return;

    const periodStr = config.periodCode ? config.periodCode.replace('/', '_') : `${config.month || 9}_${config.year || 2026}`;
    await executeBatchExport(
      itemsToExport,
      `Phieu_Luong_Tu_${from}_den_${to}_${periodStr}.pdf`
    );
  };

  // Tải toàn bộ danh sách phiếu lương thành 1 file PDF nhiều trang
  const handleDownloadAllPDF = async () => {
    if (filteredEmployees.length === 0) {
      alert('Danh sách nhân viên trống');
      return;
    }

    const periodStr = config.periodCode ? config.periodCode.replace('/', '_') : `${config.month || 9}_${config.year || 2026}`;
    await executeBatchExport(
      filteredEmployees,
      `Tong_Hop_${filteredEmployees.length}_Phieu_Luong_${periodStr}.pdf`
    );
  };

  // Ensure selectedIndex is within bounds when list changes
  useEffect(() => {
    if (selectedIndex >= filteredEmployees.length && filteredEmployees.length > 0) {
      setSelectedIndex(0);
    }
  }, [filteredEmployees.length, selectedIndex]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header with Title & Month/Year Picker like Payroll Tab */}
      <div className="bg-white border border-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Phiếu lương chi tiết — {config.period}
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            ({filteredEmployees.length} {viewMode === 'ACTIVE' ? 'nhân viên đang làm việc' : 'nhân viên đã nghỉ'})
          </span>

          {/* Month & Year Picker Text Box */}
          {onChangeMonthYear && (
            <MonthYearPicker
              month={config.month || 9}
              year={config.year || 2026}
              onChange={onChangeMonthYear}
              label="Chọn kỳ xem lương:"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Chuyển đổi giữa Nhân viên đang làm việc và Lịch sử nhân viên đã nghỉ */}
          <div className="flex items-center rounded border border-slate-300 p-0.5 bg-slate-100 font-semibold">
            <button
              type="button"
              id="btn-payslip-active-view"
              onClick={() => {
                setViewMode('ACTIVE');
                setSelectedIndex(0);
              }}
              className={`px-3 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                viewMode === 'ACTIVE'
                  ? 'bg-white text-[#0f3d64] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Đang làm việc ({activeEmployees.length})</span>
            </button>
            {resignedEmployees.length > 0 && (
              <button
                type="button"
                id="btn-payslip-resigned-view"
                onClick={() => {
                  setViewMode('RESIGNED_HISTORY');
                  setSelectedIndex(0);
                }}
                className={`px-3 py-1 rounded cursor-pointer transition flex items-center gap-1.5 ${
                  viewMode === 'RESIGNED_HISTORY'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-rose-800 hover:bg-rose-50'
                }`}
                title="Xem lại lịch sử phiếu lương trước đây của các nhân viên đã nghỉ"
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch sử đã nghỉ ({resignedEmployees.length})</span>
              </button>
            )}
          </div>

          <span className="bg-sky-50 text-[#0f3d64] border border-sky-200 px-2.5 py-1 rounded font-medium">
            Kỳ chi trả: {config.paymentDate ? config.paymentDate : `05/${String(((config.month || 9) % 12) + 1).padStart(2, '0')}/${config.year || 2026}`}
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white border border-slate-200 rounded p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-700 mr-1">Xuất:</span>
          
          {/* Nút Tải .PDF chính thức */}
          <button
            id="btn-download-pdf"
            onClick={() => handleDownloadSinglePDF()}
            disabled={isExportingPDF || isExportingBatch}
            className="px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded flex items-center gap-1.5 font-bold transition shadow-xs cursor-pointer border border-rose-800 disabled:opacity-50"
            title="Tải trực tiếp file .PDF chuẩn A4 sắc nét về máy"
          >
            {isExportingPDF ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            <span>Tải .PDF</span>
          </button>

          {/* Nút Tải .HTML dự phòng */}
          <button
            id="btn-download-html"
            onClick={handleDownloadSingleHTML}
            className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-300 rounded flex items-center gap-1 text-[11px] font-medium transition cursor-pointer"
            title="Tải file định dạng HTML xem trên trình duyệt"
          >
            <FileText className="w-3 h-3 text-slate-500" />
            <span>Tải .HTML</span>
          </button>

          {/* Nút gửi Zalo phiếu lương (rất thích hợp cho công nhân, kỹ thuật) */}
          <button
            id="btn-send-zalo-slip"
            disabled={currentEmployee?.status === 'RESIGNED'}
            onClick={() => {
              if (currentEmployee && currentEmployee.status !== 'RESIGNED') {
                setSendTargetEmployee(currentEmployee);
                setSendChannel('ZALO');
                setIsSendModalOpen(true);
              }
            }}
            className={`px-3.5 py-1.5 font-semibold rounded flex items-center gap-1.5 transition shadow-xs cursor-pointer border ${
              currentEmployee?.status === 'RESIGNED'
                ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed'
                : 'bg-[#0068FF] hover:bg-[#0052cc] text-white border-[#004dc2]'
            }`}
            title={
              currentEmployee?.status === 'RESIGNED'
                ? 'Nhân viên đã nghỉ việc — phiếu lương chỉ lưu trữ lịch sử, không gửi tin nhắn kỳ này'
                : `Gửi Zalo phiếu lương cho ${currentEmployee?.fullName} (khuyên dùng cho công nhân, thợ, lái xe)`
            }
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Gửi Zalo</span>
          </button>

          {/* Nút gửi Zalo OA hàng loạt cho toàn bộ nhân viên (Chỉ hiện khi xem danh sách đang làm việc) */}
          {onOpenBatchZalo && viewMode === 'ACTIVE' && (
            <button
              id="btn-batch-send-zalo-slip"
              onClick={onOpenBatchZalo}
              className="px-3.5 py-1.5 bg-gradient-to-r from-[#0068FF] to-[#0050c8] hover:from-[#0052cc] hover:to-[#003d99] text-white font-bold rounded flex items-center gap-1.5 transition shadow-xs cursor-pointer border border-[#004dc2]"
              title="Gửi tự động phiếu lương qua Zalo OA hàng loạt cho tất cả nhân viên đang làm việc có số điện thoại"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Gửi Zalo OA Hàng Loạt</span>
            </button>
          )}

          {/* Nút cài đặt Zalo OA */}
          {onOpenZaloSettings && (
            <button
              id="btn-open-zalo-settings-payslip"
              onClick={onOpenZaloSettings}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded flex items-center gap-1 font-medium transition cursor-pointer"
              title="Cài đặt kết nối Zalo OA Phúc Nguyên (Access Token, OA ID, Template ID)"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Cài đặt Zalo OA</span>
            </button>
          )}

          {/* Nút gửi email phiếu lương */}
          <button
            id="btn-send-email-slip"
            disabled={currentEmployee?.status === 'RESIGNED'}
            onClick={() => {
              if (currentEmployee && currentEmployee.status !== 'RESIGNED') {
                setSendTargetEmployee(currentEmployee);
                setSendChannel('EMAIL');
                setIsSendModalOpen(true);
              }
            }}
            className={`px-3 py-1.5 font-medium rounded flex items-center gap-1.5 transition shadow-xs cursor-pointer border ${
              currentEmployee?.status === 'RESIGNED'
                ? 'bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed'
                : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
            }`}
            title={
              currentEmployee?.status === 'RESIGNED'
                ? 'Nhân viên đã nghỉ việc — phiếu lương chỉ lưu trữ lịch sử, không gửi email kỳ này'
                : `Gửi email phiếu lương cho ${currentEmployee?.fullName}`
            }
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gửi Email</span>
          </button>

          <button
            id="btn-download-all-slips"
            onClick={handleDownloadAllPDF}
            disabled={isExportingPDF || isExportingBatch}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded font-medium transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
            title="Xuất file PDF tổng hợp toàn bộ phiếu lương các nhân sự"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-600" />
            <span>Tải tất cả PDF ({filteredEmployees.length})</span>
          </button>
        </div>

        {/* Range and Zoom Controls */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-slate-600">Từ phiếu</span>
            <input
              type="number"
              min={1}
              max={filteredEmployees.length}
              value={rangeFrom}
              onChange={(e) => setRangeFrom(Number(e.target.value))}
              className="w-12 h-7 px-1.5 border border-slate-300 rounded text-center font-medium"
            />
            <span className="text-slate-600">đến</span>
            <input
              type="number"
              min={1}
              max={filteredEmployees.length}
              value={rangeTo}
              onChange={(e) => setRangeTo(Number(e.target.value))}
              className="w-12 h-7 px-1.5 border border-slate-300 rounded text-center font-medium"
            />
            <button
              onClick={handleDownloadRange}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-slate-700 font-medium cursor-pointer ml-1"
            >
              Tải khoảng
            </button>
          </div>

          <div className="flex items-center border border-slate-200 rounded overflow-hidden">
            <button
              onClick={() => setZoomScale((prev) => Math.max(0.6, prev - 0.1))}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-r border-slate-200 cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomScale(1)}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 font-medium text-[11px] cursor-pointer"
            >
              Vừa khung
            </button>
            <button
              onClick={() => setZoomScale((prev) => Math.min(1.4, prev + 0.1))}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border-l border-slate-200 cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toggle sidebar position (Left / Right) */}
          <button
            onClick={() => setIsListOnRight((prev) => !prev)}
            className={`px-2.5 py-1 rounded border text-xs flex items-center gap-1.5 cursor-pointer transition font-medium ${
              isListOnRight
                ? 'bg-sky-50 border-sky-300 text-sky-800'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
            title="Đổi vị trí danh sách nhân viên sang bên phải hoặc bên trái"
          >
            {isListOnRight ? (
              <>
                <PanelRight className="w-3.5 h-3.5 text-sky-700" />
                <span>DS bên Phải</span>
              </>
            ) : (
              <>
                <PanelLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>DS bên Trái</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Yellow Tip Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded px-3.5 py-2 text-[12px] text-amber-900 flex items-center justify-between">
        <div>
          <span className="font-semibold mr-1">💡 In / Lưu PDF cho bản nét nhất (chữ vector, đúng khổ A4).</span>
          <span className="text-amber-800">
            Trong hộp thoại in chọn <strong>Đích: Save as PDF</strong>, <strong>Lề (Margins): None</strong>, và bật <strong>Background graphics</strong>.
          </span>
          <span className="hidden sm:inline text-amber-700 ml-2 italic">
            Mẹo: gõ tên/mã rồi nhấn Enter để tải ngay phiếu đó; dùng ↑ ↓ để chuyển người.
          </span>
        </div>
      </div>

      {/* Toast alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 z-50 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Employee list Sidebar (can be Left or Right) */}
        <div className={`lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 rounded shadow-xs overflow-hidden flex flex-col h-[760px] ${
          isListOnRight ? 'lg:order-2' : 'lg:order-1'
        }`}>
          {/* Search box */}
          <div className="p-2.5 border-b border-slate-200 space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && currentEmployee) {
                    handleDownloadSingleHTML();
                  }
                }}
                placeholder="Gõ tên hoặc mã NV... (vd: PNC0004 / quang)"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-sky-600 bg-slate-50 focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setSelectedIndex(0);
                }}
                className="w-full px-2 py-1 border border-slate-300 rounded text-slate-700 bg-white"
              >
                <option value="ALL">Tất cả bộ phận</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-2 py-1 border border-slate-300 rounded text-slate-700 bg-white"
              >
                <option value="STT">Sắp xếp: STT</option>
                <option value="NAME">Sắp xếp: Tên</option>
                <option value="SALARY">Sắp xếp: Thực lĩnh</option>
              </select>
            </div>

            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-0.5">
              <span>
                {filteredEmployees.length}/{viewMode === 'ACTIVE' ? activeEmployees.length : resignedEmployees.length}{' '}
                {viewMode === 'ACTIVE' ? 'người đang làm việc' : 'người đã nghỉ (lưu trữ)'}
              </span>
              <span>
                Thực lĩnh nhóm: <strong className="text-slate-800">{formatNumberOnly(totalFilteredNet)} đ</strong>
              </span>
            </div>
          </div>

          {/* Employee list scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredEmployees.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                {viewMode === 'RESIGNED_HISTORY'
                  ? 'Chưa có nhân viên nào trong danh sách đã nghỉ việc'
                  : 'Không tìm thấy nhân viên đang làm việc phù hợp'}
              </div>
            ) : (
              filteredEmployees.map((emp, idx) => {
                const isSelected = idx === selectedIndex;
                const isResigned = emp.status === 'RESIGNED';
                return (
                  <div
                    key={emp.code}
                    id={`emp-item-${emp.code}`}
                    onClick={() => setSelectedIndex(idx)}
                    className={`p-2.5 text-xs cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-sky-50/90 border-l-4 border-[#0f3d64] text-slate-900 font-medium'
                        : isResigned
                        ? 'bg-rose-50/30 hover:bg-rose-50/60 text-slate-700'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-slate-900">{emp.fullName}</span>
                        {isResigned && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                            Đã nghỉ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        <span className="font-semibold text-sky-800">{emp.code}</span> • {emp.title}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Nút tải PDF trực tiếp cho từng nhân viên */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSinglePDF(emp);
                        }}
                        className="p-1 rounded text-rose-600 hover:text-rose-800 hover:bg-rose-50 transition cursor-pointer"
                        title={`Tải ngay file PDF phiếu lương của ${emp.fullName}`}
                      >
                        <FileDown className="w-3.5 h-3.5" />
                      </button>

                      {/* Không hiện nút gửi Zalo / Email nếu nhân viên đã nghỉ */}
                      {!isResigned && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIndex(idx);
                              setSendTargetEmployee(emp);
                              setSendChannel('ZALO');
                              setIsSendModalOpen(true);
                            }}
                            className="p-1 rounded text-[#0068FF] hover:bg-blue-100 transition cursor-pointer"
                            title={`Gửi Zalo phiếu lương cho ${emp.fullName}`}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIndex(idx);
                              setSendTargetEmployee(emp);
                              setSendChannel('EMAIL');
                              setIsSendModalOpen(true);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-sky-700 hover:bg-sky-100 transition cursor-pointer"
                            title={`Gửi email phiếu lương cho ${emp.fullName}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      <div className="text-right">
                        <div className="font-bold font-mono text-[12px] text-slate-800">
                          {formatNumberOnly(emp.netSalary)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {emp.department.replace('Phòng ', '')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Payslip Preview Pane (can be Left or Right) */}
        <div className={`lg:col-span-8 xl:col-span-9 bg-slate-200/60 border border-slate-300 rounded p-4 overflow-x-auto min-h-[760px] flex flex-col justify-start items-center ${
          isListOnRight ? 'lg:order-1' : 'lg:order-2'
        }`}>
          {/* Cảnh báo nếu đang xem phiếu lương lưu trữ của nhân viên đã nghỉ việc */}
          {currentEmployee && currentEmployee.status === 'RESIGNED' && (
            <div className="mb-3 w-full max-w-[760px] bg-rose-50 border border-rose-300 p-3 rounded shadow-xs flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-rose-900">
                <History className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <div className="font-bold uppercase tracking-wide flex items-center gap-2">
                    <span>Hồ sơ lưu trữ lịch sử phiếu lương</span>
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded font-bold text-[10px]">ĐÃ NGHỈ VIỆC</span>
                  </div>
                  <p className="text-[11px] text-rose-800 mt-1">
                    Nhân sự <strong>{currentEmployee.fullName}</strong> ({currentEmployee.code}) đã thôi việc. Bảng lương và phiếu lương này chỉ lưu lại lịch sử làm việc và thu nhập trước đây để phục vụ tra cứu, đối soát quyết toán, không phát hành trong kỳ chi trả hiện tại.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentEmployee ? (
            <div className="w-full flex justify-center">
              <PayslipDocument
                employee={currentEmployee}
                config={config}
                scale={zoomScale}
              />
            </div>
          ) : (
            <div className="text-slate-400 text-sm mt-20">Vui lòng chọn nhân viên</div>
          )}
        </div>
      </div>

      {/* Modal gửi Phiếu Lương (Hỗ trợ Zalo & Email) */}
      {isSendModalOpen && (sendTargetEmployee || currentEmployee) && (
        <SendPayslipModal
          isOpen={isSendModalOpen}
          onClose={() => {
            setIsSendModalOpen(false);
            setSendTargetEmployee(null);
          }}
          employee={sendTargetEmployee || currentEmployee}
          config={config}
          initialChannel={sendChannel}
          onUpdateEmployeeContact={onUpdateEmployeeContact}
          onUpdateEmployeeEmail={onUpdateEmployeeEmail}
          onOpenZaloSettings={onOpenZaloSettings}
        />
      )}

      {/* Container ẩn phục vụ kết xuất hàng loạt nhiều trang vào 1 file PDF */}
      {isExportingBatch && batchEmployees.length > 0 && (
        <div
          ref={batchContainerRef}
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            width: '820px',
            zIndex: -9999,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          {batchEmployees.map((emp) => (
            <div key={emp.id} className="batch-payslip-item bg-white p-4 mb-6">
              <PayslipDocument
                employee={emp}
                config={config}
                scale={1}
              />
            </div>
          ))}
        </div>
      )}

      {/* Overlay tiến trình khi đang xuất file PDF */}
      {(isExportingPDF || isExportingBatch) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              {isExportingBatch ? 'Đang xuất PDF Hàng Loạt' : 'Đang tạo tệp PDF A4 sắc nét'}
            </h3>
            <p className="text-xs text-slate-600 mb-4 min-h-[20px]">
              {isExportingBatch && batchProgress
                ? `Đang kết xuất ${batchProgress.current} / ${batchProgress.total} phiếu lương sang PDF...`
                : exportProgressText || 'Đang xử lý văn bản, phông chữ và định dạng A4...'}
            </p>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
              <div
                className="bg-rose-600 h-full transition-all duration-300"
                style={{
                  width: isExportingBatch && batchProgress
                    ? `${Math.max(10, Math.round((batchProgress.current / Math.max(1, batchProgress.total)) * 100))}%`
                    : '75%',
                }}
              />
            </div>
            <div className="text-[11px] text-slate-400 italic">
              Vui lòng đợi trong giây lát, file .PDF sẽ tự động tải về...
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
