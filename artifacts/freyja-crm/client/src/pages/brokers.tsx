import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Broker, OutreachStatus, FilterPreset } from "@shared/schema";
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
    name: "High-Value Brokers",
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
    name: "Active Residential",
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
    name: "Commercial Specialists",
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
    name: "Land & Development",
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

  const debouncedBrokerage = useDebounce(filters.brokerage, 400);
  const debouncedCity = useDebounce(filters.city, 400);
  const debouncedDealsMin = useDebounce(filters.dealsClosedMin, 400);
  const debouncedDealsMax = useDebounce(filters.dealsClosedMax, 400);
  const debouncedPriceMin = useDebounce(filters.avgPriceMin, 400);
  const debouncedPriceMax = useDebounce(filters.avgPriceMax, 400);
  const debouncedExpMin = useDebounce(filters.experienceMin, 400);
  const debouncedExpMax = useDebounce(filters.experienceMax, 400);

  const queryFilters = useMemo(() => ({
    ...filters,
    brokerage: debouncedBrokerage,
    city: debouncedCity,
    dealsClosedMin: debouncedDealsMin,
    dealsClosedMax: debouncedDealsMax,
    avgPriceMin: debouncedPriceMin,
    avgPriceMax: debouncedPriceMax,
    experienceMin: debouncedExpMin,
    experienceMax: debouncedExpMax,
  }), [filters.search, filters.state, filters.status, filters.assigned_to, filters.specialties, filters.sourceType, filters.hasEmail, filters.hasPhone, filters.hasLinkedin, filters.sort_by, filters.sort_order, debouncedBrokerage, debouncedCity, debouncedDealsMin, debouncedDealsMax, debouncedPriceMin, debouncedPriceMax, debouncedExpMin, debouncedExpMax]);

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

  const handleSearch = useCallback(() => {
    setFilters(prev => ({ ...prev, search: searchInput }));
    setActivePresetId(null);
  }, [searchInput]);

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
  if (filters.search) activeChips.push({ label: `Search: "${filters.search}"`, key: "search" });
  if (filters.state) activeChips.push({ label: `State: ${filters.state}`, key: "state" });
  if (filters.status) activeChips.push({ label: `Status: ${STATUS_LABELS[filters.status] || filters.status}`, key: "status" });
  if (filters.dealsClosedMin || filters.dealsClosedMax) {
    const min = filters.dealsClosedMin || "0";
    const max = filters.dealsClosedMax || "\u221E";
    activeChips.push({ label: `Deals: ${min}\u2013${max}`, key: "dealsClosedMin" });
  }
  if (filters.avgPriceMin || filters.avgPriceMax) {
    const min = filters.avgPriceMin ? formatPrice(filters.avgPriceMin) : "$0";
    const max = filters.avgPriceMax ? formatPrice(filters.avgPriceMax) : "\u221E";
    activeChips.push({ label: `Avg Price: ${min}\u2013${max}`, key: "avgPriceMin" });
  }
  if (filters.experienceMin || filters.experienceMax) {
    const min = filters.experienceMin || "0";
    const max = filters.experienceMax || "\u221E";
    activeChips.push({ label: `Exp: ${min}\u2013${max} yrs`, key: "experienceMin" });
  }
  if (filters.specialties.length > 0) {
    activeChips.push({ label: `Types: ${filters.specialties.join(", ")}`, key: "specialties" });
  }
  if (filters.brokerage) activeChips.push({ label: `Brokerage: ${filters.brokerage}`, key: "brokerage" });
  if (filters.city) activeChips.push({ label: `City: ${filters.city}`, key: "city" });
  if (filters.sourceType) activeChips.push({ label: `Source: ${filters.sourceType}`, key: "sourceType" });
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
        <div className="p-4 pb-0 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold" data-testid="brokers-title">Brokers</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={openBatchDialog} data-testid="button-batch-enrich">
                <Sparkles className="w-4 h-4 mr-1.5" />
                Batch AI Enrich
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export">
                <Download className="w-4 h-4 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {BUILT_IN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset.id, preset.filters)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-all shrink-0 ${
                  activePresetId === preset.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-border hover:bg-muted hover:border-muted-foreground/30"
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
                  className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 text-xs font-medium rounded-full border whitespace-nowrap transition-all cursor-pointer ${
                    activePresetId === `custom-${preset.id}`
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background border-border hover:bg-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <Bookmark className="w-3 h-3" />
                  {preset.name}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePresetMutation.mutate(preset.id);
                      if (activePresetId === `custom-${preset.id}`) setActivePresetId(null);
                    }}
                    className={`ml-0.5 p-0.5 rounded-full transition-colors ${
                      activePresetId === `custom-${preset.id}`
                        ? "hover:bg-primary-foreground/20"
                        : "hover:bg-destructive/10 hover:text-destructive"
                    }`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {activeFilterCount > 0 && (
              <button
                onClick={() => setSavePresetOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 whitespace-nowrap transition-all shrink-0"
              >
                <Plus className="w-3 h-3" />
                Save Preset
              </button>
            )}

            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-border text-muted-foreground hover:bg-muted whitespace-nowrap transition-all shrink-0"
              >
                <X className="w-3 h-3" />
                Clear All
              </button>
            )}
          </div>

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
            <Button size="sm" variant="secondary" onClick={handleSearch} className="h-9" data-testid="button-search">Search</Button>

            <Select value={filters.state} onValueChange={(v) => updateFilter("state", v === "all" ? "" : v)}>
              <SelectTrigger className="w-[120px] h-9 text-sm" data-testid="select-state">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => updateFilter("status", v === "all" ? "" : v)}>
              <SelectTrigger className="w-[150px] h-9 text-sm" data-testid="select-status">
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
              className="h-9 text-sm gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] rounded-full">
                  {activeFilterCount}
                </Badge>
              )}
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
          </div>

          {showAdvanced && (
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Deals Closed</label>
                  <div className="flex gap-1">
                    <Input
                      type="number" placeholder="Min" value={filters.dealsClosedMin}
                      onChange={(e) => updateFilter("dealsClosedMin", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number" placeholder="Max" value={filters.dealsClosedMax}
                      onChange={(e) => updateFilter("dealsClosedMax", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Avg Deal Price</label>
                  <div className="flex gap-1">
                    <Input
                      type="number" placeholder="Min $" value={filters.avgPriceMin}
                      onChange={(e) => updateFilter("avgPriceMin", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number" placeholder="Max $" value={filters.avgPriceMax}
                      onChange={(e) => updateFilter("avgPriceMax", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Experience (yrs)</label>
                  <div className="flex gap-1">
                    <Input
                      type="number" placeholder="Min" value={filters.experienceMin}
                      onChange={(e) => updateFilter("experienceMin", e.target.value)}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number" placeholder="Max" value={filters.experienceMax}
                      onChange={(e) => updateFilter("experienceMax", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Brokerage</label>
                  <Input
                    placeholder="Search brokerage..." value={filters.brokerage}
                    onChange={(e) => updateFilter("brokerage", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">City</label>
                  <Input
                    placeholder="Search city..." value={filters.city}
                    onChange={(e) => updateFilter("city", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Source</label>
                  <Select value={filters.sourceType} onValueChange={(v) => updateFilter("sourceType", v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      {SOURCE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Property Types:</label>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIALTIES.map((spec) => (
                    <button
                      key={spec}
                      onClick={() => toggleSpecialty(spec)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        filters.specialties.includes(spec)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      {spec}
                    </button>
                  ))}
                </div>

                <div className="ml-auto flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={filters.hasEmail} onCheckedChange={(v) => updateFilter("hasEmail", !!v)} />
                    <Mail className="w-3 h-3" /> Has Email
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={filters.hasPhone} onCheckedChange={(v) => updateFilter("hasPhone", !!v)} />
                    <Phone className="w-3 h-3" /> Has Phone
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox checked={filters.hasLinkedin} onCheckedChange={(v) => updateFilter("hasLinkedin", !!v)} />
                    <Linkedin className="w-3 h-3" /> Has LinkedIn
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {activeChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="pl-2 pr-1 py-0.5 text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                  onClick={() => {
                    if (chip.key === "dealsClosedMin") { removeFilter("dealsClosedMin"); removeFilter("dealsClosedMax"); }
                    else if (chip.key === "avgPriceMin") { removeFilter("avgPriceMin"); removeFilter("avgPriceMax"); }
                    else if (chip.key === "experienceMin") { removeFilter("experienceMin"); removeFilter("experienceMax"); }
                    else removeFilter(chip.key);
                  }}
                >
                  {chip.label}
                  <X className="w-3 h-3" />
                </Badge>
              ))}
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Select onValueChange={(v) => bulkMutation.mutate(v as OutreachStatus)}>
                <SelectTrigger className="w-[160px] h-8 text-sm" data-testid="select-bulk-status">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectContent>
                  {outreachStatusEnum.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">Clear</Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={data && data.brokers.length > 0 && selectedIds.size === data.brokers.length}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="text-xs font-medium cursor-pointer select-none" onClick={() => toggleSort("full_name")}>
                      <span className="flex items-center">Name <SortIcon field="full_name" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">Email</TableHead>
                    <TableHead className="text-xs font-medium">Phone</TableHead>
                    <TableHead className="text-xs font-medium cursor-pointer select-none" onClick={() => toggleSort("office_name")}>
                      <span className="flex items-center">Office <SortIcon field="office_name" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium">City</TableHead>
                    <TableHead className="text-xs font-medium w-16 cursor-pointer select-none" onClick={() => toggleSort("state")}>
                      <span className="flex items-center">State <SortIcon field="state" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-16 cursor-pointer select-none" onClick={() => toggleSort("recently_sold_count")}>
                      <span className="flex items-center">Sold <SortIcon field="recently_sold_count" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-20 cursor-pointer select-none" onClick={() => toggleSort("average_price")}>
                      <span className="flex items-center">Avg $ <SortIcon field="average_price" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-12 cursor-pointer select-none" onClick={() => toggleSort("experience_years")}>
                      <span className="flex items-center">Exp <SortIcon field="experience_years" /></span>
                    </TableHead>
                    <TableHead className="text-xs font-medium w-40">Status</TableHead>
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
                      <TableCell className="text-sm font-medium max-w-[160px]">
                        <div className="flex items-center gap-1 truncate">
                          {broker.linkedin_url && <Linkedin className="w-3 h-3 text-[#0077b5] shrink-0" />}
                          <span className="truncate">{broker.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">{broker.email || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{broker.phone || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{broker.office_name || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{broker.city || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{broker.state || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{broker.recently_sold_count || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{broker.average_price || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{broker.experience_years ? `${broker.experience_years}y` : "\u2014"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={broker.outreach_status || "not_contacted"}
                          onValueChange={(v) => statusMutation.mutate({ id: broker.id, status: v as OutreachStatus })}
                        >
                          <SelectTrigger className="h-7 text-xs border-0 bg-transparent w-36 p-1" data-testid={`select-status-${broker.id}`}>
                            <Badge className={`text-[10px] px-1.5 py-0 pointer-events-none border-0 ${STATUS_BADGE_VARIANT[broker.outreach_status || "not_contacted"]}`}>
                              {STATUS_LABELS[broker.outreach_status || "not_contacted"]}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {outreachStatusEnum.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data?.brokers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                        No brokers found. Try adjusting your filters.
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
              Showing {(data.page - 1) * 50 + 1}\u2013{Math.min(data.page * 50, data.total)} of {data.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} data-testid="button-prev-page">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm px-3 tabular-nums">Page {data.page} of {data.totalPages.toLocaleString()}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} data-testid="button-next-page">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
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
    </div>
  );
}
