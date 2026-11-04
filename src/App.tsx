import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, HardHat, Building, CalendarCheck, Table2, CreditCard } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TabType, NavigationTabs } from './components/NavigationTabs';
import { PayslipTab } from './components/PayslipTab';
import { DepartmentSummaryTab } from './components/DepartmentSummaryTab';
import { PayrollTableTab } from './components/PayrollTableTab';
import { AttendanceTab } from './components/AttendanceTab';
import { EmployeeListTab } from './components/EmployeeListTab';
import { DataAuditTab } from './components/DataAuditTab';
import { SeasonalWorkersTab } from './components/SeasonalWorkersTab';
import { TeamWorkersTab } from './components/TeamWorkersTab';
import { ProjectsTab } from './components/ProjectsTab';
import { SalaryAdvancesTab } from './components/SalaryAdvancesTab';
import { FinancialReportTab } from './components/FinancialReportTab';
import { BankExportModal } from './components/BankExportModal';
import { ImportModal } from './components/ImportModal';
import { CompanyModal } from './components/CompanyModal';
import { ZaloOASettingsModal } from './components/ZaloOASettingsModal';
import { BatchSendZaloModal } from './components/BatchSendZaloModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
import { MobileAttendanceApp } from './components/MobileAttendanceApp';
import {
  isSupabaseConfigured,
  loadCompanyConfigFromSupabase,
  loadEmployeesFromSupabase,
  loadSeasonalWorkersFromSupabase,
  loadProjectsFromSupabase,
  syncAllDataToSupabase,
  syncSeasonalWorkersToSupabase,
  syncSingleSeasonalWorkerToSupabase,
  deleteSeasonalWorkerFromSupabase,
  deleteBatchSeasonalWorkersFromSupabase,
  clearAllSeasonalWorkersFromSupabase,
  syncSingleEmployeeToSupabase,
  syncEmployeesToSupabase,
  deleteEmployeeFromSupabase,
  syncProjectsToSupabase,
  subscribeToSupabaseRealtime,
  autoApplyUrlConfig,
  getLastSyncedTime,
} from './services/supabaseService';
import { initialCompanyConfig, initialEmployees } from './data/mockPayrollData';
import {
  initialSeasonalWorkers,
  recomputeSeasonalWorkerPayroll as recomputeSeasonal,
  syncSeasonalWorkerForMonth,
  ensureSeasonalHistoricalMonths,
} from './data/mockSeasonalWorkers';
import { initialProjects, initialTeamWorkers, initialSalaryAdvances } from './data/mockProjectsAndTeams';
import { CompanyConfig, Employee, SeasonalWorker, Project, TeamWorker, SalaryAdvance } from './types';
import {
  recomputeEmployeePayroll,
  getRealCurrentDateInfo,
  ensureEmployeeHistoricalMonths,
  syncEmployeeForMonth,
  buildMonthlyAttendanceRecord,
} from './utils/payrollCalculator';
import { ensureEmployeeContract } from './utils/contractHelper';
import {
  fetchServerData,
  saveAllToServer,
  saveAttendanceToServer,
  saveSingleWorkerToServer,
  subscribeToSync,
  getLastSyncedTime as getServerLastSyncedTime,
} from './services/backendSyncService';

// Tự động kiểm tra URL chia sẻ cấu hình nếu có
autoApplyUrlConfig();

// Hàm gộp cấu hình từ Cloud/Server nhưng LUÔN GIỮ NGUYÊN tháng/năm đang xem của người dùng
function mergeRemoteConfigPreservingPeriod(
  currentCfg: CompanyConfig,
  remoteCfg?: CompanyConfig | null
): CompanyConfig {
  if (!remoteCfg) return currentCfg;
  return {
    ...remoteCfg,
    month: currentCfg.month,
    year: currentCfg.year,
    period: currentCfg.period,
    periodCode: currentCfg.periodCode,
    paymentDate: currentCfg.paymentDate,
    standardWorkDays: remoteCfg.standardWorkDays || currentCfg.standardWorkDays || 26,
  };
}

// Hàm gộp danh sách nhân viên chính thức từ Cloud/Server với dữ liệu hiện tại (bảo toàn 100% monthlyAttendance các tháng)
function mergeEmployeeListsPreservingAttendance(
  localList: Employee[],
  remoteList: Employee[],
  activeMonth: number,
  activeYear: number,
  stdDays: number = 26
): Employee[] {
  const map = new Map<string, Employee>();
  localList.forEach((emp) => map.set(emp.code || emp.id, emp));

  remoteList.forEach((rEmp) => {
    const key = rEmp.code || rEmp.id;
    const existing = map.get(key);
    if (existing) {
      const mergedMonthly = { ...(existing.monthlyAttendance || {}) };
      Object.entries(rEmp.monthlyAttendance || {}).forEach(([mKey, rRec]) => {
        const exRec = mergedMonthly[mKey];
        if (!exRec) {
          mergedMonthly[mKey] = rRec;
        } else {
          const mergedDays = {
            ...(exRec.days || {}),
            ...(rRec.days || {}),
          };
          let totDays = 0;
          let totOt = 0;
          Object.values(mergedDays).forEach((d: any) => {
            if (!d) return;
            totDays += Number(d.workUnits || 0);
            totOt += Number(d.otHours || 0);
          });
          const hasDaysObj = Object.keys(mergedDays).length > 0;
          mergedMonthly[mKey] = {
            ...exRec,
            ...rRec,
            days: mergedDays,
            totalWorkDays: hasDaysObj
              ? Math.round(totDays * 10) / 10
              : Math.max(exRec.totalWorkDays || 0, rRec.totalWorkDays || 0),
            totalOtHours: hasDaysObj
              ? Math.round(totOt * 10) / 10
              : Math.max(exRec.totalOtHours || 0, rRec.totalOtHours || 0),
          };
        }
      });

      map.set(key, {
        ...existing,
        ...rEmp,
        monthlyAttendance: mergedMonthly,
        periodRecords: {
          ...(existing.periodRecords || {}),
          ...(rEmp.periodRecords || {}),
        },
      });
    } else {
      map.set(key, rEmp);
    }
  });

  return Array.from(map.values())
    .map((emp) => {
      const withContract = ensureEmployeeContract(emp);
      const withHistory = ensureEmployeeHistoricalMonths(withContract);
      return syncEmployeeForMonth(withHistory, activeMonth, activeYear, stdDays);
    })
    .sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
}

// Hàm nhận diện chế độ xem Chấm Công Di Động (chỉ khi có tham số URL chỉ định rõ ràng hoặc mở từ link riêng)
function checkShouldShowAttendanceView(): { shouldShow: boolean; workerCode?: string } {
  if (typeof window === 'undefined') return { shouldShow: false };

  // Nếu người dùng đã chủ động bấm nút "Thoát về trang quản trị" trong phiên này:
  if (sessionStorage.getItem('pncons_admin_auth') === 'true') {
    const rawSearch = window.location.search;
    const rawHash = window.location.hash.toLowerCase();
    // Chỉ kích hoạt lại nếu trên URL có tham số view=chamcong mới hoặc worker mới
    if (!rawSearch.includes('chamcong') && !rawHash.includes('chamcong') && !rawSearch.includes('worker=')) {
      return { shouldShow: false };
    }
  }

  const search = window.location.search;
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(search);

  // Lấy workerCode từ search params, hash, hoặc sessionStorage
  let workerCode = searchParams.get('worker') || undefined;
  if (!workerCode && window.location.hash.includes('worker=')) {
    const match = window.location.hash.match(/worker=([^&]+)/);
    if (match && match[1]) workerCode = decodeURIComponent(match[1]);
  }
  if (!workerCode) {
    const cachedCode = sessionStorage.getItem('pncons_mobile_worker_code');
    if (cachedCode) workerCode = cachedCode;
  }

  // Chuyển sang chế độ Chấm Công Di Động khi mở link chia sẻ:
  // Hỗ trợ cả query params (?view=chamcong, ?worker=...) và hash (#chamcong&worker=...)
  const hasAttendanceParam =
    searchParams.get('view') === 'chamcong' ||
    searchParams.get('mode') === 'attendance' ||
    searchParams.get('mode') === 'mobile_attendance' ||
    searchParams.get('chamcong') === '1' ||
    hash.includes('chamcong') ||
    hash.includes('view=chamcong') ||
    hash.includes('mode=attendance') ||
    hash.includes('chamcong=1') ||
    Boolean(searchParams.get('worker')) ||
    sessionStorage.getItem('pncons_in_mobile_mode') === 'true';

  if (hasAttendanceParam) {
    if (workerCode) {
      sessionStorage.setItem('pncons_mobile_worker_code', workerCode);
    }
    sessionStorage.setItem('pncons_in_mobile_mode', 'true');
    return { shouldShow: true, workerCode };
  }

  // Luôn luôn mở ứng dụng quản trị bảng lương và chấm công đầy đủ
  return { shouldShow: false, workerCode };
}

// DỮ LIỆU ĐƯỢC BẢO LƯU 100% - LUÔN HIỂN THỊ THÁNG & NGÀY THỰC TẾ HIỆN TẠI KHI MỞ APP
export default function App() {
  const realDateInfo = useMemo(() => getRealCurrentDateInfo(), []);

  const [config, setConfig] = useState<CompanyConfig>(() => {
    const realInfo = getRealCurrentDateInfo();
    const curM = realInfo.realMonth;
    const curY = realInfo.realYear;
    const curMPadded = realInfo.realMonthPadded;
    const nextM = curM === 12 ? '01' : curM + 1 < 10 ? `0${curM + 1}` : `${curM + 1}`;
    const nextY = curM === 12 ? curY + 1 : curY;

    const saved = localStorage.getItem('payroll_company_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          month: curM,
          year: curY,
          period: `Kỳ lương tháng ${curMPadded} năm ${curY}`,
          periodCode: `${curMPadded}/${curY}`,
          paymentDate: `05/${nextM}/${nextY}`,
          standardWorkDays: parsed.standardWorkDays || 26,
        };
      } catch {
        return initialCompanyConfig;
      }
    }
    return initialCompanyConfig;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const realInfo = getRealCurrentDateInfo();
    const saved = localStorage.getItem('payroll_employees');
    if (saved) {
      try {
        const parsed: Employee[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Gộp thêm dữ liệu các tháng đã lưu trong các slot payroll_month_YYYY_MM (nếu có) để không bao giờ mất lịch sử
          const legacyMonthSlots: Array<{ m: number; y: number; key: string; monthKey: string }> = [
            { m: 9, y: 2026, key: 'payroll_month_2026_09', monthKey: '2026-09' },
            { m: 10, y: 2026, key: 'payroll_month_2026_10', monthKey: '2026-10' },
            { m: 11, y: 2026, key: 'payroll_month_2026_11', monthKey: '2026-11' },
            { m: 12, y: 2026, key: 'payroll_month_2026_12', monthKey: '2026-12' },
          ];
          const legacyByMonth: Record<string, Employee[]> = {};
          legacyMonthSlots.forEach((slot) => {
            try {
              const rawSlot = localStorage.getItem(slot.key);
              if (rawSlot) {
                const arr = JSON.parse(rawSlot);
                if (Array.isArray(arr)) legacyByMonth[slot.monthKey] = arr;
              }
            } catch {}
          });

          const list = parsed.map((emp) => {
            const withContract = ensureEmployeeContract(emp);
            if (withContract.projectAllowance === undefined) {
              const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
              withContract.projectAllowance = defaultEmp ? defaultEmp.projectAllowance || 0 : 0;
            }
            if (!withContract.insuranceSalary) {
              const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
              withContract.insuranceSalary = defaultEmp ? defaultEmp.insuranceSalary : 7000000;
            }

            const mergedMonthly = { ...(withContract.monthlyAttendance || {}) };
            legacyMonthSlots.forEach((slot) => {
              const slotList = legacyByMonth[slot.monthKey];
              if (!slotList) return;
              const foundInSlot = slotList.find((x) => x.code === withContract.code || x.id === withContract.id);
              if (!foundInSlot) return;
              const slotRec = foundInSlot.monthlyAttendance?.[slot.monthKey];
              if (slotRec && Object.keys(slotRec.days || {}).length > 0 && !mergedMonthly[slot.monthKey]) {
                mergedMonthly[slot.monthKey] = slotRec;
              } else if (
                !mergedMonthly[slot.monthKey] &&
                ((foundInSlot.actualWorkDays || 0) > 0 || (foundInSlot.overtimeHours || 0) > 0)
              ) {
                mergedMonthly[slot.monthKey] = buildMonthlyAttendanceRecord(
                  slot.m,
                  slot.y,
                  foundInSlot.actualWorkDays || 0,
                  foundInSlot.overtimeHours || 0,
                  foundInSlot.paidLeaveDays || 0,
                  foundInSlot.unpaidLeaveDays || 0
                );
              }
            });

            const withHistory = ensureEmployeeHistoricalMonths({
              ...withContract,
              monthlyAttendance: mergedMonthly,
            });
            return syncEmployeeForMonth(withHistory, realInfo.realMonth, realInfo.realYear, 26);
          });
          return list.sort((a, b) => {
            if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
          });
        }
      } catch (e) {
        console.error('Error parsing saved employees', e);
      }
    }

    return initialEmployees.map((emp) =>
      syncEmployeeForMonth(ensureEmployeeHistoricalMonths(emp), realInfo.realMonth, realInfo.realYear, 26)
    );
  });

  // Hàm làm sạch danh sách nhân viên thời vụ (loại bỏ trùng lặp key/id hoặc bản ghi NV chính thức bị lẫn)
  const cleanSeasonalList = (
    rawList: SeasonalWorker[],
    targetMonth: number = config.month || realDateInfo.realMonth,
    targetYear: number = config.year || realDateInfo.realYear
  ): SeasonalWorker[] => {
    const seenCodes = new Set<string>();
    const seenIds = new Set<string>();
    const result: SeasonalWorker[] = [];
    rawList.forEach((w, idx) => {
      if (!w) return;
      const codeStr = String(w.code || '');
      if (codeStr.startsWith('PNC00') || w.trade === 'Nhân viên chính thức') return;
      const uniqueCode = codeStr || `SEAS_${w.id || idx + 1}`;
      if (seenCodes.has(uniqueCode)) return;
      seenCodes.add(uniqueCode);

      let uniqueId = String(w.id || uniqueCode);
      if (seenIds.has(uniqueId)) {
        uniqueId = `${uniqueCode}_${idx + 1}`;
      }
      seenIds.add(uniqueId);

      result.push(
        syncSeasonalWorkerForMonth(
          ensureSeasonalHistoricalMonths({ ...w, id: uniqueId }),
          targetMonth,
          targetYear
        )
      );
    });
    return result.sort((a, b) => {
      if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  };

  // DANH SÁCH CÔNG NHÂN KỸ THUẬT & NHÂN LỰC THỜI VỤ
  const [seasonalWorkers, setSeasonalWorkers] = useState<SeasonalWorker[]>(() => {
    const realInfo = getRealCurrentDateInfo();
    const saved = localStorage.getItem('payroll_seasonal_workers');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = cleanSeasonalList(parsed, realInfo.realMonth, realInfo.realYear);
          if (cleaned.length > 0) return cleaned;
        }
      } catch (e) {
        console.error('Error parsing saved seasonal workers', e);
      }
    }
    return initialSeasonalWorkers.map((w) =>
      syncSeasonalWorkerForMonth(ensureSeasonalHistoricalMonths(w), realInfo.realMonth, realInfo.realYear)
    );
  });

  // DANH SÁCH DỰ ÁN CÔNG TRÌNH
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('payroll_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing projects', e);
      }
    }
    return initialProjects;
  });

  // DANH SÁCH NHÂN VIÊN TỔ ĐỘI
  const [teamWorkers, setTeamWorkers] = useState<TeamWorker[]>(() => {
    const saved = localStorage.getItem('payroll_team_workers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing team workers', e);
      }
    }
    return initialTeamWorkers;
  });

  // DANH SÁCH BẢN LƯƠNG ỨNG
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>(() => {
    const saved = localStorage.getItem('payroll_salary_advances');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Error parsing salary advances', e);
      }
    }
    return initialSalaryAdvances;
  });

  type SubViewType = 'LIST' | 'ATTENDANCE' | 'PAYROLL' | 'ADVANCES';
  const [activeTab, setActiveTab] = useState<TabType>('SEASONAL_WORKERS');
  const [employeeSubTab, setEmployeeSubTab] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('SEASONAL');
  const [permanentSubTab, setPermanentSubTab] = useState<SubViewType>('LIST');
  const [seasonalSubTab, setSeasonalSubTab] = useState<SubViewType>('LIST');

  const handleSelectTab = (tab: TabType) => {
    if (tab === 'EMPLOYEE_LIST') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('LIST');
      setEmployeeSubTab('PERMANENT');
    } else if (tab === 'PERMANENT_PAYROLL' || tab === 'PAYROLL_TABLE') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('PAYROLL');
    } else if (tab === 'SEASONAL_PAYROLL') {
      setActiveTab('SEASONAL_WORKERS');
      setSeasonalSubTab('PAYROLL');
    } else if (tab === 'ATTENDANCE') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('ATTENDANCE');
    } else if (tab === 'SALARY_ADVANCES') {
      setActiveTab('PERMANENT_EMPLOYEES');
      setPermanentSubTab('ADVANCES');
    } else {
      setActiveTab(tab);
      if (tab === 'PERMANENT_EMPLOYEES') setEmployeeSubTab('PERMANENT');
      if (tab === 'SEASONAL_WORKERS') setEmployeeSubTab('SEASONAL');
    }
  };

  const handleSelectSubTab = (
    parentTab: 'PERMANENT_EMPLOYEES' | 'SEASONAL_WORKERS',
    sub: SubViewType
  ) => {
    setActiveTab(parentTab);
    if (parentTab === 'PERMANENT_EMPLOYEES') {
      setPermanentSubTab(sub);
      setEmployeeSubTab('PERMANENT');
    } else {
      setSeasonalSubTab(sub);
      setEmployeeSubTab('SEASONAL');
    }
  };
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBankExportOpen, setIsBankExportOpen] = useState(false);
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [isZaloSettingsOpen, setIsZaloSettingsOpen] = useState(false);
  const [isBatchZaloOpen, setIsBatchZaloOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [lastSyncedText, setLastSyncedText] = useState<string | null>(getLastSyncedTime());

  const initialAttendanceCheck = useMemo(() => checkShouldShowAttendanceView(), []);

  // Chế độ xem Web App Chấm Công Di Động (dành riêng cho điện thoại thợ hoặc mở từ link riêng)
  const [isMobileAttendanceView, setIsMobileAttendanceView] = useState<boolean>(
    () => initialAttendanceCheck.shouldShow
  );

  const [activeMobileWorkerCode, setActiveMobileWorkerCode] = useState<string | undefined>(
    () => initialAttendanceCheck.workerCode
  );

  // Lắng nghe thay đổi URL (popstate & hashchange) để tự động chuyển sang chế độ chấm công khi có param
  useEffect(() => {
    const handleUrlChange = () => {
      const check = checkShouldShowAttendanceView();
      if (check.shouldShow) {
        setIsMobileAttendanceView(true);
        if (check.workerCode) setActiveMobileWorkerCode(check.workerCode);
      }
    };

    handleUrlChange();
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  // Hàm tạo chuỗi snapshot đại diện cho dữ liệu để phát hiện thay đổi thực tế của người dùng
  const serializeDataSnapshot = (cfg: CompanyConfig, emps: Employee[], seas: SeasonalWorker[]): string => {
    try {
      return JSON.stringify({
        p: cfg?.periodCode,
        e: emps.map((x) => [x.id, x.actualWorkDays, x.advancePayment, x.baseSalary, x.overtimeHours, x.monthlyAttendance]),
        s: seas.map((x) => [x.id, x.actualWorkDays, x.advancePayment, x.dailyRate, x.overtimeHours, x.payrollCycleType, x.monthlyAttendance]),
      });
    } catch {
      return '';
    }
  };

  // Snapshot refs theo dõi trạng thái đã lưu lên Server và Supabase (chống loop và chống lưu liên tục)
  const lastSavedSnapshotRef = useRef<string>('');
  const lastServerSnapshotRef = useRef<string>('');
  const isSyncingRef = useRef(false);
  const periodCodeRef = useRef(config.periodCode);
  const activeMonthRef = useRef(config.month || realDateInfo.realMonth);
  const activeYearRef = useRef(config.year || realDateInfo.realYear);

  useEffect(() => {
    periodCodeRef.current = config.periodCode;
    activeMonthRef.current = config.month || realDateInfo.realMonth;
    activeYearRef.current = config.year || realDateInfo.realYear;
  }, [config.periodCode, config.month, config.year, realDateInfo.realMonth, realDateInfo.realYear]);

  // Khởi tạo snapshot ban đầu
  useEffect(() => {
    const initSnap = serializeDataSnapshot(config, employees, seasonalWorkers);
    lastSavedSnapshotRef.current = initSnap;
    lastServerSnapshotRef.current = initSnap;
  }, []);

  // Kênh truyền tin giữa các tab/cửa sổ trên cùng trình duyệt (BroadcastChannel)
  const syncBroadcast = useMemo(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        return new BroadcastChannel('pncons_payroll_broadcast_sync');
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const notifyCrossTab = () => {
    try {
      syncBroadcast?.postMessage({ type: 'PAYROLL_DATA_CHANGED', timestamp: Date.now() });
    } catch {}
  };

  // Hàm tải dữ liệu mới nhất từ Supabase Cloud và áp dụng an toàn vào ứng dụng (không kích hoạt auto-save ngược lại)
  const reloadLatestFromCloud = async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) return;
    try {
      const curPeriod = periodCodeRef.current;
      const curM = activeMonthRef.current;
      const curY = activeYearRef.current;
      const [cloudCfg, cloudEmp, cloudSea, cloudProj] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(curPeriod),
        loadSeasonalWorkersFromSupabase(curPeriod),
        loadProjectsFromSupabase(),
      ]);

      if (cloudProj && cloudProj.length > 0) {
        setProjects(cloudProj);
        localStorage.setItem('payroll_projects', JSON.stringify(cloudProj));
      }

      let nextSea = seasonalWorkers;
      if (cloudSea && cloudSea.length > 0) {
        const map = new Map<string, SeasonalWorker>();
        seasonalWorkers.forEach((w) => map.set(w.code || w.id, w));
        cloudSea.forEach((cw) => {
          const key = cw.code || cw.id;
          const existing = map.get(key);
          if (existing) {
            const mergedMonthly = { ...(existing.monthlyAttendance || {}) };
            Object.entries(cw.monthlyAttendance || {}).forEach(([mKey, cRec]) => {
              const exRec = mergedMonthly[mKey];
              if (!exRec) {
                mergedMonthly[mKey] = cRec;
              } else {
                const exTime = exRec.lastSubmittedAt ? new Date(exRec.lastSubmittedAt).getTime() : 0;
                const cTime = cRec.lastSubmittedAt ? new Date(cRec.lastSubmittedAt).getTime() : 0;
                // Chọn bản ghi mới hơn thay vì gộp nông { ...exRec.days, ...cRec.days } để các ngày đã xóa không bị phục hồi lại
                const chosenRec = cTime >= exTime ? cRec : exRec;
                const chosenDays = { ...(chosenRec.days || {}) };
                let totDays = 0;
                let totOt = 0;
                Object.values(chosenDays).forEach((d: any) => {
                  totDays += Number(d.workUnits || 0);
                  totOt += Number(d.otHours || 0);
                });
                mergedMonthly[mKey] = {
                  ...exRec,
                  ...chosenRec,
                  days: chosenDays,
                  totalWorkDays: Math.round(totDays * 10) / 10,
                  totalOtHours: totOt,
                };
              }
            });

            map.set(key, {
              ...existing,
              ...cw,
              actualWorkDays: cw.actualWorkDays !== undefined ? cw.actualWorkDays : existing.actualWorkDays,
              overtimeHours: cw.overtimeHours !== undefined ? cw.overtimeHours : existing.overtimeHours,
              monthlyAttendance: mergedMonthly,
              periodRecords: {
                ...(existing.periodRecords || {}),
                ...(cw.periodRecords || {}),
              },
            });
          } else {
            map.set(key, cw);
          }
        });
        nextSea = Array.from(map.values()).map((w) => syncSeasonalWorkerForMonth(w, curM, curY));
      }

      const nextCfg = mergeRemoteConfigPreservingPeriod(config, cloudCfg);
      const nextEmp =
        cloudEmp && cloudEmp.length > 0
          ? mergeEmployeeListsPreservingAttendance(
              employees,
              cloudEmp,
              curM,
              curY,
              nextCfg.standardWorkDays || 26
            )
          : employees;

      // So sánh với snapshot hiện tại: nếu giống hệt, DỪNG NGAY KHÔNG GÂY LẶP VÀ KHÔNG GÂY TREO APP
      const newSnapshot = serializeDataSnapshot(nextCfg, nextEmp, nextSea);
      if (newSnapshot && newSnapshot === lastSavedSnapshotRef.current) {
        setCloudSyncStatus('synced');
        return;
      }

      // Cập nhật snapshot refs trước khi setState để các effect auto-save nhận biết đây là dữ liệu từ Cloud
      lastSavedSnapshotRef.current = newSnapshot;
      lastServerSnapshotRef.current = newSnapshot;

      if (cloudCfg) {
        setConfig(nextCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
      }
      if (cloudEmp && cloudEmp.length > 0) {
        setEmployees(nextEmp);
        localStorage.setItem('payroll_employees', JSON.stringify(nextEmp));
      }
      if (cloudSea && cloudSea.length > 0) {
        setSeasonalWorkers(nextSea);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSea));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getLastSyncedTime());
    } catch (e) {
      console.warn('Error reloading from Supabase Cloud:', e);
      if (!options?.silent) setCloudSyncStatus('error');
    }
  };

  // Persistence LocalStorage
  useEffect(() => {
    localStorage.setItem('payroll_company_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('payroll_employees', JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(seasonalWorkers));
  }, [seasonalWorkers]);

  // ĐỒNG BỘ 2 CHIỀU VỚI MÁY CHỦ BACKEND (SERVER REALTIME SYNC)
  useEffect(() => {
    let isMounted = true;

    // 1. Tải dữ liệu ban đầu từ máy chủ
    (async () => {
      try {
        const serverData = await fetchServerData();
        if (!isMounted) return;

        if (serverData && serverData.lastUpdated > 0) {
          const curM = activeMonthRef.current;
          const curY = activeYearRef.current;
          const nextCfg = mergeRemoteConfigPreservingPeriod(config, serverData.config);
          const nextEmps =
            serverData.employees && serverData.employees.length > 0
              ? mergeEmployeeListsPreservingAttendance(
                  employees,
                  serverData.employees,
                  curM,
                  curY,
                  nextCfg.standardWorkDays || 26
                )
              : employees;
          const nextSeas =
            serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
              ? cleanSeasonalList(serverData.seasonalWorkers, curM, curY)
              : seasonalWorkers;

          const initSnap = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
          lastServerSnapshotRef.current = initSnap;
          lastSavedSnapshotRef.current = initSnap;

          if (serverData.config) {
            setConfig(nextCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
          }
          if (serverData.employees && serverData.employees.length > 0) {
            setEmployees(nextEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
          }
          if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
            setSeasonalWorkers(nextSeas);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
          }
          setCloudSyncStatus('synced');
          setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
        }
      } catch (err) {
        console.warn('Initial server sync error:', err);
      }
    })();

    // 2. Lắng nghe cập nhật Real-time từ máy chủ (khi thợ chấm công trên điện thoại)
    const unsubscribe = subscribeToSync((serverData) => {
      if (!isMounted) return;

      const curM = activeMonthRef.current;
      const curY = activeYearRef.current;
      const nextCfg = mergeRemoteConfigPreservingPeriod(config, serverData.config);
      const nextEmps =
        serverData.employees && serverData.employees.length > 0
          ? mergeEmployeeListsPreservingAttendance(
              employees,
              serverData.employees,
              curM,
              curY,
              nextCfg.standardWorkDays || 26
            )
          : employees;
      const nextSeas =
        serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
          ? cleanSeasonalList(serverData.seasonalWorkers, curM, curY)
          : seasonalWorkers;

      const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
      if (snapshot && snapshot === lastServerSnapshotRef.current) {
        return;
      }

      lastServerSnapshotRef.current = snapshot;
      lastSavedSnapshotRef.current = snapshot;

      if (serverData.config) {
        setConfig(nextCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
      }
      if (serverData.employees && serverData.employees.length > 0) {
        setEmployees(nextEmps);
        localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
      }
      if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
        setSeasonalWorkers(nextSeas);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Khởi động: Tải dữ liệu từ Supabase Cloud
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    (async () => {
      try {
        const curM = activeMonthRef.current;
        const curY = activeYearRef.current;
        const [cloudCfg, cloudEmp, cloudSea, cloudProj] = await Promise.all([
          loadCompanyConfigFromSupabase(),
          loadEmployeesFromSupabase(config.periodCode),
          loadSeasonalWorkersFromSupabase(config.periodCode),
          loadProjectsFromSupabase(),
        ]);

        if (cloudProj && cloudProj.length > 0) {
          setProjects(cloudProj);
          localStorage.setItem('payroll_projects', JSON.stringify(cloudProj));
        }

        let hasAnyDataOnCloud = false;

        const nextCfg = mergeRemoteConfigPreservingPeriod(config, cloudCfg);
        const nextEmps =
          cloudEmp && cloudEmp.length > 0
            ? mergeEmployeeListsPreservingAttendance(
                employees,
                cloudEmp,
                curM,
                curY,
                nextCfg.standardWorkDays || 26
              )
            : employees;
        const nextSeas =
          cloudSea && cloudSea.length > 0
            ? cleanSeasonalList(cloudSea, curM, curY)
            : seasonalWorkers;

        if (cloudCfg) {
          setConfig(nextCfg);
          localStorage.setItem('payroll_company_config', JSON.stringify(nextCfg));
          hasAnyDataOnCloud = true;
        }
        if (cloudEmp && cloudEmp.length > 0) {
          setEmployees(nextEmps);
          localStorage.setItem('payroll_employees', JSON.stringify(nextEmps));
          hasAnyDataOnCloud = true;
        }
        if (cloudSea && cloudSea.length > 0) {
          setSeasonalWorkers(nextSeas);
          localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeas));
          hasAnyDataOnCloud = true;
        }

        const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
        lastSavedSnapshotRef.current = snapshot;
        lastServerSnapshotRef.current = snapshot;

        if (!hasAnyDataOnCloud) {
          const report = await syncAllDataToSupabase(nextCfg, nextEmps, nextSeas);
          if (report.success) {
            setCloudSyncStatus('synced');
            setLastSyncedText(getLastSyncedTime());
          }
        } else {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }
      } catch (e) {
        console.warn('Initial cloud sync error:', e);
        setCloudSyncStatus('error');
      }
    })();
  }, []);

  // 1. Lắng nghe BroadcastChannel (cho các tab trong cùng trình duyệt)
  useEffect(() => {
    if (!syncBroadcast) return;
    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.type === 'PAYROLL_DATA_CHANGED') {
        reloadLatestFromCloud({ silent: true });
      }
    };
    syncBroadcast.addEventListener('message', handleBroadcast);
    return () => {
      syncBroadcast.removeEventListener('message', handleBroadcast);
    };
  }, [syncBroadcast]);

  // 2. Lắng nghe Supabase Realtime (cho các máy tính khác qua Cloud WebSocket)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsubscribe = subscribeToSupabaseRealtime((tableName, eventType) => {
      reloadLatestFromCloud({ silent: true });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 3. Tự động đồng bộ nhẹ nhàng khi người dùng chuyển tab sang trang này (Focus & Visibility Change)
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured() && !isSyncingRef.current) {
        reloadLatestFromCloud({ silent: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Heartbeat dự phòng nhẹ nhàng mỗi 60 giây (loại bỏ polling 4s gây treo máy)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured() && !isSyncingRef.current) {
        reloadLatestFromCloud({ silent: true });
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearInterval(interval);
    };
  }, []);

  // 4. Tự động lưu lên Máy chủ & Supabase Cloud KHI VÀ CHỈ KHI người dùng chỉnh sửa dữ liệu trên Web App
  useEffect(() => {
    const currentSnapshot = serializeDataSnapshot(config, employees, seasonalWorkers);
    if (!currentSnapshot) return;

    // Chỉ lưu nếu snapshot thực sự khác với dữ liệu đã lưu / vừa nhận từ remote
    const needsServerSync = currentSnapshot !== lastServerSnapshotRef.current;
    const needsCloudSync = isSupabaseConfigured() && currentSnapshot !== lastSavedSnapshotRef.current;

    if (!needsServerSync && !needsCloudSync) {
      return;
    }

    const timer = setTimeout(async () => {
      const nowSnapshot = serializeDataSnapshot(config, employees, seasonalWorkers);
      if (nowSnapshot === lastSavedSnapshotRef.current && nowSnapshot === lastServerSnapshotRef.current) {
        return;
      }

      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        setCloudSyncStatus('syncing');

        // 1. Lưu Backend Máy chủ
        if (nowSnapshot !== lastServerSnapshotRef.current) {
          const ok = await saveAllToServer(config, employees, seasonalWorkers);
          if (ok) {
            lastServerSnapshotRef.current = nowSnapshot;
          }
        }

        // 2. Lưu Supabase Cloud
        if (isSupabaseConfigured() && nowSnapshot !== lastSavedSnapshotRef.current) {
          const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
          if (report.success) {
            lastSavedSnapshotRef.current = nowSnapshot;
          }
        }

        setCloudSyncStatus('synced');
        setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
      } catch (err) {
        console.warn('Auto sync error:', err);
        setCloudSyncStatus('error');
      } finally {
        isSyncingRef.current = false;
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [config, employees, seasonalWorkers]);

  // Cập nhật công nhân thời vụ - đồng bộ ngay lập tức lên Máy chủ và Supabase Cloud
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(updated);
    setSeasonalWorkers((prev) => {
      const idx = prev.findIndex(
        (w) => String(w.id) === String(recalculated.id) || (w.code && w.code === recalculated.code)
      );
      let next: SeasonalWorker[];
      if (idx !== -1) {
        next = [...prev];
        const mergedRecords = {
          ...(next[idx].periodRecords || {}),
          ...(recalculated.periodRecords || {}),
        };
        if (recalculated.dailyRate && recalculated.dailyRate > 0) {
          Object.keys(mergedRecords).forEach((k) => {
            if (mergedRecords[k]) {
              const r = mergedRecords[k];
              const sByDays = Math.round(recalculated.dailyRate * Number(r.actualWorkDays || 0));
              const otPay = Math.round((recalculated.dailyRate / 8) * Number(r.overtimeHours || 0) * 1.5);
              const totInc = sByDays + otPay + Number(r.mealAllowance || 0) + Number(r.travelSafetyAllowance || 0) + Number(r.otherBonus || 0);
              const tax = !(r.hasTaxCommitment ?? true) && totInc >= 2000000 ? Math.round(totInc * 0.1) : 0;
              const totDed = tax + Number(r.advancePayment || 0);
              mergedRecords[k] = {
                ...r,
                dailyRate: recalculated.dailyRate,
                salaryByDays: sByDays,
                overtimePay: otPay,
                totalIncome: totInc,
                personalIncomeTax: tax,
                totalDeductions: totDed,
                netSalary: totInc - totDed,
              };
            }
          });
        }
        next[idx] = {
          ...next[idx],
          ...recalculated,
          monthlyAttendance: {
            ...(next[idx].monthlyAttendance || {}),
            ...(recalculated.monthlyAttendance || {}),
          },
          periodRecords: mergedRecords,
        };
      } else {
        next = [...prev, recalculated];
      }
      localStorage.setItem('payroll_seasonal_workers', JSON.stringify(next));
      return next;
    });
    // Lưu ngay lên máy chủ Backend để các thiết bị khác nhận được tức thì
    saveAttendanceToServer(recalculated);
    if (isSupabaseConfigured()) {
      syncSingleSeasonalWorkerToSupabase(recalculated, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Thêm mới công nhân thời vụ - đồng bộ ngay lập tức lên Supabase Cloud (không cần F5)
  const handleAddSeasonalWorker = (newWorker: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(newWorker);
    setSeasonalWorkers((prev) => {
      const maxOrder = prev.reduce((max, w) => Math.max(max, w.sortOrder || 0), 0);
      const workerWithOrder: SeasonalWorker = {
        ...recalculated,
        sortOrder: recalculated.sortOrder || (maxOrder + 1),
      };
      saveSingleWorkerToServer(workerWithOrder);
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(workerWithOrder, config.periodCode).then(() => notifyCrossTab());
      }
      return [...prev, workerWithOrder];
    });
  };

  const handleReorderSeasonalWorkers = (reordered: SeasonalWorker[]) => {
    setSeasonalWorkers(reordered);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(reordered));
    saveAllToServer(config, employees, reordered);
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(reordered, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Xóa triệt để công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteSeasonalWorker = (id: string) => {
    const filtered = seasonalWorkers.filter((w) => String(w.id) !== String(id));
    setSeasonalWorkers(filtered);
    saveAllToServer(config, employees, filtered);
    if (isSupabaseConfigured()) {
      deleteSeasonalWorkerFromSupabase(id).then(() => notifyCrossTab());
    }
  };

  // Xóa hàng loạt công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteBatchSeasonalWorkers = (ids: string[]) => {
    const idSet = new Set(ids.map((item) => String(item)));
    const filtered = seasonalWorkers.filter((w) => !idSet.has(String(w.id)));
    setSeasonalWorkers(filtered);
    saveAllToServer(config, employees, filtered);
    if (isSupabaseConfigured()) {
      deleteBatchSeasonalWorkersFromSupabase(ids).then(() => notifyCrossTab());
    }
  };

  // Xóa toàn bộ công nhân thời vụ trên Supabase Cloud
  const handleClearAllSeasonalWorkers = () => {
    setSeasonalWorkers([]);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify([]));
    saveAllToServer(config, employees, []);
    if (isSupabaseConfigured()) {
      clearAllSeasonalWorkersFromSupabase(config.periodCode).then(() => notifyCrossTab());
    }
  };

  const handleResetSeasonalWorkers = () => {
    setSeasonalWorkers(initialSeasonalWorkers);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(initialSeasonalWorkers));
    saveAllToServer(config, employees, initialSeasonalWorkers);
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(initialSeasonalWorkers, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Cập nhật nhân viên chính thức - đồng bộ ngay lập tức lên Máy chủ & Supabase Cloud
  const handleUpdateEmployee = (updated: Employee) => {
    const recalculated = recomputeEmployeePayroll(updated);
    setEmployees((prev) => {
      const next = prev.map((emp) =>
        emp.id === recalculated.id || emp.code === recalculated.code
          ? {
              ...emp,
              ...recalculated,
              monthlyAttendance: {
                ...(emp.monthlyAttendance || {}),
                ...(recalculated.monthlyAttendance || {}),
              },
              periodRecords: {
                ...(emp.periodRecords || {}),
                ...(recalculated.periodRecords || {}),
              },
            }
          : emp
      );
      localStorage.setItem('payroll_employees', JSON.stringify(next));
      saveAllToServer(config, next, seasonalWorkers);
      return next;
    });
    if (isSupabaseConfigured()) {
      syncSingleEmployeeToSupabase(recalculated, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Thêm nhân viên chính thức
  const handleAddEmployee = (newEmp: Employee) => {
    const recalculated = recomputeEmployeePayroll(newEmp);
    setEmployees((prev) => [...prev, recalculated]);
    if (isSupabaseConfigured()) {
      syncSingleEmployeeToSupabase(recalculated, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Xóa nhân viên chính thức - xóa ngay trên Supabase Cloud
  const handleDeleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    if (isSupabaseConfigured()) {
      deleteEmployeeFromSupabase(id).then(() => notifyCrossTab());
    }
  };

  // Nút cưỡng bức làm mới / đồng bộ ngay tức thì
  const handleManualForceSync = async () => {
    setCloudSyncStatus('syncing');
    try {
      const curM = config.month || realDateInfo.realMonth;
      const curY = config.year || realDateInfo.realYear;
      const serverData = await fetchServerData();
      if (serverData && serverData.lastUpdated > 0) {
        if (serverData.config) {
          setConfig((prev) => mergeRemoteConfigPreservingPeriod(prev, serverData.config));
        }
        if (serverData.employees && serverData.employees.length > 0) {
          setEmployees((prev) =>
            mergeEmployeeListsPreservingAttendance(
              prev,
              serverData.employees,
              curM,
              curY,
              config.standardWorkDays || 26
            )
          );
        }
        if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
          setSeasonalWorkers(cleanSeasonalList(serverData.seasonalWorkers, curM, curY));
        }
        setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
      }
      if (isSupabaseConfigured()) {
        await reloadLatestFromCloud();
      }
      setCloudSyncStatus('synced');
    } catch {
      setCloudSyncStatus('error');
    }
  };

  // Chuyển đổi Tháng/Năm đồng bộ toàn diện cho Bản Chấm Công và Bản Lương (Tháng hiện tại, Tháng 9, Tháng 10...)
  const handleChangeMonthYear = (newMonth: number, newYear: number) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const curMStr = curM < 10 ? `0${curM}` : `${curM}`;
    const currentKey = `payroll_month_${curY}_${curMStr}`;
    try {
      localStorage.setItem(currentKey, JSON.stringify(employees));
    } catch {}

    const mStr = newMonth < 10 ? `0${newMonth}` : `${newMonth}`;
    const nextM = newMonth === 12 ? '01' : newMonth + 1 < 10 ? `0${newMonth + 1}` : `${newMonth + 1}`;
    const nextY = newMonth === 12 ? newYear + 1 : newYear;
    const targetMonthKey = `${newYear}-${mStr}`;

    const newConfig: CompanyConfig = {
      ...config,
      month: newMonth,
      year: newYear,
      period: `Kỳ lương tháng ${mStr} năm ${newYear}`,
      periodCode: `${mStr}/${newYear}`,
      paymentDate: `05/${nextM}/${nextY}`,
    };
    setConfig(newConfig);

    // Kiểm tra nếu có dữ liệu cũ từng lưu trong slot payroll_month_YYYY_MM thì gộp vào monthlyAttendance[targetMonthKey]
    const targetStorageKey = `payroll_month_${newYear}_${mStr}`;
    let legacySlotEmployees: Employee[] | null = null;
    try {
      const savedTarget = localStorage.getItem(targetStorageKey);
      if (savedTarget) {
        const parsedTarget = JSON.parse(savedTarget);
        if (Array.isArray(parsedTarget) && parsedTarget.length > 0) {
          legacySlotEmployees = parsedTarget;
        }
      }
    } catch {}

    const stdDays = config.standardWorkDays || 26;
    setEmployees((prev) =>
      prev.map((emp) => {
        const mergedMonthly = { ...(emp.monthlyAttendance || {}) };
        if (legacySlotEmployees && !mergedMonthly[targetMonthKey]) {
          const matchedOld = legacySlotEmployees.find((x) => x.code === emp.code || x.id === emp.id);
          if (matchedOld) {
            const oldRec = matchedOld.monthlyAttendance?.[targetMonthKey];
            if (oldRec && Object.keys(oldRec.days || {}).length > 0) {
              mergedMonthly[targetMonthKey] = oldRec;
            } else if ((matchedOld.actualWorkDays || 0) > 0 || (matchedOld.overtimeHours || 0) > 0) {
              mergedMonthly[targetMonthKey] = buildMonthlyAttendanceRecord(
                newMonth,
                newYear,
                matchedOld.actualWorkDays || 0,
                matchedOld.overtimeHours || 0,
                matchedOld.paidLeaveDays || 0,
                matchedOld.unpaidLeaveDays || 0
              );
            }
          }
        }
        const withHistory = ensureEmployeeHistoricalMonths({
          ...emp,
          monthlyAttendance: mergedMonthly,
        });
        return syncEmployeeForMonth(withHistory, newMonth, newYear, stdDays);
      })
    );

    setSeasonalWorkers((prev) =>
      prev.map((w) => syncSeasonalWorkerForMonth(ensureSeasonalHistoricalMonths(w), newMonth, newYear))
    );
  };

  const handleBatchUpdate = (updatedList: Employee[]) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const stdDays = config.standardWorkDays || 26;
    const normalizedList = updatedList.map((emp) => syncEmployeeForMonth(emp, curM, curY, stdDays));
    setEmployees(normalizedList);
    const mStr = curM < 10 ? `0${curM}` : `${curM}`;
    const currentMonthKey = `payroll_month_${curY}_${mStr}`;
    try {
      localStorage.setItem(currentMonthKey, JSON.stringify(normalizedList));
      localStorage.setItem('payroll_employees', JSON.stringify(normalizedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    saveAllToServer(config, normalizedList, seasonalWorkers);
    if (isSupabaseConfigured()) {
      syncEmployeesToSupabase(normalizedList, config.periodCode).then(() => notifyCrossTab());
    }
  };

  const handleResetDefault = () => {
    localStorage.removeItem('payroll_employees');
    localStorage.removeItem('payroll_company_config');
    const clean = initialEmployees.map((emp) =>
      syncEmployeeForMonth(
        ensureEmployeeHistoricalMonths(emp),
        realDateInfo.realMonth,
        realDateInfo.realYear,
        26
      )
    );
    setEmployees(clean);
    setConfig(initialCompanyConfig);
    localStorage.setItem('payroll_employees', JSON.stringify(clean));
  };

  const handleAuditSelectEmployee = (code: string) => {
    setActiveTab('PAYSLIP');
  };

  // Handlers for Projects
  const handleAddProject = (p: Project) => {
    const updated = [p, ...projects];
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };
  const handleUpdateProject = (p: Project) => {
    const updated = projects.map((item) => (item.id === p.id ? p : item));
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };
  const handleDeleteProject = (id: string) => {
    const updated = projects.filter((item) => item.id !== id);
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
    if (isSupabaseConfigured()) {
      syncProjectsToSupabase(updated)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };

  // Handlers for Team Workers
  const handleAddTeamWorker = (tw: TeamWorker) => {
    const updated = [...teamWorkers, tw];
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleUpdateTeamWorker = (tw: TeamWorker) => {
    const updated = teamWorkers.map((item) => (item.id === tw.id ? tw : item));
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleDeleteTeamWorker = (id: string) => {
    const updated = teamWorkers.filter((item) => item.id !== id);
    setTeamWorkers(updated);
    localStorage.setItem('payroll_team_workers', JSON.stringify(updated));
  };
  const handleBatchUpdateTeamWorkers = (list: TeamWorker[]) => {
    setTeamWorkers(list);
    localStorage.setItem('payroll_team_workers', JSON.stringify(list));
  };

  // Helper kiểm tra phiếu tạm ứng thuộc Tháng / Năm đang xét
  const doesAdvanceMatchMonthYear = (adv: SalaryAdvance, m: number, y: number): boolean => {
    const dateStr = (adv.requestDate || adv.paymentDate || '').trim();
    if (dateStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [yy, mm] = dateStr.split('-').map(Number);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length === 3) {
        const mm = Number(parts[1]);
        const yy = Number(parts[2].length === 4 ? parts[2] : parts[0]);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
    }
    if (adv.periodKey) {
      const pParts = adv.periodKey.split(/[\/\-]/);
      if (pParts.length === 2) {
        const mm = Number(pParts[0].length === 4 ? pParts[1] : pParts[0]);
        const yy = Number(pParts[0].length === 4 ? pParts[0] : pParts[1]);
        if (!isNaN(mm) && !isNaN(yy)) return mm === m && yy === y;
      }
    }
    return true;
  };

  // Đồng bộ danh sách phiếu tạm ứng vào Nhân viên chính thức & Nhân viên thời vụ
  const syncAdvancesIntoWorkers = (nextAdvances: SalaryAdvance[]) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const mStr = String(curM).padStart(2, '0');
    const monthPeriodKey = `${curY}-${mStr}_MONTH`;

    const nextEmployees = employees.map((e) => {
      const empAdvances = nextAdvances.filter(
        (a) =>
          a.targetType === 'PERMANENT' &&
          (a.workerId === e.id || a.workerCode === e.code) &&
          doesAdvanceMatchMonthYear(a, curM, curY)
      );
      const sumAdv = empAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return recomputeEmployeePayroll({ ...e, advancePayment: sumAdv });
    });

    const nextSeasonal = seasonalWorkers.map((w) => {
      const workerAdvances = nextAdvances.filter(
        (a) =>
          a.targetType === 'SEASONAL' &&
          (a.workerId === w.id || a.workerCode === w.code) &&
          doesAdvanceMatchMonthYear(a, curM, curY)
      );
      const sumAdv = workerAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const totalDeductions = (w.personalIncomeTax || 0) + sumAdv;
      const netSalary = Math.max(0, (w.totalIncome || 0) - totalDeductions);
      const nextPeriodRecords = { ...(w.periodRecords || {}) };
      if (nextPeriodRecords[monthPeriodKey]) {
        const rec = nextPeriodRecords[monthPeriodKey];
        const recDed = (rec.personalIncomeTax || 0) + sumAdv;
        nextPeriodRecords[monthPeriodKey] = {
          ...rec,
          advancePayment: sumAdv,
          totalDeductions: recDed,
          netSalary: Math.max(0, (rec.totalIncome || 0) - recDed),
        };
      }
      return {
        ...w,
        advancePayment: sumAdv,
        totalDeductions,
        netSalary,
        periodRecords: nextPeriodRecords,
      };
    });

    setEmployees(nextEmployees);
    setSeasonalWorkers(nextSeasonal);
    localStorage.setItem('payroll_employees', JSON.stringify(nextEmployees));
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(nextSeasonal));
    saveAllToServer(config, nextEmployees, nextSeasonal);
  };

  // Handlers for Salary Advances
  const handleAddSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = [adv, ...salaryAdvances];
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };
  const handleUpdateSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = salaryAdvances.map((item) => (item.id === adv.id ? adv : item));
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };
  const handleDeleteSalaryAdvance = (id: string) => {
    const updated = salaryAdvances.filter((item) => item.id !== id);
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    syncAdvancesIntoWorkers(updated);
  };

  const handleBatchUpdateSeasonalWorkers = (list: SeasonalWorker[]) => {
    const curM = config.month || realDateInfo.realMonth;
    const curY = config.year || realDateInfo.realYear;
    const syncedList = list.map((w) => syncSeasonalWorkerForMonth(w, curM, curY));
    setSeasonalWorkers(syncedList);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(syncedList));
    saveAllToServer(config, employees, syncedList);
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(syncedList, config.periodCode)
        .then(() => notifyCrossTab())
        .catch(() => {});
    }
  };

  // Đồng bộ 100% danh sách nhân viên và công nhân thời vụ theo đúng Tháng/Năm đang chọn (config.month / config.year)
  // và tự động cộng tổng tiền Tạm ứng từ Bản Ứng Lương (salaryAdvances) vào đúng nhân viên
  const syncedEmployees = useMemo(() => {
    const m = config.month || realDateInfo.realMonth;
    const y = config.year || realDateInfo.realYear;
    const std = config.standardWorkDays || 26;
    return employees.map((e) => {
      const synced = syncEmployeeForMonth(e, m, y, std);
      const matchingAdvances = salaryAdvances.filter(
        (a) =>
          a.targetType === 'PERMANENT' &&
          (a.workerId === synced.id || a.workerCode === synced.code) &&
          doesAdvanceMatchMonthYear(a, m, y)
      );
      if (matchingAdvances.length > 0) {
        const sumAdv = matchingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
        return recomputeEmployeePayroll({ ...synced, advancePayment: sumAdv });
      }
      return synced;
    });
  }, [employees, salaryAdvances, config.month, config.year, config.standardWorkDays, realDateInfo.realMonth, realDateInfo.realYear]);

  const syncedSeasonalWorkers = useMemo(() => {
    const m = config.month || realDateInfo.realMonth;
    const y = config.year || realDateInfo.realYear;
    return seasonalWorkers.map((w) => {
      const synced = syncSeasonalWorkerForMonth(w, m, y);
      const matchingAdvances = salaryAdvances.filter(
        (a) =>
          a.targetType === 'SEASONAL' &&
          (a.workerId === synced.id || a.workerCode === synced.code) &&
          doesAdvanceMatchMonthYear(a, m, y)
      );
      const sumAdv =
        matchingAdvances.length > 0
          ? matchingAdvances.reduce((s, a) => s + (Number(a.amount) || 0), 0)
          : 0;
      const totalDeductions = (synced.personalIncomeTax || 0) + sumAdv;
      const netSalary = Math.max(0, (synced.totalIncome || 0) - totalDeductions);
      return {
        ...synced,
        advancePayment: sumAdv,
        totalDeductions,
        netSalary,
      };
    });
  }, [seasonalWorkers, salaryAdvances, config.month, config.year, realDateInfo.realMonth, realDateInfo.realYear]);

  // Count issues
  const auditCount = syncedEmployees.filter(
    (e) =>
      !e.bankAccount ||
      (e.selectedForAttendance !== false && e.netSalary <= 0) ||
      e.actualWorkDays > e.standardWorkDays
  ).length;

  // Khi người dùng hoặc thợ mở link Web App Chấm Công Di Động riêng trên điện thoại
  if (isMobileAttendanceView) {
    const isAdminPreview =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('pncons_is_admin_preview') === 'true';

    // Chuyển đổi NV Chính Thức đang làm việc sang định dạng chung để dùng chung Web App Chấm Công Di Động
    const permanentAsWorkers: SeasonalWorker[] = syncedEmployees
      .filter((e) => (e.status || 'ACTIVE') === 'ACTIVE')
      .map((e) => ({
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
            : Math.round((e.baseSalary || 0) / (e.standardWorkDays || config.standardWorkDays || 26)),
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
      }));

    const allMobileWorkers: SeasonalWorker[] = [...syncedSeasonalWorkers, ...permanentAsWorkers];

    return (
      <MobileAttendanceApp
        workers={allMobileWorkers}
        projects={projects}
        config={config}
        initialWorkerCode={activeMobileWorkerCode}
        isAdminPreview={isAdminPreview}
        onUpdateWorker={(updatedWorker) => {
          const matchedPerm = employees.find(
            (e) => e.code === updatedWorker.code || String(e.id) === String(updatedWorker.id)
          );
          if (matchedPerm) {
            handleUpdateEmployee({
              ...matchedPerm,
              actualWorkDays: updatedWorker.actualWorkDays,
              overtimeHours: updatedWorker.overtimeHours,
              selectedForAttendance:
                (updatedWorker.actualWorkDays || 0) > 0 || (updatedWorker.overtimeHours || 0) > 0,
              monthlyAttendance: updatedWorker.monthlyAttendance,
              periodRecords: updatedWorker.periodRecords,
              payrollCycleType: updatedWorker.payrollCycleType,
              currentPeriodKey: updatedWorker.currentPeriodKey,
            });
          } else {
            handleUpdateSeasonalWorker(updatedWorker);
          }
        }}
        onExitMobileView={() => {
          sessionStorage.setItem('pncons_admin_auth', 'true');
          sessionStorage.removeItem('pncons_is_admin_preview');
          sessionStorage.removeItem('pncons_in_mobile_mode');
          sessionStorage.removeItem('pncons_mobile_worker_code');
          setIsMobileAttendanceView(false);
          try {
            const cleanUrl = window.location.pathname;
            window.history.pushState(null, '', cleanUrl);
          } catch {}
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        config={config}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenBankExport={() => setIsBankExportOpen(true)}
        onEditCompany={() => setIsCompanyOpen(true)}
        onOpenZaloSettings={() => setIsZaloSettingsOpen(true)}
        onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
        onToggleSidebar={() => setIsSidebarMobileOpen((prev) => !prev)}
        onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
        onManualSync={handleManualForceSync}
        cloudSyncStatus={cloudSyncStatus}
        lastSyncedText={lastSyncedText}
      />

      {/* Main Layout: Sidebar on Left + Content on Right */}
      <div className="flex flex-1 min-h-[calc(100vh-60px)] relative">
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          permanentSubTab={permanentSubTab}
          seasonalSubTab={seasonalSubTab}
          onSelectSubTab={handleSelectSubTab}
          auditIssuesCount={auditCount}
          seasonalCount={syncedSeasonalWorkers.length}
          employeeCount={syncedEmployees.length}
          teamCount={teamWorkers.length}
          projectCount={projects.length}
          advanceCount={salaryAdvances.length}
          config={config}
          isOpenMobile={isSidebarMobileOpen}
          onCloseMobile={() => setIsSidebarMobileOpen(false)}
          onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
          onOpenCompanyModal={() => setIsCompanyOpen(true)}
          onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
          onOpenMobileAttendance={() => setIsMobileAttendanceView(true)}
          cloudSyncStatus={cloudSyncStatus}
        />

        {/* Right Main Content Area */}
        <main className="flex-1 min-w-0 bg-slate-100 p-3 sm:p-5 flex flex-col overflow-x-hidden">
          <div className="w-full mx-auto flex-1 flex flex-col">
            {/* Top Navigation Bar: Tab 1 và Tab 2 nổi bật */}
            <div className="no-print">
              <NavigationTabs
                activeTab={activeTab}
                onSelectTab={handleSelectTab}
                auditIssuesCount={auditCount}
                employeeCount={syncedEmployees.length}
                seasonalCount={syncedSeasonalWorkers.length}
                teamCount={teamWorkers.length}
                projectCount={projects.length}
                advanceCount={salaryAdvances.length}
              />
            </div>

            {/* Metric Summary Cards — Đồng bộ 100% với Bản Chấm Công và Bản Lương */}
            <div className="no-print">
              <MetricCards
                employees={syncedEmployees}
                seasonalWorkers={syncedSeasonalWorkers}
                activeCategory={activeTab === 'SEASONAL_WORKERS' ? 'SEASONAL' : 'PERMANENT'}
                config={config}
              />
            </div>

            {/* Tab Views */}
            <div className="flex-1">
              {/* TAB 1: BẢN NHÂN VIÊN CHÍNH THỨC (CÓ 4 SUB-TABS BÊN TRONG) */}
              {(activeTab === 'PERMANENT_EMPLOYEES' || activeTab === 'EMPLOYEE_LIST') && (
                <div className="space-y-3">
                  {/* Thanh chuyển đổi 4 Tab con bên trong Tab 1 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        id="subtab-perm-list"
                        onClick={() => setPermanentSubTab('LIST')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'LIST'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Users className="w-4 h-4 text-sky-400" />
                        <span>1.1 Danh Sách Nhân Viên</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          permanentSubTab === 'LIST' ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {syncedEmployees.length}
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-att"
                        onClick={() => setPermanentSubTab('ATTENDANCE')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'ATTENDANCE'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <CalendarCheck className="w-4 h-4 text-emerald-400" />
                        <span>1.2 Bản Chấm Công</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          {syncedEmployees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length} đang làm việc
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-payroll"
                        onClick={() => setPermanentSubTab('PAYROLL')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'PAYROLL'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Table2 className="w-4 h-4 text-sky-300" />
                        <span>1.3 Bản Lương</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-100 text-sky-800 border border-sky-300">
                          {
                            syncedEmployees.filter(
                              (e) =>
                                (e.status || 'ACTIVE') === 'ACTIVE' &&
                                (e.selectedForAttendance === true ||
                                  (e.actualWorkDays || 0) > 0 ||
                                  (e.overtimeHours || 0) > 0)
                            ).length
                          }{' '}
                          tham gia chấm công
                        </span>
                      </button>

                      <button
                        type="button"
                        id="subtab-perm-advances"
                        onClick={() => setPermanentSubTab('ADVANCES')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          permanentSubTab === 'ADVANCES'
                            ? 'bg-[#0f3d64] text-white shadow-md font-black ring-2 ring-[#0f3d64]/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 text-amber-400" />
                        <span>1.4 Bản Ứng Lương</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          permanentSubTab === 'ADVANCES' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {salaryAdvances.filter((a) => a.targetType === 'PERMANENT').length}
                        </span>
                      </button>
                    </div>

                    {/* Hiển thị ngày thực hiện tại & Nút chọn nhanh Tháng 9 / Tháng 10 / Tháng hiện tại */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Hôm nay: {realDateInfo.realDateStr}</span>
                      </span>
                      <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(9, config.year || realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === 9
                              ? 'bg-[#0f3d64] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          Tháng 9
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(10, config.year || realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === 10
                              ? 'bg-[#0f3d64] text-white shadow-2xs'
                              : 'text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}
                        >
                          Tháng 10
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangeMonthYear(realDateInfo.realMonth, realDateInfo.realYear)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                            config.month === realDateInfo.realMonth && config.year === realDateInfo.realYear
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          Tháng {realDateInfo.realMonthPadded}/{realDateInfo.realYear} (Hiện tại)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 1.1 Danh Sách Nhân Viên */}
                  {permanentSubTab === 'LIST' && (
                    <EmployeeListTab
                      employees={syncedEmployees}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      onBatchUpdate={handleBatchUpdate}
                      onGoToAttendance={() => setPermanentSubTab('ATTENDANCE')}
                      onGoToSeasonalWorkers={() => {
                        setActiveTab('SEASONAL_WORKERS');
                        setSeasonalSubTab('LIST');
                      }}
                      onResetDefault={handleResetDefault}
                    />
                  )}

                  {/* 1.2 Bản Chấm Công (Chỉ hiện NV đang làm việc) */}
                  {permanentSubTab === 'ATTENDANCE' && (
                    <AttendanceTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onBatchUpdate={handleBatchUpdate}
                      onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                      onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      forcedGroup="PERMANENT"
                      seasonalCount={syncedSeasonalWorkers.length}
                    />
                  )}

                  {/* 1.3 Bản Lương (Tự động nhảy lương khi nhân viên tham gia chấm công) */}
                  {permanentSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      forcedCategory="PERMANENT"
                    />
                  )}

                  {/* 1.4 Bản Ứng Lương (Chỉ hiện NV đang làm việc) */}
                  {permanentSubTab === 'ADVANCES' && (
                    <SalaryAdvancesTab
                      advances={salaryAdvances}
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onAddAdvance={handleAddSalaryAdvance}
                      onUpdateAdvance={handleUpdateSalaryAdvance}
                      onDeleteAdvance={handleDeleteSalaryAdvance}
                      forcedTargetType="PERMANENT"
                    />
                  )}
                </div>
              )}

              {/* TAB 2: BẢN NHÂN VIÊN THỜI VỤ (CÓ 4 SUB-TABS BÊN TRONG) */}
              {activeTab === 'SEASONAL_WORKERS' && (
                <div className="space-y-3">
                  {/* Thanh chuyển đổi 4 Tab con bên trong Tab 2 (ẩn trên 2.1 Danh Sách Thời Vụ theo yêu cầu tinh gọn) */}
                  {seasonalSubTab !== 'LIST' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <button
                          type="button"
                          id="subtab-seas-list"
                          onClick={() => setSeasonalSubTab('LIST')}
                          className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                        >
                          <HardHat className="w-4 h-4 text-amber-200" />
                          <span>2.1 Danh Sách Thời Vụ</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-200 text-slate-700">
                            {syncedSeasonalWorkers.length}
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-att"
                          onClick={() => setSeasonalSubTab('ATTENDANCE')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'ATTENDANCE'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <CalendarCheck className="w-4 h-4 text-amber-200" />
                          <span>2.2 Bản Chấm Công</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            {syncedSeasonalWorkers.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE').length} đang làm việc
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-payroll"
                          onClick={() => setSeasonalSubTab('PAYROLL')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'PAYROLL'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <Table2 className="w-4 h-4 text-amber-200" />
                          <span>2.3 Bản Lương</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                            {
                              syncedSeasonalWorkers.filter(
                                (w) =>
                                  (w.status || 'ACTIVE') === 'ACTIVE' &&
                                  ((w.actualWorkDays || 0) > 0 || (w.overtimeHours || 0) > 0)
                              ).length
                            }{' '}
                            tham gia chấm công
                          </span>
                        </button>

                        <button
                          type="button"
                          id="subtab-seas-advances"
                          onClick={() => setSeasonalSubTab('ADVANCES')}
                          className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                            seasonalSubTab === 'ADVANCES'
                              ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          <CreditCard className="w-4 h-4 text-amber-200" />
                          <span>2.4 Bản Ứng Lương</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                            seasonalSubTab === 'ADVANCES' ? 'bg-slate-900 text-amber-300' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {salaryAdvances.filter((a) => a.targetType === 'SEASONAL').length}
                          </span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                          <span>Hôm nay: {realDateInfo.realDateStr}</span>
                        </span>
                        <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(9, config.year || realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === 9
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            Tháng 9
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(10, config.year || realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === 10
                                ? 'bg-amber-600 text-white shadow-2xs'
                                : 'text-slate-600 hover:bg-white hover:text-slate-900'
                            }`}
                          >
                            Tháng 10
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeMonthYear(realDateInfo.realMonth, realDateInfo.realYear)}
                            className={`px-2 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
                              config.month === realDateInfo.realMonth && config.year === realDateInfo.realYear
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            Tháng {realDateInfo.realMonthPadded}/{realDateInfo.realYear} (Hiện tại)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2.1 Danh Sách Thời Vụ */}
                  {seasonalSubTab === 'LIST' && (
                    <SeasonalWorkersTab
                      workers={syncedSeasonalWorkers}
                      projects={projects}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateWorker={handleUpdateSeasonalWorker}
                      onAddWorker={handleAddSeasonalWorker}
                      onDeleteWorker={handleDeleteSeasonalWorker}
                      onDeleteBatchWorkers={handleDeleteBatchSeasonalWorkers}
                      onClearAllWorkers={handleClearAllSeasonalWorkers}
                      onResetWorkers={handleResetSeasonalWorkers}
                      onReorderWorkers={handleReorderSeasonalWorkers}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      onGoToPermanentEmployees={() => {
                        setActiveTab('PERMANENT_EMPLOYEES');
                        setPermanentSubTab('LIST');
                      }}
                      onGoToSeasonalAttendance={() => setSeasonalSubTab('ATTENDANCE')}
                      onGoToSeasonalPayroll={() => setSeasonalSubTab('PAYROLL')}
                    />
                  )}

                  {/* 2.2 Bản Chấm Công (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ATTENDANCE' && (
                    <AttendanceTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onBatchUpdate={handleBatchUpdate}
                      onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                      onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                      onOpenMobileView={(workerCode) => {
                        sessionStorage.setItem('pncons_is_admin_preview', 'true');
                        setActiveMobileWorkerCode(workerCode);
                        setIsMobileAttendanceView(true);
                      }}
                      forcedGroup="SEASONAL"
                      seasonalCount={syncedSeasonalWorkers.length}
                    />
                  )}

                  {/* 2.3 Bản Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                      forcedCategory="SEASONAL"
                    />
                  )}

                  {/* 2.4 Bản Ứng Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ADVANCES' && (
                    <SalaryAdvancesTab
                      advances={salaryAdvances}
                      employees={syncedEmployees}
                      seasonalWorkers={syncedSeasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onAddAdvance={handleAddSalaryAdvance}
                      onUpdateAdvance={handleUpdateSalaryAdvance}
                      onDeleteAdvance={handleDeleteSalaryAdvance}
                      forcedTargetType="SEASONAL"
                    />
                  )}
                </div>
              )}

              {/* Tab 3: Danh Sách Dự Án */}
              {activeTab === 'PROJECTS' && (
                <ProjectsTab
                  projects={projects}
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  onAddProject={handleAddProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}

              {/* Tab 4: Báo Cáo Tài Chính */}
              {activeTab === 'FINANCIAL_REPORT' && (
                <FinancialReportTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  projects={projects}
                  advances={salaryAdvances}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                />
              )}

              {/* Tab 5: Phiếu Lương */}
              {activeTab === 'PAYSLIP' && (
                <PayslipTab
                  employees={syncedEmployees}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployeeContact={(empId, updates) => {
                    setEmployees((prev) =>
                      prev.map((e) =>
                        e.id === empId || e.code === empId
                          ? {
                              ...e,
                              ...(updates.email !== undefined ? { email: updates.email } : {}),
                              ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
                            }
                          : e
                      )
                    );
                  }}
                  onUpdateEmployeeEmail={(empId, newEmail) => {
                    setEmployees((prev) =>
                      prev.map((e) =>
                        e.id === empId || e.code === empId ? { ...e, email: newEmail } : e
                      )
                    );
                  }}
                  onOpenZaloSettings={() => setIsZaloSettingsOpen(true)}
                  onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
                />
              )}

              {/* Tab: Tổng Hợp Theo Bộ Phận */}
              {activeTab === 'DEPARTMENT' && (
                <DepartmentSummaryTab employees={syncedEmployees} />
              )}

              {/* Tab 6: Kiểm Tra Dữ Liệu */}
              {activeTab === 'DATA_AUDIT' && (
                <DataAuditTab
                  employees={syncedEmployees}
                  onSelectEmployeeForPayslip={handleAuditSelectEmployee}
                />
              )}

              {/* Direct Tab Access Fallbacks */}
              {activeTab === 'PERMANENT_PAYROLL' && (
                <PayrollTableTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  forcedCategory="PERMANENT"
                />
              )}

              {activeTab === 'SEASONAL_PAYROLL' && (
                <PayrollTableTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  onUpdateSeasonalWorker={handleUpdateSeasonalWorker}
                  forcedCategory="SEASONAL"
                />
              )}

              {activeTab === 'ATTENDANCE' && (
                <AttendanceTab
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onBatchUpdate={handleBatchUpdate}
                  onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                  onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                  seasonalCount={syncedSeasonalWorkers.length}
                />
              )}

              {activeTab === 'SALARY_ADVANCES' && (
                <SalaryAdvancesTab
                  advances={salaryAdvances}
                  employees={syncedEmployees}
                  seasonalWorkers={syncedSeasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onAddAdvance={handleAddSalaryAdvance}
                  onUpdateAdvance={handleUpdateSalaryAdvance}
                  onDeleteAdvance={handleDeleteSalaryAdvance}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={(newEmployees) => {
          setEmployees(newEmployees);
        }}
        onResetDefault={handleResetDefault}
      />

      <BankExportModal
        isOpen={isBankExportOpen}
        onClose={() => setIsBankExportOpen(false)}
        employees={employees}
        config={config}
      />

      <CompanyModal
        isOpen={isCompanyOpen}
        onClose={() => setIsCompanyOpen(false)}
        config={config}
        onSave={(newCfg) => {
          setConfig(newCfg);
          if (newCfg.standardWorkDays && newCfg.standardWorkDays !== config.standardWorkDays) {
            setEmployees((prev) =>
              prev.map((emp) =>
                recomputeEmployeePayroll({
                  ...emp,
                  standardWorkDays: newCfg.standardWorkDays,
                })
              )
            );
          }
        }}
      />

      <ZaloOASettingsModal
        isOpen={isZaloSettingsOpen}
        onClose={() => setIsZaloSettingsOpen(false)}
        config={config}
        onSave={(newZaloConfig) => {
          setConfig((prev) => ({
            ...prev,
            zaloOA: newZaloConfig,
          }));
        }}
      />

      <BatchSendZaloModal
        isOpen={isBatchZaloOpen}
        onClose={() => setIsBatchZaloOpen(false)}
        employees={employees}
        config={config}
        onOpenSettings={() => {
          setIsBatchZaloOpen(false);
          setIsZaloSettingsOpen(true);
        }}
      />

      <SupabaseSyncModal
        isOpen={isSupabaseOpen}
        onClose={() => setIsSupabaseOpen(false)}
        config={config}
        employees={employees}
        seasonalWorkers={seasonalWorkers}
        teamWorkers={teamWorkers}
        projects={projects}
        salaryAdvances={salaryAdvances}
        onDataLoadedFromCloud={({
          config: newCfg,
          employees: newEmps,
          seasonalWorkers: newSeas,
          teamWorkers: newTeams,
          projects: newProjs,
          salaryAdvances: newAdvs,
        }) => {
          if (newCfg) {
            setConfig(newCfg);
            localStorage.setItem('payroll_company_config', JSON.stringify(newCfg));
          }
          if (newEmps && newEmps.length > 0) {
            setEmployees(newEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(newEmps));
          }
          if (newSeas && newSeas.length > 0) {
            setSeasonalWorkers(newSeas);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(newSeas));
          }
          if (newTeams && newTeams.length > 0) {
            setTeamWorkers(newTeams);
            localStorage.setItem('payroll_team_workers', JSON.stringify(newTeams));
          }
          if (newProjs && newProjs.length > 0) {
            setProjects(newProjs);
            localStorage.setItem('payroll_projects', JSON.stringify(newProjs));
          }
          if (newAdvs && newAdvs.length > 0) {
            setSalaryAdvances(newAdvs);
            localStorage.setItem('payroll_salary_advances', JSON.stringify(newAdvs));
          }
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }}
        onSyncSuccess={() => {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
        }}
      />
    </div>
  );
}
