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
  parsePurchaseListStorage,
  PURCHASE_LIST_STORAGE_KEY
} from "@/features/purchase-list/storage";

export type RemovedPurchaseListItem = {
  shopCode: string;
  index: number;
};

type PurchaseListContextValue = {
  shopCodes: string[];
  isReady: boolean;
  hasProduct: (shopCode: string) => boolean;
  addProduct: (shopCode: string) => void;
  removeProduct: (shopCode: string) => RemovedPurchaseListItem | null;
  restoreProduct: (item: RemovedPurchaseListItem) => void;
  clearProducts: () => void;
};

const PurchaseListContext = createContext<PurchaseListContextValue | null>(null);

export function PurchaseListProvider({ children }: { children: ReactNode }) {
  const [shopCodes, setShopCodes] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);

  const writeShopCodes = useCallback((nextCodes: string[]) => {
    setShopCodes(nextCodes);

    try {
      window.localStorage.setItem(PURCHASE_LIST_STORAGE_KEY, JSON.stringify(nextCodes));
    } catch {
      // The in-memory list still works if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(PURCHASE_LIST_STORAGE_KEY);
      const parsedCodes = parsePurchaseListStorage(storedValue);
      setShopCodes(parsedCodes);

      if (storedValue && storedValue !== JSON.stringify(parsedCodes)) {
        window.localStorage.setItem(PURCHASE_LIST_STORAGE_KEY, JSON.stringify(parsedCodes));
      }
    } catch {
      setShopCodes([]);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === PURCHASE_LIST_STORAGE_KEY) {
        setShopCodes(parsePurchaseListStorage(event.newValue));
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const hasProduct = useCallback(
    (shopCode: string) => shopCodes.includes(shopCode.trim()),
    [shopCodes]
  );

  const addProduct = useCallback(
    (shopCode: string) => {
      const normalizedCode = shopCode.trim();
      if (!normalizedCode || normalizedCode.length > 64 || shopCodes.includes(normalizedCode)) {
        return;
      }

      writeShopCodes([...shopCodes, normalizedCode]);
    },
    [shopCodes, writeShopCodes]
  );

  const removeProduct = useCallback(
    (shopCode: string): RemovedPurchaseListItem | null => {
      const index = shopCodes.indexOf(shopCode);
      if (index < 0) {
        return null;
      }

      writeShopCodes(shopCodes.filter((code) => code !== shopCode));
      return { shopCode, index };
    },
    [shopCodes, writeShopCodes]
  );

  const restoreProduct = useCallback(
    ({ shopCode, index }: RemovedPurchaseListItem) => {
      if (!shopCode || shopCodes.includes(shopCode)) {
        return;
      }

      const restoredCodes = [...shopCodes];
      restoredCodes.splice(Math.min(Math.max(index, 0), restoredCodes.length), 0, shopCode);
      writeShopCodes(restoredCodes);
    },
    [shopCodes, writeShopCodes]
  );

  const clearProducts = useCallback(() => writeShopCodes([]), [writeShopCodes]);

  const value = useMemo(
    () => ({
      shopCodes,
      isReady,
      hasProduct,
      addProduct,
      removeProduct,
      restoreProduct,
      clearProducts
    }),
    [shopCodes, isReady, hasProduct, addProduct, removeProduct, restoreProduct, clearProducts]
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
