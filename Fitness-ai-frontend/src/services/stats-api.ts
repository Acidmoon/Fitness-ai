import { http } from "@/services/http";
import type { PersonalBest, StatsSummary, WeeklyStat } from "@/types/stats";

export async function getStatsSummary() {
  const { data } = await http.get<StatsSummary>("/api/stats/summary");
  return data;
}

export async function getWeeklyStats() {
  const { data } = await http.get<WeeklyStat[]>("/api/stats/weekly");
  return data;
}

export async function getPersonalBest() {
  const { data } = await http.get<PersonalBest[]>("/api/stats/personal-best");
  return data;
}
