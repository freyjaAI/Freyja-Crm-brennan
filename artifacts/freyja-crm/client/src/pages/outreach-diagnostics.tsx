import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Mail, AlertTriangle, CheckCircle2, Clock, Ban, Eye, MousePointer } from "lucide-react";

interface DiagnosticsData {
  recentSends: Array<{
    id: number;
    entity_id: number;
    enrollment_id: number | null;
    inbox_id: number | null;
    provider_message_id: string | null;
    subject: string | null;
    send_status: string;
    sent_at: string | null;
    bounce_type: string;
    created_at: string | null;
    broker_email?: string;
    broker_name?: string;
  }>;
  recentWebhookEvents: Array<{
    id: number;
    entity_id: number;
    entity_type: string;
    channel: string;
    event_type: string;
    metadata_json: any;
    created_at: string | null;
  }>;
  unmatchedProviderIds: Array<{
    id: number;
    provider_message_id: string | null;
    send_status: string;
    sent_at: string | null;
  }>;
  counts: {
    totalMessages: number;
    sent: number;
    failed: number;
    sending: number;
    totalEvents: number;
    eventsByType: Record<string, number>;
    activeEnrollments: number;
    completedEnrollments: number;
    suppressions: number;
  };
}

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  sending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  email_sent: <Mail className="w-3.5 h-3.5 text-green-600" />,
  email_opened: <Eye className="w-3.5 h-3.5 text-blue-600" />,
  email_clicked: <MousePointer className="w-3.5 h-3.5 text-violet-600" />,
  email_bounced: <AlertTriangle className="w-3.5 h-3.5 text-red-600" />,
  unsubscribed: <Ban className="w-3.5 h-3.5 text-orange-600" />,
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
  } catch { return iso; }
}

export default function OutreachDiagnosticsPage() {
  const { data, isLoading } = useQuery<DiagnosticsData>({
    queryKey: ["/api/outreach/diagnostics"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-semibold">Outreach Diagnostics</h1>
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (!data) return null;
  const { counts } = data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Outreach Diagnostics</h1>
        <p className="text-sm text-muted-foreground">Pipeline health: sends, webhooks, and reconciliation</p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><Mail className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xl font-bold">{counts.totalMessages}</p>
                <p className="text-[10px] text-muted-foreground">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-xl font-bold">{counts.sent}</p>
                <p className="text-[10px] text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-xl font-bold">{counts.failed}</p>
                <p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center"><Activity className="w-4 h-4 text-violet-600" /></div>
              <div>
                <p className="text-xl font-bold">{counts.activeEnrollments}</p>
                <p className="text-[10px] text-muted-foreground">Active Enrollments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><Ban className="w-4 h-4 text-orange-600" /></div>
              <div>
                <p className="text-xl font-bold">{counts.suppressions}</p>
                <p className="text-[10px] text-muted-foreground">Suppressions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Mail className="w-4 h-4" /> Last 10 Sends
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Broker</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Resend ID</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentSends.map(msg => (
                  <TableRow key={msg.id}>
                    <TableCell className="text-xs py-2">
                      <div>{msg.broker_name || `#${msg.entity_id}`}</div>
                      <div className="text-[10px] text-muted-foreground">{msg.broker_email}</div>
                    </TableCell>
                    <TableCell className="text-xs py-2 max-w-[150px] truncate">{msg.subject || "—"}</TableCell>
                    <TableCell className="py-2">
                      <Badge className={`text-[10px] ${STATUS_BADGE[msg.send_status] || "bg-muted text-muted-foreground"}`}>
                        {msg.send_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[10px] py-2 font-mono text-muted-foreground max-w-[100px] truncate">
                      {msg.provider_message_id?.slice(0, 8) || "—"}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">{formatTime(msg.sent_at || msg.created_at)}</TableCell>
                  </TableRow>
                ))}
                {data.recentSends.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No sends yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" /> Last 10 Events
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Event</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs">Channel</TableHead>
                  <TableHead className="text-xs">Provider ID</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentWebhookEvents.map(evt => (
                  <TableRow key={evt.id}>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        {EVENT_ICONS[evt.event_type] || <Activity className="w-3.5 h-3.5" />}
                        <span className="text-xs">{evt.event_type.replace("email_", "").replace("_", " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-2">#{evt.entity_id}</TableCell>
                    <TableCell className="text-xs py-2">{evt.channel}</TableCell>
                    <TableCell className="text-[10px] py-2 font-mono text-muted-foreground max-w-[100px] truncate">
                      {(evt.metadata_json as any)?.provider_message_id?.slice(0, 8) || "—"}
                    </TableCell>
                    <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">{formatTime(evt.created_at)}</TableCell>
                  </TableRow>
                ))}
                {data.recentWebhookEvents.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No events yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" /> Unmatched Sends (No Webhook Response)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {data.unmatchedProviderIds.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All sent emails have received webhook events</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Msg ID</TableHead>
                    <TableHead className="text-xs">Provider ID</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.unmatchedProviderIds.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs py-2">#{row.id}</TableCell>
                      <TableCell className="text-[10px] py-2 font-mono">{row.provider_message_id?.slice(0, 12) || "—"}</TableCell>
                      <TableCell className="py-2"><Badge className={`text-[10px] ${STATUS_BADGE[row.send_status] || ""}`}>{row.send_status}</Badge></TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{formatTime(row.sent_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" /> Event Type Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {Object.entries(counts.eventsByType).map(([type, cnt]) => (
                <div key={type} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50">
                  <div className="flex items-center gap-2">
                    {EVENT_ICONS[type] || <Activity className="w-3.5 h-3.5" />}
                    <span className="text-sm">{type.replace("email_", "").replace("_", " ")}</span>
                  </div>
                  <span className="text-sm font-semibold">{cnt}</span>
                </div>
              ))}
              {Object.keys(counts.eventsByType).length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No events recorded</p>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between px-2">
                <span className="text-sm font-medium">Total Events</span>
                <span className="text-sm font-bold">{counts.totalEvents}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
