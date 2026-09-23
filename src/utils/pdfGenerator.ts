import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * Xuất 1 phần tử HTML (Phiếu Lương) thành file .PDF chuẩn A4 sắc nét
 */
export async function exportPayslipToPDF(
  element: HTMLElement,
  fileName: string = 'Phieu_Luong.pdf',
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Đang kết xuất tài liệu sang PDF chuẩn A4...');

  // Clone phần tử ra một container ngầm với kích thước chuẩn 800px
  // để tránh bị ảnh hưởng bởi zoom scale của giao diện người dùng
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-1000';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.margin = '0';
  clone.style.width = '800px';
  clone.style.maxWidth = '800px';
  clone.style.boxShadow = 'none';
  clone.style.border = '1px solid #cbd5e1';

  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(clone, {
        scale: 2.2, // 2.2x scale cho độ nét cao trên trang A4
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 800,
        imageTimeout: 6000,
      });
    } catch (cErr) {
      console.warn('html2canvas with images failed, retrying without external images:', cErr);
      // Thay thế ảnh bị lỗi bằng placeholder để không làm gián đoạn việc xuất PDF
      const images = clone.querySelectorAll('img');
      images.forEach((img) => {
        img.style.display = 'none';
      });
      canvas = await html2canvas(clone, {
        scale: 2.0,
        useCORS: false,
        logging: false,
        backgroundColor: '#ffffff',
        width: 800,
      });
    }

    onProgress?.('Đang tạo tệp PDF A4...');

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    // Kích thước chuẩn A4: 210mm x 297mm
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = 210;
    const pageHeight = 297;
    // Lề 8mm hai bên, 6mm trên dưới để tối đa hóa không gian in chuẩn A4
    const marginX = 8;
    const marginY = 6;
    const maxContentWidth = pageWidth - marginX * 2; // 194mm
    const maxContentHeight = pageHeight - marginY * 2; // 285mm

    const imgRatio = canvas.width / canvas.height;

    // Tính toán chiều rộng & chiều cao vẽ: vừa khít vào 1 trang A4 duy nhất
    let renderWidth = maxContentWidth;
    let renderHeight = renderWidth / imgRatio;

    // Nếu chiều cao vượt quá 1 trang A4, tự động co tỷ lệ để luôn luôn nằm gọn trong 1 trang duy nhất
    if (renderHeight > maxContentHeight) {
      renderHeight = maxContentHeight;
      renderWidth = renderHeight * imgRatio;
    }

    // Căn giữa theo cả 2 trục
    const posX = marginX + (maxContentWidth - renderWidth) / 2;
    const posY = marginY + (maxContentHeight - renderHeight) / 2;

    // Chỉ vẽ trên 1 trang duy nhất, tuyệt đối không tách trang thứ 2
    pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');

    pdf.save(fileName);
    onProgress?.('✓ Đã tải file PDF thành công (gọn gàng trong 1 trang A4)!');
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * Xuất hàng loạt phiếu lương vào 1 file PDF duy nhất (Mỗi nhân viên 1 trang A4)
 */
export async function exportBatchPayslipsToPDF(
  elements: HTMLElement[],
  fileName: string = 'Tong_Hop_Phieu_Luong.pdf',
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  if (elements.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 8;
  const marginY = 6;
  const maxContentWidth = pageWidth - marginX * 2;
  const maxContentHeight = pageHeight - marginY * 2;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.zIndex = '-1000';
  document.body.appendChild(container);

  try {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      onProgress?.(i + 1, elements.length);

      container.innerHTML = '';
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.width = '800px';
      clone.style.maxWidth = '800px';
      clone.style.boxShadow = 'none';
      clone.style.border = '1px solid #cbd5e1';
      container.appendChild(clone);

      const canvas = await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: 800,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgRatio = canvas.width / canvas.height;

      let renderWidth = maxContentWidth;
      let renderHeight = renderWidth / imgRatio;

      if (renderHeight > maxContentHeight) {
        renderHeight = maxContentHeight;
        renderWidth = renderHeight * imgRatio;
      }

      const posX = marginX + (maxContentWidth - renderWidth) / 2;
      const posY = marginY + (maxContentHeight - renderHeight) / 2;

      if (i > 0) {
        pdf.addPage();
      }

      pdf.addImage(imgData, 'JPEG', posX, posY, renderWidth, renderHeight, undefined, 'FAST');
    }

    pdf.save(fileName);
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

/**
 * In trực tiếp phiếu lương qua iframe cách ly chuẩn A4, không bị dính giao diện hệ thống
 */
export function printElementDirectly(element: HTMLElement, docTitle: string = 'In Phiếu Lương'): void {
  const printIframe = document.createElement('iframe');
  printIframe.style.position = 'fixed';
  printIframe.style.right = '0';
  printIframe.style.bottom = '0';
  printIframe.style.width = '0';
  printIframe.style.height = '0';
  printIframe.style.border = '0';

  document.body.appendChild(printIframe);

  const iframeDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
  if (!iframeDoc) {
    window.print();
    return;
  }

  // Thu thập toàn bộ CSS stylesheet
  const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((s) => s.outerHTML)
    .join('\n');

  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>${docTitle}</title>
      ${styleTags}
      <style>
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        body {
          margin: 0;
          padding: 0;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .print-container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }
        .print-container * {
          transform: none !important;
        }
        .printable-payslip {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          box-shadow: none !important;
        }
      </style>
    </head>
    <body>
      <div class="print-container">
        ${element.outerHTML}
      </div>
    </body>
    </html>
  `);
  iframeDoc.close();

  setTimeout(() => {
    try {
      printIframe.contentWindow?.focus();
      printIframe.contentWindow?.print();
    } catch (e) {
      console.warn('Lỗi in iframe, chuyển sang in thông thường:', e);
      window.print();
    } finally {
      setTimeout(() => {
        if (document.body.contains(printIframe)) {
          document.body.removeChild(printIframe);
        }
      }, 2000);
    }
  }, 400);
}
