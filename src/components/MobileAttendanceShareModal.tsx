import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Smartphone,
  QrCode,
  Copy,
  Check,
  ExternalLink,
  Share2,
  HardHat,
  Send,
  Download,
  Printer,
  Cloud,
  CheckCircle2,
  Info,
  Calendar,
  Building,
  UserCheck,
} from 'lucide-react';
import { SeasonalWorker, CompanyConfig } from '../types';
import {
  generateShareableAttendanceUrl,
  generateZaloShareMessage,
} from '../utils/seasonalAttendanceHelper';
import { isSupabaseConfigured } from '../services/supabaseService';

interface MobileAttendanceShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: SeasonalWorker[];
  config: CompanyConfig;
  selectedWorkerId?: string | null;
  onOpenMobileView?: (workerCode?: string) => void;
}

export const MobileAttendanceShareModal: React.FC<MobileAttendanceShareModalProps> = ({
  isOpen,
  onClose,
  workers,
  config,
  selectedWorkerId,
  onOpenMobileView,
}) => {
  const [shareMode, setShareMode] = useState<'SPECIFIC' | 'GENERAL'>('SPECIFIC');
  const [currentWorkerId, setCurrentWorkerId] = useState<string>(() => {
    if (selectedWorkerId) return selectedWorkerId;
    return workers[0]?.id ? String(workers[0].id) : '';
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cập nhật khi selectedWorkerId thay đổi
  useEffect(() => {
    if (selectedWorkerId) {
      setCurrentWorkerId(selectedWorkerId);
      setShareMode('SPECIFIC');
    }
  }, [selectedWorkerId]);

  const activeWorker = workers.find((w) => String(w.id) === String(currentWorkerId)) || workers[0];

  const currentMonth = config.month || 9;
  const currentYear = config.year || 2026;

  // Sinh đường dẫn URL chia sẻ công khai
  const shareUrl = React.useMemo(() => {
    const workerCode = shareMode === 'SPECIFIC' && activeWorker ? activeWorker.code : undefined;
    return generateShareableAttendanceUrl(workerCode, {
      month: currentMonth,
      year: currentYear,
      includeConfig: true,
    });
  }, [shareMode, activeWorker, currentMonth, currentYear]);

  // URL kiểm tra trực tiếp trên trình duyệt hiện tại (nếu đang ở localhost hoặc dev)
  const localTestUrl = React.useMemo(() => {
    const workerCode = shareMode === 'SPECIFIC' && activeWorker ? activeWorker.code : undefined;
    const curOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
    return generateShareableAttendanceUrl(workerCode, {
      month: currentMonth,
      year: currentYear,
      includeConfig: true,
      forceOrigin: curOrigin,
    });
  }, [shareMode, activeWorker, currentMonth, currentYear]);

  // Tạo mã QR Code
  useEffect(() => {
    if (!shareUrl) return;
    QRCode.toDataURL(shareUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR code generation error:', err);
      });
  }, [shareUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleCopyZaloMessage = () => {
    if (!activeWorker) return;
    const msg = generateZaloShareMessage(activeWorker, currentMonth, currentYear, shareUrl);
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2500);
    });
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const name = shareMode === 'SPECIFIC' && activeWorker ? activeWorker.code : 'PNCONS_TOI_THO';
    a.download = `QR_Cham_Cong_${name}_T${currentMonth}_${currentYear}.png`;
    a.click();
  };

  const handlePrintQr = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const workerTitle =
      shareMode === 'SPECIFIC' && activeWorker
        ? `${activeWorker.fullName} (${activeWorker.code}) - ${activeWorker.trade}`
        : 'TẤT CẢ CÔNG NHÂN THỜI VỤ & KỸ THUẬT';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Mã QR Chấm Công - ${activeWorker?.fullName || 'PNCONS'}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: Arial, sans-serif; text-align: center; color: #1e293b; padding: 20px; }
            .card { border: 2px solid #0284c7; border-radius: 16px; padding: 30px; max-width: 500px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            .header { font-size: 13px; font-weight: bold; color: #0284c7; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 5px; }
            .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 10px 0; }
            .subtitle { font-size: 15px; color: #475569; margin-bottom: 20px; }
            .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 9999px; font-weight: bold; font-size: 14px; margin-bottom: 20px; }
            .qr-wrapper { margin: 20px 0; }
            .qr-img { width: 240px; height: 240px; border-radius: 12px; border: 1px solid #cbd5e1; }
            .instruction { background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 10px; padding: 15px; font-size: 13px; text-align: left; line-height: 1.6; color: #334155; margin-top: 20px; }
            .instruction ol { margin: 0; padding-left: 20px; }
            .footer { margin-top: 25px; font-size: 12px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">${config.name || 'CÔNG TY TNHH TV TK XD PHÚC NGUYÊN'}</div>
            <h1 class="title">BẢNG CHẤM CÔNG DI ĐỘNG</h1>
            <div class="subtitle">Tháng ${currentMonth < 10 ? '0' + currentMonth : currentMonth}/${currentYear}</div>
            <div class="badge">${workerTitle}</div>
            
            <div class="qr-wrapper">
              <img src="${qrDataUrl}" class="qr-img" alt="QR Code" />
            </div>

            <div class="instruction">
              <strong>HƯỚNG DẪN DÀNH CHO CÔNG NHÂN:</strong>
              <ol>
                <li>Mở Camera điện thoại hoặc Zalo quét mã QR ở trên.</li>
                <li>Chạm vào từng ngày để chấm công đi làm (1 công / nửa ca) và giờ làm thêm OT.</li>
                <li>Bấm <strong>"Xác nhận & Lưu"</strong>, dữ liệu tự động gửi về máy tính quản lý.</li>
              </ol>
            </div>

            <div class="footer">
              Hệ thống Quản lý Chấm công & Tiền lương PNCONS • Quét nhanh - Không cần cài app
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleTestInsideApp = () => {
    if (onOpenMobileView) {
      onClose();
      onOpenMobileView(shareMode === 'SPECIFIC' && activeWorker ? activeWorker.code : undefined);
    }
  };

  const handleOpenNewTab = () => {
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                Tạo Link & Mã QR Chấm Công Điện Thoại
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40">
                  Tự động đồng bộ
                </span>
              </h2>
              <p className="text-xs text-blue-100">
                Gửi link riêng cho thợ chấm trên điện thoại - Dữ liệu đưa ngay về phần mềm
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Alert */}
          <div className="flex items-start gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
            <Cloud className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-blue-800">Cơ chế đồng bộ tự động 100%: </span>
              Khi công nhân mở link và chấm công trên smartphone, dữ liệu sẽ được lưu tự động và đưa ngay về phần mềm qua{' '}
              <strong className="text-blue-900">
                {isSupabaseConfigured() ? 'Supabase Cloud Realtime' : 'Bộ nhớ đồng bộ trực tuyến'}
              </strong>
              . Bạn có thể theo dõi số công và giờ tăng ca thay đổi ngay trên màn hình.
            </div>
          </div>

          {/* Chọn chế độ Link */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              1. Chọn đối tượng áp dụng link:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShareMode('SPECIFIC')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  shareMode === 'SPECIFIC'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                    shareMode === 'SPECIFIC' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {shareMode === 'SPECIFIC' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <div>
                  <div className="font-bold text-sm">Link riêng từng công nhân</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Mở ra đúng tên và bảng lịch của thợ đó (không cần tìm kiếm).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShareMode('GENERAL')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  shareMode === 'GENERAL'
                    ? 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                    shareMode === 'GENERAL' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {shareMode === 'GENERAL' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
                <div>
                  <div className="font-bold text-sm">Link chung toàn công trình</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Dành cho tổ trưởng hoặc thợ tự chọn tên mình từ danh sách.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Chọn nhân viên nếu ở chế độ SPECIFIC */}
          {shareMode === 'SPECIFIC' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700">
                  Chọn công nhân nhận link:
                </label>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                  Tổng {workers.length} nhân sự
                </span>
              </div>
              <select
                value={currentWorkerId}
                onChange={(e) => setCurrentWorkerId(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {workers.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.code} - {w.fullName} ({w.trade || 'Thợ thi công'} - {w.project || 'Dự án'})
                  </option>
                ))}
              </select>

              {activeWorker && (
                <div className="flex items-center gap-3 pt-2 text-xs text-slate-600 border-t border-slate-200/80 mt-2">
                  <div className="flex items-center gap-1">
                    <HardHat className="w-3.5 h-3.5 text-amber-600" />
                    <span>{activeWorker.trade}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-blue-600" />
                    <span>{activeWorker.project}</span>
                  </div>
                  <div className="ml-auto font-semibold text-slate-600">
                    Mã thợ: <span className="font-mono text-blue-700 font-bold">{activeWorker.code}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Khối hiển thị Mã QR và Link */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center bg-slate-50/80 p-5 rounded-2xl border border-slate-200">
            {/* Mã QR */}
            <div className="sm:col-span-5 flex flex-col items-center">
              <div className="p-2.5 bg-white rounded-2xl shadow-md border border-slate-200 flex items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code Chấm Công"
                    className="w-48 h-48 sm:w-52 sm:h-52 rounded-xl object-contain"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                    Đang tạo mã QR...
                  </div>
                )}
              </div>
              <div className="text-[11px] text-slate-500 text-center mt-2 flex items-center gap-1 font-medium">
                <QrCode className="w-3.5 h-3.5 text-slate-600" />
                Quét bằng Camera điện thoại hoặc Zalo
              </div>

              {/* Nút hành động QR */}
              <div className="flex items-center gap-2 mt-3 w-full justify-center">
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                  title="Tải ảnh QR về máy"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  Tải ảnh QR
                </button>
                <button
                  type="button"
                  onClick={handlePrintQr}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
                  title="In mã QR dán công trường"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  In poster dán
                </button>
              </div>
            </div>

            {/* Thông tin Link & Các thao tác gửi */}
            <div className="sm:col-span-7 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Đường dẫn Web App Chấm Công:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 select-all focus:outline-none focus:ring-1 focus:ring-blue-500 truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 ${
                      copied
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Đã chép!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Sao chép
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Thao tác chia sẻ */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyZaloMessage}
                  className="w-full px-3.5 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedMsg ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Đã sao chép nội dung tin nhắn Zalo!</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-blue-600" />
                      Sao chép tin nhắn Zalo kèm link gửi thợ
                    </>
                  )}
                </button>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleTestInsideApp}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-emerald-200" />
                    <span>Mở Chấm Công Ngay Cho {activeWorker?.fullName || 'Thợ'} (Trực tiếp)</span>
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={localTestUrl || shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full px-3 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs text-center cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 text-blue-600" />
                      <span>Mở Link Tab Mới</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="w-full px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Copy className="w-4 h-4 text-blue-600" />
                      <span>{copied ? 'Đã sao chép!' : 'Sao chép link'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-normal bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-200/80 text-emerald-950">
                ✅ <strong>Link công khai chuẩn Cloud Run:</strong> Điện thoại của thợ mở trực tiếp không cần đăng nhập Google, không bị lỗi trang 404.
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Hệ thống sẵn sàng nhận dữ liệu chấm công từ điện thoại
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-xs rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
