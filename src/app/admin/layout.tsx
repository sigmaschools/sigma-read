"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/guides", label: "Guides" },
  { href: "/admin/metrics", label: "Metrics" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [adminName, setAdminName] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role !== "admin") router.push("/login");
      else setAdminName(data.name || "Admin");
    }).catch(() => router.push("/login"));
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
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
