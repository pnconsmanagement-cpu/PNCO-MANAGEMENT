import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { BankExportModal } from './components/BankExportModal';
import { ImportModal } from './components/ImportModal';
import { CompanyModal } from './components/CompanyModal';
import { ZaloOASettingsModal } from './components/ZaloOASettingsModal';
import { BatchSendZaloModal } from './components/BatchSendZaloModal';
import { SupabaseSyncModal } from './components/SupabaseSyncModal';
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
  deleteEmployeeFromSupabase,
  subscribeToSupabaseRealtime,
  autoApplyUrlConfig,
  getLastSyncedTime,
} from './services/supabaseService';
import { initialCompanyConfig, initialEmployees } from './data/mockPayrollData';
import { initialSeasonalWorkers, recomputeSeasonalWorkerPayroll as recomputeSeasonal } from './data/mockSeasonalWorkers';
import { CompanyConfig, Employee, SeasonalWorker } from './types';
import { recomputeEmployeePayroll } from './utils/payrollCalculator';
import { ensureEmployeeContract } from './utils/contractHelper';

// Tự động kiểm tra URL chia sẻ cấu hình nếu có
autoApplyUrlConfig();

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

  const [activeTab, setActiveTab] = useState<TabType>('PAYSLIP');
  const [isSidebarMobileOpen, setIsSidebarMobileOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBankExportOpen, setIsBankExportOpen] = useState(false);
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [isZaloSettingsOpen, setIsZaloSettingsOpen] = useState(false);
  const [isBatchZaloOpen, setIsBatchZaloOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('idle');
  const [lastSyncedText, setLastSyncedText] = useState<string | null>(getLastSyncedTime());

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

  // Cập nhật công nhân thời vụ - đồng bộ ngay lập tức lên Supabase Cloud
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(updated);
    setSeasonalWorkers((prev) =>
      prev.map((w) => (String(w.id) === String(recalculated.id) ? recalculated : w))
    );
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
      if (isSupabaseConfigured()) {
        syncSingleSeasonalWorkerToSupabase(workerWithOrder, config.periodCode).then(() => notifyCrossTab());
      }
      return [...prev, workerWithOrder];
    });
  };

  const handleReorderSeasonalWorkers = (reordered: SeasonalWorker[]) => {
    setSeasonalWorkers(reordered);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(reordered));
    if (isSupabaseConfigured()) {
      syncSeasonalWorkersToSupabase(reordered, config.periodCode).then(() => notifyCrossTab());
    }
  };

  // Xóa triệt để công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteSeasonalWorker = (id: string) => {
    setSeasonalWorkers((prev) => prev.filter((w) => String(w.id) !== String(id)));
    if (isSupabaseConfigured()) {
      deleteSeasonalWorkerFromSupabase(id).then(() => notifyCrossTab());
    }
  };

  // Xóa hàng loạt công nhân thời vụ - xóa ngay trên Supabase Cloud
  const handleDeleteBatchSeasonalWorkers = (ids: string[]) => {
    const idSet = new Set(ids.map((item) => String(item)));
    setSeasonalWorkers((prev) => prev.filter((w) => !idSet.has(String(w.id))));
    if (isSupabaseConfigured()) {
      deleteBatchSeasonalWorkersFromSupabase(ids).then(() => notifyCrossTab());
    }
  };

  // Xóa toàn bộ công nhân thời vụ trên Supabase Cloud
  const handleClearAllSeasonalWorkers = () => {
    setSeasonalWorkers([]);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify([]));
    if (isSupabaseConfigured()) {
      clearAllSeasonalWorkersFromSupabase(config.periodCode).then(() => notifyCrossTab());
    }
  };

  const handleResetSeasonalWorkers = () => {
    setSeasonalWorkers(initialSeasonalWorkers);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(initialSeasonalWorkers));
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
    if (!isSupabaseConfigured()) {
      setIsSupabaseOpen(true);
      return;
    }
    await reloadLatestFromCloud();
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

  // Count issues
  const auditCount = employees.filter(
    (e) => !e.bankAccount || e.netSalary <= 0 || e.actualWorkDays > e.standardWorkDays
  ).length;

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
          onSelectTab={setActiveTab}
          auditIssuesCount={auditCount}
          seasonalCount={seasonalWorkers.length}
          employeeCount={employees.length}
          config={config}
          isOpenMobile={isSidebarMobileOpen}
          onCloseMobile={() => setIsSidebarMobileOpen(false)}
          onOpenBatchZalo={() => setIsBatchZaloOpen(true)}
          onOpenCompanyModal={() => setIsCompanyOpen(true)}
          onOpenSupabaseModal={() => setIsSupabaseOpen(true)}
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

          {activeTab === 'DEPARTMENT' && (
            <DepartmentSummaryTab employees={employees} />
          )}

          {activeTab === 'PAYROLL_TABLE' && (
            <PayrollTableTab
              employees={employees}
              config={config}
              onChangeMonthYear={handleChangeMonthYear}
              onUpdateEmployee={handleUpdateEmployee}
              onAddEmployee={handleAddEmployee}
              onDeleteEmployee={handleDeleteEmployee}
            />
          )}

          {activeTab === 'EMPLOYEE_LIST' && (
            <EmployeeListTab
              employees={employees}
              config={config}
              onUpdateEmployee={handleUpdateEmployee}
              onAddEmployee={handleAddEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onBatchUpdate={handleBatchUpdate}
              onGoToAttendance={() => setActiveTab('ATTENDANCE')}
              onGoToSeasonalWorkers={() => setActiveTab('SEASONAL_WORKERS')}
              onResetDefault={handleResetDefault}
            />
          )}

          {activeTab === 'ATTENDANCE' && (
            <AttendanceTab
              employees={employees}
              config={config}
              onChangeMonthYear={handleChangeMonthYear}
              onBatchUpdate={handleBatchUpdate}
              onGoToEmployeeList={() => setActiveTab('EMPLOYEE_LIST')}
            />
          )}

          {activeTab === 'DATA_AUDIT' && (
            <DataAuditTab
              employees={employees}
              onSelectEmployeeForPayslip={handleAuditSelectEmployee}
            />
          )}

          {activeTab === 'SEASONAL_WORKERS' && (
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
