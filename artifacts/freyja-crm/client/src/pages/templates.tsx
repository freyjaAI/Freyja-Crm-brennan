import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MessageTemplate, TemplateCategory } from "@shared/schema";
import { templateCategoryEnum } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Edit2, Trash2, Copy, FileText, Info,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  intro: "Initial Outreach",
  follow_up: "Follow Up",
  reconnect: "Reconnect",
};

const CATEGORY_BADGE: Record<string, string> = {
  intro: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  follow_up: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  reconnect: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const VARIABLES = ["{{broker_name}}", "{{company_name}}"];

interface TemplateForm {
  name: string;
  category: TemplateCategory;
  body_text: string;
}

const emptyForm: TemplateForm = { name: "", category: "intro", body_text: "" };

export default function TemplatesPage() {
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: templates = [], isLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/message-templates");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateForm) => {
      const res = await apiRequest("POST", "/api/message-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setCreatingNew(false);
      setForm(emptyForm);
      toast({ title: "Template created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TemplateForm> }) => {
      const res = await apiRequest("PATCH", `/api/message-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/message-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setDeleteConfirm(null);
      toast({ title: "Template deleted" });
    },
  });

  const openEdit = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      category: template.category as TemplateCategory,
      body_text: template.body_text,
    });
  };

  const openCreate = () => {
    setForm(emptyForm);
    setCreatingNew(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.body_text.trim()) return;
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const copyTemplate = (template: MessageTemplate) => {
    navigator.clipboard.writeText(template.body_text);
    toast({ title: `"${template.name}" copied` });
  };

  const isOpen = creatingNew || !!editingTemplate;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 pb-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Message Templates</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create reusable templates for LinkedIn, email, and phone outreach.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Template
          </Button>
        </div>

        <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg border text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            Use <code className="bg-background border rounded px-1 py-0.5 font-mono">{"{{broker_name}}"}</code> and{" "}
            <code className="bg-background border rounded px-1 py-0.5 font-mono">{"{{company_name}}"}</code> as
            placeholders — they are automatically replaced when you copy a template from a broker's profile.
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-muted-foreground gap-3">
            <FileText className="w-10 h-10 opacity-30" />
            <p>No templates yet. Create your first one.</p>
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Create Template</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="border rounded-lg p-4 bg-card flex flex-col gap-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{template.name}</h3>
                    <Badge className={`mt-1 text-[10px] px-1.5 py-0 border-0 ${CATEGORY_BADGE[template.category] || "bg-muted text-muted-foreground"}`}>
                      {CATEGORY_LABELS[template.category] || template.category}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyTemplate(template)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(template)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteConfirm(template.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <pre className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 leading-relaxed whitespace-pre-wrap line-clamp-6 border border-border/40 font-sans flex-1">
                  {template.body_text}
                </pre>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {template.updated_at
                      ? `Updated ${new Date(template.updated_at).toLocaleDateString()}`
                      : template.created_at
                      ? `Created ${new Date(template.created_at).toLocaleDateString()}`
                      : ""}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={() => copyTemplate(template)}
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setCreatingNew(false); setEditingTemplate(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            <DialogDescription>
              Use <code className="font-mono text-xs">{"{{broker_name}}"}</code> and{" "}
              <code className="font-mono text-xs">{"{{company_name}}"}</code> as placeholders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template Name</label>
              <Input
                placeholder="e.g. Initial LinkedIn Outreach"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v as TemplateCategory }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templateCategoryEnum.map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Message Body</label>
                <div className="flex gap-1">
                  {VARIABLES.map(v => (
                    <button
                      key={v}
                      onClick={() => setForm(f => ({ ...f, body_text: f.body_text + v }))}
                      className="text-[10px] font-mono bg-muted hover:bg-muted/80 border rounded px-1.5 py-0.5 text-primary transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                placeholder="Write your message template..."
                value={form.body_text}
                onChange={(e) => setForm(f => ({ ...f, body_text: e.target.value }))}
                rows={8}
                className="text-sm font-sans resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!form.name.trim() || !form.body_text.trim() || createMutation.isPending || updateMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
              <Button variant="outline" onClick={() => { setCreatingNew(false); setEditingTemplate(null); }}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button
              variant="destructive"
              onClick={() => deleteConfirm !== null && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
