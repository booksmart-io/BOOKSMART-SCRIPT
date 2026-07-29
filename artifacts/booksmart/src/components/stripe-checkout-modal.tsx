import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
export const embeddedCheckoutAvailable = Boolean(publishableKey);
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type StripeCheckoutModalProps = {
  clientSecret: string | null;
  title: string;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
};

export function StripeCheckoutModal({
  clientSecret,
  title,
  onClose,
  onComplete,
}: StripeCheckoutModalProps) {
  const open = Boolean(clientSecret && stripePromise);

  return (
    <Dialog
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
    >
      <DialogContent className="max-w-3xl overflow-y-auto p-3 sm:p-5">
        <DialogHeader className="px-2 pt-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Payment details are securely collected by Stripe.
          </DialogDescription>
        </DialogHeader>
        {clientSecret && stripePromise && (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret, onComplete }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
