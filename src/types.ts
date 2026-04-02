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
  assigneeId: string; // Changed to ID for better mapping
  assigneeName: string; // Keep for convenience
  priority: Priority;
  status: Status;
  dueDate: string;
  createdAt: string;
  progress: number; // 0, 50, 100
  alarms?: TaskAlarm[];
  isNew?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  timestamp: string;
  read: boolean;
}
