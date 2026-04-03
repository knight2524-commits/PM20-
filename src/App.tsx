/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MoreVertical, 
  Calendar, 
  User as UserIcon, 
  ChevronRight,
  FolderKanban,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Users,
  CheckCircle,
  Trash2,
  UserPlus,
  Tag,
  BookOpen,
  FileSpreadsheet,
  FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy,
  setDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, auth, signInAnonymously, signOut, onAuthStateChanged } from './firebase';
import { cn } from './lib/utils';
import { Task, Priority, Assignee, AppNotification, Status, User, UserRole, TaskAlarm, SpecialPromotion, Ledger } from './types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mock Data
const ADMIN_USER: User = {
  id: 'admin',
  name: '관리자',
  role: 'admin',
  password: '2014038'
};

const MOCK_ASSIGNEES: Assignee[] = [
  { id: 'u1', name: '김철수', password: '123' },
  { id: 'u2', name: '이영희', password: '123' },
  { id: 'u3', name: '박지민', password: '123' },
  { id: 'u4', name: '최다은', password: '123' },
];

const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: '디자인 시스템 가이드라인 작성',
    description: '브랜드 아이덴티티를 반영한 새로운 디자인 시스템 가이드라인을 작성합니다.',
    assigneeIds: ['u1'],
    assigneeNames: ['김철수'],
    priority: 'high',
    status: 'in-progress',
    dueDate: '2026-04-15',
    createdAt: '2026-03-25',
    progress: 50,
    alarm1Settings: { hour: 1, minute: 0 },
    alarm2Settings: { hour: 2, minute: 0 }
  },
  {
    id: '2',
    title: 'API 문서 자동화 스크립트 개발',
    description: 'Swagger를 활용하여 API 문서를 자동으로 생성하는 스크립트를 개발합니다.',
    assigneeIds: ['u2'],
    assigneeNames: ['이영희'],
    priority: 'medium',
    status: 'todo',
    dueDate: '2026-04-20',
    createdAt: '2026-03-28',
    progress: 0,
    alarm1Settings: { hour: 1, minute: 0 },
    alarm2Settings: { hour: 2, minute: 0 }
  },
  {
    id: '3',
    title: '고객 피드백 분석 보고서',
    description: '지난 분기 고객 피드백을 분석하여 개선 사항을 도출합니다.',
    assigneeIds: ['u3'],
    assigneeNames: ['박지민'],
    priority: 'low',
    status: 'done',
    dueDate: '2026-04-05',
    createdAt: '2026-03-20',
    progress: 100,
    alarm1Settings: { hour: 1, minute: 0 },
    alarm2Settings: { hour: 2, minute: 0 }
  },
  {
    id: '4',
    title: '신규 기능 기획안 검토',
    description: '하반기 출시 예정인 신규 기능에 대한 기획안을 검토하고 피드백을 전달합니다.',
    assigneeIds: ['u4'],
    assigneeNames: ['최다은'],
    priority: 'high',
    status: 'todo',
    dueDate: '2026-04-10',
    createdAt: '2026-03-30',
    progress: 0,
    alarm1Settings: { hour: 1, minute: 0 },
    alarm2Settings: { hour: 2, minute: 0 }
  }
];

const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', title: '새 업무 할당', message: '김철수님에게 "디자인 시스템" 업무가 할당되었습니다.', type: 'info', timestamp: new Date().toISOString(), read: false, userId: 'u1' },
  { id: 'n2', title: '마감 임박', message: '"고객 피드백" 업무 마감이 1시간 남았습니다.', type: 'warning', timestamp: new Date().toISOString(), read: false, userId: 'u3' },
];

const PRIORITY_COLORS = {
  low: 'bg-blue-100 text-blue-700 border-blue-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high: 'bg-red-100 text-red-700 border-red-200'
};

const STATUS_ICONS = {
  todo: <Clock className="w-4 h-4" />,
  'in-progress': <AlertCircle className="w-4 h-4" />,
  done: <CheckCircle2 className="w-4 h-4" />
};

const STATUS_LABELS = {
  todo: '대기 중',
  'in-progress': '진행 중',
  done: '완료'
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [promotions, setPromotions] = useState<SpecialPromotion[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'promotions' | 'ledgers' | 'team' | 'settings'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [filters, setFilters] = useState<{
    status: Status | 'all';
    priority: Priority | 'all';
    assigneeId: string | 'all';
  }>({
    status: 'all',
    priority: 'all',
    assigneeId: 'all'
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAssigneeModalOpen, setIsAssigneeModalOpen] = useState(false);
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const selectedLedger = useMemo(() => ledgers.find(l => l.id === selectedLedgerId), [ledgers, selectedLedgerId]);
  const [isLedgerDetailModalOpen, setIsLedgerDetailModalOpen] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({
    paymentDate: '',
    paymentType: ''
  });
  const [excelData, setExcelData] = useState<any[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<SpecialPromotion | null>(null);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [selectedStat, setSelectedStat] = useState<Status | 'all' | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    type: 'task' | 'assignee' | 'reset';
    id?: string;
    title?: string;
  }>({ isOpen: false, type: 'task' });
  const [viewingNote, setViewingNote] = useState<{
    isOpen: boolean;
    assigneeId: string;
    assigneeName: string;
    note: string;
  }>({ isOpen: false, assigneeId: '', assigneeName: '', note: '' });
  
  const [promotionForm, setPromotionForm] = useState({
    brand: '',
    orderCode: '',
    productName: '',
    productNumber: '',
    discountRate: 0,
    discountPrice: 0
  });

  const [ledgerForm, setLedgerForm] = useState<{
    title: string;
    description: string;
    assigneeId: string;
    file: File | null;
  }>({
    title: '',
    description: '',
    assigneeId: 'all',
    file: null
  });

  const [confirmReset, setConfirmReset] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('taskflow_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginUser, setLoginUser] = useState<Assignee | User | null>(null);
  const [loginPassword, setLoginPassword] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  // Auth Listener (Background Anonymous Login)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Anonymous login error:', error);
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedLedger?.fileUrl && selectedLedger.fileUrl !== '#') {
      fetch(selectedLedger.fileUrl)
        .then(res => res.arrayBuffer())
        .then(buffer => {
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);
          setExcelData(data);
        })
        .catch(err => {
          console.error('Excel parsing error:', err);
          setExcelData([]);
        });
    } else if (selectedLedger?.fileName) {
      // Mock data for demo if file exists but URL is #
      const mockRows = [
        { '업체코드': '62863', '업체명': '삼호에스엔씨', '결제일자': '당월', '지불유형': '구매자금', '비고': '' },
        { '업체코드': '62268', '업체명': '호스릴', '결제일자': '10일', '지불유형': '현금', '비고': '' },
        { '업체코드': '62522', '업체명': '오토스테크주식회사(대구)', '결제일자': '10일', '지불유형': '어음', '비고': '60일' },
        { '업체코드': '62523', '업체명': '주식회사오토스윙(대구)', '결제일자': '10일', '지불유형': '어음', '비고': '60일' },
        { '업체코드': '62986', '업체명': '글로벌텍(대구)', '결제일자': '10일', '지불유형': '구매자금', '비고': '' },
        { '업체코드': '63761', '업체명': '신풍섬유', '결제일자': '10일', '지불유형': '구매자금', '비고': '' },
        { '업체코드': '62517', '업체명': '레오파드', '결제일자': '10일', '지불유형': '구매자금', '비고': '' },
        { '업체코드': '63735', '업체명': '네오메드', '결제일자': '10일', '지불유형': '구매자금', '비고': '' },
        { '업체코드': '62263', '업체명': '주식회사 웨프', '결제일자': '10일', '지불유형': '구매자금', '비고': '' }
      ];
      
      // Generate up to 50 rows for demo
      const extendedMock = [...mockRows];
      for (let i = 0; i < 41; i++) {
        extendedMock.push({
          '업체코드': `CODE-${1000 + i}`,
          '업체명': `테스트 업체 ${i + 1}`,
          '결제일자': ['5일', '10일', '20일', '25일', '당월'][i % 5],
          '지불유형': '구매자금',
          '비고': i % 3 === 0 ? '특이사항 있음' : ''
        });
      }
      setExcelData(extendedMock);
    } else {
      setExcelData([]);
    }
  }, [selectedLedger]);
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('taskflow_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('taskflow_user');
    }
  }, [currentUser]);

  // Firestore Synchronization
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      setTasks(tasksData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    // Fetch assignees even if not logged in so the login screen can show them
    const unsubscribe = onSnapshot(collection(db, 'assignees'), (snapshot) => {
      const assigneesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assignee));
      setAssignees(assigneesData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'assignees'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', currentUser.id),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notificationsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
      setNotifications(notificationsData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'special_promotions'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialPromotion));
      setPromotions(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'special_promotions'));
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'ledgers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ledger));
      setLedgers(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ledgers'));
    return () => unsubscribe();
  }, [currentUser]);

  // Persistence for user only
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('taskflow_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('taskflow_user');
    }
  }, [currentUser]);

  // Deadline Check
  useEffect(() => {
    const checkDeadlines = () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todayStr = format(today, 'yyyy-MM-dd');
      const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
      
      const newNotifications: AppNotification[] = [];
      
      tasks.forEach(task => {
        if (task.status === 'done') return;
        
        if (task.dueDate === todayStr) {
          const exists = notifications.some(n => n.title === '마감 임박' && n.message.includes(task.title) && format(new Date(n.timestamp), 'yyyy-MM-dd') === todayStr);
          if (!exists) {
            newNotifications.push({
              id: Math.random().toString(36).substr(2, 9),
              title: '마감 임박',
              message: `"${task.title}" 업무 마감일이 오늘입니다!`,
              type: 'warning',
              timestamp: new Date().toISOString(),
              read: false
            });
          }
        } else if (task.dueDate === tomorrowStr) {
          const exists = notifications.some(n => n.title === '마감 알림' && n.message.includes(task.title) && format(new Date(n.timestamp), 'yyyy-MM-dd') === todayStr);
          if (!exists) {
            newNotifications.push({
              id: Math.random().toString(36).substr(2, 9),
              title: '마감 알림',
              message: `"${task.title}" 업무 마감일이 내일입니다.`,
              type: 'info',
              timestamp: new Date().toISOString(),
              read: false
            });
          }
        }
      });
      
      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
      }
    };
    
    if (currentUser) {
      checkDeadlines();
    }
  }, [tasks, currentUser]);

  // Alarm Checker
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      const now = new Date();
      
      tasks.forEach(async (task) => {
        if (!task.alarms || task.alarms.length === 0) return;
        
        let taskUpdated = false;
        const updatedAlarms = task.alarms.map(alarm => {
          if (!alarm.triggered && new Date(alarm.time) <= now) {
            // Trigger alarm if current user is one of the assignees
            if (task.assigneeIds?.includes(currentUser.id)) {
              showBrowserNotification('업무 알람', `"${task.title}" 업무의 설정된 알람 시간입니다.`);
              
              // Add to Firestore notifications
              addDoc(collection(db, 'notifications'), {
                title: '업무 알람',
                message: `"${task.title}" 업무의 알람 시간입니다.`,
                type: 'warning',
                timestamp: new Date().toISOString(),
                read: false,
                userId: currentUser.id
              }).catch(err => console.error("Notification error:", err));
            }
            taskUpdated = true;
            return { ...alarm, triggered: true };
          }
          return alarm;
        });

        if (taskUpdated) {
          try {
            await updateDoc(doc(db, 'tasks', task.id), { alarms: updatedAlarms });
          } catch (error) {
            console.error("Alarm update error:", error);
          }
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [tasks, currentUser]);

  // New Task Form State
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeIds: [] as string[],
    priority: 'medium' as Priority,
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    progress: 0,
    alarm1Settings: { hour: 0, minute: 0 },
    alarm2Settings: { hour: 0, minute: 0 }
  });

  // New Assignee Form State
  const [newAssignee, setNewAssignee] = useState({
    name: '',
    password: ''
  });

  const [loginError, setLoginError] = useState('');

  // Request Notification Permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let baseTasks = tasks;
    
    // If not admin, only show assigned tasks
    if (!isAdmin && currentUser) {
      baseTasks = baseTasks.filter(task => task.assigneeIds?.includes(currentUser.id));
    }
    
    return baseTasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           task.assigneeNames?.some(name => name.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = filters.status === 'all' || task.status === filters.status;
      const matchesPriority = filters.priority === 'all' || task.priority === filters.priority;
      const matchesAssignee = filters.assigneeId === 'all' || task.assigneeIds?.includes(filters.assigneeId);
      
      return matchesSearch && matchesStatus && matchesPriority && matchesAssignee;
    });
  }, [tasks, searchQuery, filters, isAdmin, currentUser]);

  const filteredPromotions = useMemo(() => {
    return promotions.filter(p => {
      const search = searchQuery.toLowerCase();
      return p.brand.toLowerCase().includes(search) || 
             p.productName.toLowerCase().includes(search) || 
             p.productNumber.toLowerCase().includes(search) || 
             p.orderCode.toLowerCase().includes(search);
    });
  }, [promotions, searchQuery]);

  const filteredLedgers = useMemo(() => {
    let base = ledgers;
    if (!isAdmin && currentUser) {
      base = base.filter(l => l.assigneeId === 'all' || l.assigneeId === currentUser.id);
    }
    return base.filter(l => {
      const search = searchQuery.toLowerCase();
      const matchesSearch = l.title.toLowerCase().includes(search) || 
                          l.description.toLowerCase().includes(search);
      const matchesAssignee = filters.assigneeId === 'all' || l.assigneeId === filters.assigneeId;
      return matchesSearch && matchesAssignee;
    });
  }, [ledgers, searchQuery, filters, isAdmin, currentUser]);

  const stats = useMemo(() => {
    const baseTasks = isAdmin ? tasks : tasks.filter(t => t.assigneeIds?.includes(currentUser?.id || ''));
    const total = baseTasks.length;
    const done = baseTasks.filter(t => t.status === 'done').length;
    const inProgress = baseTasks.filter(t => t.status === 'in-progress').length;
    const todo = baseTasks.filter(t => t.status === 'todo').length;
    return { total, done, inProgress, todo };
  }, [tasks, isAdmin, currentUser]);

  const teamStats = useMemo(() => {
    return assignees.map(assignee => {
      const userTasks = tasks.filter(t => t.assigneeIds?.includes(assignee.id));
      const total = userTasks.length;
      const totalProgress = userTasks.reduce((acc, t) => acc + (t.progress || 0), 0);
      const progress = total > 0 ? Math.round(totalProgress / total) : 0;
      const done = userTasks.filter(t => t.status === 'done').length;
      return { ...assignee, total, done, progress };
    });
  }, [tasks, assignees]);

  const handleSaveTask = async () => {
    if (!taskForm.title) return;
    const selectedAssignees = assignees.filter(a => taskForm.assigneeIds.includes(a.id));
    const assigneeNames = selectedAssignees.map(a => a.name);
    
    const calculateAlarms = (baseTime: Date) => {
      const alarms: TaskAlarm[] = [];
      if (taskForm.alarm1Settings.hour > 0 || taskForm.alarm1Settings.minute > 0) {
        const time = new Date(baseTime.getTime() + (taskForm.alarm1Settings.hour * 60 + taskForm.alarm1Settings.minute) * 60 * 1000);
        alarms.push({ time: time.toISOString(), triggered: false });
      }
      if (taskForm.alarm2Settings.hour > 0 || taskForm.alarm2Settings.minute > 0) {
        const time = new Date(baseTime.getTime() + (taskForm.alarm2Settings.hour * 60 + taskForm.alarm2Settings.minute) * 60 * 1000);
        alarms.push({ time: time.toISOString(), triggered: false });
      }
      return alarms;
    };

    try {
      if (editingTask) {
        const taskRef = doc(db, 'tasks', editingTask.id);
        const alarmsChanged = 
          editingTask.alarm1Settings?.hour !== taskForm.alarm1Settings.hour || 
          editingTask.alarm1Settings?.minute !== taskForm.alarm1Settings.minute ||
          editingTask.alarm2Settings?.hour !== taskForm.alarm2Settings.hour || 
          editingTask.alarm2Settings?.minute !== taskForm.alarm2Settings.minute;
        
        await updateDoc(taskRef, {
          ...taskForm,
          assigneeNames,
          status: taskForm.progress === 100 ? 'done' : (taskForm.progress > 0 ? 'in-progress' : editingTask.status),
          alarms: alarmsChanged ? calculateAlarms(new Date()) : (editingTask.alarms || [])
        });
        
        // Add notification for each assignee
        for (const assigneeId of taskForm.assigneeIds) {
          await addDoc(collection(db, 'notifications'), {
            title: '업무 수정됨',
            message: `"${taskForm.title}" 업무가 수정되었습니다.`,
            type: 'info',
            timestamp: new Date().toISOString(),
            read: false,
            userId: assigneeId
          });
        }
      } else {
        const createdAt = new Date().toISOString();
        const taskData = {
          ...taskForm,
          assigneeNames,
          status: taskForm.progress === 100 ? 'done' : (taskForm.progress > 0 ? 'in-progress' : 'todo'),
          createdAt,
          alarms: calculateAlarms(new Date()),
          isNew: true
        };
        await addDoc(collection(db, 'tasks'), taskData);
        
        // Add notification for each assignee
        for (const assigneeId of taskForm.assigneeIds) {
          await addDoc(collection(db, 'notifications'), {
            title: '새 업무 추가됨',
            message: `"${taskForm.title}" 업무가 생성되었습니다.`,
            type: 'success',
            timestamp: new Date().toISOString(),
            read: false,
            userId: assigneeId
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, editingTask ? OperationType.UPDATE : OperationType.CREATE, 'tasks');
    }
    
    setIsModalOpen(false);
    setEditingTask(null);
    setTaskForm({
      title: '',
      description: '',
      assigneeIds: [],
      priority: 'medium',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      progress: 0,
      alarm1Settings: { hour: 0, minute: 0 },
      alarm2Settings: { hour: 0, minute: 0 }
    });
  };

  const handleSavePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promotionForm.brand || !promotionForm.productName) return;
    try {
      if (editingPromotion) {
        await updateDoc(doc(db, 'special_promotions', editingPromotion.id), {
          ...promotionForm,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'special_promotions'), {
          ...promotionForm,
          createdAt: new Date().toISOString()
        });
      }
      setIsPromotionModalOpen(false);
      setEditingPromotion(null);
      setPromotionForm({
        brand: '',
        orderCode: '',
        productName: '',
        productNumber: '',
        discountRate: 0,
        discountPrice: 0
      });
    } catch (error) {
      handleFirestoreError(error, editingPromotion ? OperationType.UPDATE : OperationType.CREATE, 'special_promotions');
    }
  };

   const handleSaveLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerForm.title) return;
    try {
      let fileData = {};
      if (ledgerForm.file) {
        fileData = {
          fileName: ledgerForm.file.name,
          fileUrl: '#' // Mock URL
        };
      }

      const assignee = ledgerForm.assigneeId === 'all' ? { id: 'all', name: '전체' } : assignees.find(a => a.id === ledgerForm.assigneeId);

      const { file, ...formData } = ledgerForm;

      if (editingLedger) {
        await updateDoc(doc(db, 'ledgers', editingLedger.id), {
          ...formData,
          ...fileData,
          assigneeName: assignee?.name || '',
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'ledgers'), {
          ...formData,
          ...fileData,
          assigneeName: assignee?.name || '',
          checks: {
            '5일': false,
            '10일': false,
            '20일': false,
            '25일': false,
            '당월': false
          },
          checkedRows: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      setIsLedgerModalOpen(false);
      setEditingLedger(null);
      setLedgerForm({ title: '', description: '', assigneeId: 'all', file: null });
    } catch (error) {
      handleFirestoreError(error, editingLedger ? OperationType.UPDATE : OperationType.CREATE, 'ledgers');
    }
  };

  const toggleLedgerCheck = async (ledger: Ledger, checkKey: string) => {
    try {
      const newChecks = {
        ...ledger.checks,
        [checkKey]: !ledger.checks[checkKey as keyof typeof ledger.checks]
      };
      
      await updateDoc(doc(db, 'ledgers', ledger.id), {
        checks: newChecks,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'ledgers');
    }
  };

  const toggleRowCheck = async (ledger: Ledger, rowIndex: number, rowDate: string) => {
    try {
      const currentCheckedRows = ledger.checkedRows || [];
      const isChecked = currentCheckedRows.includes(rowIndex);
      const newCheckedRows = isChecked 
        ? currentCheckedRows.filter(id => id !== rowIndex)
        : [...currentCheckedRows, rowIndex];
      
      // Derive date status
      const dateKeys = ['5일', '10일', '20일', '25일', '당월'];
      const newChecks = { ...ledger.checks };
      
      if (dateKeys.includes(rowDate)) {
        // Find all rows with this date
        const rowsForDate = excelData.filter(r => String(r['결제일자'] || '') === rowDate);
        // Find their indices in the original excelData
        const indicesForDate = excelData
          .map((r, idx) => String(r['결제일자'] || '') === rowDate ? idx : -1)
          .filter(idx => idx !== -1);
        
        // Check if all these indices are in newCheckedRows
        const allChecked = indicesForDate.every(idx => newCheckedRows.includes(idx));
        newChecks[rowDate as keyof typeof ledger.checks] = allChecked;
      }

      await updateDoc(doc(db, 'ledgers', ledger.id), {
        checkedRows: newCheckedRows,
        checks: newChecks,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'ledgers');
    }
  };

  const handleDeleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    if (!taskToDelete) return;
    
    setDeleteConfirmation({
      isOpen: true,
      type: 'task',
      id: id,
      title: taskToDelete.title
    });
  };

  const confirmDelete = async () => {
    try {
      if (deleteConfirmation.type === 'task' && deleteConfirmation.id) {
        const id = deleteConfirmation.id;
        const taskToDelete = tasks.find(t => t.id === id);
        await deleteDoc(doc(db, 'tasks', id));
        
        await addDoc(collection(db, 'notifications'), {
          title: '업무 삭제됨',
          message: `"${taskToDelete?.title}" 업무가 삭제되었습니다.`,
          type: 'warning',
          timestamp: new Date().toISOString(),
          read: false,
          userId: taskToDelete?.assigneeIds?.[0] || ''
        });
      } else if (deleteConfirmation.type === 'assignee' && deleteConfirmation.id) {
        const id = deleteConfirmation.id;
        const assigneeToDelete = assignees.find(a => a.id === id);
        await deleteDoc(doc(db, 'assignees', id));
        
        if (currentUser) {
          await addDoc(collection(db, 'notifications'), {
            title: '팀원 삭제됨',
            message: `"${assigneeToDelete?.name}" 팀원이 삭제되었습니다.`,
            type: 'warning',
            timestamp: new Date().toISOString(),
            read: false,
            userId: currentUser.id
          });
        }
      } else if (deleteConfirmation.type === 'reset') {
        // Reset is complex in Firestore, maybe just clear and re-add mock data
        // For now, let's skip reset or implement it carefully
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, deleteConfirmation.type === 'task' ? 'tasks' : 'assignees');
    }
    
    setDeleteConfirmation({ ...deleteConfirmation, isOpen: false });
  };

  const handleDeleteAssignee = (id: string) => {
    const assigneeToDelete = assignees.find(a => a.id === id);
    if (!assigneeToDelete) return;

    setDeleteConfirmation({
      isOpen: true,
      type: 'assignee',
      id: id,
      title: assigneeToDelete.name
    });
  };

  const handleSaveNote = async (note: string) => {
    if (!currentUser) return;
    try {
      const assigneeRef = doc(db, 'assignees', currentUser.id);
      await updateDoc(assigneeRef, { note });
      
      await addDoc(collection(db, 'notifications'), {
        title: '노트 저장됨',
        message: '개인 노트가 성공적으로 저장되었습니다.',
        type: 'success',
        timestamp: new Date().toISOString(),
        read: false,
        userId: currentUser.id
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'assignees');
    }
  };

  const handleDeleteNote = async (assigneeId: string) => {
    try {
      const assigneeRef = doc(db, 'assignees', assigneeId);
      await updateDoc(assigneeRef, { note: '' });
      
      if (currentUser) {
        await addDoc(collection(db, 'notifications'), {
          title: '메모 삭제됨',
          message: `메모가 삭제되었습니다.`,
          type: 'info',
          timestamp: new Date().toISOString(),
          read: false,
          userId: currentUser.id
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'assignees');
    }
    setViewingNote({ ...viewingNote, isOpen: false });
  };

  const toggleTaskStatus = async (id: string) => {
    const statusOrder: Status[] = ['todo', 'in-progress', 'done'];
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const currentIndex = statusOrder.indexOf(task.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    const nextStatusLabel = nextStatus === 'todo' ? '할 일' : nextStatus === 'in-progress' ? '진행 중' : '완료';

    try {
      await updateDoc(doc(db, 'tasks', id), { status: nextStatus });
      
      await addDoc(collection(db, 'notifications'), {
        title: '상태 변경',
        message: `"${task.title}" 업무 상태가 "${nextStatusLabel}"(으)로 변경되었습니다.`,
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
        userId: task.assigneeIds?.[0] || ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'tasks');
    }
  };

  const openEditModal = async (task: Task) => {
    if (task.isNew) {
      try {
        await updateDoc(doc(db, 'tasks', task.id), { isNew: false });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'tasks');
      }
    }
    setEditingTask(task);
    setTaskForm({
      title: task.title,
      description: task.description,
      assigneeIds: task.assigneeIds || [],
      priority: task.priority,
      dueDate: task.dueDate,
      progress: task.progress || 0,
      alarm1Settings: task.alarm1Settings || { hour: 0, minute: 0 },
      alarm2Settings: task.alarm2Settings || { hour: 0, minute: 0 }
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingTask(null);
    setTaskForm({
      title: '',
      description: '',
      assigneeIds: [],
      priority: 'medium',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      progress: 0,
      alarm1Settings: { hour: 0, minute: 0 },
      alarm2Settings: { hour: 0, minute: 0 }
    });
    setIsModalOpen(true);
  };

  const handleAddAssignee = async () => {
    if (!newAssignee.name || !newAssignee.password) return;
    try {
      await addDoc(collection(db, 'assignees'), {
        ...newAssignee,
        note: ''
      });
      
      if (currentUser) {
        await addDoc(collection(db, 'notifications'), {
          title: '새 팀원 합류',
          message: `새로운 팀원 "${newAssignee.name}"님이 추가되었습니다.`,
          type: 'success',
          timestamp: new Date().toISOString(),
          read: false,
          userId: currentUser.id
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'assignees');
    }

    setIsAssigneeModalOpen(false);
    setNewAssignee({ name: '', password: '' });
  };

  const markAllAsRead = async () => {
    try {
      const batchPromises = notifications.filter(n => !n.read).map(n => 
        updateDoc(doc(db, 'notifications', n.id), { read: true })
      );
      await Promise.all(batchPromises);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'notifications');
    }
  };

  const showBrowserNotification = (title: string, body: string) => {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      new Notification(title, { 
        body, 
        requireInteraction: true,
        icon: '/favicon.ico' // Optional: add an icon if available
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, { body, requireInteraction: true });
        }
      });
    }
  };

  const clearAllNotifications = async () => {
    try {
      const batchPromises = notifications.map(n => 
        deleteDoc(doc(db, 'notifications', n.id))
      );
      await Promise.all(batchPromises);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notifications');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser) return;

    if (loginPassword === loginUser.password) {
      const userToSet: User = 'role' in loginUser 
        ? loginUser as User 
        : { ...loginUser, role: 'member' } as User;
      
      setCurrentUser(userToSet);
      setLoginUser(null);
      setLoginPassword('');
      setLoginError('');
    } else {
      setLoginError('비밀번호가 일치하지 않습니다.');
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-2xl border border-[#E5E7EB] w-full max-w-md"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#4F46E5] rounded-2xl flex items-center justify-center text-white shadow-xl mb-4">
              <FolderKanban className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">TaskFlow 로그인</h1>
            <p className="text-[#6B7280] text-sm mt-1">
              {loginUser ? `${loginUser.name}님으로 로그인` : '계정 유형을 선택하여 시작하세요.'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!loginUser ? (
              <motion.div 
                key="selection"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <button 
                  onClick={() => setLoginUser(ADMIN_USER)}
                  className="w-full flex items-center gap-4 p-4 bg-white border-2 border-[#E5E7EB] rounded-2xl hover:border-[#4F46E5] hover:bg-indigo-50 transition-all group"
                >
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-[#4F46E5] group-hover:bg-[#4F46E5] group-hover:text-white transition-colors">
                    <Settings className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold">관리자로 접속</p>
                    <p className="text-xs text-[#6B7280]">모든 권한을 가집니다.</p>
                  </div>
                </button>

                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#E5E7EB]"></div></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-[#9CA3AF] font-bold">또는 팀원으로 접속</span></div>
                </div>

                <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto pr-2">
                  {assignees.map(assignee => (
                    <button 
                      key={assignee.id}
                      onClick={() => setLoginUser(assignee)}
                      className="flex items-center gap-3 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl hover:bg-white hover:border-[#4F46E5] transition-all group"
                    >
                      <div className="w-8 h-8 bg-white border border-[#E5E7EB] rounded-full flex items-center justify-center text-[#6B7280] group-hover:text-[#4F46E5]">
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">{assignee.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.form 
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleLogin}
                className="space-y-6"
              >
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">비밀번호 입력</label>
                  <input 
                    autoFocus
                    type="password" 
                    placeholder="비밀번호를 입력하세요"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                  {loginError && <p className="text-xs text-red-500 font-medium">{loginError}</p>}
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => { setLoginUser(null); setLoginPassword(''); setLoginError(''); }}
                    className="flex-1 py-3 bg-[#F3F4F6] text-[#6B7280] rounded-xl font-bold hover:bg-[#E5E7EB] transition-all"
                  >
                    뒤로가기
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-3 bg-[#4F46E5] text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all"
                  >
                    로그인
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-white border-r border-[#E5E7EB] flex flex-col z-20"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <FolderKanban className="w-6 h-6" />
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-xl tracking-tight"
            >
              TaskFlow
            </motion.span>
          )}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <SidebarItem 
            icon={<LayoutDashboard className="w-5 h-5" />} 
            label="대시보드" 
            active={activeTab === 'dashboard'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarItem 
            icon={<CheckCircle2 className="w-5 h-5" />} 
            label="업무 관리" 
            active={activeTab === 'tasks'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('tasks')}
          />
          <SidebarItem 
            icon={<Tag className="w-5 h-5" />} 
            label="특판 안내" 
            active={activeTab === 'promotions'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('promotions')}
          />
          <SidebarItem 
            icon={<BookOpen className="w-5 h-5" />} 
            label="장부 현황" 
            active={activeTab === 'ledgers'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('ledgers')}
          />
          <SidebarItem 
            icon={<Users className="w-5 h-5" />} 
            label="팀원 관리" 
            active={activeTab === 'team'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('team')}
          />
          <SidebarItem 
            icon={<Settings className="w-5 h-5" />} 
            label="설정" 
            active={activeTab === 'settings'} 
            isOpen={isSidebarOpen}
            onClick={() => setActiveTab('settings')}
          />
        </nav>

        <div className="p-4 border-t border-[#E5E7EB]">
          <SidebarItem 
            icon={<LogOut className="w-5 h-5" />} 
            label="로그아웃" 
            isOpen={isSidebarOpen}
            onClick={handleLogout}
          />
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Header */}
        <header className="h-20 bg-white border-b border-[#E5E7EB] flex items-center justify-between px-8 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5 text-[#6B7280]" />
            </button>
            <h1 className="text-xl font-semibold">
              {activeTab === 'dashboard' ? '대시보드' : activeTab === 'tasks' ? '업무 관리' : activeTab === 'team' ? '팀원 관리' : '설정'}
            </h1>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input 
                type="text" 
                placeholder="업무 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-[#F3F4F6] border-none rounded-full w-64 focus:ring-2 focus:ring-[#4F46E5] transition-all text-sm"
              />
            </div>
            <div className="relative">
              <button 
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="relative p-2 hover:bg-[#F3F4F6] rounded-full transition-colors"
              >
                <Bell className="w-5 h-5 text-[#6B7280]" />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
              
              <AnimatePresence>
                {isNotificationOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsNotificationOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] z-40 overflow-hidden"
                    >
                      <div className="p-4 border-b border-[#E5E7EB] flex items-center justify-between">
                        <h3 className="font-bold">알림</h3>
                        <div className="flex gap-2">
                          <button onClick={markAllAsRead} className="text-xs text-[#4F46E5] font-medium hover:underline">모두 읽음</button>
                          <span className="text-[#E5E7EB]">|</span>
                          <button onClick={clearAllNotifications} className="text-xs text-red-500 font-medium hover:underline">모두 삭제</button>
                        </div>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map(n => (
                            <div key={n.id} className={cn("p-4 border-b border-[#F9FAFB] last:border-none hover:bg-[#F9FAFB] transition-colors", !n.read && "bg-indigo-50/30")}>
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "w-2 h-2 rounded-full mt-1.5 shrink-0",
                                  n.type === 'info' ? 'bg-blue-500' : n.type === 'success' ? 'bg-green-500' : 'bg-yellow-500'
                                )} />
                                <div>
                                  <p className="text-sm font-bold">{n.title}</p>
                                  <p className="text-xs text-[#6B7280] mt-0.5">{n.message}</p>
                                  <p className="text-[10px] text-[#9CA3AF] mt-1">{format(new Date(n.timestamp), 'HH:mm')}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-8 text-center text-[#9CA3AF]">알림이 없습니다.</div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 pl-4 border-l border-[#E5E7EB]">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{currentUser.name}</p>
                <p className="text-xs text-[#6B7280]">{currentUser.role === 'admin' ? '관리자' : '팀원'}</p>
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                <UserIcon className="w-6 h-6 text-[#4F46E5]" />
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-[#1A1A1A]">안녕하세요, {currentUser.name}님! 👋</h2>
                    <p className="text-[#6B7280] mt-1">오늘의 업무 현황을 한눈에 확인하세요.</p>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={openAddModal}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-[#4F46E5] text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" /> 새 업무 추가
                    </button>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard 
                    label="전체 업무" 
                    value={stats.total} 
                    icon={<LayoutDashboard className="w-6 h-6" />} 
                    onClick={() => setSelectedStat(selectedStat === 'all' ? null : 'all')}
                    active={selectedStat === 'all'}
                  />
                  <StatCard 
                    label="진행 중" 
                    value={stats.inProgress} 
                    icon={<AlertCircle className="w-6 h-6" />} 
                    onClick={() => setSelectedStat(selectedStat === 'in-progress' ? null : 'in-progress')}
                    active={selectedStat === 'in-progress'}
                  />
                  <StatCard 
                    label="완료됨" 
                    value={stats.done} 
                    icon={<CheckCircle2 className="w-6 h-6" />} 
                    onClick={() => setSelectedStat(selectedStat === 'done' ? null : 'done')}
                    active={selectedStat === 'done'}
                  />
                  <StatCard 
                    label="대기 중" 
                    value={stats.todo} 
                    icon={<Clock className="w-6 h-6" />} 
                    onClick={() => setSelectedStat(selectedStat === 'todo' ? null : 'todo')}
                    active={selectedStat === 'todo'}
                  />
                </div>

                <AnimatePresence>
                  {selectedStat && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedStat(null)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                      />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
                      >
                        <div className="p-8">
                          <div className="flex items-center justify-between mb-8">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                              <div className="w-2 h-8 bg-[#4F46E5] rounded-full" />
                              {selectedStat === 'all' ? '전체 업무' : selectedStat === 'todo' ? '대기 중 업무' : selectedStat === 'in-progress' ? '진행 중 업무' : '완료된 업무'} 상세 현황
                            </h3>
                            <button 
                              onClick={() => setSelectedStat(null)}
                              className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors"
                            >
                              <X className="w-6 h-6" />
                            </button>
                          </div>
                          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {tasks
                              .filter(t => {
                                if (!isAdmin && !t.assigneeIds?.includes(currentUser.id)) return false;
                                if (selectedStat === 'all') return true;
                                return t.status === selectedStat;
                              })
                              .map(task => (
                              <TaskRow 
                                key={task.id} 
                                task={task} 
                                onEdit={() => {
                                  setSelectedStat(null);
                                  openEditModal(task);
                                }}
                                onDelete={() => handleDeleteTask(task.id)}
                                onToggleStatus={() => toggleTaskStatus(task.id)}
                                isAdmin={isAdmin}
                                currentUserId={currentUser.id}
                              />
                            ))}
                            {tasks.filter(t => {
                              if (!isAdmin && !t.assigneeIds?.includes(currentUser.id)) return false;
                              if (selectedStat === 'all') return true;
                              return t.status === selectedStat;
                            }).length === 0 && (
                              <div className="py-12 text-center">
                                <p className="text-[#9CA3AF] italic">해당 상태의 업무가 없습니다.</p>
                              </div>
                            )}
                          </div>
                          <div className="mt-8 pt-6 border-t border-[#E5E7EB]">
                            <button 
                              onClick={() => setSelectedStat(null)}
                              className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98]"
                            >
                              확인
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Recent Tasks */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB]">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold">최근 업무 현황</h2>
                        <button 
                          onClick={() => setActiveTab('tasks')}
                          className="text-sm text-[#4F46E5] font-medium hover:underline flex items-center gap-1"
                        >
                          전체 보기 <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        {tasks.slice(0, 5).map(task => (
                          <TaskRow 
                            key={task.id} 
                            task={task} 
                            onEdit={() => openEditModal(task)}
                            onDelete={() => handleDeleteTask(task.id)}
                            onToggleStatus={() => toggleTaskStatus(task.id)}
                            isAdmin={isAdmin}
                            currentUserId={currentUser.id}
                          />
                        ))}
                        {tasks.length === 0 && (
                          <div className="py-12 text-center">
                            <p className="text-[#9CA3AF]">등록된 업무가 없습니다.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Team Progress Summary */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB]">
                      <h2 className="text-lg font-bold mb-6">팀원별 진행률</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {teamStats.map(member => (
                          <div key={member.id} className="p-4 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-bold text-sm">{member.name}</span>
                              <span className="text-xs font-bold text-[#4F46E5]">{member.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#4F46E5] rounded-full transition-all duration-500"
                                style={{ width: `${member.progress}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Info */}
                  <div className="space-y-8">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E5E7EB]">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold">업무 캘린더</h2>
                        <input 
                          type="date" 
                          value={selectedCalendarDate}
                          onChange={(e) => setSelectedCalendarDate(e.target.value)}
                          className="text-xs border border-[#E5E7EB] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-[#4F46E5]"
                        />
                      </div>
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                          <div>
                            <p className="text-sm font-medium text-[#6B7280]">
                              {selectedCalendarDate === format(new Date(), 'yyyy-MM-dd') ? '오늘' : '지정일'}
                            </p>
                            <p className="text-lg font-bold">{format(new Date(selectedCalendarDate), 'MM월 dd일')}</p>
                          </div>
                          <Calendar className="w-8 h-8 text-[#4F46E5] opacity-20" />
                        </div>
                        <div className="space-y-4">
                          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">
                            {selectedCalendarDate === format(new Date(), 'yyyy-MM-dd') ? '다가오는 마감일' : '해당 날짜 업무'}
                          </p>
                          {tasks
                            .filter(t => {
                              if (!isAdmin && !t.assigneeIds?.includes(currentUser.id)) return false;
                              if (selectedCalendarDate === format(new Date(), 'yyyy-MM-dd')) {
                                return t.status !== 'done';
                              }
                              return t.dueDate === selectedCalendarDate;
                            })
                            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                            .slice(0, 6)
                            .map(task => (
                            <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-[#F9FAFB] rounded-lg transition-colors group cursor-pointer" onClick={() => openEditModal(task)}>
                              <div className={cn(
                                "w-2 h-2 rounded-full mt-1.5",
                                task.priority === 'high' ? 'bg-red-500' : task.priority === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                              )}></div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium line-clamp-1 group-hover:text-[#4F46E5] transition-colors">{task.title}</p>
                                  {task.isNew && (
                                    <span className="px-1 py-0.5 bg-red-500 text-white text-[7px] font-bold rounded uppercase">NEW</span>
                                  )}
                                </div>
                                <p className="text-xs text-[#6B7280]">{format(new Date(task.dueDate), 'MM월 dd일')} 마감</p>
                              </div>
                            </div>
                          ))}
                          {tasks.filter(t => {
                            if (!isAdmin && !t.assigneeIds?.includes(currentUser.id)) return false;
                            if (selectedCalendarDate === format(new Date(), 'yyyy-MM-dd')) {
                              return t.status !== 'done';
                            }
                            return t.dueDate === selectedCalendarDate;
                          }).length === 0 && (
                            <p className="text-sm text-[#9CA3AF] text-center py-4 italic">해당 조건의 업무가 없습니다.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#4F46E5] rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
                      <h3 className="font-bold mb-2">생산성 팁 💡</h3>
                      <p className="text-sm text-indigo-100 leading-relaxed">
                        우선순위가 높은 업무부터 처리하면 더 효율적으로 마감일을 지킬 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'team' && (
              <motion.div 
                key="team"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">팀원 진행 현황</h2>
                  {isAdmin && (
                    <button 
                      onClick={() => setIsAssigneeModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold hover:bg-[#4338CA] transition-all"
                    >
                      <UserPlus className="w-4 h-4" /> 팀원 추가
                    </button>
                  )}
                </div>

                {!isAdmin && (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-[#E5E7EB] space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-[#4F46E5]">
                          <Bell className="w-4 h-4" />
                        </div>
                        개인 NOTE
                      </h3>
                      <span className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest">관리자 확인용 메모</span>
                    </div>
                    <textarea 
                      rows={4}
                      placeholder="관리자에게 전달할 내용이나 개인적인 메모를 입력하세요..."
                      defaultValue={assignees.find(a => a.id === currentUser.id)?.note || ''}
                      id="user-note-textarea-team"
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all resize-none text-sm"
                    />
                    <button 
                      onClick={() => {
                        const textarea = document.getElementById('user-note-textarea-team') as HTMLTextAreaElement;
                        handleSaveNote(textarea.value);
                      }}
                      className="w-full py-3 bg-[#4F46E5] text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98]"
                    >
                      노트 저장하기
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {teamStats.map(member => (
                    <div key={member.id} className="bg-white p-6 rounded-2xl shadow-sm border border-[#E5E7EB] hover:shadow-md transition-all group">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-[#4F46E5] group-hover:bg-[#4F46E5] group-hover:text-white transition-colors">
                            <UserIcon className="w-7 h-7" />
                          </div>
                          <div>
                            <h3 className="font-bold text-lg">{member.name}</h3>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            {member.note && (
                              <button 
                                onClick={() => setViewingNote({ isOpen: true, assigneeId: member.id, assigneeName: member.name, note: member.note || '' })}
                                className="p-2 bg-indigo-50 text-[#4F46E5] rounded-lg hover:bg-indigo-100 transition-colors"
                                title="노트 확인"
                              >
                                <Bell className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteAssignee(member.id)}
                              className="p-2 text-[#9CA3AF] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="팀원 삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[#6B7280]">전체 진행률</span>
                          <span className="font-bold text-[#4F46E5]">{member.progress}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${member.progress}%` }}
                            className="h-full bg-[#4F46E5] rounded-full"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          <div className="bg-[#F9FAFB] p-2 rounded-xl text-center">
                            <p className="text-[10px] text-[#6B7280] uppercase font-bold">전체</p>
                            <p className="text-lg font-bold">{member.total}</p>
                          </div>
                          <div className="bg-green-50 p-2 rounded-xl text-center">
                            <p className="text-[10px] text-green-600 uppercase font-bold">완료</p>
                            <p className="text-lg font-bold text-green-700">{member.done}</p>
                          </div>
                          <div className="bg-yellow-50 p-2 rounded-xl text-center">
                            <p className="text-[10px] text-yellow-600 uppercase font-bold">진행</p>
                            <p className="text-lg font-bold text-yellow-700">{member.total - member.done}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex bg-white border border-[#E5E7EB] rounded-lg p-1">
                      <button 
                        onClick={() => setViewMode('list')}
                        className={cn(
                          "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                          viewMode === 'list' ? "bg-[#F3F4F6] text-[#1A1A1A]" : "text-[#6B7280] hover:bg-[#F9FAFB]"
                        )}
                      >
                        리스트
                      </button>
                      <button 
                        onClick={() => setViewMode('board')}
                        className={cn(
                          "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                          viewMode === 'board' ? "bg-[#F3F4F6] text-[#1A1A1A]" : "text-[#6B7280] hover:bg-[#F9FAFB]"
                        )}
                      >
                        보드
                      </button>
                    </div>
                    <div className="relative">
                      <button 
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E7EB] rounded-lg text-sm font-medium transition-colors",
                          (filters.status !== 'all' || filters.priority !== 'all' || filters.assigneeId !== 'all') ? "text-[#4F46E5] border-[#4F46E5] bg-indigo-50" : "hover:bg-[#F9FAFB]"
                        )}
                      >
                        <Filter className="w-4 h-4" /> 필터
                      </button>
                      
                      <AnimatePresence>
                        {isFilterOpen && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setIsFilterOpen(false)} />
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] z-40 p-4 space-y-4"
                            >
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#9CA3AF] uppercase">상태</label>
                                <select 
                                  value={filters.status}
                                  onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                                  className="w-full p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-sm outline-none"
                                >
                                  <option value="all">모든 상태</option>
                                  <option value="todo">Todo</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="done">Done</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#9CA3AF] uppercase">우선순위</label>
                                <select 
                                  value={filters.priority}
                                  onChange={(e) => setFilters({ ...filters, priority: e.target.value as any })}
                                  className="w-full p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-sm outline-none"
                                >
                                  <option value="all">모든 우선순위</option>
                                  <option value="low">Low</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">High</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#9CA3AF] uppercase">담당자</label>
                                <select 
                                  value={filters.assigneeId}
                                  onChange={(e) => setFilters({ ...filters, assigneeId: e.target.value })}
                                  className="w-full p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-sm outline-none"
                                >
                                  <option value="all">모든 담당자</option>
                                  {assignees.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                  ))}
                                </select>
                              </div>
                              <button 
                                onClick={() => setFilters({ status: 'all', priority: 'all', assigneeId: 'all' })}
                                className="w-full py-2 text-xs text-red-500 font-bold hover:bg-red-50 rounded-lg transition-colors"
                              >
                                필터 초기화
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                  {isAdmin && (
                    <button 
                      onClick={openAddModal}
                      className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#4F46E5] text-white rounded-xl font-semibold shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-95"
                    >
                      <Plus className="w-5 h-5" /> 새 업무 추가
                    </button>
                  )}
                </div>

                {viewMode === 'list' ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden overflow-x-auto min-h-[600px]">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">업무명</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-center">진행률</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">담당자</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">우선순위</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">상태</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">마감일</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {filteredTasks.map(task => (
                          <tr key={task.id} className="hover:bg-[#F9FAFB] transition-colors group">
                            <td className="px-6 py-4">
                              <p className="text-sm font-semibold text-[#1A1A1A] group-hover:text-[#4F46E5] transition-colors cursor-pointer" onClick={() => openEditModal(task)}>
                                {task.title}
                              </p>
                              <p className="text-xs text-[#6B7280] line-clamp-1 mt-1">{task.description}</p>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs font-bold text-[#4F46E5]">{task.progress || 0}%</span>
                                <div className="w-16 h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
                                  <div className="h-full bg-[#4F46E5]" style={{ width: `${task.progress || 0}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-indigo-50 rounded-full flex items-center justify-center">
                                  <UserIcon className="w-3.5 h-3.5 text-[#4F46E5]" />
                                </div>
                                <span className="text-sm">{task.assigneeNames?.join(', ') || '미지정'}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border",
                                PRIORITY_COLORS[task.priority]
                              )}>
                                {task.priority}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2 text-sm cursor-pointer" onClick={() => toggleTaskStatus(task.id)}>
                                <span className={cn(
                                  "p-1 rounded-md transition-colors",
                                  task.status === 'done' ? 'bg-green-100 text-green-600 hover:bg-green-200' : 
                                  task.status === 'in-progress' ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                )}>
                                  {STATUS_ICONS[task.status as keyof typeof STATUS_ICONS]}
                                </span>
                                <span className="font-medium">{STATUS_LABELS[task.status as keyof typeof STATUS_LABELS]}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#6B7280]">
                              {format(new Date(task.dueDate), 'yyyy.MM.dd')}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isAdmin && (
                                  <>
                                    <button 
                                      onClick={() => openEditModal(task)}
                                      className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors text-[#6B7280] hover:text-[#4F46E5]"
                                      title="수정"
                                    >
                                      <Settings className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteTask(task.id)}
                                      className="p-2 hover:bg-red-50 rounded-lg transition-colors text-[#9CA3AF] hover:text-red-500"
                                      title="삭제"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredTasks.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-[#9CA3AF]">
                              검색 결과가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {(['todo', 'in-progress', 'done'] as Status[]).map(status => (
                      <div key={status} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-xs tracking-widest text-[#6B7280]">{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</h3>
                            <span className="bg-[#E5E7EB] text-[#6B7280] text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {filteredTasks.filter(t => t.status === status).length}
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-h-[500px] bg-[#F3F4F6]/50 rounded-2xl p-4 space-y-4 border-2 border-dashed border-[#E5E7EB]">
                          {filteredTasks.filter(t => t.status === status).map(task => (
                            <motion.div 
                              layout
                              key={task.id}
                              className="bg-white p-4 rounded-xl shadow-sm border border-[#E5E7EB] hover:shadow-md transition-all cursor-pointer group"
                              onClick={() => openEditModal(task)}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border",
                                    PRIORITY_COLORS[task.priority]
                                  )}>
                                    {task.priority}
                                  </span>
                                  {task.isNew && (
                                    <span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded-md uppercase animate-pulse">NEW</span>
                                  )}
                                </div>
                                {isAdmin && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                    className="p-1 text-[#9CA3AF] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <h4 className="font-bold text-sm mb-2 group-hover:text-[#4F46E5] transition-colors">{task.title}</h4>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden mr-2">
                                  <div className="h-full bg-[#4F46E5]" style={{ width: `${task.progress || 0}%` }} />
                                </div>
                                <span className="text-[10px] font-bold text-[#4F46E5]">{task.progress || 0}%</span>
                              </div>
                              <p className="text-xs text-[#6B7280] line-clamp-2 mb-4 leading-relaxed">{task.description}</p>
                              <div className="flex items-center justify-between pt-3 border-t border-[#F3F4F6]">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 bg-indigo-50 rounded-full flex items-center justify-center">
                                    <UserIcon className="w-3 h-3 text-[#4F46E5]" />
                                  </div>
                                  <span className="text-[10px] font-medium text-[#6B7280]">{task.assigneeNames?.join(', ') || '미지정'}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(task.dueDate), 'MM.dd')}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                          {filteredTasks.filter(t => t.status === status).length === 0 && (
                            <div className="h-full flex items-center justify-center">
                              <p className="text-[10px] text-[#9CA3AF] font-medium italic">No tasks here</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'promotions' && (
              <motion.div 
                key="promotions"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">특판 안내</h2>
                  {isAdmin && (
                    <button 
                      onClick={() => {
                        setEditingPromotion(null);
                        setPromotionForm({ brand: '', orderCode: '', productName: '', productNumber: '', discountRate: 0, discountPrice: 0 });
                        setIsPromotionModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold hover:bg-[#4338CA] transition-all"
                    >
                      <Plus className="w-4 h-4" /> 특판 추가
                    </button>
                  )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">브랜드</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">발주코드</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">품명</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">품번</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">할인율</th>
                          <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-right">할인가</th>
                          {isAdmin && <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-center">관리</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB]">
                        {filteredPromotions.map(p => (
                          <tr key={p.id} className="hover:bg-[#F9FAFB] transition-colors group">
                            <td className="px-6 py-4 text-sm font-medium">{p.brand}</td>
                            <td className="px-6 py-4 text-sm text-[#6B7280]">{p.orderCode}</td>
                            <td className="px-6 py-4 text-sm font-bold">{p.productName}</td>
                            <td className="px-6 py-4 text-sm text-[#6B7280]">{p.productNumber}</td>
                            <td className="px-6 py-4 text-sm text-red-500 font-bold">{p.discountRate}%</td>
                            <td className="px-6 py-4 text-sm font-bold text-right">{p.discountPrice.toLocaleString()}원</td>
                            {isAdmin && (
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button 
                                    onClick={() => {
                                      setEditingPromotion(p);
                                      setPromotionForm({
                                        brand: p.brand,
                                        orderCode: p.orderCode,
                                        productName: p.productName,
                                        productNumber: p.productNumber,
                                        discountRate: p.discountRate,
                                        discountPrice: p.discountPrice
                                      });
                                      setIsPromotionModalOpen(true);
                                    }}
                                    className="p-1.5 text-[#9CA3AF] hover:text-[#4F46E5] transition-colors"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={async () => {
                                      if (confirm('정말 삭제하시겠습니까?')) {
                                        await deleteDoc(doc(db, 'special_promotions', p.id));
                                      }
                                    }}
                                    className="p-1.5 text-[#9CA3AF] hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                        {filteredPromotions.length === 0 && (
                          <tr>
                            <td colSpan={isAdmin ? 7 : 6} className="px-6 py-12 text-center text-[#9CA3AF] italic">
                              등록된 특판 정보가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'ledgers' && (
              <motion.div 
                key="ledgers"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">장부 현황</h2>
                  {isAdmin && (
                    <button 
                      onClick={() => {
                        setEditingLedger(null);
                        setLedgerForm({ title: '', description: '', assigneeId: 'all', file: null });
                        setIsLedgerModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold hover:bg-[#4338CA] transition-all"
                    >
                      <Plus className="w-4 h-4" /> 장부 추가
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredLedgers.map(l => {
                    const allChecked = l.checks && Object.values(l.checks).every(v => v);
                    
                    return (
                      <div 
                        key={l.id} 
                        onClick={() => {
                          setSelectedLedgerId(l.id);
                          setIsLedgerDetailModalOpen(true);
                        }}
                        className={cn(
                          "p-6 rounded-2xl shadow-sm border transition-all group cursor-pointer",
                          allChecked 
                            ? "bg-green-50 border-green-200 hover:bg-green-100" 
                            : "bg-white border-[#E5E7EB] hover:shadow-md"
                        )}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                              allChecked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'
                            )}>
                              <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-bold text-lg">{l.title}</h3>
                              <p className="text-xs text-[#6B7280]">{l.assigneeName} 담당</p>
                            </div>
                          </div>
                          {isAdmin && (
                            <div 
                              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button 
                                onClick={() => {
                                  setEditingLedger(l);
                                  setLedgerForm({
                                    title: l.title,
                                    description: l.description,
                                    assigneeId: l.assigneeId,
                                    file: null
                                  });
                                  setIsLedgerModalOpen(true);
                                }}
                                className="p-1.5 text-[#9CA3AF] hover:text-[#4F46E5] transition-colors"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (confirm('정말 삭제하시겠습니까?')) {
                                    await deleteDoc(doc(db, 'ledgers', l.id));
                                  }
                                }}
                                className="p-1.5 text-[#9CA3AF] hover:text-red-500 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        
                        <p className="text-sm text-[#6B7280] line-clamp-2 mb-6">{l.description}</p>
                        
                        {l.fileName && (
                          <div className="flex items-center gap-2 p-3 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] mb-6">
                            <FileUp className="w-4 h-4 text-[#4F46E5]" />
                            <span className="text-xs font-medium truncate flex-1">{l.fileName}</span>
                          </div>
                        )}

                        <div 
                          className="flex items-center justify-between pt-4 border-t border-[#F3F4F6]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            {allChecked ? (
                              <span className="px-3 py-1 bg-green-500 text-white text-[10px] font-bold rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> 완료
                              </span>
                            ) : (
                              <div className="flex gap-1">
                                {['5일', '10일', '20일', '25일', '당월'].map((key) => (
                                  <span 
                                    key={key}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[8px] font-bold",
                                      l.checks?.[key as keyof typeof l.checks] ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-400"
                                    )}
                                  >
                                    {key}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-[#9CA3AF]">{format(new Date(l.updatedAt), 'MM.dd HH:mm')}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredLedgers.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-[#D1D5DB]">
                      <p className="text-[#9CA3AF] italic">등록된 장부 현황이 없습니다.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E5E7EB]">
                  <h2 className="text-xl font-bold mb-6">프로필 설정</h2>
                  <div className="space-y-6">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center relative group cursor-pointer border-2 border-white shadow-md">
                        <UserIcon className="w-10 h-10 text-[#4F46E5]" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-lg">{currentUser.name}</p>
                        <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-widest mt-1">{currentUser.role}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-[#9CA3AF] uppercase">이름</label>
                        <input type="text" defaultValue={currentUser.name} disabled className="w-full p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-sm outline-none opacity-60" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E5E7EB]">
                  <h2 className="text-xl font-bold mb-6">애플리케이션 설정</h2>
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl">
                      <div>
                        <p className="font-bold text-sm">알림 설정</p>
                        <p className="text-xs text-[#6B7280]">새로운 업무나 마감일 알림을 받습니다.</p>
                      </div>
                      <div className="w-12 h-6 bg-[#4F46E5] rounded-full relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl">
                      <div>
                        <p className="font-bold text-sm">다크 모드</p>
                        <p className="text-xs text-[#6B7280]">어두운 테마를 사용합니다. (준비 중)</p>
                      </div>
                      <div className="w-12 h-6 bg-[#E5E7EB] rounded-full relative cursor-pointer">
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-red-100">
                    <h2 className="text-xl font-bold text-red-600 mb-6">위험 구역</h2>
                    <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-red-700">모든 데이터 초기화</p>
                        <p className="text-xs text-red-600/70">로컬에 저장된 모든 업무와 팀원 정보를 삭제합니다.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setDeleteConfirmation({ isOpen: true, type: 'reset' })}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                        >
                          초기화 실행
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modal Overlay */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">{editingTask ? '업무 수정' : '새 업무 추가'}</h2>
                  <button 
                    onClick={() => { setIsModalOpen(false); setEditingTask(null); }}
                    className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form className="space-y-6" onSubmit={(e) => { 
                  e.preventDefault(); 
                  const isAssignedToMe = currentUser && editingTask?.assigneeIds?.includes(currentUser.id);
                  if (isAdmin || isAssignedToMe) handleSaveTask(); 
                  else setIsModalOpen(false); 
                }}>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">업무 제목</label>
                    <input 
                      type="text" 
                      placeholder="무엇을 해야 하나요?"
                      value={taskForm.title}
                      onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                      disabled={!isAdmin}
                      className={cn(
                        "w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all",
                        !isAdmin && "opacity-70 cursor-not-allowed"
                      )}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">상세 설명</label>
                    <textarea 
                      rows={4}
                      placeholder="업무에 대한 상세 내용을 입력하세요..."
                      value={taskForm.description}
                      onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                      disabled={!isAdmin}
                      className={cn(
                        "w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all resize-none",
                        !isAdmin && "opacity-70 cursor-not-allowed"
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">담당자 (복수 선택 가능)</label>
                        {isAdmin && (
                          <button 
                            type="button"
                            onClick={() => setIsAssigneeModalOpen(true)}
                            className="text-[10px] text-[#4F46E5] font-bold hover:underline"
                          >
                            + 팀원 추가
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl">
                        {assignees.map(a => (
                          <label key={a.id} className="flex items-center gap-2 p-1 cursor-pointer hover:bg-white rounded transition-colors">
                            <input 
                              type="checkbox"
                              checked={taskForm.assigneeIds.includes(a.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTaskForm({ ...taskForm, assigneeIds: [...taskForm.assigneeIds, a.id] });
                                } else {
                                  setTaskForm({ ...taskForm, assigneeIds: taskForm.assigneeIds.filter(id => id !== a.id) });
                                }
                              }}
                              disabled={!isAdmin}
                              className="w-4 h-4 rounded border-[#E5E7EB] text-[#4F46E5] focus:ring-[#4F46E5]"
                            />
                            <span className="text-xs font-medium">{a.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">마감일</label>
                      <input 
                        type="date" 
                        value={taskForm.dueDate}
                        onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                        disabled={!isAdmin}
                        className={cn(
                          "w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all",
                          !isAdmin && "opacity-70 cursor-not-allowed"
                        )}
                      />
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">알람 1</label>
                          <div className="flex gap-2">
                            <select 
                              value={taskForm.alarm1Settings.hour}
                              onChange={(e) => setTaskForm({ ...taskForm, alarm1Settings: { ...taskForm.alarm1Settings, hour: Number(e.target.value) } })}
                              className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none text-sm"
                            >
                              {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>{i}시간</option>
                              ))}
                            </select>
                            <select 
                              value={taskForm.alarm1Settings.minute}
                              onChange={(e) => setTaskForm({ ...taskForm, alarm1Settings: { ...taskForm.alarm1Settings, minute: Number(e.target.value) } })}
                              className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none text-sm"
                            >
                              {[0, 10, 20, 30, 40, 50].map(m => (
                                <option key={m} value={m}>{m}분 후</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">알람 2</label>
                          <div className="flex gap-2">
                            <select 
                              value={taskForm.alarm2Settings.hour}
                              onChange={(e) => setTaskForm({ ...taskForm, alarm2Settings: { ...taskForm.alarm2Settings, hour: Number(e.target.value) } })}
                              className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none text-sm"
                            >
                              {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>{i}시간</option>
                              ))}
                            </select>
                            <select 
                              value={taskForm.alarm2Settings.minute}
                              onChange={(e) => setTaskForm({ ...taskForm, alarm2Settings: { ...taskForm.alarm2Settings, minute: Number(e.target.value) } })}
                              className="flex-1 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none text-sm"
                            >
                              {[0, 10, 20, 30, 40, 50].map(m => (
                                <option key={m} value={m}>{m}분 후</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">진행률</label>
                    <div className="flex gap-3">
                      {([0, 25, 50, 75, 100] as number[]).map(p => (
                        <button 
                          key={p}
                          type="button"
                          onClick={() => setTaskForm({ ...taskForm, progress: p })}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-sm font-bold border transition-all",
                            taskForm.progress === p ? 'bg-[#4F46E5] text-white border-[#4F46E5]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#4F46E5]'
                          )}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">우선순위</label>
                    <div className="flex gap-3">
                      {(['low', 'medium', 'high'] as Priority[]).map(p => (
                        <button 
                          key={p}
                          type="button"
                          onClick={() => isAdmin && setTaskForm({ ...taskForm, priority: p })}
                          disabled={!isAdmin}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-sm font-bold uppercase border transition-all",
                            taskForm.priority === p ? 'bg-[#4F46E5] text-white border-[#4F46E5]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#4F46E5]',
                            !isAdmin && "opacity-70 cursor-not-allowed"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98] mt-4"
                  >
                    {(isAdmin || (currentUser && editingTask?.assigneeIds?.includes(currentUser.id))) ? (editingTask ? '저장하기' : '업무 생성하기') : '닫기'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Assignee Modal */}
      <AnimatePresence>
        {isAssigneeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAssigneeModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">팀원 추가</h2>
                  <button onClick={() => setIsAssigneeModalOpen(false)} className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleAddAssignee(); }}>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">이름</label>
                    <input 
                      type="text" 
                      placeholder="이름을 입력하세요"
                      value={newAssignee.name}
                      onChange={(e) => setNewAssignee({ ...newAssignee, name: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">비밀번호</label>
                    <input 
                      type="password" 
                      placeholder="비밀번호를 설정하세요"
                      value={newAssignee.password}
                      onChange={(e) => setNewAssignee({ ...newAssignee, password: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98]"
                  >
                    팀원 추가하기
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmation.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmation({ ...deleteConfirmation, isOpen: false })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold mb-2">정말 삭제하시겠습니까?</h2>
                <p className="text-[#6B7280] text-sm mb-8">
                  {deleteConfirmation.type === 'task' ? `"${deleteConfirmation.title}" 업무가 영구적으로 삭제됩니다.` : 
                   deleteConfirmation.type === 'assignee' ? `"${deleteConfirmation.title}" 팀원 정보가 영구적으로 삭제됩니다.` : 
                   '모든 데이터가 초기화되며 복구할 수 없습니다.'}
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteConfirmation({ ...deleteConfirmation, isOpen: false })}
                    className="flex-1 py-3 bg-[#F3F4F6] text-[#6B7280] rounded-xl font-bold hover:bg-[#E5E7EB] transition-all"
                  >
                    취소
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all"
                  >
                    삭제 실행
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Note View Modal */}
      <AnimatePresence>
        {viewingNote.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingNote({ ...viewingNote, isOpen: false })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-[#4F46E5]">
                      <UserIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">{viewingNote.assigneeName}님의 NOTE</h2>
                      <p className="text-[10px] text-[#9CA3AF] uppercase font-bold tracking-widest">팀원 개인 메모</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingNote({ ...viewingNote, isOpen: false })} className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="bg-[#F9FAFB] p-6 rounded-2xl border border-[#E5E7EB] min-h-[200px]">
                  <p className="text-[#1A1A1A] text-sm leading-relaxed whitespace-pre-wrap">
                    {viewingNote.note || '작성된 내용이 없습니다.'}
                  </p>
                </div>
                <div className="flex gap-3 mt-6">
                  <button 
                    onClick={() => setViewingNote({ ...viewingNote, isOpen: false })}
                    className="flex-1 py-4 bg-[#4F46E5] text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-[#4338CA] transition-all"
                  >
                    확인 완료
                  </button>
                  {isAdmin && (
                    <button 
                      onClick={() => handleDeleteNote(viewingNote.assigneeId)}
                      className="flex-1 py-4 bg-red-50 text-red-600 rounded-2xl font-bold border border-red-100 hover:bg-red-100 transition-all"
                    >
                      메모 삭제
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Promotion Modal */}
      <AnimatePresence>
        {isPromotionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPromotionModalOpen(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">{editingPromotion ? '특판 수정' : '새 특판 등록'}</h2>
                  <button onClick={() => setIsPromotionModalOpen(false)} className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSavePromotion} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">브랜드</label>
                      <input 
                        required
                        type="text" 
                        value={promotionForm.brand}
                        onChange={(e) => setPromotionForm({ ...promotionForm, brand: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="브랜드명"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">발주코드</label>
                      <input 
                        required
                        type="text" 
                        value={promotionForm.orderCode}
                        onChange={(e) => setPromotionForm({ ...promotionForm, orderCode: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="발주코드"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">품명</label>
                      <input 
                        required
                        type="text" 
                        value={promotionForm.productName}
                        onChange={(e) => setPromotionForm({ ...promotionForm, productName: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="제품명"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">품번</label>
                      <input 
                        required
                        type="text" 
                        value={promotionForm.productNumber}
                        onChange={(e) => setPromotionForm({ ...promotionForm, productNumber: e.target.value })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="제품번호"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">할인율 (%)</label>
                      <input 
                        required
                        type="number" 
                        value={promotionForm.discountRate}
                        onChange={(e) => setPromotionForm({ ...promotionForm, discountRate: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">할인가 (원)</label>
                      <input 
                        required
                        type="number" 
                        value={promotionForm.discountPrice}
                        onChange={(e) => setPromotionForm({ ...promotionForm, discountPrice: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98] mt-4"
                  >
                    {editingPromotion ? '수정 완료' : '특판 등록하기'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ledger Modal */}
      <AnimatePresence>
        {isLedgerModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLedgerModalOpen(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold">{editingLedger ? '장부 수정' : '새 장부 등록'}</h2>
                  <button onClick={() => setIsLedgerModalOpen(false)} className="p-2 hover:bg-[#F3F4F6] rounded-full transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleSaveLedger} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">제목</label>
                    <input 
                      required
                      type="text" 
                      value={ledgerForm.title}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, title: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                      placeholder="장부 제목"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">설명</label>
                    <textarea 
                      required
                      value={ledgerForm.description}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, description: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all min-h-[100px] resize-none"
                      placeholder="상세 설명"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">담당자</label>
                    <select 
                      required
                      value={ledgerForm.assigneeId}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, assigneeId: e.target.value })}
                      className="w-full px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    >
                      <option value="all">전체</option>
                      {assignees.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">파일 첨부 (Excel)</label>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv"
                        onChange={(e) => setLedgerForm({ ...ledgerForm, file: e.target.files?.[0] || null })}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="flex items-center gap-3 px-4 py-4 bg-[#F9FAFB] border-2 border-dashed border-[#E5E7EB] rounded-2xl group-hover:border-[#4F46E5] transition-all">
                        <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-[#4F46E5]">
                          <FileUp className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-[#1A1A1A]">{ledgerForm.file?.name || '파일을 선택하거나 드래그하세요'}</p>
                          <p className="text-[10px] text-[#6B7280]">Excel, CSV 파일 지원 (최대 10MB)</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-[#4F46E5] text-white rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-[#4338CA] transition-all active:scale-[0.98] mt-4"
                  >
                    {editingLedger ? '수정 완료' : '장부 등록하기'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {/* Ledger Detail Modal */}
        {isLedgerDetailModalOpen && selectedLedger && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white w-full max-w-6xl max-h-[90vh] rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-[#F3F4F6] flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-[#4F46E5]">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#1A1A1A]">{selectedLedger.title}</h2>
                    <p className="text-sm text-[#6B7280]">{selectedLedger.assigneeName} 담당</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsLedgerDetailModalOpen(false)}
                  className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm"
                >
                  <X className="w-6 h-6 text-[#9CA3AF]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">상세 설명</h3>
                    <div className="p-6 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] text-[#4B5563] leading-relaxed">
                      {selectedLedger.description}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">데이터 필터</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#9CA3AF]">결제일자</label>
                        <input 
                          type="text"
                          value={ledgerFilters.paymentDate}
                          onChange={(e) => setLedgerFilters({ ...ledgerFilters, paymentDate: e.target.value })}
                          placeholder="날짜 검색..."
                          className="w-full px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-[#9CA3AF]">지불유형</label>
                        <input 
                          type="text"
                          value={ledgerFilters.paymentType}
                          onChange={(e) => setLedgerFilters({ ...ledgerFilters, paymentType: e.target.value })}
                          placeholder="유형 검색..."
                          className="w-full px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs focus:ring-2 focus:ring-[#4F46E5] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {selectedLedger.fileName && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider">첨부 파일 내용 ({selectedLedger.fileName})</h3>
                      <span className="text-xs text-[#9CA3AF]">총 {excelData.length}개 행</span>
                    </div>
                    
                    <div className="border border-[#E5E7EB] rounded-2xl overflow-hidden shadow-sm bg-white">
                      <div className="overflow-auto max-h-[600px]">
                        <table className="w-full text-sm text-left border-collapse min-w-full">
                          <thead className="bg-[#EEF2FF] border-b border-[#E0E7FF] sticky top-0 z-10">
                            <tr>
                              <th className="px-4 py-4 font-bold text-[#4338CA] whitespace-nowrap text-center w-12">#</th>
                              {excelData.length > 0 && Object.keys(excelData[0]).map((col) => (
                                <th key={col} className="px-6 py-4 font-bold text-[#4338CA] whitespace-nowrap text-center">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F3F4F6]">
                            {excelData
                              .filter(row => {
                                const dateMatch = !ledgerFilters.paymentDate || String(row['결제일자'] || '').includes(ledgerFilters.paymentDate);
                                const typeMatch = !ledgerFilters.paymentType || String(row['지불유형'] || '').includes(ledgerFilters.paymentType);
                                return dateMatch && typeMatch;
                              })
                              .map((row, i) => {
                                const rowDate = String(row['결제일자'] || '');
                                const isChecked = selectedLedger.checkedRows?.includes(i);
                                
                                return (
                                  <tr key={i} className={cn(
                                    "hover:bg-[#F9FAFB] transition-colors text-center",
                                    isChecked ? "bg-green-50/30" : ""
                                  )}>
                                    <td className="px-4 py-4 text-[#9CA3AF] font-mono text-[10px]">{i + 1}</td>
                                    {Object.entries(row).map(([key, value], j) => {
                                      if (key === '결제일자') {
                                        return (
                                          <td 
                                            key={j} 
                                            className={cn(
                                              "px-6 py-4 whitespace-nowrap font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50 transition-colors",
                                              isChecked ? "text-green-600" : "text-red-500"
                                            )}
                                            onClick={() => toggleRowCheck(selectedLedger, i, rowDate)}
                                          >
                                            <div className={cn(
                                              "w-4 h-4 rounded-md flex items-center justify-center border transition-all",
                                              isChecked ? "bg-green-500 border-green-500 text-white" : "bg-white border-red-300 text-red-500"
                                            )}>
                                              {isChecked ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                            </div>
                                            {String(value)}
                                          </td>
                                        );
                                      }
                                      return (
                                        <td 
                                          key={j} 
                                          className={cn(
                                            "px-6 py-4 text-[#4B5563] whitespace-nowrap",
                                            key === '업체명' ? "font-bold text-blue-600" : "",
                                            key === '업체코드' ? "font-mono text-xs" : ""
                                          )}
                                        >
                                          {String(value)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            {excelData.length === 0 && (
                              <tr>
                                <td colSpan={10} className="px-6 py-12 text-center text-[#9CA3AF] italic">데이터가 없습니다.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-8 border-t border-[#F3F4F6]">
                  <h3 className="text-sm font-bold text-[#6B7280] uppercase tracking-wider mb-4">진행 상태 체크</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {['5일', '10일', '20일', '25일', '당월'].map((day) => (
                      <button
                        key={day}
                        onClick={() => toggleLedgerCheck(selectedLedger, day)}
                        className={cn(
                          "p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 group",
                          selectedLedger.checks?.[day as keyof typeof selectedLedger.checks]
                            ? "bg-indigo-50 border-[#4F46E5] text-[#4F46E5] shadow-md"
                            : "bg-white border-[#E5E7EB] text-[#9CA3AF] hover:border-[#D1D5DB]"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                          selectedLedger.checks?.[day as keyof typeof selectedLedger.checks]
                            ? "bg-[#4F46E5] border-[#4F46E5] text-white"
                            : "border-[#E5E7EB] group-hover:border-[#9CA3AF]"
                        )}>
                          {selectedLedger.checks?.[day as keyof typeof selectedLedger.checks] && <CheckCircle className="w-4 h-4" />}
                        </div>
                        <span className="font-bold text-sm">{day}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

function SidebarItem({ icon, label, active = false, isOpen = true, onClick }: { 
  icon: React.ReactNode, 
  label: string, 
  active?: boolean, 
  isOpen?: boolean,
  onClick?: () => void
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 group",
        active ? "bg-[#EEF2FF] text-[#4F46E5]" : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#1A1A1A]"
      )}
    >
      <div className={cn(
        "transition-transform duration-200 group-hover:scale-110",
        active ? "text-[#4F46E5]" : "text-[#9CA3AF]"
      )}>
        {icon}
      </div>
      {isOpen && (
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-sm font-semibold"
        >
          {label}
        </motion.span>
      )}
      {active && isOpen && (
        <motion.div 
          layoutId="active-indicator"
          className="ml-auto w-1.5 h-1.5 bg-[#4F46E5] rounded-full"
        />
      )}
    </button>
  );
}

function StatCard({ label, value, icon, onClick, active = false }: { 
  label: string, 
  value: number, 
  icon: React.ReactNode, 
  onClick?: () => void,
  active?: boolean
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "bg-white p-6 rounded-2xl shadow-sm border transition-all text-left w-full group",
        active ? "border-[#4F46E5] ring-2 ring-indigo-50 shadow-md" : "border-[#E5E7EB] hover:shadow-md"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={cn(
          "p-3 rounded-xl transition-colors",
          active ? "bg-[#4F46E5] text-white" : "bg-[#F9FAFB] text-[#4F46E5]"
        )}>
          {icon}
        </div>
      </div>
      <p className="text-sm font-medium text-[#6B7280]">{label}</p>
      <p className="text-3xl font-bold mt-1 tracking-tight">{value}</p>
    </button>
  );
}

interface TaskRowProps {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

const TaskRow: React.FC<TaskRowProps & { isAdmin: boolean, currentUserId: string }> = ({ task, onEdit, onDelete, onToggleStatus, isAdmin, currentUserId }) => {
  const isAssignedToMe = task.assigneeIds?.includes(currentUserId);
  const canEdit = isAdmin || isAssignedToMe;

  return (
    <div className="flex items-center justify-between p-4 hover:bg-[#F9FAFB] rounded-xl transition-colors border border-transparent hover:border-[#E5E7EB] group">
      <div className="flex items-center gap-4">
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleStatus(); }}
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            task.status === 'done' ? 'bg-green-100 text-green-600 hover:bg-green-200' : 
            task.status === 'in-progress' ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          {STATUS_ICONS[task.status as keyof typeof STATUS_ICONS]}
        </button>
        <div onClick={canEdit ? onEdit : undefined} className={cn("relative", canEdit ? "cursor-pointer" : "cursor-default")}>
          <div className="flex items-center gap-2">
            <p className={cn("text-sm font-bold line-clamp-1 transition-colors", canEdit && "group-hover:text-[#4F46E5]")}>{task.title}</p>
            {task.isNew && (
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-bold rounded-md uppercase animate-pulse">NEW</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-xs", isAssignedToMe ? "text-[#4F46E5] font-bold" : "text-[#6B7280]")}>
              {task.assigneeNames?.join(', ') || '미지정'} {isAssignedToMe && "(나)"}
            </span>
            <span className="text-[10px] text-[#D1D5DB]">•</span>
            <span className="text-xs text-[#6B7280]">{format(new Date(task.dueDate), 'MM월 dd일')}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end mr-2">
          <span className="text-[10px] font-bold text-[#4F46E5]">{task.progress || 0}%</span>
          <div className="w-12 h-1 bg-[#F3F4F6] rounded-full overflow-hidden">
            <div className="h-full bg-[#4F46E5]" style={{ width: `${task.progress || 0}%` }} />
          </div>
        </div>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border",
          PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]
        )}>
          {task.priority}
        </span>
        {isAdmin && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-[#9CA3AF] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
