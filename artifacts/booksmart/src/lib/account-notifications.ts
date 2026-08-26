import { authenticatedApi, apiErrorMessage } from "@/lib/authenticated-api";

export type ActivityNotification = {
  id: number;
  event_type: string;
  title: string;
  description: string;
  amount: number | null;
  route: string | null;
  read_at: string | null;
  created_at: string;
};

export type ActivityResponse = {
  notifications: ActivityNotification[];
  unread_count: number;
};

export async function loadAccountNotifications(): Promise<ActivityResponse> {
  const response = await authenticatedApi("/api/notifications");
  if (!response.ok)
    throw new Error(
      await apiErrorMessage(response, "Could not load account activity."),
    );
  return response.json();
}
