import type { CSSProperties } from 'react'

interface Props {
  className?: string
  style?: CSSProperties
}
export function Skeleton({ className = '', style }: Props) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function PatientCardSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
      <Skeleton className="h-3 w-32" />
      <div className="mt-4 flex items-end justify-between">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}

export function PatientGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => <PatientCardSkeleton key={i} />)}
    </div>
  )
}

export function PlotSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <Skeleton className="h-full w-full" />
    </div>
  )
}
