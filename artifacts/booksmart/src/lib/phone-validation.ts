export function isValidUsPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

  // NANP numbers have ten digits and neither the area code nor exchange can
  // begin with 0 or 1.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}

export function formatUsPhoneNumber(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
