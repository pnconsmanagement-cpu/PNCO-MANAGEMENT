import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  X,
  User,
  AlertCircle,
  CheckCircle2,
  Phone,
  MessageSquare,
  Image as ImageIcon,
  Smartphone,
  Info,
  Zap,
  Settings,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { Employee, CompanyConfig } from '../types';
import { formatVND, numberToVietnameseWords } from '../utils/numberToVietnameseWords';
import { copyToClipboard } from '../utils/clipboard';
import { sendPayslipViaZaloOA, ZaloSendResult } from '../services/zaloOAService';

interface SendPayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  config: CompanyConfig;
  initialChannel?: 'ZALO' | 'EMAIL';
  onUpdateEmployeeContact?: (employeeId: string, updates: { email?: string; phone?: string }) => void;
  onUpdateEmployeeEmail?: (employeeId: string, newEmail: string) => void;
  onOpenZaloSettings?: () => void;
}

export const SendPayslipModal: React.FC<SendPayslipModalProps> = ({
  isOpen,
  onClose,
  employee,
  config,
  initialChannel,
  onUpdateEmployeeContact,
  onUpdateEmployeeEmail,
  onOpenZaloSettings,
}) => {
  // Determine if employee is a worker/technical staff (often prefers Zalo)
  const isWorkerOrField =
    !employee.email ||
    employee.department.toLowerCase().includes('xây dựng') ||
    employee.department.toLowerCase().includes('xưởng') ||
    employee.department.toLowerCase().includes('cơ điện') ||
    employee.title.toLowerCase().includes('công nhân') ||
    employee.title.toLowerCase().includes('thợ') ||
    employee.title.toLowerCase().includes('tài xế') ||
    employee.title.toLowerCase().includes('lái xe') ||
    employee.title.toLowerCase().includes('phụ kho');

  const [activeChannel, setActiveChannel] = useState<'ZALO' | 'EMAIL'>(
    initialChannel || (isWorkerOrField ? 'ZALO' : 'EMAIL')
  );

  const [recipientEmail, setRecipientEmail] = useState(employee.email || '');
  const [recipientPhone, setRecipientPhone] = useState(employee.phone || '');
  const [isCopiedZalo, setIsCopiedZalo] = useState(false);
  const [isCopiedEmail, setIsCopiedEmail] = useState(false);
  const [isCapturingImage, setIsCapturingImage] = useState(false);
  const [imageCapturedSuccess, setImageCapturedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSendingZaloOA, setIsSendingZaloOA] = useState(false);
  const [zaloOAResult, setZaloOAResult] = useState<ZaloSendResult | null>(null);

  // Parse Month and Year
  const periodStr = config.period || '';
  const monthMatch = periodStr.match(/tháng\s*(\d+)/i);
  const yearMatch = periodStr.match(/năm\s*(\d+)/i);
  const currentMonth = monthMatch ? monthMatch[1].padStart(2, '0') : '09';
  const currentYear = yearMatch ? yearMatch[1] : '2026';

  // Clean phone number for Zalo link (strip non-digits)
  const cleanPhone = (recipientPhone || '').replace(/[^0-9]/g, '');

  // Reset state on employee change or modal open
  useEffect(() => {
    setRecipientEmail(employee.email || '');
    setRecipientPhone(employee.phone || '');
    setIsCopiedZalo(false);
    setIsCopiedEmail(false);
    setImageCapturedSuccess(false);
    setStatusMessage(null);
    setZaloOAResult(null);
    if (initialChannel) {
      setActiveChannel(initialChannel);
    } else {
      setActiveChannel(isWorkerOrField ? 'ZALO' : 'EMAIL');
    }
  }, [employee, isOpen, initialChannel, isWorkerOrField]);

  // Hỗ trợ phím ESC để đóng modal bất kỳ lúc nào
  useEffect(() => {
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

  // ----------------------------------------------------
  // NỘI DUNG ZALO (TỐI ƯU CHO MÀN HÌNH DI ĐỘNG & CHAT APP)
  // ----------------------------------------------------
  const zaloMessage = `🏢 THÔNG BÁO PHIẾU LƯƠNG THÁNG ${currentMonth}/${currentYear}
----------------------------------------
Kính gửi: ${employee.fullName}
🔖 Mã NV: ${employee.code}
💼 Chức danh: ${employee.title} (${employee.department})

💰 LƯƠNG THỰC LĨNH: ${formatVND(employee.netSalary)}
(Bằng chữ: ${numberToVietnameseWords(employee.netSalary)})

📋 THÔNG TIN CÔNG TÁC & THU NHẬP:
• Ngày công chuẩn: ${employee.standardWorkDays} ngày
• Ngày công đi làm: ${employee.actualWorkDays} ngày
• Giờ làm thêm (OT 150%): ${employee.overtimeHours || 0} giờ
• ${employee.salaryType === 'DAILY' ? `Lương theo ngày công (${employee.actualWorkDays}c × ${formatVND(employee.baseSalary)}/ngày)` : `Lương theo ngày công (${formatVND(employee.baseSalary)}/26 × ${employee.actualWorkDays}c)`}: ${formatVND(employee.salaryByActualDays)}
• Phụ cấp ăn trưa: ${formatVND(employee.mealAllowance || 0)}
• Phụ cấp xăng xe, đi lại: ${formatVND(employee.phoneTravelAllowance || 0)}
• Phụ cấp trách nhiệm: ${formatVND(employee.responsibilityAllowance || 0)}
${employee.projectAllowance ? `• Phụ cấp dự án: ${formatVND(employee.projectAllowance)}\n` : ''}• Tiền làm thêm giờ (OT 1.5x): ${formatVND(employee.overtimePay || 0)}
• Thưởng / Thu nhập khác: ${formatVND((employee.kpiBonus || 0) + (employee.otherIncome || 0))}
=> TỔNG THU NHẬP (A): ${formatVND(employee.totalIncome)}

📉 CÁC KHOẢN KHẤU TRỪ:
• Đóng bảo hiểm bắt buộc (10.5%): ${formatVND(employee.totalInsurance)}
• Đoàn phí công đoàn: ${formatVND(employee.unionFee || 0)}
• Tạm ứng trong kỳ: ${formatVND(employee.advancePayment || 0)}
=> TỔNG KHẤU TRỪ (B): ${formatVND(employee.totalDeductions)}

🏦 THÔNG TIN CHI TRẢ:
• Số tài khoản: ${employee.bankAccount || 'Tiền mặt / Đang cập nhật'}
• Ngân hàng: ${employee.bankName || 'Ngân hàng'}
• Ngày chi trả dự kiến: ${config.paymentDate}
----------------------------------------
Anh/chị vui lòng kiểm tra chi tiết. Nếu có thắc mắc, vui lòng phản hồi lại tin nhắn này hoặc liên hệ Kế toán / Ban Chỉ Huy.
Chúc anh/chị nhiều sức khỏe và công tác an toàn!`;

  // ----------------------------------------------------
  // NỘI DUNG EMAIL (ĐẦY ĐỦ VĂN BẢN TRUYỀN THỐNG)
  // ----------------------------------------------------
  const emailSubject = `Phiếu Lương Tháng ${currentMonth} Năm ${currentYear} - ${employee.fullName} (${employee.code})`;
  const emailBody = `Gửi Nhân Viên : ${employee.code}
Họ Và Tên Nhân Viên : ${employee.fullName}
Lương Thực nhận của bạn là : ${formatVND(employee.netSalary)}
(Bằng chữ: ${numberToVietnameseWords(employee.netSalary)})

--------------------------------------------------
CHI TIẾT PHIẾU LƯƠNG KỲ THÁNG ${currentMonth}/${currentYear}
Đơn vị: ${config.name}
Bộ phận: ${employee.department} - Chức danh: ${employee.title}

1. THÔNG TIN CÔNG TÁC & CHẤM CÔNG:
- Ngày công chuẩn: ${employee.standardWorkDays} ngày
- Ngày công thực tế: ${employee.actualWorkDays} ngày
- Nghỉ phép hưởng lương: ${employee.paidLeaveDays || 0} ngày
- Số giờ làm thêm (OT 150%): ${employee.overtimeHours || 0} giờ

2. CÁC KHOẢN THU NHẬP:
- ${employee.salaryType === 'DAILY' ? `Đơn giá lương theo ngày: ${formatVND(employee.baseSalary)}/ngày` : `Lương cơ bản theo HĐ: ${formatVND(employee.baseSalary)}`}
- ${employee.salaryType === 'DAILY' ? `Lương theo công thực tế (${employee.actualWorkDays} ngày × ${formatVND(employee.baseSalary)}/ngày)` : `Lương theo ngày công thực tế (${formatVND(employee.baseSalary)}/26 × ${employee.actualWorkDays} ngày)`}: ${formatVND(employee.salaryByActualDays)}
- Phụ cấp trách nhiệm: ${formatVND(employee.responsibilityAllowance || 0)}
${employee.projectAllowance ? `- Phụ cấp dự án: ${formatVND(employee.projectAllowance)}\n` : ''}- Phụ cấp ăn trưa: ${formatVND(employee.mealAllowance || 0)}
- Phụ cấp xăng xe, điện thoại: ${formatVND(employee.phoneTravelAllowance || 0)}
- Tiền làm thêm giờ (OT): ${formatVND(employee.overtimePay || 0)}
- Thưởng / Thu nhập khác: ${formatVND((employee.kpiBonus || 0) + (employee.otherIncome || 0))}
=> TỔNG THU NHẬP (A): ${formatVND(employee.totalIncome)}

3. CÁC KHOẢN KHẤU TRỪ:
- Đóng bảo hiểm bắt buộc (BHXH, BHYT, BHTN 10.5%): ${formatVND(employee.totalInsurance)}
- Đoàn phí công đoàn: ${formatVND(employee.unionFee || 0)}
- Tạm ứng trong kỳ: ${formatVND(employee.advancePayment || 0)}
=> TỔNG KHẤU TRỪ (B): ${formatVND(employee.totalDeductions)}

--------------------------------------------------
THỰC LĨNH CHUYỂN KHOẢN (A - B): ${formatVND(employee.netSalary)}
(Bằng chữ: ${numberToVietnameseWords(employee.netSalary)})

- Tài khoản chi trả: ${employee.bankAccount || 'Đang cập nhật'}
- Ngân hàng: ${employee.bankName || 'Ngân hàng'}
- Ngày chi trả dự kiến: ${config.paymentDate}
--------------------------------------------------

Nếu có bất kỳ thắc mắc nào về bảng tính lương, anh/chị vui lòng phản hồi lại email này hoặc liên hệ trực tiếp Bộ phận Kế toán.

Trân trọng,
${config.name}
`;

  // ----------------------------------------------------
  // HÀNH ĐỘNG ZALO & TIN NHẮN
  // ----------------------------------------------------

  // 1. Mở Chat Zalo (zalo.me)
  const handleOpenZaloChat = async () => {
    if (!cleanPhone) {
      alert('Vui lòng nhập số điện thoại của nhân viên để mở chat Zalo!');
      return;
    }
    // Save phone if modified
    handleSaveContact();

    // Sao chép trước khi mở cửa sổ mới để đảm bảo không bị gián đoạn quyền Clipboard
    const copied = await copyToClipboard(zaloMessage);
    if (copied) {
      setIsCopiedZalo(true);
      setStatusMessage('Đã mở Zalo & đã sao chép sẵn tin nhắn! Bạn chỉ cần nhấn Dán (Ctrl+V) vào Zalo.');
    } else {
      setStatusMessage('Đã mở Zalo. Bạn có thể nhấn nút "Sao chép tin nhắn" bên dưới để dán vào Zalo.');
    }

    // Mở trang zalo.me/09xxxxxxx
    const zaloUrl = `https://zalo.me/${cleanPhone}`;
    window.open(zaloUrl, '_blank', 'noopener,noreferrer');

    setTimeout(() => setStatusMessage(null), 6000);
  };

  // 2. Sao chép nội dung tin nhắn Zalo
  const handleCopyZaloMessage = async () => {
    const success = await copyToClipboard(zaloMessage);
    if (success) {
      setIsCopiedZalo(true);
      setStatusMessage('Đã sao chép tin nhắn Zalo! Bạn có thể dán (Ctrl+V) vào khung chat Zalo.');
      setTimeout(() => setIsCopiedZalo(false), 3000);
    } else {
      setStatusMessage('Bạn có thể bôi đen văn bản trong ô bên dưới và nhấn Ctrl+C để sao chép.');
    }
  };

  // 3. Tải ảnh Phiếu Lương (PNG) để gửi qua Zalo
  const handleDownloadPayslipImage = async () => {
    setIsCapturingImage(true);
    setStatusMessage('Đang xử lý tạo ảnh phiếu lương sắc nét...');
    try {
      const targetElement = document.getElementById(`payslip-${employee.code}`);
      if (!targetElement) {
        throw new Error('Không tìm thấy mẫu phiếu lương trên trang');
      }

      const canvas = await html2canvas(targetElement, {
        scale: 2, // 2x high resolution
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imageBlob = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imageBlob;
      link.download = `PhieuLuong_${employee.code}_Thang${currentMonth}_${currentYear}.png`;
      link.click();

      setImageCapturedSuccess(true);
      setStatusMessage('Đã tải ảnh phiếu lương thành công! Bạn có thể kéo ảnh này vào Zalo để gửi cho công nhân.');
      setTimeout(() => setImageCapturedSuccess(false), 5000);
    } catch (err) {
      console.error('Lỗi khi chụp ảnh phiếu lương', err);
      setStatusMessage('Không thể tạo ảnh phiếu lương. Bạn có thể sử dụng tính năng sao chép tin nhắn Zalo.');
    } finally {
      setIsCapturingImage(false);
    }
  };

  // 3b. Gửi tự động qua Zalo Official Account (ZNS / OA Message)
  const handleSendViaZaloOA = async () => {
    if (!cleanPhone) {
      alert('Vui lòng nhập số điện thoại Zalo của nhân viên để gửi!');
      return;
    }
    handleSaveContact();
    setIsSendingZaloOA(true);
    setZaloOAResult(null);
    setStatusMessage('Đang kết nối tới Zalo OA Phúc Nguyên để gửi phiếu lương...');

    try {
      const empWithPhone: Employee = {
        ...employee,
        phone: recipientPhone.trim(),
      };
      const result = await sendPayslipViaZaloOA(empWithPhone, config);
      setZaloOAResult(result);

      if (result.success) {
        setStatusMessage(
          `Đã gửi thành công qua Zalo OA! (Mã tin: ${result.messageId || 'ZNS_OK'}) tới SĐT ${recipientPhone}.`
        );
      } else {
        setStatusMessage(`Gửi Zalo OA chưa thành công: ${result.error || 'Vui lòng kiểm tra lại cấu hình Zalo OA.'}`);
      }
    } catch (err: any) {
      setZaloOAResult({
        success: false,
        error: err.message || 'Lỗi không xác định',
        mode: config.zaloOA?.sendMode || 'ZNS',
        sentAt: new Date().toLocaleTimeString('vi-VN'),
        recipientPhone,
        recipientName: employee.fullName,
      });
      setStatusMessage(`Lỗi gửi tin: ${err.message}`);
    } finally {
      setIsSendingZaloOA(false);
    }
  };

  // 4. Gửi SMS di động
  const handleSendSMS = () => {
    if (!cleanPhone) {
      alert('Vui lòng nhập số điện thoại nhân viên để gửi SMS!');
      return;
    }
    handleSaveContact();
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(
      `PNCONS: Thông báo lương tháng ${currentMonth}/${currentYear} cho ${employee.fullName} (${employee.code}). Thực nhận: ${formatVND(
        employee.netSalary
      )}. Chi tiết vui lòng liên hệ Kế toán.`
    )}`;
    window.location.href = smsUrl;
  };

  // ----------------------------------------------------
  // HÀNH ĐỘNG EMAIL
  // ----------------------------------------------------
  const handleSendMailto = () => {
    handleSaveContact();
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
    setStatusMessage('Đã mở ứng dụng Mail trên máy tính của bạn.');
  };

  const handleOpenGmailWeb = () => {
    handleSaveContact();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      recipientEmail
    )}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
    setStatusMessage('Đã mở cửa sổ soạn thư Gmail.');
  };

  const handleCopyEmailContent = async () => {
    const fullText = `Tiêu đề: ${emailSubject}\n\n${emailBody}`;
    const success = await copyToClipboard(fullText);
    if (success) {
      setIsCopiedEmail(true);
      setStatusMessage('Đã sao chép toàn bộ nội dung Email!');
      setTimeout(() => setIsCopiedEmail(false), 3000);
    } else {
      setStatusMessage('Bạn có thể bôi đen văn bản trong ô bên dưới và nhấn Ctrl+C để sao chép.');
    }
  };

  // Lưu thông tin liên hệ (Email / SĐT) vào hệ thống
  const handleSaveContact = () => {
    if (onUpdateEmployeeContact) {
      onUpdateEmployeeContact(employee.id, {
        email: recipientEmail.trim(),
        phone: recipientPhone.trim(),
      });
    } else if (onUpdateEmployeeEmail && recipientEmail.trim()) {
      onUpdateEmployeeEmail(employee.id, recipientEmail.trim());
    }
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in duration-150 overflow-hidden">
        {/* Modal Header: Luôn cố định trên đỉnh, không bao giờ bị cuộn mất */}
        <div className="flex justify-between items-center border-b border-slate-200 p-4 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
                activeChannel === 'ZALO' ? 'bg-[#0068FF]' : 'bg-[#0f3d64]'
              }`}
            >
              {activeChannel === 'ZALO' ? (
                <span className="text-base tracking-tighter font-black">Zalo</span>
              ) : (
                <Mail className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span>Gửi Phiếu Lương cho Nhân Viên</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                  {employee.code}
                </span>
                {isWorkerOrField && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                    Khối Kỹ thuật / Công trường
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {employee.fullName} • {employee.title} • {employee.department}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
            title="Đóng cửa sổ (Nhấn phím Esc hoặc bấm ra ngoài)"
          >
            <X className="w-4 h-4 text-slate-600 hover:text-rose-600" />
            <span>Đóng</span>
            <kbd className="hidden sm:inline-block text-[10px] bg-white border border-slate-300 rounded px-1 text-slate-500 font-mono">Esc</kbd>
          </button>
        </div>

        {/* Modal Body: Tự động cuộn mượt mà bên trong */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Tab chuyển đổi kênh: Zalo (Công nhân / Kỹ thuật) vs Email (Văn phòng) */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveChannel('ZALO')}
            className={`flex-1 py-2 px-3 rounded-md flex items-center justify-center gap-2 transition cursor-pointer ${
              activeChannel === 'ZALO'
                ? 'bg-white text-[#0068FF] shadow-xs font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-[#0068FF]" />
            <span>Gửi qua Zalo & Tin nhắn</span>
            <span className="text-[10px] bg-blue-50 text-[#0068FF] px-1.5 py-0.5 rounded font-normal hidden sm:inline">
              Rất thích hợp cho Công nhân
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChannel('EMAIL')}
            className={`flex-1 py-2 px-3 rounded-md flex items-center justify-center gap-2 transition cursor-pointer ${
              activeChannel === 'EMAIL'
                ? 'bg-white text-[#0f3d64] shadow-xs font-bold border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Mail className="w-4 h-4 text-[#0f3d64]" />
            <span>Gửi qua Email</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal hidden sm:inline">
              Khối Văn phòng
            </span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* KÊNH 1: GỬI QUA ZALO & TIN NHẮN (DÀNH CHO CÔNG NHÂN KỸ THUẬT) */}
        {/* ======================================================== */}
        {activeChannel === 'ZALO' && (
          <div className="space-y-3.5">
            {/* Hộp hướng dẫn và giải thích nghiệp vụ */}
            <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-[#0068FF] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-[#0050c8]">
                  Giải pháp tối ưu cho công nhân & kỹ sư không sử dụng email:
                </p>
                <p className="text-slate-700 leading-relaxed text-[11.5px]">
                  <strong>1. Bấm "Mở Chat Zalo"</strong>: Mở thẳng cuộc trò chuyện Zalo với số điện thoại của nhân viên và tự động sao chép tin nhắn để bạn dán (Ctrl+V) gửi ngay.
                  <br />
                  <strong>2. Bấm "Tải ảnh Phiếu Lương (PNG)"</strong>: Tải ảnh phiếu lương rõ nét từng cột mục, chỉ cần kéo thả vào Zalo để công nhân xem trực tiếp trên điện thoại!
                </p>
              </div>
            </div>

            {/* Thông tin số điện thoại người nhận */}
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Công nhân / Nhân viên</label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded font-semibold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{employee.fullName}</span>
                    <span className="text-slate-400 font-normal">({employee.title})</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-slate-700 flex items-center gap-1">
                      <span>Số điện thoại Zalo</span>
                      <span className="text-[#0068FF] font-bold">*</span>
                    </label>
                    {recipientPhone !== employee.phone && recipientPhone.trim() && (
                      <button
                        type="button"
                        onClick={handleSaveContact}
                        className="text-[11px] text-[#0068FF] hover:underline font-semibold cursor-pointer"
                      >
                        Lưu số mới vào hồ sơ
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="tel"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="Ví dụ: 0908 123 456"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-mono font-medium focus:outline-[#0068FF] focus:border-[#0068FF]"
                    />
                  </div>
                </div>
              </div>

              {!recipientPhone && (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nhân viên này chưa có số điện thoại. Vui lòng nhập số Zalo ở trên để mở chat.</span>
                </div>
              )}
            </div>

            {/* THẺ HÀNH ĐỘNG ZALO OA CHÍNH THỨC */}
            <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-sky-50/80 to-blue-50/90 border border-blue-200 rounded-xl space-y-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#0068FF] text-white flex items-center justify-center font-black text-[11px] shadow-xs">
                    OA
                  </span>
                  <div>
                    <h4 className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                      <span>Tự Động Gửi Qua Zalo Official Account</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-[#0068FF] font-semibold">
                        Khuyên dùng
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Gửi từ: <strong>{config.zaloOA?.oaName || config.name}</strong> •{' '}
                      {config.zaloOA?.sendMode === 'OA_MESSAGE' ? 'Zalo OA Chat' : 'ZNS trực tiếp qua Số điện thoại'}
                      {config.zaloOA?.isSandbox && (
                        <span className="ml-1.5 px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                          Thử nghiệm
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {onOpenZaloSettings && (
                  <button
                    type="button"
                    onClick={onOpenZaloSettings}
                    className="text-[11px] text-[#0068FF] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3 text-slate-500" />
                    <span>Cài đặt Zalo OA</span>
                  </button>
                )}
              </div>

              {/* Nút gửi tự động lớn */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendViaZaloOA}
                  disabled={isSendingZaloOA || !cleanPhone}
                  className="flex-1 py-2.5 px-4 bg-[#0068FF] hover:bg-[#0052cc] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition cursor-pointer disabled:opacity-50"
                  title="Gửi tự động tin nhắn phiếu lương trực tiếp từ Zalo OA vào điện thoại nhân viên"
                >
                  {isSendingZaloOA ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang gửi qua Zalo OA...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                      <span>Gửi Tự Động Qua Zalo OA Phúc Nguyên ({recipientPhone || 'Chưa có SĐT'})</span>
                    </>
                  )}
                </button>
              </div>

              {/* Phản hồi trạng thái gửi Zalo OA */}
              {zaloOAResult && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 animate-in fade-in ${
                    zaloOAResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {zaloOAResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5 leading-relaxed">
                    <p className="font-bold">
                      {zaloOAResult.success
                        ? '✅ Gửi thành công tới Zalo của nhân viên!'
                        : '⚠️ Chưa thể gửi qua Zalo OA'}
                    </p>
                    <p className="text-[11px] text-slate-700">
                      {zaloOAResult.success
                        ? `Mã tin nhắn: ${zaloOAResult.messageId} • Đã gửi lúc ${zaloOAResult.sentAt}. Nhân viên sẽ nhận được thông báo lương chi tiết trên ứng dụng Zalo.`
                        : zaloOAResult.error}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Xem trước tin nhắn Zalo */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                  <span>Nội dung tin nhắn Zalo được soạn tự động:</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyZaloMessage}
                  className="text-xs text-[#0068FF] hover:text-blue-800 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                >
                  {isCopiedZalo ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép tin nhắn</span>
                    </>
                  )}
                </button>
              </div>

              {/* Chat preview bubble */}
              <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono whitespace-pre-wrap max-h-52 overflow-y-auto border border-slate-800 leading-relaxed select-text shadow-inner">
                {zaloMessage}
              </div>
            </div>

            {/* Thông báo thao tác */}
            {statusMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Action Bar Zalo */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPayslipImage}
                  disabled={isCapturingImage}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
                  title="Tải ảnh phiếu lương dạng PNG để gửi kèm trong Zalo"
                >
                  {imageCapturedSuccess ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <ImageIcon className="w-3.5 h-3.5 text-sky-700" />
                  )}
                  <span>
                    {isCapturingImage
                      ? 'Đang chụp ảnh...'
                      : imageCapturedSuccess
                      ? 'Đã tải ảnh PNG'
                      : 'Tải ảnh Phiếu Lương (PNG)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleSendSMS}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="Gửi tin nhắn SMS qua mạng di động"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>SMS</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyZaloMessage}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  {isCopiedZalo ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>Sao chép</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenZaloChat}
                  disabled={!cleanPhone}
                  className="px-4 py-2 bg-[#0068FF] hover:bg-[#0052cc] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
                  title="Mở Zalo và trò chuyện trực tiếp với công nhân"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Mở Chat Zalo ({recipientPhone || 'Chưa có SĐT'})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* KÊNH 2: GỬI QUA EMAIL (DÀNH CHO VĂN PHÒNG & QUẢN LÝ) */}
        {/* ======================================================== */}
        {activeChannel === 'EMAIL' && (
          <div className="space-y-3.5">
            {/* Thông tin người nhận email */}
            <div className="space-y-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Họ và tên nhân viên</label>
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded font-semibold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{employee.fullName}</span>
                    <span className="text-slate-400 font-normal">({employee.title})</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-slate-700">Email người nhận *</label>
                    {recipientEmail !== employee.email && recipientEmail.trim() && (
                      <button
                        type="button"
                        onClick={handleSaveContact}
                        className="text-[11px] text-sky-600 hover:text-sky-800 font-semibold cursor-pointer underline"
                      >
                        Lưu vào hồ sơ
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="Ví dụ: nhanvien@pncons.vn"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded font-medium focus:outline-sky-600 focus:border-sky-600"
                    />
                  </div>
                </div>
              </div>

              {!recipientEmail && (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 text-[11px]">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Nhân viên này chưa có email. Bạn có thể nhập email hoặc chuyển sang tab "Gửi qua Zalo" ở trên.</span>
                </div>
              )}

              {/* Tiêu đề email */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tiêu đề email (Subject)</label>
                <div className="px-3 py-2 bg-white border border-slate-200 rounded font-bold text-slate-900">
                  {emailSubject}
                </div>
              </div>
            </div>

            {/* Nội dung xem trước Email */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Nội dung thư thông báo phiếu lương:</span>
                <button
                  onClick={handleCopyEmailContent}
                  className="text-xs text-sky-700 hover:text-sky-900 font-medium flex items-center gap-1 hover:underline cursor-pointer"
                >
                  {isCopiedEmail ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Đã sao chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép toàn bộ</span>
                    </>
                  )}
                </button>
              </div>

              <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto border border-slate-800 leading-relaxed select-text">
                {emailBody}
              </div>
            </div>

            {/* Thông báo thao tác Email */}
            {statusMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Action Buttons Email */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCopyEmailContent}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {isCopiedEmail ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{isCopiedEmail ? 'Đã chép nội dung' : 'Sao chép nội dung'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenGmailWeb}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Mở tab mới để gửi bằng Gmail Web"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Gửi qua Gmail Web</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendMailto}
                  className="px-4 py-2 bg-[#0f3d64] hover:bg-sky-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Mở ứng dụng Email mặc định của máy tính (Outlook, Mail...)"
                >
                  <Send className="w-4 h-4" />
                  <span>Mở ứng dụng Mail (Mailto)</span>
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Modal Footer Cố Định ở đáy: Luôn luôn có nút Đóng / Thoát rõ ràng */}
        <div className="shrink-0 p-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-slate-600 flex items-center gap-1.5">
            <span>Mẹo: Nhấn</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-slate-800 font-mono font-bold text-[10.5px]">Esc</kbd>
            <span>hoặc bấm ra ngoài vùng tối để thoát</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <X className="w-4 h-4" />
            <span>Đóng lại (Thoát)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
