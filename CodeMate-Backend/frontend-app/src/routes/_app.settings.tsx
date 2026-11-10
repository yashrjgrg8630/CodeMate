import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, MockBadge } from "@/components/app/shared";
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
import { getMe } from "@/services/authService";
import { LANGUAGES } from "@/types/domain";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CodeMate AI" },
      {
        name: "description",
        content:
          "Configure your CodeMate workspace defaults: preferred language, editor behaviour and notifications.",
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
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: getMe });
  const [language, setLanguage] = useState<string>(LANGUAGES[0]?.id ?? "python");
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [verifyByDefault, setVerifyByDefault] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [target, setTarget] = useState("5");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account details come from your CodeMate account. Preferences below are local to this session because the backend does not expose a settings API."
        actions={<MockBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Your authenticated account details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={user?.name ?? ""} readOnly placeholder="Loading account…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user?.email ?? ""}
                readOnly
                placeholder="Loading account…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Code defaults</CardTitle>
            <CardDescription>Applied when you open the analyzer or converter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Preferred language</Label>
              <Select value={language} onValueChange={setLanguage}>
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
            <CardTitle className="text-base">Practice goals</CardTitle>
            <CardDescription>Drives the targets shown on your progress page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target">Weekly problem target</Label>
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
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <p className="text-sm text-muted-foreground">Preference controls are session-only.</p>
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
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
