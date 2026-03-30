import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutreachSequence, OutreachSequenceStep } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Linkedin, ClipboardList, Zap, AlertCircle } from "lucide-react";

type SequenceWithSteps = OutreachSequence & { steps: OutreachSequenceStep[] };

const STEP_ICONS: Record<string, React.ReactNode> = {
  email: <Mail className="w-3.5 h-3.5" />,
  linkedin: <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />,
  manual_task: <ClipboardList className="w-3.5 h-3.5 text-orange-500" />,
};

const PRIORITY_OPTIONS = [
  { value: "0", label: "Normal", color: "bg-muted text-muted-foreground" },
  { value: "5", label: "High", color: "bg-amber-100 text-amber-700" },
  { value: "10", label: "Urgent", color: "bg-red-100 text-red-700" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  entityId?: number;
  entityIds?: number[];
  entityType: string;
  entityName: string;
  mode?: "single" | "bulk";
}

export function EnrollModal({ open, onClose, entityId, entityIds, entityType, entityName, mode = "single" }: Props) {
  const { toast } = useToast();
  const [selectedSeqId, setSelectedSeqId] = useState<string>("");
  const [priority, setPriority] = useState<string>("0");

  const { data: sequences } = useQuery<SequenceWithSteps[]>({
    queryKey: ["/api/outreach/sequences"],
    enabled: open,
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (mode === "bulk" && entityIds && entityIds.length > 0) {
        const res = await apiRequest("POST", "/api/outreach/bulk-enroll", {
          sequenceId: Number(selectedSeqId),
          entityIds,
          entityType,
          priority: Number(priority),
        });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/outreach/enroll", {
          sequenceId: Number(selectedSeqId),
          entityId,
          entityType,
          priority: Number(priority),
        });
        return res.json();
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/timeline"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/sequences"] });
      if (mode === "bulk") {
        toast({ title: "Bulk enrollment complete", description: `Enrolled: ${data.enrolled}, Errors: ${data.errors}` });
      } else {
        toast({ title: "Enrolled successfully", description: `${entityName} added to sequence` });
      }
      onClose();
      setSelectedSeqId("");
      setPriority("0");
    },
    onError: (e: Error) => toast({ title: "Enrollment failed", description: e.message, variant: "destructive" }),
  });

  const activeSeqs = sequences?.filter(s => s.active && s.steps?.length > 0) ?? [];
  const selected = activeSeqs.find(s => s.id === Number(selectedSeqId));
  const count = mode === "bulk" ? (entityIds?.length ?? 0) : 1;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setSelectedSeqId(""); setPriority("0"); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Enroll in Sequence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            {mode === "bulk" ? (
              <>Enrolling <span className="font-semibold">{count} brokers</span> in an automated outreach sequence.</>
            ) : (
              <>Enrolling <span className="font-semibold">{entityName}</span> in an automated outreach sequence.</>
            )}
          </div>

          {activeSeqs.length === 0 ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm">
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">No active sequences available. Create one first.</span>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Select Sequence</label>
                <Select value={selectedSeqId} onValueChange={setSelectedSeqId}>
                  <SelectTrigger><SelectValue placeholder="Choose a sequence..." /></SelectTrigger>
                  <SelectContent>
                    {activeSeqs.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.steps.length} steps)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <div className="flex gap-2">
                  {PRIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPriority(opt.value)}
                      className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium border-2 transition-all ${
                        priority === opt.value
                          ? `${opt.color} border-current`
                          : "bg-background text-muted-foreground border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {priority === "10" ? "Sent before all other enrollments" : priority === "5" ? "Sent before normal priority" : "Standard queue order"}
                </p>
              </div>

              {selected && (
                <div className="p-3 rounded-lg border space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Sequence preview</p>
                  {selected.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs">
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">{step.step_number}</div>
                      {STEP_ICONS[step.step_type]}
                      <span className="flex-1 truncate">{step.subject_template || step.step_type}</span>
                      {step.delay_days > 0 && <span className="text-muted-foreground">+{step.delay_days}d</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setSelectedSeqId(""); setPriority("0"); }}>Cancel</Button>
          <Button onClick={() => enrollMutation.mutate()} disabled={!selectedSeqId || enrollMutation.isPending}>
            {enrollMutation.isPending ? "Enrolling..." : mode === "bulk" ? `Enroll ${count} Brokers` : "Enroll"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
