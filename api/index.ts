import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STORAGE_LIMIT_MB = 45; // Virtual limit for demo purposes

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Helper to estimate JSON size in MB
const getStorageUsage = (data: any) => {
  const str = JSON.stringify(data);
  return (Buffer.byteLength(str, 'utf8') / (1024 * 1024));
};

// Auto-cleanup task: Delete notifications and old loans
const autoCleanupStorage = async () => {
  try {
    const now = new Date();
    
    // 1. Cleanup Notifications: Keep only 7 most recent per user
    const { data: users } = await supabase.from('users').select('id');
    if (users) {
      for (const user of users) {
        const { data: notifs } = await supabase.from('notifications')
          .select('id')
          .eq('userId', user.id)
          .order('id', { ascending: false });
        
        if (notifs && notifs.length > 7) {
          const toDelete = notifs.slice(7).map(n => n.id);
          await supabase.from('notifications').delete().in('id', toDelete);
        }
      }
    }

    // 2. Cleanup Loans:
    // - Delete Rejected loans older than 3 days
    // - Delete Settled loans older than 7 days
    // Note: We use updatedAt if available, or parse createdAt
    const { data: allLoans } = await supabase.from('loans').select('id, status, createdAt, updatedAt');
    if (allLoans) {
      const idsToDelete: string[] = [];
      const threeDaysAgo = now.getTime() - (3 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);

      for (const loan of allLoans) {
        // EXPLICIT PROTECTION: Never delete loans that are not Rejected or Settled
        if (loan.status !== 'BỊ TỪ CHỐI' && loan.status !== 'ĐÃ TẤT TOÁN') {
          continue;
        }

        let loanTime = loan.updatedAt || 0;
        if (!loanTime && loan.createdAt) {
          // Parse "HH:mm:ss DD/MM/YYYY"
          try {
            const parts = loan.createdAt.split(' ');
            if (parts.length === 2) {
              const [d, m, y] = parts[1].split('/').map(Number);
              const [h, min, s] = parts[0].split(':').map(Number);
              loanTime = new Date(y, m - 1, d, h, min, s).getTime();
            }
          } catch (e) {}
        }

        if (loanTime) {
          if (loan.status === 'BỊ TỪ CHỐI' && loanTime < threeDaysAgo) {
            idsToDelete.push(loan.id);
          } else if (loan.status === 'ĐÃ TẤT TOÁN' && loanTime < sevenDaysAgo) {
            idsToDelete.push(loan.id);
          }
        }
      }

      if (idsToDelete.length > 0) {
        console.log(`[Cleanup] Deleting ${idsToDelete.length} old loans`);
        await supabase.from('loans').delete().in('id', idsToDelete);
      }
    }
  } catch (e) {
    console.error("Lỗi auto-cleanup:", e);
  }
};

// Supabase Status check for Admin
app.get("/api/supabase-status", async (req, res) => {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.json({ 
        connected: false, 
        error: "Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY" 
      });
    }
    
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
    
    if (error) {
      return res.json({ 
        connected: false, 
        error: `Lỗi kết nối Supabase: ${error.message} (${error.code})` 
      });
    }
    
    res.json({ connected: true, message: "Kết nối Supabase ổn định" });
  } catch (e: any) {
    res.json({ connected: false, error: `Lỗi hệ thống: ${e.message}` });
  }
});

// API Routes
app.get("/api/data", async (req, res) => {
  try {
    const { data: users } = await supabase.from('users').select('*');
    const { data: loans } = await supabase.from('loans').select('*');
    const { data: notifications } = await supabase.from('notifications').select('*');
    const { data: config } = await supabase.from('config').select('*');

    const budget = config?.find(c => c.key === 'budget')?.value || 30000000;
    const rankProfit = config?.find(c => c.key === 'rankProfit')?.value || 0;

    const payload = {
      users: users || [],
      loans: loans || [],
      notifications: notifications || [],
      budget,
      rankProfit
    };

    const usage = getStorageUsage(payload);
    const isFull = usage > STORAGE_LIMIT_MB;

    // Run cleanup in background if usage is high
    if (usage > STORAGE_LIMIT_MB * 0.8) {
      autoCleanupStorage();
    }

    res.json({
      ...payload,
      storageFull: isFull,
      storageUsage: usage.toFixed(2)
    });
  } catch (e) {
    console.error("Lỗi trong /api/data:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const incomingUsers = req.body;
    if (!Array.isArray(incomingUsers)) {
      return res.status(400).json({ error: "Dữ liệu phải là mảng" });
    }

    for (const user of incomingUsers) {
      const { error } = await supabase.from('users').upsert(user, { onConflict: 'id' });
      if (error) console.error(`Lỗi upsert user ${user.id}:`, error);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/loans", async (req, res) => {
  try {
    const incomingLoans = req.body;
    if (!Array.isArray(incomingLoans)) {
      return res.status(400).json({ error: "Dữ liệu phải là mảng" });
    }

    for (const loan of incomingLoans) {
      const { error } = await supabase.from('loans').upsert(loan, { onConflict: 'id' });
      if (error) console.error(`Lỗi upsert loan ${loan.id}:`, error);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/notifications", async (req, res) => {
  try {
    const incomingNotifs = req.body;
    if (!Array.isArray(incomingNotifs)) {
      return res.status(400).json({ error: "Dữ liệu phải là mảng" });
    }

    for (const notif of incomingNotifs) {
      const { error } = await supabase.from('notifications').upsert(notif, { onConflict: 'id' });
      if (error) console.error(`Lỗi upsert notification ${notif.id}:`, error);
    }
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/budget", async (req, res) => {
  try {
    const { budget } = req.body;
    await supabase.from('config').upsert({ key: 'budget', value: budget }, { onConflict: 'key' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/rankProfit", async (req, res) => {
  try {
    const { rankProfit } = req.body;
    await supabase.from('config').upsert({ key: 'rankProfit', value: rankProfit }, { onConflict: 'key' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    await supabase.from('users').delete().eq('id', userId);
    await supabase.from('loans').delete().eq('userId', userId);
    await supabase.from('notifications').delete().eq('userId', userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default app;
