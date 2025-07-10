import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Sidebar, SidebarContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Gem, Copy, Scissors, MapPin, Coins, MessageSquare, Globe,
  Settings, User, LogOut, DollarSign, ShieldCheck, Tags, Briefcase, Users,
  Sun, Moon, Bell, ArrowLeftRight, ShoppingBag,
  UserPlus, TrendingUp, Inbox, FolderOpen, BarChart2, Lightbulb,
  LayoutTemplate, HelpCircle, ChevronRight, Link as LinkIcon,
} from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "user" | "cpa" | "admin";
}

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const [location, navigate] = useLocation();
  const { signOut, profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const unreadCount = useUnreadCount();

  const firstName = (profile as any)?.first_name || profile?.email?.split("@")[0] || "";
  const lastName = (profile as any)?.last_name || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || profile?.email || "User";

  const navConfig = {
    user: {
      main: [
        { title: "Switch Organization", url: "/user/organizations", icon: ArrowLeftRight },
        { title: "Dashboard",           url: "/user",               icon: LayoutDashboard },
        { title: "AI Strategy",         url: "/user/ai-strategy",   icon: Gem },
        { title: "Financial Reports",   url: "/user/reports",       icon: Copy },
        { title: "Tax Filing",          url: "/user/tax",           icon: Scissors },
        { title: "CPA Network",         url: "/user/cpa-network",   icon: MapPin },
        { title: "Tokens",              url: "/user/token",         icon: Coins },
        { title: "Chat",                url: "/user/chat",          icon: MessageSquare, badge: "unread" },
        { title: "AI Chat",             url: "/user/ai-chat",       icon: Globe },
      ],
      bottom: [
        { title: "Settings", url: "/user/settings", icon: Settings },
        { title: "Profile",  url: "/user/profile",  icon: User },
      ],
    },
    cpa: {
      main: [
        { title: "Dashboard",        url: "/cpa",                icon: LayoutDashboard },
        { title: "My Clients",       url: "/cpa/clients",        icon: Users },
        { title: "Referrals",        url: "/cpa/referrals",      icon: UserPlus,       badge: "new" },
        { title: "Client Progress",  url: "/cpa/leads",          icon: TrendingUp },
        { title: "Requests",         url: "/cpa/orders",         icon: Inbox,          badge: "requests" },
        { title: "Documents",        url: "/cpa/documents",      icon: FolderOpen },
        { title: "Reports",          url: "/cpa/earnings",       icon: BarChart2 },
        { title: "Insights",         url: "/cpa/insights",       icon: Lightbulb },
        { title: "Messages",         url: "/cpa/chat",           icon: MessageSquare,  badge: "unread" },
        { title: "Templates",        url: "/cpa/templates",      icon: LayoutTemplate },
        { title: "Settings",         url: "/cpa/settings",       icon: Settings },
      ],
      bottom: [] as { title: string; url: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }> }[],
    },
    admin: {
      main: [
        { title: "Dashboard",      url: "/admin",                  icon: LayoutDashboard },
        { title: "Users",          url: "/admin/users",            icon: Users },
        { title: "CPAs",           url: "/admin/cpas",             icon: Briefcase },
        { title: "Categories",     url: "/admin/categories",       icon: Tags },
        { title: "Tax Deductions", url: "/admin/tax-deductions",   icon: ShieldCheck },
        { title: "Chat",           url: "/admin/chat",             icon: MessageSquare, badge: "unread" },
      ],
      bottom: [
        { title: "Settings", url: "/admin/settings", icon: Settings },
      ],
    },
  };

  const items = navConfig[role].main;
  const bottomItems = navConfig[role].bottom;

  const isActive = (url: string) =>
    url === "/user" || url === "/cpa" || url === "/admin"
      ? location === url
      : location === url || location.startsWith(url + "/");

  const getBadge = (badge?: string) => {
    if (!badge) return null;
    if (badge === "unread") return unreadCount > 0 ? unreadCount : null;
    if (badge === "new") return "new";
    if (badge === "requests") return 12;
    return null;
  };

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">

        {/* ── Sidebar ── */}
        <Sidebar className="border-r-0" style={{ background: "hsl(var(--sidebar))" }}>
          <SidebarContent className="flex flex-col h-full" style={{ background: "hsl(var(--sidebar))" }}>

            {/* Logo */}
            <div className="flex items-center justify-center py-4 px-3">
              <img src="/logo.png" alt="BookSmart" className="h-[56px] w-auto object-contain" />
            </div>

            {/* Main nav */}
            <div className="flex-1 overflow-y-auto py-1">
              <SidebarMenu>
                {items.map((item) => {
                  const active = isActive(item.url);
                  const badgeVal = getBadge((item as any).badge);
                  const isNewBadge = (item as any).badge === "new";
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        className="h-11 px-4 rounded-none transition-colors hover:bg-transparent"
                        style={{ background: "transparent" }}
                      >
                        <Link
                          href={item.url}
                          className="flex items-center gap-3 w-full h-full"
                          style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}
                        >
                          <span className="relative flex-shrink-0">
                            <item.icon
                              className="h-[20px] w-[20px]"
                              strokeWidth={active ? 2 : 1.5}
                              style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}
                            />
                            {badgeVal && !isNewBadge && (
                              <span className="absolute -top-1 -right-1 flex h-[8px] w-[8px]">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-[8px] w-[8px] bg-rose-500" />
                              </span>
                            )}
                          </span>
                          <span
                            className="text-[14px] font-medium flex-1"
                            style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}
                          >
                            {item.title}
                          </span>
                          {isNewBadge && (
                            <span className="min-w-[28px] h-[16px] px-1.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                              New
                            </span>
                          )}
                          {badgeVal && !isNewBadge && typeof badgeVal === "number" && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                              {badgeVal > 99 ? "99+" : badgeVal}
                            </span>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>

            {/* CPA Plan section (only for CPA role) */}
            {role === "cpa" && (
              <div className="mx-3 mb-2 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-3">
                <p className="text-[9px] text-sidebar-foreground/50 uppercase tracking-wider mb-0.5">CPA Plan</p>
                <p className="text-[13px] font-semibold text-sidebar-foreground">Professional</p>
                <p className="text-[9px] text-sidebar-foreground/50 mb-2">Renews on Jun 1, 2025</p>
                <button
                  onClick={() => navigate("/cpa/settings")}
                  className="w-full h-7 rounded-lg bg-sidebar-primary/20 hover:bg-sidebar-primary/30 text-sidebar-foreground text-[10px] font-semibold transition-colors"
                >
                  View Plan
                </button>
              </div>
            )}

            {/* Bottom section */}
            {bottomItems.length > 0 && (
              <div className="border-t py-1 border-sidebar-border">
                <SidebarMenu>
                  {bottomItems.map((item) => {
                    const active = isActive(item.url);
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className="h-11 px-4 rounded-none transition-colors hover:bg-transparent"
                          style={{ background: "transparent" }}
                        >
                          <Link
                            href={item.url}
                            className="flex items-center gap-3 w-full h-full"
                            style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}
                          >
                            <item.icon
                              className="h-[20px] w-[20px]"
                              strokeWidth={active ? 2 : 1.5}
                              style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}
                            />
                            <span className="text-[14px] font-medium" style={{ color: active ? "hsl(var(--primary))" : "hsl(var(--sidebar-foreground) / 0.65)" }}>
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={signOut}
                      className="h-11 px-4 rounded-none transition-colors hover:bg-transparent"
                      style={{ background: "transparent" }}
                    >
                      <LogOut className="h-[20px] w-[20px]" strokeWidth={1.5} style={{ color: "#f87171" }} />
                      <span className="text-[14px] font-medium" style={{ color: "#f87171" }}>Sign Out</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </div>
            )}

            {/* CPA: user profile + sign out + need help */}
            {role === "cpa" && (
              <div className="border-t border-sidebar-border">
                {/* User profile row */}
                <div className="flex items-center gap-2.5 px-3 py-3 cursor-pointer hover:bg-sidebar-accent/50 transition-colors"
                  onClick={() => navigate("/cpa/profile")}>
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[11px] font-bold text-primary">
                      {fullName.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-sidebar-foreground truncate">{fullName}, CPA</p>
                    <p className="text-[10px] text-sidebar-foreground/50 truncate">Anderson Tax & Advisory</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                </div>
                {/* Sign out */}
                <button
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-sidebar-accent/50 transition-colors"
                >
                  <LogOut className="h-[16px] w-[16px]" style={{ color: "#f87171" }} />
                  <span className="text-[13px] font-medium" style={{ color: "#f87171" }}>Sign Out</span>
                </button>
                {/* Need Help */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-t border-sidebar-border">
                  <HelpCircle className="h-4 w-4 text-sidebar-foreground/40 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-medium text-sidebar-foreground/70">Need Help?</p>
                    <p className="text-[10px] text-sidebar-foreground/50">Contact Support</p>
                  </div>
                </div>
              </div>
            )}

          </SidebarContent>
        </Sidebar>

        {/* ── Main content area ── */}
        <main className="flex-1 flex flex-col overflow-hidden bg-background">

          {/* Header */}
          <header className="h-14 border-b border-border/40 flex items-center px-4 bg-card/60 backdrop-blur sticky top-0 z-10 gap-2">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground mr-2" />

            <div className="ml-auto flex items-center gap-2">
              {/* CPA: Refer a Client button */}
              {role === "cpa" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs border-border/60 text-foreground hidden sm:flex"
                  onClick={() => navigate("/cpa/referrals")}
                >
                  <LinkIcon className="h-3.5 w-3.5" /> Refer a Client
                </Button>
              )}

              {/* Bell */}
              <Link href={role === "user" ? "/user/chat" : role === "cpa" ? "/cpa/chat" : "/admin/chat"}>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary relative">
                  <Bell className="h-[18px] w-[18px]" />
                  {unreadCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </Button>
              </Link>

              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
              >
                {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </Button>

              {/* CPA: user avatar + name */}
              {role === "cpa" && (
                <button
                  onClick={() => navigate("/cpa/profile")}
                  className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full border border-border/40 hover:border-border/80 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-primary">{fullName.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <span className="text-xs font-medium text-foreground">{fullName}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground rotate-90" />
                </button>
              )}
            </div>
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-auto p-3 md:p-4">
            <div className="w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
