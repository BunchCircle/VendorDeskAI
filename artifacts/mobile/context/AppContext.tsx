import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Session } from "@supabase/supabase-js";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Lead,
  Product,
  Quotation,
  VendorProfile,
  generateId,
  getLeads,
  getProducts,
  getQuotations,
  getVendorProfile,
  saveVendorProfile,
  saveProducts,
  addLead as storageAddLead,
  addProduct as storageAddProduct,
  deleteLead as storageDeleteLead,
  deleteProduct as storageDeleteProduct,
  saveQuotation as storageSaveQuotation,
  updateLead as storageUpdateLead,
  updateProduct as storageUpdateProduct,
} from "../services/storage";
import { supabase } from "../services/supabase";
import {
  deleteRemoteLead,
  deleteRemoteProduct,
  getRemoteLeads,
  getRemoteProducts,
  getRemoteQuotations,
  getRemoteVendorProfile,
  upsertRemoteLead,
  upsertRemoteProduct,
  upsertRemoteQuotation,
  upsertRemoteVendorProfile,
} from "../services/supabaseData";
import {
  enqueue,
  flushQueue,
  getQueueLength,
} from "../services/syncQueue";

const ACTIVE_USER_KEY = "active_user_id";

async function clearLocalCache(): Promise<void> {
  await AsyncStorage.multiRemove([
    "vendor_profile",
    "products",
    "leads",
    "quotations",
    "is_onboarded",
    ACTIVE_USER_KEY,
  ]);
}

interface AppContextType {
  isLoading: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  session: Session | null;
  onboarded: boolean;
  vendorProfile: VendorProfile | null;
  products: Product[];
  leads: Lead[];
  quotations: Quotation[];
  saveProfile: (profile: VendorProfile) => Promise<void>;
  addProduct: (product: Omit<Product, "id">) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addLead: (lead: Omit<Lead, "id" | "createdAt">) => Promise<Lead>;
  updateLead: (lead: Lead) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;
  saveQuotation: (quotation: Quotation) => Promise<void>;
  getQuotationForLead: (leadId: string) => Quotation | undefined;
  refreshAll: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);

  const lastUserIdRef = useRef<string | null>(null);
  const isFlushing = useRef(false);
  const isOnlineRef = useRef(true);

  const clearAppState = useCallback(() => {
    setOnboarded(false);
    setVendorProfile(null);
    setProducts([]);
    setLeads([]);
    setQuotations([]);
  }, []);

  const loadFromCache = useCallback(async () => {
    const [profile, prods, ldList, quots] = await Promise.all([
      getVendorProfile(),
      getProducts(),
      getLeads(),
      getQuotations(),
    ]);
    setVendorProfile(profile);
    setOnboarded(!!profile);
    setProducts(prods);
    setLeads(ldList);
    setQuotations(quots);
  }, []);

  const syncFromSupabase = useCallback(async () => {
    const [profileResult, prodsResult, leadsResult, quotsResult] = await Promise.all([
      getRemoteVendorProfile(),
      getRemoteProducts(),
      getRemoteLeads(),
      getRemoteQuotations(),
    ]);

    if (profileResult.ok) {
      if (profileResult.data) {
        await saveVendorProfile(profileResult.data);
        setVendorProfile(profileResult.data);
        setOnboarded(true);
      } else {
        setOnboarded(false);
      }
    }

    if (prodsResult.ok) {
      await saveProducts(prodsResult.data);
      setProducts(prodsResult.data);
    }

    if (leadsResult.ok) {
      await AsyncStorage.setItem("leads", JSON.stringify(leadsResult.data));
      setLeads(leadsResult.data);
    }

    if (quotsResult.ok) {
      await AsyncStorage.setItem("quotations", JSON.stringify(quotsResult.data));
      setQuotations(quotsResult.data);
    }
  }, []);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Flush the pending queue for `userId` if not already flushing.
   * Stops at first failure to preserve strict operation ordering.
   * Schedules a retry in 30 s if the queue remains non-empty and device is online.
   */
  const tryFlushQueue = useCallback(async (userId: string) => {
    if (isFlushing.current) return;
    const pending = await getQueueLength(userId);
    if (pending === 0) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    isFlushing.current = true;
    setIsSyncing(true);
    try {
      await flushQueue(userId, (remaining) => {
        if (remaining === 0) setIsSyncing(false);
      });
    } catch {
    } finally {
      isFlushing.current = false;
      const remaining = await getQueueLength(userId);
      if (remaining === 0) {
        setIsSyncing(false);
      } else if (isOnlineRef.current) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          tryFlushQueue(userId);
        }, 30_000);
      } else {
        setIsSyncing(false);
      }
    }
  }, []);

  const loadAll = useCallback(async (currentSession: Session | null) => {
    setIsLoading(true);

    const hardTimeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));

    const doLoad = async () => {
      if (!currentSession) {
        clearAppState();
        await clearLocalCache();
        lastUserIdRef.current = null;
        return;
      }

      const newUserId = currentSession.user.id;

      if (lastUserIdRef.current && lastUserIdRef.current !== newUserId) {
        clearAppState();
        await clearLocalCache();
      }
      lastUserIdRef.current = newUserId;
      await AsyncStorage.setItem(ACTIVE_USER_KEY, newUserId);

      // 1. Load cache instantly so UI is responsive
      await loadFromCache();

      // 2. Flush pending offline writes BEFORE pulling remote data.
      //    This prevents stale remote data from overwriting local changes.
      if (isOnlineRef.current) {
        await tryFlushQueue(newUserId).catch(() => {});
      }

      // 3. Pull remote data (only after local writes are synced up)
      const syncTimeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
      await Promise.race([syncFromSupabase(), syncTimeout]);
    };

    try {
      await Promise.race([doLoad(), hardTimeout]);
    } catch {
    } finally {
      setIsLoading(false);
    }
  }, [clearAppState, loadFromCache, syncFromSupabase, tryFlushQueue]);

  useEffect(() => {
    let initialLoadDone = false;

    // Safety net: if getSession() never resolves (e.g. network issue on
    // Android / web), fall through to unauthenticated state after 3 seconds.
    const getSessionTimeout = setTimeout(() => {
      if (!initialLoadDone) {
        initialLoadDone = true;
        setIsLoading(false);
      }
    }, 3000);

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      clearTimeout(getSessionTimeout);
      if (initialLoadDone) return;
      initialLoadDone = true;
      setSession(s);
      loadAll(s);
    }).catch(() => {
      clearTimeout(getSessionTimeout);
      initialLoadDone = true;
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      try {
        if (event === "TOKEN_REFRESHED") {
          setSession(s);
          return;
        }

        if (event === "INITIAL_SESSION") {
          if (initialLoadDone) return;
          initialLoadDone = true;
          setSession(s);
          await loadAll(s);
          return;
        }

        if (event === "SIGNED_OUT") {
          setSession(null);
          clearAppState();
          await clearLocalCache();
          lastUserIdRef.current = null;
          setIsLoading(false);
          return;
        }

        setSession(s);
        await loadAll(s);
      } catch {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      isOnlineRef.current = online;
      setIsOffline(!online);
      const userId = lastUserIdRef.current;
      if (online && userId) {
        tryFlushQueue(userId);
      }
    });

    // Initial network check — also triggers flush if queue is pending and online
    NetInfo.fetch().then((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      isOnlineRef.current = online;
      setIsOffline(!online);
      const userId = lastUserIdRef.current;
      if (online && userId) {
        tryFlushQueue(userId);
      }
    });

    return () => unsubscribe();
  }, [tryFlushQueue]);

  const saveProfile = useCallback(async (profile: VendorProfile) => {
    await saveVendorProfile(profile);
    setVendorProfile(profile);
    setOnboarded(true);
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteVendorProfile(profile);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "vendorProfile", payload: profile });
      }
    }
  }, []);

  const addProduct = useCallback(async (product: Omit<Product, "id">) => {
    const newProduct: Product = { ...product, id: generateId() };
    await storageAddProduct(newProduct);
    setProducts((prev) => [...prev, newProduct]);
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteProduct(newProduct);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "product", payload: newProduct });
      }
    }
  }, []);

  const updateProduct = useCallback(async (product: Product) => {
    await storageUpdateProduct(product);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteProduct(product);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "product", payload: product });
      }
    }
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    await storageDeleteProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    const userId = lastUserIdRef.current;
    try {
      await deleteRemoteProduct(id);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "delete", entity: "product", payload: { id } });
      }
    }
  }, []);

  const addLead = useCallback(async (lead: Omit<Lead, "id" | "createdAt">) => {
    const newLead: Lead = {
      ...lead,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    await storageAddLead(newLead);
    setLeads((prev) => [newLead, ...prev]);
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteLead(newLead);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "lead", payload: newLead });
      }
    }
    return newLead;
  }, []);

  const updateLead = useCallback(async (lead: Lead) => {
    await storageUpdateLead(lead);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteLead(lead);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "lead", payload: lead });
      }
    }
  }, []);

  const deleteLead = useCallback(async (id: string) => {
    await storageDeleteLead(id);
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const userId = lastUserIdRef.current;
    try {
      await deleteRemoteLead(id);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "delete", entity: "lead", payload: { id } });
      }
    }
  }, []);

  const saveQuotation = useCallback(async (quotation: Quotation) => {
    await storageSaveQuotation(quotation);
    setQuotations((prev) => {
      const idx = prev.findIndex((q) => q.id === quotation.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = quotation;
        return next;
      }
      return [...prev, quotation];
    });
    const userId = lastUserIdRef.current;
    try {
      await upsertRemoteQuotation(quotation);
    } catch {
      if (userId) {
        await enqueue(userId, { type: "upsert", entity: "quotation", payload: quotation });
      }
    }
  }, []);

  const getQuotationForLead = useCallback(
    (leadId: string) => quotations.find((q) => q.leadId === leadId),
    [quotations]
  );

  const refreshAll = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    await loadAll(s);
  }, [loadAll]);

  const logout = useCallback(async () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    await supabase.auth.signOut();
  }, []);

  return (
    <AppContext.Provider
      value={{
        isLoading,
        isOffline,
        isSyncing,
        session,
        onboarded,
        vendorProfile,
        products,
        leads,
        quotations,
        saveProfile,
        addProduct,
        updateProduct,
        deleteProduct,
        addLead,
        updateLead,
        deleteLead,
        saveQuotation,
        getQuotationForLead,
        refreshAll,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
