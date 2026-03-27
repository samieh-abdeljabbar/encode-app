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
  density?: "default" | "compact";
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  children,
  title,
  headerActions,
  footer,
  variant = "default",
  density = "default",
  className,
  bodyClassName,
}: PanelProps) {
  const variantClass = variant === "alt"
    ? "bg-panel-alt"
    : variant === "active"
      ? "bg-panel-active"
      : "bg-panel";
  const sectionRadius = density === "compact" ? "rounded-xl" : "rounded-2xl";
  const headerPadding = density === "compact" ? "px-4 py-3" : "px-5 py-4";
  const bodyPadding = density === "compact" ? "px-4 py-3" : "px-5 py-4";
  const footerPadding = density === "compact" ? "px-4 py-3" : "px-5 py-4";

  return (
    <section className={cx("overflow-hidden border border-border-subtle shadow-[var(--shadow-panel)]", sectionRadius, variantClass, className)}>
      {(title || headerActions) && (
        <div className={cx("flex items-start justify-between gap-3 border-b border-border-subtle", headerPadding)}>
          <div className="min-w-0">
            {typeof title === "string" ? <h3 className="text-sm font-semibold text-text">{title}</h3> : title}
          </div>
          {headerActions && <div className="shrink-0">{headerActions}</div>}
        </div>
      )}
      <div className={cx(bodyPadding, bodyClassName)}>{children}</div>
      {footer && <div className={cx("border-t border-border-subtle", footerPadding)}>{footer}</div>}
    </section>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  density?: "default" | "compact";
  className?: string;
}

export function PageHeader({ title, subtitle, actions, meta, density = "default", className }: PageHeaderProps) {
  const headerPadding = density === "compact" ? "px-6 py-4" : "px-6 py-5";
  const titleClass = density === "compact" ? "text-[1.75rem]" : "text-2xl";
  const subtitleMargin = density === "compact" ? "mt-0.5" : "mt-1";
  const metaMargin = density === "compact" ? "mt-3" : "mt-4";

  return (
    <header className={cx("border-b border-border-subtle bg-panel/90 backdrop-blur", headerPadding, className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={cx("font-semibold tracking-tight text-text", titleClass)}>{title}</div>
          {subtitle && <p className={cx("text-sm text-text-muted", subtitleMargin)}>{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {meta && <div className={cx("flex flex-wrap items-center gap-2", metaMargin)}>{meta}</div>}
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
  size?: "default" | "compact";
  className?: string;
}

export function SegmentedTabs<T extends string>({ items, value, onChange, size = "default", className }: SegmentedTabsProps<T>) {
  const shellClass = size === "compact"
    ? "rounded-lg border border-border-subtle/70 bg-panel-alt/90 p-0.5"
    : "rounded-xl border border-border-subtle bg-panel-alt p-1 shadow-[var(--shadow-panel)]";
  const itemClass = size === "compact"
    ? "rounded-md px-3 py-1.5 text-[13px]"
    : "rounded-lg px-3.5 py-2 text-sm";

  return (
    <div className={cx("inline-flex", shellClass, className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cx(
              "font-medium transition-colors",
              itemClass,
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
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border text-text-muted transition-colors",
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
  size?: "default" | "compact";
  className?: string;
}

export function MetaChip({ children, variant = "default", size = "default", className }: MetaChipProps) {
  const variantClass = variant === "accent"
    ? "border-accent/30 bg-accent-soft text-accent"
    : variant === "success"
      ? "border-teal/30 bg-teal/10 text-teal"
      : variant === "warning"
        ? "border-amber/30 bg-amber/10 text-amber"
        : variant === "danger"
          ? "border-coral/30 bg-coral/10 text-coral"
          : "border-border-subtle bg-panel-alt text-text-muted";
  const sizeClass = size === "compact"
    ? "rounded-full px-2 py-0.5 text-[10px]"
    : "rounded-full px-2.5 py-1 text-[11px]";

  return (
    <span className={cx("inline-flex items-center gap-1 border font-medium", sizeClass, variantClass, className)}>
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
