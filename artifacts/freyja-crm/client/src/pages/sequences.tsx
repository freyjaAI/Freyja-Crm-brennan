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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, Trash2, Mail, Linkedin, ClipboardList, Play, Pause,
  ChevronDown, ChevronUp, ArrowLeft, GripVertical, Zap, Send,
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

type SequenceWithSteps = OutreachSequence & { steps: OutreachSequenceStep[]; stats?: SequenceStats };

const CHANNEL_LABELS: Record<string, string> = { email: "Email", linkedin: "LinkedIn", multi: "Multi-Channel" };
const STEP_TYPE_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  linkedin: <Linkedin className="w-4 h-4 text-[#0077b5]" />,
  manual_task: <ClipboardList className="w-4 h-4 text-orange-500" />,
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

export default function SequencesPage() {
  const { toast } = useToast();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState("email");
  const [targetType, setTargetType] = useState("broker");
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep(1)]);

  const { data: sequences, isLoading } = useQuery<SequenceWithSteps[]>({
    queryKey: ["/api/outreach/sequences"],
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

  if (showBuilder) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={resetBuilder}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
          <h1 className="text-xl font-semibold">{editingId ? "Edit Sequence" : "New Sequence"}</h1>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sequence Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Broker Intro" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Channel</label>
                <Select value={channelType} onValueChange={setChannelType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {channelTypeEnum.map(c => <SelectItem key={c} value={c}>{CHANNEL_LABELS[c] || c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Target Type</label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {targetEntityTypeEnum.map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Steps</h2>
            <Button size="sm" variant="outline" onClick={addStep}><Plus className="w-3.5 h-3.5 mr-1" /> Add Step</Button>
          </div>

          {steps.map((step, idx) => (
            <Card key={idx} className="border-l-4 border-l-primary/40">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Step {step.step_number}</span>
                    {STEP_TYPE_ICONS[step.step_type]}
                  </div>
                  <div className="flex items-center gap-2">
                    {idx > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Wait</span>
                        <Input type="number" min={0} value={step.delay_days} onChange={e => updateStep(idx, "delay_days", parseInt(e.target.value) || 0)} className="w-16 h-7 text-xs" />
                        <span className="text-xs text-muted-foreground">days</span>
                      </div>
                    )}
                    {steps.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeStep(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Type</label>
                    <Select value={step.step_type} onValueChange={v => updateStep(idx, "step_type", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stepTypeEnum.map(t => <SelectItem key={t} value={t}>{t === "manual_task" ? "Manual Task" : t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 space-y-1">
                    <label className="text-xs text-muted-foreground">Subject</label>
                    <Input value={step.subject_template} onChange={e => updateStep(idx, "subject_template", e.target.value)} placeholder="Hi {{first_name}}, ..." className="h-8 text-xs" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Body Template</label>
                    <div className="flex gap-1">
                      {["{{first_name}}", "{{company_name}}", "{{city}}"].map(v => (
                        <Button key={v} variant="ghost" size="sm" className="h-5 px-1.5 text-[10px] text-muted-foreground" onClick={() => updateStep(idx, "body_template", step.body_template + v)}>{v}</Button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={step.body_template} onChange={e => updateStep(idx, "body_template", e.target.value)} placeholder="Email body..." rows={3} className="text-xs" />
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={step.stop_on_reply} onChange={e => updateStep(idx, "stop_on_reply", e.target.checked)} id={`stop-${idx}`} className="rounded" />
                  <label htmlFor={`stop-${idx}`} className="text-xs text-muted-foreground">Stop sequence on reply</label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={resetBuilder}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save Sequence"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Outreach Sequences</h1>
          <p className="text-sm text-muted-foreground">Manage automated email sequences for broker outreach</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sendDueMutation.mutate()} disabled={sendDueMutation.isPending}>
            <Send className="w-4 h-4 mr-1.5" />
            {sendDueMutation.isPending ? "Running..." : "Run Due Sends"}
          </Button>
          <Button size="sm" onClick={() => setShowBuilder(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Sequence
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !sequences?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">No sequences yet. Create your first outreach sequence.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map(seq => (
            <Card key={seq.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">{seq.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{CHANNEL_LABELS[seq.channel_type] || seq.channel_type}</Badge>
                        <span className="text-[11px] text-muted-foreground">{seq.steps?.length || 0} steps</span>
                        <span className="text-[11px] text-muted-foreground">Target: {seq.target_entity_type}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={seq.active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                      {seq.active ? "Active" : "Paused"}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id)}>
                      {expandedId === seq.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {seq.stats && seq.stats.totalEnrolled > 0 && (
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">Enrolled: <strong className="text-foreground">{seq.stats.totalEnrolled}</strong></span>
                    <span className="text-muted-foreground">Active: <strong className="text-blue-600">{seq.stats.active}</strong></span>
                    <span className="text-muted-foreground">Sent: <strong className="text-green-600">{seq.stats.totalSent}</strong></span>
                    {seq.stats.totalOpened > 0 && <span className="text-muted-foreground">Opened: <strong className="text-violet-600">{seq.stats.totalOpened}</strong></span>}
                    {seq.stats.totalClicked > 0 && <span className="text-muted-foreground">Clicked: <strong className="text-indigo-600">{seq.stats.totalClicked}</strong></span>}
                    {seq.stats.completed > 0 && <span className="text-muted-foreground">Completed: <strong>{seq.stats.completed}</strong></span>}
                    {seq.stats.bounced > 0 && <span className="text-muted-foreground">Bounced: <strong className="text-red-600">{seq.stats.bounced}</strong></span>}
                    {seq.stats.replied > 0 && <span className="text-muted-foreground">Replied: <strong className="text-emerald-600">{seq.stats.replied}</strong></span>}
                  </div>
                )}

                {expandedId === seq.id && seq.steps && (
                  <div className="mt-4 ml-11 space-y-2">
                    <Separator />
                    {seq.steps.map((step, i) => (
                      <div key={step.id} className="flex items-start gap-3 py-2">
                        <div className="flex flex-col items-center">
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{step.step_number}</div>
                          {i < seq.steps.length - 1 && <div className="w-px h-6 bg-border mt-1" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {STEP_TYPE_ICONS[step.step_type]}
                            <span className="text-xs font-medium">{step.step_type === "manual_task" ? "Manual Task" : step.step_type.charAt(0).toUpperCase() + step.step_type.slice(1)}</span>
                            {step.delay_days > 0 && <span className="text-[10px] text-muted-foreground">+{step.delay_days}d</span>}
                            {step.stop_on_reply && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">Stops on reply</Badge>}
                          </div>
                          {step.subject_template && <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.subject_template}</p>}
                        </div>
                      </div>
                    ))}
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
