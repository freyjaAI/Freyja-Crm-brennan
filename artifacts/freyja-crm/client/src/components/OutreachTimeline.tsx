import { useQuery } from "@tanstack/react-query";
import type { OutreachEvent } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail, Linkedin, Phone, Zap, CheckCircle2, XCircle,
  Reply, ArrowRightCircle, AlertTriangle, ClipboardList,
  Eye, MousePointer, Ban, StickyNote,
} from "lucide-react";

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  enrolled: { icon: <Zap className="w-3.5 h-3.5" />, label: "Enrolled", color: "text-violet-600" },
  email_sent: { icon: <Mail className="w-3.5 h-3.5" />, label: "Email Sent", color: "text-blue-600" },
  email_opened: { icon: <Eye className="w-3.5 h-3.5" />, label: "Email Opened", color: "text-cyan-600" },
  email_clicked: { icon: <MousePointer className="w-3.5 h-3.5" />, label: "Link Clicked", color: "text-teal-600" },
  email_replied: { icon: <Reply className="w-3.5 h-3.5" />, label: "Replied", color: "text-green-600" },
  email_bounced: { icon: <XCircle className="w-3.5 h-3.5" />, label: "Bounced", color: "text-red-600" },
  unsubscribed: { icon: <Ban className="w-3.5 h-3.5" />, label: "Unsubscribed", color: "text-orange-600" },
  manual_task_completed: { icon: <ClipboardList className="w-3.5 h-3.5" />, label: "Task Done", color: "text-amber-600" },
  linkedin_sent: { icon: <Linkedin className="w-3.5 h-3.5" />, label: "LinkedIn Sent", color: "text-[#0077b5]" },
  linkedin_replied: { icon: <Linkedin className="w-3.5 h-3.5" />, label: "LinkedIn Reply", color: "text-green-600" },
  status_changed: { icon: <ArrowRightCircle className="w-3.5 h-3.5" />, label: "Status Changed", color: "text-muted-foreground" },
  note_added: { icon: <StickyNote className="w-3.5 h-3.5" />, label: "Note", color: "text-muted-foreground" },
};

interface Props {
  entityId: number;
  entityType: string;
}

export function OutreachTimeline({ entityId, entityType }: Props) {
  const { data: events, isLoading } = useQuery<OutreachEvent[]>({
    queryKey: ["/api/outreach/timeline", entityType, String(entityId)],
    enabled: !!entityId,
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (!events?.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sequence Timeline</p>
      <div className="space-y-0">
        {events.map((evt, i) => {
          const cfg = EVENT_CONFIG[evt.event_type] || { icon: <Zap className="w-3.5 h-3.5" />, label: evt.event_type, color: "text-muted-foreground" };
          const meta = evt.metadata_json as Record<string, any> | null;

          return (
            <div key={evt.id} className="flex items-start gap-2.5 py-1.5">
              <div className="flex flex-col items-center mt-0.5">
                <div className={`${cfg.color}`}>{cfg.icon}</div>
                {i < events.length - 1 && <div className="w-px h-4 bg-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{cfg.label}</span>
                  {meta?.subject && <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">"{meta.subject}"</span>}
                  {meta?.sequence_name && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{meta.sequence_name}</Badge>}
                  {meta?.reason && <span className="text-[10px] text-muted-foreground">({meta.reason})</span>}
                  {meta?.old_status && meta?.new_status && (
                    <span className="text-[10px] text-muted-foreground">{meta.old_status} → {meta.new_status}</span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {evt.created_at ? new Date(evt.created_at).toLocaleString() : ""}
                  {evt.created_by !== "system" && evt.created_by !== "admin" ? ` by ${evt.created_by}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
