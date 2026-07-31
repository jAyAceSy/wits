import { forwardRef, type InputHTMLAttributes } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300',
            'transition-colors focus:border-signal-500',
            error ? 'border-red-400' : 'border-ink-200',
            className,
          )}
          {...rest}
        />
        {hint && !error && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
        {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      </div>
    )
  },
)
Input.displayName = 'Input'
