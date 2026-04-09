"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AddStudentPage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/guide");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-[var(--muted)]">Student creation has moved to admin.</p>
    </div>
  );
}
