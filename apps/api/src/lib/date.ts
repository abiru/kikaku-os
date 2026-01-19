const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const ensureDate = (value: string) => {
  if (!dateRegex.test(value)) return null;
  return value;
};

export const jstDateStringFromMs = (nowMs = Date.now()) => {
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  return jstNow.toISOString().slice(0, 10);
};

export const jstYesterdayStringFromMs = (nowMs = Date.now()) => {
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  jstNow.setUTCDate(jstNow.getUTCDate() - 1);
  return jstNow.toISOString().slice(0, 10);
};

export const buildJstToday = (nowMs = Date.now()) => {
  return jstDateStringFromMs(nowMs);
};

export const buildJstWeekStart = (nowMs = Date.now()) => {
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  const day = jstNow.getUTCDay();
  // Monday = day 1, so we go back (day - 1) days for Monday, or 6 if Sunday
  const daysToMonday = day === 0 ? 6 : day - 1;
  jstNow.setUTCDate(jstNow.getUTCDate() - daysToMonday);
  return jstNow.toISOString().slice(0, 10);
};
