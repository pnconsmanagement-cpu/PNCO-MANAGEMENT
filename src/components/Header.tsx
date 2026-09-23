import React from 'react';
import { Upload, Download, Building2, Calendar, Zap, Settings } from 'lucide-react';
import { CompanyConfig } from '../types';

interface HeaderProps {
  config: CompanyConfig;
  onOpenImport: () => void;
  onOpenBankExport: () => void;
  onEditCompany: () => void;
  onOpenZaloSettings?: () => void;
  onOpenBatchZalo?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  onOpenImport,
  onOpenBankExport,
  onEditCompany,
  onOpenZaloSettings,
  onOpenBatchZalo,
}) => {
  const isZaloReady = Boolean(config.zaloOA?.oaId && config.zaloOA?.accessToken);

  return (
    <header className="bg-[#0f3d64] text-white shadow-md">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div 
            onClick={onEditCompany}
            className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors"
            title="Chỉnh sửa thông tin công ty"
          >
            <Building2 className="w-6 h-6 text-sky-200" />
          </div>
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide flex items-center gap-2">
              <span>{config.name}</span>
            </h1>
            <p className="text-xs text-sky-100 flex items-center gap-2 mt-0.5">
              <Calendar className="w-3.5 h-3.5 opacity-80" />
              <span>{config.period}</span>
              <span className="opacity-40">•</span>
              <span>Ngày chi trả: <strong>{config.paymentDate}</strong></span>
              <span className="opacity-40">•</span>
              <span>Ngày công chuẩn: <strong>{config.standardWorkDays} ngày</strong></span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Zalo OA Buttons */}
          {onOpenBatchZalo && (
            <button
              id="btn-header-batch-zalo"
              onClick={onOpenBatchZalo}
              className="px-3 py-1.5 bg-[#0068FF] hover:bg-[#0052cc] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap border border-blue-400"
              title="Gửi phiếu lương tự động qua Zalo OA cho toàn bộ công nhân & nhân viên"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>Gửi Zalo OA</span>
            </button>
          )}

          {onOpenZaloSettings && (
            <button
              id="btn-header-zalo-settings"
              onClick={onOpenZaloSettings}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-sky-100 rounded text-xs font-medium flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title="Cấu hình Zalo OA (Access Token, OA ID, Template ZNS)"
            >
              <Settings className="w-3.5 h-3.5 text-sky-200" />
              <span>Cài đặt OA</span>
              {isZaloReady && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="Đã có cấu hình Zalo OA" />
              )}
            </button>
          )}

          <button
            id="btn-upload-payroll"
            onClick={onOpenImport}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>↑ Nạp bảng lương</span>
          </button>
          <button
            id="btn-export-bank"
            onClick={onOpenBankExport}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>↓ Xuất CK (CSV)</span>
          </button>
        </div>
      </div>
    </header>
  );
};

