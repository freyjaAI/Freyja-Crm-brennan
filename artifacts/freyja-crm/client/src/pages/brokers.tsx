import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Broker, OutreachStatus, FilterPreset } from "@shared/schema";
import { outreachStatusEnum } from "@shared/schema";
import { BrokerDetail } from "@/components/BrokerDetail";
import { EnrollModal } from "@/components/EnrollModal";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  Linkedin,
  SlidersHorizontal,
  Mail,
  Phone,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Plus,
  Star,
  Home,
  Building2,
  Flame,
  TreePine,
  TrendingUp,
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

const SPECIALTIES = ["House", "Condo", "Townhouse", "Commercial", "Lot/Land", "Manufactured", "Other"];

const SOURCE_TYPES = ["association", "agency", "realtor.com", "homes.com", "remax.com"];

interface BrokersResponse {
  brokers: Broker[];
  total: number;
  page: number;
  totalPages: number;
}

interface BatchProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  done: boolean;
  lastBroker?: string;
  linkedinFound?: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface Filters {
  search: string;
  state: string;
  status: string;
  assigned_to: string;
  dealsClosedMin: string;
  dealsClosedMax: string;
  avgPriceMin: string;
  avgPriceMax: string;
  experienceMin: string;
  experienceMax: string;
  specialties: string[];
  brokerage: string;
  city: string;
  sourceType: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedin: boolean;
  sort_by: string;
  sort_order: string;
}

const defaultFilters: Filters = {
  search: "",
  state: "",
  status: "",
  assigned_to: "",
  dealsClosedMin: "",
  dealsClosedMax: "",
  avgPriceMin: "",
  avgPriceMax: "",
  experienceMin: "",
  experienceMax: "",
  specialties: [],
  brokerage: "",
  city: "",
  sourceType: "",
  hasEmail: false,
  hasPhone: false,
  hasLinkedin: false,
  sort_by: "",
  sort_order: "asc",
};

interface BuiltInPreset {
  id: string;
  name: string;
  icon: React.ReactNode;
  filters: Partial<Filters>;
}

const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    id: "top-producers",
    name: "Top Producers",
    icon: <Star className="w-3 h-3" />,
    filters: {
      dealsClosedMin: "100",
      avgPriceMin: "500000",
      experienceMin: "10",
      hasEmail: true,
      hasPhone: true,
      sort_by: "recently_sold_count",
      sort_order: "desc",
    },
  },
  {
    id: "high-value",
    name: "High-Value",
    icon: <TrendingUp className="w-3 h-3" />,
    filters: {
      avgPriceMin: "1000000",
      dealsClosedMin: "25",
      experienceMin: "5",
      sort_by: "average_price",
      sort_order: "desc",
    },
  },
  {
    id: "active-residential",
    name: "Residential",
    icon: <Home className="w-3 h-3" />,
    filters: {
      specialties: ["House", "Condo", "Townhouse"],
      dealsClosedMin: "50",
      hasEmail: true,
      sort_by: "recently_sold_count",
      sort_order: "desc",
    },
  },
  {
    id: "commercial-specialists",
    name: "Commercial",
    icon: <Building2 className="w-3 h-3" />,
    filters: {
      specialties: ["Commercial"],
      dealsClosedMin: "20",
      experienceMin: "5",
      sort_by: "recently_sold_count",
      sort_order: "desc",
    },
  },
  {
    id: "new-hungry",
    name: "New & Hungry",
    icon: <Flame className="w-3 h-3" />,
    filters: {
      experienceMin: "1",
      experienceMax: "5",
      dealsClosedMin: "25",
      hasEmail: true,
      hasPhone: true,
      sort_by: "recently_sold_count",
      sort_order: "desc",
    },
  },
  {
    id: "land-development",
    name: "Land",
    icon: <TreePine className="w-3 h-3" />,
    filters: {
      specialties: ["Lot/Land"],
      dealsClosedMin: "10",
      sort_by: "average_price",
      sort_order: "desc",
    },
  },
];

function formatPrice(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num}`;
}

export default function Brokers() {
  const [location] = useLocation();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(location.split("?")[1] || "");

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...defaultFilters,
    state: urlParams.get("state") || "",
    status: urlParams.get("status") || "",
  });
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedBrokerId, setSelectedBrokerId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchSize, setBatchSize] = useState(20);
  const [batchMode, setBatchMode] = useState<"both" | "enrich" | "outreach">("both");
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [aiLeadsMode, setAiLeadsMode] = useState(false);
  const [aiLeadsData, setAiLeadsData] = useState<{ brokers: (Broker & { lead_score: number })[]; total: number } | null>(null);
  const [aiLeadsLoading, setAiLeadsLoading] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 300);
  const debouncedBrokerage = useDebounce(filters.brokerage, 400);
  const debouncedCity = useDebounce(filters.city, 400);
  const debouncedDealsMin = useDebounce(filters.dealsClosedMin, 400);
  const debouncedDealsMax = useDebounce(filters.dealsClosedMax, 400);
  const debouncedPriceMin = useDebounce(filters.avgPriceMin, 400);
  const debouncedPriceMax = useDebounce(filters.avgPriceMax, 400);
  const debouncedExpMin = useDebounce(filters.experienceMin, 400);
  const debouncedExpMax = useDebounce(filters.experienceMax, 400);

  useEffect(() => {
    setFilters(prev => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  const queryFilters = useMemo(() => ({
    ...filters,
    search: debouncedSearch,
    brokerage: debouncedBrokerage,
    city: debouncedCity,
    dealsClosedMin: debouncedDealsMin,
    dealsClosedMax: debouncedDealsMax,
    avgPriceMin: debouncedPriceMin,
    avgPriceMax: debouncedPriceMax,
    experienceMin: debouncedExpMin,
    experienceMax: debouncedExpMax,
  }), [debouncedSearch, filters.state, filters.status, filters.assigned_to, filters.specialties, filters.sourceType, filters.hasEmail, filters.hasPhone, filters.hasLinkedin, filters.sort_by, filters.sort_order, debouncedBrokerage, debouncedCity, debouncedDealsMin, debouncedDealsMax, debouncedPriceMin, debouncedPriceMax, debouncedExpMin, debouncedExpMax]);

  useEffect(() => { setPage(1); }, [queryFilters]);

  const { data: customPresets = [] } = useQuery<FilterPreset[]>({
    queryKey: ["/api/filter-presets"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/filter-presets");
      return res.json();
    },
  });

  const savePresetMutation = useMutation({
    mutationFn: async (name: string) => {
      const { sort_by: _sb, sort_order: _so, ...filterData } = filters;
      const res = await apiRequest("POST", "/api/filter-presets", {
        name,
        filters: { ...filterData, sort_by: filters.sort_by, sort_order: filters.sort_order },
      });
      return res.json();
    },
    onSuccess: (preset) => {
      queryClient.invalidateQueries({ queryKey: ["/api/filter-presets"] });
      setSavePresetOpen(false);
      setNewPresetName("");
      setActivePresetId(`custom-${preset.id}`);
      toast({ title: `Preset "${preset.name}" saved` });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/filter-presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/filter-presets"] });
      toast({ title: "Preset deleted" });
    },
  });

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setActivePresetId(null);
  };

  const applyPreset = (presetId: string, presetFilters: Partial<Filters>) => {
    const newFilters = { ...defaultFilters, ...presetFilters };
    setFilters(newFilters);
    setSearchInput(newFilters.search || "");
    setActivePresetId(presetId);
    setShowAdvanced(true);
  };

  const activeFilterCount = [
    filters.search,
    filters.state,
    filters.status,
    filters.dealsClosedMin,
    filters.dealsClosedMax,
    filters.avgPriceMin,
    filters.avgPriceMax,
    filters.experienceMin,
    filters.experienceMax,
    filters.specialties.length > 0 ? "yes" : "",
    filters.brokerage,
    filters.city,
    filters.sourceType,
    filters.hasEmail ? "yes" : "",
    filters.hasPhone ? "yes" : "",
    filters.hasLinkedin ? "yes" : "",
  ].filter(Boolean).length;

  const buildQueryParams = (f: Filters, p?: number): URLSearchParams => {
    const params = new URLSearchParams();
    if (p !== undefined) {
      params.set("page", String(p));
      params.set("limit", "50");
    }
    if (f.search) params.set("search", f.search);
    if (f.state) params.set("state", f.state);
    if (f.status) params.set("status", f.status);
    if (f.assigned_to) params.set("assigned_to", f.assigned_to);
    if (f.sort_by) params.set("sort_by", f.sort_by);
    if (f.sort_order) params.set("sort_order", f.sort_order);
    if (f.dealsClosedMin) params.set("dealsClosedMin", f.dealsClosedMin);
    if (f.dealsClosedMax) params.set("dealsClosedMax", f.dealsClosedMax);
    if (f.avgPriceMin) params.set("avgPriceMin", f.avgPriceMin);
    if (f.avgPriceMax) params.set("avgPriceMax", f.avgPriceMax);
    if (f.experienceMin) params.set("experienceMin", f.experienceMin);
    if (f.experienceMax) params.set("experienceMax", f.experienceMax);
    if (f.specialties.length > 0) params.set("specialties", f.specialties.join(","));
    if (f.brokerage) params.set("brokerage", f.brokerage);
    if (f.city) params.set("city", f.city);
    if (f.sourceType) params.set("sourceType", f.sourceType);
    if (f.hasEmail) params.set("hasEmail", "true");
    if (f.hasPhone) params.set("hasPhone", "true");
    if (f.hasLinkedin) params.set("hasLinkedin", "true");
    return params;
  };

  const { data, isLoading } = useQuery<BrokersResponse>({
    queryKey: ["/api/brokers", { page, ...queryFilters }],
    queryFn: async () => {
      const params = buildQueryParams(queryFilters, page);
      const res = await apiRequest("GET", `/api/brokers?${params.toString()}`);
      return res.json();
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: OutreachStatus }) => {
      const res = await apiRequest("PATCH", `/api/brokers/${id}`, { outreach_status: status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });

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

  const handleExport = () => {
    const params = buildQueryParams(queryFilters);
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

  const clearAllFilters = () => {
    setFilters(defaultFilters);
    setSearchInput("");
    setActivePresetId(null);
    setAiLeadsMode(false);
    setAiLeadsData(null);
  };

  const fetchAiLeads = async () => {
    setAiLeadsLoading(true);
    try {
      const res = await apiRequest("GET", "/api/ai-leads?limit=100");
      const data = await res.json();
      setAiLeadsData(data);
      setAiLeadsMode(true);
      setActivePresetId("ai-leads");
      toast({ title: `Found ${data.brokers.length} top leads`, description: `Scored from ${data.total.toLocaleString()} eligible uncontacted brokers` });
    } catch {
      toast({ title: "Failed to load AI leads", variant: "destructive" });
    } finally {
      setAiLeadsLoading(false);
    }
  };

  const exitAiLeadsMode = () => {
    setAiLeadsMode(false);
    setAiLeadsData(null);
    setActivePresetId(null);
  };

  const toggleSort = (field: string) => {
    setActivePresetId(null);
    if (filters.sort_by === field) {
      if (filters.sort_order === "asc") {
        setFilters(prev => ({ ...prev, sort_order: "desc" }));
      } else {
        setFilters(prev => ({ ...prev, sort_by: "", sort_order: "asc" }));
      }
    } else {
      setFilters(prev => ({ ...prev, sort_by: field, sort_order: "desc" }));
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (filters.sort_by !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return filters.sort_order === "desc"
      ? <ArrowDown className="w-3 h-3 ml-1 text-primary" />
      : <ArrowUp className="w-3 h-3 ml-1 text-primary" />;
  };

  const toggleSpecialty = (spec: string) => {
    setActivePresetId(null);
    setFilters(prev => ({
      ...prev,
      specialties: prev.specialties.includes(spec)
        ? prev.specialties.filter(s => s !== spec)
        : [...prev.specialties, spec],
    }));
  };

  const removeFilter = (key: keyof Filters) => {
    setActivePresetId(null);
    if (key === "specialties") {
      setFilters(prev => ({ ...prev, specialties: [] }));
    } else if (key === "hasEmail" || key === "hasPhone" || key === "hasLinkedin") {
      setFilters(prev => ({ ...prev, [key]: false }));
    } else {
      setFilters(prev => ({ ...prev, [key]: "" }));
    }
    if (key === "search") setSearchInput("");
  };

  const activeChips: { label: string; key: keyof Filters }[] = [];
  if (filters.search) activeChips.push({ label: `"${filters.search}"`, key: "search" });
  if (filters.state) activeChips.push({ label: filters.state, key: "state" });
  if (filters.status) activeChips.push({ label: STATUS_LABELS[filters.status] || filters.status, key: "status" });
  if (filters.dealsClosedMin || filters.dealsClosedMax) {
    const min = filters.dealsClosedMin || "0";
    const max = filters.dealsClosedMax || "\u221E";
    activeChips.push({ label: `Deals ${min}\u2013${max}`, key: "dealsClosedMin" });
  }
  if (filters.avgPriceMin || filters.avgPriceMax) {
    const min = filters.avgPriceMin ? formatPrice(filters.avgPriceMin) : "$0";
    const max = filters.avgPriceMax ? formatPrice(filters.avgPriceMax) : "\u221E";
    activeChips.push({ label: `${min}\u2013${max}`, key: "avgPriceMin" });
  }
  if (filters.experienceMin || filters.experienceMax) {
    const min = filters.experienceMin || "0";
    const max = filters.experienceMax || "\u221E";
    activeChips.push({ label: `${min}\u2013${max}yr`, key: "experienceMin" });
  }
  if (filters.specialties.length > 0) {
    activeChips.push({ label: filters.specialties.join(", "), key: "specialties" });
  }
  if (filters.brokerage) activeChips.push({ label: `Brokerage: ${filters.brokerage}`, key: "brokerage" });
  if (filters.city) activeChips.push({ label: `City: ${filters.city}`, key: "city" });
  if (filters.sourceType) activeChips.push({ label: filters.sourceType, key: "sourceType" });
  if (filters.hasEmail) activeChips.push({ label: "Has Email", key: "hasEmail" });
  if (filters.hasPhone) activeChips.push({ label: "Has Phone", key: "hasPhone" });
  if (filters.hasLinkedin) activeChips.push({ label: "Has LinkedIn", key: "hasLinkedin" });

  const runBatchEnrich = async () => {
    setBatchRunning(true);
    setBatchProgress({ total: 0, processed: 0, succeeded: 0, failed: 0, done: false, linkedinFound: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/outreach/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: batchSize,
          state: filters.state || undefined,
          status: filters.status || undefined,
          search: filters.search || undefined,
          mode: batchMode,
          skip_enriched: true,
        }),
        signal: controller.signal,
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "start") {
                setBatchProgress((p) => ({ ...p!, total: event.total }));
              } else if (event.type === "progress") {
                setBatchProgress({
                  total: event.total, processed: event.processed,
                  succeeded: event.succeeded, failed: event.failed, done: false,
                  lastBroker: event.broker_name, linkedinFound: event.linkedin_found ? 1 : 0,
                });
              } else if (event.type === "done") {
                setBatchProgress((p) => ({
                  ...p!, processed: event.processed, succeeded: event.succeeded,
                  failed: event.failed, done: true,
                }));
                queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
                toast({ title: `Batch complete \u2014 ${event.succeeded} processed`, description: event.failed > 0 ? `${event.failed} failed` : undefined });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") toast({ title: "Batch failed", variant: "destructive" });
    } finally {
      setBatchRunning(false);
    }
  };

  const stopBatch = () => { abortRef.current?.abort(); setBatchRunning(false); };
  const openBatchDialog = () => { setBatchProgress(null); setBatchDialogOpen(true); };

  return (
    <div className="flex h-full" data-testid="brokers-page">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-2 pb-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold" data-testid="brokers-title">Brokers</h1>
              {data && !aiLeadsMode && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {((data.page - 1) * 50 + 1).toLocaleString()}-{Math.min(data.page * 50, data.total).toLocaleString()} of {data.total.toLocaleString()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={aiLeadsMode ? exitAiLeadsMode : fetchAiLeads}
                disabled={aiLeadsLoading}
                className={`h-7 text-xs ${aiLeadsMode
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
                }`}
                data-testid="button-ai-leads"
              >
                {aiLeadsLoading ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : aiLeadsMode ? (
                  <X className="w-3.5 h-3.5 mr-1" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                )}
                {aiLeadsLoading ? "Scoring..." : aiLeadsMode ? "Exit AI" : "AI Leads"}
              </Button>
              <Button variant="outline" size="sm" onClick={openBatchDialog} className="h-7 text-xs" data-testid="button-batch-enrich">
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                Batch
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} className="h-7 text-xs" data-testid="button-export">
                <Download className="w-3.5 h-3.5 mr-1" />
                CSV
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, email, office..."
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setActivePresetId(null); }}
                className="pl-7 h-7 text-xs"
                data-testid="input-search"
              />
            </div>

            <Select value={filters.state} onValueChange={(v) => updateFilter("state", v === "all" ? "" : v)}>
              <SelectTrigger className="w-[90px] h-7 text-xs" data-testid="select-state">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger className="w-[120px] h-7 text-xs" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {outreachStatusEnum.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              variant={showAdvanced ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="h-7 text-xs gap-1"
            >
              <SlidersHorizontal className="w-3 h-3" />
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px] rounded-full">
                  {activeFilterCount}
                </Badge>
              )}
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin ml-1">
              {BUILT_IN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id, preset.filters)}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border whitespace-nowrap transition-all shrink-0 ${
                    activePresetId === preset.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  {preset.icon}
                  {preset.name}
                </button>
              ))}

              {customPresets.map((preset) => (
                <div key={preset.id} className="flex items-center shrink-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => applyPreset(`custom-${preset.id}`, preset.filters as Partial<Filters>)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") applyPreset(`custom-${preset.id}`, preset.filters as Partial<Filters>); }}
                    className={`flex items-center gap-1 pl-2 pr-1 py-0.5 text-[10px] font-medium rounded-full border whitespace-nowrap transition-all cursor-pointer ${
                      activePresetId === `custom-${preset.id}`
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:bg-muted"
                    }`}
                  >
                    <Bookmark className="w-2.5 h-2.5" />
                    {preset.name}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePresetMutation.mutate(preset.id);
                        if (activePresetId === `custom-${preset.id}`) setActivePresetId(null);
                      }}
                      className="p-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showAdvanced && (
            <div className="border rounded-md p-2 space-y-2 bg-muted/30">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Deals Closed</label>
                  <div className="flex gap-1">
                    <Input type="number" placeholder="Min" value={filters.dealsClosedMin} onChange={(e) => updateFilter("dealsClosedMin", e.target.value)} className="h-6 text-[11px] px-1.5" />
                    <Input type="number" placeholder="Max" value={filters.dealsClosedMax} onChange={(e) => updateFilter("dealsClosedMax", e.target.value)} className="h-6 text-[11px] px-1.5" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg Price</label>
                  <div className="flex gap-1">
                    <Input type="number" placeholder="Min $" value={filters.avgPriceMin} onChange={(e) => updateFilter("avgPriceMin", e.target.value)} className="h-6 text-[11px] px-1.5" />
                    <Input type="number" placeholder="Max $" value={filters.avgPriceMax} onChange={(e) => updateFilter("avgPriceMax", e.target.value)} className="h-6 text-[11px] px-1.5" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Experience (yrs)</label>
                  <div className="flex gap-1">
                    <Input type="number" placeholder="Min" value={filters.experienceMin} onChange={(e) => updateFilter("experienceMin", e.target.value)} className="h-6 text-[11px] px-1.5" />
                    <Input type="number" placeholder="Max" value={filters.experienceMax} onChange={(e) => updateFilter("experienceMax", e.target.value)} className="h-6 text-[11px] px-1.5" />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Brokerage</label>
                  <Input placeholder="Search..." value={filters.brokerage} onChange={(e) => updateFilter("brokerage", e.target.value)} className="h-6 text-[11px] px-1.5" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">City</label>
                  <Input placeholder="Search..." value={filters.city} onChange={(e) => updateFilter("city", e.target.value)} className="h-6 text-[11px] px-1.5" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                  <Select value={filters.sourceType} onValueChange={(v) => updateFilter("sourceType", v === "all" ? "" : v)}>
                    <SelectTrigger className="h-6 text-[11px]"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {SOURCE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {SPECIALTIES.map((spec) => (
                    <button
                      key={spec}
                      onClick={() => toggleSpecialty(spec)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                        filters.specialties.includes(spec)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {spec}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <Checkbox checked={filters.hasEmail} onCheckedChange={(v) => updateFilter("hasEmail", !!v)} className="w-3 h-3" />
                    <Mail className="w-2.5 h-2.5" /> Email
                  </label>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <Checkbox checked={filters.hasPhone} onCheckedChange={(v) => updateFilter("hasPhone", !!v)} className="w-3 h-3" />
                    <Phone className="w-2.5 h-2.5" /> Phone
                  </label>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                    <Checkbox checked={filters.hasLinkedin} onCheckedChange={(v) => updateFilter("hasLinkedin", !!v)} className="w-3 h-3" />
                    <Linkedin className="w-2.5 h-2.5" /> LinkedIn
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {activeChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="pl-1.5 pr-0.5 py-0 text-[10px] gap-0.5 cursor-pointer hover:bg-destructive/10 h-5"
                  onClick={() => {
                    if (chip.key === "dealsClosedMin") { removeFilter("dealsClosedMin"); removeFilter("dealsClosedMax"); }
                    else if (chip.key === "avgPriceMin") { removeFilter("avgPriceMin"); removeFilter("avgPriceMax"); }
                    else if (chip.key === "experienceMin") { removeFilter("experienceMin"); removeFilter("experienceMax"); }
                    else removeFilter(chip.key);
                  }}
                >
                  {chip.label}
                  <X className="w-2.5 h-2.5" />
                </Badge>
              ))}
              <button onClick={clearAllFilters} className="text-[10px] text-muted-foreground hover:text-foreground ml-1">Clear all</button>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => setSavePresetOpen(true)}
                  className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 ml-1"
                >
                  <Plus className="w-2.5 h-2.5" /> Save
                </button>
              )}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-1.5 bg-muted rounded text-xs">
              <span className="font-medium">{selectedIds.size} selected</span>
              <Button variant="default" size="sm" className="h-6 text-xs gap-1" onClick={() => setEnrollModalOpen(true)}>
                <Mail className="w-3 h-3" /> Enroll in Sequence
              </Button>
              <Select onValueChange={(v) => bulkMutation.mutate(v as OutreachStatus)}>
                <SelectTrigger className="w-[130px] h-6 text-xs" data-testid="select-bulk-status">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {outreachStatusEnum.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">Clear</Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto px-3 py-1.5">
          {aiLeadsMode && aiLeadsData && (
            <div className="mb-2 p-2 rounded-md bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-200 dark:border-violet-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                  <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                    Top {aiLeadsData.brokers.length} FreyjaIQ Leads
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    from {aiLeadsData.total.toLocaleString()} eligible
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1 px-1.5" onClick={exitAiLeadsMode}>
                  <X className="w-3 h-3" /> Back
                </Button>
              </div>
            </div>
          )}

          {(aiLeadsMode ? false : isLoading) ? (
            <div className="space-y-1">
              {[...Array(15)].map((_, i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8 px-2">
                      <Checkbox
                        checked={(() => {
                          const rows = aiLeadsMode ? aiLeadsData?.brokers : data?.brokers;
                          return rows && rows.length > 0 && selectedIds.size === rows.length;
                        })()}
                        onCheckedChange={() => {
                          const rows = aiLeadsMode ? aiLeadsData?.brokers : data?.brokers;
                          if (!rows) return;
                          if (selectedIds.size === rows.length) setSelectedIds(new Set());
                          else setSelectedIds(new Set(rows.map(b => b.id)));
                        }}
                        className="w-3.5 h-3.5"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    {aiLeadsMode && (
                      <TableHead className="text-[11px] font-medium w-14 px-1">
                        <span className="flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-violet-500" /> Score
                        </span>
                      </TableHead>
                    )}
                    <TableHead className="text-[11px] font-medium cursor-pointer select-none px-2" onClick={() => !aiLeadsMode && toggleSort("full_name")}>
                      <span className="flex items-center">Name {!aiLeadsMode && <SortIcon field="full_name" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium px-2">Email</TableHead>
                    <TableHead className="text-[11px] font-medium px-2">Phone</TableHead>
                    <TableHead className="text-[11px] font-medium cursor-pointer select-none px-2" onClick={() => !aiLeadsMode && toggleSort("office_name")}>
                      <span className="flex items-center">Office {!aiLeadsMode && <SortIcon field="office_name" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium px-2">City</TableHead>
                    <TableHead className="text-[11px] font-medium w-12 cursor-pointer select-none px-1" onClick={() => !aiLeadsMode && toggleSort("state")}>
                      <span className="flex items-center">ST {!aiLeadsMode && <SortIcon field="state" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium w-12 cursor-pointer select-none px-1 text-right" onClick={() => !aiLeadsMode && toggleSort("recently_sold_count")}>
                      <span className="flex items-center justify-end">Sold {!aiLeadsMode && <SortIcon field="recently_sold_count" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium w-16 cursor-pointer select-none px-1 text-right" onClick={() => !aiLeadsMode && toggleSort("average_price")}>
                      <span className="flex items-center justify-end">Avg$ {!aiLeadsMode && <SortIcon field="average_price" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium w-10 cursor-pointer select-none px-1 text-right" onClick={() => !aiLeadsMode && toggleSort("experience_years")}>
                      <span className="flex items-center justify-end">Exp {!aiLeadsMode && <SortIcon field="experience_years" />}</span>
                    </TableHead>
                    <TableHead className="text-[11px] font-medium w-28 px-1">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(aiLeadsMode ? aiLeadsData?.brokers : data?.brokers)?.map((broker) => {
                    const score = aiLeadsMode && "lead_score" in broker ? (broker as any).lead_score as number : null;
                    return (
                      <TableRow
                        key={broker.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors h-8"
                        onClick={() => setSelectedBrokerId(broker.id)}
                        data-testid={`row-broker-${broker.id}`}
                      >
                        <TableCell className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(broker.id)}
                            onCheckedChange={() => toggleSelect(broker.id)}
                            className="w-3.5 h-3.5"
                            data-testid={`checkbox-broker-${broker.id}`}
                          />
                        </TableCell>
                        {aiLeadsMode && (
                          <TableCell className="text-xs tabular-nums px-1 py-1">
                            <div className="flex items-center gap-1">
                              <div className="w-6 h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    (score ?? 0) >= 90 ? "bg-green-500" :
                                    (score ?? 0) >= 70 ? "bg-blue-500" :
                                    "bg-violet-500"
                                  }`}
                                  style={{ width: `${Math.min(100, ((score ?? 0) / 118) * 100)}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-semibold">{score}</span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="text-xs font-medium px-2 py-1 max-w-[140px]">
                          <div className="flex items-center gap-1 truncate">
                            {broker.linkedin_url && <Linkedin className="w-2.5 h-2.5 text-[#0077b5] shrink-0" />}
                            <span className="truncate">{broker.full_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground px-2 py-1 max-w-[200px]">
                          <span className="truncate block" title={broker.email || ""}>{broker.email || "\u2014"}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap px-2 py-1">{broker.phone || "\u2014"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground px-2 py-1 max-w-[160px]">
                          <span className="truncate block" title={broker.office_name || ""}>{broker.office_name || "\u2014"}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground px-2 py-1">{broker.city || "\u2014"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground px-1 py-1">{broker.state || "\u2014"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums px-1 py-1 text-right">{broker.recently_sold_count || "\u2014"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums px-1 py-1 text-right">{broker.average_price ? formatPrice(String(broker.average_price)) : "\u2014"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums px-1 py-1 text-right">{broker.experience_years ? `${broker.experience_years}y` : "\u2014"}</TableCell>
                        <TableCell className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={broker.outreach_status || "not_contacted"}
                            onValueChange={(v) => statusMutation.mutate({ id: broker.id, status: v as OutreachStatus })}
                          >
                            <SelectTrigger className="h-5 text-[10px] border-0 bg-transparent w-28 p-0.5" data-testid={`select-status-${broker.id}`}>
                              <Badge className={`text-[9px] px-1 py-0 pointer-events-none border-0 ${STATUS_BADGE_VARIANT[broker.outreach_status || "not_contacted"]}`}>
                                {STATUS_LABELS[broker.outreach_status || "not_contacted"]}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {outreachStatusEnum.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {((aiLeadsMode ? aiLeadsData?.brokers : data?.brokers)?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={aiLeadsMode ? 12 : 11} className="h-24 text-center text-muted-foreground text-sm">
                        {aiLeadsMode ? "No matching leads found." : "No brokers found. Try adjusting your filters."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {!aiLeadsMode && data && data.totalPages > 1 && (
          <div className="px-3 py-1.5 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground tabular-nums">
              {((data.page - 1) * 50 + 1).toLocaleString()}-{Math.min(data.page * 50, data.total).toLocaleString()} of {data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs px-2 tabular-nums">{data.page} / {data.totalPages.toLocaleString()}</span>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} data-testid="button-next-page">
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}

        {aiLeadsMode && aiLeadsData && (
          <div className="px-3 py-1.5 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Top {aiLeadsData.brokers.length} of {aiLeadsData.total.toLocaleString()} eligible
            </span>
            <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={exitAiLeadsMode}>
              <X className="w-3 h-3" /> Back
            </Button>
          </div>
        )}
      </div>

      {selectedBrokerId && (
        <BrokerDetail brokerId={selectedBrokerId} onClose={() => setSelectedBrokerId(null)} />
      )}

      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-4 h-4" />
              Save Filter Preset
            </DialogTitle>
            <DialogDescription>
              Save your current filters as a reusable preset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              placeholder="Preset name..."
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPresetName.trim()) {
                  savePresetMutation.mutate(newPresetName.trim());
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={() => savePresetMutation.mutate(newPresetName.trim())}
                disabled={!newPresetName.trim() || savePresetMutation.isPending}
                className="flex-1"
              >
                {savePresetMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Bookmark className="w-4 h-4 mr-2" />}
                Save
              </Button>
              <Button variant="outline" onClick={() => setSavePresetOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDialogOpen} onOpenChange={(open) => { if (!batchRunning) setBatchDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Batch AI Enrich
            </DialogTitle>
            <DialogDescription>
              Find LinkedIn profiles via Apify and generate personalized AI outreach drafts for brokers that haven't been enriched yet.
            </DialogDescription>
          </DialogHeader>

          {!batchProgress ? (
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Batch size (max 100)</label>
                <div className="flex items-center gap-3">
                  <Input type="number" min={1} max={100} value={batchSize}
                    onChange={(e) => setBatchSize(Math.min(100, Math.max(1, parseInt(e.target.value) || 20)))} className="w-24 h-9" />
                  <span className="text-sm text-muted-foreground">leads at a time</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Mode</label>
                <Select value={batchMode} onValueChange={(v) => setBatchMode(v as any)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">LinkedIn + AI Outreach</SelectItem>
                    <SelectItem value="enrich">LinkedIn Enrichment only</SelectItem>
                    <SelectItem value="outreach">AI Outreach only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={runBatchEnrich} className="w-full"><Sparkles className="w-4 h-4 mr-2" />Start Batch</Button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <Progress value={batchProgress.total > 0 ? (batchProgress.processed / batchProgress.total) * 100 : 0} className="h-2" />
              <div className="flex justify-between text-sm">
                <span>{batchProgress.processed} / {batchProgress.total} processed</span>
                <span className="text-green-600">{batchProgress.succeeded} succeeded</span>
              </div>
              {batchProgress.lastBroker && <p className="text-xs text-muted-foreground truncate">Last: {batchProgress.lastBroker}</p>}
              {batchProgress.done ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Complete!</span>
                </div>
              ) : (
                <Button variant="destructive" size="sm" onClick={stopBatch}><X className="w-3 h-3 mr-1" />Stop</Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EnrollModal
        open={enrollModalOpen}
        onClose={() => { setEnrollModalOpen(false); setSelectedIds(new Set()); }}
        entityIds={Array.from(selectedIds)}
        entityType="broker"
        entityName={`${selectedIds.size} brokers`}
        mode="bulk"
      />
    </div>
  );
}
