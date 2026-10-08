import Link from "next/link";
import type { NotificationDto } from "@/contracts";
import styles from "./notifications.module.css";

export interface NotificationListLabels {
  dateLabel: string;
  markRead: string;
  openDestination: string;
  pending: string;
  read: string;
  unread: string;
}

export interface NotificationDestination {
  href: string | null;
  reason: string | null;
}

export function NotificationList({
  categoryLabel,
  destinationFor,
  formatDate,
  labels,
  notifications,
  onMarkRead,
  pendingIds,
}: {
  categoryLabel: (notification: NotificationDto) => string;
  destinationFor: (notification: NotificationDto) => NotificationDestination;
  formatDate: (notification: NotificationDto) => string;
  labels: NotificationListLabels;
  notifications: readonly NotificationDto[];
  onMarkRead: (notification: NotificationDto) => void;
  pendingIds: ReadonlySet<string>;
}) {
  return (
    <ul className={styles.list}>
      {notifications.map((notification) => {
        const pending = pendingIds.has(notification.id);
        const destination = destinationFor(notification);
        return (
          <li
            className={
              notification.readAt === null ? styles.unread : styles.read
            }
            key={notification.id}
          >
            <div className={styles.itemHeader}>
              <strong>{notification.title}</strong>
              <span>
                {categoryLabel(notification)} ·{" "}
                {notification.readAt === null ? labels.unread : labels.read}
              </span>
            </div>
            <p>{notification.body}</p>
            <time
              aria-label={`${labels.dateLabel}: ${formatDate(notification)}`}
              dateTime={notification.createdAt}
            >
              {formatDate(notification)}
            </time>
            <div className={styles.actions}>
              {notification.readAt === null ? (
                <button
                  disabled={pending}
                  onClick={() => onMarkRead(notification)}
                  type="button"
                >
                  {pending ? labels.pending : labels.markRead}
                </button>
              ) : null}
              {destination.href ? (
                <Link href={destination.href}>{labels.openDestination}</Link>
              ) : null}
              {destination.reason ? <small>{destination.reason}</small> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
