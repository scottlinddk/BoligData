import { useEffect, useState } from "react";
import type { UserProfile } from "@shared/types/index";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

/** The caller's own user_profiles row — RLS already permits select using (auth.uid() = id). */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setError(null);
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
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          console.error("Failed to load user profile", queryError);
          setError(queryError.message);
          setProfile(null);
        } else {
          setError(null);
          setProfile({
            id: data.id,
            role: data.role,
            organizationName: data.organization_name,
            createdAt: data.created_at,
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { profile, loading, error };
}
