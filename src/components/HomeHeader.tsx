import { readAloudLogoUrl } from '../lib/brandAssetUrls'

export function HomeHeader() {
  return (
    <header className="relative flex items-center justify-center">
      <img
        src={readAloudLogoUrl}
        alt="ReadAloud"
        className="mt-[10px] h-[19px] w-auto max-w-[min(100%,91px)]"
        width={91}
        height={19}
      />
      {/* 登录上线后在此恢复右上角用户头像按钮 */}
    </header>
  )
}
