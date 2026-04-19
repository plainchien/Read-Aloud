/** 品牌 play 图标，viewBox 23×26，用 className 控制尺寸（如 h-6 w-auto） */
export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 23 26"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      overflow="visible"
    >
      <path
        d="M20.4195 8.34477C23.8602 10.511 23.8602 15.489 20.4195 17.6552L8.54487 25.1316C4.84144 27.4633 0 24.8257 0 20.4764V5.52363C0 1.1743 4.84143 -1.46331 8.54487 0.868399L20.4195 8.34477Z"
        fill="currentColor"
      />
    </svg>
  )
}
