import { useState, useEffect } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "@/pages/dashboard";
import Brokers from "@/pages/brokers";
import ImportData from "@/pages/import";
import OutreachPage from "@/pages/outreach";
import TemplatesPage from "@/pages/templates";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

function AppRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/brokers" component={Brokers} />
        <Route path="/outreach" component={OutreachPage} />
        <Route path="/templates" component={TemplatesPage} />
        <Route path="/import" component={ImportData} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");

  const checkAuth = () => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => {
        setAuthState(res.ok ? "authenticated" : "unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LoginPage onLogin={() => setAuthState("authenticated")} />
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ThemeProvider>
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
