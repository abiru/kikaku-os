type Props = {
  columns: number
  rows?: number
}

export default function TableSkeleton({ columns, rows = 5 }: Props) {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="border-b border-zinc-200 pb-3 mb-1">
        <div className="flex gap-4">
          {Array.from({ length: columns }, (_, i) => (
            <div
              key={i}
              className="h-4 bg-zinc-200 rounded"
              style={{ width: `${Math.floor(100 / columns)}%` }}
            />
          ))}
        </div>
      </div>
      {/* Row skeletons */}
      <div className="divide-y divide-zinc-100">
        {Array.from({ length: rows }, (_, rowIdx) => (
          <div key={rowIdx} className="flex gap-4 py-4">
            {Array.from({ length: columns }, (_, colIdx) => (
              <div
                key={colIdx}
                className="h-4 bg-zinc-100 rounded"
                style={{ width: `${Math.floor(100 / columns)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
