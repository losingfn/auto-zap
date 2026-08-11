"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TrashIcon } from "@/components/icons/lucide";
import type { PublicPurchaseListProduct } from "@/features/catalog/types";
import { withCatalogNavigationContext } from "@/features/catalog/navigation-context";
import {
  type RemovedPurchaseListItem,
  usePurchaseList
} from "@/features/purchase-list/purchase-list-provider";

type PurchaseListPageProps = {
  contact: {
    phone: string;
    address: string;
    yandexMapsUrl: string;
  };
};

type PurchaseListResponse = {
  products: PublicPurchaseListProduct[];
};

const UNDO_TIMEOUT_MS = 6000;
const UNDO_FADE_DURATION_MS = 200;

export function PurchaseListPage({ contact }: PurchaseListPageProps) {
  const {
    productIdentityIds,
    isReady,
    hasLegacyList,
    removeProduct,
    restoreProduct,
    clearProducts,
    acknowledgeLegacyList
  } = usePurchaseList();
  const [products, setProducts] = useState<PublicPurchaseListProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [undoItem, setUndoItem] = useState<RemovedPurchaseListItem | null>(null);
  const [isUndoToastVisible, setIsUndoToastVisible] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const clearTriggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelClearButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmClearButtonRef = useRef<HTMLButtonElement | null>(null);
  const shouldRestoreClearTriggerFocusRef = useRef(false);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (productIdentityIds.length === 0) {
      setProducts([]);
      setLoadError(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(false);

    void fetch("/api/purchase-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIdentityIds }),
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load purchase-list products");
        }

        const payload = (await response.json()) as PurchaseListResponse;
        setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError(true);
          setProducts([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [isReady, productIdentityIds]);

  useEffect(() => {
    if (!undoItem) {
      return;
    }

    setIsUndoToastVisible(true);
    const fadeTimeout = window.setTimeout(
      () => setIsUndoToastVisible(false),
      UNDO_TIMEOUT_MS - UNDO_FADE_DURATION_MS
    );
    const timeout = window.setTimeout(() => setUndoItem(null), UNDO_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fadeTimeout);
      window.clearTimeout(timeout);
    };
  }, [undoItem]);

  useEffect(() => {
    if (isClearDialogOpen) {
      cancelClearButtonRef.current?.focus();
      return;
    }

    if (shouldRestoreClearTriggerFocusRef.current) {
      clearTriggerButtonRef.current?.focus();
      shouldRestoreClearTriggerFocusRef.current = false;
    }
  }, [isClearDialogOpen]);

  useEffect(() => {
    if (!isClearDialogOpen) {
      return;
    }

    const { body, documentElement } = document;
    const scrollY = window.scrollY;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    const previousStyles = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = previousStyles.overflow;
      body.style.paddingRight = previousStyles.paddingRight;
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.width = previousStyles.width;
      window.scrollTo(0, scrollY);
    };
  }, [isClearDialogOpen]);

  const productsByIdentityId = useMemo(
    () => new Map(products.map((product) => [product.productIdentityId, product])),
    [products]
  );

  function removeItem(productIdentityId: string) {
    const removed = removeProduct(productIdentityId);
    if (removed) {
      setUndoItem(removed);
    }
  }

  function restoreRemovedItem() {
    if (!undoItem) {
      return;
    }

    restoreProduct(undoItem);
    setUndoItem(null);
  }

  function confirmClear() {
    clearProducts();
    setUndoItem(null);
    closeClearDialog();
  }

  function openClearDialog() {
    shouldRestoreClearTriggerFocusRef.current = false;
    setIsClearDialogOpen(true);
  }

  function closeClearDialog() {
    shouldRestoreClearTriggerFocusRef.current = true;
    setIsClearDialogOpen(false);
  }

  return (
    <>
      <main className="premium-page flex-1 bg-[#111827] text-white">
        <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/" className="tap-target inline-flex min-h-10 items-center text-sm text-[#93C5FD] hover:text-white">
          ← На главную
        </Link>
        <div className="mt-4 rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-7">
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Список покупок</h1>
          {isReady && productIdentityIds.length > 0 ? (
            <p className="mt-3 text-[#CBD5E1]">{formatProductCount(productIdentityIds.length)}</p>
          ) : null}
        </div>

        {!isReady ? (
          <div className="mt-6 rounded-card border border-white/10 bg-[#111827] p-5 text-[#CBD5E1] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
            Загружаем список покупок…
          </div>
        ) : productIdentityIds.length === 0 ? (
          <>
            {hasLegacyList ? <LegacyPurchaseListNotice onAcknowledge={acknowledgeLegacyList} /> : null}
            <EmptyPurchaseList contact={contact} />
          </>
        ) : (
          <div className="mt-6 space-y-6">
            {loadError ? (
              <div className="rounded-card border border-white/10 bg-[#111827] p-5 text-[#CBD5E1] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
                Не удалось обновить список. Попробуйте открыть страницу ещё раз чуть позже.
              </div>
            ) : (
              <div className="divide-y divide-white/10 overflow-hidden rounded-card border border-white/10 bg-[#111827] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                {productIdentityIds.map((productIdentityId) => (
                  <PurchaseListItem
                    key={productIdentityId}
                    product={productsByIdentityId.get(productIdentityId)}
                    isLoading={isLoading}
                    onRemove={() => removeItem(productIdentityId)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              ref={clearTriggerButtonRef}
              onClick={openClearDialog}
              className="tap-target inline-flex min-h-11 items-center rounded-card border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-[#CBD5E1] hover:border-[#93C5FD]/70 hover:bg-white/[0.08] hover:text-white"
            >
              Очистить список
            </button>

            <PurchaseInStoreNotice contact={contact} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={withCatalogNavigationContext("/catalog", "purchase-list")}
                className="tap-target inline-flex min-h-12 items-center justify-center rounded-card border border-[#2563EB]/[0.55] px-5 text-center font-semibold text-white hover:border-[#93C5FD] hover:bg-[#1A2740]"
              >
                Продолжить выбор
              </Link>
              <a
                href={`tel:${toTelValue(contact.phone)}`}
                className="tap-target inline-flex min-h-12 items-center justify-center rounded-card bg-[#2563EB] px-5 text-center font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8]"
              >
                Позвонить в магазин
              </a>
            </div>
          </div>
        )}
        </section>
      </main>

      {undoItem && typeof document !== "undefined"
        ? createPortal(
            <div
              className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex w-auto max-w-md items-center justify-between gap-3 rounded-card border border-white/10 bg-[#0B1220] p-3 text-sm text-[#E5E7EB] shadow-[0_20px_60px_rgba(0,0,0,0.38)] transition-opacity duration-200 ${isUndoToastVisible ? "opacity-100" : "opacity-0"} sm:inset-x-auto sm:right-6 sm:w-full sm:bottom-6`}
              role="status"
              aria-live="polite"
            >
          <span role="status">Товар удалён из списка</span>
          <button
            type="button"
            onClick={restoreRemovedItem}
            className="tap-target shrink-0 rounded-card px-2 py-1 font-semibold text-[#93C5FD] hover:bg-white/10 hover:text-white"
          >
            Вернуть
          </button>
            </div>,
            document.body
          )
        : null}

      {isClearDialogOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/75 p-4"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  closeClearDialog();
                }
              }}
            >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-purchase-list-title"
            aria-describedby="clear-purchase-list-description"
            className="w-full max-w-md rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.42)] sm:p-6"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeClearDialog();
                return;
              }

              if (event.key === "Tab") {
                const firstButton = cancelClearButtonRef.current;
                const lastButton = confirmClearButtonRef.current;
                if (!firstButton || !lastButton) {
                  return;
                }

                if (event.shiftKey && document.activeElement === firstButton) {
                  event.preventDefault();
                  lastButton.focus();
                } else if (!event.shiftKey && document.activeElement === lastButton) {
                  event.preventDefault();
                  firstButton.focus();
                }
              }
            }}
          >
            <h2 id="clear-purchase-list-title" className="text-xl font-semibold text-white">
              Очистить список покупок?
            </h2>
            <p id="clear-purchase-list-description" className="mt-3 text-sm leading-6 text-[#CBD5E1]">
              Все сохранённые товары будут удалены.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                ref={cancelClearButtonRef}
                type="button"
                onClick={closeClearDialog}
                className="tap-target min-h-11 rounded-card border border-white/10 px-4 font-semibold text-[#CBD5E1] hover:border-[#93C5FD]/70 hover:bg-white/[0.08] hover:text-white"
              >
                Отмена
              </button>
              <button
                ref={confirmClearButtonRef}
                type="button"
                onClick={confirmClear}
                className="tap-target min-h-11 rounded-card bg-[#2563EB] px-4 font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8]"
              >
                Очистить
              </button>
            </div>
          </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function EmptyPurchaseList({ contact }: PurchaseListPageProps) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-card border border-white/10 bg-[#111827] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:p-6">
        <p className="text-lg font-semibold text-white">Ваш список пока пуст.</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#CBD5E1]">
          Найдите нужные запчасти в каталоге и сохраните их в список покупок.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
          <Link
            href={withCatalogNavigationContext("/catalog", "purchase-list")}
            className="tap-target inline-flex min-h-12 items-center justify-center rounded-card bg-[#2563EB] px-5 text-center font-semibold text-white shadow-[0_18px_46px_rgba(37,99,235,0.3)] hover:-translate-y-0.5 hover:bg-[#1D4ED8]"
          >
            Открыть каталог
          </Link>
          <Link
            href="/search"
            className="tap-target inline-flex min-h-12 items-center justify-center rounded-card border border-[#2563EB]/[0.55] px-5 text-center font-semibold text-white hover:border-[#93C5FD] hover:bg-[#1A2740]"
          >
            Найти товар
          </Link>
        </div>
      </div>
      <PurchaseInStoreNotice contact={contact} />
    </div>
  );
}

function LegacyPurchaseListNotice({ onAcknowledge }: { onAcknowledge: () => void }) {
  return (
    <section className="rounded-card border border-[#2563EB]/45 bg-[#172554]/45 p-5 text-[#DBEAFE] shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
      <h2 className="text-lg font-semibold text-white">Список покупок обновлён</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6">
        Старый список нельзя надёжно подтвердить, поэтому товары нужно добавить заново.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:max-w-xl">
        <Link
          href={withCatalogNavigationContext("/catalog", "purchase-list")}
          onClick={onAcknowledge}
          className="tap-target inline-flex min-h-11 items-center justify-center rounded-card bg-[#2563EB] px-4 text-center text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-[#1D4ED8]"
        >
          Открыть каталог
        </Link>
        <Link
          href="/search"
          onClick={onAcknowledge}
          className="tap-target inline-flex min-h-11 items-center justify-center rounded-card border border-[#93C5FD]/60 px-4 text-center text-sm font-semibold text-white hover:bg-white/10"
        >
          Найти товар
        </Link>
      </div>
      <button
        type="button"
        onClick={onAcknowledge}
        className="tap-target mt-4 min-h-10 rounded-card px-1 text-sm font-semibold text-[#BFDBFE] hover:text-white"
      >
        Понятно
      </button>
    </section>
  );
}

function PurchaseListItem({
  product,
  isLoading,
  onRemove
}: {
  product: PublicPurchaseListProduct | undefined;
  isLoading: boolean;
  onRemove: () => void;
}) {
  const itemClassName = [
    "grid gap-4 p-4 transition duration-150 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5",
    "translate-x-0 opacity-100"
  ].join(" ");

  if (isLoading && !product) {
    return (
      <div className={itemClassName} aria-busy="true">
        <div className="h-5 w-3/4 animate-pulse rounded bg-white/10" />
        <div className="h-5 w-20 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className={itemClassName}>
        <div>
          <p className="font-semibold text-white">Товар сейчас отсутствует в каталоге</p>
          <p className="mt-1 text-sm leading-5 text-[#CBD5E1]">
            Проверьте ассортимент позже или удалите позицию из списка.
          </p>
        </div>
        <RemoveButton onClick={onRemove} />
      </div>
    );
  }

  return (
    <div className={itemClassName}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-6 text-white">{product.name}</h2>
        <p className="mt-2 text-lg font-semibold text-white">{product.price.toLocaleString("ru-RU")} ₽</p>
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link
          href={withCatalogNavigationContext(product.url, "purchase-list-direct")}
          className="tap-target inline-flex min-h-10 items-center justify-center rounded-card border border-[#2563EB]/[0.55] px-3 text-sm font-semibold text-white hover:border-[#93C5FD] hover:bg-[#1A2740]"
        >
          Открыть товар
        </Link>
        <RemoveButton onClick={onRemove} />
      </div>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="purchase-list-remove tap-target inline-flex min-h-10 items-center justify-center gap-2 rounded-card border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-[#CBD5E1]"
    >
      <TrashIcon className="h-4 w-4" />
      Удалить
    </button>
  );
}

function PurchaseInStoreNotice({ contact }: PurchaseListPageProps) {
  return (
    <section aria-labelledby="purchase-in-store-title">
      <div className="rounded-[20px] bg-[radial-gradient(circle_at_8%_0%,rgba(255,255,255,0.034)_0%,rgba(255,255,255,0.011)_24%,transparent_50%),linear-gradient(105deg,rgba(255,255,255,0.018)_0%,rgba(255,255,255,0.008)_28%,rgba(148,163,184,0.003)_55%,transparent_84%)] p-px sm:rounded-[22px]">
        <div className="overflow-hidden rounded-[19px] bg-[#111827]/[0.72] bg-[radial-gradient(ellipse_at_18%_0%,rgba(255,255,255,0.025),transparent_50%),radial-gradient(ellipse_at_86%_100%,rgba(0,0,0,0.035),transparent_60%),linear-gradient(180deg,rgba(30,41,59,0.075)_0%,rgba(15,23,42,0.045)_100%)] px-[18px] py-5 sm:rounded-[21px] sm:px-5 sm:py-6">
          <h2 id="purchase-in-store-title" className="text-lg font-medium leading-snug text-[#E5E7EB] sm:text-xl">
            Покупка — в магазине
          </h2>
          <p className="mt-2 max-w-[680px] text-sm leading-5 text-[#CBD5E1] sm:leading-6">
            Список покупок не является заказом или бронью. Чтобы приобрести товары, приезжайте в магазин:{" "}
            <a
              href={contact.yandexMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target rounded text-[#BFDBFE] underline decoration-[#93C5FD]/50 underline-offset-2 hover:text-white"
            >
              {contact.address}
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function formatProductCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const word =
    remainder100 >= 11 && remainder100 <= 14
      ? "товаров"
      : remainder10 === 1
        ? "товар"
        : remainder10 >= 2 && remainder10 <= 4
          ? "товара"
          : "товаров";

  return `${count.toLocaleString("ru-RU")} ${word}`;
}

function toTelValue(phone: string) {
  return phone.replace(/[^+\d]/g, "");
}
