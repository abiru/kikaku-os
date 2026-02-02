import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'
export function SwitchGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
 return (
 <div
 data-slot="control"
 {...props}
 className={clsx(
 className,
 // Basic groups
 'space-y-3 **:data-[slot=label]:font-normal',
 // With descriptions
 'has-data-[slot=description]:space-y-6 has-data-[slot=description]:**:data-[slot=label]:font-medium'
 )}
 />
 )
}
export function SwitchField({
 className,
 ...props
}: { className?: string } & Omit<Headless.FieldProps, 'as' | 'className'>) {
 return (
 <Headless.Field
 data-slot="field"
 {...props}
 className={clsx(
 className,
 // Base layout
 'grid grid-cols-[1fr_auto] gap-x-8 gap-y-1 sm:grid-cols-[1fr_auto]',
 // Control layout
 '*:data-[slot=control]:col-start-2 *:data-[slot=control]:self-start sm:*:data-[slot=control]:mt-0.5',
 // Label layout
 '*:data-[slot=label]:col-start-1 *:data-[slot=label]:row-start-1',
 // Description layout
 '*:data-[slot=description]:col-start-1 *:data-[slot=description]:row-start-2',
 // With description
 'has-data-[slot=description]:**:data-[slot=label]:font-medium'
 )}
 />
 )
}
const colors = {
 'dark/zinc': [
 ],
 'dark/white': [
 ],
 zinc: [
 '[--switch-shadow:var(--color-black)]/10 [--switch:white] [--switch-ring:var(--color-zinc-700)]/90',
 ],
 white: [
 '[--switch-shadow:var(--color-black)]/10 [--switch-ring:transparent] [--switch:var(--color-zinc-950)]',
 ],
 red: [
 '[--switch:white] [--switch-ring:var(--color-red-700)]/90 [--switch-shadow:var(--color-red-900)]/20',
 ],
 orange: [
 '[--switch:white] [--switch-ring:var(--color-orange-600)]/90 [--switch-shadow:var(--color-orange-900)]/20',
 ],
 amber: [
 '[--switch-ring:transparent] [--switch-shadow:transparent] [--switch:var(--color-amber-950)]',
 ],
 yellow: [
 '[--switch-ring:transparent] [--switch-shadow:transparent] [--switch:var(--color-yellow-950)]',
 ],
 lime: [
 '[--switch-ring:transparent] [--switch-shadow:transparent] [--switch:var(--color-lime-950)]',
 ],
 green: [
 '[--switch:white] [--switch-ring:var(--color-green-700)]/90 [--switch-shadow:var(--color-green-900)]/20',
 ],
 emerald: [
 '[--switch:white] [--switch-ring:var(--color-emerald-600)]/90 [--switch-shadow:var(--color-emerald-900)]/20',
 ],
 teal: [
 '[--switch:white] [--switch-ring:var(--color-teal-700)]/90 [--switch-shadow:var(--color-teal-900)]/20',
 ],
 cyan: [
 '[--switch-ring:transparent] [--switch-shadow:transparent] [--switch:var(--color-cyan-950)]',
 ],
 sky: [
 '[--switch:white] [--switch-ring:var(--color-sky-600)]/80 [--switch-shadow:var(--color-sky-900)]/20',
 ],
 blue: [
 '[--switch:white] [--switch-ring:var(--color-blue-700)]/90 [--switch-shadow:var(--color-blue-900)]/20',
 ],
 indigo: [
 '[--switch:white] [--switch-ring:var(--color-indigo-600)]/90 [--switch-shadow:var(--color-indigo-900)]/20',
 ],
 violet: [
 '[--switch:white] [--switch-ring:var(--color-violet-600)]/90 [--switch-shadow:var(--color-violet-900)]/20',
 ],
 purple: [
 '[--switch:white] [--switch-ring:var(--color-purple-600)]/90 [--switch-shadow:var(--color-purple-900)]/20',
 ],
 fuchsia: [
 '[--switch:white] [--switch-ring:var(--color-fuchsia-600)]/90 [--switch-shadow:var(--color-fuchsia-900)]/20',
 ],
 pink: [
 '[--switch:white] [--switch-ring:var(--color-pink-600)]/90 [--switch-shadow:var(--color-pink-900)]/20',
 ],
 rose: [
 '[--switch:white] [--switch-ring:var(--color-rose-600)]/90 [--switch-shadow:var(--color-rose-900)]/20',
 ],
}
type Color = keyof typeof colors
export function Switch({
 color = 'dark/zinc',
 className,
 ...props
}: {
 color?: Color
 className?: string
} & Omit<Headless.SwitchProps, 'as' | 'className' | 'children'>) {
 return (
 <Headless.Switch
 data-slot="control"
 {...props}
 className={clsx(
 className,
 // Base styles
 'group relative isolate inline-flex h-6 w-10 cursor-default rounded-full p-[3px] sm:h-5 sm:w-8',
 // Transitions
 'transition duration-0 ease-in-out data-changing:duration-200',
 // Outline and background color in forced-colors mode so switch is still visible
 // Unchecked
 // Checked
 // Focus
 'focus:not-data-focus:outline-hidden data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500',
 // Hover
 'data-hover:ring-black/15 data-hover:data-checked:ring-(--switch-bg-ring)',
 // Disabled
 'data-disabled:bg-zinc-200 data-disabled:opacity-50 data-disabled:data-checked:bg-zinc-200 data-disabled:data-checked:ring-black/5',
 // Color specific styles
 colors[color]
 )}
 >
 <span
 aria-hidden="true"
 className={clsx(
 // Basic layout
 'pointer-events-none relative inline-block size-4.5 rounded-full sm:size-3.5',
 // Transition
 'translate-x-0 transition duration-200 ease-in-out',
 // Invisible border so the switch is still visible in forced-colors mode
 'border border-transparent',
 // Unchecked
 'bg-white shadow-sm ring-1 ring-black/5',
 // Checked
 'group-data-checked:bg-(--switch) group-data-checked:shadow-(--switch-shadow) group-data-checked:ring-(--switch-ring)',
 'group-data-checked:translate-x-4 sm:group-data-checked:translate-x-3',
 // Disabled
 'group-data-checked:group-data-disabled:bg-white group-data-checked:group-data-disabled:shadow-sm group-data-checked:group-data-disabled:ring-black/5'
 )}
 />
 </Headless.Switch>
 )
}
