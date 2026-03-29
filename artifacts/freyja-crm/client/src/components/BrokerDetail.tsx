import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Broker, OutreachStatus, OutreachLog, MessageTemplate, OutreachLogStatus, OutreachEnrollment } from "@shared/schema";
import { outreachStatusEnum, outreachLogStatusEnum } from "@shared/schema";
import { EnrollModal } from "./EnrollModal";
import { OutreachTimeline } from "./OutreachTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Copy,
  Mail,
  Phone,
  Building2,
  MapPin,
  Globe,
  Briefcase,
  Calendar,
  ExternalLink,
  User,
  Linkedin,
  Loader2,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Check,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  closed: "Closed",
};

const LOG_STATUS_LABELS: Record<string, string> = {
  contacted: "Contacted",
  responded: "Responded",
  meeting_set: "Meeting Set",
  closed: "Closed",
  no_response: "No Response",
};

const LOG_STATUS_BADGE: Record<string, string> = {
  contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  responded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  meeting_set: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-primary/10 text-primary",
  no_response: "bg-muted text-muted-foreground",
};

const LOG_TYPE_ICON: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="w-3 h-3 text-[#0077b5]" />,
  email: <Mail className="w-3 h-3 text-muted-foreground" />,
  phone: <Phone className="w-3 h-3 text-muted-foreground" />,
};

interface BrokerDetailProps {
  brokerId: number;
  onClose: () => void;
}

function applyPlaceholders(text: string, broker: Broker): string {
  return text
    .replace(/\{\{broker_name\}\}/g, broker.full_name || "")
    .replace(/\{\{company_name\}\}/g, broker.office_name || "their brokerage");
}

export function BrokerDetail({ brokerId, onClose }: BrokerDetailProps) {
  const { toast } = useToast();

  const { data: broker, isLoading, refetch } = useQuery<Broker>({
    queryKey: ["/api/brokers", brokerId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brokers/${brokerId}`);
      return res.json();
    },
  });

  const { data: outreachLogs = [], refetch: refetchLogs } = useQuery<OutreachLog[]>({
    queryKey: ["/api/brokers", brokerId, "outreach-log"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/brokers/${brokerId}/outreach-log`);
      return res.json();
    },
    enabled: !!brokerId,
  });

  const { data: templates = [] } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/message-templates");
      return res.json();
    },
  });

  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const { data: enrollments = [] } = useQuery<OutreachEnrollment[]>({
    queryKey: ["/api/outreach/enrollments", "broker", String(brokerId)],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/outreach/enrollments/broker/${brokerId}`);
      return res.json();
    },
    enabled: !!brokerId,
  });

  const [status, setStatus] = useState<OutreachStatus>("not_contacted");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lastContacted, setLastContacted] = useState("");

  // LinkedIn URL editing
  const [editingLinkedinUrl, setEditingLinkedinUrl] = useState(false);
  const [linkedinUrlDraft, setLinkedinUrlDraft] = useState("");

  // Outreach log form
  const [logType, setLogType] = useState<"linkedin" | "email" | "phone">("linkedin");
  const [logStatus, setLogStatus] = useState<OutreachLogStatus>("contacted");
  const [logNotes, setLogNotes] = useState("");
  const [logFollowUp, setLogFollowUp] = useState("");
  const [showLogForm, setShowLogForm] = useState(false);

  // Template copy
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    if (broker) {
      setStatus((broker.outreach_status as OutreachStatus) || "not_contacted");
      setAssignedTo(broker.assigned_to || "");
      setNotes(broker.notes || "");
      setLastContacted(broker.last_contacted_at || "");
    }
  }, [broker]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/brokers/${brokerId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Broker updated" });
    },
  });

  const saveLinkedinUrl = () => {
    updateMutation.mutate({ linkedin_url: linkedinUrlDraft.trim() || null });
    refetch();
    setEditingLinkedinUrl(false);
  };

  const enrichLinkedInMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brokers/${brokerId}/enrich-linkedin`);
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      if (data.found) {
        toast({ title: "LinkedIn profile found!" });
      } else {
        toast({ title: "No LinkedIn profile found", description: "You can add the URL manually below." });
      }
    },
    onError: () => toast({ title: "LinkedIn search failed", variant: "destructive" }),
  });

  const generateEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brokers/${brokerId}/generate-outreach`, { mode: "email" });
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "Email draft ready!" }); },
    onError: () => toast({ title: "Failed to generate email", variant: "destructive" }),
  });

  const generateLinkedInMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brokers/${brokerId}/generate-outreach`, { mode: "linkedin" });
      return res.json();
    },
    onSuccess: () => { refetch(); toast({ title: "LinkedIn message ready!" }); },
    onError: () => toast({ title: "Failed to generate LinkedIn message", variant: "destructive" }),
  });

  const logOutreachMutation = useMutation({
    mutationFn: async (data: { outreach_type: string; status: string; notes?: string; follow_up_date?: string; message_template_used?: string }) => {
      const res = await apiRequest("POST", `/api/brokers/${brokerId}/outreach-log`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach-log/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      setShowLogForm(false);
      setLogNotes("");
      setLogFollowUp("");
      toast({ title: "Outreach logged" });
    },
  });

  const handleMessageOnLinkedIn = () => {
    if (!broker) return;
    const url = broker.linkedin_url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      logOutreachMutation.mutate({
        outreach_type: "linkedin",
        status: "contacted",
        notes: "Opened LinkedIn profile to send message",
      });
    }
  };

  const handleCopyTemplate = () => {
    if (!broker || !selectedTemplateId) return;
    const template = templates.find(t => String(t.id) === selectedTemplateId);
    if (!template) return;
    const text = applyPlaceholders(template.body_text, broker);
    navigator.clipboard.writeText(text);
    toast({ title: `"${template.name}" copied with broker info filled in` });
  };

  const handleSave = () => {
    updateMutation.mutate({
      outreach_status: status,
      assigned_to: assignedTo || null,
      notes: notes || null,
      last_contacted_at: lastContacted || null,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const linkedInManualSearchUrl = broker
    ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
        broker.full_name + (broker.office_name ? " " + broker.office_name : "")
      )}`
    : "";

  const mailtoUrl = broker?.outreach_email_subject && broker?.email
    ? `mailto:${broker.email}?subject=${encodeURIComponent(broker.outreach_email_subject)}&body=${encodeURIComponent(broker.outreach_email_body || "")}`
    : broker?.outreach_email_subject
    ? `mailto:?subject=${encodeURIComponent(broker.outreach_email_subject)}&body=${encodeURIComponent(broker.outreach_email_body || "")}`
    : "";

  if (isLoading) {
    return (
      <div className="w-96 border-l bg-card flex flex-col" data-testid="broker-detail-panel">
        <div className="p-4 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!broker) return null;

  return (
    <div className="w-96 border-l bg-card flex flex-col overflow-hidden shrink-0" data-testid="broker-detail-panel">
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate" data-testid="text-broker-name">
            {broker.full_name}
          </h2>
          {broker.job_title && <p className="text-xs text-muted-foreground mt-0.5">{broker.job_title}</p>}
          {broker.office_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />
              {broker.office_name}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0 -mt-1 -mr-2" data-testid="button-close-detail">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">

        {/* Contact info */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact</h3>
          {broker.email && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{broker.email}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(broker.email!, "Email")} className="shrink-0 h-7 w-7 p-0">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          )}
          {broker.email_secondary && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate text-muted-foreground">{broker.email_secondary}</span>
            </div>
          )}
          {broker.phone && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span>{broker.phone}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(broker.phone!, "Phone")} className="shrink-0 h-7 w-7 p-0">
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          )}
          {broker.mobile && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">{broker.mobile} (mobile)</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Location */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Location</h3>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>{[broker.city, broker.state, broker.zip_code].filter(Boolean).join(", ") || "—"}</span>
          </div>
          {broker.address && <p className="text-sm text-muted-foreground pl-5">{broker.address}</p>}
        </div>

        <Separator />

        {/* Professional info */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Professional</h3>
          {broker.license_number && (
            <div className="flex items-center gap-2 text-sm">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span>{broker.license_number}</span>
            </div>
          )}
          {broker.experience_years && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span>{broker.experience_years} years experience</span>
            </div>
          )}
          {broker.specialties && (
            <div className="text-sm">
              <span className="text-muted-foreground text-xs">Specialties: </span>
              {broker.specialties}
            </div>
          )}
          {broker.languages && (
            <div className="text-sm">
              <span className="text-muted-foreground text-xs">Languages: </span>
              {broker.languages}
            </div>
          )}
        </div>

        {/* Sales data */}
        {(broker.for_sale_count || broker.recently_sold_count || broker.average_price) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sales Data</h3>
              <div className="grid grid-cols-3 gap-2">
                {broker.for_sale_count && (
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm font-semibold">{broker.for_sale_count}</div>
                    <div className="text-[10px] text-muted-foreground">For Sale</div>
                  </div>
                )}
                {broker.recently_sold_count && (
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm font-semibold">{broker.recently_sold_count}</div>
                    <div className="text-[10px] text-muted-foreground">Sold</div>
                  </div>
                )}
                {broker.average_price && (
                  <div className="text-center p-2 bg-muted/50 rounded">
                    <div className="text-sm font-semibold">{broker.average_price}</div>
                    <div className="text-[10px] text-muted-foreground">Avg Price</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Links */}
        {(broker.website || broker.profile_url || broker.social_media) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Links</h3>
              {broker.website && (
                <a href={broker.website.startsWith("http") ? broker.website : `https://${broker.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Globe className="w-3.5 h-3.5 shrink-0" />Website<ExternalLink className="w-3 h-3" />
                </a>
              )}
              {broker.profile_url && (
                <a href={broker.profile_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <User className="w-3.5 h-3.5 shrink-0" />Profile<ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </>
        )}

        {broker.description && (
          <>
            <Separator />
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">{broker.description}</p>
            </div>
          </>
        )}

        <Separator />

        {/* ─── LinkedIn Outreach Panel ──────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />
              LinkedIn
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2"
              onClick={() => enrichLinkedInMutation.mutate()}
              disabled={enrichLinkedInMutation.isPending}
              data-testid="button-enrich-linkedin"
            >
              {enrichLinkedInMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {broker.linkedin_enriched_at ? "Re-search" : "Auto-Find"}
            </Button>
          </div>

          {/* LinkedIn URL display / edit */}
          {editingLinkedinUrl ? (
            <div className="flex gap-1.5">
              <Input
                value={linkedinUrlDraft}
                onChange={(e) => setLinkedinUrlDraft(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="h-8 text-xs flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveLinkedinUrl(); if (e.key === "Escape") setEditingLinkedinUrl(false); }}
              />
              <Button size="sm" className="h-8 w-8 p-0" onClick={saveLinkedinUrl} disabled={updateMutation.isPending}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditingLinkedinUrl(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : broker.linkedin_url ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <a
                  href={broker.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#0077b5] hover:underline font-medium flex-1 min-w-0"
                  data-testid="link-linkedin-profile"
                >
                  <Linkedin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{broker.linkedin_headline || "View LinkedIn Profile"}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <button
                  onClick={() => { setLinkedinUrlDraft(broker.linkedin_url || ""); setEditingLinkedinUrl(true); }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
              {broker.linkedin_location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 pl-0.5">
                  <MapPin className="w-3 h-3" />{broker.linkedin_location}
                </p>
              )}
              {broker.linkedin_enriched_at && (
                <p className="text-[10px] text-muted-foreground pl-0.5">
                  Found {new Date(broker.linkedin_enriched_at).toLocaleDateString()}
                </p>
              )}

              {/* Message on LinkedIn button */}
              <Button
                className="w-full h-8 text-xs gap-1.5 bg-[#0077b5] hover:bg-[#006097] text-white"
                onClick={handleMessageOnLinkedIn}
                data-testid="button-message-linkedin"
              >
                <Linkedin className="w-3.5 h-3.5" />
                Message on LinkedIn
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {broker.linkedin_enriched_at && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle className="w-3.5 h-3.5" />
                  No profile found automatically
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => { setLinkedinUrlDraft(""); setEditingLinkedinUrl(true); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" />
                  Add LinkedIn URL manually
                </button>
              </div>
              <a href={linkedInManualSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Search className="w-3 h-3" />
                Search on LinkedIn
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Template copy */}
          {templates.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Copy Template</p>
              <div className="flex gap-1.5">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Pick a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs gap-1 shrink-0"
                  disabled={!selectedTemplateId}
                  onClick={handleCopyTemplate}
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              {selectedTemplateId && (
                <p className="text-[10px] text-muted-foreground">
                  Placeholders will be replaced with this broker's name and company.
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* ─── Log Outreach ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Log Outreach
            </h3>
            <Button
              variant={showLogForm ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setShowLogForm(!showLogForm)}
            >
              {showLogForm ? <X className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
              {showLogForm ? "Cancel" : "Log Contact"}
            </Button>
          </div>

          {showLogForm && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase">Type</label>
                  <Select value={logType} onValueChange={(v) => setLogType(v as any)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="linkedin">LinkedIn</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground uppercase">Outcome</label>
                  <Select value={logStatus} onValueChange={(v) => setLogStatus(v as OutreachLogStatus)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {outreachLogStatusEnum.map(s => (
                        <SelectItem key={s} value={s}>{LOG_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase">Notes</label>
                <Textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Optional notes..."
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground uppercase">Follow-up date</label>
                <Input
                  type="date"
                  value={logFollowUp}
                  onChange={(e) => setLogFollowUp(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <Button
                size="sm"
                className="w-full h-8 text-xs gap-1.5"
                onClick={() => logOutreachMutation.mutate({
                  outreach_type: logType,
                  status: logStatus,
                  notes: logNotes || undefined,
                  follow_up_date: logFollowUp || undefined,
                })}
                disabled={logOutreachMutation.isPending}
              >
                {logOutreachMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Save Log Entry
              </Button>
            </div>
          )}
        </div>

        {/* ─── Outreach History ─────────────────────────────────────────────── */}
        {outreachLogs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <button
                className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                onClick={() => setShowHistory(!showHistory)}
              >
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Outreach History ({outreachLogs.length})
                </span>
                {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showHistory && (
                <div className="space-y-2">
                  {outreachLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30 border border-border/40">
                      <div className="mt-0.5 shrink-0">{LOG_TYPE_ICON[log.outreach_type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className={`text-[9px] px-1.5 py-0 border-0 h-4 ${LOG_STATUS_BADGE[log.status] || "bg-muted text-muted-foreground"}`}>
                            {LOG_STATUS_LABELS[log.status] || log.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {log.notes && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{log.notes}</p>}
                        {log.follow_up_date && (
                          <p className="text-[10px] text-orange-600 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Follow up: {log.follow_up_date}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* ─── Sequence Enrollment ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Email Sequences
            </h3>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2.5" onClick={() => setShowEnrollModal(true)}>
              <Zap className="w-3 h-3" /> Enroll
            </Button>
          </div>

          {enrollments.length > 0 ? (
            <div className="space-y-1.5">
              {enrollments.map(en => {
                const statusBadge: Record<string, string> = {
                  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                  replied: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                  bounced: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                  unsubscribed: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                };
                return (
                  <div key={en.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className={`text-[9px] px-1.5 py-0 border-0 h-4 ${statusBadge[en.status] || "bg-muted text-muted-foreground"}`}>
                        {en.status}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">Step {en.current_step}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {en.created_at ? new Date(en.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Not enrolled in any sequence</p>
          )}
        </div>

        {/* ─── Sequence Timeline ───────────────────────────────────────────── */}
        <OutreachTimeline entityId={brokerId} entityType="broker" />

        <EnrollModal
          open={showEnrollModal}
          onClose={() => setShowEnrollModal(false)}
          entityId={brokerId}
          entityType="broker"
          entityName={broker.full_name}
        />

        <Separator />

        {/* Email Outreach */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              AI Email Draft
            </h3>
            <Button
              variant={broker.outreach_email_subject ? "ghost" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5"
              onClick={() => generateEmailMutation.mutate()}
              disabled={generateEmailMutation.isPending}
              data-testid="button-generate-email"
            >
              {generateEmailMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {generateEmailMutation.isPending ? "Writing..." : broker.outreach_email_subject ? "Regenerate" : "Generate Email"}
            </Button>
          </div>

          {broker.outreach_email_subject ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Subject</p>
                  <p className="text-xs font-medium leading-snug">{broker.outreach_email_subject}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => copyToClipboard(broker.outreach_email_subject!, "Subject")}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Body</p>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyToClipboard(broker.outreach_email_body!, "Email body")}>
                    <Copy className="w-3 h-3" />Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 leading-relaxed whitespace-pre-wrap max-h-44 overflow-auto border border-border/50">
                  {broker.outreach_email_body}
                </p>
              </div>
              {mailtoUrl && (
                <a href={mailtoUrl} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Mail className="w-3 h-3" />Open in email client<ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Generate a personalized cold email for this broker.</p>
          )}
        </div>

        <Separator />

        {/* LinkedIn AI Message */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Linkedin className="w-3.5 h-3.5" />
              AI LinkedIn Message
            </h3>
            <Button
              variant={broker.outreach_linkedin_message ? "ghost" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5 px-2.5"
              onClick={() => generateLinkedInMutation.mutate()}
              disabled={generateLinkedInMutation.isPending}
              data-testid="button-generate-linkedin"
            >
              {generateLinkedInMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {generateLinkedInMutation.isPending ? "Writing..." : broker.outreach_linkedin_message ? "Regenerate" : "Generate Message"}
            </Button>
          </div>

          {broker.outreach_linkedin_message ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">Message</p>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => copyToClipboard(broker.outreach_linkedin_message!, "LinkedIn message")}>
                    <Copy className="w-3 h-3" />Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5 leading-relaxed whitespace-pre-wrap border border-border/50">
                  {broker.outreach_linkedin_message}
                </p>
              </div>
              {broker.linkedin_url ? (
                <a href={broker.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#0077b5] hover:underline">
                  <Linkedin className="w-3 h-3" />Open LinkedIn Profile<ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <a href={linkedInManualSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Search className="w-3 h-3" />Find on LinkedIn<ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Generate a short connection request message for LinkedIn.</p>
          )}
        </div>

        <Separator />

        {/* CRM fields */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CRM</h3>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as OutreachStatus)}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-detail-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outreachStatusEnum.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Assigned To</label>
            <Input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Team member name" className="h-8 text-sm" data-testid="input-assigned-to" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Last Contacted</label>
            <Input type="date" value={lastContacted} onChange={(e) => setLastContacted(e.target.value)} className="h-8 text-sm" data-testid="input-last-contacted" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes about this broker..." rows={3} className="text-sm resize-none" data-testid="textarea-notes" />
          </div>

          <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full h-8 text-sm" data-testid="button-save-broker">
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        {/* Source info */}
        {(broker.source_type || broker.source_file) && (
          <>
            <Separator />
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              {broker.source_type && <div>Source: {broker.source_type}</div>}
              {broker.source_file && <div>File: {broker.source_file}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
