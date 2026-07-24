export const SUBSCRIPTION_UPGRADE_REQUEST_EVENT = "booksmart:subscription-upgrade-request";

export function requestSubscriptionUpgrade() {
  window.dispatchEvent(new Event(SUBSCRIPTION_UPGRADE_REQUEST_EVENT));
}
