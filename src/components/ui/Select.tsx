import { forwardRef, type SelectHTMLAttributes } from 'react'
import clsx from 'clsx'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...rest }, ref) => {
    const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900',
            'transition-colors focus:border-signal-500',
            error ? 'border-red-400' : 'border-ink-200',
            className,
          )}
          {...rest}
        >
          {children}
        </select>
        {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      </div>
    )
  },
)
Select.displayName = 'Select'
