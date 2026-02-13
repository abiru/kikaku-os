import clsx from 'clsx'
import type React from 'react'

/**
 * SSR-safe versions of Field and Label components for use in Astro templates.
 * These use plain HTML elements instead of HeadlessUI components that require React context.
 * Use these when you need to mix Field/Label with client:load inputs in Astro files.
 */

export function StaticFieldset({
  className,
  disabled,
  ...props
}: { className?: string; disabled?: boolean } & React.ComponentPropsWithoutRef<'fieldset'>) {
  return (
    <fieldset
      {...props}
      disabled={disabled}
      className={clsx(className, '*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6')}
    />
  )
}

export function StaticLegend({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'legend'>) {
  return (
    <legend
      data-slot="legend"
      {...props}
      className={clsx(
        className,
        'text-base/6 font-semibold text-zinc-950 sm:text-sm/6'
      )}
    />
  )
}

export function StaticFieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div data-slot="control" {...props} className={clsx(className, 'space-y-8')} />
}

export function StaticField({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        '[&>[data-slot=label]+[data-slot=control]]:mt-3',
        '[&>[data-slot=label]+[data-slot=description]]:mt-1',
        '[&>[data-slot=description]+[data-slot=control]]:mt-3',
        '[&>[data-slot=control]+[data-slot=description]]:mt-3',
        '[&>[data-slot=control]+[data-slot=error]]:mt-3',
        '*:data-[slot=label]:font-medium'
      )}
    />
  )
}

export function StaticLabel({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'label'>) {
  return (
    <label
      data-slot="label"
      {...props}
      className={clsx(
        className,
        'text-base/6 text-zinc-950 select-none sm:text-sm/6'
      )}
    />
  )
}

export function StaticDescription({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      data-slot="description"
      {...props}
      className={clsx(className, 'text-base/6 text-zinc-500 sm:text-sm/6')}
    />
  )
}

export function StaticErrorMessage({
  className,
  ...props
}: { className?: string } & React.ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      data-slot="error"
      {...props}
      className={clsx(className, 'text-base/6 text-red-600 sm:text-sm/6')}
    />
  )
}
