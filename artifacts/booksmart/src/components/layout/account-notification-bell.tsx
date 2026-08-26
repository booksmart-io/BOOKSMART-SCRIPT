import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, CircleDollarSign, ClipboardCheck, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";
import { loadAccountNotifications } from "@/lib/account-notifications";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ActivityNotification = {
  id: number;
  event_type: string;
  title: string;
  description: string;
  amount: number | null;
  route: string | null;
  read_at: string | null;
  created_at: string;
};
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AccountNotificationBell({ allowNavigation }: { allowNavigation: (target: string) => boolean }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["account-notifications"],
    queryFn: loadAccountNotifications,
    retry: false,
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await authenticatedApi("/api/notifications/read", { method: "PATCH", body: JSON.stringify({ ids }) });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update notifications."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account-notifications"] }),
  });
  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unread_count ?? 0;

  const openNotification = (notification: ActivityNotification) => {
    if (!notification.read_at) read.mutate([notification.id]);
    if (notification.route && allowNavigation(notification.route)) navigate(notification.route);
  };

  return <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="icon" className="relative rounded-full text-muted-foreground hover:text-primary" aria-label={`${unreadCount} unread account notifications`}>
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && <span className="absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-[min(92vw,390px)] p-0">
      <div className="flex items-center justify-between border-b p-4">
        <div><p className="font-semibold">Account activity</p><p className="text-xs text-muted-foreground">Transactions, tasks, and job costs</p></div>
        {unreadCount > 0 && <Button variant="ghost" size="sm" disabled={read.isPending} onClick={() => read.mutate([])}><CheckCheck className="mr-1.5 h-4 w-4" />Mark all read</Button>}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {query.isLoading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading activity…</div>
          : query.isError ? <div className="p-6 text-sm text-muted-foreground">Account activity is temporarily unavailable.</div>
          : notifications.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No account activity yet.</div>
          : notifications.map(notification => {
            const TransactionIcon = notification.event_type.startsWith("job_cost") ? ClipboardCheck : CircleDollarSign;
            return <button key={notification.id} type="button" onClick={() => openNotification(notification)} className={`flex w-full gap-3 border-b p-4 text-left transition-colors last:border-b-0 hover:bg-muted/50 ${notification.read_at ? "opacity-70" : "bg-primary/[0.04]"}`}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${notification.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}><TransactionIcon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="font-medium">{notification.title}</span>{!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{notification.description}</span><span className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{new Date(notification.created_at).toLocaleString()}</span>{notification.amount != null && <span className="font-medium tabular-nums">{money.format(Math.abs(notification.amount))}</span>}</span></span>
            </button>;
          })}
      </div>
    </PopoverContent>
  </Popover>;
}
