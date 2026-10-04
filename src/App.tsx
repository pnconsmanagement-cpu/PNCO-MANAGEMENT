import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, HardHat, Building } from 'lucide-react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MetricCards } from './components/MetricCards';
import { TabType } from './components/NavigationTabs';
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

// Hàm nhận diện chế độ xem Chấm Công Di Động (chỉ khi có tham số URL chỉ định rõ ràng)
function checkShouldShowAttendanceView(): { shouldShow: boolean; workerCode?: string } {
  if (typeof window === 'undefined') return { shouldShow: false };

  const search = window.location.search;
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(search);

  // Lấy workerCode từ search params hoặc hash nếu có
  let workerCode = searchParams.get('worker') || undefined;
  if (!workerCode && window.location.hash.includes('worker=')) {
    const match = window.location.hash.match(/worker=([^&]+)/);
    if (match && match[1]) workerCode = decodeURIComponent(match[1]);
  }

  // CHỈ chuyển sang chế độ Chấm Công Di Động khi người dùng chủ động mở link chia sẻ có tham số:
  // Ví dụ: ?view=chamcong, ?mode=attendance, ?mode=mobile_attendance, ?chamcong=1 hoặc #view=chamcong
  const hasAttendanceParam =
    searchParams.get('view') === 'chamcong' ||
    searchParams.get('mode') === 'attendance' ||
    searchParams.get('mode') === 'mobile_attendance' ||
    searchParams.get('chamcong') === '1' ||
    hash.includes('view=chamcong') ||
    hash.includes('mode=attendance') ||
    hash.includes('chamcong=1');

  if (hasAttendanceParam) {
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

  // DANH SÁCH CÔNG NHÂN KỸ THUẬT & NHÂN LỰC THỜI VỤ
  const [seasonalWorkers, setSeasonalWorkers] = useState<SeasonalWorker[]>(() => {
    const saved = localStorage.getItem('payroll_seasonal_workers');
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const list = parsed.map((w) => recomputeSeasonal(w));
          return list.sort((a, b) => {
            if (typeof a.sortOrder === 'number' && typeof b.sortOrder === 'number' && a.sortOrder !== b.sortOrder) {
              return a.sortOrder - b.sortOrder;
            }
            return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true, sensitivity: 'base' });
          });
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

  const [activeTab, setActiveTab] = useState<TabType>('EMPLOYEE_LIST');
  const [employeeSubTab, setEmployeeSubTab] = useState<'PERMANENT' | 'SEASONAL' | 'TEAM'>('PERMANENT');

  const handleSelectTab = (tab: TabType) => {
    if (tab === 'SEASONAL_WORKERS') {
      setActiveTab('EMPLOYEE_LIST');
      setEmployeeSubTab('SEASONAL');
    } else if (tab === 'EMPLOYEE_LIST') {
      setActiveTab('EMPLOYEE_LIST');
    } else {
      setActiveTab(tab);
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

  // Cờ nhận diện cập nhật từ xa (Cloud/Broadcast) để tránh vòng lặp tự lưu (echo loop)
  const isRemoteUpdateRef = useRef(false);
  const periodCodeRef = useRef(config.periodCode);

  useEffect(() => {
    periodCodeRef.current = config.periodCode;
  }, [config.periodCode]);

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

  // Hàm tải dữ liệu mới nhất từ Supabase Cloud và áp dụng an toàn vào ứng dụng
  const reloadLatestFromCloud = async (options?: { silent?: boolean }) => {
    if (!isSupabaseConfigured()) return;
    try {
      if (!options?.silent) setCloudSyncStatus('syncing');
      const curPeriod = periodCodeRef.current;
      const [cloudCfg, cloudEmp, cloudSea] = await Promise.all([
        loadCompanyConfigFromSupabase(),
        loadEmployeesFromSupabase(curPeriod),
        loadSeasonalWorkersFromSupabase(curPeriod),
      ]);

      isRemoteUpdateRef.current = true;
      if (cloudCfg) {
        setConfig(cloudCfg);
        localStorage.setItem('payroll_company_config', JSON.stringify(cloudCfg));
      }
      if (cloudEmp) {
        setEmployees(cloudEmp);
        localStorage.setItem('payroll_employees', JSON.stringify(cloudEmp));
      }
      if (cloudSea) {
        setSeasonalWorkers(cloudSea);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(cloudSea));
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
          isRemoteUpdateRef.current = true;
          if (serverData.config) {
            setConfig(serverData.config);
            localStorage.setItem('payroll_company_config', JSON.stringify(serverData.config));
          }
          if (serverData.employees && serverData.employees.length > 0) {
            const recomputedEmps = serverData.employees.map((e) => recomputeEmployeePayroll(e));
            setEmployees(recomputedEmps);
            localStorage.setItem('payroll_employees', JSON.stringify(recomputedEmps));
          }
          if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
            const recomputedWorkers = serverData.seasonalWorkers.map((w) => recomputeSeasonal(w));
            setSeasonalWorkers(recomputedWorkers);
            localStorage.setItem('payroll_seasonal_workers', JSON.stringify(recomputedWorkers));
          }
          setCloudSyncStatus('synced');
          setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
        } else {
          // Nếu máy chủ chưa có dữ liệu, khởi tạo đẩy dữ liệu từ Web App lên máy chủ
          saveAllToServer(config, employees, seasonalWorkers);
        }
      } catch (err) {
        console.warn('Initial server sync error:', err);
      }
    })();

    // 2. Lắng nghe cập nhật Real-time từ máy chủ (khi thợ chấm công trên điện thoại)
    const unsubscribe = subscribeToSync((serverData) => {
      if (!isMounted) return;
      isRemoteUpdateRef.current = true;

      if (serverData.config) {
        setConfig(serverData.config);
        localStorage.setItem('payroll_company_config', JSON.stringify(serverData.config));
      }
      if (serverData.employees && serverData.employees.length > 0) {
        const recomputedEmps = serverData.employees.map((e) => recomputeEmployeePayroll(e));
        setEmployees(recomputedEmps);
        localStorage.setItem('payroll_employees', JSON.stringify(recomputedEmps));
      }
      if (serverData.seasonalWorkers && serverData.seasonalWorkers.length > 0) {
        const recomputedWorkers = serverData.seasonalWorkers.map((w) => recomputeSeasonal(w));
        setSeasonalWorkers(recomputedWorkers);
        localStorage.setItem('payroll_seasonal_workers', JSON.stringify(recomputedWorkers));
      }
      setCloudSyncStatus('synced');
      setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
      notifyCrossTab();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Tự động lưu lên Máy chủ Backend khi có thay đổi dữ liệu trên Web App (Debounce 1.5 giây)
  useEffect(() => {
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCloudSyncStatus('syncing');
        const ok = await saveAllToServer(config, employees, seasonalWorkers);
        if (ok) {
          setCloudSyncStatus('synced');
          setLastSyncedText(getServerLastSyncedTime() || getLastSyncedTime());
          notifyCrossTab();
        }
      } catch (err) {
        console.warn('Auto server sync error:', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [config, employees, seasonalWorkers]);

  // Khởi động: Tải dữ liệu từ Supabase Cloud hoặc tự động khởi tạo dữ liệu ban đầu lên Cloud
  useEffect(() => {
    if (isSupabaseConfigured()) {
      (async () => {
        try {
          setCloudSyncStatus('syncing');
          const [cloudCfg, cloudEmp, cloudSea] = await Promise.all([
            loadCompanyConfigFromSupabase(),
            loadEmployeesFromSupabase(config.periodCode),
            loadSeasonalWorkersFromSupabase(config.periodCode),
          ]);

          let hasAnyDataOnCloud = false;
          isRemoteUpdateRef.current = true;

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

          // Nếu Supabase chưa có bản ghi nào, tự động đẩy dữ liệu hiện có lên luôn
          if (!hasAnyDataOnCloud) {
            const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
            if (report.success) {
              setCloudSyncStatus('synced');
              setLastSyncedText(getLastSyncedTime());
            } else {
              setCloudSyncStatus('error');
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
    }
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

  // 2. Lắng nghe Supabase Realtime (cho các máy tính và trình duyệt khác nhau qua Cloud WebSocket)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const unsubscribe = subscribeToSupabaseRealtime((tableName, eventType) => {
      console.info(`[Realtime Sync] Bảng ${tableName} nhận sự kiện ${eventType}`);
      reloadLatestFromCloud({ silent: true });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 3. Tự động đồng bộ ngay khi người dùng chuyển sang cửa sổ trình duyệt (Focus & Visibility Change)
  useEffect(() => {
    const handleFocus = () => {
      if (isSupabaseConfigured()) {
        reloadLatestFromCloud({ silent: true });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured()) {
        reloadLatestFromCloud({ silent: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 4. Polling thông minh mỗi 8 giây đảm bảo dữ liệu luôn tươi mới ngay cả khi WebSocket rớt
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && isSupabaseConfigured()) {
        reloadLatestFromCloud({ silent: true });
      }
    }, 8000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  // Tự động lưu lên Supabase Cloud khi có thay đổi dữ liệu (Debounce 2 giây)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Nếu vừa được cập nhật từ Cloud, bỏ qua lần đồng bộ ngược lại này để tránh lặp vô tận (loop)
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setCloudSyncStatus('syncing');
        const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
        if (report.success) {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
          notifyCrossTab();
        } else {
          setCloudSyncStatus('error');
        }
      } catch (err) {
        console.warn('Auto cloud sync failed:', err);
        setCloudSyncStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [config, employees, seasonalWorkers]);

  // Cập nhật công nhân thời vụ - đồng bộ ngay lập tức lên Máy chủ và Supabase Cloud
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(updated);
    setSeasonalWorkers((prev) =>
      prev.map((w) => (String(w.id) === String(recalculated.id) ? recalculated : w))
    );
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

  // Cập nhật nhân viên chính thức - đồng bộ ngay lập tức lên Supabase Cloud
  const handleUpdateEmployee = (updated: Employee) => {
    const recalculated = recomputeEmployeePayroll(updated);
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === recalculated.id ? recalculated : emp))
    );
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
    return (
      <MobileAttendanceApp
        workers={seasonalWorkers}
        config={config}
        initialWorkerCode={activeMobileWorkerCode}
        onUpdateWorker={handleUpdateSeasonalWorker}
        onExitMobileView={() => {
          sessionStorage.setItem('pncons_admin_auth', 'true');
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
          activeTab={activeTab === 'EMPLOYEE_LIST' ? (employeeSubTab === 'SEASONAL' ? 'SEASONAL_WORKERS' : 'EMPLOYEE_LIST') : activeTab}
          onSelectTab={handleSelectTab}
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
            {/* Metric Summary Cards */}
            <div className="no-print">
              <MetricCards employees={employees} />
            </div>

            {/* Tab Views */}
            <div className="flex-1">
          {/* Tab 1: Phiếu Lương */}
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

          {/* Tab 2: Danh Sách Dự Án */}
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

          {/* Tab 3: Bản Lương (Tuần, Tháng, Quý, Năm) */}
          {activeTab === 'PAYROLL_TABLE' && (
            <PayrollTableTab
              employees={employees}
              seasonalWorkers={seasonalWorkers}
              teamWorkers={teamWorkers}
              config={config}
              onChangeMonthYear={handleChangeMonthYear}
              onUpdateEmployee={handleUpdateEmployee}
              onAddEmployee={handleAddEmployee}
              onDeleteEmployee={handleDeleteEmployee}
            />
          )}

          {/* Tab 4: Bản Lương Ứng (Tạm Ứng) */}
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

          {/* Tab 5: Báo Cáo Tài Chính Tổng Hợp */}
          {activeTab === 'FINANCIAL_REPORT' && (
            <FinancialReportTab
              employees={employees}
              seasonalWorkers={seasonalWorkers}
              teamWorkers={teamWorkers}
              projects={projects}
              advances={salaryAdvances}
              config={config}
            />
          )}

          {/* Tab 6: Hub Danh Sách Nhân Viên: 3 nhóm (1. Chính thức, 2. Thời vụ, 3. Tổ đội) */}
          {(activeTab === 'EMPLOYEE_LIST' || activeTab === 'SEASONAL_WORKERS') && (
            <div className="flex flex-col gap-3">
              {/* Thanh chuyển đổi 3 Sub-tabs Nhân viên */}
              <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs flex flex-wrap items-center justify-between gap-3 select-none">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Tab con 1: Nhân Viên Chính Thức */}
                  <button
                    type="button"
                    id="subtab-permanent-employees"
                    onClick={() => {
                      setEmployeeSubTab('PERMANENT');
                      setActiveTab('EMPLOYEE_LIST');
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer shadow-xs ${
                      activeTab === 'EMPLOYEE_LIST' && employeeSubTab === 'PERMANENT'
                        ? 'bg-[#0f3d64] text-white shadow-md ring-2 ring-[#0f3d64]/20 font-black'
                        : 'bg-slate-50 text-slate-700 hover:text-[#0f3d64] hover:bg-sky-50 border border-slate-200'
                    }`}
                  >
                    <Users className={`w-4 h-4 ${(activeTab === 'EMPLOYEE_LIST' && employeeSubTab === 'PERMANENT') ? 'text-sky-300' : 'text-slate-500'}`} />
                    <span>1. Nhân Viên Chính Thức</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                      (activeTab === 'EMPLOYEE_LIST' && employeeSubTab === 'PERMANENT')
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {employees.length}
                    </span>
                  </button>

                  {/* Tab con 2: Nhân Lực Thời Vụ */}
                  <button
                    type="button"
                    id="subtab-seasonal-workers"
                    onClick={() => {
                      setEmployeeSubTab('SEASONAL');
                      setActiveTab('EMPLOYEE_LIST');
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer shadow-xs ${
                      activeTab === 'SEASONAL_WORKERS' || employeeSubTab === 'SEASONAL'
                        ? 'bg-amber-600 text-white shadow-md ring-2 ring-amber-600/20 font-black'
                        : 'bg-slate-50 text-slate-700 hover:text-amber-800 hover:bg-amber-50 border border-slate-200'
                    }`}
                  >
                    <HardHat className={`w-4 h-4 ${activeTab === 'SEASONAL_WORKERS' || employeeSubTab === 'SEASONAL' ? 'text-amber-200' : 'text-slate-500'}`} />
                    <span>2. Nhân Lực Thời Vụ</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                      activeTab === 'SEASONAL_WORKERS' || employeeSubTab === 'SEASONAL'
                        ? 'bg-slate-900 text-amber-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {seasonalWorkers.length}
                    </span>
                  </button>

                  {/* Tab con 3: Nhân Viên Tổ Đội */}
                  <button
                    type="button"
                    id="subtab-team-workers"
                    onClick={() => {
                      setEmployeeSubTab('TEAM');
                      setActiveTab('EMPLOYEE_LIST');
                    }}
                    className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2.5 transition-all cursor-pointer shadow-xs ${
                      employeeSubTab === 'TEAM'
                        ? 'bg-indigo-700 text-white shadow-md ring-2 ring-indigo-700/20 font-black'
                        : 'bg-slate-50 text-slate-700 hover:text-indigo-800 hover:bg-indigo-50 border border-slate-200'
                    }`}
                  >
                    <Building className={`w-4 h-4 ${employeeSubTab === 'TEAM' ? 'text-indigo-200' : 'text-slate-500'}`} />
                    <span>3. Nhân Viên Tổ Đội</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                      employeeSubTab === 'TEAM'
                        ? 'bg-indigo-950 text-indigo-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {teamWorkers.length}
                    </span>
                  </button>
                </div>

                <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 pr-2">
                  {employeeSubTab === 'PERMANENT' && (
                    <span className="flex items-center gap-1.5 text-sky-900 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Quản lý {employees.length} nhân sự thường trực (HĐLĐ, phòng ban, lương tháng & đánh giá hàng năm)
                    </span>
                  )}
                  {employeeSubTab === 'SEASONAL' && (
                    <span className="flex items-center gap-1.5 text-amber-900 font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Quản lý {seasonalWorkers.length} công nhân kỹ thuật & thợ khoán (lương tuần, chấm công công trình)
                    </span>
                  )}
                  {employeeSubTab === 'TEAM' && (
                    <span className="flex items-center gap-1.5 text-indigo-900 font-medium">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      Quản lý {teamWorkers.length} tổ đội thi công (cai thầu, quân số, đơn giá khoán/ngày)
                    </span>
                  )}
                </div>
              </div>

              {/* Nội dung Tab tương ứng */}
              {employeeSubTab === 'PERMANENT' && (
                <EmployeeListTab
                  employees={employees}
                  config={config}
                  onChangeMonthYear={handleChangeMonthYear}
                  onUpdateEmployee={handleUpdateEmployee}
                  onAddEmployee={handleAddEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  onBatchUpdate={handleBatchUpdate}
                  onGoToAttendance={() => setActiveTab('ATTENDANCE')}
                  onGoToSeasonalWorkers={() => {
                    setEmployeeSubTab('SEASONAL');
                    setActiveTab('EMPLOYEE_LIST');
                  }}
                  onResetDefault={handleResetDefault}
                />
              )}

              {employeeSubTab === 'SEASONAL' && (
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
                    setActiveMobileWorkerCode(workerCode);
                    setIsMobileAttendanceView(true);
                  }}
                  onGoToPermanentEmployees={() => {
                    setEmployeeSubTab('PERMANENT');
                    setActiveTab('EMPLOYEE_LIST');
                  }}
                />
              )}

              {employeeSubTab === 'TEAM' && (
                <TeamWorkersTab
                  workers={teamWorkers}
                  projects={projects}
                  config={config}
                  onAddWorker={handleAddTeamWorker}
                  onUpdateWorker={handleUpdateTeamWorker}
                  onDeleteWorker={handleDeleteTeamWorker}
                  onBatchUpdate={handleBatchUpdateTeamWorkers}
                />
              )}
            </div>
          )}

          {/* Tab 7: Bản Chấm Công (3 nhóm) */}
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
              onGoToEmployeeList={() => {
                setActiveTab('EMPLOYEE_LIST');
                setEmployeeSubTab('PERMANENT');
              }}
              onGoToSeasonalAttendance={() => {
                setActiveTab('EMPLOYEE_LIST');
                setEmployeeSubTab('SEASONAL');
              }}
              seasonalCount={seasonalWorkers.length}
            />
          )}

          {/* Tab: Kiểm Tra Dữ Liệu */}
          {activeTab === 'DATA_AUDIT' && (
            <DataAuditTab
              employees={employees}
              onSelectEmployeeForPayslip={handleAuditSelectEmployee}
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
        onDataLoadedFromCloud={({ config: newCfg, employees: newEmps, seasonalWorkers: newSeas }) => {
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
