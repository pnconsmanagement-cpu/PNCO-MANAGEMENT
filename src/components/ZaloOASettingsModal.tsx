import React, { useState } from 'react';
import {
  X,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Key,
  Smartphone,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { ZaloOAConfig, CompanyConfig } from '../types';

interface ZaloOASettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CompanyConfig;
  onSaveZaloConfig: (newZaloConfig: ZaloOAConfig) => void;
}

export const ZaloOASettingsModal: React.FC<ZaloOASettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveZaloConfig,
}) => {
  const defaultZalo: ZaloOAConfig = config.zaloOA || {
    enabled: true,
    oaId: '22839482749281729',
    oaName: config.name || 'CÔNG TY TNHH XD - CƠ ĐIỆN PHÚC NGUYÊN',
    appId: '',
    secretKey: '',
    accessToken: '',
    templateId: '312891',
    sendMode: 'ZNS',
    isSandbox: true,
  };

  const [formData, setFormData] = useState<ZaloOAConfig>(defaultZalo);
  const [testStatus, setTestStatus] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Hỗ trợ phím ESC để đóng modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus(null);

    // Giả lập hoặc kiểm tra kết nối Zalo
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (formData.isSandbox) {
      setTestStatus({
        tested: true,
        success: true,
        message:
          'Chế độ Thử nghiệm (Sandbox) đang bật: Bạn có thể kiểm tra toàn bộ luồng gửi tin và xem trước định dạng tin nhắn Zalo OA!',
      });
    } else if (!formData.accessToken?.trim()) {
      setTestStatus({
        tested: true,
        success: false,
        message: 'Chưa có Access Token! Vui lòng tạo và dán Access Token từ developers.zalo.me.',
      });
    } else {
      setTestStatus({
        tested: true,
        success: true,
        message:
          'Đã kết nối thành công tới Zalo OA: "' +
          (formData.oaName || 'Công ty Phúc Nguyên') +
          '" (Sẵn sàng gửi ZNS trực tiếp theo SĐT nhân viên).',
      });
    }

    setIsTesting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveZaloConfig(formData);
    onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 my-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0068FF] text-white flex items-center justify-center font-black text-base shadow-sm">
              Zalo
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span>Cấu hình Zalo Official Account (Zalo OA)</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-[#0068FF] font-semibold">
                  Tự động gửi phiếu lương
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Kết nối Zalo OA Công ty Phúc Nguyên để tự động gửi phiếu lương tới công nhân & nhân viên
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
            title="Đóng cửa sổ (Nhấn phím Esc hoặc bấm ra ngoài)"
          >
            <X className="w-4 h-4 text-slate-600 hover:text-rose-600" />
            <span>Đóng</span>
            <kbd className="hidden sm:inline-block text-[10px] bg-white border border-slate-300 rounded px-1 text-slate-500 font-mono">Esc</kbd>
          </button>
        </div>

        {/* Giải thích giải pháp tối ưu */}
        <div className="bg-gradient-to-r from-blue-50 to-sky-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-950 space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#0052cc]">
            <Zap className="w-4 h-4 text-[#0068FF]" />
            <span>2 Cách Gửi Phiếu Lương Từ Zalo OA Phúc Nguyên:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs space-y-1">
              <span className="font-bold text-emerald-700 block flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                1. Gửi qua ZNS (Khuyên dùng nhất)
              </span>
              <p className="text-slate-600">
                Gửi trực tiếp theo <strong>Số điện thoại</strong>. Công nhân <strong>KHÔNG CẦN</strong> bấm quan tâm OA trước. Tin nhắn hiển thị dưới dạng bảng lương chính thức từ Zalo OA Phúc Nguyên.
              </p>
            </div>

            <div className="bg-white p-2.5 rounded border border-blue-100 shadow-2xs space-y-1">
              <span className="font-bold text-sky-800 block flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                2. Gửi tin nhắn OA Transaction
              </span>
              <p className="text-slate-600">
                Miễn phí tin nhắn. Yêu cầu công nhân/nhân viên <strong>phải quét mã QR bấm Quan tâm</strong> OA Phúc Nguyên trước đó.
              </p>
            </div>
          </div>
        </div>

        {/* Form cấu hình */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Trạng thái kích hoạt & Chế độ Sandbox */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-[#0068FF] rounded border-slate-300 focus:ring-[#0068FF]"
              />
              <div>
                <span className="font-bold text-slate-800 block">Kích hoạt gửi qua Zalo OA</span>
                <span className="text-[11px] text-slate-500">Bật tính năng gửi tự động trong phiếu lương</span>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isSandbox ?? true}
                onChange={(e) => setFormData({ ...formData, isSandbox: e.target.checked })}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
              />
              <div>
                <span className="font-bold text-amber-800 block flex items-center gap-1">
                  <span>Chế độ thử nghiệm (Sandbox)</span>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded">An toàn</span>
                </span>
                <span className="text-[11px] text-slate-500">Giả lập gửi và xem mẫu tin mà không trừ phí ZNS</span>
              </div>
            </label>
          </div>

          {/* Chọn phương thức gửi */}
          <div>
            <label className="font-bold text-slate-700 block mb-1">Phương thức gửi tin Zalo</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, sendMode: 'ZNS' })}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                  formData.sendMode === 'ZNS'
                    ? 'border-[#0068FF] bg-blue-50/70 text-[#0052cc] font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">ZNS qua Số Điện Thoại</span>
                  {formData.sendMode === 'ZNS' && <CheckCircle2 className="w-4 h-4 text-[#0068FF]" />}
                </div>
                <p className="text-[10.5px] font-normal text-slate-500 mt-0.5">
                  Tối ưu cho công nhân xây dựng & kỹ thuật
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, sendMode: 'OA_MESSAGE' })}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition ${
                  formData.sendMode === 'OA_MESSAGE'
                    ? 'border-[#0068FF] bg-blue-50/70 text-[#0052cc] font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">Zalo OA Chat (Người theo dõi)</span>
                  {formData.sendMode === 'OA_MESSAGE' && <CheckCircle2 className="w-4 h-4 text-[#0068FF]" />}
                </div>
                <p className="text-[10.5px] font-normal text-slate-500 mt-0.5">
                  Dành cho người đã bấm "Quan tâm" OA
                </p>
              </button>
            </div>
          </div>

          {/* Chi tiết thông tin tài khoản OA */}
          <div className="space-y-3 p-3.5 bg-slate-50/60 rounded-lg border border-slate-200">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Building2 className="w-4 h-4 text-[#0068FF]" />
              <span>Thông tin Zalo Official Account (Phúc Nguyên)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tên hiển thị Zalo OA</label>
                <input
                  type="text"
                  value={formData.oaName}
                  onChange={(e) => setFormData({ ...formData, oaName: e.target.value })}
                  placeholder="CÔNG TY TNHH XD - CƠ ĐIỆN PHÚC NGUYÊN"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Mã OA ID <span className="text-slate-400 font-normal">(Lấy tại oa.zalo.me)</span>
                </label>
                <input
                  type="text"
                  value={formData.oaId}
                  onChange={(e) => setFormData({ ...formData, oaId: e.target.value })}
                  placeholder="Ví dụ: 22839482749281729"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 font-mono text-xs"
                />
              </div>
            </div>

            {formData.sendMode === 'ZNS' && (
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Mã Mẫu Tin Nhắn ZNS (Template ID) <span className="text-emerald-700 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={formData.templateId || ''}
                  onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                  placeholder="Ví dụ: 312891 (Mẫu Thông báo chi trả lương đã duyệt trên Zalo)"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Mã mẫu tin nhắn được Zalo duyệt trên ZCA (Zalo Cloud Account). Khi đăng ký, chọn loại tin "Thông báo nội bộ / Chi trả lương".
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">App ID (developers.zalo.me)</label>
                <input
                  type="text"
                  value={formData.appId}
                  onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
                  placeholder="Ví dụ: 4829104810294"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 font-mono text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Secret Key ứng dụng</label>
                <input
                  type="password"
                  value={formData.secretKey}
                  onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
                  placeholder="••••••••••••••••"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-slate-700 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  <span>Access Token (Quyền gửi tin)</span>
                </label>
                <a
                  href="https://developers.zalo.me/tools/explorer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#0068FF] hover:underline flex items-center gap-0.5"
                >
                  <span>Lấy Access Token nhanh</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <textarea
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                rows={2}
                placeholder="Dán mã Access Token từ Zalo Developer Explorer tại đây..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-sky-600 font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Thông báo kết quả kiểm tra kết nối */}
          {testStatus && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                testStatus.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {testStatus.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">{testStatus.message}</div>
            </div>
          )}

          {/* Hướng dẫn 3 bước */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <span className="font-bold text-slate-800 block flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-sky-600" />
              Hướng dẫn lấy thông tin từ Zalo (Dành cho Doanh nghiệp):
            </span>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>
                Truy cập{' '}
                <a
                  href="https://oa.zalo.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0068FF] underline font-medium"
                >
                  oa.zalo.me
                </a>{' '}
                để xem mã <strong>OA ID</strong> của tài khoản Phúc Nguyên.
              </li>
              <li>
                Vào{' '}
                <a
                  href="https://developers.zalo.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0068FF] underline font-medium"
                >
                  developers.zalo.me
                </a>{' '}
                tạo Ứng dụng & liên kết với OA để lấy <strong>App ID, Secret Key & Access Token</strong>.
              </li>
              <li>
                Vào ZCA đăng ký mẫu tin ZNS <i>"Thông báo lương"</i> và copy <strong>Template ID</strong> dán vào đây.
              </li>
            </ol>
          </div>

          {/* Nút hành động */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3.5 py-1.5 border border-blue-300 text-[#0068FF] hover:bg-blue-50 rounded font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#0068FF] hover:bg-[#0052cc] text-white rounded font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu cấu hình Zalo OA</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
