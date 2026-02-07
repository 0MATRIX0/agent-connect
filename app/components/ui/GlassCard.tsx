'use client';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function GlassCard({ children, className = '', hover = false, onClick }: GlassCardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white/5 backdrop-blur-2xl border border-white/10 rounded-xl
        ${hover ? 'transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15] hover:scale-[1.01] cursor-pointer' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
