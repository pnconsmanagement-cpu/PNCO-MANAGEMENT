import React, { useState, useEffect } from 'react';
import {
  X,
  UserPlus,
  Save,
  Building2,
  CreditCard,
  DollarSign,
  FileText,
  Calendar,
  Paperclip,
  Upload,
  ExternalLink,
  FileCheck,
} from 'lucide-react';
import { Employee } from '../types';
import { recomputeEmployeePayroll } from '../utils/payrollCalculator';
import {
  STANDARD_CONTRACT_TYPES,
  CONTRACT_DURATIONS,
  getDefaultContractDetails,
  ensureEmployeeContract,
} from '../utils/contractHelper';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Employee) => void;
  initialData?: Employee | null;
  existingCodes: string[];
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingCodes,
}) => {
  const isEditing = !!initialData;

  const defaultNextCode = () => {
    let nextNum = 1;
    existingCodes.forEach((c) => {
      const match = c.match(/\d+/);
      if (match) {
        const num = parseInt(match[0]);
        if (num >= nextNum) nextNum = num + 1;
      }
    });
    return `PNC${nextNum.toString().padStart(4, '0')}`;
  };

  const [formData, setFormData] = useState<Partial<Employee>>({
    code: defaultNextCode(),
    fullName: '',
    title: '',
    department: 'Kỹ thuật - Giám sát',
    joinDate: new Date().toLocaleDateString('vi-VN'),
    email: '',
    phone: '',
    contractType: 'HĐLĐ Xác định thời hạn (12 tháng)',
    contractDuration: '12 tháng',
    contractStartDate: new Date().toLocaleDateString('vi-VN'),
    contractEndDate: '31/12/2026',
    contractNumber: '',
    salaryType: 'MONTHLY',
    dailyRate: 0,
    baseSalary: 16000000,
    mealAllowance: 780000,
    phoneTravelAllowance: 800000,
    responsibilityAllowance: 800000,
    projectAllowance: 1500000,
    kpiBonus: 0,
    dependents: 0,
    insuranceSalary: 7000000,
    bankAccount: '',
    bankName: 'Techcombank',
    standardWorkDays: 26,
    actualWorkDays: 26,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    overtimeHours: 0,
    status: 'ACTIVE',
    selectedForAttendance: true,
  });

  useEffect(() => {
    if (initialData) {
      const ensured = ensureEmployeeContract(initialData);
      setFormData({
        ...ensured,
        insuranceSalary: ensured.insuranceSalary !== undefined ? ensured.insuranceSalary : 7000000,
      });
    } else {
      const code = defaultNextCode();
      setFormData({
        code,
        fullName: '',
        title: 'Kỹ sư kỹ thuật',
        department: 'Kỹ thuật - Giám sát',
        joinDate: new Date().toLocaleDateString('vi-VN'),
        email: '',
        phone: '',
        contractType: 'HĐLĐ Xác định thời hạn (12 tháng)',
        contractDuration: '12 tháng',
        contractStartDate: new Date().toLocaleDateString('vi-VN'),
        contractEndDate: '31/12/2026',
        contractNumber: `HĐLĐ-${code}/PNC`,
        baseSalary: 16000000,
        mealAllowance: 780000,
        phoneTravelAllowance: 800000,
        responsibilityAllowance: 800000,
        projectAllowance: 1500000,
        kpiBonus: 0,
        dependents: 0,
        insuranceSalary: 7000000,
        bankAccount: '',
        bankName: 'Techcombank',
        standardWorkDays: 26,
        actualWorkDays: 26,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        overtimeHours: 0,
        status: 'ACTIVE',
        selectedForAttendance: true,
      });
    }
  }, [initialData, isOpen]);

  const handleContractTypeChange = (type: string) => {
    const details = getDefaultContractDetails(type, formData.contractStartDate || formData.joinDate || '01/01/2026');
    setFormData((prev) => ({
      ...prev,
      contractType: type,
      contractDuration: details.contractDuration,
      contractEndDate: details.contractEndDate,
    }));
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName?.trim() || !formData.code?.trim()) {
      alert('Vui lòng điền họ tên và mã nhân viên!');
      return;
    }

    const employeeToSave: Employee = {
      id: initialData?.id || String(Date.now()),
      code: formData.code.trim().toUpperCase(),
      fullName: formData.fullName.trim(),
      title: formData.title || 'Nhân viên',
      department: formData.department || 'Phòng Kinh doanh',
      joinDate: formData.joinDate || '01/01/2026',
      email: formData.email?.trim() || '',
      phone: formData.phone?.trim() || '',
      bankAccount: formData.bankAccount || '',
      bankName: formData.bankName || 'Techcombank',
      idCard: formData.idCard || '',
      taxCode: formData.taxCode || '',
      contractType: formData.contractType || 'HĐLĐ Không xác định thời hạn',
      contractDuration: formData.contractDuration || 'Vô thời hạn',
      contractStartDate: formData.contractStartDate || formData.joinDate || '01/01/2026',
      contractEndDate: formData.contractEndDate || '',
      contractNumber: formData.contractNumber?.trim() || `HĐLĐ-${formData.code}/PNC`,
      contractFileUrl: formData.contractFileUrl || '',
      contractFileName: formData.contractFileName || '',
      contractAddendums: formData.contractAddendums || [],
      dependents: Number(formData.dependents) || 0,
      standardWorkDays: Number(formData.standardWorkDays) || 26,
      actualWorkDays: Number(formData.actualWorkDays) || 26,
      paidLeaveDays: Number(formData.paidLeaveDays) || 0,
      unpaidLeaveDays: Number(formData.unpaidLeaveDays) || 0,
      overtimeHours: Number(formData.overtimeHours) || 0,
      salaryType: formData.salaryType || 'MONTHLY',
      dailyRate: formData.salaryType === 'DAILY' ? Number(formData.baseSalary) : (Number(formData.dailyRate) || 0),
      baseSalary: Number(formData.baseSalary) || 0,
      salaryByActualDays: 0,
      responsibilityAllowance: Number(formData.responsibilityAllowance) || 0,
      projectAllowance: Number(formData.projectAllowance) || 0,
      mealAllowance: Number(formData.mealAllowance) || 0,
      phoneTravelAllowance: Number(formData.phoneTravelAllowance) || 0,
      kpiBonus: Number(formData.kpiBonus) || 0,
      overtimePay: 0,
      otherIncome: Number(formData.otherIncome) || 0,
      totalIncome: 0,
      insuranceSalary: formData.insuranceSalary !== undefined ? Number(formData.insuranceSalary) : 7000000,
      socialInsurance: 0,
      healthInsurance: 0,
      unemploymentInsurance: 0,
      totalInsurance: 0,
      unionFee: 0,
      taxExemptIncome: 0,
      taxableIncome: 0,
      personalIncomeTax: 0,
      advancePayment: Number(formData.advancePayment) || 0,
      totalDeductions: 0,
      netSalary: 0,
      status: formData.status || 'ACTIVE',
      selectedForAttendance: formData.selectedForAttendance !== false,
    };

    const recomputed = recomputeEmployeePayroll(employeeToSave);
    onSave(recomputed);
    onClose();
  };

  const handleFileUploadContract = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFormData((prev) => ({
            ...prev,
            contractFileName: fileName,
            contractFileUrl: reader.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const departments = [
    'Ban Lãnh đạo',
    'Kế toán',
    'Kỹ thuật - Giám sát',
    'Kỹ thuật thi công',
    'Thợ hàn',
    'Phòng Cơ điện',
    'Phòng Vật tư & Kho vận',
  ];

  const banks = [
    'Techcombank',
    'Vietcombank',
    'BIDV',
    'VietinBank',
    'MBBank',
    'ACB',
    'VPBank',
    'Sacombank',
    'TPBank',
    'HDBank',
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-5 space-y-4 my-8">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="font-bold text-sm uppercase text-[#0f3d64] flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-700" />
            <span>{isEditing ? 'Chỉnh sửa thông tin nhân viên' : 'Thêm nhân viên mới (Tăng nhân sự)'}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Thông tin cơ bản */}
          <div className="space-y-2">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-sky-700" />
              <span>1. Thông tin định danh & Công việc</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Mã NV *</label>
                <input
                  type="text"
                  required
                  value={formData.code || ''}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold text-[#0f3d64] focus:outline-sky-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn An"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-semibold focus:outline-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Chức vụ / Chức danh</label>
                <input
                  type="text"
                  value={formData.title || ''}
                  placeholder="Ví dụ: Kỹ sư cơ điện"
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Phòng ban / Bộ phận</label>
                <select
                  value={formData.department || departments[0]}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Ngày vào làm</label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={formData.joinDate || ''}
                  onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
                />
              </div>
            </div>

            {/* Email và Số điện thoại */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Email liên hệ</label>
                <input
                  type="email"
                  placeholder="Ví dụ: nhanvien@pncons.vn"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Số điện thoại</label>
                <input
                  type="tel"
                  placeholder="Ví dụ: 0903 123 456"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Trạng thái làm việc (Nhân sự)</label>
                <select
                  value={formData.status || 'ACTIVE'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white font-medium"
                >
                  <option value="ACTIVE">🟢 Đang làm việc (Chính thức)</option>
                  <option value="RESIGNED">🔴 Đã nghỉ việc (Giảm nhân sự)</option>
                  <option value="LEAVE">🟡 Tạm hoãn / Nghỉ thai sản / Nghỉ không lương</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.selectedForAttendance !== false}
                    onChange={(e) => setFormData({ ...formData, selectedForAttendance: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="font-bold text-slate-800">
                    Chọn nhân viên này để chấm công & tính lương kỳ này
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Hợp đồng lao động & Thời hạn */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="font-bold text-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-700" />
                <span>2. Hợp đồng lao động & Thời hạn (Bộ Luật Lao Động 2019)</span>
              </div>
              <span className="text-[10px] text-slate-500 italic">
                Điều 20 & 21 BLLĐ 2019
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">
                  Loại Hợp đồng lao động *
                </label>
                <select
                  value={formData.contractType || STANDARD_CONTRACT_TYPES[0]}
                  onChange={(e) => handleContractTypeChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white font-medium text-slate-800"
                >
                  {STANDARD_CONTRACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Số HĐLĐ
                </label>
                <input
                  type="text"
                  placeholder="VD: 01/2024/HĐLĐ-PNC"
                  value={formData.contractNumber || ''}
                  onChange={(e) => setFormData({ ...formData, contractNumber: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800 focus:outline-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Thời hạn hợp đồng
                </label>
                <input
                  type="text"
                  placeholder="Vô thời hạn / 12 tháng / 24 tháng..."
                  value={formData.contractDuration || ''}
                  onChange={(e) => setFormData({ ...formData, contractDuration: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Ngày ký / Bắt đầu HĐLĐ
                </label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={formData.contractStartDate || formData.joinDate || ''}
                  onChange={(e) => setFormData({ ...formData, contractStartDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Ngày hết hạn HĐLĐ</span>
                  <span className="text-[10px] text-slate-400 font-normal">Trống nếu Vô thời hạn</span>
                </label>
                <input
                  type="text"
                  placeholder="dd/mm/yyyy (nếu có)"
                  value={formData.contractEndDate || ''}
                  onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 font-mono text-slate-800"
                />
              </div>
            </div>

            {/* Đường dẫn file Hợp đồng lao động & Tải tệp đính kèm */}
            <div className="bg-slate-50 border border-slate-200 rounded p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-700 block flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-sky-700" />
                  <span>Đường dẫn tới file Hợp đồng lao động (Google Drive / OneDrive / Link tài liệu)</span>
                </label>
                {formData.contractFileUrl && (
                  <a
                    href={formData.contractFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 hover:text-sky-900 font-bold inline-flex items-center gap-1 hover:underline text-[11px]"
                    title="Mở file hợp đồng"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Mở file HĐ</span>
                  </a>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Dán link Google Drive, link file PDF/Word hoặc đường dẫn lưu trữ hợp đồng..."
                  value={formData.contractFileUrl || ''}
                  onChange={(e) => setFormData({ ...formData, contractFileUrl: e.target.value })}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white font-mono text-[11px]"
                />

                <label className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded font-medium flex items-center gap-1.5 cursor-pointer transition shrink-0 shadow-2xs">
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tải file lên</span>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.png"
                    className="hidden"
                    onChange={handleFileUploadContract}
                  />
                </label>
              </div>

              {formData.contractFileName && (
                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                  <div className="flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Tệp đính kèm: <strong className="text-slate-700">{formData.contractFileName}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contractFileUrl: '', contractFileName: '' })}
                    className="text-rose-500 hover:text-rose-700 hover:underline cursor-pointer"
                  >
                    Xóa tệp
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lương & Phụ cấp */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="font-bold text-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-700" />
                <span>3. Chế độ Lương, Phụ cấp & Giảm trừ gia cảnh</span>
              </div>
            </div>

            {/* Lựa chọn hình thức tính lương: Lương tháng vs Lương theo ngày */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
              <label className="font-semibold text-slate-800 block text-xs">
                Phương thức tính lương áp dụng *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const currentVal = formData.baseSalary || 0;
                    // Nếu đang từ ngày sang tháng và giá trị nhỏ (< 2 triệu), gợi ý chuyển sang mức lương tháng
                    const newSalary = currentVal < 2000000 && currentVal > 0 ? currentVal * 26 : currentVal;
                    setFormData({ ...formData, salaryType: 'MONTHLY', baseSalary: newSalary || 11500000 });
                  }}
                  className={`p-2.5 rounded-md border text-left cursor-pointer transition ${
                    formData.salaryType !== 'DAILY'
                      ? 'bg-sky-50 border-sky-600 ring-1 ring-sky-500 text-sky-950'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>1. Tính theo Lương tháng (Chuẩn 26 ngày)</span>
                    {formData.salaryType !== 'DAILY' && (
                      <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Công thức: <code className="text-sky-800 font-semibold">=ROUND((Lương CB / 26) * Ngày công, 0)</code>. Phù hợp kỹ sư, quản lý, nhân viên cơ hữu.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentVal = formData.baseSalary || 0;
                    // Nếu đang từ tháng sang ngày và giá trị lớn (> 2 triệu), gợi ý đổi sang đơn giá ngày tương ứng
                    const newDaily = currentVal >= 2000000 ? Math.round(currentVal / 26) : (currentVal || 500000);
                    setFormData({ ...formData, salaryType: 'DAILY', baseSalary: newDaily });
                  }}
                  className={`p-2.5 rounded-md border text-left cursor-pointer transition ${
                    formData.salaryType === 'DAILY'
                      ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-500 text-amber-950'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>2. Tính theo Đơn giá ngày công</span>
                    {formData.salaryType === 'DAILY' && (
                      <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Công thức: <code className="text-amber-800 font-semibold">=Đơn giá ngày * Ngày công thực tế</code>. Phù hợp nhân công nhật, thợ khoán, thời vụ.
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {formData.salaryType === 'DAILY' ? 'Đơn giá lương 1 ngày công (VNĐ/ngày) *' : 'Lương cơ bản theo tháng (VNĐ/tháng) *'}
                </label>
                <input
                  type="number"
                  step={formData.salaryType === 'DAILY' ? 10000 : 100000}
                  required
                  value={formData.baseSalary || 0}
                  onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                  className={`w-full px-2.5 py-1.5 border rounded font-bold font-mono focus:outline-sky-600 ${
                    formData.salaryType === 'DAILY'
                      ? 'border-amber-400 bg-amber-50/30 text-amber-900'
                      : 'border-slate-300 text-emerald-800'
                  }`}
                  placeholder={formData.salaryType === 'DAILY' ? 'VD: 500000' : 'VD: 11500000'}
                />
                {formData.salaryType === 'DAILY' && (
                  <div className="flex gap-1 mt-1">
                    {[350000, 450000, 500000, 600000, 700000].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setFormData({ ...formData, baseSalary: rate })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-mono cursor-pointer"
                      >
                        {rate / 1000}k
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Phụ cấp ăn ca</label>
                <input
                  type="number"
                  step={50000}
                  value={formData.mealAllowance || 0}
                  onChange={(e) => setFormData({ ...formData, mealAllowance: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">PC Xăng xe, Điện thoại</label>
                <input
                  type="number"
                  step={50000}
                  value={formData.phoneTravelAllowance || 0}
                  onChange={(e) => setFormData({ ...formData, phoneTravelAllowance: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono focus:outline-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  <span>PC Trách nhiệm</span>
                  <span className="text-[10px] text-sky-700 font-normal ml-1">(VNĐ)</span>
                </label>
                <input
                  type="number"
                  step={50000}
                  value={formData.responsibilityAllowance || 0}
                  onChange={(e) => setFormData({ ...formData, responsibilityAllowance: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold text-sky-900 focus:outline-sky-600 bg-sky-50/20"
                  placeholder="VD: 800000"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  <span>PC Dự án</span>
                  <span className="text-[10px] text-emerald-700 font-normal ml-1">(VNĐ)</span>
                </label>
                <input
                  type="number"
                  step={50000}
                  value={formData.projectAllowance || 0}
                  onChange={(e) => setFormData({ ...formData, projectAllowance: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-emerald-300 rounded font-mono font-bold text-emerald-900 focus:outline-emerald-600 bg-emerald-50/20"
                  placeholder="VD: 1500000"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Thưởng KPI / Hiệu suất</label>
                <input
                  type="number"
                  step={100000}
                  value={formData.kpiBonus || 0}
                  onChange={(e) => setFormData({ ...formData, kpiBonus: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Người phụ thuộc (NPT)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={formData.dependents || 0}
                  onChange={(e) => setFormData({ ...formData, dependents: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-center font-bold focus:outline-sky-600"
                />
              </div>
            </div>

            {/* Phí đóng bảo hiểm xã hội (ngay sau Người phụ thuộc) */}
            <div className="bg-rose-50/70 p-3 rounded-lg border border-rose-200 mt-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <label className="font-semibold text-slate-800 block text-xs mb-1">
                    <span>Mức lương đóng BHXH</span>
                    <span className="text-[10px] text-rose-700 font-normal ml-1">(Lương căn cứ đóng BH - VNĐ)</span>
                  </label>
                  <input
                    type="number"
                    step={100000}
                    value={formData.insuranceSalary !== undefined ? formData.insuranceSalary : 7000000}
                    onChange={(e) => setFormData({ ...formData, insuranceSalary: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 border border-rose-300 rounded font-mono font-bold text-rose-950 focus:outline-rose-600 bg-white"
                    placeholder="VD: 7000000"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">
                    Mức đóng chuẩn theo hợp đồng (VD: 7.000.000 đ)
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-rose-200 text-right min-w-[240px] shadow-xs">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    BHXH (= {new Intl.NumberFormat('vi-VN').format(Number(formData.insuranceSalary) || 0)} × 10.5%)
                  </div>
                  <div className="text-lg font-mono font-black text-rose-700">
                    {new Intl.NumberFormat('vi-VN').format(Math.round((Number(formData.insuranceSalary) || 0) * 0.105))} đ
                  </div>
                  <div className="text-[9.5px] text-slate-500">
                    Bao gồm BHXH 8% + BHYT 1.5% + BHTN 1%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tài khoản ngân hàng chi lương */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <CreditCard className="w-3.5 h-3.5 text-sky-700" />
              <span>4. Thông tin thanh toán lương chuyển khoản</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Số tài khoản ngân hàng</label>
                <input
                  type="text"
                  placeholder="Ví dụ: 190345678910"
                  value={formData.bankAccount || ''}
                  onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-semibold focus:outline-sky-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Ngân hàng chi trả</label>
                <select
                  value={formData.bankName || banks[0]}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white font-medium"
                >
                  {banks.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Lưu cập nhật' : 'Tạo nhân viên mới'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
