interface Props { title: string; bodyHtml: string; onClose: () => void; }

export default function Popup({ title, bodyHtml, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-[150]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-[rgba(6,8,22,0.97)] border-t border-blue-500/25 rounded-t-[22px] relative backdrop-blur-2xl shadow-[0_-4px_40px_rgba(0,0,0,0.6)]"
        style={{ padding: '24px 24px calc(24px + var(--safe-bottom))' }}
      >
        <button onClick={onClose} className="absolute top-4 right-5 bg-none border-none text-[#7986cb] text-2xl cursor-pointer">×</button>
        <div className="text-xl font-bold mb-2">{title}</div>
        <div className="text-sm text-[#7986cb] leading-[1.7]" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      </div>
    </div>
  );
}
