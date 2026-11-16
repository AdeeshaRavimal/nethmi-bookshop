import React, { isValidElement, type ReactNode } from 'react';

/**
 * Animated shimmer placeholder for loading states.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-slate-200/70 dark:bg-slate-800/70 rounded-md animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * A row of skeleton lines, useful for table loading states.
 */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 dark:border-slate-800/60">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-5 py-3.5">
              <Skeleton className="h-3.5 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Friendly enterprise empty state with an icon, title, and optional subtitle/action.
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  description,
  action,
}: {
  icon?: any;
  title: string;
  subtitle?: string;
  description?: string;
  action?: ReactNode;
}) {
  const renderedIcon = isValidElement(icon)
    ? icon
    : icon && (typeof icon === 'function' || typeof icon === 'object')
    ? React.createElement(icon, { className: 'w-6 h-6 stroke-[1.8]' })
    : icon;

  const subText = subtitle || description;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16 px-6">
      {renderedIcon && (
        <div className="mb-3.5 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-400 dark:text-slate-400 shadow-2xs">
          {renderedIcon}
        </div>
      )}
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight">{title}</h3>
      {subText && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm leading-relaxed">
          {subText}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
