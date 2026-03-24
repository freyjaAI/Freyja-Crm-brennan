import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

export default function ImportData() {
  const { toast } = useToast();
  const [filePath, setFilePath] = useState(
    "/home/user/workspace/brokers_consolidated.csv"
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/import", { filePath });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/brokers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Import complete",
        description: `Successfully imported ${data.imported.toLocaleString()} brokers`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Import failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 max-w-2xl" data-testid="import-page">
      <h1 className="text-xl font-semibold mb-6" data-testid="import-title">
        Import Data
      </h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="w-4 h-4" />
            CSV Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">
              File path on server
            </label>
            <Input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/path/to/brokers.csv"
              className="text-sm"
              data-testid="input-file-path"
            />
            <p className="text-xs text-muted-foreground">
              Enter the absolute path to the CSV file on the server filesystem.
            </p>
          </div>

          <Button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || !filePath}
            className="w-full"
            data-testid="button-import"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </>
            )}
          </Button>

          {importMutation.isSuccess && (
            <div
              className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-md text-sm"
              data-testid="import-success"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>
                Successfully imported{" "}
                {(importMutation.data as any)?.imported?.toLocaleString()} broker
                records.
              </span>
            </div>
          )}

          {importMutation.isError && (
            <div
              className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md text-sm"
              data-testid="import-error"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importMutation.error.message}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Expected CSV format:</p>
        <p>
          The CSV should contain headers matching the broker data model: full_name,
          first_name, last_name, email, phone, office_name, city, state, etc.
        </p>
        <p>
          Records will be imported with status "Not Contacted" by default. Existing
          data is not deduplicated — importing the same file twice will create
          duplicate records.
        </p>
      </div>
    </div>
  );
}
