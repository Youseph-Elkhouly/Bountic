import Link from "next/link";
import { AuthFrame } from "@/components/site/AuthFrame";

export default function NotFound() {
  return <AuthFrame title="This page does not exist" lead="The link may be old, or the bounty may belong to another account.">
    <Link href="/dashboard" className="btn btn-primary">Go to your dashboard</Link>
  </AuthFrame>;
}
