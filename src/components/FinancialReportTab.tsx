import React, { useState, useMemo } from 'react';
import {
  PieChart,
  BarChart3,
  Calendar,
  Building,
  Users,
  HardHat,
  TrendingUp,
  Download,
  Printer,
  DollarSign,
  ShieldCheck,
  CreditCard,
  Layers,
  ArrowUpRight,
  Clock,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Employee, SeasonalWorker, TeamWorker, Project, SalaryAdvance, CompanyConfig } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';

interface FinancialReportTabProps {
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  teamWorkers: TeamWorker[];
  projects: Project[];
  advances: SalaryAdvance[];
  config: CompanyConfig;
}

export const FinancialReportTab: React.FC<FinancialReportTabProps> = ({
  employees,
  seasonalWorkers,
  teamWorkers,
  projects,
  advances,
  config,
}) => {
  // Lựa chọn bộ lọc thời gian: Tháng hiện tại, Quý (Q1, Q2, Q3, Q4) hoặc Cả năm
  const [timeViewMode, setTimeViewMode] = useState<'MONTH' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEAR'>('MONTH');
  // Lựa chọn dự án: Tất cả hoặc từng dự án cụ thể
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('ALL');

  // Tính toán nhân công chính thức
  const permanentStats = useMemo(() => {
    const active = employees.filter((e) => e.status !== 'RESIGNED' && e.selectedForAttendance !== false);
    const count = active.length;
    const baseTotal = active.reduce((s, e) => s + (e.salaryByActualDays || e.baseSalary || 0), 0);
    const otTotal = active.reduce((s, e) => s + (e.overtimePay || 0), 0);
    const allowanceTotal = active.reduce(
      (s, e) =>
        s +
        (e.responsibilityAllowance || 0) +
        (e.projectAllowance || 0) +
        (e.mealAllowance || 0) +
        (e.phoneTravelAllowance || 0) +
        (e.kpiBonus || 0),
      0
    );
    const totalIncome = active.reduce((s, e) => s + (e.totalIncome || 0), 0);
    const employeeInsurance = active.reduce((s, e) => s + (e.totalInsurance || 0), 0);
    // Doanh nghiệp đóng: BHXH 17.5% + BHYT 3% + BHTN 1% = 21.5%
    const companyInsurance = active.reduce((s, e) => s + Math.round((e.insuranceSalary || 0) * 0.215), 0);
    const netTotal = active.reduce((s, e) => s + (e.netSalary || 0), 0);

    return {
      count,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      employeeInsurance,
      companyInsurance,
      netTotal,
    };
  }, [employees]);

  // Tính toán nhân công thời vụ
  const seasonalStats = useMemo(() => {
    const active = seasonalWorkers.filter((w) => w.status !== 'PAUSED');
    const filtered =
      selectedProjectFilter === 'ALL'
        ? active
        : active.filter((w) => w.project && w.project.toLowerCase().includes(selectedProjectFilter.toLowerCase()));

    const count = filtered.length;
    const baseTotal = filtered.reduce((s, w) => s + (w.salaryByDays || 0), 0);
    const otTotal = filtered.reduce((s, w) => s + (w.overtimePay || 0), 0);
    const allowanceTotal = filtered.reduce(
      (s, w) => s + (w.mealAllowance || 0) + (w.travelSafetyAllowance || 0) + (w.otherBonus || 0),
      0
    );
    const totalIncome = filtered.reduce((s, w) => s + (w.totalIncome || 0), 0);
    const taxTotal = filtered.reduce((s, w) => s + (w.personalIncomeTax || 0), 0);
    const netTotal = filtered.reduce((s, w) => s + (w.netSalary || 0), 0);

    return {
      count,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      taxTotal,
      netTotal,
    };
  }, [seasonalWorkers, selectedProjectFilter]);

  // Tính toán nhân công tổ đội
  const teamStats = useMemo(() => {
    const active = teamWorkers.filter((t) => t.status !== 'PAUSED');
    const filtered =
      selectedProjectFilter === 'ALL'
        ? active
        : active.filter((t) => t.project && t.project.toLowerCase().includes(selectedProjectFilter.toLowerCase()));

    const count = filtered.length;
    const totalWorkers = filtered.reduce((s, t) => s + (t.workerCount || 1), 0);
    const baseTotal = filtered.reduce((s, t) => s + (t.salaryByDays || 0), 0);
    const otTotal = filtered.reduce((s, t) => s + (t.overtimePay || 0), 0);
    const allowanceTotal = filtered.reduce((s, t) => s + (t.mealAllowance || 0) + (t.otherBonus || 0), 0);
    const totalIncome = filtered.reduce((s, t) => s + (t.totalIncome || 0), 0);
    const advanceTotal = filtered.reduce((s, t) => s + (t.advancePayment || 0), 0);
    const netTotal = filtered.reduce((s, t) => s + (t.netSalary || 0), 0);

    return {
      count,
      totalWorkers,
      baseTotal,
      otTotal,
      allowanceTotal,
      totalIncome,
      advanceTotal,
      netTotal,
    };
  }, [teamWorkers, selectedProjectFilter]);

  // Hệ số nhân theo chu kỳ thời gian (Tháng: 1x, Quý: 3x, Năm: 12x)
  const multiplier = useMemo(() => {
    if (timeViewMode === 'MONTH') return 1;
    if (timeViewMode === 'YEAR') return 12;
    return 3; // Quý (Q1, Q2, Q3, Q4)
  }, [timeViewMode]);

  // Tổng hợp tài chính toàn công ty
  const grandTotalLaborBudget = useMemo(() => {
    const totalPayroll = (permanentStats.totalIncome + seasonalStats.totalIncome + teamStats.totalIncome) * multiplier;
    const totalCompanyInsurance = permanentStats.companyInsurance * multiplier;
    const totalLaborExpense = totalPayroll + totalCompanyInsurance;
    const totalNetDisbursement = (permanentStats.netTotal + seasonalStats.netTotal + teamStats.netTotal) * multiplier;
    const totalAdvances = advances.reduce((s, a) => s + (a.amount || 0), 0) * (timeViewMode === 'MONTH' ? 1 : multiplier * 0.8);

    return {
      totalPayroll,
      totalCompanyInsurance,
      totalLaborExpense,
      totalNetDisbursement,
      totalAdvances,
    };
  }, [permanentStats, seasonalStats, teamStats, multiplier, advances, timeViewMode]);

  // Phân tích chi phí theo từng dự án
  const projectExpenses = useMemo(() => {
    return projects.map((p) => {
      const pSeasonal = seasonalWorkers.filter(
        (w) => w.project && w.project.toLowerCase().includes(p.name.toLowerCase().substring(0, 15))
      );
      const pTeams = teamWorkers.filter(
        (t) => t.project && t.project.toLowerCase().includes(p.name.toLowerCase().substring(0, 15))
      );

      const seasonalMonthly = pSeasonal.reduce((s, w) => s + (w.totalIncome || 0), 0);
      const teamMonthly = pTeams.reduce((s, t) => s + (t.totalIncome || 0), 0);
      const engineersMonthly = 35000000; // Chi phí kỹ sư giám sát tại dự án ước tính
      const monthlyTotal = seasonalMonthly + teamMonthly + engineersMonthly;
      const actualCost = p.actualLaborCost || monthlyTotal * multiplier;
      const budgetPercent = p.laborBudget > 0 ? Math.min(Math.round((actualCost / p.laborBudget) * 100), 100) : 0;

      return {
        ...p,
        seasonalCost: seasonalMonthly * multiplier,
        teamCost: teamMonthly * multiplier,
        totalLaborCost: actualCost,
        budgetPercent,
        remainingBudget: Math.max(0, p.laborBudget - actualCost),
      };
    });
  }, [projects, seasonalWorkers, teamWorkers, multiplier]);

  // Xuất file Excel Báo Cáo Tài Chính
  const handleExportExcel = () => {
    const timeLabel =
      timeViewMode === 'MONTH'
        ? `Thang_${config.month || 9}_${config.year || 2026}`
        : timeViewMode === 'YEAR'
        ? `Ca_Nam_${config.year || 2026}`
        : `Quy_${timeViewMode}_${config.year || 2026}`;

    // Sheet 1: Tổng hợp chi phí theo nhóm
    const summaryData = [
      {
        'Nhóm Nhân Lực': '1. Nhân viên chính thức (Khối VP & Kỹ sư)',
        'Số Lượng': `${permanentStats.count} người`,
        'Lương Theo Công (VNĐ)': permanentStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': permanentStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': permanentStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': permanentStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': permanentStats.companyInsurance * multiplier,
        'Thực Lĩnh Chi Trả (VNĐ)': permanentStats.netTotal * multiplier,
      },
      {
        'Nhóm Nhân Lực': '2. Công nhân kỹ thuật & Thời vụ',
        'Số Lượng': `${seasonalStats.count} thợ`,
        'Lương Theo Công (VNĐ)': seasonalStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': seasonalStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': seasonalStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': seasonalStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': 0,
        'Thực Lĩnh Chi Trả (VNĐ)': seasonalStats.netTotal * multiplier,
      },
      {
        'Nhóm Nhân Lực': '3. Nhân viên tổ đội thi công (Khoán việc)',
        'Số Lượng': `${teamStats.count} tổ (${teamStats.totalWorkers} thợ)`,
        'Lương Theo Công (VNĐ)': teamStats.baseTotal * multiplier,
        'Tiền Tăng Ca OT (VNĐ)': teamStats.otTotal * multiplier,
        'Phụ Cấp & Thưởng (VNĐ)': teamStats.allowanceTotal * multiplier,
        'Tổng Thu Nhập (VNĐ)': teamStats.totalIncome * multiplier,
        'BHXH Doanh Nghiệp Đóng 21.5% (VNĐ)': 0,
        'Thực Lĩnh Chi Trả (VNĐ)': teamStats.netTotal * multiplier,
      },
    ];

    // Sheet 2: Chi phí theo dự án công trình
    const projectData = projectExpenses.map((p, idx) => ({
      STT: idx + 1,
      'Mã Dự Án': p.code,
      'Tên Công Trình': p.name,
      'Chủ Đầu Tư': p.investor,
      'Dự Toán Nhân Công (VNĐ)': p.laborBudget,
      'Chi Phí Nhân Lực Thực Tế (VNĐ)': p.totalLaborCost,
      'Tỷ Lệ Giải Ngân (%)': `${p.budgetPercent}%`,
      'Ngân Sách Còn Lại (VNĐ)': p.remainingBudget,
      'Trạng Thái': p.status === 'IN_PROGRESS' ? 'Đang thi công' : 'Hoàn thành',
    }));

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsProjects = XLSX.utils.json_to_sheet(projectData);

    XLSX.utils.book_append_sheet(wb, wsSummary, 'TongHopChiPhiNhanSu');
    XLSX.utils.book_append_sheet(wb, wsProjects, 'ChiPhiTheoDuAn');
    XLSX.writeFile(wb, `Bao_Cao_Tai_Chinh_Nhan_Cong_Phuc_Nguyen_${timeLabel}.xlsx`);
  };

  // In báo cáo tài chính
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#09233b] via-[#0f3d64] to-[#1c5b8c] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#13375c] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-300 rounded-lg">
              <BarChart3 className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              Báo Cáo Tài Chính Tổng Hợp Chi Phí Nhân Công & Tiền Lương
            </h2>
          </div>
          <p className="text-xs text-sky-200 mt-1 max-w-2xl">
            Tự động tổng hợp chi phí toàn diện theo thời gian (Tuần, Tháng, Quý, Năm), theo từng dự án công trình và phân tích cơ cấu chi phí nhân lực Phúc Nguyên.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel Báo Cáo</span>
          </button>

          <button
            type="button"
            onClick={handlePrintReport}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Printer className="w-4 h-4 text-sky-300" />
            <span>In Báo Cáo</span>
          </button>
        </div>
      </div>

      {/* Thanh Điều Hướng Chu Kỳ Báo Cáo & Dự Án */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 no-print">
        {/* Chọn chu kỳ thời gian */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Calendar className="w-4 h-4 text-[#0f3d64]" />
            <span>Kỳ báo cáo:</span>
          </span>

          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setTimeViewMode('MONTH')}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'MONTH' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tháng {config.month || 9}/{config.year || 2026}
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q1')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q1' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý I
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q2')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q2' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý II
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q3')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q3' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý III
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('Q4')}
              className={`px-2.5 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'Q4' ? 'bg-[#0f3d64] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Quý IV
            </button>
            <button
              type="button"
              onClick={() => setTimeViewMode('YEAR')}
              className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                timeViewMode === 'YEAR' ? 'bg-amber-600 text-white shadow-xs font-black' : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              Cả Năm {config.year || 2026}
            </button>
          </div>
        </div>

        {/* Lọc theo dự án */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Building className="w-4 h-4 text-sky-700" />
            <span>Công trình:</span>
          </span>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer max-w-xs"
          >
            <option value="ALL">Toàn bộ công trình & văn phòng ({projects.length} dự án)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 Chỉ Số Tài Chính Tổng Hợp Toàn Công Ty */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng chi phí nhân sự toàn bộ</div>
            <div className="text-xl font-black text-[#0f3d64] mt-0.5">
              {formatVND(grandTotalLaborBudget.totalLaborExpense)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Bao gồm quỹ lương + 21.5% BHXH doanh nghiệp
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0f3d64] shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Thực chi thanh toán (Net)</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalNetDisbursement)}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
              Chuyển khoản & chi tiền mặt trực tiếp
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Bảo hiểm công ty đóng (21.5%)</div>
            <div className="text-xl font-black text-blue-800 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalCompanyInsurance)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">BHXH 17.5% + BHYT 3% + BHTN 1%</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tạm ứng đã cấp trong kỳ</div>
            <div className="text-xl font-black text-rose-700 mt-0.5">
              {formatVND(grandTotalLaborBudget.totalAdvances)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Đã thu hồi trực tiếp từ lương</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bảng 1: Phân Tích Cơ Cấu Chi Phí Theo 3 Nhóm Nhân Sự */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 uppercase">
            <Users className="w-4 h-4 text-[#0f3d64]" />
            <span>1. Cơ Cấu Chi Phí Tiền Lương Theo Từng Nhóm Nhân Sự</span>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">
            {timeViewMode === 'MONTH'
              ? `Tháng ${config.month || 9}/${config.year || 2026}`
              : timeViewMode === 'YEAR'
              ? `Cả năm ${config.year || 2026}`
              : `Quý ${timeViewMode}`}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-3 border-r border-slate-200">Nhóm Nhân Lực</th>
                <th className="p-3 border-r border-slate-200 text-center w-28">Số Lượng</th>
                <th className="p-3 border-r border-slate-200 text-right">Lương Theo Công</th>
                <th className="p-3 border-r border-slate-200 text-right">Làm Thêm Giờ (OT)</th>
                <th className="p-3 border-r border-slate-200 text-right">Phụ Cấp & Thưởng</th>
                <th className="p-3 border-r border-slate-200 text-right">Tổng Thu Nhập</th>
                <th className="p-3 border-r border-slate-200 text-right">BHXH Doanh Nghiệp (21.5%)</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-black">Thực Lĩnh Chi Trả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Hàng 1: Chính thức */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-[#0f3d64] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-600" />
                  <span>1. Nhân viên chính thức (Khối VP & Kỹ sư)</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {permanentStats.count} người
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(permanentStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(permanentStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-blue-800">
                  {formatVND(permanentStats.companyInsurance * multiplier)}
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(permanentStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng 2: Thời vụ */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-amber-800 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>2. Công nhân kỹ thuật & Thời vụ</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {seasonalStats.count} thợ
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(seasonalStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(seasonalStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-400">
                  0 đ (Theo cam kết 08)
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(seasonalStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng 3: Tổ đội */}
              <tr className="hover:bg-slate-50">
                <td className="p-3 border-r border-slate-200 font-bold text-indigo-800 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                  <span>3. Nhân viên tổ đội thi công (Khoán công trình)</span>
                </td>
                <td className="p-3 border-r border-slate-200 text-center font-semibold">
                  {teamStats.count} tổ ({teamStats.totalWorkers} thợ)
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.baseTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.otTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-medium">
                  {formatVND(teamStats.allowanceTotal * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-900">
                  {formatVND(teamStats.totalIncome * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-200 text-right font-mono text-slate-400">
                  0 đ (Khoán tổ đội)
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-800 bg-emerald-50/50">
                  {formatVND(teamStats.netTotal * multiplier)}
                </td>
              </tr>

              {/* Hàng Tổng Cộng */}
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td className="p-3 border-r border-slate-300 uppercase">TỔNG CỘNG CHI PHÍ NHÂN LỰC</td>
                <td className="p-3 border-r border-slate-300 text-center">
                  {permanentStats.count + seasonalStats.count + teamStats.totalWorkers} nhân sự
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.baseTotal + seasonalStats.baseTotal + teamStats.baseTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.otTotal + seasonalStats.otTotal + teamStats.otTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono">
                  {formatVND((permanentStats.allowanceTotal + seasonalStats.allowanceTotal + teamStats.allowanceTotal) * multiplier)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono font-black text-blue-950">
                  {formatVND(grandTotalLaborBudget.totalPayroll)}
                </td>
                <td className="p-3 border-r border-slate-300 text-right font-mono font-black text-blue-900">
                  {formatVND(grandTotalLaborBudget.totalCompanyInsurance)}
                </td>
                <td className="p-3 text-right font-mono font-black text-emerald-900 bg-emerald-100">
                  {formatVND(grandTotalLaborBudget.totalNetDisbursement)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bảng 2: Phân Tích Chi Phí Nhân Công Theo Từng Dự Án / Công Trình */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 uppercase">
            <Building className="w-4 h-4 text-sky-700" />
            <span>2. Báo Cáo Chi Phí Nhân Công Chi Tiết Theo Từng Dự Án (So Sánh Ngân Sách Dự Toán)</span>
          </div>
          <span className="text-[11px] text-slate-500 font-semibold">{projects.length} công trình</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px] uppercase">
                <th className="p-3 border-r border-slate-200 text-center w-12">STT</th>
                <th className="p-3 border-r border-slate-200 w-24">Mã DA</th>
                <th className="p-3 border-r border-slate-200 min-w-[200px]">Tên Công Trình</th>
                <th className="p-3 border-r border-slate-200 min-w-[150px]">Chủ Đầu Tư / Địa Điểm</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Dự Toán Nhân Công</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Chi Phí Thực Tế</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[120px]">Tiến Độ Giải Ngân</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Ngân Sách Còn Lại</th>
                <th className="p-3 text-center w-28">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projectExpenses.map((p, idx) => {
                const percent = p.budgetPercent;
                const isOverBudget = percent >= 95;

                return (
                  <tr key={p.id} className="hover:bg-sky-50/40 transition-colors">
                    <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="p-3 border-r border-slate-200 font-mono font-bold text-[#0f3d64]">
                      {p.code}
                    </td>
                    <td className="p-3 border-r border-slate-200 font-bold text-slate-900">
                      {p.name}
                      <div className="text-[10px] text-slate-500 font-normal">Chỉ huy trưởng: {p.managerName}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-slate-600">
                      <div>{p.investor}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{p.location}</div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                      {formatVND(p.laborBudget)}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">
                      {formatVND(p.totalLaborCost)}
                    </td>
                    <td className="p-3 border-r border-slate-200 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-14 bg-slate-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full ${
                              isOverBudget ? 'bg-rose-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold font-mono ${isOverBudget ? 'text-rose-600' : 'text-slate-700'}`}>
                          {percent}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-sky-900">
                      {formatVND(p.remainingBudget)}
                    </td>
                    <td className="p-3 text-center">
                      {p.status === 'IN_PROGRESS' ? (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                          Đang thi công
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-sky-100 text-sky-800 rounded-full text-[10px] font-bold">
                          Hoàn thành
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
