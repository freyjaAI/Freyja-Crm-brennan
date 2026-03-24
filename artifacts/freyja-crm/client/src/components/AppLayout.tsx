import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { useQuery } from "@tanstack/react-query";
import { PerplexityAttribution } from "./PerplexityAttribution";
import {
  LayoutDashboard,
  Users,
  Upload,
  Sun,
  Moon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function FreyjaLogo() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="28"
      height="28"
      fill="none"
      aria-label="Freyja IQ logo"
      className="shrink-0"
    >
      <path
        d="M16 2 L22 8 L28 16 L22 24 L16 30 L10 24 L4 16 L10 8 Z"
        stroke="hsl(183 85% 40%)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M16 7 L20 12 L24 16 L20 20 L16 25 L12 20 L8 16 L12 12 Z"
        stroke="hsl(183 85% 40%)"
        strokeWidth="1"
        fill="none"
        opacity="0.6"
      />
      <circle cx="16" cy="16" r="3" fill="hsl(183 85% 40%)" opacity="0.8" />
    </svg>
  );
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brokers", label: "Brokers", icon: Users, showCount: true },
  { href: "/import", label: "Import Data", icon: Upload },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  const { data: stats } = useQuery<{
    total: number;
    byStatus: Record<string, number>;
    byState: { state: string; count: number }[];
    bySourceType: { source_type: string; count: number }[];
  }>({
    queryKey: ["/api/stats"],
  });

  return (
    <div className="flex h-screen overflow-hidden" data-testid="app-layout">
      {/* Sidebar */}
      <aside
        className="w-60 shrink-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
        data-testid="sidebar"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <FreyjaLogo />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-sidebar-foreground tracking-tight">
              Freyja IQ
            </span>
            <span className="text-[11px] text-sidebar-foreground/50">
              CRM
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5" data-testid="nav">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? location === "/" || location === ""
                : location.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.showCount && stats && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-5 bg-sidebar-primary/20 text-sidebar-primary border-0"
                      data-testid="broker-count-badge"
                    >
                      {stats.total.toLocaleString()}
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start gap-2.5 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            data-testid="toggle-theme"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
            <span className="text-sm">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          </Button>
          <PerplexityAttribution />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
