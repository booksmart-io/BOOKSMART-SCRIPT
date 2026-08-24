export function manualTransactionDate(selectedDate: string, now = new Date()) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]) - 1;
  const day = Number(parts[3]);
  const selected = new Date(year, month, day, 12, 0, 0, 0);
  if (Number.isNaN(selected.getTime()) || selected.getFullYear() !== year || selected.getMonth() !== month || selected.getDate() !== day) return null;
  const isToday = year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
  return isToday ? new Date(now) : selected;
}

export function inclusiveLocalDayEnd(now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}
