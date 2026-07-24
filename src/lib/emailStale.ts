// Cross-screen refresh flag (mirrors contactsStale): the Create Template /
// Campaign / Notification screens mark the relevant list stale on save; each
// list consumes it on focus and refetches, so returning shows the new row
// without a manual pull-to-refresh.
let templatesStale = false;
let campaignsStale = false;
let notificationsStale = false;

export const markEmailTemplatesStale = (): void => {
  templatesStale = true;
};
export const consumeEmailTemplatesStale = (): boolean => {
  const was = templatesStale;
  templatesStale = false;
  return was;
};

export const markEmailCampaignsStale = (): void => {
  campaignsStale = true;
};
export const consumeEmailCampaignsStale = (): boolean => {
  const was = campaignsStale;
  campaignsStale = false;
  return was;
};

export const markEmailNotificationsStale = (): void => {
  notificationsStale = true;
};
export const consumeEmailNotificationsStale = (): boolean => {
  const was = notificationsStale;
  notificationsStale = false;
  return was;
};
