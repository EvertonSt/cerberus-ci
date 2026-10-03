import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  className?: string;
}

export function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
  className,
}: FeatureCardProps) {
  return (
    <div className={cn("glass-card p-6 group", className)}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center shrink-0 group-hover:bg-purple-600/20 group-hover:border-purple-500/30 transition-colors">
          <Icon className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {badge && (
              <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/20">
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

interface StatProps {
  value: string;
  label: string;
  className?: string;
}

export function Stat({ value, label, className }: StatProps) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-3xl md:text-4xl font-bold gradient-text mb-2">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
