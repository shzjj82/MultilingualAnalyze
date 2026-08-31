import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const variantClass = {
  default: 'btn-default',
  outline: 'btn-outline',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  destructive: 'btn-destructive',
  link: 'btn-link',
} as const

const sizeClass = {
  default: 'btn-md',
  xs: 'btn-xs',
  sm: 'btn-sm',
  lg: 'btn-lg',
  icon: 'btn-icon',
  'icon-xs': 'btn-icon-xs',
  'icon-sm': 'btn-icon-sm',
  'icon-lg': 'btn-icon-lg',
} as const

type ButtonVariant = keyof typeof variantClass
type ButtonSize = keyof typeof sizeClass

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn('btn', variantClass[variant], sizeClass[size], className)}
      {...props}
    />
  )
}

/** 兼容旧调用：保留导出，避免引用方报错 */
const buttonVariants = ({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: ButtonVariant | null
  size?: ButtonSize | null
  className?: string
} = {}) =>
  cn(
    'btn',
    variantClass[variant ?? 'default'],
    sizeClass[size ?? 'default'],
    className,
  )

export { Button, buttonVariants }
