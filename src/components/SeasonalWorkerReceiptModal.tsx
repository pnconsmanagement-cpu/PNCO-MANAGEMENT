import React, { useRef, useState } from 'react';
import {
  X,
  Printer,
  Download,
  HardHat,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  ExternalLink,
  FileDown,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { SeasonalWorker, CompanyConfig } from '../types';
import { formatNumberOnly, numberToVietnameseWords } from '../utils/numberToVietnameseWords';
import {
  printSeasonalWorkerReceipt,
  openSeasonalWorkerReceiptInNewTab,
  downloadSeasonalWorkerReceiptHTML,
} from '../utils/printPayrollReceipt';
import { exportPayslipToPDF } from '../utils/pdfGenerator';

interface SeasonalWorkerReceiptModalProps {
  isOpen: boolean;
  worker: SeasonalWorker | null;
  config: CompanyConfig;
  onClose: () => void;
  periodLabel?: string;
}

export const SeasonalWorkerReceiptModal: React.FC<SeasonalWorkerReceiptModalProps> = ({
  isOpen,
  worker,
  config,
  onClose,
  periodLabel,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>('');
  const [blockedNotice, setBlockedNotice] = useState(false);

  // Hỗ trợ phím ESC để đóng modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExportingPDF) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isExportingPDF]);

  if (!isOpen || !worker) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isExportingPDF) {
      onClose();
    }
  };

  const activePeriodText = periodLabel || worker.currentWeekLabel || config.period;

  const handlePrint = () => {
    setBlockedNotice(false);
    printSeasonalWorkerReceipt(
      worker,
      config,
      () => {
        setBlockedNotice(true);
      },
      activePeriodText
    );
  };

  const handleOpenNewTab = () => {
    setBlockedNotice(false);
    const opened = openSeasonalWorkerReceiptInNewTab(worker, config, activePeriodText);
    if (!opened) {
      setBlockedNotice(true);
    }
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      setIsExportingPDF(true);
      setPdfProgress('Đang chuẩn bị trang in PDF...');
      const fileName = `Phieu_Thanh_Toan_${worker.code}_${worker.fullName.replace(/\s+/g, '_')}`;
      await exportPayslipToPDF(printRef.current, fileName, (msg) => {
        setPdfProgress(msg);
      });
    } catch (err) {
      console.error('Lỗi xuất PDF:', err);
      // Fallback tải file HTML
      downloadSeasonalWorkerReceiptHTML(worker, config, activePeriodText);
    } finally {
      setIsExportingPDF(false);
      setPdfProgress('');
    }
  };

  const handleDownloadHTML = () => {
    downloadSeasonalWorkerReceiptHTML(worker, config, activePeriodText);
  };

  // Tạo URL mã QR chuyển khoản VietQR nhanh nếu có STK
  const qrUrl =
    worker.paymentMethod === 'BANK' && worker.bankAccount && worker.bankName
      ? `https://img.vietqr.io/image/${encodeURIComponent(worker.bankName)}-${encodeURIComponent(worker.bankAccount)}-compact.png?amount=${worker.netSalary}&addInfo=${encodeURIComponent(`Thanh toan cong nhat ${worker.code} ${config.periodCode}`)}&accountName=${encodeURIComponent(worker.fullName)}`
      : null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 overflow-y-auto"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* Modal Toolbar */}
        <div className="no-print bg-slate-100 border-b border-slate-200 p-3 px-4 sm:px-5 rounded-t-xl flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <HardHat className="w-5 h-5 text-amber-600" />
            <span>Phiếu thanh toán tiền công thợ / Lao động thời vụ</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-[#0f3d64] hover:bg-[#1a5b94] text-white rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="In trực tiếp phiếu qua hộp thoại máy in"
            >
              <Printer className="w-4 h-4" />
              <span>In phiếu ngay</span>
            </button>

            <button
              type="button"
              onClick={handleOpenNewTab}
              className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Mở sang tab mới riêng biệt để in (tránh bị chặn bởi iframe)"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Mở tab in riêng</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Xuất file PDF tài liệu A4 chuẩn in ấn"
            >
              {isExportingPDF ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{pdfProgress || 'Đang tạo PDF...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Xuất PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadHTML}
              className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Tải tệp HTML độc lập để mở xem hoặc in trên bất kỳ thiết bị nào"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-500" />
              <span>Tải file in</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-300 hover:border-rose-300 rounded text-xs font-bold transition cursor-pointer ml-1 shadow-xs"
              title="Đóng cửa sổ (Nhấn phím Esc hoặc bấm ra ngoài)"
            >
              <X className="w-4 h-4 text-slate-600 hover:text-rose-600" />
              <span>Đóng</span>
              <kbd className="hidden sm:inline-block text-[10px] bg-white border border-slate-300 rounded px-1 text-slate-500 font-mono">Esc</kbd>
            </button>
          </div>
        </div>

        {/* Cảnh báo / Hướng dẫn nếu bị chặn in bởi sandbox trình duyệt */}
        {blockedNotice && (
          <div className="no-print bg-amber-50 border-b border-amber-200 p-2.5 px-5 flex items-center justify-between text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Trình duyệt đang chặn cửa sổ in ấn bên trong ứng dụng. Hãy bấm <strong>&ldquo;Mở tab in riêng&rdquo;</strong> hoặc <strong>&ldquo;Xuất PDF&rdquo;</strong> để in bình thường!
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="underline font-bold text-amber-900 hover:text-amber-950 ml-3 shrink-0 cursor-pointer"
            >
              Mở tab in ngay &rarr;
            </button>
          </div>
        )}

        {/* Printable Receipt Content */}
        <div className="flex-1 overflow-y-auto p-7 sm:p-9 text-slate-800 text-[12.5px] bg-white font-sans" ref={printRef}>
          {/* Header công ty & mẫu biểu */}
          <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-3">
            <div>
              <div className="font-bold text-[14px] uppercase text-[#0f3d64] tracking-wide">
                {config.name}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 italic">
                {config.address}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                MST: {config.taxCode} | ĐT: {config.phone}
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-600">
              <div className="font-semibold">{config.formNumber || 'Mẫu: 03-LĐTL'}</div>
              <div className="mt-1">
                Số phiếu: <span className="font-bold text-slate-800">PLTV{config.periodCode?.replace('/', '') || `${config.month}${config.year}`}-{worker.code}</span>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center my-3">
            <h2 className="text-2xl font-black tracking-wider text-[#0f3d64] uppercase">
              PHIẾU LƯƠNG NHÂN CÔNG
            </h2>
            <p className="text-xs text-slate-600 italic mt-1 font-medium">
              Kỳ thanh toán: {activePeriodText}
              {worker.project && (
                <span>
                  {' '}— Công trình: <strong className="text-[#0f3d64] font-semibold">{worker.project}</strong>
                </span>
              )}
            </p>
          </div>

          {/* Worker Info Card */}
          <div className="bg-slate-50 border border-slate-200 rounded p-3 sm:p-3.5 mb-3.5 text-[12px] grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Họ và tên:</span>
              <span className="font-bold text-slate-900">{worker.fullName}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Mã nhân công:</span>
              <span className="font-bold text-[#0f3d64]">{worker.code}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Nghề nghiệp:</span>
              <span className="font-medium text-slate-800">{worker.trade} {worker.skillLevel ? `(${worker.skillLevel})` : ''}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Tổ / Đội:</span>
              <span className="font-medium text-slate-800">{worker.teamName || 'Đội thi công công trình'}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Số CCCD / CMND:</span>
              <span className="font-mono text-slate-800">{worker.idCard || 'Đang cập nhật'}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Điện thoại:</span>
              <span className="text-slate-800">{worker.phone || '—'}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Hình thức lương:</span>
              <span className="font-semibold text-slate-800">Theo ngày công ({formatNumberOnly(worker.dailyRate)} đ/ngày)</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Ngày công:</span>
              <span className="font-bold text-slate-800">
                {worker.actualWorkDays} ngày {worker.overtimeHours > 0 ? `(+${worker.overtimeHours}h tăng ca)` : ''}
              </span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Phụ trách:</span>
              <span className="text-slate-800">{worker.teamLeader || 'Ban Chỉ huy công trường'}</span>
            </div>
            <div className="flex">
              <span className="w-28 text-slate-600 shrink-0">Chi trả qua:</span>
              <span className="font-semibold text-slate-800">
                {worker.paymentMethod === 'BANK'
                  ? `${worker.bankName} - ${worker.bankAccount}`
                  : 'Tiền mặt tại công trường'}
              </span>
            </div>
          </div>

          {/* Bảng chấm công chi tiết theo chu kỳ (1 tuần hoặc 2 tuần) */}
          {worker.weeklyTimesheet && worker.weeklyTimesheet.length > 0 && (
            <div className="mb-3.5 bg-slate-50 border border-slate-200 rounded p-2.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-1.5 mb-2">
                <span className="uppercase text-[11px] tracking-wide text-[#0f3d64]">
                  Bảng chấm công chi tiết trong kỳ ({activePeriodText})
                </span>
                <span className="font-mono text-slate-600 text-[11px]">
                  Tổng: <strong className="text-[#0f3d64]">{worker.actualWorkDays} công</strong> — Tăng ca:{' '}
                  <strong className="text-amber-700">{worker.overtimeHours} giờ OT</strong>
                </span>
              </div>
              <div
                className={`grid gap-1 text-center ${
                  worker.weeklyTimesheet.length > 7 ? 'grid-cols-5 sm:grid-cols-8' : 'grid-cols-7'
                }`}
              >
                {worker.weeklyTimesheet.map((day, dIdx) => (
                  <div key={`${day.dayOfWeek}_${dIdx}`} className="border border-slate-200 bg-white rounded p-1">
                    <div
                      className={`font-semibold text-[11px] ${
                        day.dayOfWeek === 'CN' ? 'text-rose-600' : 'text-slate-800'
                      }`}
                    >
                      {day.dayName || day.dayOfWeek}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">{day.dateLabel || ''}</div>
                    <div className="font-bold text-xs font-mono text-[#0f3d64] mt-0.5">
                      {day.workUnits} công
                    </div>
                    <div className="text-[10px] text-amber-700 font-mono font-medium">
                      {day.otHours > 0 ? `+${day.otHours}h` : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Details Table */}
          <div className="border border-slate-300 rounded overflow-hidden mb-3">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#0f3d64] text-white">
                  <th className="py-2 px-3 font-semibold uppercase tracking-wider text-[11px] w-12 text-center">
                    STT
                  </th>
                  <th className="py-2 px-3 font-semibold uppercase tracking-wider text-[11px]">
                    NỘI DUNG THANH TOÁN
                  </th>
                  <th className="py-2 px-3 text-center font-semibold uppercase tracking-wider text-[11px] w-32">
                    SỐ LƯỢNG
                  </th>
                  <th className="py-2 px-3 text-right font-semibold uppercase tracking-wider text-[11px] w-48">
                    SỐ LIỆU / THÀNH TIỀN (VNĐ)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Group A */}
                <tr className="bg-sky-100/90 font-bold text-sky-950 border-b border-sky-200">
                  <td className="py-1.5 px-3 text-center">A</td>
                  <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]" colSpan={2}>
                    SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO
                  </td>
                  <td className="py-1.5 px-3 text-right text-[10.5px] font-semibold text-sky-900">
                    THỐNG KÊ
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-center text-slate-500">1</td>
                  <td className="py-1 px-3 pl-6 text-slate-700">
                    Số ngày công đi làm thực tế
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-slate-700">
                    {worker.actualWorkDays} ngày
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-[#0f3d64]">
                    {worker.actualWorkDays} công
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-center text-slate-500">2</td>
                  <td className="py-1 px-3 pl-6 text-slate-700">
                    Số giờ làm thêm / tăng ca công trình (OT hệ số 150%)
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-slate-700">
                    {worker.overtimeHours} giờ
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-amber-700">
                    {worker.overtimeHours > 0 ? `${worker.overtimeHours} giờ OT` : '—'}
                  </td>
                </tr>

                {/* Group B */}
                <tr className="bg-sky-50 font-bold text-sky-950">
                  <td className="py-1.5 px-3 text-center">B</td>
                  <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]" colSpan={2}>
                    CÁC KHOẢN TIỀN CÔNG VÀ THU NHẬP
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-sky-950">
                    {formatNumberOnly(worker.totalIncome)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-center text-slate-500">3</td>
                  <td className="py-1 px-3 pl-6 text-slate-700">
                    Lương theo đơn giá ngày công ({worker.actualWorkDays} ngày × {formatNumberOnly(worker.dailyRate)} đ/ngày)
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-slate-700">
                    {worker.actualWorkDays} công
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-slate-800">
                    {formatNumberOnly(worker.salaryByDays)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-center text-slate-500">4</td>
                  <td className="py-1 px-3 pl-6 text-slate-700">
                    Tiền làm thêm giờ công trình ({worker.overtimeHours} giờ × hệ số 150%)
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-slate-700">
                    {worker.overtimeHours} giờ
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-amber-700">
                    {formatNumberOnly(worker.overtimePay)}
                  </td>
                </tr>
                {worker.mealAllowance > 0 && (
                  <tr>
                    <td className="py-1 px-3 text-center text-slate-500">5</td>
                    <td className="py-1 px-3 pl-6 text-slate-700">
                      Phụ cấp tiền ăn ca / ăn trưa tại công trường
                    </td>
                    <td className="py-1 px-3 text-center text-slate-400">—</td>
                    <td className="py-1 px-3 text-right font-mono text-slate-800">
                      {formatNumberOnly(worker.mealAllowance)}
                    </td>
                  </tr>
                )}
                {worker.travelSafetyAllowance > 0 && (
                  <tr>
                    <td className="py-1 px-3 text-center text-slate-500">6</td>
                    <td className="py-1 px-3 pl-6 text-slate-700">
                      Phụ cấp xăng xe / Độc hại / An toàn lao động
                    </td>
                    <td className="py-1 px-3 text-center text-slate-400">—</td>
                    <td className="py-1 px-3 text-right font-mono text-slate-800">
                      {formatNumberOnly(worker.travelSafetyAllowance)}
                    </td>
                  </tr>
                )}
                {worker.otherBonus > 0 && (
                  <tr>
                    <td className="py-1 px-3 text-center text-slate-500">7</td>
                    <td className="py-1 px-3 pl-6 text-slate-700">
                      Thưởng chuyên cần / Vượt tiến độ thi công
                    </td>
                    <td className="py-1 px-3 text-center text-slate-400">—</td>
                    <td className="py-1 px-3 text-right font-mono text-slate-800">
                      {formatNumberOnly(worker.otherBonus)}
                    </td>
                  </tr>
                )}
                <tr className="font-semibold bg-slate-50">
                  <td className="py-1 px-3 text-center"></td>
                  <td className="py-1 px-3 pl-6 text-slate-900" colSpan={2}>
                    Tổng thu nhập (B)
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-sky-900">
                    {formatNumberOnly(worker.totalIncome)}
                  </td>
                </tr>

                {/* Group C */}
                <tr className="bg-amber-50 font-bold text-amber-950">
                  <td className="py-1.5 px-3 text-center">C</td>
                  <td className="py-1.5 px-3 uppercase tracking-wide text-[11px]" colSpan={2}>
                    CÁC KHOẢN GIẢM TRỪ VÀ KHẤU TRỪ
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-950">
                    {formatNumberOnly(worker.totalDeductions)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 px-3 text-center text-slate-500">8</td>
                  <td className="py-1 px-3 pl-6 text-slate-700">
                    <div>Thuế TNCN khấu trừ 10% theo Thông tư 111/2013/TT-BTC</div>
                    {worker.hasTaxCommitment ? (
                      <span className="text-[10.5px] text-emerald-700 font-medium">
                        ✓ Đã có Cam kết Mẫu 08/CK-TNCN (Miễn trừ thuế)
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-rose-700 font-medium">
                        Khấu trừ 10% tại nguồn
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-3 text-center font-mono text-slate-700">
                    {worker.hasTaxCommitment ? 'Miễn' : '10%'}
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-semibold text-rose-700">
                    {formatNumberOnly(worker.personalIncomeTax)}
                  </td>
                </tr>
                {worker.advancePayment > 0 && (
                  <tr>
                    <td className="py-1 px-3 text-center text-slate-500">9</td>
                    <td className="py-1 px-3 pl-6 text-slate-700">
                      Tạm ứng tiền mặt tại công trường trong kỳ
                    </td>
                    <td className="py-1 px-3 text-center text-slate-400">—</td>
                    <td className="py-1 px-3 text-right font-mono font-semibold text-amber-800">
                      {formatNumberOnly(worker.advancePayment)}
                    </td>
                  </tr>
                )}
                <tr className="font-semibold bg-slate-50">
                  <td className="py-1 px-3 text-center"></td>
                  <td className="py-1 px-3 pl-6 text-slate-900" colSpan={2}>
                    Tổng các khoản khấu trừ (C)
                  </td>
                  <td className="py-1 px-3 text-right font-mono font-bold text-amber-900">
                    {formatNumberOnly(worker.totalDeductions)}
                  </td>
                </tr>

                {/* THỰC LĨNH */}
                <tr className="bg-[#14532d] text-white font-bold text-[13.5px]">
                  <td className="py-2.5 px-3 text-center">★</td>
                  <td className="py-2.5 px-3 pl-4 uppercase tracking-wide" colSpan={2}>
                    THỰC LĨNH CHI TRẢ (B - C)
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-lg text-emerald-100 font-black">
                    {formatNumberOnly(worker.netSalary)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Số tiền bằng chữ */}
          <div className="mb-2.5 text-[12px]">
            <span className="font-bold text-slate-800">Số tiền bằng chữ: </span>
            <span className="italic text-slate-700">
              {numberToVietnameseWords(worker.netSalary)}
            </span>
          </div>

          {/* QR VietQR nếu chuyển khoản */}
          {qrUrl && (
            <div className="mb-3.5 p-3 bg-sky-50 border border-sky-200 rounded flex items-center justify-between">
              <div className="flex items-center gap-3">
                <QrCode className="w-8 h-8 text-[#0f3d64] shrink-0" />
                <div>
                  <h4 className="font-bold text-[#0f3d64] text-xs uppercase">Mã QR VietQR chuyển khoản nhanh</h4>
                  <p className="text-[11.5px] text-slate-700">
                    Ngân hàng: <strong className="text-slate-900">{worker.bankName}</strong> — STK: <strong className="font-mono text-slate-900">{worker.bankAccount}</strong> ({worker.fullName})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Số tiền thanh toán: <strong className="text-emerald-700 font-mono">{formatNumberOnly(worker.netSalary)} đ</strong>
                  </p>
                </div>
              </div>
              <img
                src={qrUrl}
                alt="VietQR"
                className="w-20 h-20 object-contain rounded border border-slate-200 bg-white p-1"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          {/* Chữ ký chuẩn phiếu lương */}
          <div className="pt-1">
            <div className="text-right text-[11px] italic text-slate-600 mb-2">
              Tp. Hồ Chí Minh, ngày {new Date().getDate().toString().padStart(2, '0')} tháng {(new Date().getMonth() + 1).toString().padStart(2, '0')} năm {new Date().getFullYear()}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-[12px]">
              <div>
                <div className="font-bold uppercase text-slate-800">Người lập biểu</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, họ tên)</div>
                <div className="h-14 flex items-end justify-center font-medium text-slate-700">
                  Nguyễn Thanh Thúy
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-800">Chỉ huy trưởng</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, họ tên)</div>
                <div className="h-14 flex items-end justify-center font-medium text-slate-700">
                  {worker.teamLeader || 'KS. Trần Văn Minh'}
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-800">Kế toán thanh toán</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, họ tên)</div>
                <div className="h-14 flex items-end justify-center font-medium text-slate-700">
                  Đặng Bích Ngọc
                </div>
              </div>
              <div>
                <div className="font-bold uppercase text-slate-800">Người nhận tiền</div>
                <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, ghi rõ họ tên)</div>
                <div className="h-14 flex items-end justify-center font-bold text-slate-900">
                  {worker.fullName}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Cố Định ở đáy */}
        <div className="no-print shrink-0 p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-slate-600 flex items-center gap-1.5">
            <span>Mẹo: Nhấn</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-slate-800 font-mono font-bold text-[10.5px]">Esc</kbd>
            <span>hoặc bấm ra ngoài vùng tối để đóng</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <X className="w-4 h-4" />
            <span>Đóng lại (Thoát)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
