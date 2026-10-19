import type { BuyingProject, ResearchAssessment } from "@shared/analysis";
import type { ResearchProjectResponse, ResearchAssessmentResponse, ResearchAssessmentsResponse, ResearchHistoryResponse, ResearchImportRequest, ResearchImportPreviewResponse } from "@shared/types/research-api";
import { supabase } from "./supabase";
import { ApiError } from "./api";

async function request<T>(resource: string, method = "GET", body?: unknown, propertyId?: string, marketForPropertyId?: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Sign in to access private research", 401);
  const params = new URLSearchParams({ resource });
  if (propertyId) params.set("propertyId", propertyId);
  if (marketForPropertyId) params.set("marketForPropertyId", marketForPropertyId);
  const res = await fetch(`/api/account?${params}`, { method, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await res.json();
  if (!res.ok) throw new ApiError(value.error ?? "Research request failed", res.status);
  return value as T;
}
export const getResearchProject = () => request<ResearchProjectResponse>("research-project");
export const saveResearchProject = (project: BuyingProject) => request<ResearchProjectResponse>("research-project", "PUT", { project });
export const getResearchAssessment = (id: string) => request<ResearchAssessmentResponse>("research-assessment", "GET", undefined, id);
export const saveResearchAssessment = (assessment: ResearchAssessment) => request<ResearchAssessmentResponse>("research-assessment", "PUT", { assessment }, assessment.propertyId);
export const getResearchAssessments = () => request<ResearchAssessmentsResponse>("research-assessments");
export const getResearchHistory = (id?: string) => request<ResearchHistoryResponse>("research-history", "GET", undefined, id);
export const getResearchMarketHistory = (id: string) => request<ResearchHistoryResponse>("research-history", "GET", undefined, undefined, id);
export const previewResearchImport = (body: ResearchImportRequest) => request<ResearchImportPreviewResponse>("research-import-preview", "POST", body);
export const commitResearchImport = (batchId: string) => request<{ batchId: string; imported?: number; duplicates?: number; alreadyCommitted: boolean }>("research-import-commit", "POST", { batchId });

export async function findResearchProperties(query: string): Promise<{ properties: { id: string; address: string }[] }> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ApiError("Sign in to access private research", 401);
  const params = new URLSearchParams({ resource: "research-find", query });
  const response = await fetch(`/api/account?${params}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new ApiError(value.error ?? "Search failed", response.status);
  return value;
}
