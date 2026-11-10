import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { BackendBadge, PageHeader } from "@/components/app/shared";
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
import { LANGUAGES } from "@/types/domain";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUser } from "@/services/authService";

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
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: getCurrentUser });
  const [language, setLanguage] = useState<string>(LANGUAGES[0]?.id ?? "python");
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [verifyByDefault, setVerifyByDefault] = useState(true);
  const [notifications, setNotifications] = useState(false);
  const [target, setTarget] = useState("5");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account and activity are backed by the CodeMate API. The preferences on this page are currently session-only."
        actions={<BackendBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>
              Account details returned by the authenticated backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={user?.name ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={user?.email ?? ""} readOnly />
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data</CardTitle>
            <CardDescription>
              Your analyses, roadmaps and progress are stored in your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Account data is associated with your signed-in profile and retained by the backend.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => toast.success("These preferences are active for this page session.")}
        >
          Save preferences
        </Button>
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
