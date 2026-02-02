import clsx from 'clsx'
import type React from 'react'

const colors = {
 red: 'bg-red-50 border-red-200 text-red-600',
 green: 'bg-green-50 border-green-200 text-green-600',
 amber: 'bg-amber-50 border-amber-200 text-amber-700',
 blue: 'bg-blue-50 border-blue-200 text-blue-800',
 zinc: 'bg-zinc-50 border-zinc-200 text-zinc-600',
}

export function Alert({
 color = 'zinc',
 className,
 children,
 ...props
}: {
 color?: keyof typeof colors
 className?: string
 children: React.ReactNode
} & React.ComponentPropsWithoutRef<'div'>) {
 return (
 <div
 {...props}
 className={clsx(
 'px-4 py-3 rounded-lg border text-sm',
 colors[color],
 className
 )}
 >
 {children}
 </div>
 )
}
