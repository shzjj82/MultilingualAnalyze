import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const variantClass = {
  default: 'badge-default',
  secondary: 'badge-secondary',
  destructive: 'badge-destructive',
  outline: 'badge-outline',
  ghost: 'badge-ghost',
  link: 'badge-link',
  processing: 'badge-processing',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
} as const

type BadgeVariant = keyof typeof variantClass

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & {
  variant?: BadgeVariant
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'span'

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn('badge', variantClass[variant], className)}
      {...props}
    />
  )
}

export { Badge }
