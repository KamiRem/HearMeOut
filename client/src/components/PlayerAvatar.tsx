export function PlayerAvatar({ nickname, connected }: { nickname: string; connected: boolean }) {
  return <span className={`avatar avatar-placeholder ${connected ? 'avatar-online' : 'avatar-offline'}`} aria-hidden="true">
    <span className="w-10 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
      <span className="font-bold">{Array.from(nickname)[0]?.toUpperCase()}</span>
    </span>
  </span>
}
