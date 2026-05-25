import { trackers } from '../../../shared/database';

export const trackingMethods = ['habit', 'average', 'project', 'target'] as const;

export type TrackingMethod = (typeof trackingMethods)[number];

export type PersistedTracker = typeof trackers.$inferSelect & {
  method: TrackingMethod;
};

export type CreateTrackerInput = {
  method: TrackingMethod;
  name: string;
};
