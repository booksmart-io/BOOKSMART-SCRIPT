import { Input } from "@/components/ui/input";
import { formatUsPhoneNumber, isValidUsPhone } from "@/lib/phone-validation";
import { cn } from "@/lib/utils";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "onChange" | "type" | "value"> & {
  value: string;
  onChange: (value: string) => void;
  showError?: boolean;
};

export function PhoneInput({ value, onChange, showError = true, className, id, ...props }: PhoneInputProps) {
  const formattedValue = formatUsPhoneNumber(value);
  const invalid = showError && formattedValue.length > 0 && !isValidUsPhone(formattedValue);
  const errorId = id ? `${id}-error` : undefined;

  return (
    <>
      <Input
        {...props}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        maxLength={14}
        placeholder="(555) 123-4567"
        value={formattedValue}
        onChange={(event) => onChange(formatUsPhoneNumber(event.target.value))}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : props["aria-describedby"]}
        className={cn(invalid && "border-destructive focus-visible:ring-destructive", className)}
      />
      {invalid && <p id={errorId} className="text-sm text-destructive">Enter a valid 10-digit U.S. phone number.</p>}
    </>
  );
}
