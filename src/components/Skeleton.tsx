import React, { isValidElement, type ReactNode } from 'react';

/**
 * Animated shimmer placeholder for loading states.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-gray-200/70 dark:bg-gray-700/50 rounded-md animate-pulse ${className}`}
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
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-6 py-4">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Friendly empty state with an icon, title, and optional subtitle/action.
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
    ? React.createElement(icon, { className: 'w-12 h-12' })
    : icon;

  const subText = subtitle || description;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-16 px-6">
      {renderedIcon && <div className="mb-4 opacity-40">{renderedIcon}</div>}
      <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200">{title}</h3>
      {subText && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-xs">{subText}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}