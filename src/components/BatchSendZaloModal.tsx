import React, { useState } from 'react';
import {
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Phone,
  Settings,
  RefreshCw,
  MessageSquare,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { Employee, CompanyConfig } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';
import { sendPayslipViaZaloOA, ZaloSendResult } from '../services/zaloOAService';

interface BatchSendZaloModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  config: CompanyConfig;
  onOpenSettings: () => void;
}

interface ItemStatus {
  employeeId: string;
  status: 'IDLE' | 'SENDING' | 'SUCCESS' | 'ERROR';
  result?: ZaloSendResult;
  errorMsg?: string;
}

export const BatchSendZaloModal: React.FC<BatchSendZaloModalProps> = ({
  isOpen,
  onClose,
  employees,
  config,
  onOpenSettings,
}) => {
  const activeEmployees = employees.filter((e) => e.status !== 'RESIGNED');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(activeEmployees.filter((e) => e.phone && e.phone.trim()).map((e) => e.id || e.code))
  );

  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [isSending, setIsSending] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Hỗ trợ phím ESC để đóng modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSending]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSending) {
      onClose();
    }
  };

  const validEmployees = activeEmployees.filter((e) => e.phone && e.phone.trim());
  const invalidEmployees = activeEmployees.filter((e) => !e.phone || !e.phone.trim());

  const toggleSelectAll = () => {
    if (selectedIds.size === validEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(validEmployees.map((e) => e.id || e.code)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Tiến hành gửi hàng loạt tuần tự
  const handleStartBatchSend = async () => {
    if (selectedIds.size === 0) {
      alert('Vui lòng chọn ít nhất 1 nhân viên để gửi!');
      return;
    }

    setIsSending(true);
    setCompletedCount(0);

    const listToSend = validEmployees.filter((e) => selectedIds.has(e.id || e.code));

    // Khởi tạo trạng thái
    const initialMap: Record<string, ItemStatus> = {};
    listToSend.forEach((e) => {
      initialMap[e.id || e.code] = { employeeId: e.id || e.code, status: 'IDLE' };
    });
    setStatuses(initialMap);

    let count = 0;
    for (const emp of listToSend) {
      const key = emp.id || emp.code;

      // Cập nhật trạng thái đang gửi
      setStatuses((prev) => ({
        ...prev,
        [key]: { employeeId: key, status: 'SENDING' },
      }));

      try {
        const res = await sendPayslipViaZaloOA(emp, config);
        setStatuses((prev) => ({
          ...prev,
          [key]: {
            employeeId: key,
            status: res.success ? 'SUCCESS' : 'ERROR',
            result: res,
            errorMsg: res.error,
          },
        }));
      } catch (err: any) {
        setStatuses((prev) => ({
          ...prev,
          [key]: {
            employeeId: key,
            status: 'ERROR',
            errorMsg: err.message || 'Lỗi gửi tin',
          },
        }));
      }

      count++;
      setCompletedCount(count);

      // Nghỉ 400ms giữa mỗi tin để tránh spam rate limit của Zalo
      await new Promise((r) => setTimeout(r, 400));
    }

    setIsSending(false);
  };

  const totalSelected = selectedIds.size;
  const progressPercent = totalSelected > 0 ? Math.round((completedCount / totalSelected) * 100) : 0;

  const successCount = (Object.values(statuses) as ItemStatus[]).filter((s) => s.status === 'SUCCESS').length;
  const errorCount = (Object.values(statuses) as ItemStatus[]).filter((s) => s.status === 'ERROR').length;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-5 space-y-4 my-6 border border-slate-200 animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0068FF] text-white flex items-center justify-center font-black text-base shadow-sm">
              Zalo
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <span>Gửi Phiếu Lương Hàng Loạt Qua Zalo OA Phúc Nguyên</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-[#0068FF] font-semibold">
                  Kỳ {config.periodCode}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động gửi thông báo chi trả lương chính thức tới toàn bộ công nhân & nhân viên
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs flex items-center gap-1 cursor-pointer"
              title="Cài đặt tài khoản Zalo OA"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Cài đặt OA</span>
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-bold transition cursor-pointer shadow-xs"
              title="Đóng cửa sổ (Nhấn phím Esc hoặc bấm ra ngoài)"
            >
              <X className="w-4 h-4 text-slate-600 hover:text-rose-600" />
              <span>Đóng</span>
              <kbd className="hidden sm:inline-block text-[10px] bg-white border border-slate-300 rounded px-1 text-slate-500 font-mono">Esc</kbd>
            </button>
          </div>
        </div>

        {/* Thanh trạng thái Zalo OA hiện tại */}
        <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0068FF]" />
            <div>
              <span className="font-semibold text-slate-800">
                Gửi từ: <strong>{config.zaloOA?.oaName || config.name}</strong>
              </span>
              <span className="text-slate-500 ml-1.5">
                • Phương thức: <strong>{config.zaloOA?.sendMode === 'OA_MESSAGE' ? 'Zalo OA Chat' : 'ZNS (Số điện thoại)'}</strong>
              </span>
              {config.zaloOA?.isSandbox && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">
                  Chế độ thử nghiệm
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onOpenSettings}
            className="text-[11px] text-[#0068FF] hover:underline font-semibold cursor-pointer self-start sm:self-auto"
          >
            Thay đổi thiết lập OA →
          </button>
        </div>

        {/* Tiến trình gửi nếu đang chạy */}
        {isSending && (
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 shrink-0">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5 text-[#0068FF]">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Đang tự động gửi qua Zalo OA ({completedCount}/{totalSelected})...
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#0068FF] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Thống kê kết quả sau khi gửi */}
        {completedCount > 0 && !isSending && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <span className="font-bold text-emerald-900 block">Hoàn tất quá trình gửi Zalo!</span>
                <span className="text-slate-600">
                  Thành công: <strong className="text-emerald-700">{successCount}</strong> nhân sự | Thất bại:{' '}
                  <strong className="text-rose-600">{errorCount}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Bảng danh sách nhân sự */}
        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[11px] sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === validEmployees.length && validEmployees.length > 0}
                    onChange={toggleSelectAll}
                    disabled={isSending}
                    className="w-4 h-4 rounded text-[#0068FF] focus:ring-[#0068FF]"
                  />
                </th>
                <th className="p-2.5 w-20">Mã NV</th>
                <th className="p-2.5">Họ và tên</th>
                <th className="p-2.5">Bộ phận / Chức danh</th>
                <th className="p-2.5">Số điện thoại Zalo</th>
                <th className="p-2.5 text-right">Lương Thực Lĩnh</th>
                <th className="p-2.5 text-center w-36">Trạng thái gửi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => {
                const key = emp.id || emp.code;
                const isSelected = selectedIds.has(key);
                const hasPhone = Boolean(emp.phone && emp.phone.trim());
                const itemStatus = statuses[key];

                return (
                  <tr
                    key={key}
                    onClick={() => hasPhone && !isSending && toggleSelectOne(key)}
                    className={`hover:bg-blue-50/40 cursor-pointer transition ${
                      isSelected ? 'bg-blue-50/20' : ''
                    } ${!hasPhone ? 'opacity-60 bg-slate-50/50' : ''}`}
                  >
                    <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(key)}
                        disabled={!hasPhone || isSending}
                        className="w-4 h-4 rounded text-[#0068FF] focus:ring-[#0068FF]"
                      />
                    </td>
                    <td className="p-2.5 font-mono font-bold text-sky-900">{emp.code}</td>
                    <td className="p-2.5 font-semibold text-slate-800">{emp.fullName}</td>
                    <td className="p-2.5 text-slate-600">
                      <span>{emp.department}</span>
                      <span className="text-slate-400 block text-[11px]">{emp.title}</span>
                    </td>
                    <td className="p-2.5 font-mono">
                      {hasPhone ? (
                        <span className="text-slate-800 font-medium">{emp.phone}</span>
                      ) : (
                        <span className="text-rose-500 italic text-[11px]">Chưa có SĐT</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-bold text-slate-900">
                      {formatVND(emp.netSalary)}
                    </td>
                    <td className="p-2.5 text-center">
                      {!itemStatus || itemStatus.status === 'IDLE' ? (
                        isSelected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            <Clock className="w-3 h-3" /> Chờ gửi
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Bỏ chọn</span>
                        )
                      ) : itemStatus.status === 'SENDING' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#0068FF] bg-blue-50 px-2 py-0.5 rounded font-semibold animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Đang gửi...
                        </span>
                      ) : itemStatus.status === 'SUCCESS' ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold"
                          title={itemStatus.result?.messageId || 'Đã gửi'}
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Thành công
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-medium"
                          title={itemStatus.errorMsg}
                        >
                          <AlertCircle className="w-3 h-3 text-rose-600" /> Thất bại
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 shrink-0 text-xs">
          <div className="text-slate-600">
            Tổng cộng: <strong>{employees.length}</strong> nhân sự | Đã chọn:{' '}
            <strong className="text-[#0068FF]">{selectedIds.size}</strong> người có SĐT
            {invalidEmployees.length > 0 && (
              <span className="text-amber-600 ml-2">
                ({invalidEmployees.length} người chưa có số điện thoại)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="px-3.5 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Đóng
            </button>

            <button
              type="button"
              onClick={handleStartBatchSend}
              disabled={isSending || selectedIds.size === 0}
              className="px-4 py-2 bg-[#0068FF] hover:bg-[#0052cc] text-white font-bold rounded flex items-center gap-2 transition shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSending
                  ? `Đang gửi (${completedCount}/${totalSelected})...`
                  : `Bắt đầu gửi Zalo OA (${selectedIds.size} nhân sự)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
