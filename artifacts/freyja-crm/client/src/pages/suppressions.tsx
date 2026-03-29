import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutreachSuppression } from "@shared/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldBan, Plus, Search, Ban } from "lucide-react";

const REASON_LABELS: Record<string, string> = {
  bounce_hard: "Hard Bounce",
  bounce_soft: "Soft Bounce",
  unsubscribed: "Unsubscribed",
  spam_complaint: "Spam Complaint",
  manual: "Manual",
  invalid_email: "Invalid Email",
};

const REASON_BADGE: Record<string, string> = {
  bounce_hard: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  bounce_soft: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  unsubscribed: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  spam_complaint: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  manual: "bg-muted text-muted-foreground",
  invalid_email: "bg-muted text-muted-foreground",
};

const SOURCE_LABELS: Record<string, string> = { system: "System", user: "User", provider: "Provider", import: "Import" };

export default function SuppressionsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("manual");

  const { data: suppressions, isLoading } = useQuery<OutreachSuppression[]>({
    queryKey: ["/api/outreach/suppressions"],
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/outreach/unsubscribe", { email: newEmail });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outreach/suppressions"] });
      toast({ title: "Email suppressed" });
      setShowAdd(false);
      setNewEmail("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = suppressions?.filter(s =>
    !search || s.email.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Suppression List</h1>
          <p className="text-sm text-muted-foreground">Emails that will never receive outreach</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Suppression
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search emails..." className="pl-9" />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !filtered.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldBan className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">{search ? "No matching suppressions" : "No suppressions yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.email}</TableCell>
                  <TableCell>
                    <Badge className={REASON_BADGE[s.reason] || "bg-muted text-muted-foreground"}>
                      {REASON_LABELS[s.reason] || s.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{SOURCE_LABELS[s.source] || s.source}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Suppression</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email Address</label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" type="email" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!newEmail.trim() || addMutation.isPending}>
              <Ban className="w-4 h-4 mr-1.5" />
              {addMutation.isPending ? "Suppressing..." : "Suppress Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
