import { useQuery } from "@tanstack/react-query";
import type { SenderInbox } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Inbox, Mail, AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";

interface InboxHealthItem {
  inbox: SenderInbox;
  sentToday: number;
  remainingToday: number;
  utilizationPct: number;
}

const WARMUP_BADGE: Record<string, string> = {
  warming: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  warm: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-muted text-muted-foreground",
  suspended: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function InboxHealthPage() {
  const { data: health, isLoading } = useQuery<InboxHealthItem[]>({
    queryKey: ["/api/outreach/inbox-health"],
  });

  const totalSent = health?.reduce((s, h) => s + h.sentToday, 0) ?? 0;
  const totalCapacity = health?.reduce((s, h) => s + h.inbox.daily_limit, 0) ?? 0;
  const activeCount = health?.filter(h => h.inbox.active).length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Inbox Health</h1>
        <p className="text-sm text-muted-foreground">Monitor sending accounts, warmup status, and daily limits</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Inbox className="w-4.5 h-4.5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{health?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total Inboxes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-4.5 h-4.5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center"><Mail className="w-4.5 h-4.5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{totalSent}</p>
                <p className="text-xs text-muted-foreground">Sent Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center"><TrendingUp className="w-4.5 h-4.5 text-violet-600" /></div>
              <div>
                <p className="text-2xl font-bold">{totalCapacity}</p>
                <p className="text-xs text-muted-foreground">Daily Capacity</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : !health?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">No sending inboxes configured yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add sender inboxes to start sending automated outreach.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {health.map(h => (
            <Card key={h.inbox.id} className={`transition-shadow hover:shadow-sm ${!h.inbox.active ? "opacity-60" : ""}`}>
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{h.inbox.label}</p>
                      <p className="text-xs text-muted-foreground">{h.inbox.email_address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={WARMUP_BADGE[h.inbox.warmup_status] || "bg-muted text-muted-foreground"}>
                      {h.inbox.warmup_status}
                    </Badge>
                    {!h.inbox.active && <Badge variant="outline" className="text-[10px]">Disabled</Badge>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Daily usage</span>
                    <span className="font-medium">{h.sentToday} / {h.inbox.daily_limit}</span>
                  </div>
                  <Progress value={h.utilizationPct} className="h-2" />
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Provider: {h.inbox.provider}</span>
                  <span>Remaining: {h.remainingToday}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
