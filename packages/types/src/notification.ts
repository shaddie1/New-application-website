/** In-app notification feed DTOs (bell icon on Home, mockup 03). */

export interface NotificationDto {
  id: string;
  kind: string;        // "BOOKING_CONFIRMED" | "CREW_EN_ROUTE" | "POINTS_CREDITED" | ...
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResult {
  notifications: NotificationDto[];
  unreadCount: number;
}

/** Omit `ids` (or pass empty) to mark every notification read. */
export interface MarkNotificationsReadInput {
  ids?: string[];
}
