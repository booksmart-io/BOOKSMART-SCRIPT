import { useCallback, useEffect, useState } from "react";

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

export function setStoredActiveOrganizationId(numericUserId: number | null | undefined, orgId: number) {
  if (numericUserId == null || typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(numericUserId), String(orgId));
  window.dispatchEvent(new CustomEvent(ACTIVE_ORG_EVENT, { detail: { numericUserId, orgId } }));
}

export function clearStoredActiveOrganizationId(numericUserId: number | null | undefined) {
  if (numericUserId == null || typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(numericUserId));
  window.dispatchEvent(new CustomEvent(ACTIVE_ORG_EVENT, { detail: { numericUserId, orgId: null } }));
}

export function useActiveOrganizationId(numericUserId: number | null | undefined) {
  const [activeOrgId, setActiveOrgIdState] = useState<number | null>(() => getStoredActiveOrganizationId(numericUserId));

  useEffect(() => {
    setActiveOrgIdState(getStoredActiveOrganizationId(numericUserId));
    if (numericUserId == null || typeof window === "undefined") return;

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
