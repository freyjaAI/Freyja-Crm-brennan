import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  UserX,
  Phone,
  Star,
  CheckCircle,
  Mail,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byState: { state: string; count: number }[];
  bySourceType: { source_type: string; count: number }[];
}

interface OutreachStats {
  totalContacted: number;
  awaitingResponse: number;
  meetingsSet: number;
  conversions: number;
  overdueFollowUps: number;
}

interface RecentEmail {
  id: number;
  broker_id: number;
  subject: string | null;
  send_status: string;
  sent_at: string | null;
  bounce_type: string;
  broker_name: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  not_contacted: "hsl(200, 10%, 55%)",
  contacted: "hsl(220, 70%, 50%)",
  interested: "hsl(150, 60%, 40%)",
  not_interested: "hsl(340, 65%, 50%)",
  closed: "hsl(183, 85%, 30%)",
};

const STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  closed: "Closed",
};

const SEND_STATUS_BADGE: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  queued: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  bounced: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: outreachStats } = useQuery<OutreachStats>({
    queryKey: ["/api/outreach-log/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/outreach-log/stats");
      return res.json();
    },
  });

  const { data: recentActivity } = useQuery<RecentEmail[]>({
    queryKey: ["/api/recent-activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/recent-activity?limit=10");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-lg font-semibold" data-testid="dashboard-title">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const contactedCount = outreachStats?.totalContacted ?? (stats.byStatus.contacted || 0);

  const kpis = [
    {
      label: "Total Brokers",
      value: stats.total,
      icon: Users,
      color: "text-primary",
      filterStatus: undefined,
    },
    {
      label: "Not Contacted",
      value: stats.byStatus.not_contacted || 0,
      icon: UserX,
      color: "text-muted-foreground",
      filterStatus: "not_contacted",
    },
    {
      label: "Contacted",
      value: contactedCount,
      icon: Phone,
      color: "text-chart-2",
      filterStatus: "contacted",
    },
    {
      label: "Interested",
      value: stats.byStatus.interested || 0,
      icon: Star,
      color: "text-chart-3",
      filterStatus: "interested",
    },
    {
      label: "Closed",
      value: stats.byStatus.closed || 0,
      icon: CheckCircle,
      color: "text-chart-1",
      filterStatus: "closed",
    },
  ];

  const pieData = Object.entries(stats.byStatus)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: STATUS_LABELS[key] || key,
      value,
      fill: STATUS_COLORS[key] || "#888",
    }));

  return (
    <div className="p-4 space-y-4" data-testid="dashboard-page">
      <h1 className="text-lg font-semibold" data-testid="dashboard-title">
        Dashboard
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const cardContent = (
            <Card
              className={`${kpi.filterStatus ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`}
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {kpi.label}
                  </span>
                  <Icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
                <div className="text-xl font-bold tabular-nums">
                  {kpi.value.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          );

          if (kpi.filterStatus) {
            return (
              <Link key={kpi.label} href={`/brokers?status=${kpi.filterStatus}`}>
                {cardContent}
              </Link>
            );
          }

          return <div key={kpi.label}>{cardContent}</div>;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card data-testid="chart-by-state">
          <CardHeader className="pb-1 px-3 pt-3">
            <CardTitle className="text-xs font-medium">Brokers by State (Top 10)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.byState}
                  margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(200, 10%, 88%)" />
                  <XAxis dataKey="state" tick={{ fontSize: 10 }} stroke="hsl(200, 5%, 45%)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(200, 5%, 45%)" />
                  <Tooltip contentStyle={{ borderRadius: "6px", border: "1px solid hsl(200, 10%, 88%)", fontSize: "11px" }} />
                  <Bar dataKey="count" fill="hsl(183, 85%, 30%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="chart-by-status">
          <CardHeader className="pb-1 px-3 pt-3">
            <CardTitle className="text-xs font-medium">Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    dataKey="value"
                    paddingAngle={2}
                    label={false}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "6px", border: "1px solid hsl(200, 10%, 88%)", fontSize: "11px" }} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 px-3 pt-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-medium">Recent Email Activity</CardTitle>
              <Link href="/outreach" className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                View all <ArrowRight className="w-2.5 h-2.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {!recentActivity || recentActivity.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">
                No emails sent yet
              </div>
            ) : (
              <div className="space-y-0 max-h-56 overflow-y-auto">
                {recentActivity.map((email) => (
                  <div key={email.id} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                    <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate">{email.broker_name || `Broker #${email.broker_id}`}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{email.subject || "No subject"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge className={`text-[8px] px-1 py-0 border-0 ${SEND_STATUS_BADGE[email.send_status] || "bg-muted text-muted-foreground"}`}>
                        {email.send_status}
                      </Badge>
                      {email.sent_at && (
                        <span className="text-[9px] text-muted-foreground tabular-nums">
                          {new Date(email.sent_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
