import React, { useState, useMemo } from 'react';
import {
  Building,
  Plus,
  Search,
  Filter,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  Users,
  HardHat,
  Download,
  Briefcase,
  X,
  Save,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Project, Employee, SeasonalWorker, TeamWorker } from '../types';
import { formatVND } from '../utils/numberToVietnameseWords';

interface ProjectsTabProps {
  projects: Project[];
  employees: Employee[];
  seasonalWorkers: SeasonalWorker[];
  teamWorkers: TeamWorker[];
  onAddProject: (project: Project) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onSelectProjectForFilter?: (projectName: string) => void;
}

export const ProjectsTab: React.FC<ProjectsTabProps> = ({
  projects,
  employees,
  seasonalWorkers,
  teamWorkers,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING' | 'PAUSED'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Form modal state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formInvestor, setFormInvestor] = useState('');
  const [formContractValue, setFormContractValue] = useState<number>(0);
  const [formLaborBudget, setFormLaborBudget] = useState<number>(0);
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formManagerName, setFormManagerName] = useState('');
  const [formStatus, setFormStatus] = useState<'IN_PROGRESS' | 'COMPLETED' | 'PENDING' | 'PAUSED'>('IN_PROGRESS');
  const [formDescription, setFormDescription] = useState('');

  const openAddModal = () => {
    setEditingProject(null);
    const nextNum = projects.length + 1;
    setFormCode(`DA-PN${nextNum < 10 ? '0' + nextNum : nextNum}`);
    setFormName('');
    setFormLocation('');
    setFormInvestor('');
    setFormContractValue(0);
    setFormLaborBudget(500000000);
    setFormStartDate(new Date().toLocaleDateString('vi-VN'));
    setFormEndDate('31/12/2026');
    setFormManagerName('KS. Phan Quốc Toàn');
    setFormStatus('IN_PROGRESS');
    setFormDescription('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setFormCode(p.code);
    setFormName(p.name);
    setFormLocation(p.location);
    setFormInvestor(p.investor);
    setFormContractValue(p.contractValue || 0);
    setFormLaborBudget(p.laborBudget);
    setFormStartDate(p.startDate);
    setFormEndDate(p.endDate);
    setFormManagerName(p.managerName);
    setFormStatus(p.status);
    setFormDescription(p.description || '');
    setIsModalOpen(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Vui lòng nhập tên dự án!');
      return;
    }

    if (editingProject) {
      const updated: Project = {
        ...editingProject,
        code: formCode,
        name: formName,
        location: formLocation,
        investor: formInvestor,
        contractValue: Number(formContractValue) || 0,
        laborBudget: Number(formLaborBudget) || 0,
        startDate: formStartDate,
        endDate: formEndDate,
        managerName: formManagerName,
        status: formStatus,
        description: formDescription,
      };
      onUpdateProject(updated);
      showToast(`Đã cập nhật dự án ${formName}!`);
    } else {
      const newProj: Project = {
        id: `proj-${Date.now()}`,
        code: formCode,
        name: formName,
        location: formLocation,
        investor: formInvestor,
        contractValue: Number(formContractValue) || 0,
        laborBudget: Number(formLaborBudget) || 0,
        actualLaborCost: 0,
        startDate: formStartDate,
        endDate: formEndDate,
        managerName: formManagerName,
        status: formStatus,
        description: formDescription,
      };
      onAddProject(newProj);
      showToast(`Đã thêm dự án mới ${formName}!`);
    }

    setIsModalOpen(false);
  };

  // Tính toán nhân sự và chi phí thực tế cho từng dự án
  const projectStats = useMemo(() => {
    return projects.map((proj) => {
      // Tìm số thợ thời vụ ở dự án
      const matchingSeasonal = seasonalWorkers.filter(
        (w) => w.project && w.project.toLowerCase().includes(proj.name.toLowerCase().substring(0, 15))
      );
      // Tìm số tổ đội ở dự án
      const matchingTeams = teamWorkers.filter(
        (t) => t.project && t.project.toLowerCase().includes(proj.name.toLowerCase().substring(0, 15))
      );
      // Tìm nhân viên kỹ thuật chính thức phụ trách
      const matchingEmployees = employees.filter(
        (e) => e.department?.includes('Kỹ thuật') || e.fullName === proj.managerName
      );

      const seasonalCost = matchingSeasonal.reduce((sum, w) => sum + (w.totalIncome || 0), 0);
      const teamCost = matchingTeams.reduce((sum, t) => sum + (t.totalIncome || 0), 0);
      const actualCost = proj.actualLaborCost || seasonalCost + teamCost;
      const budgetPercent = proj.laborBudget > 0 ? Math.min(Math.round((actualCost / proj.laborBudget) * 100), 100) : 0;

      return {
        ...proj,
        calculatedLaborCost: actualCost,
        seasonalCount: matchingSeasonal.length,
        teamCount: matchingTeams.length,
        workerCount: matchingSeasonal.length + matchingTeams.reduce((acc, t) => acc + (t.workerCount || 1), 0),
        budgetPercent,
      };
    });
  }, [projects, seasonalWorkers, teamWorkers, employees]);

  // Bộ lọc
  const filteredProjects = useMemo(() => {
    return projectStats.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.investor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.managerName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projectStats, searchTerm, statusFilter]);

  // Thống kê tổng
  const totalBudget = projects.reduce((sum, p) => sum + p.laborBudget, 0);
  const totalActual = projectStats.reduce((sum, p) => sum + p.calculatedLaborCost, 0);
  const inProgressCount = projects.filter((p) => p.status === 'IN_PROGRESS').length;
  const completedCount = projects.filter((p) => p.status === 'COMPLETED').length;

  // Xuất file Excel dự án
  const handleExportExcel = () => {
    const dataToExport = filteredProjects.map((p, idx) => ({
      STT: idx + 1,
      'Mã Dự Án': p.code,
      'Tên Công Trình': p.name,
      'Chủ Đầu Tư': p.investor,
      'Địa Điểm': p.location,
      'Chỉ Huy Trưởng': p.managerName,
      'Ngày Khởi Công': p.startDate,
      'Ngày Hoàn Thành': p.endDate,
      'Dự Toán Nhân Công (VNĐ)': p.laborBudget,
      'Chi Phí Thực Tế (VNĐ)': p.calculatedLaborCost,
      'Tỷ Lệ Giải Ngân (%)': `${p.budgetPercent}%`,
      'Nhân Lực Hiện Trường': `${p.workerCount} người`,
      'Trạng Thái':
        p.status === 'IN_PROGRESS'
          ? 'Đang thi công'
          : p.status === 'COMPLETED'
          ? 'Hoàn thành'
          : p.status === 'PENDING'
          ? 'Sắp khởi công'
          : 'Tạm dừng',
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSachDuAn');
    XLSX.writeFile(wb, `Danh_Sach_Du_An_Phuc_Nguyen_${Date.now()}.xlsx`);
    showToast('Đã xuất danh sách dự án ra file Excel thành công!');
  };

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 text-white rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Thao tác */}
      <div className="bg-gradient-to-r from-[#09233b] via-[#0f3d64] to-[#1c5b8c] text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#13375c] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-sky-500/20 text-sky-300 rounded-lg">
              <Building className="w-5 h-5" />
            </span>
            <h2 className="text-base sm:text-lg font-black tracking-wide uppercase">
              Danh Sách Dự Án & Công Trình Phúc Nguyên
            </h2>
          </div>
          <p className="text-xs text-sky-200 mt-1 max-w-2xl">
            Quản lý tiến độ công trình, dự toán ngân sách nhân công, phân bổ tổ đội thi công và kiểm soát chi phí thực tế.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-xs active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Dự Án Mới</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer border border-white/20"
          >
            <Download className="w-4 h-4 text-sky-300" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* 4 Thẻ Chỉ Số Tổng Quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng số công trình</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{projects.length} dự án</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              🟢 {inProgressCount} đang làm &bull; ✓ {completedCount} hoàn thành
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-[#0f3d64] shrink-0">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Tổng dự toán nhân công</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{formatVND(totalBudget)}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ngân sách dự kiến toàn bộ</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Chi phí nhân công thực tế</div>
            <div className="text-xl font-black text-emerald-700 mt-0.5">{formatVND(totalActual)}</div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              Đã giải ngân {totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0}% ngân sách
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <div className="text-slate-500 font-medium">Nhân lực tại công trường</div>
            <div className="text-xl font-black text-[#0f3d64] mt-0.5">
              {seasonalWorkers.length + teamWorkers.reduce((acc, t) => acc + (t.workerCount || 1), 0)} người
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {teamWorkers.length} tổ đội &bull; {seasonalWorkers.length} thợ thời vụ
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
            <HardHat className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Thanh Tìm kiếm & Lọc */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên dự án, mã công trình, địa điểm, chủ đầu tư..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f3d64] focus:border-transparent bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
            >
              <option value="ALL">Tất cả ({projects.length})</option>
              <option value="IN_PROGRESS">Đang thi công ({inProgressCount})</option>
              <option value="COMPLETED">Đã hoàn thành ({completedCount})</option>
              <option value="PENDING">Sắp khởi công</option>
              <option value="PAUSED">Tạm dừng</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bảng Danh Sách Dự Án */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider select-none">
                <th className="p-3 border-r border-slate-200 text-center w-12">STT</th>
                <th className="p-3 border-r border-slate-200 w-24">Mã DA</th>
                <th className="p-3 border-r border-slate-200 min-w-[200px]">Tên Dự Án & Công Trình</th>
                <th className="p-3 border-r border-slate-200 min-w-[160px]">Địa Điểm & Chủ Đầu Tư</th>
                <th className="p-3 border-r border-slate-200 min-w-[140px]">Chỉ Huy Trưởng</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[120px]">Dự Toán Nhân Công</th>
                <th className="p-3 border-r border-slate-200 text-right min-w-[130px]">Chi Phí Thực Tế</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[110px]">Tiến Độ Giải Ngân</th>
                <th className="p-3 border-r border-slate-200 text-center min-w-[100px]">Trạng Thái</th>
                <th className="p-3 text-center w-24 no-print">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Không tìm thấy dự án nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredProjects.map((p, idx) => {
                  const percent = p.budgetPercent;
                  const isHighBudget = percent > 90;

                  return (
                    <tr key={p.id} className="hover:bg-sky-50/50 transition-colors">
                      <td className="p-3 border-r border-slate-200 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>

                      <td className="p-3 border-r border-slate-200 font-mono font-bold text-[#0f3d64]">
                        {p.code}
                      </td>

                      <td className="p-3 border-r border-slate-200">
                        <div className="font-bold text-slate-900 hover:text-sky-700 cursor-pointer" onClick={() => openEditModal(p)}>
                          {p.name}
                        </div>
                        {p.description && (
                          <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{p.description}</div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                          <span>Khởi công: {p.startDate}</span>
                          <span>&bull;</span>
                          <span>Dự kiến: {p.endDate}</span>
                        </div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-600">
                        <div className="flex items-center gap-1 text-slate-800 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="line-clamp-1">{p.location}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">CĐT: {p.investor}</div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-slate-800">
                        <div className="font-semibold text-slate-900">{p.managerName}</div>
                        <div className="text-[10px] text-sky-700 font-semibold mt-0.5 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{p.workerCount} nhân lực hiện trường</span>
                        </div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-slate-700">
                        {formatVND(p.laborBudget)}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-800">
                        {formatVND(p.calculatedLaborCost)}
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${
                                isHighBudget ? 'bg-rose-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-bold font-mono ${isHighBudget ? 'text-rose-600' : 'text-slate-700'}`}>
                            {percent}%
                          </span>
                        </div>
                      </td>

                      <td className="p-3 border-r border-slate-200 text-center">
                        {p.status === 'IN_PROGRESS' ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                            Đang thi công
                          </span>
                        ) : p.status === 'COMPLETED' ? (
                          <span className="px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-300 rounded-full text-[10px] font-bold">
                            Hoàn thành
                          </span>
                        ) : p.status === 'PENDING' ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-[10px] font-bold">
                            Sắp khởi công
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded-full text-[10px] font-bold">
                            Tạm dừng
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="p-1.5 text-sky-700 hover:text-sky-900 hover:bg-sky-100 rounded cursor-pointer"
                            title="Chỉnh sửa dự án"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProjectToDelete(p)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-100 rounded cursor-pointer"
                            title="Xóa dự án"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm / Chỉnh Sửa Dự Án */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#09233b] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-sky-300" />
                <h3 className="font-bold text-sm uppercase">
                  {editingProject ? 'Chỉnh Sửa Dự Án Công Trình' : 'Thêm Dự Án Mới'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mã dự án *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Trạng thái thi công</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="IN_PROGRESS">Đang thi công</option>
                    <option value="COMPLETED">Đã hoàn thành</option>
                    <option value="PENDING">Sắp khởi công</option>
                    <option value="PAUSED">Tạm dừng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên dự án / Công trình *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nhập tên dự án (VD: Nhà máy Dược Phẩm Etex)..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Địa điểm thi công</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="VD: Long Hậu, Long An..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Chủ đầu tư (CĐT)</label>
                  <input
                    type="text"
                    value={formInvestor}
                    onChange={(e) => setFormInvestor(e.target.value)}
                    placeholder="VD: Etex Group..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Chỉ huy trưởng / Giám sát</label>
                  <input
                    type="text"
                    value={formManagerName}
                    onChange={(e) => setFormManagerName(e.target.value)}
                    placeholder="VD: KS. Phan Quốc Toàn"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Dự toán nhân công (VNĐ)</label>
                  <input
                    type="number"
                    step={1000000}
                    value={formLaborBudget}
                    onChange={(e) => setFormLaborBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ngày khởi công</label>
                  <input
                    type="text"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    placeholder="dd/mm/yyyy"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Ngày dự kiến hoàn thành</label>
                  <input
                    type="text"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    placeholder="dd/mm/yyyy"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Mô tả công việc & Phạm vi gói thầu</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Ghi chú chi tiết gói thầu thi công..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0f3d64] hover:bg-sky-800 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingProject ? 'Cập Nhật' : 'Tạo Dự Án'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Dự Án */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <AlertCircle className="w-5 h-5" />
              <span>Xác Nhận Xóa Dự Án</span>
            </div>
            <p className="text-xs text-slate-700">
              Bạn có chắc chắn muốn xóa dự án{' '}
              <strong className="text-slate-900 font-bold">{projectToDelete.name}</strong> ({projectToDelete.code})?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(projectToDelete.id);
                  showToast(`Đã xóa dự án ${projectToDelete.name}!`);
                  setProjectToDelete(null);
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer"
              >
                Đồng ý xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
