import Chat from "../user/chat";

export default function AdminChat() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Global Support Chat</h1>
        <p className="text-muted-foreground">Assist users and CPAs with platform issues.</p>
      </div>
      <Chat />
    </div>
  );
}