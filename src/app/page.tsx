"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          router.replace("/login");
        } else if (data.role === "guide") {
          router.replace("/guide");
        } else if (data.role === "student") {
          if (!data.onboardingComplete) {
            router.replace("/student/onboarding");
          } else {
            router.replace("/student");
          }
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
