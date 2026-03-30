import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutreachLog, OutreachLogStatus } from "@shared/schema";
import { outreachLogStatusEnum, outreachLogTypeEnum } from "@shared/schema";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare, Mail, Phone, Linkedin, ChevronLeft, ChevronRight,
  AlertTriangle, Calendar, TrendingUp, Users, Target, Clock, ExternalLink,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  contacted: "Contacted",
  responded: "Responded",
  meeting_set: "Meeting Set",
  closed: "Closed",
  no_response: "No Response",
};

const STATUS_BADGE: Record<string, string> = {
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  responded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  meeting_set: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-primary/10 text-primary",
  no_response: "bg-muted text-muted-foreground",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />,
  email: <Mail className="w-3.5 h-3.5 text-muted-foreground" />,
  phone: <Phone className="w-3.5 h-3.5 text-muted-foreground" />,
};

type LogWithBroker = OutreachLog & { broker_name: string | null; broker_state: string | null };

interface OutreachLogResponse {
  logs: LogWithBroker[];
  total: number;
  page: number;
  totalPages: number;
}

interface OutreachStats {
  totalContacted: number;
  awaitingResponse: number;
  meetingsSet: number;
  conversions: number;
  overdueFollowUps: number;
}

export default function OutreachPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showOverdue, setShowOverdue] = useState(false);

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), limit: "50" });
    if (statusFilter) p.set("status", statusFilter);
    if (typeFilter) p.set("outreach_type", typeFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (showOverdue) p.set("overdue", "true");
    return p.toString();
  };

  const { data, isLoading } = useQuery<OutreachLogResponse>({
    queryKey: ["/api/outreach-log", { page, statusFilter, typeFilter, dateFrom, dateTo, showOverdue }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/outreach-log?${buildParams()}`);
      return res.json();
    },
    retry: 2,
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<OutreachStats>({
    queryKey: ["/api/outreach-log/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/outreach-log/stats");
      return res.json();
    },
    retry: 2,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: OutreachLogStatus }) => {
      const res = await apiRequest("PATCH", `/api/outreach-log/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-log"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/outreach-log/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-log/stats"] });
      toast({ title: "Log entry deleted" });
    },
  });

  const conversionRate = stats && stats.totalContacted > 0
    ? Math.round((stats.conversions / stats.totalContacted) * 100)
    : 0;

  const isOverdue = (log: LogWithBroker) => {
    if (!log.follow_up_date) return false;
    const today = new Date().toISOString().split("T")[0];
    return log.follow_up_date <= today && log.status !== "closed" && log.status !== "meeting_set";
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 pb-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Outreach Tracker</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOverdue(!showOverdue)}
            className={showOverdue ? "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/20" : ""}
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
            {showOverdue ? "Show All" : "Show Overdue"}
            {stats?.overdueFollowUps ? (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px] bg-orange-200 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                {stats.overdueFollowUps}
              </Badge>
            ) : null}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Contacted", value: stats?.totalContacted ?? "—", icon: <Users className="w-4 h-4" />, color: "text-blue-600" },
            { label: "Awaiting Response", value: stats?.awaitingResponse ?? "—", icon: <Clock className="w-4 h-4" />, color: "text-yellow-600" },
            { label: "Meetings Set", value: stats?.meetingsSet ?? "—", icon: <Calendar className="w-4 h-4" />, color: "text-green-600" },
            { label: "Conversions", value: stats?.conversions ?? "—", icon: <Target className="w-4 h-4" />, color: "text-primary" },
            { label: "Conversion Rate", value: `${conversionRate}%`, icon: <TrendingUp className="w-4 h-4" />, color: "text-purple-600" },
          ].map((stat) => (
            <div key={stat.label} className="border rounded-lg p-3 bg-card flex items-center gap-3">
              <div className={stat.color}>{stat.icon}</div>
              <div>
                <div className="text-lg font-semibold tabular-nums">{stat.value}</div>
                <div className="text-[11px] text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {outreachLogStatusEnum.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {outreachLogTypeEnum.map(t => <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9 text-sm w-36"
              placeholder="From"
            />
            <span className="text-muted-foreground text-sm">–</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9 text-sm w-36"
              placeholder="To"
            />
          </div>

          {(statusFilter || typeFilter || dateFrom || dateTo || showOverdue) && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => {
              setStatusFilter(""); setTypeFilter(""); setDateFrom(""); setDateTo(""); setShowOverdue(false); setPage(1);
            }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        {isLoading ? (
          <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium">Broker</TableHead>
                  <TableHead className="text-xs font-medium w-20">State</TableHead>
                  <TableHead className="text-xs font-medium w-24">Type</TableHead>
                  <TableHead className="text-xs font-medium">Template Used</TableHead>
                  <TableHead className="text-xs font-medium w-36">Status</TableHead>
                  <TableHead className="text-xs font-medium w-28">Date</TableHead>
                  <TableHead className="text-xs font-medium w-28">Follow-up</TableHead>
                  <TableHead className="text-xs font-medium w-20">Notes</TableHead>
                  <TableHead className="text-xs font-medium w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className={isOverdue(log) ? "bg-orange-50/50 dark:bg-orange-950/10" : ""}
                  >
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1.5">
                        {isOverdue(log) && <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
                        <button
                          className="hover:underline text-left truncate max-w-[160px]"
                          onClick={() => navigate(`/brokers?id=${log.broker_id}`)}
                        >
                          {log.broker_name || `Broker #${log.broker_id}`}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.broker_state || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm capitalize">
                        {TYPE_ICON[log.outreach_type]}
                        {log.outreach_type}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {log.message_template_used || "—"}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={log.status}
                        onValueChange={(v) => updateMutation.mutate({ id: log.id, status: v as OutreachLogStatus })}
                      >
                        <SelectTrigger className="h-7 border-0 bg-transparent p-1 w-32">
                          <Badge className={`text-[10px] px-1.5 py-0 pointer-events-none border-0 ${STATUS_BADGE[log.status] || ""}`}>
                            {STATUS_LABELS[log.status] || log.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {outreachLogStatusEnum.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {log.created_at ? new Date(log.created_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className={`text-xs tabular-nums ${isOverdue(log) ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                      {log.follow_up_date || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[80px] truncate" title={log.notes || ""}>
                      {log.notes || "—"}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => deleteMutation.mutate(log.id)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        ×
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {showOverdue ? "No overdue follow-ups." : "No outreach logged yet. Start reaching out to brokers!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Showing {(data.page - 1) * 50 + 1}–{Math.min(data.page * 50, data.total)} of {data.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm px-3 tabular-nums">Page {data.page} of {data.totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
