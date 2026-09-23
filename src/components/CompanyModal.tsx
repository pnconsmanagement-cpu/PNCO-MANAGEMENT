import React, { useState } from 'react';
import { Building2, X, Save } from 'lucide-react';
import { CompanyConfig } from '../types';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CompanyConfig;
  onSave: (newConfig: CompanyConfig) => void;
}

export const CompanyModal: React.FC<CompanyModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [formData, setFormData] = useState<CompanyConfig>(config);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="font-bold text-sm uppercase text-[#0f3d64] flex items-center gap-2">
            <Building2 className="w-4 h-4 text-sky-700" />
            <span>Thông tin doanh nghiệp & Kỳ lương</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-medium text-slate-700 block mb-1">Tên công ty</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              required
            />
          </div>

          <div>
            <label className="font-medium text-slate-700 block mb-1">Địa chỉ</label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium text-slate-700 block mb-1">Mã số thuế</label>
              <input
                type="text"
                value={formData.taxCode}
                onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
            <div>
              <label className="font-medium text-slate-700 block mb-1">Số điện thoại</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium text-slate-700 block mb-1">Tháng tính lương</label>
              <select
                value={formData.month || 9}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  const y = formData.year || 2026;
                  const mStr = m < 10 ? `0${m}` : `${m}`;
                  const nextM = m === 12 ? '01' : (m + 1 < 10 ? `0${m + 1}` : `${m + 1}`);
                  const nextY = m === 12 ? y + 1 : y;
                  setFormData({
                    ...formData,
                    month: m,
                    period: `Kỳ lương tháng ${mStr} năm ${y}`,
                    periodCode: `${mStr}/${y}`,
                    paymentDate: `05/${nextM}/${nextY}`,
                  });
                }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600 bg-white"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Tháng {m < 10 ? `0${m}` : m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-medium text-slate-700 block mb-1">Năm tính lương</label>
              <input
                type="number"
                value={formData.year || 2026}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const m = formData.month || 9;
                  const mStr = m < 10 ? `0${m}` : `${m}`;
                  const nextM = m === 12 ? '01' : (m + 1 < 10 ? `0${m + 1}` : `${m + 1}`);
                  const nextY = m === 12 ? y + 1 : y;
                  setFormData({
                    ...formData,
                    year: y,
                    period: `Kỳ lương tháng ${mStr} năm ${y}`,
                    periodCode: `${mStr}/${y}`,
                    paymentDate: `05/${nextM}/${nextY}`,
                  });
                }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium text-slate-700 block mb-1">Kỳ lương (Tiêu đề hiển thị)</label>
              <input
                type="text"
                value={formData.period}
                onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
            <div>
              <label className="font-medium text-slate-700 block mb-1">Ngày chi trả</label>
              <input
                type="text"
                value={formData.paymentDate}
                onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-medium text-slate-700 block mb-1">Ngày công chuẩn</label>
              <input
                type="number"
                value={formData.standardWorkDays}
                onChange={(e) => setFormData({ ...formData, standardWorkDays: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
            <div>
              <label className="font-medium text-slate-700 block mb-1">Mẫu chứng từ</label>
              <input
                type="text"
                value={formData.formNumber}
                onChange={(e) => setFormData({ ...formData, formNumber: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-sky-600"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#0f3d64] hover:bg-sky-800 text-white rounded font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
