import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn('mla-checkbox', className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="mla-checkbox-indicator"
      >
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" aria-hidden>
          <path
            d="M3.2 8.2 6.5 11.5 12.8 4.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
