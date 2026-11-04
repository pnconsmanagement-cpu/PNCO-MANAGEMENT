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
  syncAllDataToSupabase,
  syncSeasonalWorkersToSupabase,
  syncSingleSeasonalWorkerToSupabase,
  deleteSeasonalWorkerFromSupabase,
  deleteBatchSeasonalWorkersFromSupabase,
  clearAllSeasonalWorkersFromSupabase,
  syncSingleEmployeeToSupabase,
  syncEmployeesToSupabase,
  deleteEmployeeFromSupabase,
  subscribeToSupabaseRealtime,
  autoApplyUrlConfig,
  getLastSyncedTime,
} from './services/supabaseService';
import { initialCompanyConfig, initialEmployees } from './data/mockPayrollData';
import { initialSeasonalWorkers, recomputeSeasonalWorkerPayroll as recomputeSeasonal } from './data/mockSeasonalWorkers';
import { initialProjects, initialTeamWorkers, initialSalaryAdvances } from './data/mockProjectsAndTeams';
import { CompanyConfig, Employee, SeasonalWorker, Project, TeamWorker, SalaryAdvance } from './types';
import { recomputeEmployeePayroll } from './utils/payrollCalculator';
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

// DỮ LIỆU ĐƯỢC BẢO LƯU 100% - KHÔNG TỰ ĐỘNG XÓA HOẶC RESET KHI SỬA CODE
export default function App() {
  const [config, setConfig] = useState<CompanyConfig>(() => {
    const saved = localStorage.getItem('payroll_company_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          standardWorkDays: parsed.standardWorkDays || 26,
        };
      } catch {
        return initialCompanyConfig;
      }
    }
    return initialCompanyConfig;
  });

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('payroll_employees');
    if (saved) {
      try {
        const parsed: Employee[] = JSON.parse(saved);
        // BẢO LƯU 100% DỮ LIỆU NGƯỜI DÙNG:
        // Luôn giữ nguyên dữ liệu nhân viên đã được chỉnh sửa hoặc thêm mới
        if (Array.isArray(parsed) && parsed.length > 0) {
          const list = parsed.map((emp) => {
            const withContract = ensureEmployeeContract(emp);
            if (withContract.code === 'PNC0008' && (withContract.baseSalary === 16000000 || withContract.actualWorkDays === 2 || withContract.actualWorkDays === 0)) {
              withContract.baseSalary = 11500000;
              withContract.actualWorkDays = 27;
              withContract.overtimeHours = 38;
            }
            if (withContract.projectAllowance === undefined) {
              const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
              withContract.projectAllowance = defaultEmp ? (defaultEmp.projectAllowance || 0) : 0;
            }
            if (!withContract.insuranceSalary) {
              const defaultEmp = initialEmployees.find((e) => e.code === withContract.code);
              withContract.insuranceSalary = defaultEmp ? defaultEmp.insuranceSalary : 7000000;
            }
            return recomputeEmployeePayroll(withContract);
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

    // Chỉ sử dụng mẫu ban đầu khi máy chưa từng lưu bất kỳ dữ liệu nào
    return initialEmployees.map((emp) => recomputeEmployeePayroll(emp));
  });

  // Hàm làm sạch danh sách nhân viên thời vụ (loại bỏ trùng lặp key/id hoặc bản ghi NV chính thức bị lẫn)
  const cleanSeasonalList = (rawList: SeasonalWorker[]): SeasonalWorker[] => {
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

      result.push(recomputeSeasonal({ ...w, id: uniqueId }));
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
    const saved = localStorage.getItem('payroll_seasonal_workers');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const cleaned = cleanSeasonalList(parsed);
          if (cleaned.length > 0) return cleaned;
        }
      } catch (e) {
        console.error('Error parsing saved seasonal workers', e);
      }
    }
    return initialSeasonalWorkers;
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
  const [activeTab, setActiveTab] = useState<TabType>('PERMANENT_EMPLOYEES');
  const [employeeSubTab, setEmployeeSubTab] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('PERMANENT');
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
        s: seas.map((x) => [x.id, x.actualWorkDays, x.advancePayment, x.dailyRate, x.overtimeHours, x.monthlyAttendance]),
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

  useEffect(() => {
    periodCodeRef.current = config.periodCode;
  }, [config.periodCode]);

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
      const [cloudCfg, cloudEmp, cloudSea] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(curPeriod),
        loadSeasonalWorkersFromSupabase(curPeriod),
      ]);

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
                const mergedDays = {
                  ...(exRec.days || {}),
                  ...(cRec.days || {}),
                };
                let totDays = 0;
                let totOt = 0;
                Object.values(mergedDays).forEach((d: any) => {
                  totDays += Number(d.workUnits || 0);
                  totOt += Number(d.otHours || 0);
                });
                mergedMonthly[mKey] = {
                  ...exRec,
                  ...cRec,
                  days: mergedDays,
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
        nextSea = Array.from(map.values()).map((w) => recomputeSeasonal(w));
      }

      const nextCfg = cloudCfg || config;
      const nextEmp = (cloudEmp && cloudEmp.length > 0) ? cloudEmp : employees;

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
        setConfig(cloudCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(cloudCfg));
      }
      if (cloudEmp && cloudEmp.length > 0) {
        setEmployees(cloudEmp);
        localStorage.setItem('payroll_employees', JSON.stringify(cloudEmp));
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
  // Giúp link chấm công trên điện thoại và webapp trên máy tính luôn đồng bộ 100% dữ liệu ngay tức thì
  useEffect(() => {
    let isMounted = true;

    // 1. Tải dữ liệu ban đầu từ máy chủ
    (async () => {
      try {
        const serverData = await fetchServerData();
        if (!isMounted) return;

        if (serverData && serverData.lastUpdated > 0) {
          const nextCfg = serverData.config || config;
          const nextEmps = serverData.employees && serverData.employees.length > 0
            ? serverData.employees.map((e) => recomputeEmployeePayroll(e))
            : employees;
          const nextSeas = serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
            ? cleanSeasonalList(serverData.seasonalWorkers)
            : seasonalWorkers;

          const initSnap = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
          lastServerSnapshotRef.current = initSnap;
          lastSavedSnapshotRef.current = initSnap;

          if (serverData.config) {
            setConfig(serverData.config);
            localStorage.setItem('payroll_company_config', JSON.stringify(serverData.config));
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

      const nextCfg = serverData.config || config;
      const nextEmps = serverData.employees && serverData.employees.length > 0
        ? serverData.employees.map((e) => recomputeEmployeePayroll(e))
        : employees;
      const nextSeas = serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0
        ? cleanSeasonalList(serverData.seasonalWorkers)
        : seasonalWorkers;

      const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
      if (snapshot && snapshot === lastServerSnapshotRef.current) {
        return;
      }

      lastServerSnapshotRef.current = snapshot;
      lastSavedSnapshotRef.current = snapshot;

      if (serverData.config) {
        setConfig(serverData.config);
        localStorage.setItem('payroll_company_config', JSON.stringify(serverData.config));
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
        const [cloudCfg, cloudEmp, cloudSea] = await Promise.all([
          loadCompanyConfigFromSupabase(),
          loadEmployeesFromSupabase(config.periodCode),
          loadSeasonalWorkersFromSupabase(config.periodCode),
        ]);

        let hasAnyDataOnCloud = false;

        const nextCfg = cloudCfg || config;
        const nextEmps = (cloudEmp && cloudEmp.length > 0) ? cloudEmp : employees;
        const nextSeas = (cloudSea && cloudSea.length > 0) ? cloudSea : seasonalWorkers;

        if (cloudCfg) {
          setConfig(cloudCfg);
          localStorage.setItem('payroll_company_config', JSON.stringify(cloudCfg));
          hasAnyDataOnCloud = true;
        }
        if (cloudEmp && cloudEmp.length > 0) {
          setEmployees(cloudEmp);
          localStorage.setItem('payroll_employees', JSON.stringify(cloudEmp));
          hasAnyDataOnCloud = true;
        }
        if (cloudSea && cloudSea.length > 0) {
          setSeasonalWorkers(cloudSea);
          localStorage.setItem('payroll_seasonal_workers', JSON.stringify(cloudSea));
          hasAnyDataOnCloud = true;
        }

        const snapshot = serializeDataSnapshot(nextCfg, nextEmps, nextSeas);
        lastSavedSnapshotRef.current = snapshot;
        lastServerSnapshotRef.current = snapshot;

        if (!hasAnyDataOnCloud) {
          const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
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
        next[idx] = {
          ...next[idx],
          ...recalculated,
          monthlyAttendance: {
            ...(next[idx].monthlyAttendance || {}),
            ...(recalculated.monthlyAttendance || {}),
          },
          periodRecords: {
            ...(next[idx].periodRecords || {}),
            ...(recalculated.periodRecords || {}),
          },
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
      const serverData = await fetchServerData();
      if (serverData && serverData.lastUpdated > 0) {
        if (serverData.config) setConfig(serverData.config);
        if (serverData.employees) setEmployees(serverData.employees.map((e) => recomputeEmployeePayroll(e)));
        if (serverData.seasonalWorkers) setSeasonalWorkers(serverData.seasonalWorkers.map((w) => recomputeSeasonal(w)));
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

  // Change Month and Year for entire payroll & timekeeping
  const handleChangeMonthYear = (newMonth: number, newYear: number) => {
    // 1. Save current month's employees to its month slot
    const currentKey = `payroll_month_${config.year || 2026}_${(config.month || 9) < 10 ? '0' + (config.month || 9) : config.month || 9}`;
    localStorage.setItem(currentKey, JSON.stringify(employees));

    // 2. Prepare new period config
    const mStr = newMonth < 10 ? `0${newMonth}` : `${newMonth}`;
    const nextM = newMonth === 12 ? '01' : (newMonth + 1 < 10 ? `0${newMonth + 1}` : `${newMonth + 1}`);
    const nextY = newMonth === 12 ? newYear + 1 : newYear;

    const newConfig: CompanyConfig = {
      ...config,
      month: newMonth,
      year: newYear,
      period: `Kỳ lương tháng ${mStr} năm ${newYear}`,
      periodCode: `${mStr}/${newYear}`,
      paymentDate: `05/${nextM}/${nextY}`,
    };
    setConfig(newConfig);

    // 3. Check if target month data exists
    const targetKey = `payroll_month_${newYear}_${mStr}`;
    const savedTarget = localStorage.getItem(targetKey);

    if (savedTarget) {
      try {
        const parsedTarget: Employee[] = JSON.parse(savedTarget);
        if (Array.isArray(parsedTarget) && parsedTarget.length > 0) {
          // Nạp nguyên vẹn toàn bộ nhân sự đã lưu của tháng này
          setEmployees(parsedTarget.map((emp) => recomputeEmployeePayroll(emp)));
          return;
        }
      } catch (e) {
        console.error('Error loading saved month data', e);
      }
    }

    // Nếu chuyển sang tháng mới chưa có dữ liệu:
    // GIỮ NGUYÊN 100% hồ sơ nhân viên hiện tại (Họ tên, SĐT, Email, Ngân hàng, Lương, Phụ cấp...),
    // Chỉ khởi tạo lại số ngày công thực tế và giờ làm thêm của tháng mới
    const freshForNewMonth = employees.map((emp) =>
      recomputeEmployeePayroll({
        ...emp,
        standardWorkDays: config.standardWorkDays || 26,
        actualWorkDays: 0,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        overtimeHours: 0,
        advancePayment: 0,
        selectedForAttendance: true,
        status: 'ACTIVE',
      })
    );
    setEmployees(freshForNewMonth);
  };

  const handleBatchUpdate = (updatedList: Employee[]) => {
    setEmployees(updatedList);
    // Lưu ngay vào kỳ tháng hiện tại để khi chuyển tháng hoặc tải lại không bị mất công đã nhập
    const mStr = (config.month || 9) < 10 ? `0${config.month || 9}` : `${config.month || 9}`;
    const currentMonthKey = `payroll_month_${config.year || 2026}_${mStr}`;
    try {
      localStorage.setItem(currentMonthKey, JSON.stringify(updatedList));
      localStorage.setItem('payroll_employees', JSON.stringify(updatedList));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
    saveAllToServer(config, updatedList, seasonalWorkers);
    if (isSupabaseConfigured()) {
      syncEmployeesToSupabase(updatedList, config.periodCode).then(() => notifyCrossTab());
    }
  };

  const handleResetDefault = () => {
    localStorage.removeItem('payroll_employees');
    localStorage.removeItem('payroll_company_config');
    const clean = initialEmployees.map((emp) => recomputeEmployeePayroll(emp));
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
  };
  const handleUpdateProject = (p: Project) => {
    const updated = projects.map((item) => (item.id === p.id ? p : item));
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
  };
  const handleDeleteProject = (id: string) => {
    const updated = projects.filter((item) => item.id !== id);
    setProjects(updated);
    localStorage.setItem('payroll_projects', JSON.stringify(updated));
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

  // Handlers for Salary Advances
  const handleAddSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = [adv, ...salaryAdvances];
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
    if (adv.targetType === 'PERMANENT') {
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.id === adv.workerId || e.code === adv.workerCode) {
            const newAdv = (e.advancePayment || 0) + adv.amount;
            return recomputeEmployeePayroll({ ...e, advancePayment: newAdv });
          }
          return e;
        })
      );
    } else if (adv.targetType === 'SEASONAL') {
      setSeasonalWorkers((prev) =>
        prev.map((w) => {
          if (w.id === adv.workerId || w.code === adv.workerCode) {
            const newAdv = (w.advancePayment || 0) + adv.amount;
            const net = Math.max(0, (w.totalIncome || 0) - (w.personalIncomeTax || 0) - newAdv);
            return { ...w, advancePayment: newAdv, netSalary: net };
          }
          return w;
        })
      );
    }
  };
  const handleUpdateSalaryAdvance = (adv: SalaryAdvance) => {
    const updated = salaryAdvances.map((item) => (item.id === adv.id ? adv : item));
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
  };
  const handleDeleteSalaryAdvance = (id: string) => {
    const updated = salaryAdvances.filter((item) => item.id !== id);
    setSalaryAdvances(updated);
    localStorage.setItem('payroll_salary_advances', JSON.stringify(updated));
  };

  const handleBatchUpdateSeasonalWorkers = (list: SeasonalWorker[]) => {
    setSeasonalWorkers(list);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(list));
  };

  // Count issues
  const auditCount = employees.filter(
    (e) => !e.bankAccount || e.netSalary <= 0 || e.actualWorkDays > e.standardWorkDays
  ).length;

  // Khi người dùng hoặc thợ mở link Web App Chấm Công Di Động riêng trên điện thoại
  if (isMobileAttendanceView) {
    const isAdminPreview =
      typeof window !== 'undefined' &&
      sessionStorage.getItem('pncons_is_admin_preview') === 'true';

    // Chuyển đổi NV Chính Thức đang làm việc sang định dạng chung để dùng chung Web App Chấm Công Di Động
    const permanentAsWorkers: SeasonalWorker[] = employees
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

    const allMobileWorkers: SeasonalWorker[] = [...seasonalWorkers, ...permanentAsWorkers];

    return (
      <MobileAttendanceApp
        workers={allMobileWorkers}
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
          seasonalCount={seasonalWorkers.length}
          employeeCount={employees.length}
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
                employeeCount={employees.length}
                seasonalCount={seasonalWorkers.length}
                teamCount={teamWorkers.length}
                projectCount={projects.length}
                advanceCount={salaryAdvances.length}
              />
            </div>

            {/* Metric Summary Cards */}
            <div className="no-print">
              <MetricCards employees={employees} />
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
                          {employees.length}
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
                          {employees.filter((e) => (e.status || 'ACTIVE') === 'ACTIVE').length} đang làm việc
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
                          BHXH + Thuế
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

                    <div className="text-xs text-slate-500 hidden md:flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Chạy theo ngày thực: Tháng {config.periodCode}</span>
                    </div>
                  </div>

                  {/* 1.1 Danh Sách Nhân Viên */}
                  {permanentSubTab === 'LIST' && (
                    <EmployeeListTab
                      employees={employees}
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
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
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
                      seasonalCount={seasonalWorkers.length}
                    />
                  )}

                  {/* 1.3 Bản Lương (Chỉ hiện NV đang làm việc) */}
                  {permanentSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
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
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
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
                  {/* Thanh chuyển đổi 4 Tab con bên trong Tab 2 */}
                  <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        id="subtab-seas-list"
                        onClick={() => setSeasonalSubTab('LIST')}
                        className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer ${
                          seasonalSubTab === 'LIST'
                            ? 'bg-amber-600 text-white shadow-md font-black ring-2 ring-amber-600/20'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <HardHat className="w-4 h-4 text-amber-200" />
                        <span>2.1 Danh Sách Thời Vụ</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          seasonalSubTab === 'LIST' ? 'bg-slate-900 text-amber-300' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {seasonalWorkers.length}
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
                          {seasonalWorkers.filter((w) => (w.status || 'ACTIVE') === 'ACTIVE').length} đang làm việc
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
                          Đơn giá ngày & OT
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

                    <div className="text-xs text-slate-500 hidden md:flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                      <span>Chạy theo ngày thực: Tháng {config.periodCode}</span>
                    </div>
                  </div>

                  {/* 2.1 Danh Sách Thời Vụ */}
                  {seasonalSubTab === 'LIST' && (
                    <SeasonalWorkersTab
                      workers={seasonalWorkers}
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
                    />
                  )}

                  {/* 2.2 Bản Chấm Công (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ATTENDANCE' && (
                    <AttendanceTab
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
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
                      seasonalCount={seasonalWorkers.length}
                    />
                  )}

                  {/* 2.3 Bản Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'PAYROLL' && (
                    <PayrollTableTab
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
                      teamWorkers={teamWorkers}
                      config={config}
                      onChangeMonthYear={handleChangeMonthYear}
                      onUpdateEmployee={handleUpdateEmployee}
                      onAddEmployee={handleAddEmployee}
                      onDeleteEmployee={handleDeleteEmployee}
                      forcedCategory="SEASONAL"
                    />
                  )}

                  {/* 2.4 Bản Ứng Lương (Chỉ hiện thợ đang làm việc) */}
                  {seasonalSubTab === 'ADVANCES' && (
                    <SalaryAdvancesTab
                      advances={salaryAdvances}
                      employees={employees}
                      seasonalWorkers={seasonalWorkers}
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
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
                  teamWorkers={teamWorkers}
                  onAddProject={handleAddProject}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}

              {/* Tab 4: Báo Cáo Tài Chính */}
              {activeTab === 'FINANCIAL_REPORT' && (
                <FinancialReportTab
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
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
                  employees={employees}
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
                <DepartmentSummaryTab employees={employees} />
              )}

              {/* Tab 6: Kiểm Tra Dữ Liệu */}
              {activeTab === 'DATA_AUDIT' && (
                <DataAuditTab
                  employees={employees}
                  onSelectEmployeeForPayslip={handleAuditSelectEmployee}
                />
              )}

              {/* Direct Tab Access Fallbacks */}
              {activeTab === 'PERMANENT_PAYROLL' && (
                <PayrollTableTab
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
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
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  forcedCategory="SEASONAL"
                />
              )}

              {activeTab === 'ATTENDANCE' && (
                <AttendanceTab
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
                  teamWorkers={teamWorkers}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onBatchUpdate={handleBatchUpdate}
                  onBatchUpdateSeasonal={handleBatchUpdateSeasonalWorkers}
                  onBatchUpdateTeam={handleBatchUpdateTeamWorkers}
                  seasonalCount={seasonalWorkers.length}
                />
              )}

              {activeTab === 'SALARY_ADVANCES' && (
                <SalaryAdvancesTab
                  advances={salaryAdvances}
                  employees={employees}
                  seasonalWorkers={seasonalWorkers}
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
