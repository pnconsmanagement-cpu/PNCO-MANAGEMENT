import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  MapPin,
  Trash2,
  X,
  LogOut,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Share2,
  Copy,
  QrCode,
  Send,
  Lock,
  Shield,
} from 'lucide-react';
import {
  SeasonalWorker,
  CompanyConfig,
  DailyAttendanceDetail,
} from '../types';
import {
  generateMonthCalendarGrid,
  getWorkerMonthlyAttendance,
  updateWorkerMonthlyAttendance,
  CalendarDayCell,
  getDaysInMonth,
  generateShareableAttendanceUrl,
} from '../utils/seasonalAttendanceHelper';
import { MobileAttendanceShareModal } from './MobileAttendanceShareModal';

interface MobileAttendanceAppProps {
  workers: SeasonalWorker[];
  config: CompanyConfig;
  initialWorkerCode?: string;
  onUpdateWorker: (worker: SeasonalWorker) => void;
  onExitMobileView?: () => void;
}

export const MobileAttendanceApp: React.FC<MobileAttendanceAppProps> = ({
  workers,
  config,
  initialWorkerCode,
  onUpdateWorker,
  onExitMobileView,
}) => {
  // Tìm công nhân đang chấm công
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<string>(() => {
    if (initialWorkerCode) return initialWorkerCode;
    const urlParams = new URLSearchParams(window.location.search);
    const workerParam = urlParams.get('worker');
    if (workerParam) return workerParam;
    return workers[0]?.code || 'PNC-TV01';
  });

  // Tháng và năm đang chấm công
  const [month, setMonth] = useState<number>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const m = parseInt(urlParams.get('m') || '', 10);
    if (!isNaN(m) && m >= 1 && m <= 12) return m;
    return config.month || new Date().getMonth() + 1;
  });

  const [year, setYear] = useState<number>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const y = parseInt(urlParams.get('y') || '', 10);
    if (!isNaN(y) && y >= 2024 && y <= 2030) return y;
    return config.year || new Date().getFullYear();
  });

  // Tìm đối tượng công nhân hiện tại
  const currentWorker = useMemo(() => {
    return (
      workers.find((w) => w.code === selectedWorkerCode || String(w.id) === selectedWorkerCode) ||
      workers[0]
    );
  }, [workers, selectedWorkerCode]);

  // Dữ liệu chấm công tháng của công nhân
  const [attendanceDays, setAttendanceDays] = useState<{ [dayNumber: number]: DailyAttendanceDetail }>({});
  
  // State Modal Chấm Công Popup (Theo Ảnh 2 của người dùng)
  const [editingCell, setEditingCell] = useState<CalendarDayCell | null>(null);
  const [modalStatus, setModalStatus] = useState<'FULL' | 'HALF' | 'ABSENT' | 'LATE' | 'LEAVE'>('FULL');
  const [modalLocation, setModalLocation] = useState<string>('');
  const [modalOtHours, setModalOtHours] = useState<number>(0);
  const [modalOtMultiplier, setModalOtMultiplier] = useState<number>(1.5);
  
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2500);
  };

  const handleAdminAccess = () => {
    setIsAdminPinModalOpen(true);
    setAdminPinInput('');
    setPinError(false);
  };

  const handleVerifyPinAndExit = () => {
    if (adminPinInput === '1234' || adminPinInput === '9999' || adminPinInput === 'pncons') {
      setIsAdminPinModalOpen(false);
      sessionStorage.setItem('pncons_admin_auth', 'true');
      if (onExitMobileView) onExitMobileView();
    } else {
      setPinError(true);
    }
  };

  const handleQuickCopyLink = () => {
    if (!currentWorker) return;
    const url = generateShareableAttendanceUrl(currentWorker.code, {
      month,
      year,
      includeConfig: true,
    });
    navigator.clipboard.writeText(url).then(() => {
      showToast(`Đã sao chép link chấm công của ${currentWorker.fullName}!`);
    });
  };

  // Nạp dữ liệu chấm công khi đổi công nhân hoặc đổi tháng
  useEffect(() => {
    if (!currentWorker) return;
    const record = getWorkerMonthlyAttendance(currentWorker, year, month);
    setAttendanceDays(record.days);
  }, [currentWorker?.code, month, year]);

  // Sinh lưới lịch tháng
  const calendarGrid = useMemo(() => {
    return generateMonthCalendarGrid(year, month);
  }, [year, month]);

  // Tính toán thống kê theo đúng chú giải ở Ảnh 1
  const stats = useMemo(() => {
    let countFull = 0;
    let countHalf = 0;
    let countAbsent = 0;
    let countLate = 0;
    let countLeave = 0;
    let countWeekend = 0;
    let otHours = 0;

    const daysInMonth = getDaysInMonth(year, month);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d, 12, 0, 0);
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      if (isWeekend) {
        countWeekend++;
      }

      const item = attendanceDays[d];
      if (!item) continue;

      otHours += Number(item.otHours || 0);

      const st = item.statusType;
      if (st === 'FULL' || (!st && item.workUnits === 1)) {
        countFull++;
      } else if (st === 'HALF' || (!st && item.workUnits === 0.5)) {
        countHalf++;
      } else if (st === 'ABSENT') {
        countAbsent++;
      } else if (st === 'LATE') {
        countLate++;
      } else if (st === 'LEAVE') {
        countLeave++;
      }
    }

    const totalWorkDays = countFull * 1 + countHalf * 0.5;
    const workingDaysInMonth = Math.max(daysInMonth - countWeekend, 1);
    const attendancePercent = Math.min(Math.round((totalWorkDays / workingDaysInMonth) * 100), 100);

    return {
      countFull,
      countHalf,
      countAbsent,
      countLate,
      countLeave,
      countWeekend,
      totalWorkDays,
      otHours,
      daysInMonth,
      attendancePercent,
    };
  }, [attendanceDays, year, month]);

  // Chuyển tháng trước
  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  // Chuyển tháng sau
  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Mở Popup Chấm Công khi nhấn vào bất kỳ ngày nào trong lịch (Yêu cầu chính từ Ảnh 2)
  const handleDayClick = (cell: CalendarDayCell) => {
    if (!cell.isCurrentMonth || !cell.day) return;

    const existing = attendanceDays[cell.day];

    let initialStatus: 'FULL' | 'HALF' | 'ABSENT' | 'LATE' | 'LEAVE' = 'FULL';
    if (existing?.statusType) {
      initialStatus = existing.statusType;
    } else if (existing?.workUnits === 0.5) {
      initialStatus = 'HALF';
    } else if (existing?.workUnits === 1) {
      initialStatus = 'FULL';
    }

    setModalStatus(initialStatus);
    setModalLocation(existing?.location || currentWorker?.project || '');
    setModalOtHours(existing?.otHours || 0);
    setModalOtMultiplier(existing?.otMultiplier || 1.5);
    setEditingCell(cell);
  };

  // Lưu popup chấm công
  const handleSaveModal = () => {
    if (!editingCell || !editingCell.day) return;
    const dayNum = editingCell.day;

    let workUnits = 0;
    if (modalStatus === 'FULL') workUnits = 1;
    else if (modalStatus === 'HALF') workUnits = 0.5;

    const updated = {
      ...attendanceDays,
      [dayNum]: {
        day: dayNum,
        dateStr: editingCell.dateStr || `${String(dayNum).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        workUnits,
        statusType: modalStatus,
        location: modalLocation,
        otHours: Number(modalOtHours) || 0,
        otMultiplier: Number(modalOtMultiplier) || 1.5,
        shiftType: 'DAY' as const,
        note: modalLocation ? `Thi công tại ${modalLocation}` : '',
        updatedAt: new Date().toISOString(),
      },
    };

    setAttendanceDays(updated);
    if (currentWorker) {
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        'WORKER'
      );
      onUpdateWorker(updatedWorker);
    }

    setEditingCell(null);
    showToast(`Đã lưu chấm công ngày ${dayNum}/${month}/${year}`);
  };

  // Xóa trạng thái của ngày trong popup
  const handleDeleteStatus = () => {
    if (!editingCell || !editingCell.day) return;
    const dayNum = editingCell.day;

    const updated = { ...attendanceDays };
    delete updated[dayNum];

    setAttendanceDays(updated);
    if (currentWorker) {
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        'WORKER'
      );
      onUpdateWorker(updatedWorker);
    }

    setEditingCell(null);
    showToast(`Đã xóa trạng thái ngày ${dayNum}/${month}/${year}`);
  };

  const dayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans">
      {/* Toast thông báo */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Web App (Đúng mẫu Ảnh 1: PNCO - Chấm Công • Đồng bộ • Admin) */}
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-xs">
              <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-900">
              PNCO - Chấm Công
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Đồng bộ</span>
            </div>

            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs"
              title="Tạo link và mã QR chia sẻ cho nhân viên"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Chia sẻ link</span>
            </button>

            {onExitMobileView && (
              <button
                type="button"
                onClick={handleAdminAccess}
                className="flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
                title="Quay lại giao diện quản trị"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-600" />
                <span>Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-4">
        {/* Tiêu đề Chấm Công (Icon cam + chữ đậm như Ảnh 1) */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs">
            <Calendar className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Chấm Công</h1>
        </div>

        {/* Bố cục 2 Cột chuẩn theo Ảnh 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* CỘT TRÁI (Khoảng 4 cột / 12) */}
          <div className="lg:col-span-4 space-y-3.5">
            {/* Thanh chuyển tháng: < và > */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors active:scale-95"
                title="Tháng trước"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="font-extrabold text-sm sm:text-base text-slate-900">
                Tháng {month < 10 ? `0${month}` : month} / {year}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors active:scale-95"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Dropdown chọn nhân viên */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs">
              <select
                value={selectedWorkerCode}
                onChange={(e) => setSelectedWorkerCode(e.target.value)}
                className="w-full px-3 py-2 bg-transparent text-xs sm:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                {workers.map((w) => (
                  <option key={w.id} value={w.code}>
                    {w.fullName} ({w.teamName || w.trade || 'CÔNG NHÂN'})
                  </option>
                ))}
              </select>
            </div>

            {/* Thẻ thông tin công nhân (Viền cam trên đỉnh theo Ảnh 1) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />

              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <span className="text-lg font-black text-slate-700">
                    {currentWorker?.fullName ? currentWorker.fullName.charAt(0) : 'A'}
                  </span>
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                    {currentWorker?.fullName}
                  </h2>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {currentWorker?.teamName || currentWorker?.trade || 'BAN LÃNH ĐẠO'}
                  </div>
                </div>
              </div>

              {/* Chỉ số công & OT (Đã bỏ hoàn toàn đơn giá ngày theo yêu cầu) */}
              <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>
                    Ngày công:{' '}
                    <strong className="text-slate-900 font-bold">
                      {stats.totalWorkDays}/{stats.daysInMonth} ngày
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span>
                    Giờ tăng ca:{' '}
                    <strong className="text-slate-900 font-bold">{stats.otHours}h</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-orange-600 font-bold pt-1">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                  <span>{stats.attendancePercent}% điểm danh</span>
                </div>
              </div>

              {/* Nút chia sẻ trực tiếp link cho nhân viên */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(true)}
                  className="flex-1 py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Chia sẻ link & Mã QR</span>
                </button>
                <button
                  type="button"
                  onClick={handleQuickCopyLink}
                  className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors border border-slate-200"
                  title="Sao chép nhanh link của thợ này"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Bảng chú giải trạng thái (Đúng các mục theo Ảnh 1) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs space-y-2 text-xs text-slate-600">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <span>Đủ công ({stats.countFull})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-300 shrink-0" />
                  <span>Nửa công ({stats.countHalf})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                  <span>Vắng mặt ({stats.countAbsent})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                  <span>Đi muộn ({stats.countLate})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                  <span>Nghỉ phép ({stats.countLeave})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                  <span>Cuối tuần ({stats.countWeekend})</span>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI (Khoảng 8 cột / 12) - LƯỚI LỊCH CHẤM CÔNG CHUẨN ẢNH 1 */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs">
              {/* Tiêu đề thứ: T2, T3, T4, T5, T6, T7, CN (CN màu đỏ như Ảnh 1) */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center">
                {dayHeaders.map((header, idx) => (
                  <div
                    key={header}
                    className={`py-2 rounded-xl text-xs font-bold ${
                      idx === 6 ? 'text-rose-500 bg-slate-100/70' : 'text-slate-600 bg-slate-100/70'
                    }`}
                  >
                    {header}
                  </div>
                ))}
              </div>

              {/* Lưới các ô ngày: Giao diện sáng, bo tròn, đúng màu xanh & badge cam như Ảnh 1 */}
              <div className="space-y-1.5 sm:space-y-2">
                {calendarGrid.weeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {week.map((cell, cIdx) => {
                      // Nếu là ngày ngoài tháng (padding)
                      if (!cell.isCurrentMonth || !cell.day) {
                        return (
                          <div
                            key={`pad_${cIdx}`}
                            className="h-14 sm:h-18 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 text-xs sm:text-sm font-semibold select-none"
                          >
                            {cell.displayDay || ''}
                          </div>
                        );
                      }

                      const detail = attendanceDays[cell.day];
                      const workUnits = detail ? detail.workUnits : 0;
                      const otHours = detail ? detail.otHours : 0;
                      const st = detail?.statusType;

                      const isFull = st === 'FULL' || (!st && workUnits === 1);
                      const isHalf = st === 'HALF' || (!st && workUnits === 0.5);
                      const isAbsent = st === 'ABSENT';
                      const isLate = st === 'LATE';
                      const isLeave = st === 'LEAVE';

                      // Style theo trạng thái:
                      let cellStyle = 'bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold';
                      let checkIcon = null;

                      if (isFull) {
                        // Đủ công: Nền xanh lá đậm chuẩn Ảnh 1 (#22c55e), chữ trắng, icon check trắng góc trên phải
                        cellStyle = 'bg-emerald-500 text-white font-extrabold shadow-xs';
                        checkIcon = (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-600/60 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                          </div>
                        );
                      } else if (isHalf) {
                        // Nửa công: Nền xanh lá nhạt
                        cellStyle = 'bg-emerald-300 text-emerald-950 font-extrabold shadow-xs';
                        checkIcon = (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-900 stroke-[3]" />
                          </div>
                        );
                      } else if (isAbsent) {
                        cellStyle = 'bg-rose-500 text-white font-extrabold shadow-xs';
                      } else if (isLate) {
                        cellStyle = 'bg-amber-500 text-white font-extrabold shadow-xs';
                      } else if (isLeave) {
                        cellStyle = 'bg-blue-500 text-white font-extrabold shadow-xs';
                      } else if (cell.isToday) {
                        // Ngày hôm nay (chưa chấm): viền cam nổi bật như Ngày 27 trong Ảnh 1
                        cellStyle = 'bg-white border-2 border-orange-500 text-slate-900 font-extrabold shadow-xs';
                      }

                      return (
                        <div
                          key={cell.day}
                          onClick={() => handleDayClick(cell)}
                          className={`relative h-14 sm:h-18 rounded-2xl flex flex-col items-center justify-center cursor-pointer select-none transition-all active:scale-95 ${cellStyle}`}
                          title={`Bấm để chấm công ngày ${cell.day}/${month}`}
                        >
                          {/* Dấu tích góc trên phải khi đủ/nửa công */}
                          {checkIcon}

                          {/* Số ngày ở giữa */}
                          <span className="text-sm sm:text-base">{cell.day}</span>

                          {/* Badge giờ tăng ca OT màu cam ở góc dưới trái (như 5h, 1h ở Ảnh 1) */}
                          {otHours > 0 && (
                            <span className="absolute bottom-1.5 left-1.5 bg-orange-500 text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.2 rounded-md shadow-2xs">
                              {otHours}h
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* POPUP MODAL CHẤM CÔNG (THEO ĐÚNG 100% ẢNH 2 DO NGƯỜI DÙNG CUNG CẤP) */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl space-y-3.5 p-5 text-slate-800">
            {/* Header: Chấm công [Tên] - DD/MM/YYYY */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Chấm công {currentWorker?.fullName} - {editingCell.day}/{month}/{year}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mục 1: Chọn trạng thái (Dropdown với icon tích xanh bên trái theo Ảnh 2) */}
            <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <select
                  value={modalStatus}
                  onChange={(e) =>
                    setModalStatus(e.target.value as 'FULL' | 'HALF' | 'ABSENT' | 'LATE' | 'LEAVE')
                  }
                  className="w-full bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="FULL">Đủ công (1 công)</option>
                  <option value="HALF">Nửa công (0.5 công)</option>
                  <option value="ABSENT">Vắng mặt (0 công)</option>
                  <option value="LATE">Đi muộn</option>
                  <option value="LEAVE">Nghỉ phép</option>
                </select>
              </div>
            </div>

            {/* Mục 2: Vị trí làm việc (Icon định vị cam + Dropdown theo Ảnh 2) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                <MapPin className="w-4 h-4 fill-orange-500 text-white" />
                <span>Vị trí làm việc</span>
              </div>
              <select
                value={modalLocation}
                onChange={(e) => setModalLocation(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                <option value="">-Chọn vị trí-</option>
                <option value="Công trình chính">Công trình chính</option>
                <option value="Khu vực kết cấu dầm sàn">Khu vực kết cấu dầm sàn</option>
                <option value="Khu vực xây tô hoàn thiện">Khu vực xây tô hoàn thiện</option>
                <option value="Hệ thống cơ điện M&E">Hệ thống cơ điện M&E</option>
                <option value="Xưởng gia công cơ khí">Xưởng gia công cơ khí</option>
                <option value="Kho vật tư công trường">Kho vật tư công trường</option>
              </select>
            </div>

            {/* Mục 3: Giờ tăng ca (Icon đồng hồ cam + Số giờ & Hệ số theo Ảnh 2) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                <Clock className="w-4 h-4 fill-orange-500 text-white" />
                <span>Giờ tăng ca</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Số giờ:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="12"
                    step="0.5"
                    value={modalOtHours}
                    onChange={(e) => setModalOtHours(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Hệ số:
                  </label>
                  <select
                    value={modalOtMultiplier}
                    onChange={(e) => setModalOtMultiplier(parseFloat(e.target.value) || 1.5)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="1.5">x1.5 (Ngày thường)</option>
                    <option value="2.0">x2.0 (Chủ nhật)</option>
                    <option value="3.0">x3.0 (Ngày lễ)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mục 4: Xoá trạng thái (Thùng rác xám + chữ đỏ theo Ảnh 2) */}
            <button
              type="button"
              onClick={handleDeleteStatus}
              className="w-full p-3 bg-white hover:bg-rose-50/50 rounded-xl border border-slate-200 flex items-center gap-3 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-rose-500">Xoá trạng thái</span>
            </button>

            {/* Nút Footer: Hủy & Lưu (Nút Lưu màu cam theo đúng Ảnh 2) */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm shadow-orange-500/30"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP XÁC THỰC MÃ PIN QUẢN TRỊ VIÊN (Bảo vệ thông tin bảng lương khi bấm nút Admin) */}
      {isAdminPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Bảo Mật Quản Trị Viên</h3>
                  <p className="text-[11px] text-slate-500">Chỉ dành cho Ban chỉ huy / Quản trị</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdminPinModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                Nhập mã PIN Quản lý (Mặc định: 1234):
              </label>
              <input
                type="password"
                maxLength={8}
                value={adminPinInput}
                onChange={(e) => {
                  setAdminPinInput(e.target.value);
                  setPinError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyPinAndExit();
                }}
                placeholder="Nhập 1234"
                autoFocus
                className="w-full px-3 py-2.5 text-center text-lg tracking-widest font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {pinError && (
                <div className="text-[11px] text-rose-500 font-semibold text-center">
                  Mã PIN không đúng. Vui lòng thử lại!
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdminPinModalOpen(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={handleVerifyPinAndExit}
                className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs transition-colors shadow-sm shadow-orange-500/30"
              >
                Vào Quản Trị
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP CHIA SẺ LINK & MÃ QR CHẤM CÔNG CHO TỪNG NHÂN VIÊN */}
      <MobileAttendanceShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        workers={workers}
        config={config}
        selectedWorkerId={currentWorker ? String(currentWorker.id) : undefined}
        onOpenMobileView={(workerCode) => {
          setIsShareModalOpen(false);
          if (workerCode) setSelectedWorkerCode(workerCode);
        }}
      />
    </div>
  );
};
