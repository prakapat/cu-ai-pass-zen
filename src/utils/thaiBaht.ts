/**
 * Utility to convert numeric numbers into Thai Baht text format
 * e.g., 528700 -> "ห้าแสนสองหมื่นแปดพันเจ็ดร้อยบาทถ้วน"
 */

export function arabicToThaiBahtText(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'ศูนย์บาทถ้วน';

  const thaiNums = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const thaiUnits = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  const integerPart = Math.floor(Math.abs(amount));
  const numStr = integerPart.toString();
  const len = numStr.length;

  let result = '';
  for (let i = 0; i < len; i++) {
    const digit = parseInt(numStr[i], 10);
    const pos = len - i - 1;

    if (digit !== 0) {
      if (pos % 6 === 1 && digit === 1) {
        result += ''; // สิบ
      } else if (pos % 6 === 1 && digit === 2) {
        result += 'ยี่'; // ยี่สิบ
      } else if (pos % 6 === 0 && digit === 1 && len > 1 && result.length > 0 && i > 0) {
        result += 'เอ็ด';
      } else {
        result += thaiNums[digit];
      }

      result += thaiUnits[pos % 6];
    }

    if (pos % 6 === 0 && pos > 0) {
      result += 'ล้าน';
    }
  }

  return result + 'บาทถ้วน';
}
