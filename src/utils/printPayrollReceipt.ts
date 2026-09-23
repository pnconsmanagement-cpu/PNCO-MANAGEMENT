import { SeasonalWorker, CompanyConfig } from '../types';
import { formatNumberOnly, numberToVietnameseWords } from './numberToVietnameseWords';

/**
 * Sinh mã HTML hoàn chỉnh chuẩn in A4 cho Phiếu thanh toán thợ thời vụ (Mẫu 03-LĐTL)
 * Thiết kế chuẩn phom Phiếu Lương chuyên nghiệp, đường nét đậm đà, tương phản cao, không bị mờ khi in
 */
export function generateSeasonalWorkerReceiptHTML(
  worker: SeasonalWorker,
  config: CompanyConfig,
  customPeriodLabel?: string
): string {
  const periodText = customPeriodLabel
    ? `${customPeriodLabel} — Tháng ${worker.attendanceMonth || config.month}/${worker.attendanceYear || config.year}`
    : worker.currentWeekLabel
    ? `${worker.currentWeekLabel} — Tháng ${worker.attendanceMonth || config.month}/${worker.attendanceYear || config.year}`
    : config.period;

  const qrUrl =
    worker.paymentMethod === 'BANK' && worker.bankAccount && worker.bankName
      ? `https://img.vietqr.io/image/${encodeURIComponent(worker.bankName)}-${encodeURIComponent(worker.bankAccount)}-compact.png?amount=${worker.netSalary}&addInfo=${encodeURIComponent(`Thanh toan luong ${worker.code} ${config.periodCode || ''}`)}&accountName=${encodeURIComponent(worker.fullName)}`
      : null;

  // Xây dựng bảng chấm công tuần / đợt chi tiết (nếu có)
  let timesheetHtml = '';
  if (worker.weeklyTimesheet && worker.weeklyTimesheet.length > 0) {
    const daysTh = worker.weeklyTimesheet
      .map(
        (d) => `
        <th style="padding: 5px 3px; text-align: center; border: 1px solid #1e293b; background-color: #f1f5f9; font-size: 8.5pt; font-weight: bold;">
          <div style="color: ${d.dayOfWeek === 'CN' ? '#b91c1c' : '#0f172a'};">${d.dayName || d.dayOfWeek}</div>
          <div style="color: #475569; font-size: 7.5pt; font-weight: 600;">${d.dateLabel || ''}</div>
        </th>`
      )
      .join('');

    const daysTd = worker.weeklyTimesheet
      .map(
        (d) => `
        <td style="padding: 6px 3px; text-align: center; border: 1px solid #1e293b; font-size: 8.5pt; background-color: #ffffff;">
          <div style="font-weight: 800; color: #0f3d64;">${d.workUnits} công</div>
          <div style="font-size: 7.5pt; font-weight: 700; color: #9a3412;">${d.otHours > 0 ? `+${d.otHours}h OT` : '—'}</div>
        </td>`
      )
      .join('');

    timesheetHtml = `
      <div style="margin: 10px 0 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #0f3d64; padding-bottom: 3px; margin-bottom: 4px;">
          <span style="font-weight: 800; font-size: 9pt; color: #0f3d64; text-transform: uppercase;">
            BẢNG CHẤM CÔNG CHI TIẾT TRONG KỲ (${periodText})
          </span>
          <span style="font-size: 8.5pt; color: #0f172a; font-weight: bold;">
            Tổng: <strong style="color: #0f3d64;">${worker.actualWorkDays} công</strong> — Tăng ca: <strong style="color: #c2410c;">${worker.overtimeHours} giờ OT</strong>
          </span>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin: 0; border: 1px solid #1e293b;">
          <thead><tr>${daysTh}</tr></thead>
          <tbody><tr>${daysTd}</tr></tbody>
        </table>
      </div>
    `;
  }

  const currentDateStr = new Date();
  const printDay = String(currentDateStr.getDate()).padStart(2, '0');
  const printMonth = String(currentDateStr.getMonth() + 1).padStart(2, '0');
  const printYear = currentDateStr.getFullYear();

  const htmlContent = `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Phieu_Luong_${worker.code}_${worker.fullName.replace(/\s+/g, '_')}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 10mm 12mm;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 9.5pt;
        color: #000000;
        line-height: 1.4;
        margin: 0;
        padding: 0;
        background-color: #ffffff;
      }
      .payslip-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 4px 6px;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        border-bottom: 2.5px solid #0f3d64;
        padding-bottom: 6px;
        margin-bottom: 10px;
      }
      .header-table td {
        border: none;
        padding: 0;
        vertical-align: top;
      }
      .company-name {
        font-weight: 900;
        font-size: 11pt;
        text-transform: uppercase;
        color: #0f3d64;
        letter-spacing: 0.3px;
      }
      .company-sub {
        font-size: 8pt;
        color: #334155;
        margin-top: 2px;
      }
      .title-section {
        text-align: center;
        margin: 8px 0 12px 0;
      }
      .title-section h1 {
        font-size: 15pt;
        font-weight: 800;
        text-transform: uppercase;
        margin: 0;
        color: #0f3d64;
        letter-spacing: 0.5px;
      }
      .title-section p {
        font-size: 9pt;
        margin: 3px 0 0 0;
        color: #475569;
        font-weight: 500;
        font-style: italic;
      }
      .info-box {
        background-color: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 10px;
      }
      .info-table {
        width: 100%;
        border-collapse: collapse;
      }
      .info-table td {
        border: none;
        padding: 3px 6px;
        font-size: 8.5pt;
        color: #1e293b;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
        font-size: 8.5pt;
        border: 1px solid #cbd5e1;
      }
      .data-table th, .data-table td {
        border: 1px solid #e2e8f0;
        padding: 5px 8px;
      }
      .data-table thead tr {
        background-color: #0f3d64 !important;
        color: #ffffff !important;
      }
      .data-table th {
        font-weight: 700;
        text-transform: uppercase;
        font-size: 8pt;
        letter-spacing: 0.3px;
      }
      .section-row-a {
        background-color: #e0f2fe !important;
        color: #082f49 !important;
        font-weight: 700;
        font-size: 8pt;
        border-bottom: 1px solid #bae6fd;
      }
      .section-row-b {
        background-color: #f0fdf4 !important;
        color: #14532d !important;
        font-weight: 700;
        font-size: 8pt;
        border-bottom: 1px solid #bbf7d0;
      }
      .section-row-c {
        background-color: #fef3c7 !important;
        color: #78350f !important;
        font-weight: 700;
        font-size: 8pt;
        border-bottom: 1px solid #fde68a;
      }
      .subtotal-row {
        background-color: #f8fafc !important;
        font-weight: 700;
        border-top: 1px solid #cbd5e1;
      }
      .net-salary-row {
        background-color: #14532d !important;
        color: #ffffff !important;
        font-weight: 800;
        border-top: 1.5px solid #0f3d64;
      }
      .words-box {
        border: 1px solid #cbd5e1;
        background-color: #f8fafc;
        border-radius: 4px;
        padding: 7px 12px;
        margin-bottom: 10px;
        font-size: 8.5pt;
        color: #334155;
      }
      .qr-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 1px solid #bae6fd;
        background-color: #f0f9ff;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 10px;
      }
      .signatures {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        text-align: center;
        margin-top: 14px;
        page-break-inside: avoid;
      }
      .sig-title {
        font-weight: 700;
        font-size: 8.5pt;
        text-transform: uppercase;
        color: #1e293b;
      }
      .sig-note {
        font-style: italic;
        font-size: 7.5pt;
        color: #64748b;
        margin-top: 1px;
      }
      .sig-space {
        height: 48px;
      }
      .sig-name {
        font-weight: 700;
        font-size: 8.5pt;
        color: #1e293b;
      }
    </style>
  </head>
  <body>
    <div class="payslip-container">
      <!-- Header công ty & mẫu biểu chuẩn -->
      <table class="header-table">
        <tr>
          <td>
            <div class="company-name">${config.name}</div>
            <div class="company-sub">Địa chỉ: <strong>${config.address}</strong></div>
            <div class="company-sub">Mã số thuế: <strong>${config.taxCode}</strong> — Điện thoại: <strong>${config.phone}</strong></div>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-block; padding: 3px 8px; background-color: #ffffff; border: 1.5px solid #0f3d64; border-radius: 4px; font-weight: 800; font-size: 8.5pt; color: #0f3d64;">
              Mẫu: 03-LĐTL
            </div>
            <div style="font-size: 7.5pt; color: #334155; margin-top: 2px; font-weight: 600;">(Ban hành theo TT 200 & TT 133/BTC)</div>
            <div style="font-size: 8.5pt; font-family: monospace; font-weight: 800; color: #000000; margin-top: 2px;">
              Số phiếu: PLTV-${config.periodCode?.replace('/', '') || `${config.month}${config.year}`}-${worker.code}
            </div>
          </td>
        </tr>
      </table>

      <!-- Tiêu đề phiếu chuẩn như phiếu lương -->
      <div class="title-section">
        <h1>PHIẾU THANH TOÁN TIỀN LƯƠNG & CÔNG THỢ</h1>
        <p>
          Kỳ thanh toán: <span style="color: #0f3d64; font-weight: 800;">${periodText}</span>
          ${worker.project ? ` — Công trình: <strong style="color: #0f3d64;">${worker.project}</strong>` : ''}
        </p>
      </div>

      <!-- Khung thông tin nhân sự -->
      <div class="info-box">
        <table class="info-table">
          <tr>
            <td style="width: 50%;">
              Họ và tên: <strong style="text-transform: uppercase; font-size: 9.5pt; color: #0f172a;">${worker.fullName}</strong>
            </td>
            <td style="width: 50%;">
              Mã nhân công: <strong style="font-family: monospace; font-size: 9pt; color: #0f3d64;">${worker.code}</strong>
            </td>
          </tr>
          <tr>
            <td>
              Nghề nghiệp: <strong>${worker.trade}</strong> ${worker.skillLevel ? `(${worker.skillLevel})` : ''}
            </td>
            <td>
              Tổ / Đội: <strong>${worker.teamName || 'Đội thi công công trình'}</strong>
            </td>
          </tr>
          <tr>
            <td>
              Số CCCD / CMND: <span style="font-family: monospace;">${worker.idCard || 'Đang cập nhật'}</span>
            </td>
            <td>
              Điện thoại: <span style="font-family: monospace;">${worker.phone || '—'}</span>
            </td>
          </tr>
          <tr>
            <td>
              Hình thức lương: <span>Theo ngày công (${formatNumberOnly(worker.dailyRate)} đ/ngày)</span>
            </td>
            <td>
              Ngày công: <strong style="color: #0f3d64;">${worker.actualWorkDays} ngày</strong> ${worker.overtimeHours > 0 ? `(+${worker.overtimeHours}h OT)` : ''}
            </td>
          </tr>
          <tr>
            <td>
              Phụ trách: <span>${worker.teamLeader || 'Ban Chỉ huy công trường'}</span>
            </td>
            <td>
              Chi trả qua: <strong style="color: ${worker.paymentMethod === 'BANK' ? '#0f3d64' : '#15803d'};">
                ${worker.paymentMethod === 'BANK' ? `${worker.bankName} - ${worker.bankAccount}` : 'Tiền mặt tại công trường'}
              </strong>
            </td>
          </tr>
        </table>
      </div>

      <!-- Bảng chấm công tuần chi tiết (nếu có) -->
      ${timesheetHtml}

      <!-- BẢNG CHI TIẾT THANH TOÁN TIỀN LƯƠNG THEO PHOM PHIẾU LƯƠNG CHUẨN -->
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 38px; text-align: center;">STT</th>
            <th style="text-align: left;">NỘI DUNG THANH TOÁN / GIẢM TRỪ</th>
            <th style="width: 130px; text-align: center;">ĐƠN VỊ / SỐ LƯỢNG</th>
            <th style="width: 155px; text-align: right;">SỐ LIỆU / THÀNH TIỀN (VNĐ)</th>
          </tr>
        </thead>
        <tbody>
          <!-- PHẦN A: SỐ CÔNG & THỐNG KÊ LÀM VIỆC -->
          <tr class="section-row-a">
            <td style="text-align: center;">A</td>
            <td colspan="2" style="text-transform: uppercase;">SỐ NGÀY CÔNG ĐI LÀM & DỮ LIỆU ĐẦU VÀO</td>
            <td style="text-align: right;">THỐNG KÊ</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">1</td>
            <td style="padding-left: 14px;">Số ngày công đi làm thực tế</td>
            <td style="text-align: center; font-family: monospace; font-weight: bold; color: #0f3d64;">${worker.actualWorkDays} ngày</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #0f3d64;">${worker.actualWorkDays} công</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">2</td>
            <td style="padding-left: 14px;">Số giờ làm thêm / tăng ca công trình (OT hệ số 150%)</td>
            <td style="text-align: center; font-family: monospace; font-weight: bold; color: #c2410c;">${worker.overtimeHours} giờ</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #c2410c;">${worker.overtimeHours > 0 ? `${worker.overtimeHours} giờ OT` : '—'}</td>
          </tr>

          <!-- PHẦN B: CÁC KHOẢN TIỀN CÔNG VÀ THU NHẬP -->
          <tr class="section-row-b">
            <td style="text-align: center;">B</td>
            <td colspan="2" style="text-transform: uppercase;">CÁC KHOẢN TIỀN CÔNG VÀ THU NHẬP</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatNumberOnly(worker.totalIncome)}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">3</td>
            <td style="padding-left: 14px;">
              Lương theo đơn giá ngày công (${worker.actualWorkDays} ngày × ${formatNumberOnly(worker.dailyRate)} đ/ngày)
            </td>
            <td style="text-align: center; font-family: monospace;">${worker.actualWorkDays} công</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #000000;">${formatNumberOnly(worker.salaryByDays)}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">4</td>
            <td style="padding-left: 14px;">
              Tiền làm thêm giờ / tăng ca (${worker.overtimeHours} giờ × hệ số 150%)
            </td>
            <td style="text-align: center; font-family: monospace;">${worker.overtimeHours} giờ</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #c2410c;">${formatNumberOnly(worker.overtimePay)}</td>
          </tr>
          ${
            worker.mealAllowance > 0
              ? `
          <tr>
            <td style="text-align: center; font-weight: bold;">5</td>
            <td style="padding-left: 14px;">Phụ cấp tiền ăn ca / ăn trưa tại công trường</td>
            <td style="text-align: center; color: #475569;">—</td>
            <td style="text-align: right; font-family: monospace;">${formatNumberOnly(worker.mealAllowance)}</td>
          </tr>`
              : ''
          }
          ${
            worker.travelSafetyAllowance > 0
              ? `
          <tr>
            <td style="text-align: center; font-weight: bold;">6</td>
            <td style="padding-left: 14px;">Phụ cấp xăng xe / Độc hại / An toàn lao động</td>
            <td style="text-align: center; color: #475569;">—</td>
            <td style="text-align: right; font-family: monospace;">${formatNumberOnly(worker.travelSafetyAllowance)}</td>
          </tr>`
              : ''
          }
          ${
            worker.otherBonus > 0
              ? `
          <tr>
            <td style="text-align: center; font-weight: bold;">7</td>
            <td style="padding-left: 14px;">Thưởng chuyên cần / Thưởng vượt tiến độ thi công</td>
            <td style="text-align: center; color: #475569;">—</td>
            <td style="text-align: right; font-family: monospace;">${formatNumberOnly(worker.otherBonus)}</td>
          </tr>`
              : ''
          }
          <tr class="subtotal-row">
            <td colspan="2" style="text-align: right; text-transform: uppercase; color: #000000; font-weight: 800;">
              TỔNG THU NHẬP (B):
            </td>
            <td colspan="2" style="text-align: right; font-family: monospace; font-weight: 900; color: #0f3d64; font-size: 10.5pt;">
              ${formatNumberOnly(worker.totalIncome)} đ
            </td>
          </tr>

          <!-- PHẦN C: CÁC KHOẢN GIẢM TRỪ VÀ KHẤU TRỪ -->
          <tr class="section-row-c">
            <td style="text-align: center;">C</td>
            <td colspan="2" style="text-transform: uppercase;">CÁC KHOẢN GIẢM TRỪ VÀ KHẤU TRỪ</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #991b1b;">${formatNumberOnly(worker.totalDeductions)}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">8</td>
            <td style="padding-left: 14px;">
              Thuế TNCN thời vụ 10% (Theo Thông tư 111/2013/TT-BTC)<br/>
              <span style="font-size: 8pt; font-weight: 700; color: ${worker.hasTaxCommitment ? '#15803d' : '#991b1b'};">
                ${worker.hasTaxCommitment ? '✓ Đã ký nộp Cam kết Mẫu 08/CK-TNCN: Miễn trừ 10%' : '⚠ Chưa có Cam kết 08: Khấu trừ 10% thuế tại nguồn'}
              </span>
            </td>
            <td style="text-align: center; font-family: monospace; font-weight: bold;">
              ${worker.hasTaxCommitment ? 'Miễn 10%' : '10%'}
            </td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #991b1b;">
              ${formatNumberOnly(worker.personalIncomeTax)}
            </td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">9</td>
            <td style="padding-left: 14px;">Tạm ứng tiền mặt tại công trường trong kỳ</td>
            <td style="text-align: center; color: #475569;">—</td>
            <td style="text-align: right; font-family: monospace; font-weight: bold; color: #991b1b;">
              ${formatNumberOnly(worker.advancePayment)}
            </td>
          </tr>
          <tr class="subtotal-row">
            <td colspan="2" style="text-align: right; text-transform: uppercase; color: #991b1b; font-weight: 800;">
              TỔNG KHẤU TRỪ (C):
            </td>
            <td colspan="2" style="text-align: right; font-family: monospace; font-weight: 900; color: #991b1b; font-size: 10.5pt;">
              ${formatNumberOnly(worker.totalDeductions)} đ
            </td>
          </tr>

          <!-- HÀNG THỰC LĨNH CHI TRẢ ĐẶC TRƯNG CHUẨN PHIẾU LƯƠNG -->
          <tr class="net-salary-row">
            <td style="text-align: center; font-size: 10pt; font-weight: 900;">★</td>
            <td colspan="2" style="text-transform: uppercase; font-size: 10.5pt; font-weight: 900; letter-spacing: 0.5px; padding: 8px 10px;">
              THỰC LĨNH CHI TRẢ (B - C)
            </td>
            <td style="text-align: right; font-family: monospace; font-size: 13.5pt; font-weight: 900; color: #f0fdf4; padding: 8px 10px;">
              ${formatNumberOnly(worker.netSalary)} đ
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Số tiền bằng chữ -->
      <div class="words-box">
        <span style="font-weight: 800; color: #000000;">Số tiền bằng chữ: </span>
        <span style="font-style: italic; font-weight: 700; color: #0f3d64;">${numberToVietnameseWords(worker.netSalary)}</span>
      </div>

      <!-- Thông tin VietQR nếu có chuyển khoản -->
      ${
        qrUrl
          ? `
      <div class="qr-box">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div>
            <div style="font-weight: 900; font-size: 9pt; color: #0f3d64; text-transform: uppercase;">
              Mã VietQR thanh toán tiền công thợ
            </div>
            <div style="font-size: 8.5pt; color: #000000; margin-top: 2px;">
              Ngân hàng: <strong>${worker.bankName}</strong> — Số TK: <strong style="font-family: monospace; font-size: 9.5pt;">${worker.bankAccount}</strong>
            </div>
            <div style="font-size: 8.5pt; color: #000000;">
              Chủ tài khoản: <strong style="text-transform: uppercase;">${worker.fullName}</strong> — Số tiền: <strong style="color: #15803d; font-family: monospace;">${formatNumberOnly(worker.netSalary)} VNĐ</strong>
            </div>
          </div>
        </div>
        <img src="${qrUrl}" alt="VietQR" style="width: 82px; height: 82px; object-fit: contain; border: 1px solid #1e293b; border-radius: 4px; background: #ffffff; padding: 2px;" />
      </div>`
          : ''
      }

      <!-- 4 Chữ ký xác nhận chuẩn mẫu kế toán xây dựng -->
      <div style="margin-top: 8px; text-align: right; font-style: italic; font-size: 8.5pt; color: #1e293b; font-weight: 600;">
        Tp. Hồ Chí Minh, ngày ${printDay} tháng ${printMonth} năm ${printYear}
      </div>

      <div class="signatures">
        <div>
          <div class="sig-title">Người lập phiếu</div>
          <div class="sig-note">(Ký, họ tên)</div>
          <div class="sig-space"></div>
          <div class="sig-name">Nguyễn Thanh Thúy</div>
        </div>
        <div>
          <div class="sig-title">Tổ trưởng / Chỉ huy</div>
          <div class="sig-note">(Ký, họ tên)</div>
          <div class="sig-space"></div>
          <div class="sig-name">${worker.teamLeader || 'KS. Trần Văn Minh'}</div>
        </div>
        <div>
          <div class="sig-title">Kế toán trưởng / ĐD</div>
          <div class="sig-note">(Ký, đóng dấu)</div>
          <div class="sig-space"></div>
          <div class="sig-name">KTT. Trần Thị Thảo</div>
        </div>
        <div>
          <div class="sig-title">Người nhận tiền</div>
          <div class="sig-note">(Ký, ghi rõ họ tên)</div>
          <div class="sig-space"></div>
          <div class="sig-name">${worker.fullName}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;

  return htmlContent;
}

/**
 * In phiếu thanh toán tiền công thợ thời vụ (Mẫu 03-LĐTL) độc lập, không bị ảnh hưởng bởi modal backdrop.
 * Nhận callback onBlocked khi trình duyệt chặn hộp thoại print do iframe sandbox.
 */
export function printSeasonalWorkerReceipt(
  worker: SeasonalWorker,
  config: CompanyConfig,
  onBlocked?: () => void,
  customPeriodLabel?: string
): void {
  const htmlContent = generateSeasonalWorkerReceiptHTML(worker, config, customPeriodLabel);

  // Tạo iframe in ấn có kích thước thực tế để engine trình duyệt render đầy đủ layout và font chữ
  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.left = '-9999px';
  printFrame.style.top = '0';
  printFrame.style.width = '800px';
  printFrame.style.height = '1120px';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  printFrame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(printFrame);

  const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
  if (!frameDoc) {
    onBlocked?.();
    return;
  }

  frameDoc.open();
  frameDoc.write(htmlContent);
  frameDoc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (e) {
      console.warn('Iframe print error (sandboxed or blocked):', e);
      try {
        window.print();
      } catch (wErr) {
        console.error('Window print blocked by iframe sandbox:', wErr);
        onBlocked?.();
      }
    } finally {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 3000);
    }
  }, 450);
}

/**
 * Mở phiếu thanh toán trong tab mới độc lập để in trực tiếp không bao giờ bị sandbox chặn
 */
export function openSeasonalWorkerReceiptInNewTab(
  worker: SeasonalWorker,
  config: CompanyConfig,
  customPeriodLabel?: string
): boolean {
  const htmlContent = generateSeasonalWorkerReceiptHTML(worker, config, customPeriodLabel);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (newWin) {
    newWin.onload = () => {
      setTimeout(() => {
        try {
          newWin.focus();
          newWin.print();
        } catch (e) {
          console.warn('Auto print in new window:', e);
        }
      }, 400);
    };
    return true;
  }
  return false;
}

/**
 * Tải file HTML phiếu thanh toán để mở và in trên mọi máy tính
 */
export function downloadSeasonalWorkerReceiptHTML(
  worker: SeasonalWorker,
  config: CompanyConfig,
  customPeriodLabel?: string
): void {
  const htmlContent = generateSeasonalWorkerReceiptHTML(worker, config, customPeriodLabel);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Phieu_Thanh_Toan_${worker.code}_${worker.fullName.replace(/\s+/g, '_')}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sinh mã HTML hoàn chỉnh chuẩn A4 ngang cho Bảng kê chi trả & Ký nhận tiền công (Mẫu 02a-LĐTL)
 */
export function generateSeasonalWorkersBatchHTML(
  workers: SeasonalWorker[],
  config: CompanyConfig,
  projectFilter: string = 'ALL',
  periodLabel?: string
): string {
  const targetWorkers = projectFilter === 'ALL' ? workers : workers.filter((w) => w.project === projectFilter);
  const totalNet = targetWorkers.reduce((s, w) => s + w.netSalary, 0);
  const totalDays = targetWorkers.reduce((s, w) => s + w.actualWorkDays, 0);
  const totalOT = targetWorkers.reduce((s, w) => s + w.overtimeHours, 0);

  const displayPeriod = periodLabel || config.period;

  const rowsHtml = targetWorkers
    .map(
      (w, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td style="font-family: monospace; font-weight: bold; text-align: center;">${w.code}</td>
        <td>
          <div style="font-weight: bold;">${w.fullName}</div>
          <div style="font-size: 7.5pt; color: #64748b;">${w.trade}</div>
        </td>
        <td>${w.project}</td>
        <td style="text-align: right; font-family: monospace;">${formatNumberOnly(w.dailyRate)}</td>
        <td style="text-align: center; font-weight: bold; background-color: #f8fafc;">${w.actualWorkDays}</td>
        <td style="text-align: center; color: #b45309;">${w.overtimeHours > 0 ? `${w.overtimeHours}h` : '—'}</td>
        <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatNumberOnly(w.totalIncome)}</td>
        <td style="text-align: right; font-family: monospace; color: #991b1b;">${formatNumberOnly(w.advancePayment)}</td>
        <td style="text-align: right; font-family: monospace; font-weight: bold; color: #15803d; font-size: 8.5pt;">${formatNumberOnly(w.netSalary)}</td>
        <td style="text-align: center; font-size: 7.5pt;">${w.paymentMethod === 'BANK' ? 'Chuyển khoản' : 'Tiền mặt'}</td>
        <td style="height: 34px;"></td>
      </tr>
    `
    )
    .join('');

  return `<!DOCTYPE html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Bang_Ke_Thanh_Toan_Tien_Cong_Thoi_Vu</title>
        <style>
          @page { size: A4 landscape; margin: 8mm 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 8pt; color: #0f172a; margin: 0; padding: 0; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #94a3b8; padding: 4px 6px; }
          th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f3d64; padding-bottom: 6px; margin-bottom: 8px; }
          .title { text-align: center; margin: 6px 0 10px 0; }
          .title h1 { font-size: 13pt; font-weight: 900; text-transform: uppercase; color: #0f3d64; margin: 0; }
          .signatures { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; margin-top: 20px; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div style="font-weight: 900; font-size: 9.5pt; color: #0f3d64; text-transform: uppercase;">${config.name}</div>
            <div style="font-size: 7.5pt; color: #475569;">Địa chỉ: ${config.address} — MST: ${config.taxCode}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: bold; font-size: 8pt;">Mẫu số: 02a-LĐTL</div>
            <div style="font-size: 7.5pt; color: #64748b;">(Bảng thanh toán tiền lương công nhân thời vụ)</div>
          </div>
        </div>

        <div class="title">
          <h1>BẢNG KÊ CHI TRẢ & KÝ NHẬN TIỀN CÔNG NHÂN LỰC THỜI VỤ</h1>
          <p style="font-size: 8.5pt; color: #0f3d64; font-weight: bold; margin: 2px 0 0 0;">
            Kỳ thanh toán: <span style="color: #b45309;">${displayPeriod}</span> — Công trình: <strong>${projectFilter === 'ALL' ? 'Toàn bộ công trình' : projectFilter}</strong>
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 25px;">STT</th>
              <th style="width: 65px;">Mã thợ</th>
              <th style="text-align: left; width: 140px;">Họ tên & Nghề nghiệp</th>
              <th style="text-align: left; width: 130px;">Công trình thi công</th>
              <th style="width: 75px; text-align: right;">Đơn giá/ngày</th>
              <th style="width: 50px;">Công</th>
              <th style="width: 45px;">OT (h)</th>
              <th style="width: 80px; text-align: right;">Tổng thu nhập</th>
              <th style="width: 75px; text-align: right;">Tạm ứng</th>
              <th style="width: 90px; text-align: right;">Thực lĩnh (đ)</th>
              <th style="width: 75px;">Hình thức</th>
              <th style="width: 90px;">Ký nhận</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td colspan="5" style="text-align: right; text-transform: uppercase;">TỔNG CỘNG:</td>
              <td style="text-align: center;">${totalDays}</td>
              <td style="text-align: center; color: #b45309;">${totalOT}h</td>
              <td colspan="2"></td>
              <td style="text-align: right; color: #15803d; font-size: 9pt;">${formatNumberOnly(totalNet)} đ</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 8px; font-style: italic; font-size: 8pt;">
          Tổng số tiền chi trả bằng chữ: <strong>${numberToVietnameseWords(totalNet)}</strong>
        </div>

        <div class="signatures">
          <div>
            <div style="font-weight: bold;">Người lập biểu</div>
            <div style="font-style: italic; font-size: 7pt; color: #64748b;">(Ký, họ tên)</div>
            <div style="height: 45px;"></div>
            <div style="font-weight: bold;">Kế toán tiền lương</div>
          </div>
          <div>
            <div style="font-weight: bold;">Chỉ huy trưởng công trường</div>
            <div style="font-style: italic; font-size: 7pt; color: #64748b;">(Ký, họ tên)</div>
            <div style="height: 45px;"></div>
            <div style="font-weight: bold;">KS. Trần Văn Minh</div>
          </div>
          <div>
            <div style="font-weight: bold;">Kế toán trưởng</div>
            <div style="font-style: italic; font-size: 7pt; color: #64748b;">(Ký, họ tên)</div>
            <div style="height: 45px;"></div>
            <div style="font-weight: bold;">KTT. Trần Thị Thảo</div>
          </div>
          <div>
            <div style="font-weight: bold;">Giám đốc phê duyệt</div>
            <div style="font-style: italic; font-size: 7pt; color: #64748b;">(Ký, đóng dấu)</div>
            <div style="height: 45px;"></div>
            <div style="font-weight: bold;">GĐ. Phúc Nguyên</div>
          </div>
        </div>
      </body>
    </html>`;
}

/**
 * In Bảng kê thanh toán tiền công tất cả thợ tại công trình (Bảng tổng hợp ký nhận)
 * Hỗ trợ callback onBlocked khi sandbox chặn in.
 */
export function printSeasonalWorkersBatchPayroll(
  workers: SeasonalWorker[],
  config: CompanyConfig,
  projectFilter: string = 'ALL',
  onBlocked?: () => void,
  periodLabel?: string
): void {
  const htmlContent = generateSeasonalWorkersBatchHTML(workers, config, projectFilter, periodLabel);

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.left = '-9999px';
  printFrame.style.top = '0';
  printFrame.style.width = '297mm';
  printFrame.style.height = '210mm';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  printFrame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(printFrame);

  const frameDoc = printFrame.contentWindow?.document || printFrame.contentDocument;
  if (!frameDoc) {
    onBlocked?.();
    return;
  }

  frameDoc.open();
  frameDoc.write(htmlContent);
  frameDoc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch (e) {
      console.warn('Batch iframe print error:', e);
      try {
        window.print();
      } catch (wErr) {
        console.error('Window print blocked by iframe sandbox:', wErr);
        onBlocked?.();
      }
    } finally {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 3000);
    }
  }, 450);
}

/**
 * Mở Bảng kê chi trả tiền công trong tab mới để in trực tiếp
 */
export function openSeasonalWorkersBatchInNewTab(
  workers: SeasonalWorker[],
  config: CompanyConfig,
  projectFilter: string = 'ALL',
  periodLabel?: string
): boolean {
  const htmlContent = generateSeasonalWorkersBatchHTML(workers, config, projectFilter, periodLabel);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const newWin = window.open(url, '_blank');
  if (newWin) {
    newWin.onload = () => {
      setTimeout(() => {
        try {
          newWin.focus();
          newWin.print();
        } catch (e) {
          console.warn('Auto print batch in new window:', e);
        }
      }, 400);
    };
    return true;
  }
  return false;
}

/**
 * Tải file HTML Bảng kê chi trả tiền công
 */
export function downloadSeasonalWorkersBatchHTML(
  workers: SeasonalWorker[],
  config: CompanyConfig,
  projectFilter: string = 'ALL',
  periodLabel?: string
): void {
  const htmlContent = generateSeasonalWorkersBatchHTML(workers, config, projectFilter, periodLabel);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bang_Ke_Thanh_Toan_Tien_Cong_${config.periodCode?.replace('/', '_') || 'Thoi_Vu'}.html`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
