"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  hasLegacyPurchaseList,
  isProductIdentityId,
  LEGACY_PURCHASE_LIST_ACKNOWLEDGEMENT_KEY,
  LEGACY_PURCHASE_LIST_STORAGE_KEY,
  parsePurchaseListStorage,
  PURCHASE_LIST_STORAGE_KEY
} from "@/features/purchase-list/storage";

export type RemovedPurchaseListItem = {
  productIdentityId: string;
  index: number;
};

type PurchaseListContextValue = {
  productIdentityIds: string[];
  isReady: boolean;
  hasLegacyList: boolean;
  hasProduct: (productIdentityId: string | null | undefined) => boolean;
  addProduct: (productIdentityId: string) => void;
  removeProduct: (productIdentityId: string) => RemovedPurchaseListItem | null;
  restoreProduct: (item: RemovedPurchaseListItem) => void;
  clearProducts: () => void;
  acknowledgeLegacyList: () => void;
};

const PurchaseListContext = createContext<PurchaseListContextValue | null>(null);

export function PurchaseListProvider({ children }: { children: ReactNode }) {
  const [productIdentityIds, setProductIdentityIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [hasLegacyList, setHasLegacyList] = useState(false);

  const writeProductIdentityIds = useCallback((nextIds: string[]) => {
    setProductIdentityIds(nextIds);

    try {
      window.localStorage.setItem(PURCHASE_LIST_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // The in-memory list still works if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    try {
      const v2Value = window.localStorage.getItem(PURCHASE_LIST_STORAGE_KEY);
      const parsedIds = parsePurchaseListStorage(v2Value);
      setProductIdentityIds(parsedIds);
      setHasLegacyList(
        hasLegacyPurchaseList(
          window.localStorage.getItem(LEGACY_PURCHASE_LIST_STORAGE_KEY),
          v2Value,
          window.localStorage.getItem(LEGACY_PURCHASE_LIST_ACKNOWLEDGEMENT_KEY)
        )
      );

      if (v2Value !== null && v2Value !== JSON.stringify(parsedIds)) {
        window.localStorage.setItem(PURCHASE_LIST_STORAGE_KEY, JSON.stringify(parsedIds));
      }
    } catch {
      setProductIdentityIds([]);
      setHasLegacyList(false);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === PURCHASE_LIST_STORAGE_KEY) {
        setProductIdentityIds(parsePurchaseListStorage(event.newValue));
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const hasProduct = useCallback(
    (productIdentityId: string | null | undefined) =>
      Boolean(productIdentityId && productIdentityIds.includes(productIdentityId.toLowerCase())),
    [productIdentityIds]
  );

  const addProduct = useCallback(
    (productIdentityId: string) => {
      const normalizedId = productIdentityId.trim().toLowerCase();
      if (!isProductIdentityId(normalizedId) || productIdentityIds.includes(normalizedId)) {
        return;
      }

      writeProductIdentityIds([...productIdentityIds, normalizedId]);
    },
    [productIdentityIds, writeProductIdentityIds]
  );

  const removeProduct = useCallback(
    (productIdentityId: string): RemovedPurchaseListItem | null => {
      const index = productIdentityIds.indexOf(productIdentityId);
      if (index < 0) {
        return null;
      }

      writeProductIdentityIds(productIdentityIds.filter((id) => id !== productIdentityId));
      return { productIdentityId, index };
    },
    [productIdentityIds, writeProductIdentityIds]
  );

  const restoreProduct = useCallback(
    ({ productIdentityId, index }: RemovedPurchaseListItem) => {
      if (!isProductIdentityId(productIdentityId) || productIdentityIds.includes(productIdentityId)) {
        return;
      }

      const restoredIds = [...productIdentityIds];
      restoredIds.splice(Math.min(Math.max(index, 0), restoredIds.length), 0, productIdentityId);
      writeProductIdentityIds(restoredIds);
    },
    [productIdentityIds, writeProductIdentityIds]
  );

  const clearProducts = useCallback(() => writeProductIdentityIds([]), [writeProductIdentityIds]);

  const acknowledgeLegacyList = useCallback(() => {
    setHasLegacyList(false);

    try {
      window.localStorage.setItem(LEGACY_PURCHASE_LIST_ACKNOWLEDGEMENT_KEY, "1");
      window.localStorage.removeItem(LEGACY_PURCHASE_LIST_STORAGE_KEY);
    } catch {
      // Acknowledgement stays in memory if browser storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({
      productIdentityIds,
      isReady,
      hasLegacyList,
      hasProduct,
      addProduct,
      removeProduct,
      restoreProduct,
      clearProducts,
      acknowledgeLegacyList
    }),
    [
      productIdentityIds,
      isReady,
      hasLegacyList,
      hasProduct,
      addProduct,
      removeProduct,
      restoreProduct,
      clearProducts,
      acknowledgeLegacyList
    ]
  );

  return <PurchaseListContext.Provider value={value}>{children}</PurchaseListContext.Provider>;
}

export function usePurchaseList() {
  const context = useContext(PurchaseListContext);
  if (!context) {
    throw new Error("usePurchaseList must be used within PurchaseListProvider");
  }

  return context;
}
