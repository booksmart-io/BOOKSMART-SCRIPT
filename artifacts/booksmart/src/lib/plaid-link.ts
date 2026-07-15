type PlaidMetadata = {
  institution?: {
    name?: string;
    institution_id?: string;
  };
  accounts?: Array<{
    id?: string;
    account_id: string;
    name?: string;
    official_name?: string | null;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
  }>;
  [key: string]: unknown;
};

type PlaidHandler = {
  open: () => void;
  exit: () => void;
};

type PlaidCreateConfig = {
  token: string;
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void | Promise<void>;
  onExit?: (error: { error_message?: string } | null, metadata: PlaidMetadata) => void;
};

declare global {
  interface Window {
    Plaid?: {
      create: (config: PlaidCreateConfig) => PlaidHandler;
    };
  }
}

let plaidScriptPromise: Promise<void> | null = null;

export function loadPlaidLink(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  if (plaidScriptPromise) return plaidScriptPromise;

  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-plaid-link]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Plaid Link")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Plaid Link"));
    document.head.appendChild(script);
  });

  return plaidScriptPromise;
}

export async function openPlaidLink(config: PlaidCreateConfig): Promise<void> {
  await loadPlaidLink();
  if (!window.Plaid) throw new Error("Plaid Link is unavailable");
  window.Plaid.create(config).open();
}
