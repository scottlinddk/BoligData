import { useEffect, useState } from "react";
import type { UserProfile } from "@shared/types/index";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

/** The caller's own user_profiles row — RLS already permits select using (auth.uid() = id). */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(
          data
            ? {
                id: data.id,
                role: data.role,
                organizationName: data.organization_name,
                createdAt: data.created_at,
              }
            : null,
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { profile, loading };
}
