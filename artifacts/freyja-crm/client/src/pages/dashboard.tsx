import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  UserX,
  Phone,
  Star,
  CheckCircle,
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

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-xl font-semibold" data-testid="dashboard-title">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!stats) return null;

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
      value: stats.byStatus.contacted || 0,
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
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <h1 className="text-xl font-semibold" data-testid="dashboard-title">
        Dashboard
      </h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const cardContent = (
            <Card
              className={`${kpi.filterStatus ? "cursor-pointer hover:border-primary/30 transition-colors" : ""}`}
              data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, "-")}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {kpi.label}
                  </span>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <div className="text-2xl font-bold tabular-nums">
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brokers by State */}
        <Card data-testid="chart-by-state">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Brokers by State (Top 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.byState}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(200, 10%, 88%)" />
                  <XAxis
                    dataKey="state"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(200, 5%, 45%)"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(200, 5%, 45%)"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(200, 10%, 88%)",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(183, 85%, 30%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card data-testid="chart-by-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    paddingAngle={2}
                    label={false}
                    labelLine={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(200, 10%, 88%)",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
