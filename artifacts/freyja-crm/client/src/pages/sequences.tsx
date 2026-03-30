import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutreachSequence, OutreachSequenceStep } from "@shared/schema";
import { channelTypeEnum, targetEntityTypeEnum, stepTypeEnum } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Trash2, Mail, Linkedin, ClipboardList, Play, Pause,
  ChevronDown, ChevronUp, ArrowLeft, GripVertical, Zap, Send,
  Users, Clock, ArrowUpDown,
} from "lucide-react";

interface SequenceStats {
  totalEnrolled: number;
  active: number;
  completed: number;
  bounced: number;
  replied: number;
  failed: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
}

interface EnrolledBroker {
  id: number;
  entity_id: number;
  priority: number;
  status: string;
  current_step: number;
  next_send_at: string | null;
  last_sent_at: string | null;
  created_at: string | null;
  broker_name: string | null;
  broker_email: string | null;
  broker_state: string | null;
}

type SequenceWithSteps = OutreachSequence & { steps: OutreachSequenceStep[]; stats?: SequenceStats };

const CHANNEL_LABELS: Record<string, string> = { email: "Email", linkedin: "LinkedIn", multi: "Multi-Channel" };
const STEP_TYPE_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-3.5 h-3.5" />,
  linkedin: <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />,
  manual_task: <ClipboardList className="w-3.5 h-3.5 text-orange-500" />,
};

const ENROLLMENT_STATUS_BADGE: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  bounced: "bg-red-100 text-red-700",
  replied: "bg-purple-100 text-purple-700",
  failed: "bg-red-100 text-red-700",
  unsubscribed: "bg-muted text-muted-foreground",
};

interface StepDraft {
  step_number: number;
  step_type: string;
  subject_template: string;
  body_template: string;
  delay_days: number;
  stop_on_reply: boolean;
}

function emptyStep(n: number): StepDraft {
  return { step_number: n, step_type: "email", subject_template: "", body_template: "", delay_days: n === 1 ? 0 : 3, stop_on_reply: true };
}

const PRIORITY_LABELS: Record<number, { label: string; class: string }> = {
  0: { label: "Normal", class: "bg-muted text-muted-foreground" },
  5: { label: "High", class: "bg-amber-100 text-amber-700" },
  10: { label: "Urgent", class: "bg-red-100 text-red-700" },
};

function getPriorityDisplay(p: number) {
  if (p >= 10) return PRIORITY_LABELS[10];
  if (p >= 5) return PRIORITY_LABELS[5];
  return PRIORITY_LABELS[0];
}

function PriorityInlineEdit({ enrollmentId, currentPriority, sequenceId, disabled }: { enrollmentId: number; currentPriority: number; sequenceId: number; disabled?: boolean }) {
  const { toast } = useToast();
  const display = getPriorityDisplay(currentPriority);
  const mutation = useMutation({
    mutationFn: async (newPriority: number) => {
      const res = await apiRequest("PATCH", `/api/outreach/enrollments/${enrollmentId}/priority`, { priority: newPriority });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/sequences", sequenceId, "enrollments"] });
    },
    onError: (e: Error) => toast({ title: "Failed to update priority", description: e.message, variant: "destructive" }),
  });

  if (disabled) {
    return <Badge className={`text-[8px] px-1 py-0 border-0 ${display.class}`}>{display.label}</Badge>;
  }

  return (
    <Select value={String(currentPriority)} onValueChange={(v) => mutation.mutate(Number(v))}>
      <SelectTrigger className="h-5 w-[70px] text-[9px] px-1 border-0 bg-transparent">
        <Badge className={`text-[8px] px-1 py-0 border-0 ${display.class}`}>{display.label}</Badge>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="0"><span className="text-xs">Normal</span></SelectItem>
        <SelectItem value="5"><span className="text-xs">High</span></SelectItem>
        <SelectItem value="10"><span className="text-xs">Urgent</span></SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function SequencesPage() {
  const { toast } = useToast();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showEnrollmentsFor, setShowEnrollmentsFor] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("email");
  const [targetType, setTargetType] = useState("broker");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(1)]);

  const { data: sequences, isLoading } = useQuery<SequenceWithSteps[]>({
    queryKey: ["/api/outreach/sequences"],
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery<EnrolledBroker[]>({
    queryKey: ["/api/outreach/sequences", showEnrollmentsFor, "enrollments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/outreach/sequences/${showEnrollmentsFor}/enrollments`);
      return res.json();
    },
    enabled: showEnrollmentsFor !== null,
  });

  const createMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/outreach/sequences", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/sequences"] });
      toast({ title: "Sequence created" });
      resetBuilder();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sendDueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outreach/send-due", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Send Due Complete", description: `Sent: ${data.sent}, Skipped: ${data.skipped}, Errors: ${data.errors}` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function resetBuilder() {
    setShowBuilder(false);
    setEditingId(null);
    setName("");
    setChannelType("email");
    setTargetType("broker");
    setSteps([emptyStep(1)]);
  }

  function addStep() {
    setSteps(prev => [...prev, emptyStep(prev.length + 1)]);
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })));
  }

  function updateStep(idx: number, field: keyof StepDraft, value: any) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  function handleSave() {
    if (!name.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (steps.length === 0) { toast({ title: "Add at least one step", variant: "destructive" }); return; }

    createMutation.mutate({
      name: name.trim(),
      channel_type: channelType,
      target_entity_type: targetType,
      steps: steps.map(s => ({
        step_number: s.step_number,
        step_type: s.step_type,
        subject_template: s.subject_template || null,
        body_template: s.body_template || null,
        delay_days: s.delay_days,
        stop_on_reply: s.stop_on_reply,
      })),
    });
  }

  function formatNextSend(dateStr: string | null) {
    if (!dateStr) return "\u2014";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHrs = Math.round(diffMs / (1000 * 60 * 60));
    if (diffHrs < 0) return "Overdue";
    if (diffHrs < 24) return `${diffHrs}h`;
    return `${Math.round(diffHrs / 24)}d`;
  }

  if (showBuilder) {
    return (
      <div className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={resetBuilder}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <h1 className="text-lg font-semibold">{editingId ? "Edit Sequence" : "New Sequence"}</h1>
        </div>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Sequence Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Broker Intro" className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Channel</label>
                <Select value={channelType} onValueChange={setChannelType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channelTypeEnum.map(c => <SelectItem key={c} value={c}>{CHANNEL_LABELS[c] || c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Target Type</label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {targetEntityTypeEnum.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Steps</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addStep}><Plus className="w-3 h-3 mr-1" /> Add Step</Button>
          </div>

          {steps.map((step, idx) => (
            <Card key={idx} className="border-l-4 border-l-primary/40">
              <CardContent className="pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Step {step.step_number}</span>
                    {STEP_TYPE_ICONS[step.step_type]}
                  </div>
                  <div className="flex items-center gap-2">
                    {idx > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">Wait</span>
                        <Input type="number" min={0} value={step.delay_days} onChange={e => updateStep(idx, "delay_days", parseInt(e.target.value) || 0)} className="w-14 h-6 text-[10px]" />
                        <span className="text-[10px] text-muted-foreground">days</span>
                      </div>
                    )}
                    {steps.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeStep(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[10px] text-muted-foreground">Type</label>
                    <Select value={step.step_type} onValueChange={v => updateStep(idx, "step_type", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stepTypeEnum.map(t => <SelectItem key={t} value={t}>{t === "manual_task" ? "Manual Task" : t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-0.5">
                    <label className="text-[10px] text-muted-foreground">Subject</label>
                    <Input value={step.subject_template} onChange={e => updateStep(idx, "subject_template", e.target.value)} placeholder="Hi {{first_name}}, ..." className="h-7 text-xs" />
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-muted-foreground">Body Template</label>
                    <div className="flex gap-0.5">
                      {["{{first_name}}", "{{company_name}}", "{{city}}"].map(v => (
                        <Button key={v} variant="ghost" size="sm" className="h-4 px-1 text-[9px] text-muted-foreground" onClick={() => updateStep(idx, "body_template", step.body_template + v)}>{v}</Button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={step.body_template} onChange={e => updateStep(idx, "body_template", e.target.value)} placeholder="Email body..." rows={3} className="text-xs" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={step.stop_on_reply} onChange={e => updateStep(idx, "stop_on_reply", e.target.checked)} id={`stop-${idx}`} className="rounded" />
                  <label htmlFor={`stop-${idx}`} className="text-[10px] text-muted-foreground">Stop sequence on reply</label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={resetBuilder}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save Sequence"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Outreach Sequences</h1>
          <p className="text-xs text-muted-foreground">Manage automated email sequences</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => sendDueMutation.mutate()} disabled={sendDueMutation.isPending}>
            <Send className="w-3.5 h-3.5 mr-1" />
            {sendDueMutation.isPending ? "Running..." : "Run Due Sends"}
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => setShowBuilder(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Sequence
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !sequences?.length ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Zap className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No sequences yet. Create your first outreach sequence.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sequences.map(seq => (
            <Card key={seq.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => {
                      if (showEnrollmentsFor === seq.id) {
                        setShowEnrollmentsFor(null);
                      } else {
                        setShowEnrollmentsFor(seq.id);
                      }
                    }}
                  >
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold">{seq.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{CHANNEL_LABELS[seq.channel_type] || seq.channel_type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{seq.steps?.length || 0} steps</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className={`text-[9px] px-1.5 py-0 ${seq.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
                      {seq.active ? "Active" : "Paused"}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id)}>
                      {expandedId === seq.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>

                {seq.stats && seq.stats.totalEnrolled > 0 && (
                  <div className="mt-2 flex items-center gap-3 text-[10px]">
                    <span className="text-muted-foreground">Enrolled: <strong className="text-foreground">{seq.stats.totalEnrolled}</strong></span>
                    <span className="text-muted-foreground">Active: <strong className="text-blue-600">{seq.stats.active}</strong></span>
                    <span className="text-muted-foreground">Sent: <strong className="text-green-600">{seq.stats.totalSent}</strong></span>
                    {seq.stats.totalOpened > 0 && <span className="text-muted-foreground">Opened: <strong className="text-violet-600">{seq.stats.totalOpened}</strong></span>}
                    {seq.stats.bounced > 0 && <span className="text-muted-foreground">Bounced: <strong className="text-red-600">{seq.stats.bounced}</strong></span>}
                    {seq.stats.replied > 0 && <span className="text-muted-foreground">Replied: <strong className="text-emerald-600">{seq.stats.replied}</strong></span>}
                  </div>
                )}

                {expandedId === seq.id && seq.steps && (
                  <div className="mt-3 ml-10 space-y-1.5">
                    <Separator />
                    {seq.steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-2 py-1">
                        <div className="flex flex-col items-center">
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium">{step.step_number}</div>
                          {i < seq.steps.length - 1 && <div className="w-px h-4 bg-border mt-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {STEP_TYPE_ICONS[step.step_type]}
                            <span className="text-[10px] font-medium">{step.step_type === "manual_task" ? "Manual Task" : step.step_type.charAt(0).toUpperCase() + step.step_type.slice(1)}</span>
                            {step.delay_days > 0 && <span className="text-[9px] text-muted-foreground">+{step.delay_days}d</span>}
                            {step.stop_on_reply && <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5">Stops on reply</Badge>}
                          </div>
                          {step.subject_template && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{step.subject_template}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showEnrollmentsFor === seq.id && (
                  <div className="mt-3 border-t pt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">Enrolled Brokers</span>
                    </div>
                    {enrollmentsLoading ? (
                      <div className="space-y-1">{[1,2,3].map(i => <Skeleton key={i} className="h-7 w-full" />)}</div>
                    ) : !enrollments?.length ? (
                      <p className="text-xs text-muted-foreground py-2">No brokers enrolled in this sequence</p>
                    ) : (
                      <div className="border rounded-md overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-[10px] font-medium px-2">Broker</TableHead>
                              <TableHead className="text-[10px] font-medium px-2">Email</TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-12">State</TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-16">
                                <div className="flex items-center gap-0.5"><ArrowUpDown className="w-2.5 h-2.5" /> Priority</div>
                              </TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-20">Status</TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-12">Step</TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-20">
                                <div className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> Next</div>
                              </TableHead>
                              <TableHead className="text-[10px] font-medium px-2 w-20">Last Sent</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {enrollments.map((e) => (
                              <TableRow key={e.id} className="h-7">
                                <TableCell className="text-[11px] font-medium px-2 py-1 truncate max-w-[120px]">{e.broker_name || `#${e.entity_id}`}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground px-2 py-1 truncate max-w-[150px]">{e.broker_email || "\u2014"}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground px-2 py-1">{e.broker_state || "\u2014"}</TableCell>
                                <TableCell className="px-2 py-1">
                                  <PriorityInlineEdit enrollmentId={e.id} currentPriority={e.priority ?? 0} sequenceId={seq.id} disabled={e.status !== "active"} />
                                </TableCell>
                                <TableCell className="px-2 py-1">
                                  <Badge className={`text-[8px] px-1 py-0 border-0 ${ENROLLMENT_STATUS_BADGE[e.status] || "bg-muted text-muted-foreground"}`}>
                                    {e.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground tabular-nums px-2 py-1">{e.current_step}</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground tabular-nums px-2 py-1">
                                  {formatNextSend(e.next_send_at)}
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground tabular-nums px-2 py-1">
                                  {e.last_sent_at ? new Date(e.last_sent_at).toLocaleDateString() : "\u2014"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
