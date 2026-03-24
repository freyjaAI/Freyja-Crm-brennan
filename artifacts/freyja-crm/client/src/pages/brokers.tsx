import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Broker, OutreachStatus } from "@shared/schema";
import { outreachStatusEnum } from "@shared/schema";
import { BrokerDetail } from "@/components/BrokerDetail";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  closed: "Closed",
};

const STATUS_BADGE_VARIANT: Record<string, string> = {
  not_contacted: "bg-muted text-muted-foreground",
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  interested: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  not_interested: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  closed: "bg-primary/10 text-primary",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface BrokersResponse {
  brokers: Broker[];
  total: number;
  page: number;
  totalPages: number;
}

export default function Brokers() {
  const [location] = useLocation();
  const { toast } = useToast();

  // Parse initial params from URL
  const urlParams = new URLSearchParams(location.split("?")[1] || "");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [stateFilter, setStateFilter] = useState(urlParams.get("state") || "");
  const [statusFilter, setStatusFilter] = useState(urlParams.get("status") || "");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [selectedBrokerId, setSelectedBrokerId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, stateFilter, statusFilter, assignedFilter]);

  const { data, isLoading } = useQuery<BrokersResponse>({
    queryKey: [
      "/api/brokers",
      { page, search, state: stateFilter, status: statusFilter, assigned_to: assignedFilter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (search) params.set("search", search);
      if (stateFilter) params.set("state", stateFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (assignedFilter) params.set("assigned_to", assignedFilter);
      const res = await apiRequest("GET", `/api/brokers?${params.toString()}`);
      return res.json();
    },
  });

  // Inline status update mutation
  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: number;
      status: OutreachStatus;
    }) => {
      const res = await apiRequest("PATCH", `/api/brokers/${id}`, {
        outreach_status: status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

  // Bulk status update
  const bulkMutation = useMutation({
    mutationFn: async (status: OutreachStatus) => {
      const promises = Array.from(selectedIds).map((id) =>
        apiRequest("PATCH", `/api/brokers/${id}`, { outreach_status: status })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Bulk update complete" });
    },
  });

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
  }, [searchInput]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (stateFilter) params.set("state", stateFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (assignedFilter) params.set("assigned_to", assignedFilter);
    window.open(`/api/brokers/export?${params.toString()}`, "_blank");
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedIds.size === data.brokers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.brokers.map((b) => b.id)));
    }
  };

  return (
    <div className="flex h-full" data-testid="brokers-page">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 pb-0 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold" data-testid="brokers-title">
              Brokers
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              data-testid="button-export"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </Button>
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, office, city..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-8 h-9 text-sm"
                data-testid="input-search"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSearch}
              className="h-9"
              data-testid="button-search"
            >
              Search
            </Button>

            <Select
              value={stateFilter}
              onValueChange={(v) => setStateFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[120px] h-9 text-sm" data-testid="select-state">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[150px] h-9 text-sm" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {outreachStatusEnum.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(search || stateFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                  setStateFilter("");
                  setStatusFilter("");
                  setAssignedFilter("");
                }}
                className="h-9 text-sm"
                data-testid="button-clear-filters"
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Bulk actions */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <Select
                onValueChange={(v) => bulkMutation.mutate(v as OutreachStatus)}
              >
                <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-bulk-status">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {outreachStatusEnum.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          data && data.brokers.length > 0 &&
                          selectedIds.size === data.brokers.length
                        }
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="text-xs font-medium">Name</TableHead>
                    <TableHead className="text-xs font-medium">Email</TableHead>
                    <TableHead className="text-xs font-medium">Phone</TableHead>
                    <TableHead className="text-xs font-medium">Office</TableHead>
                    <TableHead className="text-xs font-medium">City</TableHead>
                    <TableHead className="text-xs font-medium w-16">State</TableHead>
                    <TableHead className="text-xs font-medium w-40">Status</TableHead>
                    <TableHead className="text-xs font-medium">Assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.brokers.map((broker) => (
                    <TableRow
                      key={broker.id}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setSelectedBrokerId(broker.id)}
                      data-testid={`row-broker-${broker.id}`}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(broker.id)}
                          onCheckedChange={() => toggleSelect(broker.id)}
                          data-testid={`checkbox-broker-${broker.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium max-w-[160px] truncate">
                        {broker.full_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {broker.email || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {broker.phone || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                        {broker.office_name || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {broker.city || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {broker.state || "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={broker.outreach_status || "not_contacted"}
                          onValueChange={(v) =>
                            statusMutation.mutate({
                              id: broker.id,
                              status: v as OutreachStatus,
                            })
                          }
                        >
                          <SelectTrigger
                            className="h-7 text-xs border-0 bg-transparent w-36 p-1"
                            data-testid={`select-status-${broker.id}`}
                          >
                            <Badge
                              className={`text-[10px] px-1.5 py-0 pointer-events-none border-0 ${
                                STATUS_BADGE_VARIANT[
                                  broker.outreach_status || "not_contacted"
                                ]
                              }`}
                            >
                              {STATUS_LABELS[broker.outreach_status || "not_contacted"]}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {outreachStatusEnum.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {broker.assigned_to || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.brokers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No brokers found. Try adjusting your filters or import data.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {(data.page - 1) * 50 + 1}–
              {Math.min(data.page * 50, data.total)} of{" "}
              {data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-3 tabular-nums">
                Page {data.page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over detail panel */}
      {selectedBrokerId && (
        <BrokerDetail
          brokerId={selectedBrokerId}
          onClose={() => setSelectedBrokerId(null)}
        />
      )}
    </div>
  );
}
