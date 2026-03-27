import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  icon?: ReactNode;
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
  icon,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-panel)] transition-all hover:translate-y-[-1px] hover:opacity-95 disabled:translate-y-0 disabled:opacity-45",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className,
  icon,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-border-strong bg-panel-alt px-4 py-2 text-sm font-medium text-text transition-colors hover:border-accent/50 hover:bg-panel-active disabled:opacity-45",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

interface PanelProps {
  children: ReactNode;
  title?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "alt" | "active";
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  children,
  title,
  headerActions,
  footer,
  variant = "default",
  className,
  bodyClassName,
}: PanelProps) {
  const variantClass = variant === "alt"
    ? "bg-panel-alt"
    : variant === "active"
      ? "bg-panel-active"
      : "bg-panel";

  return (
    <section className={cx("overflow-hidden rounded-2xl border border-border-subtle shadow-[var(--shadow-panel)]", variantClass, className)}>
      {(title || headerActions) && (
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            {typeof title === "string" ? <h3 className="text-sm font-semibold text-text">{title}</h3> : title}
          </div>
          {headerActions && <div className="shrink-0">{headerActions}</div>}
        </div>
      )}
      <div className={cx("px-5 py-4", bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border-subtle px-5 py-4">{footer}</div>}
    </section>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cx("border-b border-border-subtle bg-panel/90 px-6 py-5 backdrop-blur", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight text-text">{title}</div>
          {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
    </header>
  );
}

interface SegmentedTabItem<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function SegmentedTabs<T extends string>({ items, value, onChange, className }: SegmentedTabsProps<T>) {
  return (
    <div className={cx("inline-flex rounded-xl border border-border-subtle bg-panel-alt p-1 shadow-[var(--shadow-panel)]", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cx(
              "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-panel-active text-text"
                : "text-text-muted hover:text-text",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export function ToolbarButton({ icon, label, active, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      disabled={disabled}
      className={cx(
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border text-text-muted transition-colors",
        active
          ? "border-accent/50 bg-accent-soft text-text"
          : "border-transparent hover:border-border-strong hover:bg-panel-active hover:text-text",
        disabled && "opacity-35",
      )}
    >
      {icon}
    </button>
  );
}

interface InputShellProps {
  children: ReactNode;
  className?: string;
}

export function InputShell({ children, className }: InputShellProps) {
  return (
    <div className={cx("rounded-xl border border-border-subtle bg-panel-alt px-3 py-2.5 shadow-[var(--shadow-panel)] focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-[var(--color-focus-ring)]", className)}>
      {children}
    </div>
  );
}

interface MetaChipProps {
  children: ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
}

export function MetaChip({ children, variant = "default", className }: MetaChipProps) {
  const variantClass = variant === "accent"
    ? "border-accent/30 bg-accent-soft text-accent"
    : variant === "success"
      ? "border-teal/30 bg-teal/10 text-teal"
      : variant === "warning"
        ? "border-amber/30 bg-amber/10 text-amber"
        : variant === "danger"
          ? "border-coral/30 bg-coral/10 text-coral"
          : "border-border-subtle bg-panel-alt text-text-muted";

  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium", variantClass, className)}>
      {children}
    </span>
  );
}

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Panel className="text-center">
      <div className="space-y-2 py-8">
        <p className="text-base font-medium text-text">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-text-muted">{description}</p>}
        {action && <div className="pt-3">{action}</div>}
      </div>
    </Panel>
  );
}

interface LoadingStateProps {
  label: ReactNode;
  detail?: ReactNode;
}

export function LoadingState({ label, detail }: LoadingStateProps) {
  return (
    <Panel className="text-center">
      <div className="space-y-3 py-8">
        <div className="mx-auto h-8 w-8 rounded-full border-2 border-border-strong border-t-accent animate-spin" />
        <p className="text-sm font-medium text-text">{label}</p>
        {detail && <p className="text-xs text-text-muted">{detail}</p>}
      </div>
    </Panel>
  );
}
