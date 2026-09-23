import React, { useState, useEffect } from 'react';
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
  getLastSyncedTime,
} from './services/supabaseService';
import { initialCompanyConfig, initialEmployees } from './data/mockPayrollData';
import { initialSeasonalWorkers, recomputeSeasonalWorkerPayroll as recomputeSeasonal } from './data/mockSeasonalWorkers';
import { CompanyConfig, Employee, SeasonalWorker } from './types';
import { recomputeEmployeePayroll } from './utils/payrollCalculator';
import { ensureEmployeeContract } from './utils/contractHelper';

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
          return parsed.map((emp) => {
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
          return parsed.map((w) => recomputeSeasonal(w));
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
          if (cloudCfg) {
            setConfig(cloudCfg);
            hasAnyDataOnCloud = true;
          }
          if (cloudEmp && cloudEmp.length > 0) {
            setEmployees(cloudEmp);
            hasAnyDataOnCloud = true;
          }
          if (cloudSea && cloudSea.length > 0) {
            setSeasonalWorkers(cloudSea);
            hasAnyDataOnCloud = true;
          }

          // Nếu Supabase chưa có bản ghi nào (mới tạo bảng), tự động đẩy dữ liệu hiện có lên luôn
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

  // Tự động lưu lên Supabase Cloud khi có thay đổi dữ liệu (Debounce 2 giây)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const timer = setTimeout(async () => {
      try {
        setCloudSyncStatus('syncing');
        const report = await syncAllDataToSupabase(config, employees, seasonalWorkers);
        if (report.success) {
          setCloudSyncStatus('synced');
          setLastSyncedText(getLastSyncedTime());
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

  // Cập nhật công nhân thời vụ - đảm bảo so khớp ID chính xác
  const handleUpdateSeasonalWorker = (updated: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(updated);
    setSeasonalWorkers((prev) =>
      prev.map((w) => (String(w.id) === String(recalculated.id) ? recalculated : w))
    );
  };

  const handleAddSeasonalWorker = (newWorker: SeasonalWorker) => {
    const recalculated = recomputeSeasonal(newWorker);
    setSeasonalWorkers((prev) => [recalculated, ...prev]);
  };

  const handleDeleteSeasonalWorker = (id: string) => {
    setSeasonalWorkers((prev) => prev.filter((w) => String(w.id) !== String(id)));
  };

  const handleDeleteBatchSeasonalWorkers = (ids: string[]) => {
    const idSet = new Set(ids.map((item) => String(item)));
    setSeasonalWorkers((prev) => prev.filter((w) => !idSet.has(String(w.id))));
  };

  const handleClearAllSeasonalWorkers = () => {
    setSeasonalWorkers([]);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify([]));
  };

  const handleResetSeasonalWorkers = () => {
    setSeasonalWorkers(initialSeasonalWorkers);
    localStorage.setItem('payroll_seasonal_workers', JSON.stringify(initialSeasonalWorkers));
  };

  // Update employee
  const handleUpdateEmployee = (updated: Employee) => {
    const recalculated = recomputeEmployeePayroll(updated);
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === recalculated.id ? recalculated : emp))
    );
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

  const handleAddEmployee = (newEmp: Employee) => {
    const recalculated = recomputeEmployeePayroll(newEmp);
    setEmployees((prev) => [...prev, recalculated]);
  };

  const handleDeleteEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
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
          if (newCfg) setConfig(newCfg);
          if (newEmps && newEmps.length > 0) setEmployees(newEmps);
          if (newSeas && newSeas.length > 0) setSeasonalWorkers(newSeas);
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
