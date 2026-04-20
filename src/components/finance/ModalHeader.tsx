import { LucideIcon } from "lucide-react";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: string;
}

export default function ModalHeader({ icon: Icon, title, subtitle, accent = "from-blue-500 to-indigo-500" }: Props) {
  return (
    <DialogHeader>
      <div className="flex items-center gap-3 pb-1">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accent} grid place-items-center shadow-lg shadow-blue-600/20 flex-shrink-0`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="text-left">
          <DialogTitle className="text-xl text-gray-900">{title}</DialogTitle>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </DialogHeader>
  );
}
