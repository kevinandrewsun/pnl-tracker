// ============================================================
// Storage layer — drop-in replacement for window.storage
// Uses Supabase user_data table with JSONB values
// ============================================================

import { supabase } from "./supabase";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user?.id) throw new Error("Not authenticated");
  return data.user.id;
}

export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("user_data")
      .select("value")
      .eq("key", key)
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === "PGRST116") return null;
    if (error) throw error;
    return data ? { key, value: JSON.stringify(data.value) } : null;
  },

  async set(key, value) {
    const uid = await getUserId();
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    const { data, error } = await supabase
      .from("user_data")
      .upsert(
        { user_id: uid, key, value: parsed },
        { onConflict: "user_id,key" }
      )
      .select()
      .single();

    if (error) throw error;
    return { key, value: JSON.stringify(data.value) };
  },

  async delete(key) {
    const uid = await getUserId();
    const { error } = await supabase
      .from("user_data")
      .delete()
      .eq("user_id", uid)
      .eq("key", key);

    if (error) throw error;
    return { key, deleted: true };
  },

  async list(prefix = "") {
    const uid = await getUserId();
    let query = supabase
      .from("user_data")
      .select("key")
      .eq("user_id", uid);

    if (prefix) {
      query = query.like("key", `${prefix}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { keys: (data || []).map((d) => d.key), prefix };
  },
};

// ============================================================
// Team storage — read data from a teammate
// ============================================================
export const teamStorage = {
  async getForUser(userId, key) {
    const { data, error } = await supabase
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .single();

    if (error && error.code === "PGRST116") return null;
    if (error) throw error;
    return data ? { key, value: JSON.stringify(data.value) } : null;
  },

  async getTeamMembers() {
    const uid = (await supabase.auth.getUser()).data?.user?.id;
    if (!uid) return [];

    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", uid)
      .single();

    if (!profile?.team_id) return [];

    const { data: members } = await supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("team_id", profile.team_id);

    return members || [];
  },
};