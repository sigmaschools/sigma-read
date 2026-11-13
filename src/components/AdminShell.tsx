"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/articles", label: "Articles" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/guides", label: "Guides" },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/api-clients", label: "API Keys" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [adminName, setAdminName] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role !== "admin") router.push("/open-from-compass");
      else setAdminName(data.name || "Admin");
    }).catch(() => router.push("/open-from-compass"));
  }, []);

  async function handleSignOut() {
    // Back to where the admin came from: Compass Admin, when the server knows where it is
    // If the request fails the admin is still signed in, so stay on the page instead of looking signed out
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) return;
    const back = await res.json().then((b: { compassAdmin?: string | null }) => b.compassAdmin || null, () => null);
    window.location.assign(back || "/open-from-compass");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="px-5 py-4 border-b border-gray-700">
          <h1 className="text-lg font-semibold tracking-tight">SigmaRead</h1>
          <p className="text-xs text-gray-400 mt-0.5">Admin</p>
        </div>
        <nav className="flex-1 py-3">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition ${
                pathname === item.href
                  ? "bg-gray-800 text-white font-medium"
                  : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-gray-700">
          <p className="text-sm text-gray-300 mb-2">{adminName}</p>
          <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-white transition">Sign out</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 bg-[var(--bg)]">{children}</main>
    </div>
  );
}
