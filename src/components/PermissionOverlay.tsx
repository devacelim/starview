interface Props { onStart: () => Promise<void>; version: string; }

export default function PermissionOverlay({ onStart, version }: Props) {
  return (
    <div className="fixed inset-0 bg-black/92 flex flex-col items-center justify-center gap-5 z-[200] px-8 text-center">
      <h2 className="text-2xl font-bold text-[#7eb8f7]">StarView</h2>
      <p className="text-[15px] text-[#7986cb] leading-relaxed">
        별자리 AR 뷰를 사용하려면<br/>카메라, 위치, 자이로스코프 권한이 필요합니다.
      </p>
      <button
        onClick={onStart}
        className="mt-2 px-10 py-3.5 rounded-full bg-[#7eb8f7] text-black text-[17px] font-semibold cursor-pointer border-none"
      >
        시작하기
      </button>
      <div className="text-xs text-[#7eb8f7]/45 mt-1.5">StarView {version}</div>
    </div>
  );
}
