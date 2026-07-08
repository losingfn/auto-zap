export function AdminNotice({
  children,
  tone = "success"
}: {
  children: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "danger"
      ? "border-[#7F1D1D] bg-[#2A1218] text-[#FECACA]"
      : tone === "warning"
        ? "border-[#854D0E] bg-[#2A2113] text-[#FDE68A]"
        : "border-[#1D4E89] bg-[#10233D] text-[#BFDBFE]";

  return <div className={`mb-5 rounded-card border px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}

export function AdminPageIntro({
  eyebrow,
  title,
  text
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="mb-8">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#9DBDFB]">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-2xl text-[#C8D1DF]">{text}</p>
    </div>
  );
}

export function AdminSubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex h-11 items-center justify-center rounded-card bg-[#73A0F5] px-5 text-sm font-semibold text-[#07101F] transition hover:bg-[#9DBDFB]"
    >
      {children}
    </button>
  );
}

export const inputClassName =
  "mt-2 h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";

export const textareaClassName =
  "mt-2 min-h-32 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 py-3 text-sm text-white outline-none placeholder:text-[#66758A] focus:border-[#73A0F5]";

export const fileInputClassName =
  "mt-2 min-h-11 w-full rounded-card border border-[#2E3A4C] bg-[#0B1220] px-3 py-2 text-sm text-[#C8D1DF] file:mr-4 file:rounded-card file:border-0 file:bg-[#243249] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#30425F]";
