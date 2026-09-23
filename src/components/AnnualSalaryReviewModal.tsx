import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  X,
  Mail,
  Send,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Paperclip,
  Upload,
  Calendar,
  DollarSign,
  AlertCircle,
  FileCheck,
  Sparkles,
  MessageSquare,
  Building2,
  Clock,
  History,
} from 'lucide-react';
import { Employee, CompanyConfig, ContractAddendum } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';
import { copyToClipboard } from '../utils/clipboard';
import {
  generateAddendumNumber,
  generateSalaryIncreaseEmail,
} from '../utils/contractHelper';

interface AnnualSalaryReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee;
  config: CompanyConfig;
  onApplySalaryIncrease: (
    employeeId: string,
    updates: {
      newBaseSalary: number;
      addendum: ContractAddendum;
      newContractFileUrl?: string;
      newContractFileName?: string;
      updatedEmail?: string;
    }
  ) => void;
  onUpdateEmployeeEmail?: (employeeId: string, newEmail: string) => void;
}

export const AnnualSalaryReviewModal: React.FC<AnnualSalaryReviewModalProps> = ({
  isOpen,
  onClose,
  employee,
  config,
  onApplySalaryIncrease,
  onUpdateEmployeeEmail,
}) => {
  const currentYear = config.year || new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [effectiveDate, setEffectiveDate] = useState<string>(`01/01/${currentYear}`);
  const [newBaseSalary, setNewBaseSalary] = useState<number>(employee.baseSalary);
  const [reason, setReason] = useState<string>(
    `Tăng lương định kỳ hàng năm ${currentYear} theo kết quả đánh giá KPI & quy chế Công ty`
  );
  const [addendumNumber, setAddendumNumber] = useState<string>(
    generateAddendumNumber(employee.code, currentYear, (employee.contractAddendums?.length || 0) + 1)
  );

  const [contractFileUrl, setContractFileUrl] = useState<string>(
    employee.contractFileUrl || `https://drive.google.com/drive/search?q=HDLD_${employee.code}_${encodeURIComponent(employee.fullName)}`
  );
  const [contractFileName, setContractFileName] = useState<string>(
    employee.contractFileName || `HDLD_${employee.code}_PhuLuc${currentYear}.pdf`
  );

  const [recipientEmail, setRecipientEmail] = useState<string>(employee.email || '');
  const [isCopiedEmail, setIsCopiedEmail] = useState(false);
  const [isCopiedZalo, setIsCopiedZalo] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Reset values when employee changes
  useEffect(() => {
    const yr = config.year || new Date().getFullYear();
    setSelectedYear(yr);
    setEffectiveDate(`01/01/${yr}`);
    // Default 10% increase suggestion or keep current
    const suggested = Math.round(employee.baseSalary * 1.08 / 100000) * 100000;
    setNewBaseSalary(suggested > employee.baseSalary ? suggested : employee.baseSalary);
    setReason(`Tăng lương định kỳ hàng năm ${yr} theo kết quả đánh giá KPI & quy chế Công ty`);
    setAddendumNumber(
      generateAddendumNumber(employee.code, yr, (employee.contractAddendums?.length || 0) + 1)
    );
    setContractFileUrl(
      employee.contractFileUrl || `https://drive.google.com/drive/search?q=HDLD_${employee.code}_${encodeURIComponent(employee.fullName)}`
    );
    setContractFileName(
      employee.contractFileName || `HDLD_${employee.code}_PhuLuc${yr}.pdf`
    );
    setRecipientEmail(employee.email || '');
    setIsCopiedEmail(false);
    setIsCopiedZalo(false);
    setSaveSuccessMsg(null);
  }, [employee, config.year, isOpen]);

  if (!isOpen) return null;

  const oldSalary = employee.baseSalary;
  const diffAmount = newBaseSalary - oldSalary;
  const percentChange =
    oldSalary > 0 ? Math.round((diffAmount / oldSalary) * 1000) / 10 : 0;

  // Generate Email Content
  const { subject, body } = generateSalaryIncreaseEmail({
    employee,
    oldSalary,
    newSalary: newBaseSalary,
    effectiveDate,
    addendumNumber,
    reason,
    contractFileUrl,
    companyName: config.name || 'CÔNG TY TNHH XÂY DỰNG - CƠ ĐIỆN PHÚC NGUYÊN',
  });

  // Handle Quick Increase Presets
  const handleApplyPresetPercent = (pct: number) => {
    const calculated = Math.round((oldSalary * (1 + pct / 100)) / 50000) * 50000;
    setNewBaseSalary(calculated);
  };

  const handleApplyPresetAmount = (amt: number) => {
    setNewBaseSalary(oldSalary + amt);
  };

  // Handle File Upload from PC
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setContractFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setContractFileUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Copy Email Text
  const handleCopyEmail = async () => {
    const fullText = `Tiêu đề: ${subject}\n\n${body}`;
    const ok = await copyToClipboard(fullText);
    if (ok) {
      setIsCopiedEmail(true);
      setTimeout(() => setIsCopiedEmail(false), 3000);
    }
  };

  // Send via standard Mail Client (mailto:)
  const handleSendMailto = () => {
    if (!recipientEmail) {
      alert('Vui lòng nhập địa chỉ Email của nhân viên trước khi gửi.');
      return;
    }
    // Update employee email if changed
    if (onUpdateEmployeeEmail && recipientEmail !== employee.email) {
      onUpdateEmployeeEmail(employee.id, recipientEmail);
    }
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Open Web Gmail Compose
  const handleOpenGmail = () => {
    if (!recipientEmail) {
      alert('Vui lòng nhập địa chỉ Email của nhân viên.');
      return;
    }
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      recipientEmail
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  // Handle Save and Apply
  const handleSaveAndApply = () => {
    if (newBaseSalary <= 0) {
      alert('Vui lòng nhập mức lương mới hợp lệ.');
      return;
    }

    const newAddendum: ContractAddendum = {
      id: `ADDENDUM-${selectedYear}-${Date.now()}`,
      year: selectedYear,
      effectiveDate,
      addendumNumber,
      oldBaseSalary: oldSalary,
      newBaseSalary,
      increaseAmount: diffAmount,
      increasePercent: percentChange,
      fileUrl: contractFileUrl,
      fileName: contractFileName,
      reason,
      notifiedAt: new Date().toLocaleString('vi-VN'),
      notifiedEmail: recipientEmail,
    };

    onApplySalaryIncrease(employee.id, {
      newBaseSalary,
      addendum: newAddendum,
      newContractFileUrl: contractFileUrl,
      newContractFileName: contractFileName,
      updatedEmail: recipientEmail,
    });

    setSaveSuccessMsg('✓ Đã cập nhật mức lương mới và lưu Phụ lục HĐLĐ thành công!');
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden my-auto border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0f3d64] to-sky-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide flex items-center gap-2">
                <span>QUY TRÌNH TĂNG LƯƠNG HÀNG NĂM & CẬP NHẬT PHỤ LỤC HỢP ĐỒNG LAO ĐỘNG</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 font-black">
                  BLLĐ 2019
                </span>
              </h3>
              <p className="text-[11px] text-sky-200 mt-0.5">
                Cập nhật mức lương mới, tạo số Phụ lục HĐLĐ, đính kèm file hợp đồng và gửi email thông báo cho nhân viên
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Employee Summary Ribbon */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-sky-100 text-sky-800 font-bold flex items-center justify-center text-[11px]">
                {employee.code.slice(-3)}
              </div>
              <div>
                <span className="font-bold text-slate-900 text-sm">{employee.fullName}</span>
                <span className="text-slate-500 font-mono ml-1.5">({employee.code})</span>
              </div>
            </div>

            <div className="text-slate-600">
              <span className="text-slate-400">Chức vụ:</span> <strong>{employee.title}</strong> •{' '}
              <span className="text-slate-400">Bộ phận:</span> <strong>{employee.department}</strong>
            </div>

            <div className="text-slate-600">
              <span className="text-slate-400">HĐ hiện tại:</span>{' '}
              <span className="font-medium text-sky-800">{employee.contractType || 'HĐLĐ Vô thời hạn'}</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 px-3 py-1 rounded text-right shadow-2xs">
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Lương cơ bản hiện tại</div>
            <div className="font-bold font-mono text-slate-800 text-sm">
              {formatVND(employee.baseSalary)}
            </div>
          </div>
        </div>

        {/* Main Content Grid: Left (Adjustment Form) - Right (Email Composer & Preview) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 flex-1 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* LEFT COLUMN: Adjustment Details & Contract File Link (5 cols) */}
          <div className="lg:col-span-5 p-4 sm:p-5 space-y-4 bg-white text-xs overflow-y-auto">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 border-b border-slate-200 pb-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>1. Điều chỉnh Mức lương & Phụ lục HĐLĐ</span>
            </div>

            {/* Year and Effective Date */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Năm xét tăng lương
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={2020}
                    max={2035}
                    value={selectedYear}
                    onChange={(e) => {
                      const yr = Number(e.target.value);
                      setSelectedYear(yr);
                      setAddendumNumber(
                        generateAddendumNumber(employee.code, yr, (employee.contractAddendums?.length || 0) + 1)
                      );
                    }}
                    className="w-full pl-8 pr-2.5 py-1.5 border border-slate-300 rounded font-semibold text-slate-800 focus:outline-sky-600"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Ngày bắt đầu có hiệu lực
                </label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-medium focus:outline-sky-600"
                />
              </div>
            </div>

            {/* Quick Adjustment Presets */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5 flex items-center justify-between">
                <span>Chọn nhanh mức tăng:</span>
                <span className="text-[10px] text-sky-700 font-normal">Theo % hoặc số tiền cố định</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[5, 7, 10, 15].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleApplyPresetPercent(pct)}
                    className="px-2.5 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-semibold cursor-pointer transition text-[11px]"
                  >
                    +{pct}%
                  </button>
                ))}
                {[1000000, 2000000, 3000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleApplyPresetAmount(amt)}
                    className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold cursor-pointer transition text-[11px]"
                  >
                    +{amt / 1000000}tr
                  </button>
                ))}
              </div>
            </div>

            {/* New Salary Input & Impact Card */}
            <div className="bg-gradient-to-br from-slate-50 to-sky-50/40 border border-sky-200 rounded-lg p-3 space-y-2">
              <label className="font-bold text-slate-800 block text-xs flex items-center justify-between">
                <span>Mức Lương Cơ Bản MỚI (VNĐ/tháng) *</span>
                <span className="text-[10px] text-slate-500 font-normal">Cũ: {formatVND(oldSalary)}</span>
              </label>

              <input
                type="number"
                step={50000}
                required
                value={newBaseSalary}
                onChange={(e) => setNewBaseSalary(Number(e.target.value))}
                className="w-full px-3 py-2 border border-sky-300 rounded-md font-mono font-black text-emerald-700 text-base focus:outline-sky-600 bg-white shadow-2xs"
              />

              {/* Differential Calculation Badge */}
              <div className="flex items-center justify-between pt-1 text-[11px]">
                <span className="text-slate-600">Số tiền tăng thêm:</span>
                <span
                  className={`font-mono font-bold ${
                    diffAmount >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {diffAmount >= 0 ? `+${formatVND(diffAmount)}` : formatVND(diffAmount)}{' '}
                  <span className="text-[10px] font-sans font-medium">
                    ({diffAmount >= 0 ? `+${percentChange}%` : `${percentChange}%`})
                  </span>
                </span>
              </div>
            </div>

            {/* Addendum Number and Reason */}
            <div className="space-y-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Số Phụ lục Hợp đồng Lao động</span>
                  <span className="text-[10px] text-slate-400">Điều 22 BLLĐ 2019</span>
                </label>
                <input
                  type="text"
                  value={addendumNumber}
                  onChange={(e) => setAddendumNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-semibold text-slate-800 focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Lý do điều chỉnh tăng lương
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-sky-600 mb-1.5"
                >
                  <option value={`Tăng lương định kỳ hàng năm ${selectedYear} theo kết quả đánh giá KPI & quy chế Công ty`}>
                    Tăng lương định kỳ hàng năm theo quy chế công ty
                  </option>
                  <option value="Nâng bậc tay nghề kỹ thuật & hoàn thành xuất sắc các dự án cơ điện">
                    Nâng bậc tay nghề kỹ thuật & hoàn thành xuất sắc dự án
                  </option>
                  <option value="Điều chỉnh theo mức sống, trượt giá và năng suất lao động">
                    Điều chỉnh theo trượt giá & năng suất lao động
                  </option>
                  <option value="Bổ nhiệm chức vụ mới / Nâng cao trách nhiệm quản lý">
                    Bổ nhiệm chức vụ mới / Nâng trách nhiệm quản lý
                  </option>
                  <option value="Thỏa thuận điều chỉnh phụ lục theo đề xuất của Trưởng bộ phận">
                    Thỏa thuận theo đề xuất Trưởng bộ phận
                  </option>
                </select>
                <input
                  type="text"
                  placeholder="Hoặc tự nhập lý do cụ thể..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 text-slate-700"
                />
              </div>
            </div>

            {/* Contract / Addendum File Link */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <Paperclip className="w-3.5 h-3.5 text-sky-700" />
                  <span>Đường dẫn tới file Hợp đồng / Phụ lục HĐLĐ</span>
                </label>
                {contractFileUrl && (
                  <a
                    href={contractFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 hover:text-sky-900 font-semibold inline-flex items-center gap-1 hover:underline text-[11px]"
                    title="Mở file hợp đồng hoặc phụ lục"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Mở file</span>
                  </a>
                )}
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Dán link Google Drive, OneDrive hoặc link file PDF hợp đồng..."
                  value={contractFileUrl}
                  onChange={(e) => setContractFileUrl(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded font-mono text-[11px] focus:outline-sky-600 bg-white"
                />

                <label
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-medium flex items-center gap-1 cursor-pointer transition shrink-0"
                  title="Tải file PDF/Word từ máy tính"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tải tệp</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>

              {contractFileName && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                  <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Tệp lưu trữ: <strong className="text-slate-700">{contractFileName}</strong></span>
                </div>
              )}
            </div>

            {/* History of Previous Addendums if any */}
            {employee.contractAddendums && employee.contractAddendums.length > 0 && (
              <div className="border-t border-slate-200 pt-2 space-y-1.5">
                <div className="font-semibold text-slate-600 text-[11px] flex items-center gap-1">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Lịch sử các lần điều chỉnh lương trước ({employee.contractAddendums.length}):</span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {employee.contractAddendums.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-1.5 rounded bg-slate-50 border border-slate-200 text-[10px] flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-slate-800">{item.addendumNumber}</span> • {item.effectiveDate}
                      </div>
                      <div className="font-mono text-emerald-700 font-bold">
                        {formatVND(item.newBaseSalary)} (+{item.increasePercent}%)
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Official Email Composer & Dispatch (7 cols) */}
          <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col justify-between space-y-3 bg-slate-50/50 text-xs overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Mail className="w-4 h-4 text-sky-700" />
                  <span>2. Gửi Email thông báo Hợp đồng & Tăng lương cho nhân viên</span>
                </div>
                <span className="text-[11px] text-slate-500 italic">
                  Định dạng thư chính thức của Công ty
                </span>
              </div>

              {/* Recipient Email input with instant edit */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Gửi tới Email nhân viên:</span>
                  {!employee.email && (
                    <span className="text-amber-600 text-[10px] font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Chưa có email trong hồ sơ, vui lòng nhập bên dưới
                    </span>
                  )}
                </label>
                <input
                  type="email"
                  required
                  placeholder="nhanvien@pncons.vn"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium focus:outline-sky-600 bg-white"
                />
              </div>

              {/* Email Subject preview */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tiêu đề Email (Subject):</label>
                <div className="p-2 rounded bg-white border border-slate-200 font-medium text-slate-800 text-[11px]">
                  {subject}
                </div>
              </div>

              {/* Email Body preview box */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">Nội dung thư thông báo:</label>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="text-sky-700 hover:text-sky-900 font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    {isCopiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Đã sao chép thư</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Sao chép toàn bộ</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded font-mono text-[11px] text-slate-700 max-h-[260px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text shadow-inner">
                  {body}
                </div>
              </div>

              {/* Email & Messaging Action Buttons */}
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  id="btn-send-mailto-increase"
                  onClick={handleSendMailto}
                  className="px-3 py-2 bg-[#0f3d64] hover:bg-sky-800 text-white rounded font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                  title="Mở ứng dụng Email mặc định (Outlook, Mail, Thunderbird) để gửi ngay"
                >
                  <Send className="w-3.5 h-3.5 text-sky-200" />
                  <span>Gửi Email qua Outlook / Mail App</span>
                </button>

                <button
                  type="button"
                  id="btn-send-gmail-increase"
                  onClick={handleOpenGmail}
                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="Mở trình soạn thảo Gmail trên trình duyệt"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-rose-600" />
                  <span>Mở nhanh Web Gmail</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isCopiedEmail ? 'Đã sao chép' : 'Sao chép văn bản'}</span>
                </button>

                {employee.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      const cleanPhone = employee.phone?.replace(/[^0-9]/g, '') || '';
                      const zaloMsg = `[Phúc Nguyên M&E] Chúc mừng Anh/Chị ${employee.fullName} được tăng lương năm ${selectedYear}. Mức lương mới: ${formatVND(newBaseSalary)} (tăng +${percentChange}%). Chi tiết đã gửi qua Email và lưu tại hồ sơ nhân sự.`;
                      copyToClipboard(zaloMsg);
                      setIsCopiedZalo(true);
                      setTimeout(() => setIsCopiedZalo(false), 3000);
                      window.open(`https://zalo.me/${cleanPhone}`, '_blank');
                    }}
                    className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    title="Mở Zalo và nhắn thông báo tóm tắt"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isCopiedZalo ? 'Đã sao chép & Mở Zalo' : 'Gửi qua Zalo'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Footer Actions */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              {saveSuccessMsg ? (
                <div className="text-emerald-700 font-bold text-xs flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{saveSuccessMsg}</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">
                  Nhấn <strong className="text-slate-700">"Lưu cập nhật lương & Hoàn tất"</strong> để cập nhật trực tiếp vào hệ thống tính lương.
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded font-medium cursor-pointer transition"
                >
                  Đóng
                </button>

                <button
                  type="button"
                  id="btn-apply-salary-increase"
                  onClick={handleSaveAndApply}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Lưu cập nhật lương & Hoàn tất</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
