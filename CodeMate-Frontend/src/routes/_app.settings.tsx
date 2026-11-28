import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Moon } from "lucide-react";
import { PageHeader } from "@/components/app/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGES, type Language } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "@/services/authService";
import { useTheme } from "@/hooks/use-theme";
import { loadPreferences, usePreferences } from "@/hooks/use-preferences";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CodeMate AI" },
      {
        name: "description",
        content:
          "Configure your CodeMate workspace defaults: appearance, preferred language, editor behaviour and notifications.",
      },
      { property: "og:title", content: "Settings — CodeMate AI" },
      {
        property: "og:description",
        content: "Workspace defaults for language, editor behaviour and notifications.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: getCurrentUser });
  useTheme();
  const { preferences, updatePreferences } = usePreferences();
  const [language, setLanguage] = useState<Language>(preferences.preferredLanguage);
  const [autoOptimize, setAutoOptimize] = useState(preferences.autoOptimize);
  const [verifyByDefault, setVerifyByDefault] = useState(preferences.verifyByDefault);
  const [notifications, setNotifications] = useState(preferences.notifications);
  const [target, setTarget] = useState(String(preferences.weeklyTarget));

  useEffect(() => {
    const saved = loadPreferences();
    setLanguage(saved.preferredLanguage);
    setAutoOptimize(saved.autoOptimize);
    setVerifyByDefault(saved.verifyByDefault);
    setNotifications(saved.notifications);
    setTarget(String(saved.weeklyTarget));
  }, []);

  function handleSave() {
    const parsedTarget = Number(target);
    const weeklyTarget =
      Number.isInteger(parsedTarget) && parsedTarget >= 1 && parsedTarget <= 50 ? parsedTarget : 5;
    setTarget(String(weeklyTarget));
    updatePreferences({
      preferredLanguage: language,
      autoOptimize,
      verifyByDefault,
      notifications,
      weeklyTarget,
    });
    toast.success("Preferences saved and persisted.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account and activity are backed by the CodeMate API. Workspace preferences persist across sessions."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Profile</CardTitle>
            <CardDescription>
              Account details returned by the authenticated backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs">
                Display name
              </Label>
              <Input id="name" value={user?.name ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input id="email" type="email" value={user?.email ?? ""} readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Appearance</CardTitle>
            <CardDescription>Workspace surface theme.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-foreground">
              <Moon className="size-4 text-emerald-400" />
              <div>
                <p className="text-sm font-medium">Obsidian Dark</p>
                <p className="text-xs text-muted-foreground">
                  Low-glare dark workspace theme active.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Code defaults</CardTitle>
            <CardDescription>Applied when you open the analyzer or converter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Preferred language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as Language)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ToggleRow
              label="Optimize while converting"
              hint="Run the optimizer automatically on converted code."
              checked={autoOptimize}
              onChange={setAutoOptimize}
            />
            <ToggleRow
              label="Verify optimizations"
              hint="Run equivalence checks after every optimization."
              checked={verifyByDefault}
              onChange={setVerifyByDefault}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Practice goals &amp; Data</CardTitle>
            <CardDescription>Weekly targets and account-scoped persistence status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target" className="text-xs">
                Weekly problem target
              </Label>
              <Input
                id="target"
                type="number"
                min={1}
                max={50}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <ToggleRow
              label="Practice reminders"
              hint="Nudge me when I fall behind the weekly target."
              checked={notifications}
              onChange={setNotifications}
            />
            <p className="rounded-lg border border-border/70 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
              Analyses, roadmaps, history, and interview scores are associated with your signed-in
              profile and retained by the backend.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save preferences</Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-3.5">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
