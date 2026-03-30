import { useState, useEffect, Fragment } from "react";
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
  AlertTriangle, Calendar, TrendingUp, Users, Target, Clock, Search,
  ChevronDown, ChevronUp,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  contacted: "Contacted",
  opened: "Opened",
  responded: "Responded",
  meeting_set: "Meeting Set",
  closed: "Closed",
  no_response: "No Response",
};

const STATUS_BADGE: Record<string, string> = {
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  opened: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  responded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  meeting_set: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-primary/10 text-primary",
  no_response: "bg-muted text-muted-foreground",
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="w-3 h-3 text-[#0077b5]" />,
  email: <Mail className="w-3 h-3 text-muted-foreground" />,
  phone: <Phone className="w-3 h-3 text-muted-foreground" />,
};

type LogWithBroker = OutreachLog & {
  broker_name: string | null;
  broker_state: string | null;
  broker_email: string | null;
  email_subject: string | null;
  email_body: string | null;
  step_number: number | null;
};

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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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
  const [searchInput, setSearchInput] = useState("");
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  const buildParams = () => {
    const p = new URLSearchParams({ page: String(page), limit: "50" });
    if (statusFilter) p.set("status", statusFilter);
    if (typeFilter) p.set("outreach_type", typeFilter);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (showOverdue) p.set("overdue", "true");
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  };

  const { data, isLoading } = useQuery<OutreachLogResponse>({
    queryKey: ["/api/outreach-log", { page, statusFilter, typeFilter, dateFrom, dateTo, showOverdue, search: debouncedSearch }],
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
      <div className="px-3 pt-2 pb-0 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Outreach Tracker</h1>
            {data && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {data.total.toLocaleString()} records
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 text-xs ${showOverdue ? "border-orange-400 text-orange-600 bg-orange-50 dark:bg-orange-950/20" : ""}`}
            onClick={() => setShowOverdue(!showOverdue)}
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            {showOverdue ? "Show All" : "Overdue"}
            {stats?.overdueFollowUps ? (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] bg-orange-200 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                {stats.overdueFollowUps}
              </Badge>
            ) : null}
          </Button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {[
            { label: "Contacted", value: stats?.totalContacted ?? "\u2014", icon: <Users className="w-3.5 h-3.5" />, color: "text-blue-600" },
            { label: "Awaiting", value: stats?.awaitingResponse ?? "\u2014", icon: <Clock className="w-3.5 h-3.5" />, color: "text-yellow-600" },
            { label: "Meetings", value: stats?.meetingsSet ?? "\u2014", icon: <Calendar className="w-3.5 h-3.5" />, color: "text-green-600" },
            { label: "Closed", value: stats?.conversions ?? "\u2014", icon: <Target className="w-3.5 h-3.5" />, color: "text-primary" },
            { label: "Rate", value: `${conversionRate}%`, icon: <TrendingUp className="w-3.5 h-3.5" />, color: "text-purple-600" },
          ].map((stat) => (
            <div key={stat.label} className="border rounded-md p-2 bg-card flex items-center gap-2">
              <div className={stat.color}>{stat.icon}</div>
              <div>
                <div className="text-sm font-semibold tabular-nums leading-tight">{stat.value}</div>
                <div className="text-[10px] text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search broker name or email..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
              className="pl-7 h-7 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[110px] h-7 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {outreachLogStatusEnum.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[90px] h-7 text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {outreachLogTypeEnum.map(t => <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="h-7 text-xs w-28" />
            <span className="text-muted-foreground text-xs">\u2013</span>
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="h-7 text-xs w-28" />
          </div>

          {(statusFilter || typeFilter || dateFrom || dateTo || showOverdue || searchInput) && (
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => {
              setStatusFilter(""); setTypeFilter(""); setDateFrom(""); setDateTo(""); setShowOverdue(false); setSearchInput(""); setPage(1);
            }}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-1.5">
        {isLoading ? (
          <div className="space-y-1">{[...Array(12)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}</div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] font-medium px-2 w-6"></TableHead>
                  <TableHead className="text-[11px] font-medium px-2">Broker</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-16">State</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-16">Type</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-12">Step</TableHead>
                  <TableHead className="text-[11px] font-medium px-2">Template</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-28">Status</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-24">Date</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-24">Follow-up</TableHead>
                  <TableHead className="text-[11px] font-medium px-2 w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.logs.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow
                      className={`cursor-pointer transition-colors h-8 ${isOverdue(log) ? "bg-orange-50/50 dark:bg-orange-950/10" : "hover:bg-muted/30"}`}
                      onClick={() => setExpandedRowId(expandedRowId === log.id ? null : log.id)}
                    >
                      <TableCell className="px-2 py-1">
                        {expandedRowId === log.id ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-xs font-medium px-2 py-1">
                        <div className="flex items-center gap-1">
                          {isOverdue(log) && <AlertTriangle className="w-3 h-3 text-orange-500 shrink-0" />}
                          <button
                            className="hover:underline text-left truncate max-w-[140px]"
                            onClick={(e) => { e.stopPropagation(); navigate(`/brokers?id=${log.broker_id}`); }}
                          >
                            {log.broker_name || `#${log.broker_id}`}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground px-2 py-1">{log.broker_state || "\u2014"}</TableCell>
                      <TableCell className="px-2 py-1">
                        <div className="flex items-center gap-1 text-xs capitalize">
                          {TYPE_ICON[log.outreach_type]}
                          {log.outreach_type}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground px-2 py-1 tabular-nums">
                        {log.step_number ? `Step ${log.step_number}` : "\u2014"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground px-2 py-1" title={log.message_template_used || ""}>
                        <span className="block max-w-[200px] truncate">{log.message_template_used || "\u2014"}</span>
                      </TableCell>
                      <TableCell className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={log.status}
                          onValueChange={(v) => updateMutation.mutate({ id: log.id, status: v as OutreachLogStatus })}
                        >
                          <SelectTrigger className="h-5 border-0 bg-transparent p-0.5 w-24">
                            <Badge className={`text-[9px] px-1 py-0 pointer-events-none border-0 ${STATUS_BADGE[log.status] || ""}`}>
                              {STATUS_LABELS[log.status] || log.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {outreachLogStatusEnum.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground tabular-nums px-2 py-1">
                        {log.created_at ? new Date(log.created_at).toLocaleDateString() : "\u2014"}
                      </TableCell>
                      <TableCell className={`text-[10px] tabular-nums px-2 py-1 ${isOverdue(log) ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                        {log.follow_up_date || "\u2014"}
                      </TableCell>
                      <TableCell className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteMutation.mutate(log.id)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          \u00D7
                        </button>
                      </TableCell>
                    </TableRow>
                    {expandedRowId === log.id && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={10} className="px-4 py-2">
                          <div className="space-y-1.5 text-xs">
                            {log.broker_email && (
                              <div><span className="font-medium text-muted-foreground">To:</span> {log.broker_email}</div>
                            )}
                            {log.email_subject && (
                              <div><span className="font-medium text-muted-foreground">Subject:</span> {log.email_subject}</div>
                            )}
                            {log.email_body ? (
                              <div className="mt-1 p-2 bg-card border rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                                {log.email_body}
                              </div>
                            ) : (
                              <div className="text-muted-foreground italic">No email body available</div>
                            )}
                            {log.notes && (
                              <div className="mt-1"><span className="font-medium text-muted-foreground">Notes:</span> {log.notes}</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {data?.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground text-sm">
                      {showOverdue ? "No overdue follow-ups." : "No outreach logged yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="px-3 py-1.5 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">
            {((data.page - 1) * 50 + 1).toLocaleString()}-{Math.min(data.page * 50, data.total).toLocaleString()} of {data.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs px-2 tabular-nums">{data.page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
