import Settings from "../user/settings";

export default function AdminSettings() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-muted-foreground">Manage global application configurations.</p>
      </div>
      <Settings />
    </div>
  );
}