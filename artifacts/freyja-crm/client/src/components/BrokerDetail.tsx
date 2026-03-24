import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Broker, OutreachStatus } from "@shared/schema";
import { outreachStatusEnum } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  contacted: "Contacted",
  interested: "Interested",
  not_interested: "Not Interested",
  closed: "Closed",
};

interface BrokerDetailProps {
  brokerId: number;
  onClose: () => void;
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

  const [status, setStatus] = useState<OutreachStatus>("not_contacted");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lastContacted, setLastContacted] = useState("");

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
        toast({
          title: "No LinkedIn profile found",
          description: "A manual search link is shown below.",
        });
      }
    },
    onError: () => {
      toast({ title: "LinkedIn search failed", variant: "destructive" });
    },
  });

  const generateOutreachMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/brokers/${brokerId}/generate-outreach`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Outreach drafts generated!" });
    },
    onError: () => {
      toast({ title: "Failed to generate outreach", variant: "destructive" });
    },
  });

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
    <div
      className="w-96 border-l bg-card flex flex-col overflow-hidden shrink-0"
      data-testid="broker-detail-panel"
    >
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate" data-testid="text-broker-name">
            {broker.full_name}
          </h2>
          {broker.job_title && (
            <p className="text-xs text-muted-foreground mt-0.5">{broker.job_title}</p>
          )}
          {broker.office_name && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" />
              {broker.office_name}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="shrink-0 -mt-1 -mr-2"
          data-testid="button-close-detail"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Contact info */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Contact
          </h3>
          {broker.email && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{broker.email}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(broker.email!, "Email")}
                className="shrink-0 h-7 w-7 p-0"
              >
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(broker.phone!, "Phone")}
                className="shrink-0 h-7 w-7 p-0"
              >
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
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Location
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span>
              {[broker.city, broker.state, broker.zip_code].filter(Boolean).join(", ") || "—"}
            </span>
          </div>
          {broker.address && (
            <p className="text-sm text-muted-foreground pl-5">{broker.address}</p>
          )}
        </div>

        <Separator />

        {/* Professional info */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Professional
          </h3>
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
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sales Data
              </h3>
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
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Links
              </h3>
              {broker.website && (
                <a
                  href={broker.website.startsWith("http") ? broker.website : `https://${broker.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  Website
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {broker.profile_url && (
                <a
                  href={broker.profile_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  Profile
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {broker.social_media && (
                <div className="text-sm text-muted-foreground">
                  <span className="text-xs">Social: </span>
                  {broker.social_media.split(";").map((link, i) => (
                    <a
                      key={i}
                      href={link.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline block truncate"
                    >
                      {link.trim()}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Description */}
        {broker.description && (
          <>
            <Separator />
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Description
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
                {broker.description}
              </p>
            </div>
          </>
        )}

        <Separator />

        {/* LinkedIn Enrichment */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
              {enrichLinkedInMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Search className="w-3 h-3" />
              )}
              {broker.linkedin_enriched_at ? "Re-search" : "Find Profile"}
            </Button>
          </div>

          {broker.linkedin_url ? (
            <div className="space-y-1.5">
              <a
                href={broker.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-[#0077b5] hover:underline font-medium"
                data-testid="link-linkedin-profile"
              >
                <Linkedin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {broker.linkedin_headline || "View LinkedIn Profile"}
                </span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              {broker.linkedin_location && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 pl-0.5">
                  <MapPin className="w-3 h-3" />
                  {broker.linkedin_location}
                </p>
              )}
              {broker.linkedin_email_found && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 pl-0.5">
                  <Mail className="w-3 h-3" />
                  {broker.linkedin_email_found}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground pl-0.5">
                Enriched {new Date(broker.linkedin_enriched_at!).toLocaleDateString()}
              </p>
            </div>
          ) : broker.linkedin_enriched_at ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5" />
                No LinkedIn profile found automatically
              </div>
              <a
                href={linkedInManualSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Search className="w-3 h-3" />
                Search manually on LinkedIn
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Click "Find Profile" to search LinkedIn automatically.
            </p>
          )}
        </div>

        <Separator />

        {/* AI Outreach */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AI Outreach
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 px-2"
              onClick={() => generateOutreachMutation.mutate()}
              disabled={generateOutreachMutation.isPending}
              data-testid="button-generate-outreach"
            >
              {generateOutreachMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {broker.outreach_generated_at ? "Regenerate" : "Generate"}
            </Button>
          </div>

          {generateOutreachMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Generating personalized outreach with AI...
            </div>
          )}

          {broker.outreach_email_subject ? (
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="w-full h-8 text-xs">
                <TabsTrigger value="email" className="flex-1 text-xs">
                  <Mail className="w-3 h-3 mr-1" />
                  Email
                </TabsTrigger>
                <TabsTrigger value="linkedin" className="flex-1 text-xs">
                  <Linkedin className="w-3 h-3 mr-1" />
                  LinkedIn
                </TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-2 mt-2">
                {/* Subject */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      Subject
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(broker.outreach_email_subject!, "Subject")}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs font-medium bg-muted/50 rounded p-2">
                    {broker.outreach_email_subject}
                  </p>
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      Body
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(broker.outreach_email_body!, "Email body")}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed whitespace-pre-wrap max-h-48 overflow-auto">
                    {broker.outreach_email_body}
                  </p>
                </div>

                {/* Open in email client */}
                {mailtoUrl && (
                  <a
                    href={mailtoUrl}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Mail className="w-3 h-3" />
                    Open in email client
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {broker.outreach_generated_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Generated {new Date(broker.outreach_generated_at).toLocaleDateString()}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="linkedin" className="space-y-2 mt-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                      Connection Message
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        copyToClipboard(broker.outreach_linkedin_message!, "LinkedIn message")
                      }
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 leading-relaxed whitespace-pre-wrap">
                    {broker.outreach_linkedin_message}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-right">
                    {(broker.outreach_linkedin_message || "").length}/300 chars
                  </p>
                </div>

                {broker.linkedin_url ? (
                  <a
                    href={broker.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-[#0077b5] hover:underline"
                  >
                    <Linkedin className="w-3 h-3" />
                    Open LinkedIn Profile
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <a
                    href={linkedInManualSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Search className="w-3 h-3" />
                    Find on LinkedIn
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </TabsContent>
            </Tabs>
          ) : !generateOutreachMutation.isPending ? (
            <p className="text-xs text-muted-foreground">
              Click "Generate" to create a personalized email and LinkedIn message for this lead.
            </p>
          ) : null}
        </div>

        <Separator />

        {/* CRM fields */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            CRM
          </h3>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(v) => setStatus(v as OutreachStatus)}>
              <SelectTrigger className="h-8 text-sm" data-testid="select-detail-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outreachStatusEnum.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Assigned To</label>
            <Input
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Team member name"
              className="h-8 text-sm"
              data-testid="input-assigned-to"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Last Contacted</label>
            <Input
              type="date"
              value={lastContacted}
              onChange={(e) => setLastContacted(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-last-contacted"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this broker..."
              rows={3}
              className="text-sm resize-none"
              data-testid="textarea-notes"
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="w-full h-8 text-sm"
            data-testid="button-save-broker"
          >
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
