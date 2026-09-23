import { Employee, CompanyConfig, ZaloOAConfig } from '../types';
import { formatVND, numberToVietnameseWords } from '../utils/numberToVietnameseWords';

export interface ZaloSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
  mode: 'ZNS' | 'OA_MESSAGE' | 'SANDBOX';
  sentAt: string;
  recipientPhone: string;
  recipientName: string;
  details?: any;
}

// Chuyển đổi số điện thoại Việt Nam sang định dạng quốc tế 84xxxxxxxxx cho Zalo ZNS
export function formatPhoneForZalo(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('84')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `84${digits.slice(1)}`;
  }
  return `84${digits}`;
}

// Xây dựng template_data chuẩn cho mẫu ZNS thông báo lương
export function buildZNSPayrollData(employee: Employee, config: CompanyConfig) {
  return {
    ten_nhan_vien: employee.fullName,
    ma_nhan_vien: employee.code,
    chuc_danh: employee.title,
    bo_phan: employee.department,
    ky_luong: config.periodCode || `${config.month}/${config.year}`,
    ngay_cong: `${employee.actualWorkDays}/${employee.standardWorkDays} ngày`,
    gio_tang_ca: `${employee.overtimeHours || 0} giờ`,
    tong_thu_nhap: formatVND(employee.totalIncome),
    tong_khau_tru: formatVND(employee.totalDeductions),
    luong_thuc_nhan: formatVND(employee.netSalary),
    bang_chu: numberToVietnameseWords(employee.netSalary),
    so_tai_khoan: employee.bankAccount ? `${employee.bankAccount} (${employee.bankName || 'Ngân hàng'})` : 'Tiền mặt',
    ngay_chi_tra: config.paymentDate,
    ten_cong_ty: config.name,
  };
}

// Tạo tin nhắn định dạng văn bản cho Zalo OA Chat
export function buildZaloOATextMessage(employee: Employee, config: CompanyConfig): string {
  return `🔔 [THÔNG BÁO PHIẾU LƯƠNG TỪ ZALO OA]
🏢 ${config.name}
Kính gửi: ${employee.fullName} (${employee.code})
Chức vụ: ${employee.title} - ${employee.department}
----------------------------------------
Kỳ lương: ${config.periodCode || `${config.month}/${config.year}`}

💰 THỰC LĨNH CHUYỂN KHOẢN: ${formatVND(employee.netSalary)}
(Bằng chữ: ${numberToVietnameseWords(employee.netSalary)})

📋 CHI TIẾT CÔNG TÁC & THU NHẬP:
• Ngày công: ${employee.actualWorkDays}/${employee.standardWorkDays} ngày
• Làm thêm (OT): ${employee.overtimeHours || 0} giờ
• Lương theo công: ${formatVND(employee.salaryByActualDays)}
• Phụ cấp: ${formatVND((employee.mealAllowance || 0) + (employee.phoneTravelAllowance || 0) + (employee.responsibilityAllowance || 0) + (employee.projectAllowance || 0))}
• Tiền làm thêm giờ (OT): ${formatVND(employee.overtimePay || 0)}
• Thưởng / Khác: ${formatVND((employee.kpiBonus || 0) + (employee.otherIncome || 0))}
=> TỔNG THU NHẬP: ${formatVND(employee.totalIncome)}

📉 CÁC KHOẢN KHẤU TRỪ:
• Bảo hiểm (10.5%): ${formatVND(employee.totalInsurance)}
• Đoàn phí: ${formatVND(employee.unionFee || 0)}
• Tạm ứng: ${formatVND(employee.advancePayment || 0)}
=> TỔNG KHẤU TRỪ: ${formatVND(employee.totalDeductions)}

🏦 TÀI KHOẢN NHẬN TIỀN:
• Số TK: ${employee.bankAccount || 'Đang cập nhật'}
• Ngân hàng: ${employee.bankName || 'Ngân hàng'}
• Ngày thanh toán: ${config.paymentDate}
----------------------------------------
Mọi thắc mắc xin phản hồi trực tiếp tới Zalo OA này hoặc liên hệ Phòng Kế toán Phúc Nguyên.
Chúc anh/chị luôn an toàn và hoàn thành tốt công việc!`;
}

// Bảng giải mã mã lỗi chính thức từ Zalo
export function interpretZaloErrorCode(code: number): string {
  switch (code) {
    case 0:
      return 'Gửi tin thành công';
    case -124:
      return 'Access Token không hợp lệ hoặc đã hết hạn. Vui lòng cấp lại Token tại developers.zalo.me.';
    case -201:
      return 'Dữ liệu template_data không khớp với mẫu ZNS đã đăng ký trên ZCA.';
    case -204:
      return 'Template ID không tồn tại hoặc chưa được Zalo phê duyệt.';
    case -213:
      return 'Người dùng chưa kích hoạt hoặc không nhận thông báo ZNS.';
    case -214:
      return 'Tài khoản ZCA của công ty không đủ số dư để gửi tin ZNS.';
    case -216:
      return 'Số điện thoại này chưa đăng ký tài khoản Zalo.';
    case -232:
      return 'Người dùng đã tắt nhận thông báo từ Zalo OA này.';
    case -300:
      return 'Zalo OA chưa được xác thực tích vàng hoặc đang bị khóa.';
    default:
      return `Mã phản hồi từ Zalo: ${code}`;
  }
}

// Hàm gửi phiếu lương tự động qua Zalo OA
export async function sendPayslipViaZaloOA(
  employee: Employee,
  config: CompanyConfig,
  zaloConfig?: ZaloOAConfig
): Promise<ZaloSendResult> {
  const currentConfig: ZaloOAConfig = zaloConfig || config.zaloOA || {
    enabled: true,
    oaId: '22839482749281729',
    oaName: config.name,
    appId: '',
    secretKey: '',
    accessToken: '',
    templateId: '312891',
    sendMode: 'ZNS',
    isSandbox: true,
  };

  const phone = employee.phone ? formatPhoneForZalo(employee.phone) : '';
  const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (!phone) {
    return {
      success: false,
      error: 'Nhân viên chưa có số điện thoại trong hồ sơ!',
      mode: currentConfig.sendMode,
      sentAt: now,
      recipientPhone: employee.phone || 'Chưa có',
      recipientName: employee.fullName,
    };
  }

  // 1. Chế độ Thử nghiệm / Sandbox (Hoặc khi chưa nhập Access Token chính thức từ Zalo)
  if (currentConfig.isSandbox || !currentConfig.accessToken?.trim()) {
    // Giả lập thời gian kết nối đến máy chủ Zalo OA
    await new Promise((resolve) => setTimeout(resolve, 800));

    const mockMsgId = `ZNS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    return {
      success: true,
      messageId: mockMsgId,
      mode: 'SANDBOX',
      sentAt: now,
      recipientPhone: phone,
      recipientName: employee.fullName,
      details: {
        templateId: currentConfig.templateId || '312891',
        data: buildZNSPayrollData(employee, config),
        note: 'Đã giả lập gửi thành công từ Zalo OA (Chế độ Sandbox). Khi điền Access Token chính thức, hệ thống sẽ gọi trực tiếp máy chủ Zalo.',
      },
    };
  }

  // 2. Chế độ gọi API Zalo chính thức (ZNS API)
  if (currentConfig.sendMode === 'ZNS') {
    const templateData = buildZNSPayrollData(employee, config);
    const payload = {
      phone,
      template_id: currentConfig.templateId || '312891',
      template_data: templateData,
      tracking_id: `PNCONS_${employee.code}_${config.periodCode?.replace('/', '_') || Date.now()}`,
    };

    try {
      const response = await fetch('https://business.openapi.zalo.me/message/template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: currentConfig.accessToken.trim(),
        },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json();

      if (resJson.error === 0) {
        return {
          success: true,
          messageId: resJson.data?.msg_id || `ZNS_${Date.now()}`,
          mode: 'ZNS',
          sentAt: now,
          recipientPhone: phone,
          recipientName: employee.fullName,
          details: resJson,
        };
      } else {
        return {
          success: false,
          errorCode: resJson.error,
          error: interpretZaloErrorCode(resJson.error) || resJson.message,
          mode: 'ZNS',
          sentAt: now,
          recipientPhone: phone,
          recipientName: employee.fullName,
          details: resJson,
        };
      }
    } catch (err: any) {
      // Trường hợp trình duyệt chặn CORS khi gọi trực tiếp từ client
      return {
        success: false,
        error: `Trình duyệt chặn kết nối trực tiếp (CORS). Bạn có thể dùng tính năng mở Zalo chat hoặc cấu hình Proxy/Webhook Zalo. Chi tiết: ${err.message}`,
        mode: 'ZNS',
        sentAt: now,
        recipientPhone: phone,
        recipientName: employee.fullName,
      };
    }
  }

  // 3. Chế độ gửi Tin nhắn Zalo OA thường (Dành cho người theo dõi OA)
  try {
    const messageText = buildZaloOATextMessage(employee, config);
    const payload = {
      recipient: {
        user_id: phone, // hoặc user_id theo dõi OA
      },
      message: {
        text: messageText,
      },
    };

    const response = await fetch('https://openapi.zalo.me/v3.0/oa/message/transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: currentConfig.accessToken.trim(),
      },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json();
    if (resJson.error === 0) {
      return {
        success: true,
        messageId: resJson.data?.message_id || `MSG_${Date.now()}`,
        mode: 'OA_MESSAGE',
        sentAt: now,
        recipientPhone: phone,
        recipientName: employee.fullName,
        details: resJson,
      };
    } else {
      return {
        success: false,
        errorCode: resJson.error,
        error: interpretZaloErrorCode(resJson.error) || resJson.message,
        mode: 'OA_MESSAGE',
        sentAt: now,
        recipientPhone: phone,
        recipientName: employee.fullName,
        details: resJson,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: `Lỗi kết nối Zalo OA: ${err.message}`,
      mode: 'OA_MESSAGE',
      sentAt: now,
      recipientPhone: phone,
      recipientName: employee.fullName,
    };
  }
}
