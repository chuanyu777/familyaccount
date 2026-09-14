/**
 * 金额转换工具。
 * 内部存储一律为整数「分」(cents)，对外 JSON 用两位小数字符串元。
 * 转换刻意走字符串解析，规避 0.1 * 100 这类浮点误差。
 */

const AMOUNT_RE = /^-?\d+(\.\d+)?$/;

/**
 * 元 -> 整数分。四舍五入到分，规避浮点误差。
 * 非法输入（NaN、空串、非数字串、null/undefined）抛错。
 * 负数返回负分。
 */
export function toCents(input: number | string): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new Error('INVALID_AMOUNT');
    }
    return toCents(String(input));
  }

  if (typeof input !== 'string') {
    throw new Error('INVALID_AMOUNT');
  }

  const s = input.trim();
  if (s === '' || !AMOUNT_RE.test(s)) {
    throw new Error('INVALID_AMOUNT');
  }

  const negative = s.startsWith('-');
  const abs = negative ? s.slice(1) : s;
  const dotIdx = abs.indexOf('.');
  const intPart = dotIdx === -1 ? abs : abs.slice(0, dotIdx);
  const fracPart = dotIdx === -1 ? '' : abs.slice(dotIdx + 1);

  const intVal = parseInt(intPart, 10);
  const d1 = fracPart[0] ? parseInt(fracPart[0]!, 10) : 0;
  const d2 = fracPart[1] ? parseInt(fracPart[1]!, 10) : 0;
  const d3 = fracPart[2] ? parseInt(fracPart[2]!, 10) : 0;

  let cents = intVal * 100 + d1 * 10 + d2;
  // 第 3 位小数 >= 5 即进位（四舍五入，含 5 后有更多有效数字的情况）。
  if (d3 >= 5) {
    cents += 1;
  }

  return negative ? -cents : cents;
}

/**
 * 整数分 -> 两位小数字符串元。例如 -5 -> "-0.05"，1234 -> "12.34"。
 */
export function toYuanString(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error('INVALID_CENTS');
  }
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const yuan = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = `${yuan}.${rem.toString().padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}
