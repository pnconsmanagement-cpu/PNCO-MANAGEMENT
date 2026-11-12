import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  TrendingUp,
  RotateCcw,
  Lock,
  Save,
  Cloud,
  AlertTriangle,
} from 'lucide-react';
import {
  SeasonalWorker,
  Employee,
  CompanyConfig,
  DailyAttendanceDetail,
  Project,
} from '../types';
import { initialProjects } from '../data/mockProjectsAndTeams';
import {
  generateMonthCalendarGrid,
  getWorkerMonthlyAttendance,
  updateWorkerMonthlyAttendance,
  CalendarDayCell,
  getDaysInMonth,
} from '../utils/seasonalAttendanceHelper';
import { syncEmployeeForMonth } from '../utils/payrollCalculator';
import { MobileAttendanceShareModal } from './MobileAttendanceShareModal';
import { saveAttendanceToServer, fetchServerData, subscribeToSync } from '../services/backendSyncService';
import {
  syncSingleSeasonalWorkerToSupabase,
  syncSingleEmployeeToSupabase,
  loadSeasonalWorkersFromSupabase,
  loadEmployeesFromSupabase,
  loadProjectsFromSupabase,
  isSupabaseConfigured,
  setSupabaseConfig,
  autoApplyUrlConfig,
  subscribeToSupabaseRealtime,
} from '../services/supabaseService';

type MobileModalStatus = 'FULL' | 'HALF' | 'OT_ONLY' | 'ABSENT' | 'LATE' | 'LEAVE';

interface MobileAttendanceAppProps {
  workers: SeasonalWorker[];
  projects?: Project[];
  config: CompanyConfig;
  initialWorkerCode?: string;
  isAdminPreview?: boolean;
  onUpdateWorker: (worker: SeasonalWorker) => void;
  onSaveWorkerAttendance?: (
    worker: SeasonalWorker,
    year: number,
    month: number
  ) => Promise<{ cloudSaved: boolean; savedAt: string }>;
  onSaveData?: () => Promise<void> | void;
  onExitMobileView?: () => void;
}

function convertEmployeeToMobileWorker(
  e: Employee,
  standardWorkDays: number = 26
): SeasonalWorker {
  const w: SeasonalWorker = {
    id: e.code || `PERM_${e.id}`,
    code: e.code,
    fullName: e.fullName,
    trade: e.title || 'Nhân viên chính thức',
    skillLevel: e.department || 'Chính thức',
    project: e.department || 'Văn phòng / Dự án',
    teamName: e.department || 'Phòng ban',
    teamLeader: '',
    phone: e.phone || '',
    idCard: e.idCard || '',
    bankAccount: e.bankAccount || '',
    bankName: e.bankName || '',
    paymentMethod: 'BANK',
    joinDate: e.joinDate || '',
    dailyRate:
      e.salaryType === 'DAILY'
        ? e.baseSalary
        : Math.round((e.baseSalary || 0) / (e.standardWorkDays || standardWorkDays || 26)),
    actualWorkDays: e.actualWorkDays || 0,
    salaryByDays: e.salaryByActualDays || 0,
    overtimeHours: e.overtimeHours || 0,
    overtimePay: e.overtimePay || 0,
    mealAllowance: e.mealAllowance || 0,
    travelSafetyAllowance: e.phoneTravelAllowance || 0,
    otherBonus: e.kpiBonus || 0,
    totalIncome: e.totalIncome || 0,
    hasTaxCommitment: true,
    personalIncomeTax: e.personalIncomeTax || 0,
    advancePayment: e.advancePayment || 0,
    totalDeductions: e.totalDeductions || 0,
    netSalary: e.netSalary || 0,
    status: 'ACTIVE',
    monthlyAttendance: e.monthlyAttendance,
    periodRecords: e.periodRecords,
    payrollCycleType: e.payrollCycleType || '1_MONTH',
    currentPeriodKey: e.currentPeriodKey,
  };
  (w as any).__isPermanentEmployee = true;
  (w as any).__rawEmployee = e;
  return w;
}

export const MobileAttendanceApp: React.FC<MobileAttendanceAppProps> = ({
  workers,
  projects: propProjects,
  config,
  initialWorkerCode,
  isAdminPreview = false,
  onUpdateWorker,
  onSaveWorkerAttendance,
  onSaveData,
  onExitMobileView,
}) => {
  // 1. Trích xuất thông tin định danh nhân sự từ URL params và Hash (bảo đảm nhận đúng tên nhân viên / thợ 100%)
  const parsedWorkerInfo = useMemo(() => {
    if (typeof window === 'undefined') return { code: initialWorkerCode || '' };
    const urlParams = new URLSearchParams(window.location.search);
    let code = initialWorkerCode || urlParams.get('worker') || '';
    let name = urlParams.get('name') || '';
    let trade = urlParams.get('trade') || '';
    let project = urlParams.get('project') || '';
    let team = urlParams.get('team') || '';

    // Đọc thêm từ hash nếu query params bị trình duyệt di động hoặc Zalo cắt bớt
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

  // Tìm nhân sự đang chấm công
  const [selectedWorkerCode, setSelectedWorkerCode] = useState<string>(() => {
    return parsedWorkerInfo.code || workers[0]?.code || 'PNC-TV01';
  });

  useEffect(() => {
    if (parsedWorkerInfo.code) {
      setSelectedWorkerCode(parsedWorkerInfo.code);
    }
  }, [parsedWorkerInfo.code]);

  // 2. ƯU TIÊN THÁNG HIỆN HÀNH THỰC TẾ (Ví dụ: Tháng 11 / 2026)
  const now = new Date();
  const currentRealMonth = now.getMonth() + 1;
  const currentRealYear = now.getFullYear();

  const [month, setMonth] = useState<number>(() => {
    if (typeof window === 'undefined') return currentRealMonth;
    const urlParams = new URLSearchParams(window.location.search);
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

  // Bản ghi nhân sự tải trực tiếp từ Cloud/Server cho điện thoại mở độc lập
  const [remoteLoadedWorker, setRemoteLoadedWorker] = useState<SeasonalWorker | null>(null);

  // 3. TÌM HOẶC KHỞI TẠO ĐỐI TƯỢNG NHÂN SỰ HIỆN TẠI (ĐẢM BẢO KHÔNG GHI ĐÈ ĐƠN GIÁ LƯƠNG = 0)
  const currentWorker = useMemo(() => {
    const targetCode = selectedWorkerCode || parsedWorkerInfo.code;
    const found = workers.find(
      (w) => (targetCode && w.code === targetCode) || (targetCode && String(w.id) === targetCode)
    );
    if (found) {
      if (remoteLoadedWorker && (remoteLoadedWorker.code === found.code || String(remoteLoadedWorker.id) === String(found.id))) {
        return {
          ...found,
          ...remoteLoadedWorker,
          dailyRate: Number(found.dailyRate || remoteLoadedWorker.dailyRate || 0),
          bankAccount: found.bankAccount || remoteLoadedWorker.bankAccount || '',
          bankName: found.bankName || remoteLoadedWorker.bankName || '',
          monthlyAttendance: {
            ...(found.monthlyAttendance || {}),
            ...(remoteLoadedWorker.monthlyAttendance || {}),
          },
        };
      }
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

    if (remoteLoadedWorker && (!targetCode || remoteLoadedWorker.code === targetCode || String(remoteLoadedWorker.id) === targetCode)) {
      return remoteLoadedWorker;
    }

    // Nếu điện thoại mới mở link trước khi tải xong từ Cloud: tạo đối tượng hiển thị tạm thời có cờ __isUrlFallback = true
    // Tuyệt đối KHÔNG tự gọi onUpdateWorker lúc mount để không bao giờ ghi đè dailyRate = 0 lên dữ liệu thật!
    if (parsedWorkerInfo.code || parsedWorkerInfo.name) {
      const customWorker: SeasonalWorker = {
        id: parsedWorkerInfo.code || 'CUSTOM_WORKER',
        code: parsedWorkerInfo.code || 'PNC-TV',
        fullName: parsedWorkerInfo.name || 'Nhân sự công trình',
        trade: parsedWorkerInfo.trade || 'Nhân viên kỹ thuật',
        skillLevel: 'Kỹ thuật',
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
      (customWorker as any).__isUrlFallback = true;
      return customWorker;
    }

    return workers[0];
  }, [workers, selectedWorkerCode, parsedWorkerInfo, remoteLoadedWorker]);

  const lastLocalEditAtRef = useRef<number>(0);
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);

  // Dữ liệu chấm công tháng của nhân sự & trạng thái chưa nhấn nút Lưu Data
  const [attendanceDays, setAttendanceDays] = useState<{ [dayNumber: number]: DailyAttendanceDetail }>({});
  const [hasUnsavedMobileChanges, setHasUnsavedMobileChanges] = useState(false);
  const hasUnsavedMobileRef = useRef(false);

  // Thời điểm sao lưu Cloud thành công gần nhất của nhân sự này trên điện thoại
  const [lastBackupTime, setLastBackupTime] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const code = parsedWorkerInfo.code || initialWorkerCode || '';
    if (!code) return '';
    try {
      return localStorage.getItem(`pncons_mobile_backup_at_${code}`) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const code = currentWorker?.code || selectedWorkerCode;
    if (!code || typeof window === 'undefined') return;
    try {
      setLastBackupTime(localStorage.getItem(`pncons_mobile_backup_at_${code}`) || '');
    } catch {}
  }, [currentWorker?.code, selectedWorkerCode]);

  // Bảo vệ trình duyệt điện thoại: Cảnh báo nếu nhân viên chấm công xong mà lỡ đóng tab trước khi nhấn "Lưu Data"
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedMobileRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Danh sách Dự án / Vị trí làm việc tham chiếu trực tiếp từ Bản Dự Án (Tab 3)
  const availableProjects = useMemo<Project[]>(() => {
    if (propProjects && propProjects.length > 0) return propProjects;
    if (cloudProjects && cloudProjects.length > 0) return cloudProjects;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('payroll_projects');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return initialProjects;
  }, [propProjects, cloudProjects]);

  const projectLocationOptions = useMemo<string[]>(() => {
    const names = availableProjects
      .map((p) => (p.name || '').trim())
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [availableProjects]);

  // Hàm tìm nhân sự từ danh sách Thời Vụ hoặc Nhân Viên Chính Thức
  const findMatchingWorkerFromSources = (
    targetCode: string,
    seaList?: SeasonalWorker[] | null,
    empList?: Employee[] | null
  ): SeasonalWorker | null => {
    if (!targetCode) return null;
    if (seaList && seaList.length > 0) {
      const matchedSea = seaList.find(
        (w) => w.code === targetCode || String(w.id) === targetCode
      );
      if (matchedSea) return matchedSea;
    }
    if (empList && empList.length > 0) {
      const matchedEmp = empList.find(
        (e) => e.code === targetCode || String(e.id) === targetCode || `PERM_${e.id}` === targetCode
      );
      if (matchedEmp) {
        return convertEmployeeToMobileWorker(matchedEmp, config.standardWorkDays || 26);
      }
    }
    return null;
  };

  // Tải cấu hình Supabase tự động (từ URL hoặc từ máy chủ /api/sync) + tải dữ liệu chấm công mới nhất cho CẢ Nhân viên chính thức & Thời vụ
  const syncLatestAttendance = async () => {
    if (hasUnsavedMobileRef.current || Date.now() - lastLocalEditAtRef.current < 8000) {
      return;
    }
    const targetCode = selectedWorkerCode || parsedWorkerInfo.code;
    if (!targetCode) return;

    try {
      // BƯỚC 0: Đảm bảo điện thoại luôn tự động nhận cấu hình Supabase Cloud kể cả khi link Zalo bị cắt hash
      autoApplyUrlConfig();
      let serverSnapshot: Awaited<ReturnType<typeof fetchServerData>> = null;
      if (!isSupabaseConfigured()) {
        serverSnapshot = await fetchServerData(false);
        const cfgAny = serverSnapshot?.config as any;
        if (cfgAny?.supabaseUrl && cfgAny?.supabaseAnonKey) {
          setSupabaseConfig(cfgAny.supabaseUrl, cfgAny.supabaseAnonKey);
        }
      }

      let loadedWorker: SeasonalWorker | null = null;
      const looksPermanent = /^PNC0\d+/i.test(targetCode) || targetCode.startsWith('PERM_');

      // 1. Ưu tiên tải trực tiếp từ Supabase Cloud (hỗ trợ cả Nhân viên chính thức & Công nhân thời vụ)
      if (isSupabaseConfigured()) {
        try {
          if (looksPermanent) {
            const [cloudEmps, projs] = await Promise.all([
              loadEmployeesFromSupabase(),
              loadProjectsFromSupabase(),
            ]);
            if (projs && projs.length > 0) {
              setCloudProjects(projs);
              try {
                localStorage.setItem('payroll_projects', JSON.stringify(projs));
              } catch {}
            }
            loadedWorker = findMatchingWorkerFromSources(targetCode, null, cloudEmps);
            if (!loadedWorker) {
              const cloudSea = await loadSeasonalWorkersFromSupabase();
              loadedWorker = findMatchingWorkerFromSources(targetCode, cloudSea, null);
            }
          } else {
            const [cloudSea, projs] = await Promise.all([
              loadSeasonalWorkersFromSupabase(),
              loadProjectsFromSupabase(),
            ]);
            if (projs && projs.length > 0) {
              setCloudProjects(projs);
              try {
                localStorage.setItem('payroll_projects', JSON.stringify(projs));
              } catch {}
            }
            loadedWorker = findMatchingWorkerFromSources(targetCode, cloudSea, null);
            if (!loadedWorker) {
              const cloudEmps = await loadEmployeesFromSupabase();
              loadedWorker = findMatchingWorkerFromSources(targetCode, null, cloudEmps);
            }
          }
        } catch (e) {
          console.warn('[Mobile App] Supabase fetch error:', e);
        }
      }

      // 2. Fallback tải từ máy chủ backend (hỗ trợ cả seasonalWorkers và employees)
      if (!loadedWorker) {
        const data = serverSnapshot || (await fetchServerData(false));
        if (data) {
          if (data.projects && data.projects.length > 0) {
            setCloudProjects(data.projects);
          }
          loadedWorker = findMatchingWorkerFromSources(
            targetCode,
            data.seasonalWorkers,
            data.employees
          );
        }
      }

      if (loadedWorker && !hasUnsavedMobileRef.current && Date.now() - lastLocalEditAtRef.current >= 8000) {
        setRemoteLoadedWorker(loadedWorker);
        const mKey = `${year}-${String(month).padStart(2, '0')}`;
        const localSubmittedAt = currentWorker?.monthlyAttendance?.[mKey]?.lastSubmittedAt;
        const remoteSubmittedAt = loadedWorker.monthlyAttendance?.[mKey]?.lastSubmittedAt;

        if (localSubmittedAt && remoteSubmittedAt) {
          if (new Date(localSubmittedAt).getTime() > new Date(remoteSubmittedAt).getTime()) {
            return;
          }
        } else if (isAdminPreview && currentWorker?.monthlyAttendance?.[mKey] && !remoteSubmittedAt) {
          return;
        }

        const record = getWorkerMonthlyAttendance(loadedWorker, year, month);
        setAttendanceDays(record.days);
      }
    } catch {}
  };

  useEffect(() => {
    autoApplyUrlConfig();
    syncLatestAttendance();

    // Lắng nghe thay đổi Realtime cho CẢ bảng seasonal_workers, employees và attendance_records
    const unsubscribeSupabase = subscribeToSupabaseRealtime((table) => {
      const tbl = String(table);
      if (
        (tbl === 'seasonal_workers' || tbl === 'employees' || tbl === 'attendance_records') &&
        !hasUnsavedMobileRef.current &&
        Date.now() - lastLocalEditAtRef.current >= 4000
      ) {
        syncLatestAttendance();
      }
    });

    const unsubscribeServer = subscribeToSync((serverData) => {
      if (hasUnsavedMobileRef.current || Date.now() - lastLocalEditAtRef.current < 4000) return;
      const targetCode = selectedWorkerCode || parsedWorkerInfo.code;
      const matched = findMatchingWorkerFromSources(
        targetCode,
        serverData.seasonalWorkers,
        serverData.employees
      );
      if (matched) {
        setRemoteLoadedWorker(matched);
        const record = getWorkerMonthlyAttendance(matched, year, month);
        setAttendanceDays(record.days);
      }
    });

    return () => {
      unsubscribeSupabase();
      unsubscribeServer();
    };
  }, [selectedWorkerCode, parsedWorkerInfo.code, year, month, isAdminPreview]);

  // State Modal Chấm Công Popup
  const [editingCell, setEditingCell] = useState<CalendarDayCell | null>(null);
  const [modalStatus, setModalStatus] = useState<MobileModalStatus>('FULL');
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
    }, 3000);
  };

  const handleVerifyPinAndExit = () => {
    sessionStorage.setItem('pncons_admin_auth', 'true');
    setIsAdminPinModalOpen(false);
    if (onExitMobileView) onExitMobileView();
  };

  // Nạp dữ liệu chấm công khi đổi nhân sự, đổi tháng hoặc khi dữ liệu cập nhật từ xa
  useEffect(() => {
    if (!currentWorker) return;
    if (hasUnsavedMobileRef.current || Date.now() - lastLocalEditAtRef.current < 3500) return;

    const workerCode = currentWorker.code || selectedWorkerCode;
    const cacheKey = `pncons_mobile_days_${workerCode}_${year}_${month}`;
    const mKey = `${year}-${String(month).padStart(2, '0')}`;
    const hasAuthoritativeMonthRecord = Boolean(
      currentWorker.monthlyAttendance && currentWorker.monthlyAttendance[mKey]
    );

    const record = getWorkerMonthlyAttendance(currentWorker, year, month);

    if (hasAuthoritativeMonthRecord || isAdminPreview) {
      setAttendanceDays(record.days);
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

  // Tính toán thống kê chuẩn xác 100% (khớp tuyệt đối Bản Chấm Công & Bản Lương trên máy tính)
  const stats = useMemo(() => {
    let countFull = 0;
    let countHalf = 0;
    let countOtOnly = 0;
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

      const rawSt = item.statusType;
      const rawOt = Number(item.otHours || 0);
      // Chuẩn hóa nếu trước đó có ngày bị chọn Vắng mặt nhưng có nhập giờ tăng ca (ví dụ Chủ nhật tăng ca 8h)
      const st = rawSt === 'ABSENT' && rawOt > 0 ? 'OT_ONLY' : rawSt;

      if (st !== 'ABSENT' && st !== 'LEAVE') {
        otHours += rawOt;
      }

      if (st === 'FULL' || (!st && item.workUnits === 1)) {
        countFull++;
      } else if (st === 'HALF' || (!st && item.workUnits === 0.5)) {
        countHalf++;
      } else if (st === 'OT_ONLY' || (!st && item.workUnits === 0 && rawOt > 0)) {
        countOtOnly++;
      } else if (st === 'ABSENT') {
        countAbsent++;
      } else if (st === 'LATE') {
        countLate++;
      } else if (st === 'LEAVE') {
        countLeave++;
      }
    }

    // Đi muộn (LATE) vẫn đi làm nên được tính 1 ngày công thực tế (đồng nhất với AttendanceTab & payrollCalculator)
    const totalWorkDays = Math.round((countFull * 1 + countLate * 1 + countHalf * 0.5) * 10) / 10;
    const roundedOtHours = Math.round(otHours * 10) / 10;
    const workingDaysInMonth = Math.max(daysInMonth - countWeekend, 1);
    const attendancePercent = Math.min(Math.round((totalWorkDays / workingDaysInMonth) * 100), 100);

    return {
      countFull,
      countHalf,
      countOtOnly,
      countAbsent,
      countLate,
      countLeave,
      countWeekend,
      totalWorkDays,
      otHours: roundedOtHours,
      daysInMonth,
      attendancePercent,
    };
  }, [attendanceDays, year, month]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Mở Popup Chấm Công khi nhấn vào bất kỳ ngày nào trong lịch
  const handleDayClick = (cell: CalendarDayCell) => {
    if (!cell.isCurrentMonth || !cell.day) return;

    const existing = attendanceDays[cell.day];
    const existingOt = Number(existing?.otHours || 0);

    let initialStatus: MobileModalStatus = cell.isSunday ? 'OT_ONLY' : 'FULL';
    if (existing) {
      if (existing.statusType === 'ABSENT' && existingOt > 0) {
        initialStatus = 'OT_ONLY';
      } else if (existing.statusType) {
        initialStatus = existing.statusType;
      } else if (existing.workUnits === 0.5) {
        initialStatus = 'HALF';
      } else if (existing.workUnits === 1) {
        initialStatus = 'FULL';
      } else if (existingOt > 0) {
        initialStatus = 'OT_ONLY';
      }
    }

    const resolveProjectLocation = (rawName?: string): string => {
      if (!rawName || !rawName.trim()) return '';
      const trimmed = rawName.trim();
      const exact = projectLocationOptions.find((p) => p === trimmed);
      if (exact) return exact;
      const lower = trimmed.toLowerCase();
      const caseMatch = projectLocationOptions.find((p) => p.toLowerCase() === lower);
      if (caseMatch) return caseMatch;
      const normalize = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, '');
      const normTarget = normalize(trimmed);
      if (normTarget.length >= 3) {
        const fuzzy = projectLocationOptions.find((p) => {
          const normP = normalize(p);
          return normP === normTarget || normP.includes(normTarget) || normTarget.includes(normP);
        });
        if (fuzzy) return fuzzy;
      }
      return trimmed;
    };

    setModalStatus(initialStatus);
    setModalLocation(
      resolveProjectLocation(existing?.location) ||
      resolveProjectLocation(currentWorker?.project) ||
      ''
    );
    setModalOtHours(
      initialStatus === 'ABSENT' || initialStatus === 'LEAVE'
        ? 0
        : existing
        ? existingOt
        : cell.isSunday
        ? 8
        : 0
    );
    setModalOtMultiplier(
      existing?.otMultiplier || (cell.isSunday ? 2.0 : 1.5)
    );
    setEditingCell(cell);
  };

  // Lưu popup chấm công 1 ngày (chỉ cập nhật tạm trên màn hình, nhắc nhấn nút "Lưu Data" để sao lưu Cloud)
  const handleSaveModal = () => {
    if (!editingCell || !editingCell.day) return;
    const dayNum = editingCell.day;
    lastLocalEditAtRef.current = Date.now();

    const isNoWorkOrOt = modalStatus === 'ABSENT' || modalStatus === 'LEAVE';
    const effectiveOt = isNoWorkOrOt ? 0 : Math.max(0, Number(modalOtHours) || 0);

    // Nếu chọn "Chỉ tăng ca (0 công)" nhưng để giờ OT = 0 -> coi như xóa trống ngày đó
    if (modalStatus === 'OT_ONLY' && effectiveOt <= 0) {
      const cleaned = { ...attendanceDays };
      delete cleaned[dayNum];
      delete (cleaned as any)[String(dayNum)];
      setAttendanceDays(cleaned);
      hasUnsavedMobileRef.current = true;
      setHasUnsavedMobileChanges(true);
      if (currentWorker && !(currentWorker as any).__isUrlFallback) {
        const updatedWorker = updateWorkerMonthlyAttendance(
          currentWorker,
          year,
          month,
          cleaned,
          isAdminPreview ? 'MANUAL_USER' : 'WORKER'
        );
        onUpdateWorker(updatedWorker);
      }
      showToast(`Đã bỏ chấm ngày ${dayNum}/${month} — Nhấn "Lưu Data" để sao lưu!`);
      setEditingCell(null);
      return;
    }

    let workUnits = 0;
    if (modalStatus === 'FULL' || modalStatus === 'LATE') workUnits = 1;
    else if (modalStatus === 'HALF') workUnits = 0.5;

    const updated: { [dayNumber: number]: DailyAttendanceDetail } = {
      ...attendanceDays,
      [dayNum]: {
        day: dayNum,
        dateStr:
          editingCell.dateStr ||
          `${String(dayNum).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        workUnits,
        statusType: modalStatus,
        location: modalLocation,
        otHours: effectiveOt,
        otMultiplier: Number(modalOtMultiplier) || (editingCell.isSunday ? 2.0 : 1.5),
        shiftType: 'DAY',
        note: modalLocation
          ? modalStatus === 'OT_ONLY'
            ? `Tăng ca tại ${modalLocation}`
            : `Thi công tại ${modalLocation}`
          : '',
        updatedAt: new Date().toISOString(),
      },
    };

    setAttendanceDays(updated);
    hasUnsavedMobileRef.current = true;
    setHasUnsavedMobileChanges(true);

    if (currentWorker && !(currentWorker as any).__isUrlFallback) {
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        isAdminPreview ? 'MANUAL_USER' : 'WORKER'
      );
      onUpdateWorker(updatedWorker);
    }

    showToast(`Đã chọn ngày ${dayNum}/${month}/${year} — Nhấn "Lưu Data" để sao lưu!`);
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
    hasUnsavedMobileRef.current = true;
    setHasUnsavedMobileChanges(true);

    if (currentWorker && !(currentWorker as any).__isUrlFallback) {
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        updated,
        isAdminPreview ? 'MANUAL_USER' : 'WORKER'
      );
      onUpdateWorker(updatedWorker);
    }

    showToast(`Đã xóa ngày ${dayNum}/${month}/${year} — Nhấn "Lưu Data" để sao lưu!`);
    setEditingCell(null);
  };

  // Xóa trắng toàn bộ ngày chấm công trong tháng của nhân sự này
  const handleClearAllMonthDays = () => {
    lastLocalEditAtRef.current = Date.now();
    const emptyDays: { [dayNumber: number]: DailyAttendanceDetail } = {};
    setAttendanceDays(emptyDays);
    hasUnsavedMobileRef.current = true;
    setHasUnsavedMobileChanges(true);

    if (currentWorker && !(currentWorker as any).__isUrlFallback) {
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        emptyDays,
        isAdminPreview ? 'MANUAL_USER' : 'WORKER'
      );
      onUpdateWorker(updatedWorker);
      showToast(`Đã đặt trắng tháng ${month}/${year} — Nhấn "Lưu Data" để sao lưu!`);
    }
    setEditingCell(null);
  };

  const [isSyncing, setIsSyncing] = useState(false);

  // Nút LƯU DATA & SAO LƯU CLOUD chính thức cho Chấm Công Di Động (CHỈ LƯU ĐÚNG 1 NHÂN SỰ ĐANG CHẤM, TUYỆT ĐỐI KHÔNG GHI ĐÈ TOÀN CÔNG TY!)
  const handleSaveMobileData = async () => {
    if (!currentWorker) return;
    setIsSyncing(true);
    lastLocalEditAtRef.current = Date.now();
    try {
      const workerCode = currentWorker.code || selectedWorkerCode;
      const submitRole = isAdminPreview ? 'MANUAL_USER' : 'WORKER';
      const updatedWorker = updateWorkerMonthlyAttendance(
        currentWorker,
        year,
        month,
        attendanceDays,
        submitRole
      );
      if ((currentWorker as any).__isUrlFallback) {
        (updatedWorker as any).__isUrlFallback = true;
      }

      if (!(currentWorker as any).__isUrlFallback) {
        onUpdateWorker(updatedWorker);
      }

      try {
        localStorage.setItem(
          `pncons_mobile_days_${workerCode}_${year}_${month}`,
          JSON.stringify(attendanceDays)
        );
        localStorage.setItem(`pncons_mobile_worker_${workerCode}`, JSON.stringify(updatedWorker));
      } catch {}

      let cloudSaved = false;
      const nowStamp = new Date();
      const formattedBackup = `${nowStamp.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })} (${String(nowStamp.getDate()).padStart(2, '0')}/${String(
        nowStamp.getMonth() + 1
      ).padStart(2, '0')})`;

      if (onSaveWorkerAttendance) {
        const res = await onSaveWorkerAttendance(updatedWorker, year, month);
        cloudSaved = res.cloudSaved;
      } else if (onSaveData && isAdminPreview) {
        await onSaveData();
        cloudSaved = isSupabaseConfigured();
      } else {
        // Đảm bảo cấu hình Supabase sẵn sàng trước khi đẩy
        autoApplyUrlConfig();
        if (!isSupabaseConfigured()) {
          const srv = await fetchServerData(false);
          const cfgAny = srv?.config as any;
          if (cfgAny?.supabaseUrl && cfgAny?.supabaseAnonKey) {
            setSupabaseConfig(cfgAny.supabaseUrl, cfgAny.supabaseAnonKey);
          }
        }

        await saveAttendanceToServer(updatedWorker);

        if (isSupabaseConfigured()) {
          const periodCode = `${String(month).padStart(2, '0')}/${year}`;
          const isPerm =
            Boolean((currentWorker as any).__isPermanentEmployee) ||
            /^PNC0\d+/i.test(workerCode);

          if (isPerm && (currentWorker as any).__rawEmployee) {
            const rawEmp = (currentWorker as any).__rawEmployee as Employee;
            const mKey = `${year}-${String(month).padStart(2, '0')}`;
            const syncedEmp = syncEmployeeForMonth(
              {
                ...rawEmp,
                monthlyAttendance: {
                  ...(rawEmp.monthlyAttendance || {}),
                  [mKey]: updatedWorker.monthlyAttendance?.[mKey]!,
                },
              },
              month,
              year,
              config.standardWorkDays || 26
            );
            const sbRes = await syncSingleEmployeeToSupabase(syncedEmp, periodCode);
            cloudSaved = sbRes.success;
          } else {
            const sbRes = await syncSingleSeasonalWorkerToSupabase(updatedWorker, periodCode);
            cloudSaved = sbRes.success;
          }
        }
      }

      try {
        localStorage.setItem(`pncons_mobile_backup_at_${workerCode}`, formattedBackup);
      } catch {}
      setLastBackupTime(formattedBackup);
      hasUnsavedMobileRef.current = false;
      setHasUnsavedMobileChanges(false);

      showToast(
        cloudSaved
          ? `✓ Đã sao lưu Cloud chấm công của ${updatedWorker.fullName} lúc ${formattedBackup}!`
          : `✓ Đã lưu dữ liệu chấm công của ${updatedWorker.fullName} thành công!`
      );
    } catch {
      showToast('Có lỗi kết nối mạng, dữ liệu đã được lưu tạm trên điện thoại!');
    } finally {
      setIsSyncing(false);
    }
  };

  const dayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans pb-20 sm:pb-6">
      {/* Toast thông báo */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900/95 text-white text-xs font-bold rounded-full shadow-xl backdrop-blur-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 max-w-[92vw] text-center">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Web App Chấm Công Di Động */}
      <header className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-3 shadow-2xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs shrink-0">
              <Clock className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 block leading-tight truncate">
                PNCO - Chấm Công Di Động
              </span>
              <span className="text-[10px] text-slate-500 block truncate">
                {currentWorker?.fullName
                  ? `${currentWorker.fullName} (${currentWorker.code})`
                  : 'Dành cho nhân viên & công nhân'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveMobileData}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-60 ${
                hasUnsavedMobileChanges
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-400/40'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
              title="Nhấn nút Lưu Data để sao lưu dữ liệu chấm công lên Cloud"
            >
              <Save className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
              <span>
                {isSyncing
                  ? 'Đang sao lưu...'
                  : hasUnsavedMobileChanges
                  ? 'Lưu Data (Chưa lưu)'
                  : 'Lưu Data'}
              </span>
            </button>

            {isAdminPreview && onExitMobileView && (
              <button
                type="button"
                onClick={onExitMobileView}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                title="Đóng chế độ xem thử để quay lại bảng quản trị"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Đóng xem thử</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs">
              <Calendar className="w-4 h-4 stroke-[2.5]" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Bảng Chấm Công</h1>
          </div>

          {lastBackupTime && !hasUnsavedMobileChanges && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
              <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã sao lưu Cloud: {lastBackupTime}</span>
            </div>
          )}
        </div>

        {/* Bố cục 2 Cột chuẩn */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* CỘT TRÁI */}
          <div className="lg:col-span-4 space-y-3.5">
            {/* Thanh chuyển tháng */}
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

            {/* Thông tin đối tượng chấm công */}
            {!parsedWorkerInfo.code ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs">
                <label className="text-[10px] font-bold text-slate-500 uppercase px-2 pt-1 block">
                  Chọn nhân sự chấm công:
                </label>
                <select
                  value={selectedWorkerCode}
                  onChange={(e) => setSelectedWorkerCode(e.target.value)}
                  className="w-full px-3 py-2 bg-transparent text-xs sm:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.code}>
                      {w.code} - {w.fullName} ({w.teamName || w.trade || 'NHÂN SỰ'})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="bg-blue-50/80 rounded-2xl border border-blue-200/90 p-3 shadow-2xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                    Phiếu chấm công cá nhân:
                  </div>
                  <div className="text-sm font-black text-blue-950">{currentWorker?.fullName}</div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 bg-blue-600 text-white rounded-full text-xs font-mono font-bold shadow-2xs">
                    {currentWorker?.code}
                  </span>
                </div>
              </div>
            )}

            {/* Thẻ thông tin nhân sự */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />

              <div className="flex items-center gap-3.5 mb-3.5">
                <div className="w-14 h-14 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                  <span className="text-lg font-black text-slate-700">
                    {currentWorker?.fullName ? currentWorker.fullName.charAt(0) : 'N'}
                  </span>
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                    {currentWorker?.fullName}
                  </h2>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                    {currentWorker?.trade || currentWorker?.teamName || 'Nhân viên thi công'}
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

              {/* Nút Lưu Data & trạng thái sao lưu Cloud */}
              <div className="pt-3 border-t border-slate-100 space-y-2 mt-3">
                <button
                  type="button"
                  onClick={handleSaveMobileData}
                  disabled={isSyncing}
                  className={`w-full px-3 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs disabled:opacity-60 ${
                    hasUnsavedMobileChanges
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 ring-2 ring-amber-400/40'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {isSyncing
                      ? 'Đang sao lưu lên Cloud...'
                      : hasUnsavedMobileChanges
                      ? 'Lưu Data & Sao lưu Cloud (Chưa lưu)'
                      : 'Lưu Data'}
                  </span>
                </button>

                {hasUnsavedMobileChanges ? (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-center text-[11px] text-amber-900 font-bold flex items-center justify-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Bạn vừa chấm công chưa sao lưu — Hãy nhấn Lưu Data!</span>
                  </div>
                ) : lastBackupTime ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center text-[11px] text-emerald-800 font-semibold flex items-center justify-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Đã sao lưu Cloud lúc {lastBackupTime}</span>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-center text-[11px] text-slate-600 font-medium">
                    Chạm vào ngày trên lịch để chấm công, sau đó nhấn <strong>Lưu Data</strong> để sao lưu
                  </div>
                )}

                {Object.keys(attendanceDays).length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllMonthDays}
                    className="w-full px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Xóa trắng chấm công tháng {month}/{year} (về 0 công)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bảng chú giải trạng thái */}
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
                  <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
                  <span>Chỉ tăng ca ({stats.countOtOnly})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                  <span>Đi muộn ({stats.countLate})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                  <span>Vắng mặt ({stats.countAbsent})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                  <span>Nghỉ phép ({stats.countLeave})</span>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI - LƯỚI LỊCH CHẤM CÔNG */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-2xs">
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

              <div className="space-y-1.5 sm:space-y-2">
                {calendarGrid.weeks.map((week, wIdx) => (
                  <div key={wIdx} className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {week.map((cell, cIdx) => {
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
                      const rawOtHours = detail ? Number(detail.otHours || 0) : 0;
                      const rawSt = detail?.statusType;
                      // Chuẩn hóa hiển thị nếu trước đó bị chọn nhầm Vắng mặt mà có giờ tăng ca > 0
                      const st = rawSt === 'ABSENT' && rawOtHours > 0 ? 'OT_ONLY' : rawSt;
                      const otHours = st === 'ABSENT' || st === 'LEAVE' ? 0 : rawOtHours;

                      const isFull = st === 'FULL' || (!st && workUnits === 1);
                      const isHalf = st === 'HALF' || (!st && workUnits === 0.5);
                      const isOtOnly = st === 'OT_ONLY' || (!st && workUnits === 0 && otHours > 0);
                      const isAbsent = st === 'ABSENT';
                      const isLate = st === 'LATE';
                      const isLeave = st === 'LEAVE';

                      let cellStyle = 'bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold';
                      let checkIcon = null;

                      if (isFull) {
                        cellStyle = 'bg-emerald-500 text-white font-extrabold shadow-xs';
                        checkIcon = (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-600/60 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                          </div>
                        );
                      } else if (isHalf) {
                        cellStyle = 'bg-emerald-300 text-emerald-950 font-extrabold shadow-xs';
                        checkIcon = (
                          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-900 stroke-[3]" />
                          </div>
                        );
                      } else if (isOtOnly) {
                        cellStyle = 'bg-orange-500 text-white font-extrabold shadow-xs';
                        checkIcon = (
                          <div className="absolute top-1.5 right-1.5 px-1 rounded bg-orange-600/80 text-[8px] font-black text-white leading-tight">
                            TC
                          </div>
                        );
                      } else if (isAbsent) {
                        cellStyle = 'bg-rose-500 text-white font-extrabold shadow-xs';
                      } else if (isLate) {
                        cellStyle = 'bg-amber-500 text-white font-extrabold shadow-xs';
                      } else if (isLeave) {
                        cellStyle = 'bg-blue-500 text-white font-extrabold shadow-xs';
                      } else if (cell.isToday) {
                        cellStyle = 'bg-white border-2 border-orange-500 text-slate-900 font-extrabold shadow-xs';
                      }

                      return (
                        <div
                          key={cell.day}
                          onClick={() => handleDayClick(cell)}
                          className={`relative h-14 sm:h-18 rounded-2xl flex flex-col items-center justify-center cursor-pointer select-none transition-all active:scale-95 ${cellStyle}`}
                          title={`Bấm để chấm công ngày ${cell.day}/${month}`}
                        >
                          {checkIcon}
                          <span className="text-sm sm:text-base">{cell.day}</span>
                          {otHours > 0 && (
                            <span
                              className={`absolute bottom-1.5 left-1.5 text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.2 rounded-md shadow-2xs ${
                                isOtOnly
                                  ? 'bg-white text-orange-700'
                                  : 'bg-orange-500 text-white'
                              }`}
                            >
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

      {/* THANH NHẮC SAO LƯU NỔI DƯỚI ĐÁY ĐIỆN THOẠI KHI CÓ NGÀY VỪA CHẤM CHƯA LƯU */}
      {hasUnsavedMobileChanges && (
        <div className="fixed bottom-3 left-3 right-3 z-40 max-w-xl mx-auto bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-amber-400/60 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-extrabold text-amber-300 truncate">
              Chưa sao lưu ({stats.totalWorkDays} công • {stats.otHours}h OT)
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              Nhấn nút bên cạnh để gửi &amp; sao lưu lên Cloud
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveMobileData}
            disabled={isSyncing}
            className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{isSyncing ? 'Đang lưu...' : 'Lưu Data ngay'}</span>
          </button>
        </div>
      )}

      {/* POPUP MODAL CHẤM CÔNG TỪNG NGÀY */}
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md overflow-hidden shadow-2xl space-y-3.5 p-5 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Chấm công {currentWorker?.fullName} - {editingCell.day}/{month}/{year}
                </h3>
                {editingCell.isSunday && (
                  <p className="text-[11px] font-semibold text-orange-600 mt-0.5">
                    Chủ nhật • Mặc định hệ số tăng ca x2.0
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mục 1: Chọn trạng thái */}
            <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 shadow-xs ${
                  modalStatus === 'OT_ONLY'
                    ? 'bg-orange-500'
                    : modalStatus === 'ABSENT'
                    ? 'bg-rose-500'
                    : modalStatus === 'LEAVE'
                    ? 'bg-blue-500'
                    : modalStatus === 'LATE'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div className="flex-1">
                <select
                  value={modalStatus}
                  onChange={(e) => {
                    const nextSt = e.target.value as MobileModalStatus;
                    setModalStatus(nextSt);
                    if (nextSt === 'ABSENT' || nextSt === 'LEAVE') {
                      setModalOtHours(0);
                    } else if (nextSt === 'OT_ONLY' && modalOtHours === 0) {
                      setModalOtHours(editingCell.isSunday ? 8 : 4);
                      if (editingCell.isSunday) setModalOtMultiplier(2.0);
                    }
                  }}
                  className="w-full bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="FULL">Đủ công (1 công)</option>
                  <option value="HALF">Nửa công (0.5 công)</option>
                  <option value="OT_ONLY">Chỉ tăng ca / Làm Chủ nhật (0 công chính)</option>
                  <option value="LATE">Đi muộn (tính 1 công)</option>
                  <option value="ABSENT">Vắng mặt (0 công)</option>
                  <option value="LEAVE">Nghỉ phép (0 công)</option>
                </select>
              </div>
            </div>

            {/* Mục 2: Vị trí làm việc (Tham chiếu trực tiếp từ Bản Dự Án) */}
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                <MapPin className="w-4 h-4 fill-orange-500 text-white" />
                <span>Vị trí làm việc</span>
              </div>
              <select
                value={modalLocation}
                onChange={(e) => setModalLocation(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
              >
                <option value="">-Chọn vị trí-</option>
                {projectLocationOptions.map((projName) => (
                  <option key={projName} value={projName}>
                    {projName}
                  </option>
                ))}
                {modalLocation && !projectLocationOptions.includes(modalLocation) && (
                  <option value={modalLocation}>{modalLocation}</option>
                )}
              </select>
            </div>

            {/* Mục 3: Giờ tăng ca */}
            <div
              className={`p-3.5 rounded-xl border border-slate-200 space-y-2.5 ${
                modalStatus === 'ABSENT' || modalStatus === 'LEAVE'
                  ? 'bg-slate-50 opacity-60'
                  : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600">
                  <Clock className="w-4 h-4 fill-orange-500 text-white" />
                  <span>Giờ tăng ca</span>
                </div>
                {(modalStatus === 'ABSENT' || modalStatus === 'LEAVE') && (
                  <span className="text-[10px] font-semibold text-slate-500">
                    Ngày nghỉ / vắng không tính OT
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Số giờ:
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="16"
                    step="0.5"
                    disabled={modalStatus === 'ABSENT' || modalStatus === 'LEAVE'}
                    value={modalOtHours}
                    onChange={(e) => setModalOtHours(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Hệ số:
                  </label>
                  <select
                    disabled={modalStatus === 'ABSENT' || modalStatus === 'LEAVE'}
                    value={modalOtMultiplier}
                    onChange={(e) => setModalOtMultiplier(parseFloat(e.target.value) || 1.5)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-slate-100"
                  >
                    <option value="1.5">x1.5 (Ngày thường)</option>
                    <option value="2.0">x2.0 (Chủ nhật)</option>
                    <option value="3.0">x3.0 (Ngày lễ)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Mục 4: Xoá trạng thái */}
            <button
              type="button"
              onClick={handleDeleteStatus}
              className="w-full p-3 bg-white hover:bg-rose-50/50 rounded-xl border border-slate-200 flex items-center gap-3 transition-colors text-left cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-rose-500">Xoá trạng thái ngày này</span>
            </button>

            {/* Nút Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold transition-colors shadow-sm shadow-orange-500/30 cursor-pointer"
              >
                Chọn xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP XÁC THỰC MÃ PIN QUẢN TRỊ VIÊN */}
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
