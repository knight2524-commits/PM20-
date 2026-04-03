export type Priority = 'low' | 'medium' | 'high';
export type Status = 'todo' | 'in-progress' | 'done';
export type UserRole = 'admin' | 'member';

export interface User {
  id: string;
  name: string;
  email?: string;
  password?: string;
  role: UserRole;
  avatar?: string;
}

export interface Assignee {
  id: string;
  name: string;
  password?: string;
  avatar?: string;
  note?: string;
  role?: UserRole;
}

export interface TaskAlarm {
  time: string;
  triggered: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeIds: string[]; // Multiple assignees
  assigneeNames: string[]; // Multiple names
  priority: Priority;
  status: Status;
  dueDate: string;
  createdAt: string;
  progress: number; // 0, 50, 100
  alarms?: TaskAlarm[];
  alarm1Settings?: { hour: number; minute: number };
  alarm2Settings?: { hour: number; minute: number };
  isNew?: boolean;
}

export interface SpecialPromotion {
  id: string;
  brand: string;
  orderCode: string;
  productName: string;
  productNumber: string;
  discountRate: number;
  discountPrice: number;
  createdAt: string;
}

export type LedgerStatusType = 'pending' | 'checked' | 'done';

export interface Ledger {
  id: string;
  title: string;
  description: string;
  assigneeId: string; // Specific team member or 'all'
  assigneeName: string;
  status: LedgerStatusType;
  fileUrl?: string;
  fileName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: string;
  read: boolean;
  userId?: string;
}
