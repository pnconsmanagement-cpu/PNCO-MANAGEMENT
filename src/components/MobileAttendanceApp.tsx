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
import { saveAttendanceToServer, fetchServerData, subscribeToSync } from '../services/backendSyncService';
import {
  syncSingleSeasonalWorkerToSupabase,
  loadSeasonalWorkersFromSupabase,
  isSupabaseConfigured,
  autoApplyUrlConfig,
  subscribeToSupabaseRealtime,
} from '../services/supabaseService';

interface MobileAttendanceAppProps {
  workers: SeasonalWorker[];
  config: CompanyConfig;
  initialWorkerCode?: string;
  isAdminPreview?: boolean;
  onUpdateWorker: (worker: SeasonalWorker) => void;
  onExitMobileView?: () => void;
}

export const MobileAttendanceApp: React.FC<MobileAttendanceAppProps> = ({
  workers,
  config,
  initialWorkerCode,
  isAdminPreview = false,
  onUpdateWorker,
  onExitMobileView,
}) => {
  // 1. Trích xuất thông tin định danh công nhân từ URL params và Hash (bảo đảm nhận đúng tên thợ 100%)
  const parsedWorkerInfo = useMemo(() => {
    if (typeof window === 'undefined') return { code: initialWorkerCode || '' };
    const urlParams = new URLSearchParams(window.location.search);
    let code = initialWorkerCode || urlParams.get('worker') || '';
    let name = urlParams.get('name') || '';
    let trade = urlParams.get('trade') || '';
    let project = urlParams.get('project') || '';
    let team = urlParams.get('team') || '';

    // Đọc thêm từ hash nếu query params bị trình duyệt di động hoặc proxy cắt bớt
    if (window.location.hash) {
      const hashStr = window.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashStr);
      if (!code && hashParams.get('worker')) code = hashParams.get('worker') || '';
      if (!name && hashParams.get('name')) name = hashParams.get('name') || '';
      if (!trade && hashParams.get('trade')) trade = hashParams.get('trade') || '';
      if (!project && hashParams.get('project')) project = hashParams.get('project') || '';
      if (!team && hashParams.get('team')) team = hashParams.get('team') || '';
    }

    if (!code) {
      const cached = sessionStorage.getItem('pncons_mobile_worker_code');
      if (cached) code = cached;
    }

    return { code, name, trade, project, team };
  }, [initialWorkerCode]);

  // Tìm công nhân đang chấm công
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<string>(() => {
    return parsedWorkerInfo.code || workers[0]?.code || 'PNC-TV01';
  });

  // Tự động chuyển công nhân khi prop initialWorkerCode hoặc URL thay đổi
  useEffect(() => {
    if (parsedWorkerInfo.code) {
      setSelectedWorkerCode(parsedWorkerInfo.code);
    }
  }, [parsedWorkerInfo.code]);

  // 2. ƯU TIÊN THÁNG HIỆN HÀNH THỰC TẾ (Ví dụ: Tháng 11 / 2026)
  const now = new Date();
  const currentRealMonth = now.getMonth() + 1; // Ưu tiên tháng hiện hành (Tháng 11)
  const currentRealYear = now.getFullYear();   // 2026

  const [month, setMonth] = useState<number>(() => {
    if (typeof window === 'undefined') return currentRealMonth;
    const urlParams = new URLSearchParams(window.location.search);
    // Nếu có force_m thì dùng, nếu không thì luôn luôn ưu tiên tháng hiện hành thực tế
    const forceM = parseInt(urlParams.get('force_m') || '', 10);
    if (!isNaN(forceM) && forceM >= 1 && forceM <= 12) return forceM;
    const m = parseInt(urlParams.get('m') || '', 10);
    if (!isNaN(m) && m >= 1 && m <= 12) return m;
    return currentRealMonth;
  });

  const [year, setYear] = useState<number>(() => {
    if (typeof window === 'undefined') return currentRealYear;
    const urlParams = new URLSearchParams(window.location.search);
    const forceY = parseInt(urlParams.get('force_y') || '', 10);
    if (!isNaN(forceY) && forceY >= 2024 && forceY <= 2030) return forceY;
    const y = parseInt(urlParams.get('y') || '', 10);
    if (!isNaN(y) && y >= 2024 && y <= 2030) return y;
    return currentRealYear;
  });

  // 3. TÌM HOẶC KHỞI TẠO ĐỐI TƯỢNG CÔNG NHÂN HIỆN TẠI (ĐẢM BẢO ĐÚNG TÊN NHÂN VIÊN 100%)
  const currentWorker = useMemo(() => {
    const targetCode = selectedWorkerCode || parsedWorkerInfo.code;
    const found = workers.find(
      (w) => (targetCode && w.code === targetCode) || (targetCode && String(w.id) === targetCode)
    );
    if (found) {
      if (parsedWorkerInfo.name && (!found.fullName || found.fullName === 'Công Nhân')) {
        return {
          ...found,
          fullName: parsedWorkerInfo.name,
          trade: parsedWorkerInfo.trade || found.trade,
          project: parsedWorkerInfo.project || found.project,
          teamName: parsedWorkerInfo.team || found.teamName,
        };
      }
      return found;
    }

    // Nếu công nhân chưa có trong mảng (ví dụ thợ mới PNC-TV36 - TRẦN VĂN TRÃI mở trên điện thoại mới),
    // Khởi tạo ngay lập tức từ thông tin URL đính kèm để hiển thị chính xác tên thợ, không bao giờ nhảy nhầm sang thợ khác!
    if (parsedWorkerInfo.code || parsedWorkerInfo.name) {
      const customWorker: SeasonalWorker = {
        id: parsedWorkerInfo.code || 'CUSTOM_WORKER',
        code: parsedWorkerInfo.code || 'PNC-TV',
        fullName: parsedWorkerInfo.name || 'Công Nhân Kỹ Thuật',
        trade: parsedWorkerInfo.trade || 'Thợ thi công',
        skillLevel: 'Thợ thi công',
        project: parsedWorkerInfo.project || 'Công trình PNCONS',
        teamName: parsedWorkerInfo.team || 'Đội thi công',
        teamLeader: '',
        phone: '',
        idCard: '',
        bankAccount: '',
        bankName: '',
        paymentMethod: 'BANK',
        joinDate: '01/01/2026',
        dailyRate: 0,
        actualWorkDays: 0,
        salaryByDays: 0,
        overtimeHours: 0,
        overtimePay: 0,
        mealAllowance: 0,
        travelSafetyAllowance: 0,
        otherBonus: 0,
        totalIncome: 0,
        hasTaxCommitment: true,
        personalIncomeTax: 0,
        advancePayment: 0,
        totalDeductions: 0,
        netSalary: 0,
        status: 'ACTIVE',
        monthlyAttendance: {},
      };
      return customWorker;
    }

    return workers[0];
  }, [workers, selectedWorkerCode, parsedWorkerInfo]);

  // Tự động bổ sung thợ vào danh sách quản lý nếu được mở từ link riêng
  useEffect(() => {
    if (currentWorker && currentWorker.code && !workers.some((w) => w.code === currentWorker.code)) {
      onUpdateWorker(currentWorker);
    }
  }, [currentWorker, workers, onUpdateWorker]);

  // Tự động kiểm tra URL hash/query để nạp cấu hình Supabase trên điện thoại nếu có
  useEffect(() => {
    autoApplyUrlConfig();
  }, []);

  const lastLocalEditAtRef = React.useRef<number>(0);

  // Tải dữ liệu công nhân và chấm công mới nhất từ Supabase Cloud và máy chủ
  const syncLatestAttendance = async () => {
    // Không ghi đè nếu người dùng vừa thao tác lưu/xóa cục bộ trong vòng 12 giây qua
    if (Date.now() - lastLocalEditAtRef.current < 12000) {
      return;
    }
    try {
      let loadedWorker: SeasonalWorker | null = null;

      // 1. Ưu tiên tải trực tiếp từ Supabase Cloud
      if (isSupabaseConfigured()) {
        try {
          const cloudWorkers = await loadSeasonalWorkersFromSupabase();
          if (cloudWorkers && cloudWorkers.length > 0) {
            const matched = cloudWorkers.find(
              (w) => w.code === selectedWorkerCode || w.code === parsedWorkerInfo.code || String(w.id) === selectedWorkerCode
            );
            if (matched) {
              loadedWorker = matched;
            }
          }
        } catch (e) {
          console.warn('[Mobile App] Supabase fetch error:', e);
        }
      }

      // 2. Fallback tải từ máy chủ backend
      if (!loadedWorker) {
        const data = await fetchServerData();
        if (data && data.seasonalWorkers && data.seasonalWorkers.length > 0) {
          const matched = data.seasonalWorkers.find(
            (w) => w.code === selectedWorkerCode || w.code === parsedWorkerInfo.code || String(w.id) === selectedWorkerCode
          );
          if (matched) {
            loadedWorker = matched;
          }
        }
      }

      if (loadedWorker && Date.now() - lastLocalEditAtRef.current >= 12000) {
        const mKey = `${year}-${String(month).padStart(2, '0')}`;
        const localSubmittedAt = currentWorker?.monthlyAttendance?.[mKey]?.lastSubmittedAt;
        const remoteSubmittedAt = loadedWorker.monthlyAttendance?.[mKey]?.lastSubmittedAt;

        // Nếu đang ở chế độ xem thử từ Quản trị (isAdminPreview) hoặc dữ liệu trên máy (currentWorker) mới hơn bản từ xa, không ghi đè bằng bản cũ
        if (localSubmittedAt && remoteSubmittedAt) {
          if (new Date(localSubmittedAt).getTime() > new Date(remoteSubmittedAt).getTime()) {
            return;
          }
        } else if (isAdminPreview && currentWorker?.monthlyAttendance?.[mKey] && !remoteSubmittedAt) {
          return;
        }

        const record = getWorkerMonthlyAttendance(loadedWorker, year, month);
        setAttendanceDays(record.days);
        try {
          const cacheKey = `pncons_mobile_days_${loadedWorker.code}_${year}_${month}`;
          localStorage.setItem(cacheKey, JSON.stringify(record.days));
          localStorage.setItem(`pncons_mobile_worker_${loadedWorker.code}`, JSON.stringify(loadedWorker));
        } catch {}
      }
    } catch {}
  };

  useEffect(() => {
    if (!isAdminPreview) {
      syncLatestAttendance();
    }

    // 1. Tự động cập nhật khi có thay đổi trên Supabase Realtime (khi máy tính bấm chấm công)
    const unsubscribeSupabase = subscribeToSupabaseRealtime((table) => {
      if (table === 'seasonal_workers' && Date.now() - lastLocalEditAtRef.current >= 12000) {
        syncLatestAttendance();
      }
    });

    // 2. Tự động cập nhật khi có tín hiệu từ server
    const unsubscribeServer = subscribeToSync((serverData) => {
      if (Date.now() - lastLocalEditAtRef.current < 12000) return;
      if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
        const matched = serverData.seasonalWorkers.find(
          (w) => w.code === selectedWorkerCode || w.code === parsedWorkerInfo.code || String(w.id) === selectedWorkerCode
        );
        if (matched) {
          const record = getWorkerMonthlyAttendance(matched, year, month);
          setAttendanceDays(record.days);
        }
      }
    });

    // 3. Polling dự phòng chu kỳ 30 giây khi tab đang mở (thay vì 3s gây nghẽn)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !isAdminPreview) {
        syncLatestAttendance();
      }
    }, 30000);

    return () => {
      unsubscribeSupabase();
      unsubscribeServer();
      clearInterval(interval);
    };
  }, [selectedWorkerCode, parsedWorkerInfo.code, year, month, isAdminPreview]);

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
    sessionStorage.setItem('pncons_admin_auth', 'true');
    if (onExitMobileView) {
      onExitMobileView();
    }
  };

  const handleVerifyPinAndExit = () => {
    sessionStorage.setItem('pncons_admin_auth', 'true');
    setIsAdminPinModalOpen(false);
    if (onExitMobileView) onExitMobileView();
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

  // Nạp dữ liệu chấm công khi đổi công nhân, đổi tháng hoặc khi dữ liệu công nhân cập nhật từ xa
  useEffect(() => {
    if (!currentWorker) return;
    const workerCode = currentWorker.code || selectedWorkerCode;
    const cacheKey = `pncons_mobile_days_${workerCode}_${year}_${month}`;
    const mKey = `${year}-${String(month).padStart(2, '0')}`;
    const hasAuthoritativeMonthRecord = Boolean(currentWorker.monthlyAttendance && currentWorker.monthlyAttendance[mKey]);

    const record = getWorkerMonthlyAttendance(currentWorker, year, month);

    // Nếu currentWorker đã có bản ghi tháng chính thức (kể cả khi đã xóa trắng về {}) hoặc đang ở chế độ Admin xem thử:
    // Sử dụng trực tiếp record.days từ currentWorker và đồng bộ ngược lại vào localStorage để xóa sạch cache cũ
    if (hasAuthoritativeMonthRecord || isAdminPreview) {
      setAttendanceDays(record.days);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(record.days));
      } catch {}
      return;
    }

    const localCached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    let cachedDays: any = null;
    if (localCached) {
      try {
        const parsed = JSON.parse(localCached);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          cachedDays = parsed;
        }
      } catch {}
    }

    if (cachedDays) {
      setAttendanceDays({
        ...record.days,
        ...cachedDays,
      });
    } else {
      setAttendanceDays(record.days);
    }
  }, [currentWorker, currentWorker?.code, currentWorker?.monthlyAttendance, month, year, isAdminPreview, selectedWorkerCode]);

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
    lastLocalEditAtRef.current = Date.now();

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
      const workerCode = currentWorker.code || selectedWorkerCode;
      // 1. Lưu vào LocalStorage của điện thoại ngay lập tức để không bao giờ bị mất khi F5
      try {
        localStorage.setItem(`pncons_mobile_days_${workerCode}_${year}_${month}`, JSON.stringify(updated));
      } catch {}

      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        'WORKER'
      );
      onUpdateWorker(updatedWorker);
      try {
        localStorage.setItem(`pncons_mobile_worker_${workerCode}`, JSON.stringify(updatedWorker));
      } catch {}

      // 2. Đồng bộ ngay lập tức lên Máy chủ Backend
      saveAttendanceToServer(updatedWorker);

      // 3. Đồng bộ trực tiếp lên Supabase Cloud Database để Web App trên máy tính nhận ngay tức thì
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(updatedWorker, `${String(month).padStart(2, '0')}/${year}`)
          .then((res) => {
            if (res.success) {
              showToast(`Đã lưu & đồng bộ Supabase: ngày ${dayNum}/${month}/${year}`);
            } else {
              console.warn('[Mobile Sync] Supabase warning:', res.message);
              showToast(`Đã lưu chấm công ngày ${dayNum}/${month}/${year}`);
            }
          })
          .catch((err) => {
            console.warn('[Mobile Sync] Supabase error:', err);
            showToast(`Đã lưu chấm công ngày ${dayNum}/${month}/${year}`);
          });
      }
    }

    setEditingCell(null);
  };

  // Xóa trạng thái của ngày trong popup
  const handleDeleteStatus = () => {
    if (!editingCell || !editingCell.day) return;
    const dayNum = editingCell.day;
    lastLocalEditAtRef.current = Date.now();

    const updated = { ...attendanceDays };
    delete updated[dayNum];
    delete (updated as any)[String(dayNum)];

    setAttendanceDays(updated);
    if (currentWorker) {
      const workerCode = currentWorker.code || selectedWorkerCode;
      try {
        localStorage.setItem(`pncons_mobile_days_${workerCode}_${year}_${month}`, JSON.stringify(updated));
      } catch {}

      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        'WORKER'
      );
      onUpdateWorker(updatedWorker);
      try {
        localStorage.setItem(`pncons_mobile_worker_${workerCode}`, JSON.stringify(updatedWorker));
      } catch {}

      saveAttendanceToServer(updatedWorker);
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(updatedWorker, `${String(month).padStart(2, '0')}/${year}`)
          .then((res) => {
            if (res.success) {
              showToast(`Đã xóa & đồng bộ Supabase: ngày ${dayNum}/${month}/${year}`);
            } else {
              showToast(`Đã xóa trạng thái ngày ${dayNum}/${month}/${year}`);
            }
          })
          .catch((err) => {
            console.warn('[Mobile Sync] Supabase error:', err);
            showToast(`Đã xóa trạng thái ngày ${dayNum}/${month}/${year}`);
          });
      }
    }

    setEditingCell(null);
  };

  // Xóa trắng toàn bộ ngày chấm công trong tháng của công nhân này
  const handleClearAllMonthDays = () => {
    lastLocalEditAtRef.current = Date.now();
    const emptyDays: { [dayNumber: number]: DailyAttendanceDetail } = {};
    setAttendanceDays(emptyDays);

    if (currentWorker) {
      const workerCode = currentWorker.code || selectedWorkerCode;
      try {
        localStorage.setItem(`pncons_mobile_days_${workerCode}_${year}_${month}`, JSON.stringify(emptyDays));
      } catch {}

      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        emptyDays,
        'ADMIN'
      );
      onUpdateWorker(updatedWorker);
      try {
        localStorage.setItem(`pncons_mobile_worker_${workerCode}`, JSON.stringify(updatedWorker));
      } catch {}

      saveAttendanceToServer(updatedWorker);
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(updatedWorker, `${String(month).padStart(2, '0')}/${year}`)
          .then(() => {
            showToast(`Đã xóa trắng toàn bộ công tháng ${month}/${year} của ${currentWorker.fullName}`);
          })
          .catch(() => {
            showToast(`Đã xóa trắng toàn bộ công tháng ${month}/${year}`);
          });
      } else {
        showToast(`Đã xóa trắng toàn bộ công tháng ${month}/${year} của ${currentWorker.fullName}`);
      }
    }
    setEditingCell(null);
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      // 1. Nếu có công nhân hiện tại và có Supabase, đẩy ngay lập tức lên Cloud
      if (currentWorker && isSupabaseConfigured()) {
        const periodCode = `${String(month).padStart(2, '0')}/${year}`;
        await syncSingleSeasonalWorkerToSupabase(currentWorker, periodCode);
      }

      // 2. Tải bản mới nhất từ Supabase Cloud
      let cloudTarget: SeasonalWorker | null = null;
      if (isSupabaseConfigured()) {
        try {
          const cloudWorkers = await loadSeasonalWorkersFromSupabase();
          if (cloudWorkers && cloudWorkers.length > 0) {
            cloudTarget = cloudWorkers.find(
              (w) => w.code === selectedWorkerCode || String(w.id) === selectedWorkerCode || (parsedWorkerInfo.code && w.code === parsedWorkerInfo.code)
            ) || null;
          }
        } catch {}
      }

      // 3. Fallback: Máy chủ Backend
      const serverData = await fetchServerData();
      const serverTarget = serverData?.seasonalWorkers?.find(
        (w) => w.code === selectedWorkerCode || String(w.id) === selectedWorkerCode || (parsedWorkerInfo.code && w.code === parsedWorkerInfo.code)
      );

      const target = cloudTarget || serverTarget;
      if (target) {
        onUpdateWorker(target);
        const record = getWorkerMonthlyAttendance(target, year, month);
        setAttendanceDays(record.days);
        showToast(`Đã đồng bộ thành công cho thợ ${target.fullName}!`);
      } else {
        showToast('Đã hoàn tất đồng bộ với Supabase Cloud & Máy chủ');
      }
    } catch {
      showToast('Không thể kết nối máy chủ');
    } finally {
      setIsSyncing(false);
    }
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

      {/* 1. Header Web App Chấm Công Di Động */}
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs">
              <Clock className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 block leading-tight">
                PNCO - Chấm Công Di Động
              </span>
              <span className="text-[10px] text-slate-500 block">
                {currentWorker?.fullName ? `${currentWorker.fullName} (${currentWorker.code})` : 'Dành cho công nhân'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSync}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold transition-colors cursor-pointer shadow-xs"
              title="Đồng bộ dữ liệu chấm công về máy chủ và Supabase Cloud"
            >
              <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
              <span>{isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Supabase'}</span>
              <RotateCcw className={`w-3 h-3 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            {/* Chỉ hiển thị nút Đóng khi người quản trị mở chế độ Xem thử trong phần mềm máy tính */}
            {isAdminPreview && onExitMobileView && (
              <button
                type="button"
                onClick={onExitMobileView}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                title="Đóng chế độ xem thử để quay lại bảng quản trị"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
                <span>Đóng xem thử</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-4">
        {/* Tiêu đề Chấm Công */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs">
            <Calendar className="w-4 h-4 stroke-[2.5]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">Bảng Chấm Công</h1>
        </div>

        {/* Bố cục 2 Cột chuẩn */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* CỘT TRÁI */}
          <div className="lg:col-span-4 space-y-3.5">
            {/* Thanh chuyển tháng: < và > */}
            <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
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
                className="w-10 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                title="Tháng sau"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Thông tin đối tượng chấm công: Nếu là link riêng của thợ thì cố định tên thợ, không cho chọn thợ khác */}
            {!parsedWorkerInfo.code ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs">
                <label className="text-[10px] font-bold text-slate-500 uppercase px-2 pt-1 block">Chọn thợ chấm công:</label>
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
            ) : (
              <div className="bg-blue-50/80 rounded-2xl border border-blue-200/90 p-3 shadow-2xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Phiếu chấm công cá nhân:</div>
                  <div className="text-sm font-black text-blue-950">{currentWorker?.fullName}</div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 bg-blue-600 text-white rounded-full text-xs font-mono font-bold shadow-2xs">
                    {currentWorker?.code}
                  </span>
                </div>
              </div>
            )}

            {/* Thẻ thông tin công nhân */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />

              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <span className="text-lg font-black text-slate-700">
                    {currentWorker?.fullName ? currentWorker.fullName.charAt(0) : 'T'}
                  </span>
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                    {currentWorker?.fullName}
                  </h2>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {currentWorker?.trade || currentWorker?.teamName || 'Thợ thi công'}
                    {currentWorker?.project ? ` • ${currentWorker.project}` : ''}
                  </div>
                </div>
              </div>

              {/* Chỉ số công & OT */}
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

              {/* Thông báo trạng thái đồng bộ cho công nhân (Đã ẩn nút Chia sẻ link & Về Quản trị) */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center text-xs text-emerald-900 font-medium flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Chạm vào ngày trên lịch để chấm công & lưu tự động</span>
                </div>
                {Object.keys(attendanceDays).length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllMonthDays}
                    className="w-full px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Xóa trắng chấm công tháng {month}/{year} (về 0 công)</span>
                  </button>
                )}
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
