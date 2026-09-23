/**
 * Chuyển đổi số tiền thành chữ tiếng Việt chuẩn xác theo quy định kế toán Việt Nam.
 * Ví dụ: 19.545.288 -> Mười chín triệu năm trăm bốn mươi lăm nghìn hai trăm tám mươi tám đồng chẵn
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readGroup(group: number, showZeroHundred: boolean): string {
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor((group % 100) / 10);
  const units = group % 10;
  let result = '';

  if (hundreds > 0 || showZeroHundred) {
    result += DIGITS[hundreds] + ' trăm ';
  }

  if (tens > 1) {
    result += DIGITS[tens] + ' mươi ';
    if (units === 1) {
      result += 'mốt ';
    } else if (units === 5) {
      result += 'lăm ';
    } else if (units > 0) {
      result += DIGITS[units] + ' ';
    }
  } else if (tens === 1) {
    result += 'mười ';
    if (units === 5) {
      result += 'lăm ';
    } else if (units > 0) {
      result += DIGITS[units] + ' ';
    }
  } else if (tens === 0) {
    if (units > 0) {
      if (hundreds > 0 || showZeroHundred) {
        result += 'lẻ ' + DIGITS[units] + ' ';
      } else {
        result += DIGITS[units] + ' ';
      }
    }
  }

  return result.trim();
}

export function numberToVietnameseWords(amount: number): string {
  if (isNaN(amount) || amount === 0) {
    return 'Không đồng chẵn';
  }

  const isNegative = amount < 0;
  let absAmount = Math.round(Math.abs(amount));

  if (absAmount === 0) {
    return 'Không đồng chẵn';
  }

  const unitsScale = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];

  while (absAmount > 0) {
    groups.push(absAmount % 1000);
    absAmount = Math.floor(absAmount / 1000);
  }

  let words = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group > 0) {
      const showZeroHundred = i < groups.length - 1;
      const groupText = readGroup(group, showZeroHundred);
      words += groupText + ' ' + unitsScale[i] + ' ';
    }
  }

  words = words.trim() + ' đồng chẵn';

  // Capitalize first letter
  words = words.charAt(0).toUpperCase() + words.slice(1);

  if (isNegative) {
    words = 'Âm ' + words.charAt(0).toLowerCase() + words.slice(1);
  }

  return words;
}

export function formatVND(amount: number): string {
  if (isNaN(amount)) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount)) + ' đ';
}

export function formatNumberOnly(amount: number): string {
  if (isNaN(amount)) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}
