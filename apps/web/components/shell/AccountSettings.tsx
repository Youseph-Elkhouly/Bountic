import { SignOut } from "@/components/shell/SignOut";
import { Wallet } from "@/components/shell/Wallet";

export function SettingRow({ title, text, children }: { title: string; text: React.ReactNode; children: React.ReactNode }) {
  return <div className="grid gap-x-10 gap-y-4 py-7 md:grid-cols-[1fr_auto] md:items-center">
    <div className="max-w-xl"><h2 className="text-[15px]">{title}</h2><p className="mt-1 text-dim">{text}</p></div>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>;
}

export function AccountSettings({ email, sideName, walletText, children }: { email: string; sideName: string; walletText: string; children?: React.ReactNode }) {
  return <div className="rows">
    {children}
    <SettingRow title="Wallet" text={walletText}><Wallet /></SettingRow>
    <SettingRow title="Account" text={<>Signed in as <span className="text-ink">{email}</span>. You are on the {sideName} side. Use the switch at the top to work on both sides with this account.</>}><SignOut className="btn" /></SettingRow>
  </div>;
}
