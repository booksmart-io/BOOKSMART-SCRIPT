import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

const ACTIVE_ORG_EVENT = "booksmart-active-organization-change";

function storageKey(numericUserId: number) {
  return `booksmart:active-org:${numericUserId}`;
}

export function getStoredActiveOrganizationId(numericUserId: number | null | undefined) {
  if (numericUserId == null || typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(numericUserId));
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cacheActiveOrganizationId(numericUserId: number, orgId: number | null) {
  if (typeof window === "undefined") return;
  if (orgId == null) {
    window.localStorage.removeItem(storageKey(numericUserId));
  } else {
    window.localStorage.setItem(storageKey(numericUserId), String(orgId));
  }
}

function notifyActiveOrganizationChange(numericUserId: number, orgId: number | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_ORG_EVENT, { detail: { numericUserId, orgId } }));
}

async function persistActiveOrganizationId(numericUserId: number, orgId: number | null) {
  const { error } = await supabase
    .from("users")
    .update({ active_org_id: orgId })
    .eq("id", numericUserId);

  if (error) {
    console.warn("Unable to save active organization preference", error);
  }
}

export function setStoredActiveOrganizationId(numericUserId: number | null | undefined, orgId: number) {
  if (numericUserId == null) return;
  cacheActiveOrganizationId(numericUserId, orgId);
  notifyActiveOrganizationChange(numericUserId, orgId);
  void persistActiveOrganizationId(numericUserId, orgId);
}

export function clearStoredActiveOrganizationId(numericUserId: number | null | undefined) {
  if (numericUserId == null) return;
  cacheActiveOrganizationId(numericUserId, null);
  notifyActiveOrganizationChange(numericUserId, null);
  void persistActiveOrganizationId(numericUserId, null);
}

export function useActiveOrganizationId(numericUserId: number | null | undefined) {
  const [activeOrgId, setActiveOrgIdState] = useState<number | null>(() => getStoredActiveOrganizationId(numericUserId));

  useEffect(() => {
    setActiveOrgIdState(getStoredActiveOrganizationId(numericUserId));
    if (numericUserId == null || typeof window === "undefined") return;
    let cancelled = false;

    supabase
      .from("users")
      .select("active_org_id")
      .eq("id", numericUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("Unable to load active organization preference", error);
          return;
        }

        const dbOrgId = Number((data as { active_org_id?: number | null } | null)?.active_org_id);
        if (Number.isFinite(dbOrgId) && dbOrgId > 0) {
          cacheActiveOrganizationId(numericUserId, dbOrgId);
          setActiveOrgIdState(dbOrgId);
        }
      });

    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ numericUserId?: number; orgId?: number | null }>).detail;
      if (detail?.numericUserId === numericUserId) {
        setActiveOrgIdState(typeof detail.orgId === "number" ? detail.orgId : null);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(numericUserId)) {
        setActiveOrgIdState(getStoredActiveOrganizationId(numericUserId));
      }
    };

    window.addEventListener(ACTIVE_ORG_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(ACTIVE_ORG_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [numericUserId]);

  const setActiveOrgId = useCallback((orgId: number) => {
    setStoredActiveOrganizationId(numericUserId, orgId);
    setActiveOrgIdState(orgId);
  }, [numericUserId]);

  return [activeOrgId, setActiveOrgId] as const;
}

export function pickActiveOrganization<T extends { id?: number | null }>(
  orgs: T[] | null | undefined,
  activeOrgId: number | null | undefined,
) {
  if (!orgs?.length) return null;
  return orgs.find((org) => typeof org.id === "number" && org.id === activeOrgId) ?? orgs[0];
}
