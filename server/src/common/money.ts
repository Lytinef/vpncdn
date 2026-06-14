/** Утилиты для работы с деньгами. Внутри всё в копейках (целые числа). */

export const rublesToKopecks = (rubles: number): number => Math.round(rubles * 100);

export const kopecksToRubles = (kopecks: number): number => kopecks / 100;

/** Формат суммы для YooKassa: { value: "149.00", currency: "RUB" }. */
export const toYookassaAmount = (kopecks: number, currency = 'RUB') => ({
  value: (kopecks / 100).toFixed(2),
  currency,
});
