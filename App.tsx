
import React, { useState, useEffect, useMemo } from 'react';
import { AppView, User, UserRank, LoanRecord, Notification } from './types';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import LoanApplication from './components/LoanApplication';
import RankLimits from './components/RankLimits';
import Profile from './components/Profile';
import AdminDashboard from './components/AdminDashboard';
import AdminUserManagement from './components/AdminUserManagement';
import AdminBudget from './components/AdminBudget';
import { User as UserIcon, Home, Briefcase, Medal, LayoutGrid, Users, Wallet, AlertTriangle, X } from 'lucide-react';
import { compressImage } from './utils';
import BankUpdateWarning from './components/BankUpdateWarning';

interface ErrorBoundaryProps {
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: any): ErrorBoundaryState { 
    return { hasError: true }; 
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle size={48} className="text-[#ff8c00] mb-4" />
          <h2 className="text-xl font-black uppercase mb-2 text-white">Hệ thống đang bảo trì</h2>
          <p className="text-xs text-gray-500 mb-6 uppercase">Đã xảy ra lỗi khởi tạo. Vui lòng tải lại trang.</p>
          <button onClick={() => window.location.reload()} className="px-8 py-4 bg-[#ff8c00] text-black font-black rounded-full text-[10px] uppercase tracking-widest">Tải lại trang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.LOGIN);
  const [settleLoanFromDash, setSettleLoanFromDash] = useState<LoanRecord | null>(null);
  const [viewLoanFromDash, setViewLoanFromDash] = useState<LoanRecord | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [systemBudget, setSystemBudget] = useState<number>(30000000); 
  const [rankProfit, setRankProfit] = useState<number>(0); 
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showBankWarning, setShowBankWarning] = useState(false);
  const [storageFull, setStorageFull] = useState(false);
  const [storageUsage, setStorageUsage] = useState('0');

  const hasBankInfo = (u: User | null) => {
    if (!u || u.isAdmin) return true;
    return !!(u.bankName && u.bankAccountNumber && u.bankAccountHolder);
  };

  const addNotification = (userId: string, title: string, message: string, type: 'LOAN' | 'RANK' | 'SYSTEM') => {
    const newNotif: Notification = {
      id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId,
      title,
      message,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN'),
      read: false,
      type
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 50)); // Keep last 50
  };

  useEffect(() => {
    const fetchData = async (isInitial = false, retries = 3) => {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server không trả về JSON");
        }

        const data = await response.json();
        
        // Merge loans based on updatedAt to prevent race conditions
        if (data.loans) {
          setLoans(prevLoans => {
            const merged = [...prevLoans];
            data.loans.forEach((incomingLoan: LoanRecord) => {
              const idx = merged.findIndex(l => l.id === incomingLoan.id);
              if (idx === -1) {
                merged.push(incomingLoan);
              } else {
                const localLoan = merged[idx];
                // Only update if incoming data is newer or different and we haven't updated locally recently
                if ((incomingLoan.updatedAt || 0) >= (localLoan.updatedAt || 0)) {
                  merged[idx] = incomingLoan;
                }
              }
            });
            // Also remove loans that are no longer in the server data (unless they were just created)
            const finalLoans = merged.filter(l => 
              data.loans.some((il: LoanRecord) => il.id === l.id) || 
              (Date.now() - (l.updatedAt || 0) < 5000) // Keep recently updated loans even if not in poll yet
            );
            
            if (JSON.stringify(finalLoans) !== JSON.stringify(prevLoans)) {
              return finalLoans;
            }
            return prevLoans;
          });
        }

        if (data.users) {
          setRegisteredUsers(prevUsers => {
            const merged = [...prevUsers];
            data.users.forEach((incomingUser: User) => {
              const idx = merged.findIndex(u => u.id === incomingUser.id);
              if (idx === -1) {
                merged.push(incomingUser);
              } else {
                const localUser = merged[idx];
                if ((incomingUser.updatedAt || 0) >= (localUser.updatedAt || 0)) {
                  merged[idx] = incomingUser;
                }
              }
            });
            
            const finalUsers = merged.filter(u => data.users.some((iu: User) => iu.id === u.id));
            if (JSON.stringify(finalUsers) !== JSON.stringify(prevUsers)) {
              return finalUsers;
            }
            return prevUsers;
          });
        }

        if (data.notifications && JSON.stringify(data.notifications) !== JSON.stringify(notifications)) {
          setNotifications(data.notifications);
        }
        if (data.budget !== undefined && data.budget !== systemBudget) {
          setSystemBudget(data.budget);
        }
        if (data.rankProfit !== undefined && data.rankProfit !== rankProfit) {
          setRankProfit(data.rankProfit);
        }
        if (data.storageFull !== undefined) setStorageFull(data.storageFull);
        if (data.storageUsage !== undefined) setStorageUsage(data.storageUsage);

        // Update current user if they are in the fetched users list
        if (user && data.users) {
          const freshUser = data.users.find((u: User) => u.id === user.id);
          if (freshUser && (freshUser.updatedAt || 0) >= (user.updatedAt || 0)) {
            if (JSON.stringify(freshUser) !== JSON.stringify(user)) {
              setUser(freshUser);
            }
          }
        }

        // Only handle auto-login during the very first fetch
        if (isInitial) {
          const savedUser = localStorage.getItem('vnv_user');
          if (savedUser && savedUser !== 'null' && savedUser !== '') {
            try {
              const parsedUser = JSON.parse(savedUser);
              const freshUser = data.users.find((u: User) => u.id === parsedUser.id);
              if (freshUser) {
                setUser(freshUser);
                setCurrentView(freshUser.isAdmin ? AppView.ADMIN_DASHBOARD : AppView.DASHBOARD);
              } else if (parsedUser.isAdmin) {
                setUser(parsedUser);
                setCurrentView(AppView.ADMIN_DASHBOARD);
              }
            } catch (jsonError) {
              localStorage.removeItem('vnv_user');
            }
          }
        } else if (user) {
          // Update current user data if changed in background
          const updatedMe = data.users.find((u: User) => u.id === user.id);
          if (updatedMe && JSON.stringify(updatedMe) !== JSON.stringify(user)) {
            setUser(updatedMe);
          }
        }
      } catch (e: any) {
        if (retries > 0) {
          setTimeout(() => fetchData(isInitial, retries - 1), 2000);
        }
      } finally {
        if (isInitial) setIsInitialized(true);
      }
    };

    fetchData(true);
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let usersUpdated = false;
    let loansUpdated = false;

    const newUsers = [...registeredUsers];
    
    // 1. Calculate fines for all loans
    const nowTime = Date.now();
    const newLoans = loans.map(loan => {
      if (loan.status === 'ĐANG NỢ' || loan.status === 'CHỜ TẤT TOÁN' || loan.status === 'ĐANG GIẢI NGÂN') {
        const [d, m, y] = loan.date.split('/').map(Number);
        const dueDate = new Date(y, m - 1, d);
        dueDate.setHours(0, 0, 0, 0);

        if (today > dueDate) {
          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          const maxFine = loan.amount * 0.3;
          const calculatedFine = Math.floor(loan.amount * 0.001 * diffDays);
          const newFine = Math.min(maxFine, calculatedFine);

          if (loan.fine !== newFine) {
            loansUpdated = true;
            return { ...loan, fine: newFine, updatedAt: nowTime };
          }
        }
      }
      return loan;
    });

    // 2. Handle rank demotion for users
    newUsers.forEach((targetUser, userIdx) => {
      if (targetUser.isAdmin) return;

      const userLoans = newLoans.filter(l => 
        l.userId === targetUser.id && 
        (l.status === 'ĐANG NỢ' || l.status === 'CHỜ TẤT TOÁN' || l.status === 'ĐANG GIẢI NGÂN')
      );

      let maxDiffDays = 0;
      userLoans.forEach(loan => {
        const [d, m, y] = loan.date.split('/').map(Number);
        const dueDate = new Date(y, m - 1, d);
        dueDate.setHours(0, 0, 0, 0);
        if (today > dueDate) {
          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > maxDiffDays) maxDiffDays = diffDays;
        }
      });

      if (maxDiffDays > 0) {
        const rankOrder: UserRank[] = ['standard', 'bronze', 'silver', 'gold', 'diamond'];
        let currentRank = targetUser.rank;
        let currentProgress = targetUser.rankProgress;
        let remainingDays = maxDiffDays;

        if (currentRank === 'diamond') {
          currentRank = 'gold';
          currentProgress = 10;
          remainingDays -= 1;
        }

        while (remainingDays > 0 && currentRank !== 'standard') {
          if (currentProgress >= remainingDays) {
            currentProgress -= remainingDays;
            remainingDays = 0;
          } else {
            remainingDays -= (currentProgress + 1);
            const rankIdx = rankOrder.indexOf(currentRank);
            if (rankIdx > 0) {
              currentRank = rankOrder[rankIdx - 1];
              currentProgress = 10;
            } else {
              remainingDays = 0;
            }
          }
        }

        if (currentRank === 'standard' && remainingDays > 0) {
          currentProgress = Math.max(0, currentProgress - remainingDays);
          remainingDays = 0;
        }

        if (currentRank !== targetUser.rank || currentProgress !== targetUser.rankProgress) {
          let newLimit = targetUser.totalLimit;
          if (currentRank === 'standard') newLimit = 2000000;
          else if (currentRank === 'bronze') newLimit = 3000000;
          else if (currentRank === 'silver') newLimit = 4000000;
          else if (currentRank === 'gold') newLimit = 5000000;
          else if (currentRank === 'diamond') newLimit = 10000000;

          newUsers[userIdx] = {
            ...targetUser,
            rank: currentRank,
            rankProgress: currentProgress,
            totalLimit: newLimit,
            balance: Math.min(newLimit, targetUser.balance),
            updatedAt: nowTime
          };
          usersUpdated = true;
        }
      }
    });

    // Consolidate updates to avoid multiple re-renders
    if (loansUpdated || usersUpdated) {
      if (loansUpdated) setLoans(newLoans);
      if (usersUpdated) {
        setRegisteredUsers(newUsers);
        if (user && !user.isAdmin) {
          const updatedMe = newUsers.find(u => u.id === user.id);
          if (updatedMe) setUser(updatedMe);
        }
      }
    }
  }, [isInitialized, loans, registeredUsers]);

  useEffect(() => {
    if (!isInitialized) return;
    const persist = async () => {
      localStorage.setItem('vnv_user', user ? JSON.stringify(user) : '');
      
      try {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registeredUsers)
        });
        
        await fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(loans)
        });
        
        await fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notifications)
        });
        
        await fetch('/api/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: systemBudget })
        });
        
        await fetch('/api/rankProfit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rankProfit })
        });
      } catch (e) {
        console.error("Lỗi khi lưu dữ liệu lên server:", e);
      }
    };
    const timer = setTimeout(persist, 2000);
    return () => clearTimeout(timer);
  }, [user, loans, registeredUsers, notifications, systemBudget, rankProfit, isInitialized]);

  const handleLogin = (phone: string, password?: string) => {
    setLoginError(null);
    const isAdmin = (phone === '0877203996' && password === '119011');
    if (isAdmin) {
      const adminUser: User = {
        id: 'AD01', phone: '0877203996', fullName: 'QUẢN TRỊ VIÊN', idNumber: 'SYSTEM_ADMIN',
        balance: 500000000, totalLimit: 500000000, rank: 'diamond', rankProgress: 10,
        isLoggedIn: true, isAdmin: true
      };
      setUser(adminUser);
      setCurrentView(AppView.ADMIN_DASHBOARD);
      setShowBankWarning(false);
      return;
    }
    const existingUser = registeredUsers.find(u => u.phone === phone);
    if (existingUser) {
      const loggedInUser = { ...existingUser, isLoggedIn: true };
      setUser(loggedInUser);
      setCurrentView(AppView.DASHBOARD);
      if (!hasBankInfo(loggedInUser)) {
        setShowBankWarning(true);
      }
    } else {
      setLoginError("Thông tin đăng nhập không chính xác.");
    }
  };

  const handleRegister = async (userData: Partial<User>) => {
    setRegisterError(null);
    const existingUser = registeredUsers.find(u => u.phone === userData.phone);
    if (existingUser) {
      setRegisterError("Số điện thoại này đã được đăng ký.");
      return;
    }

    const newUser: User = {
      id: Math.floor(1000 + Math.random() * 9000).toString(), 
      phone: userData.phone || '', fullName: userData.fullName || '',
      idNumber: userData.idNumber || '', address: userData.address || '',
      balance: 2000000, totalLimit: 2000000, rank: 'standard', rankProgress: 0,
      isLoggedIn: true, isAdmin: false,
      joinDate: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
      idFront: userData.idFront, idBack: userData.idBack, refZalo: userData.refZalo, relationship: userData.relationship,
      lastLoanSeq: 0,
      updatedAt: Date.now()
    };
    setRegisteredUsers(prev => [...prev, newUser]);
    setUser(newUser);
    setCurrentView(AppView.DASHBOARD);
    setShowBankWarning(true);
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView(AppView.LOGIN);
  };

  const handleApplyLoan = async (amount: number, signature?: string) => {
    if (!user) return;
    const now = new Date();
    
    // Đồng bộ logic ngày đến hạn với Dashboard và LoanApplication
    const nextMonth1st = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const diffTime = nextMonth1st.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let finalDate;
    if (diffDays < 10) {
      finalDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    } else {
      finalDate = nextMonth1st;
    }
    const dueDate = finalDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Logic tạo Mã hợp đồng: NDV-UserID-Sequence (Ví dụ: NDV-1234-01)
    const nextSeq = (user.lastLoanSeq || 0) + 1;
    const sequence = nextSeq.toString().padStart(2, '0');
    const contractId = `NDV-${user.id}-${sequence}`;

    const newLoan: LoanRecord = {
      id: contractId,
      userId: user.id, 
      userName: user.fullName, 
      amount: amount,
      date: dueDate, 
      createdAt: now.toLocaleTimeString('vi-VN') + ' ' + now.toLocaleDateString('vi-VN'), 
      status: 'CHỜ DUYỆT', 
      signature: signature,
      updatedAt: Date.now()
    };
    
    const updatedUser = { 
      ...user, 
      balance: user.balance - amount,
      lastLoanSeq: nextSeq,
      updatedAt: Date.now()
    };

    const newLoans = [newLoan, ...loans];
    const newRegisteredUsers = registeredUsers.map(u => u.id === user.id ? updatedUser : u);

    // Persist immediately to prevent race condition with polling
    try {
      await Promise.all([
        fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLoans)
        }),
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRegisteredUsers)
        })
      ]);
    } catch (e) {
      console.error("Lỗi lưu khoản vay:", e);
    }
    
    setLoans(newLoans);
    setUser(updatedUser);
    setRegisteredUsers(newRegisteredUsers);
  };

  const handleUpgradeRank = async (targetRank: UserRank, bill: string) => {
    if (!user) return;
    const updatedUser = { ...user, pendingUpgradeRank: targetRank, rankUpgradeBill: bill, updatedAt: Date.now() };
    const newRegisteredUsers = registeredUsers.map(u => u.id === user.id ? updatedUser : u);
    
    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRegisteredUsers)
      });
    } catch (e) {
      console.error("Lỗi nâng hạng:", e);
    }

    setUser(updatedUser);
    setRegisteredUsers(newRegisteredUsers);
  };

  const handleSettleLoan = async (loanId: string, bill: string) => {
    const newLoans = loans.map(loan => {
      if (loan.id === loanId) return { ...loan, status: 'CHỜ TẤT TOÁN', billImage: bill, updatedAt: Date.now() };
      return loan;
    });

    try {
      await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoans)
      });
    } catch (e) {
      console.error("Lỗi tất toán:", e);
    }

    setLoans(newLoans);
  };

  const handleAdminLoanAction = async (loanId: string, action: 'APPROVE' | 'DISBURSE' | 'SETTLE' | 'REJECT', reason?: string) => {
    let newLoans = [...loans];
    let newRegisteredUsers = [...registeredUsers];
    let usersUpdated = false;
    let newBudget = systemBudget;

    const loanIdx = newLoans.findIndex(l => l.id === loanId);
    if (loanIdx === -1) return;

    const loan = newLoans[loanIdx];
    let newStatus = loan.status;
    let rejectionReason = reason || loan.rejectionReason;

    if (action === 'DISBURSE') newBudget -= loan.amount;
    else if (action === 'SETTLE') newBudget += loan.amount;

    if (action === 'REJECT') {
      if (loan.status === 'CHỜ TẤT TOÁN') {
        newStatus = 'ĐANG NỢ';
      } else {
        newStatus = 'BỊ TỪ CHỐI';
        const loanUser = newRegisteredUsers.find(u => u.id === loan.userId);
        if (loanUser) {
          const updatedUser = { ...loanUser, balance: Math.min(loanUser.totalLimit, loanUser.balance + loan.amount), updatedAt: Date.now() };
          newRegisteredUsers = newRegisteredUsers.map(u => u.id === loan.userId ? updatedUser : u);
          usersUpdated = true;
        }
      }
    } else {
      switch(action) {
        case 'APPROVE': newStatus = 'ĐÃ DUYỆT'; break;
        case 'DISBURSE': newStatus = 'ĐANG NỢ'; break;
        case 'SETTLE': newStatus = 'ĐÃ TẤT TOÁN'; break;
      }
    }

    if (action === 'SETTLE') {
      const loanUser = newRegisteredUsers.find(u => u.id === loan.userId);
      if (loanUser) {
        const updatedUser = { ...loanUser, balance: Math.min(loanUser.totalLimit, loanUser.balance + loan.amount), rankProgress: Math.min(10, loanUser.rankProgress + 1), updatedAt: Date.now() };
        newRegisteredUsers = newRegisteredUsers.map(u => u.id === loan.userId ? updatedUser : u);
        usersUpdated = true;
      }
    }

    const updatedLoan = { ...loan, status: newStatus as any, rejectionReason, updatedAt: Date.now() };
    newLoans[loanIdx] = updatedLoan;

    // Persist immediately
    try {
      await Promise.all([
        fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLoans)
        }),
        usersUpdated ? fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRegisteredUsers)
        }) : Promise.resolve(),
        fetch('/api/budget', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ budget: newBudget })
        })
      ]);
    } catch (e) {
      console.error("Lỗi lưu thay đổi khoản vay:", e);
    }

    setLoans(newLoans);
    setSystemBudget(newBudget);
    if (usersUpdated) {
      setRegisteredUsers(newRegisteredUsers);
      if (user && !user.isAdmin) {
        const updatedMe = newRegisteredUsers.find(u => u.id === user.id);
        if (updatedMe) setUser(updatedMe);
      }
    }

    if (action === 'DISBURSE') {
      addNotification(loan.userId, 'Giải ngân thành công', `Khoản vay ID ${loan.id} đã được giải ngân vào tài khoản của bạn.`, 'LOAN');
    } else if (action === 'SETTLE') {
      addNotification(loan.userId, 'Tất toán thành công', `Khoản vay ID ${loan.id} đã được tất toán hoàn tất.`, 'LOAN');
    } else if (action === 'REJECT') {
      addNotification(loan.userId, 'Yêu cầu bị từ chối', `Yêu cầu cho khoản vay ID ${loan.id} đã bị từ chối. Lý do: ${rejectionReason || 'Không xác định'}`, 'LOAN');
    }
  };

  const handleAdminUserAction = async (userId: string, action: 'APPROVE_RANK' | 'REJECT_RANK') => {
    let newUsers = [...registeredUsers];
    let updatedUser: User | null = null;

    if (action === 'APPROVE_RANK') {
      const targetUser = newUsers.find(u => u.id === userId);
      if (targetUser && targetUser.pendingUpgradeRank) {
        const newRank = targetUser.pendingUpgradeRank;
        let newLimit = targetUser.totalLimit;
        
        if (newRank === 'bronze') newLimit = 3000000;
        else if (newRank === 'silver') newLimit = 4000000;
        else if (newRank === 'gold') newLimit = 5000000;
        else if (newRank === 'diamond') newLimit = 10000000;
        
        const upgradeFee = newLimit * 0.05;
        setRankProfit(prev => prev + upgradeFee);
        
        updatedUser = { 
          ...targetUser, 
          rank: newRank, 
          totalLimit: newLimit, 
          balance: newLimit - (targetUser.totalLimit - targetUser.balance), 
          pendingUpgradeRank: null, 
          rankUpgradeBill: undefined,
          updatedAt: Date.now()
        };
        
        newUsers = newUsers.map(u => u.id === userId ? updatedUser! : u);
        
        const rankNames: Record<string, string> = {
          'bronze': 'Đồng',
          'silver': 'Bạc',
          'gold': 'Vàng',
          'diamond': 'Kim cương'
        };
        addNotification(userId, 'Nâng hạng thành công', `Hạng của bạn đã được nâng lên ${rankNames[newRank] || newRank}.`, 'RANK');
      }
    } else if (action === 'REJECT_RANK') {
      const targetUser = newUsers.find(u => u.id === userId);
      if (targetUser) {
        updatedUser = { ...targetUser, pendingUpgradeRank: null, rankUpgradeBill: undefined, updatedAt: Date.now() };
        newUsers = newUsers.map(u => u.id === userId ? updatedUser! : u);
        addNotification(userId, 'Từ chối nâng hạng', `Yêu cầu nâng hạng của bạn đã bị từ chối. Vui lòng kiểm tra lại hồ sơ.`, 'RANK');
      }
    }

    if (updatedUser) {
      try {
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUsers)
        });
      } catch (e) {
        console.error("Lỗi lưu nâng hạng:", e);
      }
      
      setRegisteredUsers(newUsers);
      if (user?.id === userId) setUser(updatedUser);
    }
  };

  const handleResetRankProfit = () => {
    setRankProfit(0);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      setRegisteredUsers(prev => prev.filter(u => u.id !== userId));
      setLoans(prev => prev.filter(l => l.userId !== userId));
    } catch (e) {
      console.error("Lỗi khi xóa user:", e);
    }
  };

  const handleAutoCleanupUsers = async () => {
    const usersToDelete = registeredUsers.filter(u => {
      if (u.isAdmin) return false;
      const userLoans = loans.filter(l => l.userId === u.id);
      if (userLoans.length === 0) return false;
      const settled = userLoans.filter(l => l.status === 'ĐÃ TẤT TOÁN');
      if (settled.length === 0) return false;
      return true; 
    });
    
    for (const u of usersToDelete) {
      try {
        await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      } catch (e) {
        console.error("Lỗi khi dọn dẹp user:", u.id, e);
      }
    }
    
    setRegisteredUsers(prev => prev.filter(u => !usersToDelete.some(td => td.id === u.id)));
    setLoans(prev => prev.filter(l => !usersToDelete.some(td => td.id === l.userId)));
    return usersToDelete.length;
  };

  const adminNotificationCount = useMemo(() => 
    loans.filter(l => l.status === 'CHỜ DUYỆT' || l.status === 'CHỜ TẤT TOÁN').length +
    registeredUsers.filter(u => u.pendingUpgradeRank).length
  , [loans, registeredUsers]);

  const renderView = () => {
    switch (currentView) {
      case AppView.LOGIN: return <Login onLogin={handleLogin} onNavigateRegister={() => { setRegisterError(null); setCurrentView(AppView.REGISTER); }} error={loginError} />;
      case AppView.REGISTER: return <Register onBack={() => setCurrentView(AppView.LOGIN)} onRegister={handleRegister} error={registerError} />;
      case AppView.DASHBOARD: 
        return (
          <Dashboard 
            user={user} 
            loans={loans.filter(l => l.userId === user?.id)} 
            notifications={notifications.filter(n => n.userId === user?.id)}
            systemBudget={systemBudget} 
            onApply={() => {
              if (!hasBankInfo(user)) {
                setShowBankWarning(true);
                return;
              }
              setCurrentView(AppView.APPLY_LOAN);
            }} 
            onLogout={handleLogout} 
            onViewAllLoans={() => {
              if (!hasBankInfo(user)) {
                setShowBankWarning(true);
                return;
              }
              setCurrentView(AppView.APPLY_LOAN);
            }}
            onSettleLoan={(loan) => {
              setSettleLoanFromDash(loan);
              setCurrentView(AppView.APPLY_LOAN);
            }}
            onViewContract={(loan) => {
              setViewLoanFromDash(loan);
              setCurrentView(AppView.APPLY_LOAN);
            }}
            onMarkNotificationRead={(id) => {
              setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
            }}
          />
        );
      case AppView.APPLY_LOAN: 
        return (
          <LoanApplication 
            user={user} 
            loans={loans.filter(l => l.userId === user?.id)} 
            systemBudget={systemBudget} 
            onApplyLoan={handleApplyLoan} 
            onSettleLoan={handleSettleLoan} 
            onBack={() => {
              setSettleLoanFromDash(null);
              setViewLoanFromDash(null);
              setCurrentView(AppView.DASHBOARD);
            }}
            initialLoanToSettle={settleLoanFromDash}
            initialLoanToView={viewLoanFromDash}
          />
        );
      case AppView.RANK_LIMITS: return <RankLimits user={user} onBack={() => setCurrentView(AppView.DASHBOARD)} onUpgrade={handleUpgradeRank} />;
      case AppView.PROFILE: 
        return (
          <Profile 
            user={user} 
            onBack={() => setCurrentView(AppView.DASHBOARD)} 
            onLogout={handleLogout} 
            onUpdateBank={(bankData) => {
              if (user) {
                const updatedUser = { ...user, ...bankData, updatedAt: Date.now() };
                setUser(updatedUser);
                setRegisteredUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
                addNotification(user.id, 'Cập nhật tài khoản', 'Thông tin tài khoản nhận tiền của bạn đã được cập nhật.', 'SYSTEM');
                setShowBankWarning(false);
              }
            }}
            onUpdateProfile={(userData) => {
              if (user) {
                const updatedUser = { ...user, ...userData, updatedAt: Date.now() };
                setUser(updatedUser);
                setRegisteredUsers(prev => prev.map(u => u.id === user.id ? updatedUser : u));
                addNotification(user.id, 'Cập nhật thông tin', 'Thông tin cá nhân của bạn đã được cập nhật thành công.', 'SYSTEM');
              }
            }}
          />
        );
      case AppView.ADMIN_DASHBOARD: return <AdminDashboard user={user} loans={loans} registeredUsersCount={registeredUsers.length} systemBudget={systemBudget} rankProfit={rankProfit} onResetRankProfit={handleResetRankProfit} onLogout={handleLogout} />;
      case AppView.ADMIN_USERS: return <AdminUserManagement users={registeredUsers} loans={loans} onAction={handleAdminUserAction} onLoanAction={handleAdminLoanAction} onDeleteUser={handleDeleteUser} onAutoCleanup={handleAutoCleanupUsers} onBack={() => setCurrentView(AppView.ADMIN_DASHBOARD)} />;
      case AppView.ADMIN_BUDGET: return <AdminBudget currentBudget={systemBudget} onUpdate={(val) => setSystemBudget(val)} onBack={() => setCurrentView(AppView.ADMIN_DASHBOARD)} />;
      default: return <Dashboard user={user} loans={loans} systemBudget={systemBudget} onApply={() => setCurrentView(AppView.APPLY_LOAN)} onLogout={handleLogout} onViewAllLoans={() => setCurrentView(AppView.APPLY_LOAN)} />;
    }
  };

  const showNavbar = user && currentView !== AppView.LOGIN && currentView !== AppView.REGISTER;

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff8c00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-black text-white flex flex-col max-w-md mx-auto relative overflow-hidden">
        {storageFull && !user?.isAdmin && (
          <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center text-[#ff8c00] animate-pulse">
              <AlertTriangle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Hệ thống bảo trì</h2>
              <p className="text-sm font-bold text-gray-500 leading-relaxed">
                Hệ thống đang quá tải dung lượng lưu trữ và cần bảo trì định kỳ. Vui lòng quay lại sau ít phút.
              </p>
            </div>
            <div className="w-12 h-1 bg-orange-500/20 rounded-full"></div>
          </div>
        )}

        {storageFull && user?.isAdmin && (
          <div className="fixed top-0 left-0 right-0 z-[1000] bg-red-600 text-white px-4 py-2 flex items-center justify-between shadow-lg max-w-md mx-auto">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="animate-bounce" />
              <span className="text-[10px] font-black uppercase tracking-widest">CẢNH BÁO: DUNG LƯỢNG SẮP HẾT ({storageUsage}MB/45MB)</span>
            </div>
            <button onClick={() => setStorageFull(false)} className="text-white/50 hover:text-white"><X size={14} /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scroll-smooth">{renderView()}</div>
        {showBankWarning && currentView !== AppView.PROFILE && (
          <BankUpdateWarning onUpdate={() => {
            setShowBankWarning(false);
            setCurrentView(AppView.PROFILE);
          }} />
        )}
        {showNavbar && (
          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#111111]/95 backdrop-blur-xl border-t border-white/10 px-4 py-4 flex justify-between items-center z-[50] safe-area-bottom">
            {user?.isAdmin ? (
              <>
                <button onClick={() => setCurrentView(AppView.ADMIN_DASHBOARD)} className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.ADMIN_DASHBOARD ? 'text-[#ff8c00]' : 'text-gray-500'}`}><LayoutGrid size={22} /><span className="text-[7px] font-black uppercase tracking-widest">Tổng quan</span></button>
                <button onClick={() => setCurrentView(AppView.ADMIN_USERS)} className={`flex flex-col items-center gap-1 flex-1 relative ${currentView === AppView.ADMIN_USERS ? 'text-[#ff8c00]' : 'text-gray-500'}`}>
                  <div className="relative"><Users size={22} />{adminNotificationCount > 0 && <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center border-2 border-[#111111] animate-bounce"><span className="text-[7px] font-black text-white">{adminNotificationCount}</span></div>}</div>
                  <span className="text-[7px] font-black uppercase tracking-widest">Người dùng</span>
                </button>
                <button onClick={() => setCurrentView(AppView.ADMIN_BUDGET)} className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.ADMIN_BUDGET ? 'text-[#ff8c00]' : 'text-gray-500'}`}><Wallet size={22} /><span className="text-[7px] font-black uppercase tracking-widest">Ngân sách</span></button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => {
                    setSettleLoanFromDash(null);
                    setViewLoanFromDash(null);
                    setCurrentView(AppView.DASHBOARD);
                  }} 
                  className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.DASHBOARD ? 'text-[#ff8c00]' : 'text-gray-500'}`}
                >
                  <Home size={22} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Trang chủ</span>
                </button>
                <button 
                  onClick={() => {
                    if (!hasBankInfo(user)) {
                      setShowBankWarning(true);
                      return;
                    }
                    setSettleLoanFromDash(null);
                    setViewLoanFromDash(null);
                    setCurrentView(AppView.APPLY_LOAN);
                  }} 
                  className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.APPLY_LOAN ? 'text-[#ff8c00]' : 'text-gray-500'}`}
                >
                  <Briefcase size={22} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Vay vốn</span>
                </button>
                <button 
                  onClick={() => {
                    if (!hasBankInfo(user)) {
                      setShowBankWarning(true);
                      return;
                    }
                    setSettleLoanFromDash(null);
                    setViewLoanFromDash(null);
                    setCurrentView(AppView.RANK_LIMITS);
                  }} 
                  className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.RANK_LIMITS ? 'text-[#ff8c00]' : 'text-gray-500'}`}
                >
                  <Medal size={22} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Hạn mức</span>
                </button>
                <button 
                  onClick={() => {
                    setSettleLoanFromDash(null);
                    setViewLoanFromDash(null);
                    setCurrentView(AppView.PROFILE);
                  }} 
                  className={`flex flex-col items-center gap-1 flex-1 ${currentView === AppView.PROFILE ? 'text-[#ff8c00]' : 'text-gray-500'}`}
                >
                  <UserIcon size={22} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Cá nhân</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
